import { createStore } from "zustand/vanilla";
import { UserError } from "../types.js";
import type {
    HappyAgentSideQuestionExchange,
    HappyAgentSideQuestionsApi,
} from "./happyAgentSideQuestions.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/**
 * Why a side question got no answer, when that is something to act on rather
 * than a failure: `harnessNotRunning`, Claude Code has no conversation to answer
 * from yet, before the chat's first turn or after a compaction until the next
 * one; `unsupported`, the model the chat runs answers no side questions; `gone`,
 * the daemon no longer has the question, after ten minutes uncollected or a
 * restart.
 */
export type HappyAgentSideQuestionNotice = "harnessNotRunning" | "unsupported" | "gone";

/** Where one question of a side thread stands. */
export type HappyAgentSideQuestionState =
    /** Waiting for the question before it to be answered. */
    | { readonly status: "queued" }
    | { readonly status: "answering" }
    | {
          readonly status: "answered";
          /** The answer as Markdown; null when the harness produced none. */
          readonly response: string | null;
          /** A canned reply the harness stood in for one the model could not give. */
          readonly synthetic: boolean;
      }
    | { readonly status: "notice"; readonly notice: HappyAgentSideQuestionNotice }
    | { readonly status: "failed"; readonly error: string };

/** One question asked on the side, and its answer. */
export interface HappyAgentSideQuestion {
    /** Minted here: unique in this window, the same for the question's whole life. */
    readonly id: string;
    readonly question: string;
    readonly state: HappyAgentSideQuestionState;
}

/** One chat's side thread: the questions asked on the side, and the follow-up being typed. */
export interface HappyAgentSideQuestionThread {
    /** Oldest first. */
    readonly questions: readonly HappyAgentSideQuestion[];
    readonly draft: string;
}

export interface HappyAgentSideQuestionsSnapshot {
    /** The thread each chat has open; a chat without one shows no panel. */
    readonly threads: ReadonlyMap<HappyAgentSessionId, HappyAgentSideQuestionThread>;
    /**
     * Chats whose composer just submitted a bare `/btw`. They say how to use it
     * above the input until the draft changes, on this window only.
     */
    readonly usage: ReadonlySet<HappyAgentSessionId>;
}

/**
 * The `/btw` side threads of one connection, one per chat, kept apart from the
 * screens that show them.
 *
 * A thread outlives its chat's view. Leaving the chat, for another one or for
 * the list, keeps a question running; its answer lands in the thread whether or
 * not anyone is looking, and the chat shows the thread again on the way back.
 * Only closing it ends it, and stops the question it is still answering.
 *
 * A thread answers one question at a time. One asked while another is being
 * answered waits its turn, and is then asked with every answer before it as its
 * history, the way a follow-up is.
 *
 * Memory-only: a window that was reloaded has no question in flight to rejoin,
 * and the daemon forgets an answer nobody collects.
 */
export interface HappyAgentSideQuestionsStore {
    get(): HappyAgentSideQuestionsSnapshot;
    subscribe(listener: () => void): () => void;
    /** `/btw <question>` from a chat's composer: opens its thread, if it has none, and asks. */
    questionAsk(conversationId: HappyAgentSessionId, question: string): void;
    /** Types the follow-up of a chat's open thread. */
    draftUpdate(conversationId: HappyAgentSessionId, text: string): void;
    /** Asks the follow-up typed in a chat's open thread, and empties the field for the next. */
    draftSubmit(conversationId: HappyAgentSessionId): void;
    /** Ends a chat's thread: stops the question it is answering, and forgets the rest. */
    threadClose(conversationId: HappyAgentSessionId): void;
    /** Says how to use `/btw` above a chat's input, after a bare `/btw`. */
    usageShow(conversationId: HappyAgentSessionId): void;
    /** Puts that line away once the chat's draft changes. */
    usageDismiss(conversationId: HappyAgentSessionId): void;
    /** Stops every question still being answered: the connection is going away. */
    [Symbol.dispose](): void;
}

/** The most earlier exchanges one question may carry, as the daemon takes them. */
const HISTORY_LIMIT = 50;

const QUEUED: HappyAgentSideQuestionState = { status: "queued" };
const ANSWERING: HappyAgentSideQuestionState = { status: "answering" };
const NO_ANSWERS: HappyAgentSideQuestionState = {
    status: "failed",
    error: "This Happy Agent doesn’t answer side questions.",
};

const EMPTY: HappyAgentSideQuestionsSnapshot = { threads: new Map(), usage: new Set() };

/** A question being answered, held so closing its thread can stop it. */
interface HappyAgentSideQuestionAsking {
    /** The routes it was asked through, which also stop it. */
    readonly api: HappyAgentSideQuestionsApi;
    stopped: boolean;
    /** The daemon's name for it, once the daemon has given one. */
    sideQuestionId?: string;
}

/**
 * The earlier answers a follow-up carries: real ones only, since one the model
 * could not give is no context, and the latest the daemon takes.
 */
function historyOf(
    questions: readonly HappyAgentSideQuestion[],
): readonly HappyAgentSideQuestionExchange[] {
    return questions
        .flatMap((asked) =>
            asked.state.status === "answered" &&
            asked.state.response !== null &&
            !asked.state.synthetic
                ? [{ question: asked.question, response: asked.state.response }]
                : [],
        )
        .slice(-HISTORY_LIMIT);
}

/**
 * Why a question got no answer. A refusal of the ask names its reason in its
 * `code`; a question the daemon no longer knows while it is being collected
 * is gone, whatever made it so.
 */
function failureStateOf(error: unknown, collecting: boolean): HappyAgentSideQuestionState {
    const code = error instanceof UserError ? error.code : undefined;
    if (!collecting && code === "harness_not_running")
        return { status: "notice", notice: "harnessNotRunning" };
    if (!collecting && code === "unsupported") return { status: "notice", notice: "unsupported" };
    if (collecting && code === "not_found") return { status: "notice", notice: "gone" };
    return { status: "failed", error: happyAgentUserError(error).message };
}

/**
 * Asks one question and collects its answer, however many waits that takes.
 * Undefined once its thread stopped it: the daemon is told to stop at once when
 * it has named the question, and otherwise as soon as it does.
 */
async function sideQuestionAnswer(
    agentId: HappyAgentSessionId,
    question: string,
    history: readonly HappyAgentSideQuestionExchange[],
    asking: HappyAgentSideQuestionAsking,
): Promise<HappyAgentSideQuestionState | undefined> {
    const api = asking.api;
    let collecting = false;
    try {
        let answer = await api.ask(agentId, question, history);
        while (answer.status === "answering") {
            if (asking.stopped) {
                if (asking.sideQuestionId === undefined)
                    void api.cancel(agentId, answer.id).catch(() => undefined);
                return undefined;
            }
            asking.sideQuestionId = answer.id;
            collecting = true;
            answer = await api.wait(agentId, answer.id);
        }
        if (asking.stopped) return undefined;
        return answer.status === "answered"
            ? { status: "answered", response: answer.response, synthetic: answer.synthetic }
            : { status: "failed", error: answer.error };
    } catch (error) {
        return asking.stopped ? undefined : failureStateOf(error, collecting);
    }
}

export function happyAgentSideQuestionsStoreCreate(deps: {
    /**
     * The routes, read each time a question is asked; undefined while the
     * connection's Happy Agent does not say it answers side questions.
     */
    readonly api: () => HappyAgentSideQuestionsApi | undefined;
}): HappyAgentSideQuestionsStore {
    const store = createStore<HappyAgentSideQuestionsSnapshot>()(() => EMPTY);
    // The question each thread is answering. Kept outside the snapshot: nothing
    // draws it, it is only here to be stopped.
    const asking = new Map<HappyAgentSessionId, HappyAgentSideQuestionAsking>();
    let sequence = 0;
    let disposed = false;

    const threadChange = (
        conversationId: HappyAgentSessionId,
        change: (thread: HappyAgentSideQuestionThread) => HappyAgentSideQuestionThread,
    ): void => {
        const threads = store.getState().threads;
        const thread = threads.get(conversationId);
        if (!thread) return;
        const next = change(thread);
        if (next !== thread)
            store.setState({ threads: new Map(threads).set(conversationId, next) });
    };

    const questionSettle = (
        conversationId: HappyAgentSessionId,
        questionId: string,
        state: HappyAgentSideQuestionState,
    ): void =>
        threadChange(conversationId, (thread) => ({
            ...thread,
            questions: thread.questions.map((asked) =>
                asked.id === questionId ? { ...asked, state } : asked,
            ),
        }));

    /**
     * Puts a question at the end of a chat's thread, opening the thread when the
     * chat has none, and clears the field it was typed in when it came from
     * there: one change, so the panel never draws the thread without it.
     */
    const questionEnqueue = (
        conversationId: HappyAgentSessionId,
        question: string,
        draftClear: boolean,
    ): void => {
        const threads = store.getState().threads;
        const thread = threads.get(conversationId) ?? { questions: [], draft: "" };
        store.setState({
            threads: new Map(threads).set(conversationId, {
                questions: [
                    ...thread.questions,
                    { id: `side-question:${String(++sequence)}`, question, state: QUEUED },
                ],
                draft: draftClear ? "" : thread.draft,
            }),
        });
    };

    /** Starts the oldest waiting question, unless the thread is already answering one. */
    const askNext = (conversationId: HappyAgentSessionId): void => {
        if (disposed || asking.has(conversationId)) return;
        const thread = store.getState().threads.get(conversationId);
        const index = thread?.questions.findIndex((asked) => asked.state.status === "queued") ?? -1;
        const asked = thread?.questions[index];
        if (!thread || !asked) return;
        const api = deps.api();
        if (api === undefined) {
            questionSettle(conversationId, asked.id, NO_ANSWERS);
            askNext(conversationId);
            return;
        }
        const current: HappyAgentSideQuestionAsking = { api, stopped: false };
        asking.set(conversationId, current);
        questionSettle(conversationId, asked.id, ANSWERING);
        void sideQuestionAnswer(
            conversationId,
            asked.question,
            historyOf(thread.questions.slice(0, index)),
            current,
        ).then((state) => {
            if (state === undefined || current.stopped) return;
            asking.delete(conversationId);
            questionSettle(conversationId, asked.id, state);
            askNext(conversationId);
        });
    };

    /** Stops the question a thread is answering, telling the daemon if it has named it. */
    const askingStop = (conversationId: HappyAgentSessionId): void => {
        const current = asking.get(conversationId);
        if (!current) return;
        asking.delete(conversationId);
        current.stopped = true;
        if (current.sideQuestionId !== undefined)
            void current.api.cancel(conversationId, current.sideQuestionId).catch(() => undefined);
    };

    const usageDismiss = (conversationId: HappyAgentSessionId): void => {
        const usage = store.getState().usage;
        if (!usage.has(conversationId)) return;
        const next = new Set(usage);
        next.delete(conversationId);
        store.setState({ usage: next });
    };

    return {
        get: store.getState,
        subscribe: (listener) => store.subscribe(() => listener()),
        questionAsk(conversationId, question) {
            const text = question.trim();
            if (disposed || text.length === 0) return;
            usageDismiss(conversationId);
            questionEnqueue(conversationId, text, false);
            askNext(conversationId);
        },
        draftUpdate(conversationId, text) {
            threadChange(conversationId, (thread) =>
                thread.draft === text ? thread : { ...thread, draft: text },
            );
        },
        draftSubmit(conversationId) {
            const text = store.getState().threads.get(conversationId)?.draft.trim();
            if (disposed || !text) return;
            questionEnqueue(conversationId, text, true);
            askNext(conversationId);
        },
        threadClose(conversationId) {
            askingStop(conversationId);
            const threads = store.getState().threads;
            if (!threads.has(conversationId)) return;
            const next = new Map(threads);
            next.delete(conversationId);
            store.setState({ threads: next });
        },
        usageShow(conversationId) {
            const usage = store.getState().usage;
            if (disposed || usage.has(conversationId)) return;
            store.setState({ usage: new Set(usage).add(conversationId) });
        },
        usageDismiss,
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            // Stopping one forgets it, which a map's own iteration allows.
            for (const conversationId of asking.keys()) askingStop(conversationId);
        },
    };
}
