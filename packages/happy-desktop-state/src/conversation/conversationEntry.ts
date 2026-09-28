import type { AgentTurnTraceSummary, UserError } from "../types.js";
import type { ConversationAuthor } from "./conversationAuthor.js";

/** Structured value carried verbatim from an agent tool call into its render. */
export type ConversationJson =
    | string
    | number
    | boolean
    | null
    | readonly ConversationJson[]
    | { readonly [key: string]: ConversationJson };

/**
 * One reaction bucket on a conversation message: the aggregate counts a reader
 * sees, without the actor list (loaded on demand by the owning surface).
 */
export interface ConversationReaction {
    readonly key: string;
    readonly emoji?: string;
    readonly customEmojiId?: string;
    readonly count: number;
    readonly reacted: boolean;
}

/**
 * One local attachment projected into a message.
 */
export type ConversationAttachment =
    | {
          readonly kind: "inlineImage";
          /** Stable within its message, so a row keeps identity across reconciles. */
          readonly id: string;
          readonly mediaType: string;
          /** Base64 payload exactly as the producer supplied it. */
          readonly data: string;
          /**
           * Intrinsic pixel size read from the payload's own header, so a surface
           * reserves this image's real box instead of one invented shape for
           * every image. Absent only for a format the header parser cannot read.
           */
          readonly width?: number;
          readonly height?: number;
          readonly detail?: "high" | "original";
      }
    | {
          readonly kind: "linked";
          /** Stable identity supplied by the producer. */
          readonly id: string;
          readonly attachmentKind: "audio" | "file" | "image" | "url" | "video" | "applet";
          readonly name: string;
          readonly source: string;
          readonly description?: string;
          readonly mediaType?: string;
          readonly bytes?: number;
          readonly width?: number;
          readonly height?: number;
          readonly durationMs?: number;
          readonly thumbhash?: string;
          /** Fetchable thumbnail for a linked card, such as an imported applet icon. */
          readonly thumbnailUrl?: string;
          /** Capability-scoped HTTP(S) address the host may open or download. */
          readonly openUrl?: string;
          /** Imported applet identity, opened through the owning Happy Agent rather than as a URL. */
          readonly applet?: string;
          readonly appletPath?: string;
          readonly appletQuery?: Readonly<Record<string, string>>;
      };

/**
 * The render projection of one authored local-Happy Agent message.
 */
export interface ConversationMessageProjection {
    readonly id: string;
    /** Local Happy Agent session identity; retained under its historical render-field name. */
    readonly chatId: string;
    readonly sessionId?: string;
    readonly sequence: string;
    /** Local stream change marker used to preserve row identity during projection. */
    readonly changePts: string;
    readonly sender?: ConversationAuthor;
    readonly text: string;
    readonly generationStatus?: "streaming" | "complete" | "failed";
    readonly agentTrace?: AgentTurnTraceSummary;
    readonly reactions: readonly ConversationReaction[];
    readonly attachments: readonly ConversationAttachment[];
    readonly createdAt: string;
}

/** Lifecycle of one piece of agent activity, shared by tool calls and shell runs. */
export type ConversationActivityStatus =
    | "running"
    | "awaitingApproval"
    | "success"
    | "failed"
    | "stopped";

export type ConversationDiffKind = "add" | "delete" | "update";
export type ConversationDiffLineKind = "add" | "context" | "delete";

export interface ConversationDiffLine {
    readonly kind: ConversationDiffLineKind;
    readonly text: string;
}

export interface ConversationDiffHunk {
    readonly oldStart: number;
    readonly newStart: number;
    readonly lines: readonly ConversationDiffLine[];
}

export interface ConversationFileDiff {
    readonly path: string;
    readonly kind: ConversationDiffKind;
    readonly hunks: readonly ConversationDiffHunk[];
    readonly language?: string;
    readonly added?: number;
    readonly deleted?: number;
    readonly omittedLines?: number;
}

/** The rich body an activity expands into, when the producer knows its shape. */
export type ConversationActivityPresentation =
    | {
          readonly type: "agentSpawn";
          /** The catalog identity resolved for this spawn, never a live lookup. */
          readonly model?: {
              readonly modelId: string;
              readonly providerId: string;
              readonly name: string;
          };
          readonly agentId?: string;
      }
    | {
          readonly type: "compaction";
          readonly trigger: "manual" | "automatic";
          readonly tokensBefore?: number;
          readonly tokensAfter?: number;
          readonly failureReason?: string;
      }
    | {
          readonly type: "exploration";
          readonly operations: readonly (
              | { readonly kind: "list"; readonly target: string }
              | { readonly kind: "read"; readonly name: string }
              | {
                    readonly kind: "search";
                    readonly command: string;
                    readonly path?: string;
                    readonly query?: string;
                }
          )[];
      }
    | {
          readonly type: "fileDiff";
          readonly files: readonly ConversationFileDiff[];
          readonly omittedFiles?: number;
      }
    | {
          readonly type: "execCommand";
          readonly command: string;
          readonly output: string;
          /** Present only when the command belongs to a detached terminal. */
          readonly backgroundProcessId?: number;
      }
    | {
          readonly type: "backgroundTerminalInteraction";
          readonly command: string;
          readonly input: string;
          /** Present when the interaction belongs to a detached terminal. */
          readonly backgroundProcessId?: number;
      }
    | {
          readonly type: "search";
          readonly target: "web" | "x";
          readonly query: string;
          readonly sources?: readonly { readonly url: string; readonly title: string }[];
      }
    | {
          /**
           * A slice the agent built over the checkout: a named set of files
           * worth looking at. The row carries only what names it; the files
           * themselves are read from the checkout's own slices when opened.
           */
          readonly type: "slice";
          readonly sliceId: string;
          readonly title: string;
          readonly fileCount: number;
      };

export interface ConversationActivityFailure {
    readonly kind: "execution_failed" | "interrupted" | "invalid_arguments" | "tool_unavailable";
    readonly message?: string;
}

/** Why an activity is paused for a human decision, shown inline with its row. */
export interface ConversationActivityReview {
    readonly action: string;
    readonly reason: string;
    readonly decision: "allow" | "ask" | "deny";
    readonly risk: "low" | "medium" | "high" | "critical";
    readonly userAuthorization: "unknown" | "low" | "medium" | "high";
}

/** One tool invocation with everything a reader needs at a glance plus on demand. */
export interface ConversationToolCall {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly arguments: ConversationJson;
    readonly status: ConversationActivityStatus;
    readonly display?: string;
    readonly failed: boolean;
    readonly failure?: ConversationActivityFailure;
    readonly presentation?: ConversationActivityPresentation;
    readonly review?: ConversationActivityReview;
    /**
     * The call asked for a review and was granted temporary Full access, so it
     * ran outside the sandbox. Present only on that call: everything else, both
     * unreviewed and reviewed-but-sandboxed, is the ordinary case.
     */
    readonly elevated?: boolean;
}

/**
 * What an `agentActivity` entry is. Glanceable by default and expandable on
 * demand: nobody reads tool transcripts line by line, so every variant carries
 * a one-line identity plus the payload a reader can open.
 */
export type ConversationActivity =
    | { readonly kind: "tool"; readonly tool: ConversationToolCall }
    | { readonly kind: "reasoning"; readonly text: string; readonly streaming: boolean }
    /**
     * A message another agent addressed to this one. It arrives in the user
     * slot and steers the run exactly as the reader's own message would, but it
     * is two agents talking rather than dialogue with the person, so it takes
     * one activity row instead of a chat bubble that is not the reader's.
     */
    | {
          readonly kind: "agentMessage";
          /** The sending agent, exactly as Happy Agent identified it. */
          readonly agentId: string;
          /** That agent's title, when this session knows the agent by one. */
          readonly agentName?: string;
          /** The message as it arrived, addressing envelope included. */
          readonly text: string;
      }
    | {
          readonly kind: "shell";
          readonly command: string;
          readonly output: string;
          readonly exitCode: number | null;
          readonly running: boolean;
          readonly timedOut: boolean;
      }
    /**
     * A step whose producer already labeled it. A live tool call can derive its
     * wording locally, while a summarized step carries its label and subject.
     * Both are one step of an agent's work and render as the same row.
     */
    | {
          readonly kind: "labeled";
          readonly label: string;
          readonly subject?: string;
          readonly status: ConversationActivityStatus;
          /** Literal commands and paths read as code; prose does not. */
          readonly mono: boolean;
      };

/** Something waiting on a human: the payload behind a local Happy Agent request entry. */
export type ConversationRequest =
    | {
          readonly kind: "userInput";
          readonly requestId: string;
          readonly questions: readonly ConversationRequestQuestion[];
          readonly status: "pending";
          readonly answers?: never;
          readonly createdAt?: never;
          readonly resolvedAt?: never;
      }
    | {
          readonly kind: "userInput";
          readonly requestId: string;
          readonly questions: readonly ConversationRequestQuestion[];
          readonly status: "answered";
          readonly answers: Readonly<Record<string, readonly string[]>>;
          readonly createdAt: number;
          readonly resolvedAt: number;
      }
    | {
          readonly kind: "permissionReview";
          readonly requestId: string;
          /** The paused call, so the row can show what is about to run. */
          readonly tool: ConversationToolCall;
          readonly review: ConversationActivityReview;
      };

/** Where a request stands; `pending` is the only state awaiting a human. */
export type ConversationRequestStatus =
    | "pending"
    | "processing"
    | "approved"
    | "denied"
    | "failed"
    | "expired";

/** One request-scoped local submission lifecycle rendered beside its request. */
export type ConversationRequestSubmission =
    | { readonly requestId: string; readonly status: "pending" }
    | { readonly requestId: string; readonly status: "failed"; readonly error: UserError };

/** The request's identity, stable across reconciles for every variant. */
export function requestId(request: ConversationRequest): string {
    return request.requestId;
}

export interface ConversationRequestQuestion {
    readonly id: string;
    readonly header: string;
    readonly question: string;
    readonly multiSelect: boolean;
    readonly required: boolean;
    readonly options: readonly ConversationRequestOption[];
}

export interface ConversationRequestOption {
    readonly label: string;
    readonly description: string;
}

export interface ConversationMessageEntry {
    readonly kind: "message";
    readonly message: ConversationMessageProjection;
    readonly source: "server" | "local";
    readonly delivery: "sending" | "pending_steering" | "sent" | "failed";
    readonly clientMutationId?: string;
    readonly error?: UserError;
    /**
     * A quiet line under the author's name saying where this message stands
     * with the agent. It is written for a message somebody else put into the
     * session, because whether their words reached the agent is not something
     * the message itself can show. Already in the words the surface says,
     * never a wire value.
     */
    readonly contextNote?: string;
}

export interface ConversationActivityEntry {
    readonly kind: "agentActivity";
    readonly id: string;
    readonly activity: ConversationActivity;
    /** Durable event time for the activity, in Unix milliseconds when available. */
    readonly occurredAt?: number;
    /** Ordering key inside the conversation, compared like a message sequence. */
    readonly sequence: string;
    /**
     * The turn this row opens, when it is the first row of an expanded turn. It
     * carries the control that folds the turn back up, which has to ride the row
     * the turn begins on: a turn that ran tools and answered nothing has no
     * message to hang it from, and one that answered in the middle would put
     * "Hide traces" below the work it hides.
     */
    readonly agentTrace?: AgentTurnTraceSummary;
}

/**
 * A service row: something the session says about itself rather than something
 * anyone wrote. Every variant is one row in the transcript with one identity and
 * one place in the order, and `text` is always the complete sentence a reader
 * gets even when nothing else about the variant is understood.
 */
interface ConversationNoticeEntryBase {
    readonly kind: "notice";
    readonly id: string;
    readonly sequence: string;
    readonly text: string;
}

/** The ordinary service line and the section boundary that closes a turn. */
export interface ConversationServiceNoticeEntry extends ConversationNoticeEntryBase {
    /** `divider` closes a section (a completed turn); `notice` is a service line. */
    readonly variant: "notice" | "divider";
    readonly level: "info" | "warning" | "error";
    /** Automatic recovery attempt represented by this notice. */
    readonly retry?: {
        readonly attempt?: number;
        readonly maxAttempts?: number;
    };
    readonly title?: string;
}

/**
 * The lifecycle a compute instance reports while it materializes the workspace a
 * session runs in. These are exactly the states Happy Agent publishes on a compute
 * preparation notice, so a reader is never shown a phase the daemon did not
 * declare.
 */
export type ConversationComputeState =
    | "unprovisioned"
    | "provisioning"
    | "ready"
    | "unavailable"
    | "failed"
    | "stopped";

/**
 * One durable compute lifecycle event in the transcript.
 *
 * A session that runs on provisioned compute spends its first seconds — and,
 * when a provider breaks, its whole life — waiting on a machine rather than on a
 * model. That wait belongs in the transcript beside the messages it delays: it
 * is authoritative session history, ordered with everything else and reconciled
 * the same way, not a toast that disappears before the reader looks up.
 *
 * It is a service notice, not a row type of its own: the daemon publishes it as
 * one, it takes its place in the order the same way, and a surface that only
 * understands notices still has `text`. What the variant adds is the complete
 * concrete payload behind that sentence, so a row can say which provider, which
 * step, how far, and how long instead of restating one line of prose.
 *
 * Every field is projected verbatim from Happy Agent's own notice. Nothing is inferred:
 * a metric Happy Agent did not measure is absent rather than guessed.
 */
export interface ConversationComputeNoticeEntry extends ConversationNoticeEntryBase {
    readonly variant: "compute";
    readonly state: ConversationComputeState;
    /** The provider's own step name inside the lifecycle, such as `pulling_image`. */
    readonly phase: string;
    /** The compute provider plugin that owns the instance. */
    readonly provider: string;
    /** Instance identity, shared by every event of one materialization. */
    readonly instanceId: string;
    /** The provider's progress or failure sentence, as it wrote it. */
    readonly message: string;
    /** Materialization progress in percent, when the provider reports one. */
    readonly percent?: number;
    /** Milliseconds spent preparing so far, when Happy Agent measured it. */
    readonly elapsedMs?: number;
}

/**
 * Everything a service row can be, as one closed union discriminated by
 * `variant`. A reader of an unfamiliar variant never falls through to a partial
 * shape: it either narrows and renders the payload, or renders `text`.
 */
export type ConversationNoticeEntry =
    | ConversationServiceNoticeEntry
    | ConversationComputeNoticeEntry;

/**
 * Whether a service row is ordinary progress a collapsed turn may fold away.
 * Compute rows are the session's machine reporting itself, so their preparation
 * steps are as foldable as any other progress — until one of them says the
 * machine never came up.
 */
export function noticeInformational(entry: ConversationNoticeEntry): boolean {
    return entry.variant === "compute" ? entry.state !== "failed" : entry.level === "info";
}

/**
 * Whether a service row is a failure: the thing a reader must still see after
 * everything else about the turn has been folded away.
 */
export function noticeFailed(entry: ConversationNoticeEntry): boolean {
    return entry.variant === "compute" ? entry.state === "failed" : entry.level === "error";
}

export interface ConversationRequestEntry {
    readonly kind: "request";
    readonly id: string;
    readonly request: ConversationRequest;
    readonly sequence: string;
}

/** The render-ready facts shared by every compact delegated-agent row. */
export interface DelegatedAgentSummary {
    readonly sessionId: string;
    readonly description: string;
    readonly taskName?: string;
    readonly modelId: string;
    readonly status:
        | "idle"
        | "queued"
        | "running"
        | "completed"
        | "aborted"
        | "suspended"
        | "error"
        | "archived";
    /** When the current run began; a running child clocks its elapsed from here. */
    readonly activeSince?: number;
    /** Final recorded duration, used once the child has settled. */
    readonly elapsedMs?: number;
    readonly totalTokens?: number;
}

/** One child session Happy delegated from a concrete parent tool call. */
export interface ConversationDelegationChild extends DelegatedAgentSummary {
    /** The spawn call in the parent transcript this child replaces. */
    readonly parentToolCallId: string;
    readonly createdAt: number;
}

/**
 * Persistent in-turn readout for one delegated child. It replaces the concrete
 * spawn call in place, so every child remains one ordinary agent-owned activity
 * row instead of being nested under a synthetic aggregate.
 */
export interface ConversationDelegationEntry {
    readonly kind: "delegation";
    readonly id: string;
    readonly sequence: string;
    readonly child: ConversationDelegationChild;
    readonly agentTrace?: AgentTurnTraceSummary;
}

/**
 * Permanent readout under a finished turn: how long it took from the request
 * and how many tools/tokens it used. Running turns use the message-list footer instead.
 */
export interface ConversationTurnStatusEntry {
    readonly kind: "turnStatus";
    readonly id: string;
    readonly sequence: string;
    readonly status: "complete" | "failed" | "steered";
    readonly reason?: "completed" | "steering" | "compaction" | "abort" | "error";
    /** Final assistant text copied by the settled footer action. */
    readonly copyText?: string;
    /** Final duration from request sent through completion, when known. */
    readonly durationMs?: number;
    /** Tokens consumed by this run across provider/model segments. */
    readonly usedTokens?: number;
    /** Conversation context measured when the run settled. */
    readonly finalContextTokens?: number;
    readonly tools?: number;
}

/**
 * Everything a desktop conversation can contain, as one closed union. Every
 * session projects its transcript into these render-ready entries.
 */
export type ConversationEntry =
    | ConversationMessageEntry
    | ConversationActivityEntry
    | ConversationNoticeEntry
    | ConversationRequestEntry
    | ConversationDelegationEntry
    | ConversationTurnStatusEntry;

/** The stable render identity of an entry; the row key React must keep. */
export function entryKey(entry: ConversationEntry): string {
    return entry.kind === "message" ? entry.message.id : entry.id;
}

/** The ordering key of an entry, in the same space as a message sequence. */
export function entrySequence(entry: ConversationEntry): string {
    return entry.kind === "message" ? entry.message.sequence : entry.sequence;
}
