import type { ReactNode } from "react";
import type { ConversationJson, ConversationToolCall } from "happy-desktop-state";
import { CodeBlock } from "./CodeBlock";
import { DiffSnippet, type DiffLine } from "./DiffSnippet";
import type { IconName } from "./Icon";
import { ScrollArea } from "./Scrollbar";

type JsonRecord = { readonly [key: string]: ConversationJson };

/** How the inspector draws a tool it knows: its own heading and body. */
export interface KnownToolPreview {
    readonly title: string;
    /** What the call is about, under the title, when the call gave no description. */
    readonly detail?: string;
    readonly icon: IconName;
    /** The body fills the panel as a terminal does, so its output is the scrollport. */
    readonly fills: boolean;
    readonly body: ReactNode;
}

function record(value: ConversationJson | undefined): JsonRecord | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as JsonRecord)
        : undefined;
}

function text(fields: JsonRecord | undefined, key: string): string | undefined {
    const value = fields?.[key];
    return typeof value === "string" ? value : undefined;
}

function count(fields: JsonRecord | undefined, key: string): number | undefined {
    const value = fields?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function plural(value: number, one: string, many: string): string {
    return `${String(value)} ${value === 1 ? one : many}`;
}

export function humanizeToolKey(name: string): string {
    return name
        .replace(/[_-]+/gu, " ")
        .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
        .replace(/\s+/gu, " ")
        .trim()
        .replace(/^./u, (character) => character.toUpperCase());
}

export function PreviewSection(props: { label: string; children: ReactNode }) {
    return (
        <section className="happy-tool-call-preview__section">
            <span className="happy-tool-call-preview__label">{props.label}</span>
            {props.children}
        </section>
    );
}

function Mono(props: { text: string; failed?: boolean }) {
    return (
        <pre
            className="happy-tool-call-preview__arguments"
            data-failed={props.failed ? "" : undefined}
        >
            {props.text}
        </pre>
    );
}

/** Short values as label and value on one line each, where a box apiece would be too much. */
function Facts(props: { rows: readonly (readonly [string, string])[] }) {
    if (props.rows.length === 0) return null;
    return (
        <dl className="happy-tool-call-preview__facts">
            {props.rows.map(([label, value]) => (
                <div className="happy-tool-call-preview__fact" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

/** Whether a value reads on one short line, so it can sit beside its label. */
function short(value: ConversationJson): boolean {
    if (value === null || typeof value === "number" || typeof value === "boolean") return true;
    return typeof value === "string" && value.length <= 80 && !value.includes("\n");
}

/** A few facts about the call on one quiet line, such as "Exit 0 · 1.2s". */
function Meta(props: { items: readonly (string | false | undefined)[] }) {
    const items = props.items.filter((item): item is string => typeof item === "string");
    if (items.length === 0) return null;
    return <div className="happy-tool-call-preview__meta">{items.join(" · ")}</div>;
}

function Terminal(props: { text: string }) {
    return (
        <ScrollArea
            className="happy-tool-call-preview__terminal"
            viewportClassName="happy-tool-call-preview__terminal-viewport"
        >
            <pre className="happy-tool-call-preview__terminal-content">
                {props.text || "(no output)"}
            </pre>
        </ScrollArea>
    );
}

/** One JSON value as readable text: strings as they are, everything else indented. */
function jsonText(value: ConversationJson): string {
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

/**
 * Any JSON as labeled fields: an object reads one section per key, with text
 * kept as text instead of an escaped JSON string; anything else is one block.
 */
export function JsonFields(props: {
    label: string;
    value: ConversationJson;
    skip?: readonly string[];
    failed?: boolean;
}) {
    const fields = record(props.value);
    if (fields === undefined) {
        return (
            <PreviewSection label={props.label}>
                <Mono failed={props.failed} text={jsonText(props.value)} />
            </PreviewSection>
        );
    }
    const keys = Object.keys(fields).filter((key) => !props.skip?.includes(key));
    if (keys.length === 0) return null;
    const compact = keys.filter((key) => short(fields[key]!));
    return (
        <>
            <Facts rows={compact.map((key) => [humanizeToolKey(key), jsonText(fields[key]!)])} />
            {keys
                .filter((key) => !compact.includes(key))
                .map((key) => (
                    <PreviewSection key={key} label={humanizeToolKey(key)}>
                        <Mono failed={props.failed} text={jsonText(fields[key]!)} />
                    </PreviewSection>
                ))}
        </>
    );
}

/**
 * The words a result says, when it is words: text itself, or the
 * `{ output }` or `{ error }` a tool result wraps its text in.
 */
export function resultWords(result: ConversationJson | undefined): string | undefined {
    if (typeof result === "string") return result;
    const fields = record(result);
    if (fields === undefined) return undefined;
    const keys = Object.keys(fields);
    if (keys.length === 1 && (keys[0] === "output" || keys[0] === "error"))
        return text(fields, keys[0]);
    return undefined;
}

function failureText(tool: ConversationToolCall): string | undefined {
    if (tool.failure?.message) return tool.failure.message;
    if (!tool.failed && tool.status !== "failed") return undefined;
    // A structured result that is not an error, such as a command that exited
    // nonzero, already says how it failed in its own fields.
    if (tool.result !== undefined)
        return text(record(tool.result), "error") ?? resultWords(tool.result);
    return tool.display;
}

function Failure(props: { tool: ConversationToolCall }) {
    const message = failureText(props.tool);
    return message === undefined ? null : (
        <PreviewSection label="Failure">
            <Mono failed text={message} />
        </PreviewSection>
    );
}

const SHELL_TOOLS = new Set(["Bash", "bash", "PowerShell", "exec_command", "run_terminal_command"]);
const SHELL_OUTPUT_TOOLS = new Set(["BashOutput", "bash_output"]);
const SHELL_INPUT_TOOLS = new Set(["BashInput", "bash_input", "write_stdin"]);
const READ_TOOLS = new Set(["Read", "read", "read_file"]);
const WRITE_TOOLS = new Set(["Write", "write"]);
const EDIT_TOOLS = new Set(["Edit", "edit"]);
const SEARCH_TOOLS = new Set(["Glob", "Grep", "grep", "find", "ls"]);

function seconds(value: number | undefined): string | undefined {
    if (value === undefined) return undefined;
    return value < 10 ? `${value.toFixed(1)}s` : `${String(Math.round(value))}s`;
}

function exitLabel(fields: JsonRecord | undefined): string | undefined {
    const code = fields?.exitCode ?? fields?.exit_code;
    return typeof code === "number" ? `Exit ${String(code)}` : undefined;
}

function shellPreview(tool: ConversationToolCall, args: JsonRecord | undefined): KnownToolPreview {
    const result = record(tool.result);
    const command = text(args, "command") ?? text(args, "cmd") ?? text(result, "command");
    const stdout = text(result, "stdout") ?? text(result, "output") ?? resultWords(tool.result);
    const stderr = text(result, "stderr");
    const secrets = args?.secrets;
    const shellId = text(result, "bash_id") ?? text(result, "session_id");
    return {
        title: "Terminal",
        icon: "terminal",
        fills: true,
        body: (
            <>
                {command === undefined ? null : (
                    <PreviewSection label="Command">
                        <pre className="happy-tool-call-preview__command">{command}</pre>
                    </PreviewSection>
                )}
                <Meta
                    items={[
                        tool.elevated && "Full access",
                        args?.run_in_background === true && "Background",
                        args?.tty === true && "TTY",
                        Array.isArray(secrets) &&
                            secrets.length > 0 &&
                            plural(secrets.length, "secret", "secrets"),
                        exitLabel(result),
                        seconds(count(result, "wallTimeSeconds")),
                        shellId !== undefined && `Still running · shell ${shellId}`,
                        result?.truncated === true && "Output truncated",
                    ]}
                />
                {tool.status === "running" && stdout === undefined ? null : (
                    <Terminal text={stdout ?? ""} />
                )}
                {stderr ? (
                    <PreviewSection label="Errors">
                        <Mono failed text={stderr} />
                    </PreviewSection>
                ) : null}
                {text(result, "ended") === undefined ? null : (
                    <PreviewSection label="Ended">
                        <Mono text={text(result, "ended")!} />
                    </PreviewSection>
                )}
            </>
        ),
    };
}

function shellSessionPreview(
    tool: ConversationToolCall,
    args: JsonRecord | undefined,
    input: boolean,
): KnownToolPreview {
    const result = record(tool.result);
    const shellId = args?.bash_id ?? args?.session_id ?? args?.shell_id;
    const typed = text(args, "input") ?? text(args, "chars");
    const output = text(result, "output") ?? text(result, "stdout") ?? resultWords(tool.result);
    return {
        title: input ? "Terminal input" : "Terminal output",
        icon: "terminal",
        fills: true,
        body: (
            <>
                {text(result, "command") === undefined ? null : (
                    <PreviewSection label="Command">
                        <pre className="happy-tool-call-preview__command">
                            {text(result, "command")}
                        </pre>
                    </PreviewSection>
                )}
                {input && typed !== undefined ? (
                    <PreviewSection label="Input">
                        <Mono text={typed} />
                    </PreviewSection>
                ) : null}
                <Meta
                    items={[
                        shellId !== undefined &&
                            shellId !== null &&
                            `Shell ${typeof shellId === "string" ? shellId : JSON.stringify(shellId)}`,
                        text(result, "status") !== undefined &&
                            humanizeToolKey(text(result, "status")!),
                        exitLabel(result),
                        result?.truncated === true && "Output truncated",
                    ]}
                />
                {output === undefined ? null : <Terminal text={output} />}
            </>
        ),
    };
}

function lineRange(args: JsonRecord | undefined, result: JsonRecord | undefined) {
    const start = count(result, "start_line") ?? count(args, "offset");
    const returned = count(result, "returned_lines");
    const total = count(result, "total_lines");
    const limit = count(args, "limit");
    if (start !== undefined && returned !== undefined && returned > 0)
        return `Lines ${String(start)}–${String(start + returned - 1)}${total === undefined ? "" : ` of ${String(total)}`}`;
    if (start !== undefined && limit !== undefined)
        return `Lines ${String(start)}–${String(start + limit - 1)}`;
    if (start !== undefined) return `From line ${String(start)}`;
    if (total !== undefined) return plural(total, "line", "lines");
    return undefined;
}

function baseName(path: string): string {
    return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

function filePath(args: JsonRecord | undefined): string | undefined {
    return (
        text(args, "file_path") ??
        text(args, "filePath") ??
        text(args, "path") ??
        text(args, "target_file")
    );
}

function readPreview(tool: ConversationToolCall, args: JsonRecord | undefined): KnownToolPreview {
    const result = record(tool.result);
    const path = filePath(args) ?? text(result, "path");
    const content =
        text(result, "content") ??
        text(result, "text") ??
        text(result, "caption") ??
        resultWords(tool.result);
    return {
        title: "Read file",
        ...(path === undefined ? {} : { detail: baseName(path) }),
        icon: "doc",
        fills: false,
        body: (
            <>
                {path === undefined ? null : (
                    <PreviewSection label="File">
                        <Mono text={path} />
                    </PreviewSection>
                )}
                <Meta
                    items={[lineRange(args, result), result?.truncated === true && "Truncated"]}
                />
                {content === undefined || tool.failed ? null : (
                    <PreviewSection label="Content">
                        <Mono text={content || "(empty file)"} />
                    </PreviewSection>
                )}
            </>
        ),
    };
}

function writePreview(tool: ConversationToolCall, args: JsonRecord | undefined): KnownToolPreview {
    const result = record(tool.result);
    const path = filePath(args) ?? text(result, "path") ?? "file";
    const content = text(args, "content");
    const characters = count(result, "characters");
    return {
        title: "Write file",
        detail: baseName(path),
        icon: "doc",
        fills: false,
        body: (
            <>
                <Meta
                    items={[
                        result?.created === true
                            ? "Created"
                            : result?.created === false
                              ? "Replaced"
                              : undefined,
                        characters !== undefined && plural(characters, "character", "characters"),
                    ]}
                />
                {content === undefined ? (
                    <PreviewSection label="File">
                        <Mono text={path} />
                    </PreviewSection>
                ) : (
                    <DiffSnippet
                        created={result?.created === true}
                        file={path}
                        source={{ name: path, text: content }}
                        wrap
                    />
                )}
            </>
        ),
    };
}

function editLines(oldText: string, newText: string): DiffLine[] {
    return [
        ...oldText.split("\n").map((line) => ({ kind: "del" as const, text: line })),
        ...newText.split("\n").map((line) => ({ kind: "add" as const, text: line })),
    ];
}

function editPreview(
    tool: ConversationToolCall,
    args: JsonRecord | undefined,
): KnownToolPreview | undefined {
    const oldText = text(args, "old_string") ?? text(args, "oldText");
    const newText = text(args, "new_string") ?? text(args, "newText");
    if (oldText === undefined || newText === undefined) return undefined;
    const result = record(tool.result);
    const path = filePath(args) ?? text(result, "path") ?? "file";
    const replacements = count(result, "replacements");
    const lines = editLines(oldText, newText);
    return {
        title: "Edit file",
        detail: baseName(path),
        icon: "edit",
        fills: false,
        body: (
            <>
                <Meta
                    items={[
                        args?.replace_all === true && "Every occurrence",
                        replacements !== undefined &&
                            plural(replacements, "replacement", "replacements"),
                    ]}
                />
                <DiffSnippet
                    file={path}
                    lines={lines}
                    stats={{
                        added: lines.filter((line) => line.kind === "add").length,
                        removed: lines.filter((line) => line.kind === "del").length,
                    }}
                    wrap
                />
            </>
        ),
    };
}

const SEARCH_ARGUMENT_LABELS: readonly (readonly [string, string])[] = [
    ["path", "In"],
    ["glob", "Files"],
    ["type", "File type"],
    ["output_mode", "Show"],
];

function searchPreview(tool: ConversationToolCall, args: JsonRecord | undefined): KnownToolPreview {
    const result = record(tool.result);
    const found = text(result, "text") ?? text(result, "output") ?? resultWords(tool.result);
    const files = count(result, "numFiles") ?? count(result, "matched_files");
    const matches = count(result, "match_count");
    const pattern = text(args, "pattern");
    return {
        title: tool.toolName === "Glob" || tool.toolName === "find" ? "Find files" : "Search",
        ...(pattern === undefined ? {} : { detail: pattern }),
        icon: "search",
        fills: false,
        body: (
            <>
                {pattern === undefined ? null : (
                    <PreviewSection label="Pattern">
                        <Mono text={pattern} />
                    </PreviewSection>
                )}
                <Facts
                    rows={SEARCH_ARGUMENT_LABELS.flatMap(([key, label]) => {
                        const value = args?.[key];
                        return value === undefined || value === null || value === ""
                            ? []
                            : [[label, jsonText(value)] as const];
                    })}
                />
                <Meta
                    items={[
                        files !== undefined && plural(files, "file", "files"),
                        matches !== undefined && plural(matches, "match", "matches"),
                        result?.truncated === true && "Truncated",
                    ]}
                />
                {found === undefined || tool.failed ? null : (
                    <PreviewSection label="Found">
                        <Mono text={found} />
                    </PreviewSection>
                )}
            </>
        ),
    };
}

function pythonPreview(tool: ConversationToolCall, args: JsonRecord | undefined): KnownToolPreview {
    const result = record(tool.result);
    const code = text(args, "code");
    const output = text(result, "output");
    const error = text(result, "error");
    return {
        title: "Python",
        icon: "code",
        fills: false,
        body: (
            <>
                {code === undefined ? null : (
                    <PreviewSection label="Code">
                        <CodeBlock lang="python" text={code} wrap />
                    </PreviewSection>
                )}
                <Meta
                    items={[
                        args?.network === true && "Network",
                        (args?.elevated === true || tool.elevated) && "Elevated",
                        Array.isArray(args?.secrets) &&
                            args.secrets.length > 0 &&
                            plural(args.secrets.length, "secret", "secrets"),
                    ]}
                />
                {output ? (
                    <PreviewSection label="Output">
                        <Mono text={output} />
                    </PreviewSection>
                ) : null}
                {error && !tool.failed ? (
                    <PreviewSection label="Error">
                        <Mono failed text={error} />
                    </PreviewSection>
                ) : null}
            </>
        ),
    };
}

function webPreview(
    tool: ConversationToolCall,
    args: JsonRecord | undefined,
): KnownToolPreview | undefined {
    const query = text(args, "query");
    const url = text(args, "url");
    if (query === undefined && url === undefined) return undefined;
    const words = resultWords(tool.result);
    return {
        title: url === undefined ? "Web search" : "Fetch page",
        icon: "globe",
        fills: false,
        body: (
            <>
                <PreviewSection label={url === undefined ? "Query" : "Page"}>
                    <Mono text={url ?? query!} />
                </PreviewSection>
                {tool.failed ? null : words !== undefined ? (
                    <PreviewSection label="Result">
                        <Mono text={words} />
                    </PreviewSection>
                ) : tool.result === undefined ? null : (
                    <JsonFields label="Result" value={tool.result} />
                )}
            </>
        ),
    };
}

/**
 * The inspector's own drawing of a tool it knows by name, for a call that
 * carries no presentation: its arguments and its structured result read as
 * what they are — a command and its output, a file and its lines — instead of
 * JSON. Undefined for any other tool, which the generic body draws.
 */
export function knownToolPreview(tool: ConversationToolCall): KnownToolPreview | undefined {
    const args = record(tool.arguments);
    const name = tool.toolName;
    const known = SHELL_TOOLS.has(name)
        ? shellPreview(tool, args)
        : SHELL_OUTPUT_TOOLS.has(name)
          ? shellSessionPreview(tool, args, false)
          : SHELL_INPUT_TOOLS.has(name)
            ? shellSessionPreview(tool, args, true)
            : READ_TOOLS.has(name)
              ? readPreview(tool, args)
              : WRITE_TOOLS.has(name)
                ? writePreview(tool, args)
                : EDIT_TOOLS.has(name)
                  ? editPreview(tool, args)
                  : SEARCH_TOOLS.has(name)
                    ? searchPreview(tool, args)
                    : name === "python"
                      ? pythonPreview(tool, args)
                      : name === "web_search" || name === "web_fetch"
                        ? webPreview(tool, args)
                        : undefined;
    if (known === undefined) return undefined;
    return {
        ...known,
        body: (
            <>
                {known.body}
                <Failure tool={tool} />
            </>
        ),
    };
}
