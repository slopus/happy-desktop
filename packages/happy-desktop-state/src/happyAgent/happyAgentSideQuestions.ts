import { UserError } from "../types.js";
import { happyCloudRequestCreate } from "./happyAgentProviderCredentials.js";

/** One earlier exchange of a side thread, sent with a follow-up as its context. */
export interface HappyAgentSideQuestionExchange {
    readonly question: string;
    readonly response: string;
}

/**
 * Where one side question stands, as the daemon answers a request about it.
 * `answering` names it for the next request; once it is `answered` or `failed`
 * the daemon has forgotten it.
 */
export type HappyAgentSideQuestionAnswer =
    | { readonly status: "answering"; readonly id: string }
    | {
          readonly status: "answered";
          readonly id: string;
          /** The answer as Markdown; null when the harness produced none. */
          readonly response: string | null;
          /** The harness stood in a canned reply for one the model could not give. */
          readonly synthetic: boolean;
      }
    | {
          readonly status: "failed";
          readonly id: string;
          /** Why the harness gave no answer, in the daemon's own English. */
          readonly error: string;
      };

/**
 * A conversation's side questions (Claude Code's `/btw`): asked of the harness
 * running it, answered from the conversation without adding to it.
 *
 * Answering can outlast one request, so a question is asked once and then
 * collected with as many waits as it takes; each request waits at most 20
 * seconds. A refusal rejects with a `UserError` carrying the daemon's `code`:
 * `harness_not_running`, `unsupported`, or `not_found`.
 */
export interface HappyAgentSideQuestionsApi {
    /** `POST /v0/agents/:agentId/side-questions`: asks, with the thread's earlier answers. */
    ask(
        agentId: string,
        question: string,
        history: readonly HappyAgentSideQuestionExchange[],
    ): Promise<HappyAgentSideQuestionAnswer>;
    /** `GET /v0/agents/:agentId/side-questions/:id`: waits for it some more. */
    wait(agentId: string, sideQuestionId: string): Promise<HappyAgentSideQuestionAnswer>;
    /** `DELETE /v0/agents/:agentId/side-questions/:id`: stops answering it and forgets it. */
    cancel(agentId: string, sideQuestionId: string): Promise<void>;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

/** The side question one answer carries, checked here, where it enters. */
function answerRead(value: unknown): HappyAgentSideQuestionAnswer {
    const sideQuestion = recordOf(recordOf(value)?.sideQuestion);
    const id = sideQuestion?.id;
    const response = sideQuestion?.response;
    const synthetic = sideQuestion?.synthetic;
    const error = sideQuestion?.error;
    if (typeof id === "string" && id.length > 0)
        switch (sideQuestion?.status) {
            case "answering":
                return { status: "answering", id };
            case "answered":
                if (
                    (typeof response === "string" || response === null) &&
                    typeof synthetic === "boolean"
                )
                    return { status: "answered", id, response, synthetic };
                break;
            case "failed":
                if (typeof error === "string") return { status: "failed", id, error };
                break;
        }
    throw new UserError("The Happy Agent answered with no side question.");
}

/**
 * The side-question routes over a connection's own HTTP transport: the endpoint
 * its client uses, with the same bearer. The client package this build follows
 * has no methods for them yet.
 */
export function happyAgentSideQuestionsApiCreate(options: {
    readonly endpoint: string;
    readonly token: string;
    readonly fetch?: typeof fetch;
}): HappyAgentSideQuestionsApi {
    const send = happyCloudRequestCreate(options);
    const questions = (agentId: string): string =>
        `v0/agents/${encodeURIComponent(agentId)}/side-questions`;
    return {
        ask: async (agentId, question, history) =>
            answerRead(
                await send("POST", questions(agentId), {
                    question,
                    ...(history.length === 0
                        ? {}
                        : {
                              history: history.map((exchange) => ({
                                  question: exchange.question,
                                  response: exchange.response,
                              })),
                          }),
                }),
            ),
        wait: async (agentId, sideQuestionId) =>
            answerRead(
                await send("GET", `${questions(agentId)}/${encodeURIComponent(sideQuestionId)}`),
            ),
        // Any success will do: one already gone is as good as cancelled.
        cancel: async (agentId, sideQuestionId) => {
            await send("DELETE", `${questions(agentId)}/${encodeURIComponent(sideQuestionId)}`);
        },
    };
}
