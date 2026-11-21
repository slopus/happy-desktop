import { useRef, useState, type CSSProperties } from "react";
import type {
    HappyAgentSideQuestion,
    HappyAgentSideQuestionNotice,
    HappyAgentSideQuestionState,
} from "happy-desktop-state";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import type { FileLinkOpenHandler, FileOpenHandler } from "./fileReference";
import {
    renderMessageMarkdown,
    type LinkOpenHandler,
    type LinkOpenPlacement,
} from "./MessageMarkdown";
import { ScrollArea } from "./Scrollbar";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";

export type SideQuestionPanelProps = {
    className?: string;
    "data-testid"?: string;
    /** The questions asked on the side so far, oldest first. */
    questions: readonly HappyAgentSideQuestion[];
    /** The follow-up being typed. The owner keeps it, so leaving the chat does not lose it. */
    draft: string;
    onDraftChange: (text: string) => void;
    /** Asks the follow-up typed; offered only while it has words. */
    onAsk: () => void;
    /** Ends the thread, stopping a question still being answered. */
    onClose: () => void;
    /** Opens a web link an answer carries, as the transcript's links do. */
    onLinkOpen?: LinkOpenHandler;
    /** Which of the two places a plain click on a link goes. */
    linkOpenDefault?: LinkOpenPlacement;
    /** Opens a file an answer names, as the transcript's file links do. */
    onFileOpen?: FileOpenHandler;
    onFileLinkOpen?: FileLinkOpenHandler;
    /** Freezes the answering spinner on one frame, for fixtures and screenshots. */
    spinnerFrame?: number;
    style?: CSSProperties;
};

/**
 * C-352 SideQuestionPanel — Claude Code's `/btw` panel for one chat: the
 * questions asked on the side, their answers, and a field for a follow-up.
 * Claude answers each from the chat as it stands, without running tools, and
 * nothing asked or answered here is added to the chat, so a question can be
 * asked while a turn runs.
 *
 * It is not a dialog. It floats over the top of the transcript in the
 * conversation's `aside`, and the chat, its composer, and the rest of the
 * window stay usable while it is open; only Close ends the thread. Each answer
 * copies on its own, without its question, to be pasted into the chat.
 *
 * Props only: the owner keeps the thread and the follow-up, asks, and closes.
 */
export function SideQuestionPanel(props: SideQuestionPanelProps) {
    // Shown once is enough: a question asked since is brought into view, but a
    // thread shown again keeps the place it was read at.
    const shown = useRef(new Set<string>());
    // Answers drawn so far. One that lands while its question is on screen is
    // brought into view with it; one drawn with the thread, or drawn again as
    // the thread is shown again, moves nothing.
    const settled = useRef(new Set<string>());
    const viewport = useRef<HTMLDivElement | null>(null);
    const [scrolled, setScrolled] = useState(false);
    const answerShown = (questionId: string, reply: HTMLDivElement | null): void => {
        if (!reply || settled.current.has(questionId)) return;
        settled.current.add(questionId);
        const exchange = reply.parentElement;
        const question = reply.previousElementSibling?.getBoundingClientRect();
        const view = viewport.current?.getBoundingClientRect();
        if (!shown.current.has(questionId) || !exchange || !question || !view) return;
        if (question.bottom > view.top && question.top < view.bottom)
            exchange.scrollIntoView({ block: "nearest" });
    };
    const canAsk = props.draft.trim().length > 0;
    const ask = () => {
        if (canAsk) props.onAsk();
    };
    return (
        <aside
            aria-label="Side question"
            className={["happy-side-question", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="side-question-panel"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <header
                className="happy-side-question__header"
                data-happy-desktop-ui="side-question-header"
            >
                <div className="happy-side-question__heading">
                    <h2 className="happy-side-question__title">Side question</h2>
                    <p className="happy-side-question__subtitle">
                        Claude answers from this chat. Nothing asked or answered here appears in the
                        chat.
                    </p>
                </div>
                <Button
                    aria-label="Close"
                    className="happy-side-question__close"
                    icon="close"
                    iconOnly
                    onClick={props.onClose}
                    size="small"
                    variant="ghost"
                />
            </header>
            {props.questions.length > 0 ? (
                <ScrollArea
                    className="happy-side-question__thread"
                    data-happy-desktop-ui="side-question-thread"
                    data-scrolled={scrolled ? "" : undefined}
                    viewportClassName="happy-side-question__thread-viewport"
                    viewportProps={{
                        onScroll: (event) => setScrolled(event.currentTarget.scrollTop > 0),
                    }}
                    viewportRef={viewport}
                >
                    <ol className="happy-side-question__questions">
                        {props.questions.map((question) => (
                            <li
                                className="happy-side-question__exchange"
                                data-happy-desktop-ui="side-question-exchange"
                                data-status={question.state.status}
                                key={question.id}
                                ref={(element) => {
                                    if (!element || shown.current.has(question.id)) return;
                                    shown.current.add(question.id);
                                    element.scrollIntoView({ block: "nearest" });
                                }}
                            >
                                <p className="happy-side-question__question">{question.question}</p>
                                {sideQuestionWaiting(question.state) ? (
                                    <div className="happy-side-question__reply" key="waiting">
                                        <SideQuestionAnswer
                                            spinnerFrame={props.spinnerFrame}
                                            state={question.state}
                                        />
                                    </div>
                                ) : (
                                    <div
                                        className="happy-side-question__reply"
                                        key="settled"
                                        ref={(reply) => answerShown(question.id, reply)}
                                    >
                                        <SideQuestionAnswer
                                            linkOpenDefault={props.linkOpenDefault}
                                            onFileLinkOpen={props.onFileLinkOpen}
                                            onFileOpen={props.onFileOpen}
                                            onLinkOpen={props.onLinkOpen}
                                            state={question.state}
                                        />
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                </ScrollArea>
            ) : null}
            <div
                className="happy-side-question__follow-up"
                data-happy-desktop-ui="side-question-follow-up"
            >
                <TextField
                    aria-label="Follow-up question"
                    className="happy-side-question__field"
                    fullWidth
                    onSubmit={ask}
                    onValueChange={props.onDraftChange}
                    placeholder="Ask a follow-up…"
                    size="medium"
                    value={props.draft}
                />
                <Button disabled={!canAsk} onClick={ask} size="medium" variant="primary">
                    Ask
                </Button>
            </div>
        </aside>
    );
}

/** Whether a question has yet to be answered, or to be told why it will not be. */
function sideQuestionWaiting(state: HappyAgentSideQuestionState): boolean {
    return state.status === "queued" || state.status === "answering";
}

/** What stands under one question: its answer, or why it has none yet. */
function SideQuestionAnswer(
    props: Pick<
        SideQuestionPanelProps,
        "linkOpenDefault" | "onFileLinkOpen" | "onFileOpen" | "onLinkOpen" | "spinnerFrame"
    > & { readonly state: HappyAgentSideQuestionState },
) {
    const state = props.state;
    switch (state.status) {
        case "queued":
            return <SideQuestionStatus text="Waiting for the answer above…" />;
        case "answering":
            return (
                <div
                    className="happy-side-question__status"
                    data-happy-desktop-ui="side-question-status"
                >
                    <Spinner
                        frame={props.spinnerFrame}
                        label="Claude is answering"
                        size={14}
                        tone="muted"
                        variant="braille-2"
                    />
                    <span>Claude is answering…</span>
                </div>
            );
        case "notice":
            return <SideQuestionStatus text={sideQuestionNoticeText(state.notice)} />;
        case "failed":
            return <SideQuestionStatus failed text={`Couldn’t get an answer: ${state.error}`} />;
        case "answered":
            if (state.response === null) return <SideQuestionStatus text="Claude had no answer." />;
            // Claude Code's stand-in for an answer the model could not give:
            // nothing to copy into the chat.
            if (state.synthetic) return <SideQuestionStatus text={state.response} />;
            return (
                <div
                    className="happy-side-question__answer"
                    data-happy-desktop-ui="side-question-answer"
                >
                    <div className="happy-side-question__markdown happy-message__body--markdown">
                        {renderMessageMarkdown(
                            state.response,
                            undefined,
                            props.onFileOpen,
                            "complete",
                            props.onLinkOpen,
                            props.linkOpenDefault,
                            undefined,
                            props.onFileLinkOpen,
                        )}
                    </div>
                    <div className="happy-side-question__answer-actions">
                        <CopyButton label="Copy answer" text={state.response} />
                    </div>
                </div>
            );
    }
}

function SideQuestionStatus(props: { readonly text: string; readonly failed?: boolean }) {
    return (
        <p
            className="happy-side-question__status"
            data-failed={props.failed ? "" : undefined}
            data-happy-desktop-ui="side-question-status"
        >
            {props.text}
        </p>
    );
}

function sideQuestionNoticeText(notice: HappyAgentSideQuestionNotice): string {
    switch (notice) {
        case "harnessNotRunning":
            return "Claude Code has nothing to answer from in this chat yet. Send a message first; after that, /btw works even while Claude is busy.";
        case "unsupported":
            return "This chat’s model can’t answer side questions.";
        case "gone":
            return "This side question is no longer available. Ask it again.";
    }
}
