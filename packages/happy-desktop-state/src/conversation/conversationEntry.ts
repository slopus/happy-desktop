import type {
    HappyAgentArtifactDisplay,
    HappyAgentArtifactId,
    HappyAgentArtifactType,
} from "../artifacts/artifactTypes.js";
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

/**
 * How an agent is pictured, the same way its own row pictures it: a bot's
 * picture, a team task's owner's photo or initials, the tasks glyph for a task
 * on a standalone machine, or the mark generated from a seed for anything with
 * no picture of its own.
 */
export type ConversationAgentFace =
    | { readonly kind: "image"; readonly url: string }
    | { readonly kind: "initials"; readonly initials: string }
    | { readonly kind: "task" }
    | { readonly kind: "generated"; readonly seed: string };

/** A known agent as a transcript names it. */
export interface ConversationAgentIdentity {
    readonly name: string;
    readonly face: ConversationAgentFace;
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

/**
 * What one presented media item is, as the producer declared it: a picture and
 * a recording play inline, a document and any other file open as a file.
 */
export type ConversationMediaKind = "image" | "video" | "document" | "file";

/**
 * One file a tool call put in front of the reader. The transcript carries its
 * facts and a placeholder, never its bytes: `url` is where the owning Happy
 * Agent serves them, on the same authenticated origin every other transcript
 * image is read from.
 */
export interface ConversationMediaItem {
    readonly kind: ConversationMediaKind;
    readonly name: string;
    readonly mimeType: string;
    /** Size of the bytes behind `url`. */
    readonly size: number;
    /** Intrinsic pixel size, so the inline box is reserved before the bytes arrive. */
    readonly width?: number;
    readonly height?: number;
    /** ThumbHash painted at the item's aspect ratio until the bytes load. */
    readonly thumbhash?: string;
    readonly url: string;
}

/**
 * How the producer asked a call's media to be arranged. Absent, the surface
 * lays the items out itself. `columns` is an equal-column grid, the shape a
 * run of image reads (two) or generated images (one) is shown in. `tree` is a
 * layout the agent wrote, as closed typed nodes: every item it names appears
 * exactly once, and an item it left out is appended after it.
 */
export type ConversationMediaLayout =
    | { readonly type: "columns"; readonly columns: 1 | 2 }
    | { readonly type: "tree"; readonly root: readonly ConversationMediaLayoutNode[] };

export type ConversationMediaLayoutTag =
    | "div"
    | "section"
    | "figure"
    | "figcaption"
    | "p"
    | "span"
    | "strong"
    | "em"
    | "code";

export type ConversationMediaLayoutNode =
    | {
          readonly type: "element";
          readonly tag: ConversationMediaLayoutTag;
          readonly style?: ConversationMediaLayoutStyle;
          readonly children: readonly ConversationMediaLayoutNode[];
      }
    /** One of the call's items, by its position in `items`. */
    | {
          readonly type: "item";
          readonly index: number;
          readonly alt?: string;
          readonly style?: ConversationMediaLayoutStyle;
      }
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "break" };

export type ConversationMediaLayoutLength =
    | { readonly unit: "%"; readonly value: number }
    | { readonly unit: "px"; readonly value: number };

/** Four edges in whole CSS pixels, 0–64. */
export interface ConversationMediaLayoutBox {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}

/**
 * The presentation a layout node may ask for. Every field is a closed literal
 * set or a bounded number; there is no CSS text, and colour is a theme tone.
 */
export interface ConversationMediaLayoutStyle {
    readonly display?: "block" | "flex" | "grid";
    readonly flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
    readonly flexWrap?: "nowrap" | "wrap";
    readonly flexGrow?: number;
    readonly flexShrink?: number;
    readonly flexBasis?: ConversationMediaLayoutLength | "auto";
    readonly justifyContent?:
        | "start"
        | "center"
        | "end"
        | "space-between"
        | "space-around"
        | "space-evenly";
    readonly alignItems?: "start" | "center" | "end" | "stretch" | "baseline";
    readonly alignSelf?: "auto" | "start" | "center" | "end" | "stretch" | "baseline";
    readonly rowGap?: number;
    readonly columnGap?: number;
    /** Fractional track weights, one per column. */
    readonly gridTemplateColumns?: readonly number[];
    readonly gridColumnSpan?: number;
    readonly padding?: ConversationMediaLayoutBox;
    readonly margin?: ConversationMediaLayoutBox;
    readonly width?: ConversationMediaLayoutLength;
    readonly minWidth?: ConversationMediaLayoutLength;
    readonly maxWidth?: ConversationMediaLayoutLength;
    /** Width over height. */
    readonly aspectRatio?: number;
    readonly objectFit?: "contain" | "cover";
    readonly textAlign?: "left" | "center" | "right";
    readonly fontWeight?: "normal" | "bold";
    readonly fontStyle?: "normal" | "italic";
    readonly fontSize?: "small" | "normal" | "large" | "title";
    readonly tone?: "default" | "muted" | "accent";
}

/**
 * The positions of a call's items in the order the reader meets them: the
 * order a tree names them in, else the order they were presented in.
 */
export function conversationMediaOrder(
    count: number,
    layout: ConversationMediaLayout | undefined,
): readonly number[] {
    if (layout?.type !== "tree") return Array.from({ length: count }, (_, index) => index);
    const order: number[] = [];
    const visit = (nodes: readonly ConversationMediaLayoutNode[]) => {
        for (const node of nodes) {
            if (node.type === "item") order.push(node.index);
            else if (node.type === "element") visit(node.children);
        }
    };
    visit(layout.root);
    return order;
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
    /** Files the call generated or presented, shown inline beneath the call. */
    | {
          readonly type: "media";
          readonly items: readonly ConversationMediaItem[];
          readonly layout?: ConversationMediaLayout;
      }
    /**
     * The artifact a call made, changed, or took up. `shows` is `"latest"`
     * where the chat follows the artifact as it changes — where an HTML
     * artifact is shown inline — and `"version"` where the call records one
     * version, shown as a card that opens it.
     */
    | {
          readonly type: "artifact";
          readonly artifactId: HappyAgentArtifactId;
          readonly version: number;
          readonly artifactType: HappyAgentArtifactType;
          /** The title at publication; a surface with live titles prefers those. */
          readonly title: string;
          readonly shows: "latest" | "version";
      }
    /** A web page the call asked the chat to show inline, through the agent's network. */
    | {
          readonly type: "page";
          readonly url: string;
          readonly title: string;
          readonly display: HappyAgentArtifactDisplay | null;
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
          /** That agent's name — a bot's, a task's, or a session's title — when known. */
          readonly agentName?: string;
          /** How that agent is pictured wherever else it is listed, when known. */
          readonly agentFace?: ConversationAgentFace;
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
    /** Explicit send acceptance for daemon-projected user rows; voice never shares optimistic text. */
    readonly pendingSend?: boolean;
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
    readonly variant: "notice" | "divider" | "configuration";
    readonly level: "info" | "warning" | "error";
    /** Automatic recovery attempt represented by this notice. */
    readonly retry?: {
        readonly attempt?: number;
        readonly maxAttempts?: number;
    };
    readonly title?: string;
    /** Explicit durable provenance for a user-requested diagnostic handoff. */
    readonly source?: { readonly messageId: string; readonly runId: string };
    /** Execution facts and manual recovery supplied by the daemon, never the composer. */
    readonly error?: ConversationError;
    /**
     * The typed reason a turn failed, which the client writes as text itself.
     * Absent from a daemon that predates it; the card then shows `error` as before.
     */
    readonly failure?: ConversationFailure;
}

/**
 * The provider a failure is about, with the names the daemon gives it, so the
 * client never maps a provider type to a name itself.
 */
export interface ConversationFailureProvider {
    readonly id: string;
    /** Canonical family, such as "claude"; open-ended. */
    readonly type: string;
    /** The name a sentence uses: "Claude", "Codex", "Grok", "Bedrock". */
    readonly vendorName: string;
    /** The configured entry's label, such as "claude_work". */
    readonly label: string;
}

/** One usable account and model to switch to, ranked by the daemon so every client agrees. */
export interface ConversationFailureFallback {
    readonly providerId: string;
    /** The account's label, as "Switch to claude_work · …" names it. */
    readonly providerLabel: string;
    readonly modelId: string;
    /** Catalog presentation label for `modelId`, when the catalog knows it. */
    readonly modelName?: string;
    /** Used share of the window named by `usageWindow`; null when the account has no reading. */
    readonly usedPercent: number | null;
    /** That window's lowercase name: "weekly" when reported, otherwise its own, such as "5h". */
    readonly usageWindow: string | null;
    /** How the target relates to the failed model: "same_model", "same_family", "other_provider", or newer. */
    readonly group: string;
}

/**
 * What was done about a failure, recorded on it so its history reads the same
 * on every client and after a reload. An action this client does not know is
 * `handled`.
 */
export type ConversationFailureResolution =
    | { readonly action: "retried"; readonly at: number }
    | {
          readonly action: "switched";
          readonly at: number;
          readonly providerId: string;
          /** The target's label, from the failure's own fallback list. */
          readonly providerLabel: string;
          readonly modelId: string;
          /** Catalog presentation label for `modelId`, when the catalog knows it. */
          readonly modelName?: string;
      }
    | { readonly action: "handled"; readonly at: number };

interface ConversationFailureBase {
    /** The daemon's plain-text sentence, shown only for a kind this client does not know. */
    readonly message: string;
    /** Usable switch targets, best first. Empty: no switch, and the card's own action is primary. */
    readonly fallbackProviders: readonly ConversationFailureFallback[];
    readonly resolution?: ConversationFailureResolution;
}

/**
 * Why a turn failed: Happy Agent's `MessageFailure`, as a closed tree. `kind`
 * and the typed fields carry everything the card says, so the client writes
 * the text and nothing is parsed. A kind newer than this client is `unknown`
 * and shows the daemon's `message`.
 */
export type ConversationFailure = ConversationFailureBase &
    (
        | {
              readonly kind: "signin_missing";
              readonly provider: ConversationFailureProvider;
              /** The product the command signs in to, such as "Claude Code". */
              readonly product: string | null;
              /** The vendor's own sign-in command; null for a source configured in settings. */
              readonly command: string | null;
          }
        | {
              readonly kind: "usage_limit";
              readonly provider: ConversationFailureProvider;
              /** Unix milliseconds. */
              readonly resetsAt: number | null;
          }
        | {
              readonly kind: "no_account_available";
              readonly poolName: string;
              /** Unix milliseconds. */
              readonly resetsAt: number | null;
          }
        | {
              readonly kind:
                  | "rate_limited"
                  | "provider_unavailable"
                  | "network"
                  | "provider_disabled";
              readonly provider: ConversationFailureProvider;
          }
        | {
              readonly kind: "context_too_long";
              readonly modelId: string;
              /** Catalog presentation label for `modelId`, when the catalog knows it. */
              readonly modelName?: string;
          }
        | {
              readonly kind: "internal";
              /** One sanitized sentence. */
              readonly detail: string;
          }
        | { readonly kind: "unknown" }
    );

export type ConversationFailureKind = ConversationFailure["kind"];

/**
 * An automatic recovery running on the live turn, shown on the working line
 * instead of as a card. A provider retry carries the kind it retries;
 * `context_too_long` is the single retry after a context reset.
 */
export interface ConversationRetrying {
    readonly attempt: number;
    readonly maxAttempts: number;
    readonly kind: ConversationFailureKind;
    /** The name a sentence uses for the retried provider, such as "Claude". */
    readonly vendorName: string;
}

export interface ConversationExecutionMode {
    readonly providerId: string;
    readonly providerType?: string;
    readonly account?: { readonly id: string; readonly label?: string } | null;
    readonly modelId: string;
    readonly effort: string;
    readonly serviceTier: string | null;
    readonly permissionMode: "read_only" | "workspace_write" | "auto" | "full_access";
}

/** Public, read-only execution evidence; commands are manual copy-only suggestions. */
export interface ConversationError {
    readonly code: string;
    readonly mode: ConversationExecutionMode | null;
    /** Catalog presentation label only; the persisted model ID remains in mode. */
    readonly modelName?: string;
    readonly credentialSource: {
        readonly kind: string;
        readonly location: string;
        readonly host: string | null;
    } | null;
    readonly recovery: {
        readonly steps: readonly string[];
        readonly actions: readonly string[];
        readonly commands?: readonly { readonly label: string; readonly command: string }[];
    };
}

/**
 * Whether an error can be handed to the Chief of Staff. A handoff writes that
 * conversation's draft and opens it; a prepared handoff is not sent.
 */
export type ConversationErrorAssistance =
    | { readonly status: "ready" }
    | { readonly status: "pending" }
    | { readonly status: "prepared" }
    | { readonly status: "failed"; readonly reason: string }
    | { readonly status: "unavailable"; readonly reason: string };

export interface ConversationErrorAssistanceEntry {
    readonly entryId: string;
    readonly assistance: ConversationErrorAssistance;
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
    return entry.variant === "compute"
        ? entry.state !== "failed"
        : entry.variant !== "configuration" && entry.level === "info";
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
    /**
     * The reader's own messages that opened a turn that was stopped, in the
     * order they were sent. The settled footer offers to put them back in the
     * composer, so the request can be revised and sent again. Absent on a turn
     * that was not stopped, and on one no message of the reader's began.
     */
    readonly stoppedMessageIds?: readonly string[];
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
