import { Fragment, useState, type CSSProperties } from "react";
import type {
    ConversationActivity,
    ConversationActivityPresentation,
    ConversationAgentFace,
    ConversationActivityReview,
    ConversationActivityStatus,
    ConversationFileDiff,
    ConversationJson,
    ConversationMediaItem,
    ConversationToolCall,
    HappyReference,
} from "happy-desktop-state";
import { happyReferencePlaceholder } from "happy-desktop-state";
import { compactCount, changeCountLabel } from "./countText";
import { Avatar } from "./Avatar";
import { ConversationMedia } from "./ConversationMedia";
import { CopyButton } from "./CopyButton";
import { DiffSnippet, type DiffLine } from "./DiffSnippet";
import { filePreviewKind } from "./FilePreview";
import { Icon, type IconName } from "./Icon";
import { InlinePage, type InlinePageProps } from "./InlinePage";
import type { InlinePageGeometry } from "./inlinePageFit";
import { useMessageListDisclosureAnchor } from "./messageListDisclosureAnchor";
import { renderMessageMarkdown } from "./MessageMarkdown";
import { conversationMediaVisible } from "./conversationInlineLayouts";
import { messageReferencesPlainText, type MessageReferences } from "./messageReferences";
import { ArtifactTypeGlyph } from "./pages/artifacts/artifactPresentation";
import { clayIconMark, clayIconSlugIs } from "./clayIcons";
import { ScrollingText } from "./ScrollingText";
import { ShimmerText } from "./ShimmerText";
import { Spinner } from "./Spinner";
import { toolCallStillGlyph } from "./toolCallStillGlyph";
import { TypedText } from "./TypedText";
import { Ionicon, Octicon } from "./vectorIcons/VectorIcon";

/**
 * Which live labels type when their value changes. This affects animation
 * only: wording, timestamps, controls, and every other piece of row content
 * stay identical across profiles.
 */
export type ActivityMotion = "typewriter" | "verb-typed" | "calm-typed" | "calm";

/**
 * Content treatment independent of animation. `focused` keeps one action word
 * for the call's life, leaves copy metadata to the detail surface, and reveals
 * the tool's start time over the row's trailing edge.
 */
export type ActivityTreatment = "detailed" | "focused";

/** How a call in a run of picture-showing calls draws its pictures. */
export type AgentActivityMediaRun =
    | { readonly type: "deferred" }
    | {
          readonly type: "end";
          readonly columns: 1 | 2;
          /** Every picture of the run, in order. */
          readonly items: readonly ConversationMediaItem[];
          /** Opens one picture by its position in `items`. */
          readonly onItemOpen?: (position: number) => void;
      };

export type AgentActivityRowProps = {
    activity: ConversationActivity;
    /** Motion profile for live updates. Defaults to the historical `typewriter`. */
    motion?: ActivityMotion;
    /** Row content/chrome policy, independent of which labels animate. */
    treatment?: ActivityTreatment;
    /** Opens a tool's complete body in an owner-provided detail surface. */
    onToolSelect?: (tool: ConversationToolCall) => void;
    /**
     * Opens the workspace file a tool call worked on, in the product's file
     * viewer. A row whose tool names no single showable file offers nothing,
     * and a surface with no workspace behind it passes nothing.
     */
    onFileOpen?: (path: string) => void;
    /**
     * Opens one file a tool call presented, by its position in the call's
     * media: a picture full size, a document or file in its preview.
     */
    onMediaOpen?: (tool: ConversationToolCall, index: number) => void;
    /**
     * This call's part in a run of calls whose pictures form one grid: its
     * own pictures are drawn under a later call, or it is the last call and
     * draws the whole run's. Absent, the call draws its own.
     */
    mediaRun?: AgentActivityMediaRun;
    /**
     * This call's pictures, by index, that a reply placed in its own layout.
     * They are drawn there instead, so the call does not draw them again.
     */
    mediaPlaced?: ReadonlySet<number>;
    /** Start expanded (blueprint/tests). Otherwise rich bodies collapse by default. */
    defaultExpanded?: boolean;
    /** Controlled disclosure state for a virtualized transcript row. */
    expanded?: boolean;
    /** Reports disclosure changes so an owner can rebuild modeled row geometry. */
    onExpandedChange?: (expanded: boolean) => void;
    /**
     * Local conversation tool rows: one neutral line aligned with agent text, with
     * no inline result or expand affordance.
     */
    singleLine?: boolean;
    /** Durable event time, revealed with the row's trailing hover metadata. */
    time?: string;
    /**
     * What the Happy references in a reasoning or agent-message body read as,
     * and what a published artifact is called now and how it opens.
     */
    references?: MessageReferences;
    /**
     * The page a tool call shows inline — an artifact it follows, or a web
     * page — drawn under the call's line in place of a card. The owner decides
     * whether a call shows one and keeps its height and collapse.
     */
    inlinePage?: InlinePageProps;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** Max file diffs rendered per tool before an overflow note replaces the rest. */
const MAX_DIFF_FILES = 5;
/** Head/tail line budget for exec-command output before the middle is elided. */
const EXEC_HEAD_TAIL = 5;
/** Bounded JSON budget for generic tool-call arguments (chars). */
const JSON_BUDGET = 4096;
/** MCP result-row budget: dim child rows shown before an overflow note (A3). */
const MCP_RESULT_ROWS = 5;

function useExpansion(
    defaultExpanded: boolean,
    expanded: boolean | undefined,
    onExpandedChange: ((expanded: boolean) => void) | undefined,
) {
    const [ownExpanded, setOwnExpanded] = useState(defaultExpanded);
    const disclosureAnchor = useMessageListDisclosureAnchor();
    const value = expanded ?? ownExpanded;
    return [
        value,
        (next: boolean, disclosure: HTMLElement) => {
            disclosureAnchor?.(disclosure);
            if (expanded === undefined) setOwnExpanded(next);
            onExpandedChange?.(next);
        },
    ] as const;
}

function AgentActivityTime(props: { time?: string }) {
    return props.time ? (
        <span className="happy-agent-activity__time" data-happy-desktop-ui="agent-activity-time">
            {props.time}
        </span>
    ) : null;
}

/**
 * Parses an MCP tool name (`mcp__server__tool`) into its server and tool parts.
 * Returns undefined for any name that is not an MCP invocation, so the caller
 * falls back to the generic tool rendering path.
 */
function parseMcpToolName(name: string): { server: string; tool: string } | undefined {
    if (!name.startsWith("mcp__")) return undefined;
    const parts = name.split("__");
    if (parts.length < 3) return undefined;
    return { server: parts[1]!, tool: parts.slice(2).join(" ") };
}

/** Splits an MCP result into ≤`budget` dim rows, returning the overflow count. */
function mcpResultRows(display: string, budget: number): { rows: string[]; omitted: number } {
    const all = display.replace(/\n+$/, "").split("\n");
    if (all.length <= budget) return { rows: all, omitted: 0 };
    return { rows: all.slice(0, budget), omitted: all.length - budget };
}

/** Friendly tool label — mirrors the TUI `humanizeToolName` mapping (A3). */
function humanizeToolName(name: string): string {
    const explicit: Record<string, string> = {
        Agent: "Subagent",
        compact: "Context compaction",
        create_artifact: "artifact",
        edit_artifact_files: "artifact files",
        update_artifact: "artifact",
        show_page: "page",
        TaskInput: "Terminal input",
        TaskList: "Task list",
        TaskOutput: "Background output",
        spawn_agent: "Start subagent",
        wait_agent: "Wait for subagents",
        workflow: "Workflow",
        write_stdin: "Terminal input",
    };
    if (explicit[name]) return explicit[name]!;
    if (name.startsWith("mcp__")) {
        const parts = name.split("__");
        if (parts.length >= 3) return `${parts[1]} · ${parts.slice(2).join(" ")}`;
    }
    return name
        .replace(/[_-]+/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^./, (character) => character.toUpperCase());
}

/**
 * Tools that type into a terminal that is already running, rather than starting
 * one. Matched by name for the window before the result arrives, when the row
 * has no presentation to classify it by.
 */
const TERMINAL_INPUT_TOOL = /stdin|terminal_?input|taskinput/;
/** Happy Agent's own artifact and page tools, which name what they did themselves. */
const ARTIFACT_TOOL = /^(create_artifact|edit_artifact_files|update_artifact|show_page)$/;

/** Tools that start or message another agent, by the noun their row leads with. */
const DELEGATION_TOOL_NOUN: Readonly<Record<string, string>> = {
    create_agent: "Agent",
    create_subtask: "Subtask",
    create_task: "Task",
    send_agent_message: "Message",
    send_bot_message: "Message",
    send_task_message: "Message",
};

/** Active/done verb for a tool by name + status (A2/A3). */
function toolVerb(
    name: string,
    status: ConversationActivityStatus,
    presentation?: ConversationActivityPresentation,
): string {
    if (presentation?.type === "agentSpawn") {
        if (status === "awaitingApproval") return "Awaiting approval to spawn";
        if (status === "failed") return "Failed to spawn";
        if (status === "stopped") return "Stopped spawning";
        return status === "running" ? "Spawning" : "Spawned";
    }
    if (status === "awaitingApproval") return "Awaiting approval";
    if (status === "stopped") return "Stopped";
    const active = status === "running";
    const lower = name.toLowerCase();
    if (presentation?.type === "compaction") {
        return status === "failed" ? "Failed" : active ? "Compacting" : "Compacted";
    }
    if (presentation?.type === "search") return active ? "Searching" : "Searched";
    /* A read that turned out to be a picture still says it read it; every
       other call that presents files is named by what it presented. */
    if (presentation?.type === "media")
        return /(read|view)/.test(lower) ? "Read" : mediaNoun(presentation.items);
    // An artifact's tools say what they did to it in their own words: the
    // generic family below would read `edit_artifact_files` as an edit of a
    // file called "Edit artifact files".
    if (
        presentation?.type === "artifact" ||
        presentation?.type === "page" ||
        ARTIFACT_TOOL.test(lower)
    ) {
        if (status === "failed") return "Failed";
        if (presentation?.type === "page" || lower === "show_page")
            return active ? "Showing" : "Showed";
        if (lower === "edit_artifact_files") return active ? "Opening" : "Opened";
        if (lower === "create_artifact") return active ? "Creating" : "Created";
        return active ? "Updating" : "Updated";
    }
    if (presentation?.type === "exploration") return active ? "Exploring" : "Explored";
    // Typing into a terminal that is already running is not the same act as
    // starting one, and it is certainly not editing a file: `write_stdin` would
    // otherwise fall through to the write/edit family below and claim to have
    // edited something called "Write stdin".
    if (presentation?.type === "backgroundTerminalInteraction" || TERMINAL_INPUT_TOOL.test(lower))
        return active ? "Typing" : "Typed";
    // Waiting ends when a child sends input. That expected wake-up is projected
    // as success; the verb describes the wait rather than a generic tool use.
    const still = toolCallStillGlyph(name);
    if (lower === "wait_agent" || still === "clock") return active ? "Waiting" : "Waited";
    if (still === "question") return active ? "Asking" : "Asked";
    if (presentation?.type === "execCommand" || /(bash|exec|shell|command|run)/.test(lower))
        return lower === "powershell" ? "PowerShell" : lower === "bash" ? "Bash" : "Shell";
    // Starting or messaging another agent is named like a command is: by what
    // it is, with the call's own words on it beside.
    const delegation = DELEGATION_TOOL_NOUN[lower];
    if (delegation) return status === "failed" ? "Failed" : delegation;
    if (/(grep|find|glob|^ls$|list|search)/.test(lower)) return active ? "Exploring" : "Explored";
    if (/(read|view|cat|open)/.test(lower)) return active ? "Reading" : "Read";
    if (/(write|edit|patch|update|apply)/.test(lower)) return active ? "Editing" : "Edited";
    return active ? "Tool" : "Used";
}

/** What `toolVerb` calls a tool it has no word for. */
const GENERIC_VERBS: ReadonlySet<string> = new Set(["Tool", "Used"]);

/** Turns the lifecycle word into the stable action label used by focused rows. */
function toolVerbFocused(verb: string): string {
    switch (verb) {
        case "Exploring":
        case "Explored":
            return "Explore";
        case "Typing":
        case "Typed":
            return "Type";
        case "Reading":
            return "Read";
        case "Editing":
        case "Edited":
            return "Edit";
        case "Waiting":
        case "Waited":
            return "Wait";
        case "Asking":
        case "Asked":
            return "Ask";
        case "Used":
            return "Tool";
        case "Created":
            return "Create";
        case "Updated":
            return "Update";
        default:
            return verb;
    }
}

/**
 * Tool → the glyph saying what kind of work it was. Commands use Octicons
 * `code`, failed tools use Octicons `alert`, and file edits use Ionicons
 * `document-outline`; the remaining tool families use the curated vocabulary.
 */
type ToolGlyph =
    | { set: "house"; name: IconName }
    | { set: "ionicons"; name: "document-outline" | "film-outline" | "terminal-outline" }
    | { set: "octicons"; name: "alert" | "code" };

function toolGlyph(
    name: string,
    presentation: ConversationActivityPresentation | undefined,
    failed: boolean,
): ToolGlyph {
    if (failed) return { set: "octicons", name: "alert" };
    const still = toolCallStillGlyph(name);
    if (still !== undefined) return { set: "house", name: still };
    if (presentation?.type === "agentSpawn") return { set: "house", name: "agents" };
    if (presentation?.type === "compaction") return { set: "house", name: "filter" };
    if (presentation?.type === "search") return { set: "house", name: "globe" };
    if (presentation?.type === "exploration") return { set: "house", name: "search" };
    if (presentation?.type === "fileDiff") return { set: "ionicons", name: "document-outline" };
    if (presentation?.type === "artifact") return { set: "house", name: "package" };
    if (presentation?.type === "page") return { set: "house", name: "globe" };
    if (presentation?.type === "media")
        return presentation.items.some((item) => item.kind === "image")
            ? { set: "house", name: "image" }
            : presentation.items.some((item) => item.kind === "video")
              ? { set: "ionicons", name: "film-outline" }
              : { set: "ionicons", name: "document-outline" };
    const lower = name.toLowerCase();
    // Typing into a running terminal gets the terminal itself, so it is not
    // mistaken for the command that started one or for a file edit.
    if (presentation?.type === "backgroundTerminalInteraction" || TERMINAL_INPUT_TOOL.test(lower))
        return { set: "ionicons", name: "terminal-outline" };
    if (presentation?.type === "execCommand") return { set: "octicons", name: "code" };
    if (/(bash|exec|shell|command|run)/.test(lower)) return { set: "octicons", name: "code" };
    if (DELEGATION_TOOL_NOUN[lower]) return { set: "house", name: "agents" };
    if (/(grep|find|glob|^ls$|list|search)/.test(lower)) return { set: "house", name: "search" };
    if (/(read|view|cat|open)/.test(lower)) return { set: "house", name: "doc" };
    if (/(write|edit|patch|update|apply)/.test(lower))
        return { set: "ionicons", name: "document-outline" };
    if (/(fetch|http|web|url|browser)/.test(lower)) return { set: "house", name: "globe" };
    if (/(task|todo|plan)/.test(lower)) return { set: "house", name: "tasks" };
    if (/(agent|spawn|subagent|workflow)/.test(lower)) return { set: "house", name: "agents" };
    return { set: "house", name: "zap" };
}

function ToolIcon(props: { glyph: ToolGlyph }) {
    if (props.glyph.set === "ionicons") return <Ionicon name={props.glyph.name} size={12} />;
    if (props.glyph.set === "octicons") return <Octicon name={props.glyph.name} size={12} />;
    return <Icon name={props.glyph.name} size={12} />;
}

/**
 * Retypes a tool label whenever this row's projected text changes.
 *
 * `typeFirst` also types the text the label opens with. A subject only retypes
 * when it changes, and whether a command ever changes is decided by the wire —
 * arguments that streamed in arrive as several values and type, the same
 * command delivered whole arrives once and does not. Rows that are live when
 * they appear ask for the first value to type too, so the same act looks the
 * same either way.
 */
function AgentActivityChangingText(props: { value: string; typed?: boolean; typeFirst?: boolean }) {
    return (props.typed ?? true) ? (
        <TypedText
            data-happy-desktop-ui="agent-activity-changing-text"
            {...(props.typeFirst ? { typeInitial: true } : {})}
            value={props.value}
        />
    ) : (
        <span
            className="happy-agent-activity__still-text"
            data-happy-desktop-ui="agent-activity-changing-text"
        >
            {props.value}
        </span>
    );
}

function explorationSummary(
    presentation: Extract<ConversationActivityPresentation, { type: "exploration" }>,
): string {
    const operations = presentation.operations;
    if (operations.every((operation) => operation.kind === "read")) {
        return [
            ...new Set(
                operations.flatMap((operation) =>
                    operation.kind === "read" ? [operation.name] : [],
                ),
            ),
        ].join(", ");
    }
    return operations
        .map((operation) => {
            if (operation.kind === "list") return `List ${operation.target}`;
            if (operation.kind === "read") return `Read ${operation.name}`;
            const detail =
                operation.query !== undefined && operation.path !== undefined
                    ? `${operation.query} in ${operation.path}`
                    : (operation.query ?? operation.path ?? operation.command);
            return `Search ${detail}`;
        })
        .join(" · ");
}

function compactionSummary(
    presentation: Extract<ConversationActivityPresentation, { type: "compaction" }>,
): string {
    const before = presentation.tokensBefore;
    const after = presentation.tokensAfter;
    if (before === undefined) {
        return after === undefined ? "context" : `context to ${contextTokenCount(after)} tokens`;
    }
    return after === undefined
        ? `context from ${contextTokenCount(before)} tokens`
        : `context ${contextTokenCount(before)} → ${contextTokenCount(after)} tokens`;
}

/** Context occupancy keeps one useful decimal deeper into the thousands than a file count. */
function contextTokenCount(tokens: number): string {
    if (tokens < 1_000) return String(Math.max(0, Math.round(tokens)));
    const thousands = tokens / 1_000;
    return `${thousands < 100 ? thousands.toFixed(1).replace(/\.0$/, "") : String(Math.round(thousands))}k`;
}

/**
 * What a call presented, as the row's leading word: the kind its files share,
 * counted, or "Files" for a mix.
 */
function mediaNoun(
    items: Extract<ConversationActivityPresentation, { type: "media" }>["items"],
): string {
    const kinds = new Set(items.map((item) => item.kind));
    const plural = items.length > 1;
    if (kinds.size !== 1) return "Files";
    switch (items[0]?.kind) {
        case "image":
            return plural ? "Images" : "Image";
        case "video":
            return plural ? "Videos" : "Video";
        case "document":
            return plural ? "Documents" : "Document";
        default:
            return plural ? "Files" : "File";
    }
}

/** Status → semantic dot tone: warning while active/awaiting, error on stop/fail. */
function statusTone(status: ConversationActivityStatus): "success" | "warning" | "error" {
    if (status === "success") return "success";
    if (status === "failed" || status === "stopped") return "error";
    return "warning";
}

function diffVerb(kind: ConversationFileDiff["kind"]): string {
    if (kind === "add") return "Added";
    if (kind === "delete") return "Deleted";
    return "Edited";
}

/**
 * What was typed into a terminal, on one line. Terminal input is mostly control
 * characters and newlines, which paint as nothing at all: an interrupt would
 * otherwise be an empty row. Control codes are shown the way a terminal echoes
 * them, and a multi-line paste keeps its first line with the rest counted.
 */
function terminalInputSummary(input: string): string {
    const visible = input
        .replaceAll("\r\n", "\n")
        .replace(/\n+$/, "")
        // eslint-disable-next-line no-control-regex -- Terminal input is exactly where control codes arrive, and they must be made visible rather than filtered out.
        .replaceAll(/[\u0000-\u001F\u007F]/g, (character) =>
            character === "\n"
                ? "\n"
                : `^${String.fromCharCode(character.charCodeAt(0) ^ 0x40).toUpperCase()}`,
        );
    if (visible.length === 0) return "";
    const lines = visible.split("\n");
    return lines.length > 1 ? `${lines[0]!} … +${String(lines.length - 1)} lines` : lines[0]!;
}

function fileName(path: string): string {
    const normalized = path.replaceAll("\\", "/");
    return normalized.slice(normalized.lastIndexOf("/") + 1) || path;
}

/** One string argument of a call, when it has one by that name. */
function argumentString(
    argumentsValue: ConversationToolCall["arguments"],
    key: string,
): string | undefined {
    if (typeof argumentsValue !== "object" || argumentsValue === null) return undefined;
    if (Array.isArray(argumentsValue)) return undefined;
    const value = (argumentsValue as Record<string, ConversationJson>)[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/** The tools that write into an artifact, and what each did. Their `path` is a file of the artifact. */
const ARTIFACT_FILE_VERBS: Readonly<Record<string, readonly [string, string]>> = {
    write_artifact_file: ["Wrote", "Writing"],
    edit_artifact_file: ["Edited", "Editing"],
    edit_artifact_files: ["Edited", "Editing"],
    update_artifact: ["Updated", "Updating"],
};

/** File tools whose result arrives as a diff; until it does, their own path says what they touch. */
const FILE_WRITE_VERBS: Readonly<Record<string, readonly [string, string]>> = {
    edit: ["Edited", "Editing"],
    multiedit: ["Edited", "Editing"],
    edit_file: ["Edited", "Editing"],
    notebookedit: ["Edited", "Editing"],
    write: ["Wrote", "Writing"],
    write_file: ["Wrote", "Writing"],
};

/** What an artifact type is called in a sentence about it; nothing for one with no common name. */
const ARTIFACT_NOUN: Readonly<Record<string, string>> = {
    html: "preview",
    markdown: "document",
    image: "image",
    video: "video",
};

/**
 * What a call did, said the way a person would say it: a verb and its object
 * in plain words, such as "Read VoiceBar.tsx" or "Told Steve". Read from the
 * tool and its own arguments; the raw call stays in the row's body. Only a
 * call that is running or done is told this way: one that failed, stopped, or
 * waits for approval keeps its status word, which is the louder fact.
 */
function toolAction(
    tool: ConversationToolCall,
    presentation: ConversationActivityPresentation | undefined,
    summary: string | undefined,
    references: MessageReferences | undefined,
): { verb: string; subject: string } | undefined {
    if (tool.failed || (tool.status !== "running" && tool.status !== "success")) return undefined;
    const running = tool.status === "running";
    const said = (done: string, active: string, subject: string) => ({
        verb: running ? active : done,
        subject,
    });
    const lower = tool.toolName.toLowerCase();
    // A command that said what it does is told in its own words alone.
    if (
        summary !== undefined &&
        (presentation?.type === "execCommand" || /^(bash|exec_command|shell)$/.test(lower))
    )
        return { verb: "", subject: summary };
    if (
        presentation?.type === "exploration" &&
        presentation.operations.every((operation) => operation.kind === "read")
    ) {
        const names = [
            ...new Set(
                presentation.operations.flatMap((operation) =>
                    operation.kind === "read" ? [fileName(operation.name)] : [],
                ),
            ),
        ];
        if (names.length > 0) return said("Read", "Reading", names.join(", "));
    }
    if (presentation === undefined && /^(read|read_file|view)$/.test(lower)) {
        const file = argumentFilePath(tool.arguments);
        return said("Read", "Reading", file === undefined ? "a file" : fileName(file));
    }
    if (presentation === undefined && lower === "create_artifact") {
        const title = argumentString(tool.arguments, "title");
        return said("Created", "Creating", title ?? "an artifact");
    }
    // An edit or a command still being written, before its diff or output
    // arrives, says what it is about from what its arguments hold so far.
    const fileVerb = presentation === undefined ? FILE_WRITE_VERBS[lower] : undefined;
    if (fileVerb !== undefined) {
        const file = argumentFilePath(tool.arguments);
        return said(fileVerb[0], fileVerb[1], file === undefined ? "a file" : fileName(file));
    }
    if (presentation === undefined && /^(bash|exec_command|shell)$/.test(lower)) {
        const description = argumentString(tool.arguments, "description");
        if (description !== undefined) return { verb: "", subject: description };
        const command = argumentString(tool.arguments, "command");
        return said("Ran", "Running", command === undefined ? "a command" : command);
    }
    if (presentation?.type === "artifact" && lower === "create_artifact") {
        const noun = ARTIFACT_NOUN[presentation.artifactType];
        // The live title once it has been read, else the one it was published with.
        const view = references?.view({ kind: "artifact", id: presentation.artifactId });
        const title =
            view?.type === "link" && !view.reading && view.label.trim()
                ? view.label.trim()
                : presentation.title.trim();
        return said(
            "Created",
            "Creating",
            !title ? "an artifact" : noun === undefined ? title : `the ${title} ${noun}`,
        );
    }
    const artifactVerb = presentation === undefined ? ARTIFACT_FILE_VERBS[lower] : undefined;
    if (artifactVerb !== undefined) {
        const id = argumentString(tool.arguments, "artifactId");
        const view = id === undefined ? undefined : references?.view({ kind: "artifact", id });
        return said(
            artifactVerb[0],
            artifactVerb[1],
            view?.type === "link" && view.label.trim() ? view.label.trim() : "an artifact",
        );
    }
    if (lower === "list_teammates") return said("Checked", "Checking", "who's on the team");
    if (lower === "notify_teammate") {
        const id = argumentString(tool.arguments, "userId");
        const label =
            id === undefined ? undefined : references?.view({ kind: "user", id }).label.trim();
        const name = label?.replace(/^@/, "");
        return said(
            "Told",
            "Telling",
            name === undefined || name.length === 0 || name === "…" ? "a teammate" : name,
        );
    }
    return undefined;
}

/** Argument names the file-reading and file-writing tools carry a path under. */
const FILE_PATH_ARGUMENTS = ["file_path", "filePath", "path", "notebook_path"] as const;

/**
 * The one workspace file a tool call is about, when it is about exactly one and
 * Happy can show it. A multi-file edit has no single answer, and a tool whose
 * subject is an archive or a binary would only open on "no preview", so both
 * report nothing rather than offering a click that goes nowhere.
 */
function toolFilePath(tool: ConversationToolCall): string | undefined {
    // An artifact's own files are not the workspace's; the artifact opens them.
    if (ARTIFACT_FILE_VERBS[tool.toolName.toLowerCase()] !== undefined) return undefined;
    const presentation = tool.presentation;
    const candidate =
        presentation?.type === "fileDiff"
            ? presentation.files.length === 1
                ? presentation.files[0]!.path
                : undefined
            : argumentFilePath(tool.arguments);
    if (candidate === undefined || candidate.trim().length === 0) return undefined;
    return filePreviewKind(candidate) === "binary" ? undefined : candidate;
}

/**
 * What a scheduled wait is waiting for, in the words its own arguments use:
 * `wait_until`'s date, or `wait`'s duration as text or as one count per unit.
 */
function waitSubject(tool: ConversationToolCall): string | undefined {
    const args = tool.arguments;
    if (typeof args !== "object" || args === null || Array.isArray(args)) return undefined;
    const fields = args as Record<string, ConversationJson>;
    if (tool.toolName === "wait_until") {
        const at = fields.at;
        return typeof at === "string" || typeof at === "number" ? `until ${at}` : undefined;
    }
    if (typeof fields.duration === "string" && fields.duration.trim().length > 0)
        return `for ${fields.duration.trim()}`;
    const parts = (["days", "hours", "minutes", "seconds"] as const).flatMap((unit) => {
        const count = fields[unit];
        return typeof count === "number" && count > 0
            ? [`${count} ${count === 1 ? unit.slice(0, -1) : unit}`]
            : [];
    });
    return parts.length > 0 ? `for ${parts.join(" ")}` : undefined;
}

function argumentFilePath(argumentsValue: ConversationToolCall["arguments"]): string | undefined {
    if (typeof argumentsValue !== "object" || argumentsValue === null) return undefined;
    if (Array.isArray(argumentsValue)) return undefined;
    for (const key of FILE_PATH_ARGUMENTS) {
        const value = (argumentsValue as Record<string, ConversationJson>)[key];
        if (typeof value === "string" && value.trim().length > 0) return value;
    }
    return undefined;
}

function diffCounts(file: ConversationFileDiff): { added: number; deleted: number } {
    if (file.added !== undefined || file.deleted !== undefined)
        return { added: file.added ?? 0, deleted: file.deleted ?? 0 };
    let added = 0;
    let deleted = 0;
    for (const hunk of file.hunks)
        for (const line of hunk.lines) {
            if (line.kind === "add") added += 1;
            else if (line.kind === "delete") deleted += 1;
        }
    return { added, deleted };
}

/** Flattens a file's hunks into numbered DiffSnippet lines with `@@` meta rows. */
function diffLines(file: ConversationFileDiff): DiffLine[] {
    const lines: DiffLine[] = [];
    file.hunks.forEach((hunk, index) => {
        if (file.hunks.length > 1 || index > 0)
            lines.push({
                kind: "meta",
                text: `@@ -${hunk.oldStart} +${hunk.newStart} @@`,
            });
        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        for (const line of hunk.lines) {
            if (line.kind === "add") {
                lines.push({ kind: "add", number: newLine, text: line.text });
                newLine += 1;
            } else if (line.kind === "delete") {
                lines.push({ kind: "del", number: oldLine, text: line.text });
                oldLine += 1;
            } else {
                lines.push({ kind: "context", number: newLine, text: line.text });
                oldLine += 1;
                newLine += 1;
            }
        }
    });
    return lines;
}

/** Keep the first and last `budget` lines, eliding the middle with a count note. */
function headTail(text: string, budget: number): { lines: string[]; omitted: number } {
    const all = text.replace(/\n+$/, "").split("\n");
    if (all.length <= budget * 2) return { lines: all, omitted: 0 };
    return {
        lines: [...all.slice(0, budget), ...all.slice(all.length - budget)],
        omitted: all.length - budget * 2,
    };
}

/**
 * Whether a tool's arguments have anything to show, answered without
 * serializing them. A call still being generated grows its arguments with every
 * frame of the stream, and the row only asks this to decide whether it can be
 * opened at all — so the question is settled from the shape rather than from a
 * string the row is about to throw away.
 */
function jsonPresent(value: ConversationJson): boolean {
    if (value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
}

function boundedJson(value: ConversationJson): string | undefined {
    if (!jsonPresent(value)) return undefined;
    const text = JSON.stringify(value, null, 2);
    return text.length > JSON_BUDGET ? `${text.slice(0, JSON_BUDGET)}\n… truncated` : text;
}

function ChildRow(props: { tone?: "muted" | "error"; children: React.ReactNode }) {
    return (
        <div
            className="happy-agent-activity__child"
            data-tone={props.tone ?? "muted"}
            data-happy-desktop-ui="agent-activity-child"
        >
            <span aria-hidden="true" className="happy-agent-activity__child-marker">
                └
            </span>
            <span
                className="happy-agent-activity__child-text"
                data-happy-desktop-ui="agent-activity-child-text"
            >
                {props.children}
            </span>
        </div>
    );
}

function PermissionReviewRow(props: { review: ConversationActivityReview }) {
    const { review } = props;
    const title =
        review.decision === "allow"
            ? "Approved"
            : review.decision === "deny"
              ? "Denied"
              : "Awaiting approval";
    return (
        <div className="happy-agent-activity__review" data-happy-desktop-ui="agent-activity-review">
            <span aria-hidden="true" className="happy-agent-activity__child-marker">
                └
            </span>
            <span className="happy-agent-activity__review-body">
                <span
                    className="happy-agent-activity__review-title"
                    data-happy-desktop-ui="agent-activity-review-title"
                >
                    {title} · {review.action}
                </span>
                <span className="happy-agent-activity__review-reason">{review.reason}</span>
                <span
                    className="happy-agent-activity__review-risk"
                    data-risk={review.risk}
                    data-happy-desktop-ui="agent-activity-review-risk"
                >
                    Risk: {review.risk}
                </span>
            </span>
        </div>
    );
}

/**
 * One tool invocation: a rich body chosen by `presentation` (file diff, exec
 * command, background-terminal interaction) with a generic header + result/args
 * fallback. A colored status dot and verb encode running/awaiting-approval/
 * success/failed/stopped, and a pending `review` renders an inline "Awaiting
 * approval" child line. Collapse/expand of the rich body is the only local UI
 * state; every value comes from props.
 */
function AgentToolActivity(props: {
    tool: ConversationToolCall;
    defaultExpanded?: boolean;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
    motion?: ActivityMotion;
    treatment?: ActivityTreatment;
    onSelect?: (tool: ConversationToolCall) => void;
    onFileOpen?: (path: string) => void;
    onMediaOpen?: (tool: ConversationToolCall, index: number) => void;
    mediaRun?: AgentActivityMediaRun;
    mediaPlaced?: ReadonlySet<number>;
    references?: MessageReferences;
    inlinePage?: InlinePageProps;
    singleLine?: boolean;
    time?: string;
}) {
    const { tool } = props;
    const presentation = tool.presentation;
    /* What this call draws under its line: its files, less any a reply placed. */
    const mediaVisible =
        presentation?.type === "media"
            ? conversationMediaVisible(presentation.items, presentation.layout, props.mediaPlaced)
            : undefined;
    const [expanded, setExpanded] = useExpansion(
        props.defaultExpanded ?? false,
        props.expanded,
        props.onExpandedChange,
    );
    const singleLine = props.singleLine ?? false;
    const running = tool.status === "running";
    /* A call that holds the turn open without working — a scheduled wait, a
       question for the reader — keeps its still glyph while it runs. */
    const stillGlyph = toolCallStillGlyph(tool.toolName);
    const spinning = running && stillGlyph === undefined;
    const motion = props.motion ?? "typewriter";
    const focused = props.treatment === "focused";
    const verbTyped = motion === "typewriter" || motion === "verb-typed";
    /** The subject types only in the profiles that type it. */
    const subjectTyped = motion === "typewriter" || motion === "calm-typed";

    const tone = singleLine ? "neutral" : statusTone(tool.status);

    // MCP tool calls (`mcp__server__tool`) have no protocol presentation; the TUI
    // derives their block at render time from the name, arguments, and result. We
    // do the same, but only when no richer presentation (diff/exec) applies.
    const mcp = presentation ? undefined : parseMcpToolName(tool.toolName);
    /* The agent a spawn made, once the window knows it, which a click opens
       where this reader may. */
    const spawned =
        presentation?.type === "agentSpawn" && !tool.failed && tool.status !== "failed"
            ? presentation.agent
            : undefined;
    const spawnedId = presentation?.type === "agentSpawn" ? presentation.agentId : undefined;
    const references = props.references;
    const spawnedOpen =
        spawned !== undefined &&
        spawnedId !== undefined &&
        references !== undefined &&
        references.view({ kind: "agent", id: spawnedId }).type === "link"
            ? () => references.open({ kind: "agent", id: spawnedId })
            : undefined;

    /* The call's own few words, with any agent it names by ID read as that
       agent's name. */
    const summary =
        tool.summary === undefined ? undefined : agentIdsNamed(tool.summary, props.references);
    let primaryText: string;
    let stats: { added: number; deleted: number } | undefined;
    let verb: string;
    /** The row's one word is the tool's own name, said as plain words rather than typed out. */
    let named = false;
    if (mcp) {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        primaryText = `${mcp.server} · ${mcp.tool}`;
    } else if (presentation?.type === "agentSpawn" && spawned !== undefined) {
        /* The agent it made, by its own name, then what it was asked and the
           model it runs on. */
        verb = spawned.name;
        named = true;
        primaryText = [summary, presentation.model?.name].filter(Boolean).join(" · ");
    } else if (presentation?.type === "agentSpawn") {
        verb = toolVerb(tool.toolName, tool.failed ? "failed" : tool.status, presentation);
        primaryText =
            summary ?? (presentation.model ? `${presentation.model.name} sub-agent` : "sub-agent");
    } else if (presentation?.type === "compaction") {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        primaryText = compactionSummary(presentation);
    } else if (presentation?.type === "search") {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        primaryText = presentation.query;
    } else if (presentation?.type === "media") {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        primaryText = presentation.items.map((item) => item.name).join(", ");
    } else if (presentation?.type === "artifact") {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        primaryText = presentation.shows === "latest" ? presentation.title : "artifact";
    } else if (presentation?.type === "page") {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        primaryText = presentation.url;
    } else if (presentation?.type === "exploration") {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        primaryText = explorationSummary(presentation);
    } else if (presentation?.type === "fileDiff") {
        const first = presentation.files[0];
        // The counts are the whole operation's, so a row that names one file
        // must be about one file; more than one reads as how many.
        const fileCount =
            new Set(presentation.files.map((file) => file.path)).size +
            (presentation.omittedFiles ?? 0);
        verb =
            fileCount > 1
                ? "Edited"
                : first
                  ? diffVerb(first.kind)
                  : toolVerb(tool.toolName, tool.status, presentation);
        primaryText =
            fileCount > 1
                ? `${String(fileCount)} files`
                : first
                  ? fileName(first.path)
                  : humanizeToolName(tool.toolName);
        stats = presentation.files.reduce(
            (total, file) => {
                const counts = diffCounts(file);
                return {
                    added: total.added + counts.added,
                    deleted: total.deleted + counts.deleted,
                };
            },
            { added: 0, deleted: 0 },
        );
    } else if (presentation?.type === "execCommand") {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        primaryText = summary ?? presentation.command;
    } else if (presentation?.type === "backgroundTerminalInteraction") {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        // What was typed, not the command that started the terminal: several
        // interactions with one background task all carry the same command, so
        // showing that made a run of rows read as the same thing happening over
        // and over. The command is context, and it moves into the body below.
        primaryText = terminalInputSummary(presentation.input) || presentation.command;
    } else if (
        summary === undefined &&
        stillGlyph === undefined &&
        GENERIC_VERBS.has(toolVerb(tool.toolName, tool.status, presentation))
    ) {
        /* A tool the row knows nothing about is named by what it is, in the
           row's own words: "Discover work", not "Tool" over its name in code. */
        verb = humanizeToolName(tool.toolName);
        named = true;
        primaryText = "";
    } else {
        verb = toolVerb(tool.toolName, tool.status, presentation);
        primaryText =
            tool.toolName.toLowerCase() === "wait_agent"
                ? "for subagents"
                : stillGlyph === "question"
                  ? "a question"
                  : ((stillGlyph === "clock" ? waitSubject(tool) : undefined) ??
                    summary ??
                    humanizeToolName(tool.toolName));
    }
    /* Said in the call's own words rather than its raw input. */
    const described = summary !== undefined && primaryText === summary;
    /* Said as what it did, in plain words, rather than as the tool it was. */
    const action = mcp ? undefined : toolAction(tool, presentation, summary, props.references);
    if (action) {
        verb = action.verb;
        primaryText = action.subject;
    } else if (focused && presentation?.type !== "fileDiff") verb = toolVerbFocused(verb);
    /* Ran outside the sandbox. Said in colour alone — the whole line turns
       amber — because a word in the verb would push the command itself out of
       a row that is already short. A call that stopped or failed never got
       that far, and its own status is the louder fact. */
    const elevated =
        tool.elevated === true &&
        tool.status !== "stopped" &&
        tool.status !== "failed" &&
        !tool.failed;
    const filePath = props.onFileOpen ? toolFilePath(tool) : undefined;

    /* Only a row that is open, and open on its arguments, ever prints them.
       Serializing them anyway cost the whole argument tree on every frame of a
       call still being generated — for a transcript row that never shows a body
       at all, and for a closed row nobody has asked to see. */
    const argsPresent = presentation === undefined && jsonPresent(tool.arguments);
    const execOutput =
        presentation?.type === "execCommand"
            ? headTail(presentation.output, EXEC_HEAD_TAIL)
            : undefined;
    const terminalInput =
        presentation?.type === "backgroundTerminalInteraction"
            ? presentation.input.replace(/\n+$/, "").split("\n")
            : undefined;
    const compactionFailure =
        presentation?.type === "compaction" ? presentation.failureReason : undefined;

    /* What a reader reaches for the clipboard to get: the subject that scrolled
       out of the row, followed by the output or result the row only shows in
       part. Both are elided on screen, so the copy is the unabridged text. */
    /* The raw call a row told in words stands for: its command, or the tool
       and its arguments. A single-line row never opens, so it is the row's
       hover title there and part of what it copies. */
    const rawCall =
        action === undefined
            ? undefined
            : presentation?.type === "execCommand"
              ? `$ ${presentation.command}`
              : `${tool.toolName} ${JSON.stringify(tool.arguments)}`;
    const copyText = [
        primaryText || verb,
        // A described command copies with the command itself, which the row no longer shows.
        described && presentation?.type === "execCommand" ? presentation.command : undefined,
        action !== undefined && presentation?.type !== "execCommand" ? rawCall : undefined,
        presentation?.type === "execCommand"
            ? presentation.output
            : presentation?.type === "search"
              ? presentation.sources?.map((source) => `${source.title}\n${source.url}`).join("\n")
              : presentation?.type === "compaction"
                ? presentation.failureReason
                : presentation?.type === "artifact"
                  ? presentation.title
                  : presentation === undefined
                    ? tool.display
                    : undefined,
    ]
        .map((part) => part?.replace(/\n+$/, ""))
        .filter((part): part is string => part !== undefined && part.length > 0)
        .join("\n");

    const hasBody = singleLine
        ? false
        : presentation?.type === "fileDiff"
          ? presentation.files.length > 0
          : presentation?.type === "search"
            ? (presentation.sources?.length ?? 0) > 0
            : presentation?.type === "execCommand"
              ? // A described command keeps the command itself one click away.
                described || presentation.output.trim().length > 0
              : presentation?.type === "backgroundTerminalInteraction"
                ? presentation.input.trim().length > 0
                : argsPresent;

    // MCP results render as capped dim rows (≤5, then "… N more"); an interrupted
    // call collapses to a single "Interrupted." row, matching the TUI.
    const mcpResult = mcp
        ? tool.failure?.kind === "interrupted"
            ? { rows: ["Interrupted."], omitted: 0 }
            : tool.display && tool.display.trim().length > 0
              ? mcpResultRows(tool.display, MCP_RESULT_ROWS)
              : { rows: ["(empty result)"], omitted: 0 }
        : undefined;

    const genericResult =
        mcp || presentation
            ? undefined
            : tool.display !== undefined && tool.display.length > 0
              ? tool.display
              : "(empty result)";

    const header = (
        <>
            {singleLine ? null : (
                <span
                    aria-hidden="true"
                    className="happy-agent-activity__dot"
                    data-tone={tone}
                    data-happy-desktop-ui="agent-activity-dot"
                />
            )}
            {/* What kind of work this was, told at a glance. It is decoration
                over the verb beside it, which already says the same thing in
                words, so it stays out of the accessibility tree. */}
            <span
                aria-hidden="true"
                className="happy-agent-activity__glyph"
                data-happy-desktop-ui="agent-activity-glyph"
                data-still={stillGlyph}
                data-waiting={running && stillGlyph !== undefined ? "" : undefined}
            >
                {spinning ? (
                    <Spinner
                        label={`${humanizeToolName(tool.toolName)} is running`}
                        size={12}
                        tone="muted"
                        variant="circle"
                    />
                ) : spawned !== undefined ? (
                    <AgentMessageFace face={spawned.face} />
                ) : (
                    <ToolIcon
                        glyph={toolGlyph(
                            tool.toolName,
                            presentation,
                            tool.failed || tool.status === "failed",
                        )}
                    />
                )}
            </span>
            <span
                className="happy-agent-activity__verb"
                data-empty={verb === "" ? "" : undefined}
                data-happy-desktop-ui="agent-activity-verb"
            >
                {/* An agent it made shimmers its name while it works, as its sidebar row does. */}
                {spawned?.working ? (
                    <ShimmerText inline>{verb}</ShimmerText>
                ) : (
                    <AgentActivityChangingText typed={verbTyped && !named} value={verb} />
                )}
            </span>
            {stats ? (
                <span
                    className="happy-agent-activity__file-summary"
                    data-happy-desktop-ui="agent-activity-file-summary"
                >
                    <ScrollingText
                        className="happy-agent-activity__text"
                        data-happy-desktop-ui="agent-activity-text"
                    >
                        <AgentActivityChangingText
                            typeFirst={running}
                            typed={subjectTyped}
                            value={primaryText}
                        />
                    </ScrollingText>
                    {/* A side that changed nothing is left unsaid: "+0" is a
                        number the reader has to read before learning there was
                        nothing to learn. */}
                    {stats.added || stats.deleted ? (
                        <span
                            className="happy-agent-activity__stats"
                            data-happy-desktop-ui="agent-activity-stats"
                        >
                            {stats.added ? (
                                <span aria-hidden="true" className="happy-agent-activity__added">
                                    +{compactCount(stats.added)}
                                </span>
                            ) : null}
                            {stats.deleted ? (
                                <span aria-hidden="true" className="happy-agent-activity__deleted">
                                    &minus;{compactCount(stats.deleted)}
                                </span>
                            ) : null}
                            <span className="happy-visually-hidden">
                                {changeCountLabel(stats.added ?? 0, stats.deleted ?? 0)}
                            </span>
                        </span>
                    ) : null}
                </span>
            ) : primaryText ? (
                <ScrollingText
                    className="happy-agent-activity__text"
                    data-happy-desktop-ui="agent-activity-text"
                >
                    <AgentActivityChangingText
                        typeFirst={running}
                        typed={subjectTyped}
                        value={primaryText}
                    />
                </ScrollingText>
            ) : null}
            {hasBody ? (
                <span aria-hidden="true" className="happy-agent-activity__chevron">
                    <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} />
                </span>
            ) : null}
            <AgentActivityTime time={props.time} />
        </>
    );

    // `data-review` marks a call that went through a permission review, and
    // `data-elevated` the reviewed call that then ran with temporary Full
    // access. Both sit on the row rather than on the review line so the mark
    // survives the single-line variant, where that line is cut.
    return (
        <div
            className="happy-agent-activity"
            data-status={tool.status}
            data-failed={tool.failed || tool.status === "failed" ? "" : undefined}
            data-tone={tone}
            data-presentation={presentation?.type ?? "generic"}
            data-described={described ? "" : undefined}
            data-spawned={spawned !== undefined ? "" : undefined}
            data-review={tool.review ? "" : undefined}
            data-elevated={elevated ? "" : undefined}
            data-single-line={singleLine ? "" : undefined}
            data-expanded={expanded ? "" : undefined}
            data-happy-desktop-ui="agent-activity-call"
        >
            {/* The copy action is a sibling of the header rather than part of
                it: the header is itself a button in most variants, and a
                nested button would be neither valid nor clickable. */}
            <div className="happy-agent-activity__line" data-happy-desktop-ui="agent-activity-line">
                {singleLine && (spawnedOpen || props.onSelect) ? (
                    // A spawned agent opens itself, wherever its row is drawn.
                    <button
                        aria-label={spawnedOpen && spawned ? `Open ${spawned.name}` : undefined}
                        className="happy-agent-activity__header"
                        data-happy-desktop-ui="agent-activity-header"
                        data-opens={spawnedOpen ? "agent" : undefined}
                        onClick={() => (spawnedOpen ? spawnedOpen() : props.onSelect?.(tool))}
                        title={rawCall}
                        type="button"
                    >
                        {header}
                    </button>
                ) : singleLine ? (
                    <div
                        className="happy-agent-activity__header"
                        data-happy-desktop-ui="agent-activity-header"
                        title={rawCall}
                    >
                        {header}
                    </div>
                ) : (
                    <button
                        aria-expanded={hasBody ? (expanded ? "true" : "false") : undefined}
                        aria-label={spawnedOpen && spawned ? `Open ${spawned.name}` : undefined}
                        className="happy-agent-activity__header"
                        data-happy-desktop-ui="agent-activity-header"
                        data-opens={spawnedOpen ? "agent" : undefined}
                        disabled={!hasBody && !spawnedOpen}
                        onClick={(event) => {
                            if (spawnedOpen) spawnedOpen();
                            else if (hasBody) setExpanded(!expanded, event.currentTarget);
                        }}
                        type="button"
                    >
                        {header}
                    </button>
                )}
                {filePath !== undefined && props.onFileOpen ? (
                    /* A sibling of the header for the same reason the copy
                       action is one: the header is itself a button in every
                       variant that opens something. */
                    <button
                        aria-label={`Open ${fileName(filePath)}`}
                        className="happy-agent-activity__open"
                        data-happy-desktop-ui="agent-activity-open"
                        data-path={filePath}
                        onClick={(event) => {
                            event.stopPropagation();
                            props.onFileOpen?.(filePath);
                        }}
                        type="button"
                    >
                        <Icon name="eye" size={14} />
                    </button>
                ) : null}
                {focused ? null : (
                    <CopyButton
                        data-happy-desktop-ui="agent-activity-copy"
                        label="Copy tool detail"
                        text={copyText}
                    />
                )}
            </div>

            {mediaVisible === undefined ||
            mediaVisible.items.length === 0 ||
            props.mediaRun?.type === "deferred" ? null : props.mediaRun?.type === "end" ? (
                <ConversationMedia
                    items={props.mediaRun.items}
                    layout={{ type: "columns", columns: props.mediaRun.columns }}
                    {...(props.mediaRun.onItemOpen
                        ? { onItemOpen: props.mediaRun.onItemOpen }
                        : {})}
                />
            ) : (
                <ConversationMedia
                    items={mediaVisible.items}
                    {...(mediaVisible.layout ? { layout: mediaVisible.layout } : {})}
                    {...(props.onMediaOpen
                        ? {
                              onItemOpen: (position: number) =>
                                  props.onMediaOpen?.(tool, mediaVisible.indexes[position]!),
                          }
                        : {})}
                />
            )}

            {props.inlinePage ? (
                <InlinePage {...props.inlinePage} />
            ) : presentation?.type === "artifact" ? (
                <ArtifactTitleRow presentation={presentation} references={props.references} />
            ) : presentation?.type === "page" ? (
                <InlinePage
                    geometry={TITLE_ONLY}
                    glyph={<Icon name="globe" size={16} />}
                    onHeightChange={ignoreHeight}
                    title={presentation.title}
                />
            ) : null}

            {!singleLine && tool.review ? <PermissionReviewRow review={tool.review} /> : null}

            {!singleLine && genericResult !== undefined ? (
                <ChildRow tone={tool.failed ? "error" : "muted"}>{genericResult}</ChildRow>
            ) : null}

            {!singleLine && compactionFailure !== undefined ? (
                <ChildRow tone="error">{compactionFailure}</ChildRow>
            ) : null}

            {!singleLine && mcpResult ? (
                <div data-happy-desktop-ui="agent-activity-mcp-result">
                    {mcpResult.rows.map((row, index) => (
                        <ChildRow key={index} tone={tool.failed ? "error" : "muted"}>
                            {row || "\u00a0"}
                        </ChildRow>
                    ))}
                    {mcpResult.omitted > 0 ? <ChildRow>… {mcpResult.omitted} more</ChildRow> : null}
                </div>
            ) : null}

            {expanded && hasBody ? (
                <div
                    className="happy-agent-activity__body"
                    data-happy-desktop-ui="agent-activity-body"
                >
                    {presentation?.type === "fileDiff"
                        ? (() => {
                              const shown = presentation.files.slice(0, MAX_DIFF_FILES);
                              const omittedFiles =
                                  (presentation.omittedFiles ?? 0) +
                                  Math.max(0, presentation.files.length - MAX_DIFF_FILES);
                              return (
                                  <>
                                      {shown.map((file, index) => (
                                          <div
                                              className="happy-agent-activity__diff"
                                              key={`${file.path}-${index}`}
                                          >
                                              <DiffSnippet
                                                  file={file.path}
                                                  lines={diffLines(file)}
                                                  stats={{
                                                      added: diffCounts(file).added,
                                                      removed: diffCounts(file).deleted,
                                                  }}
                                              />
                                              {file.omittedLines ? (
                                                  <ChildRow>
                                                      … {file.omittedLines} more lines
                                                  </ChildRow>
                                              ) : null}
                                          </div>
                                      ))}
                                      {omittedFiles > 0 ? (
                                          <ChildRow>… {omittedFiles} more files</ChildRow>
                                      ) : null}
                                  </>
                              );
                          })()
                        : null}

                    {described && presentation?.type === "execCommand" ? (
                        <pre
                            className="happy-agent-activity__output"
                            data-happy-desktop-ui="agent-activity-command"
                        >
                            <div className="happy-agent-activity__output-line">
                                $ {presentation.command}
                            </div>
                        </pre>
                    ) : null}

                    {presentation?.type === "execCommand" &&
                    execOutput &&
                    presentation.output.trim().length > 0
                        ? (() => {
                              const headCount =
                                  execOutput.omitted > 0 ? EXEC_HEAD_TAIL : execOutput.lines.length;
                              return (
                                  <pre
                                      className="happy-agent-activity__output"
                                      data-happy-desktop-ui="agent-activity-output"
                                  >
                                      {execOutput.lines.map((line, index) => (
                                          <div
                                              className="happy-agent-activity__output-line"
                                              key={index}
                                          >
                                              {line || "\u00a0"}
                                              {execOutput.omitted > 0 && index === headCount - 1 ? (
                                                  <div className="happy-agent-activity__output-elide">
                                                      … +{execOutput.omitted} lines
                                                  </div>
                                              ) : null}
                                          </div>
                                      ))}
                                  </pre>
                              );
                          })()
                        : null}

                    {terminalInput ? (
                        <div className="happy-agent-activity__terminal">
                            {terminalInput.map((line, index) => (
                                <ChildRow key={index}>{line || "\u00a0"}</ChildRow>
                            ))}
                        </div>
                    ) : null}

                    {presentation?.type === "search"
                        ? presentation.sources?.map((source) => (
                              <ChildRow key={source.url}>
                                  <a
                                      className="happy-agent-activity__source"
                                      href={source.url}
                                      rel="noreferrer"
                                      target="_blank"
                                  >
                                      {source.title || source.url}
                                  </a>
                              </ChildRow>
                          ))
                        : null}

                    {argsPresent ? (
                        <pre
                            className="happy-agent-activity__args"
                            data-happy-desktop-ui="agent-activity-args"
                        >
                            {boundedJson(tool.arguments)}
                        </pre>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/** A row that is only its title: nothing under it to expand or measure. */
const TITLE_ONLY: InlinePageGeometry = { placement: "title", collapsed: true };
const ignoreHeight = (): void => undefined;

/**
 * The artifact a call published, where the transcript has no artifacts of its
 * own to show inline: the same row as every other artifact in a reply, at its
 * title, which opens it the way a reference to it in a message does. It reads
 * the live title through the same references, keeping the title the call
 * published while that is still being read; an artifact the reader cannot open
 * stays a plain title.
 */
function ArtifactTitleRow(props: {
    presentation: Extract<ConversationActivityPresentation, { type: "artifact" }>;
    references?: MessageReferences;
}) {
    const { presentation, references } = props;
    // Only a creation makes version 1, and an agent writes a new artifact's
    // files after the call that created it, so that row follows the artifact
    // instead of opening the entry it started from.
    const reference: HappyReference =
        presentation.version === 1 || presentation.shows === "latest"
            ? { kind: "artifact", id: presentation.artifactId }
            : { kind: "artifact", id: presentation.artifactId, version: presentation.version };
    const view = references?.view(reference);
    const title =
        view === undefined || (view.type === "link" && view.reading === true)
            ? presentation.title || "Untitled artifact"
            : view.label;
    return (
        <InlinePage
            geometry={TITLE_ONLY}
            glyph={<ArtifactTypeGlyph size={16} type={presentation.artifactType} />}
            onHeightChange={ignoreHeight}
            {...(references !== undefined && view?.type === "link"
                ? { onOpenSide: () => references.open(reference) }
                : {})}
            title={title}
        />
    );
}

/** Model reasoning: one compact line that expands into the full thinking text. */
function AgentReasoningActivity(props: {
    references?: MessageReferences;
    text: string;
    streaming: boolean;
    defaultExpanded?: boolean;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
    time?: string;
}) {
    const [expanded, setExpanded] = useExpansion(
        props.defaultExpanded ?? false,
        props.expanded,
        props.onExpandedChange,
    );
    const summary = messageReferencesPlainText(
        props.text.split("\n").find((line) => line.trim().length > 0) ?? "",
        props.references,
    );
    return (
        <div
            className="happy-agent-activity"
            data-expanded={expanded ? "" : undefined}
            data-presentation="reasoning"
            data-tone="warning"
            data-happy-desktop-ui="agent-activity-reasoning"
        >
            <button
                aria-expanded={expanded ? "true" : "false"}
                className="happy-agent-activity__header"
                data-happy-desktop-ui="agent-activity-header"
                onClick={(event) => setExpanded(!expanded, event.currentTarget)}
                type="button"
            >
                <span
                    aria-hidden="true"
                    className="happy-agent-activity__dot"
                    data-tone={props.streaming ? "warning" : "success"}
                    data-happy-desktop-ui="agent-activity-dot"
                />
                <span
                    className="happy-agent-activity__verb"
                    data-happy-desktop-ui="agent-activity-verb"
                >
                    {props.streaming ? "Thinking" : "Thought"}
                </span>
                <ScrollingText
                    className="happy-agent-activity__text"
                    data-happy-desktop-ui="agent-activity-text"
                >
                    {summary}
                </ScrollingText>
                <span aria-hidden="true" className="happy-agent-activity__chevron">
                    <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} />
                </span>
                <AgentActivityTime time={props.time} />
            </button>
            {expanded ? (
                <div
                    className="happy-agent-activity__body happy-agent-activity__reasoning happy-message__body--markdown"
                    data-happy-desktop-ui="agent-activity-reasoning-body"
                >
                    {renderMessageMarkdown(
                        props.text,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        props.references,
                    )}
                </div>
            ) : null}
        </div>
    );
}

/**
 * A message one agent sent another: who it came from on the row, and the
 * message itself behind it. The addressing envelope Happy Agent wrote for the
 * receiving model is part of the text and is shown with it rather than trimmed.
 */
function AgentMessageActivity(props: {
    agentId: string;
    agentName?: string;
    agentFace?: ConversationAgentFace;
    /** The sender's one line on what the message is; without it the row names the sender. */
    explanation?: string;
    references?: MessageReferences;
    text: string;
    defaultExpanded?: boolean;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
    time?: string;
}) {
    const [expanded, setExpanded] = useExpansion(
        props.defaultExpanded ?? false,
        props.expanded,
        props.onExpandedChange,
    );
    const hasBody = props.text.trim().length > 0;
    return (
        <div
            className="happy-agent-activity"
            data-expanded={expanded ? "" : undefined}
            data-presentation="agent-message"
            data-tone="neutral"
            data-happy-desktop-ui="agent-activity-message"
        >
            <button
                aria-expanded={hasBody ? (expanded ? "true" : "false") : undefined}
                className="happy-agent-activity__header"
                data-happy-desktop-ui="agent-activity-header"
                disabled={!hasBody}
                onClick={(event) => {
                    if (!hasBody) return;
                    setExpanded(!expanded, event.currentTarget);
                }}
                title={props.agentName ?? props.agentId}
                type="button"
            >
                <span
                    aria-hidden="true"
                    className="happy-agent-activity__glyph"
                    data-happy-desktop-ui="agent-activity-glyph"
                >
                    {props.agentFace === undefined ? (
                        <Icon name="agents" size={12} />
                    ) : (
                        <AgentMessageFace face={props.agentFace} />
                    )}
                </span>
                <span
                    className="happy-agent-activity__verb"
                    data-happy-desktop-ui="agent-activity-verb"
                >
                    {props.explanation === undefined
                        ? "Message"
                        : // A line that names its sender already says who it is from.
                          props.explanation.includes(props.agentId)
                          ? null
                          : `${props.agentName ?? agentIdShort(props.agentId)} replied`}
                </span>
                <ScrollingText
                    className="happy-agent-activity__text"
                    data-happy-desktop-ui="agent-activity-text"
                >
                    {props.explanation === undefined ? (
                        `from ${props.agentName ?? agentIdShort(props.agentId)}`
                    ) : (
                        <AgentMessageExplanation
                            references={props.references}
                            text={props.explanation}
                        />
                    )}
                </ScrollingText>
                {hasBody ? (
                    <span aria-hidden="true" className="happy-agent-activity__chevron">
                        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} />
                    </span>
                ) : null}
                <AgentActivityTime time={props.time} />
            </button>
            {expanded && hasBody ? (
                <div
                    className="happy-agent-activity__body happy-agent-activity__message happy-message__body--markdown"
                    data-happy-desktop-ui="agent-activity-message-body"
                >
                    {renderMessageMarkdown(
                        props.text,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        props.references,
                    )}
                </div>
            ) : null}
        </div>
    );
}

/** The edge of a sender's face: the glyph lane's own, so a face never moves the verb. */
const AGENT_MESSAGE_FACE_SIZE = 14;

/**
 * The sender's face, as its own row elsewhere pictures it, shrunk to the glyph
 * lane: a picture, initials, the tasks glyph, its clay icon, or the generated
 * mark.
 */
function AgentMessageFace(props: { face: ConversationAgentFace }) {
    const face = props.face;
    // A clay icon this library doesn't draw is the agents glyph.
    if (face.kind === "library")
        return clayIconSlugIs(face.slug) ? (
            <img
                {...clayIconMark(face.slug)}
                alt=""
                className="happy-agent-activity__face-icon"
                draggable={false}
                height={AGENT_MESSAGE_FACE_SIZE}
                width={AGENT_MESSAGE_FACE_SIZE}
            />
        ) : (
            <Icon name="agents" size={12} />
        );
    return (
        <Avatar
            {...(face.kind === "image" ? { imageUrl: face.url } : {})}
            {...(face.kind === "task" ? { icon: "tasks" as const } : {})}
            initials={face.kind === "initials" ? face.initials : ""}
            size="xs"
            style={{
                borderRadius: 4,
                fontSize: 7,
                height: AGENT_MESSAGE_FACE_SIZE,
                width: AGENT_MESSAGE_FACE_SIZE,
            }}
            type="agent"
        />
    );
}

/**
 * An agent nobody here can name — deleted, or not visible to this reader — by
 * the start of its id: enough to tell two apart, short enough for one row. The
 * whole id stays in the message, where the receiving model replies to it, and
 * on the row's tooltip.
 */
/**
 * An agent ID as Happy Agent mints them: 24 lowercase letters and digits.
 * Agents name each other this way in the few words they say about a message.
 */
const AGENT_ID = /\b[a-z0-9]{24}\b/g;

/** An agent a line names, read as its name; `link` when the reader can open it. */
type AgentIdSegment = { readonly id: string; readonly label: string; readonly link: boolean };

/**
 * `text` with every agent it names by ID split out, so each reads as that
 * agent's name. An ID the window knows no name for stays as written.
 */
function agentIdSegments(
    text: string,
    references: MessageReferences | undefined,
): readonly (string | AgentIdSegment)[] {
    if (references === undefined) return [text];
    const segments: (string | AgentIdSegment)[] = [];
    let cursor = 0;
    for (const match of text.matchAll(AGENT_ID)) {
        const id = match[0];
        // A run of 24 digits is a number, whatever else it might name.
        if (!/[a-z]/.test(id)) continue;
        const reference: HappyReference = { kind: "agent", id };
        const view = references.view(reference);
        // A child the reader cannot open still has a name worth more than its
        // ID; an agent the window cannot name keeps the ID that tells it apart.
        if (
            view.type !== "link" &&
            (view.label === id ||
                view.label.length === 0 ||
                view.label === happyReferencePlaceholder(reference))
        )
            continue;
        if (match.index > cursor) segments.push(text.slice(cursor, match.index));
        segments.push({ id, label: view.label, link: view.type === "link" });
        cursor = match.index + id.length;
    }
    if (cursor === 0) return [text];
    if (cursor < text.length) segments.push(text.slice(cursor));
    return segments;
}

/** `text` with the agents it names by ID read as their names, for a row that shows only text. */
function agentIdsNamed(text: string, references: MessageReferences | undefined): string {
    const segments = agentIdSegments(text, references);
    return segments.length === 1 && typeof segments[0] === "string"
        ? segments[0]
        : segments
              .map((segment) => (typeof segment === "string" ? segment : segment.label))
              .join("");
}

/**
 * The sender's few words on a message, each agent it names by ID shown as
 * that agent — underlined only under the pointer, because a column of these
 * rows would otherwise be a column of links — and opened on click.
 */
function AgentMessageExplanation(props: {
    text: string;
    references: MessageReferences | undefined;
}) {
    const references = props.references;
    const segments = agentIdSegments(props.text, references);
    if (references === undefined || (segments.length === 1 && typeof segments[0] === "string"))
        return <>{props.text}</>;
    return (
        <>
            {segments.map((segment, index) =>
                typeof segment === "string" || !segment.link ? (
                    // The runs of one line never move, so their order is their identity.
                    <Fragment key={index}>
                        {typeof segment === "string" ? segment : segment.label}
                    </Fragment>
                ) : (
                    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- a pointer shortcut inside the row's own button, which keyboard users open instead
                    <span
                        className="happy-agent-activity__agent-reference"
                        data-happy-desktop-ui="agent-activity-agent-reference"
                        key={index}
                        onClick={(event) => {
                            // The row's own click opens the message; this one opens the agent.
                            event.stopPropagation();
                            references.open({ kind: "agent", id: segment.id });
                        }}
                    >
                        {segment.label}
                    </span>
                ),
            )}
        </>
    );
}

function agentIdShort(agentId: string): string {
    return agentId.length > 10 ? `${agentId.slice(0, 8)}…` : agentId;
}

/** A shell-mode run: the command line, its exit state, and its captured output. */
function AgentShellActivity(props: {
    command: string;
    output: string;
    exitCode: number | null;
    running: boolean;
    timedOut: boolean;
    defaultExpanded?: boolean;
    expanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
    time?: string;
}) {
    const [expanded, setExpanded] = useExpansion(
        props.defaultExpanded ?? true,
        props.expanded,
        props.onExpandedChange,
    );
    const failed = !props.running && (props.timedOut || (props.exitCode ?? 0) !== 0);
    const status = props.running
        ? "Running"
        : props.timedOut
          ? "Timed out"
          : `Exit ${props.exitCode ?? "?"}`;
    const hasBody = props.output.trim().length > 0;
    return (
        <div
            className="happy-agent-activity"
            data-expanded={expanded ? "" : undefined}
            data-presentation="shell"
            data-tone={props.running ? "warning" : failed ? "error" : "success"}
            data-happy-desktop-ui="agent-activity-shell"
        >
            <button
                aria-expanded={hasBody ? (expanded ? "true" : "false") : undefined}
                className="happy-agent-activity__header"
                data-happy-desktop-ui="agent-activity-header"
                disabled={!hasBody}
                onClick={(event) => hasBody && setExpanded(!expanded, event.currentTarget)}
                type="button"
            >
                <span
                    aria-hidden="true"
                    className="happy-agent-activity__dot"
                    data-tone={props.running ? "warning" : failed ? "error" : "success"}
                    data-happy-desktop-ui="agent-activity-dot"
                />
                <span
                    aria-hidden="true"
                    className="happy-agent-activity__glyph"
                    data-happy-desktop-ui="agent-activity-glyph"
                >
                    {failed ? (
                        <Octicon name="alert" size={12} />
                    ) : (
                        <Octicon name="code" size={12} />
                    )}
                </span>
                <span
                    className="happy-agent-activity__verb"
                    data-happy-desktop-ui="agent-activity-verb"
                >
                    Bash
                </span>
                <ScrollingText
                    className="happy-agent-activity__text"
                    data-happy-desktop-ui="agent-activity-text"
                >
                    {props.command}
                </ScrollingText>
                <span
                    className="happy-agent-activity__status"
                    data-failed={failed ? "true" : undefined}
                    data-happy-desktop-ui="agent-activity-status"
                >
                    {status}
                </span>
                {hasBody ? (
                    <span aria-hidden="true" className="happy-agent-activity__chevron">
                        <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} />
                    </span>
                ) : null}
                <AgentActivityTime time={props.time} />
            </button>
            {expanded && hasBody ? (
                <div
                    className="happy-agent-activity__body"
                    data-happy-desktop-ui="agent-activity-body"
                >
                    <pre
                        className="happy-agent-activity__output"
                        data-happy-desktop-ui="agent-activity-output"
                    >
                        {props.output}
                    </pre>
                </div>
            ) : null}
        </div>
    );
}

/**
 * A step the producer already described: its label and subject go straight to
 * the same single line a live tool call renders, so summarized and streamed
 * activity read identically.
 */
function AgentLabeledActivity(props: {
    label: string;
    subject?: string;
    status: ConversationActivityStatus;
    mono: boolean;
    time?: string;
}) {
    return (
        <div
            className="happy-agent-activity"
            data-happy-desktop-ui="agent-activity-call"
            data-mono={props.mono ? "" : undefined}
            data-single-line=""
            data-status={props.status}
            data-tone="neutral"
        >
            <div
                className="happy-agent-activity__header"
                data-happy-desktop-ui="agent-activity-header"
            >
                <span
                    className="happy-agent-activity__verb"
                    data-happy-desktop-ui="agent-activity-verb"
                >
                    <AgentActivityChangingText value={props.label} />
                </span>
                {props.subject !== undefined && props.subject.length > 0 ? (
                    <ScrollingText
                        className="happy-agent-activity__text"
                        data-happy-desktop-ui="agent-activity-text"
                    >
                        <AgentActivityChangingText value={props.subject} />
                    </ScrollingText>
                ) : null}
                <AgentActivityTime time={props.time} />
            </div>
        </div>
    );
}

/**
 * AgentActivityRow — the one glanceable row for everything an agent does inside
 * a conversation: a tool call, a reasoning block, a shell run, or a message
 * another agent sent it. Each variant shows its mark, a verb, and its subject on
 * a single line and expands to the detail on demand, so a long working turn
 * stays readable without hiding what happened. Presentational only: the caller
 * supplies the projected activity and the surface decides which rows to show at
 * all.
 */
export function AgentActivityRow(props: AgentActivityRowProps) {
    const activity = props.activity;
    return (
        <div
            className={["happy-agent-activity-row", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="agent-activity-row"
            data-kind={activity.kind}
            data-treatment={props.treatment ?? "detailed"}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {activity.kind === "tool" ? (
                <AgentToolActivity
                    defaultExpanded={props.defaultExpanded}
                    expanded={props.expanded}
                    motion={props.motion}
                    onExpandedChange={props.onExpandedChange}
                    treatment={props.treatment}
                    onSelect={props.onToolSelect}
                    {...(props.onFileOpen ? { onFileOpen: props.onFileOpen } : {})}
                    {...(props.onMediaOpen ? { onMediaOpen: props.onMediaOpen } : {})}
                    {...(props.mediaRun ? { mediaRun: props.mediaRun } : {})}
                    {...(props.mediaPlaced ? { mediaPlaced: props.mediaPlaced } : {})}
                    {...(props.references ? { references: props.references } : {})}
                    {...(props.inlinePage ? { inlinePage: props.inlinePage } : {})}
                    singleLine={props.singleLine}
                    time={props.time}
                    tool={activity.tool}
                />
            ) : activity.kind === "labeled" ? (
                <AgentLabeledActivity
                    label={activity.label}
                    mono={activity.mono}
                    status={activity.status}
                    subject={activity.subject}
                    time={props.time}
                />
            ) : activity.kind === "agentMessage" ? (
                <AgentMessageActivity
                    agentId={activity.agentId}
                    {...(activity.agentName === undefined ? {} : { agentName: activity.agentName })}
                    {...(activity.agentFace === undefined ? {} : { agentFace: activity.agentFace })}
                    {...(activity.explanation === undefined
                        ? {}
                        : { explanation: activity.explanation })}
                    defaultExpanded={props.defaultExpanded}
                    expanded={props.expanded}
                    onExpandedChange={props.onExpandedChange}
                    {...(props.references ? { references: props.references } : {})}
                    text={activity.text}
                    time={props.time}
                />
            ) : activity.kind === "reasoning" ? (
                <AgentReasoningActivity
                    defaultExpanded={props.defaultExpanded}
                    expanded={props.expanded}
                    onExpandedChange={props.onExpandedChange}
                    {...(props.references ? { references: props.references } : {})}
                    streaming={activity.streaming}
                    text={activity.text}
                    time={props.time}
                />
            ) : (
                <AgentShellActivity
                    command={activity.command}
                    defaultExpanded={props.defaultExpanded}
                    expanded={props.expanded}
                    exitCode={activity.exitCode}
                    onExpandedChange={props.onExpandedChange}
                    output={activity.output}
                    running={activity.running}
                    timedOut={activity.timedOut}
                    time={props.time}
                />
            )}
        </div>
    );
}
