import type {
    ConversationActivityPresentation,
    ConversationFileDiff,
    ConversationToolCall,
} from "happy-desktop-state";
import { DiffSnippet, type DiffLine } from "./DiffSnippet";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";

export interface ToolCallPreviewProps {
    readonly tool: ConversationToolCall;
}

function humanize(name: string): string {
    return name
        .replace(/[_-]+/gu, " ")
        .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
        .replace(/\s+/gu, " ")
        .trim()
        .replace(/^./u, (character) => character.toUpperCase());
}

function json(value: ConversationToolCall["arguments"]): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function diffLines(file: ConversationFileDiff): DiffLine[] {
    const lines: DiffLine[] = [];
    for (const hunk of file.hunks) {
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
    }
    return lines;
}

function statusLabel(tool: ConversationToolCall): string {
    if (tool.status === "awaitingApproval") return "Awaiting approval";
    if (tool.status === "running") return "Running";
    if (tool.status === "stopped") return "Stopped";
    return tool.failed || tool.status === "failed" ? "Failed" : "Completed";
}

function presentationTitle(
    presentation: ConversationActivityPresentation | undefined,
): "File edit" | "Terminal" | "Sub-agent spawn" | "Slice" | "Tool call" {
    if (presentation?.type === "agentSpawn") return "Sub-agent spawn";
    if (presentation?.type === "fileDiff") return "File edit";
    if (presentation?.type === "slice") return "Slice";
    if (
        presentation?.type === "execCommand" ||
        presentation?.type === "backgroundTerminalInteraction"
    )
        return "Terminal";
    return "Tool call";
}

/**
 * Full, read-only body of one tool invocation. Rich producers render as a terminal
 * transcript or file diff; everything else keeps the exact typed arguments and
 * result text visible instead of guessing a tool-specific interface.
 */
export function ToolCallPreview(props: ToolCallPreviewProps) {
    const { tool } = props;
    const presentation = tool.presentation;
    const title = presentationTitle(presentation);
    const command =
        presentation?.type === "execCommand" ||
        presentation?.type === "backgroundTerminalInteraction"
            ? presentation.command
            : undefined;
    const terminalBody =
        presentation?.type === "execCommand"
            ? presentation.output
            : presentation?.type === "backgroundTerminalInteraction"
              ? presentation.input
              : undefined;
    return (
        <section
            className="happy-tool-call-preview"
            data-happy-desktop-ui="tool-call-preview"
            data-kind={presentation?.type ?? "generic"}
        >
            <header className="happy-tool-call-preview__heading">
                <span aria-hidden="true" className="happy-tool-call-preview__icon">
                    <Icon
                        name={
                            title === "Terminal"
                                ? "terminal"
                                : title === "File edit"
                                  ? "doc"
                                  : title === "Sub-agent spawn"
                                    ? "agents"
                                    : title === "Slice"
                                      ? "filter"
                                      : "zap"
                        }
                        size={16}
                    />
                </span>
                <span className="happy-tool-call-preview__heading-copy">
                    <strong>{title}</strong>
                    <span>
                        {presentation?.type === "agentSpawn"
                            ? (presentation.model?.name ?? "Model unresolved")
                            : humanize(tool.toolName)}
                    </span>
                </span>
                <span
                    className="happy-tool-call-preview__status"
                    data-failed={tool.failed || tool.status === "failed" ? "" : undefined}
                >
                    {statusLabel(tool)}
                </span>
            </header>
            <ScrollArea
                axes="both"
                className="happy-tool-call-preview__scroll"
                viewportClassName="happy-tool-call-preview__scroll-viewport"
            >
                <div className="happy-tool-call-preview__content">
                    {presentation?.type === "agentSpawn" ? (
                        <>
                            {presentation.model ? (
                                <>
                                    <section className="happy-tool-call-preview__section">
                                        <span className="happy-tool-call-preview__label">
                                            Provider ID
                                        </span>
                                        <pre className="happy-tool-call-preview__arguments">
                                            {presentation.model.providerId}
                                        </pre>
                                    </section>
                                    <section className="happy-tool-call-preview__section">
                                        <span className="happy-tool-call-preview__label">
                                            Model ID
                                        </span>
                                        <pre className="happy-tool-call-preview__arguments">
                                            {presentation.model.modelId}
                                        </pre>
                                    </section>
                                </>
                            ) : null}
                            {presentation.agentId ? (
                                <section className="happy-tool-call-preview__section">
                                    <span className="happy-tool-call-preview__label">Agent ID</span>
                                    <pre className="happy-tool-call-preview__arguments">
                                        {presentation.agentId}
                                    </pre>
                                </section>
                            ) : null}
                        </>
                    ) : null}
                    {command !== undefined ? (
                        <section className="happy-tool-call-preview__section">
                            <span className="happy-tool-call-preview__label">Command</span>
                            <pre className="happy-tool-call-preview__command">{command}</pre>
                        </section>
                    ) : null}
                    {terminalBody !== undefined ? (
                        <ScrollArea
                            className="happy-tool-call-preview__terminal"
                            viewportClassName="happy-tool-call-preview__terminal-viewport"
                        >
                            <pre className="happy-tool-call-preview__terminal-content">
                                {terminalBody || "(no output)"}
                            </pre>
                        </ScrollArea>
                    ) : null}
                    {presentation?.type === "fileDiff"
                        ? presentation.files.map((file) => (
                              <DiffSnippet
                                  file={file.path}
                                  key={file.path}
                                  lines={diffLines(file)}
                                  stats={{
                                      added: file.added ?? 0,
                                      removed: file.deleted ?? 0,
                                  }}
                                  // The inspector is a narrow column, so a diff
                                  // that scrolled sideways here would keep most
                                  // of every line it shows out of sight.
                                  wrap
                              />
                          ))
                        : null}
                    {presentation?.type === "exploration" ? (
                        <section className="happy-tool-call-preview__section">
                            <span className="happy-tool-call-preview__label">Operations</span>
                            <div className="happy-tool-call-preview__operations">
                                {presentation.operations.map((operation, index) => (
                                    <div
                                        className="happy-tool-call-preview__operation"
                                        key={`${operation.kind}:${index}`}
                                    >
                                        <span>{humanize(operation.kind)}</span>
                                        <code>
                                            {operation.kind === "list"
                                                ? operation.target
                                                : operation.kind === "read"
                                                  ? operation.name
                                                  : operation.command}
                                        </code>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}
                    {presentation === undefined || presentation.type === "agentSpawn" ? (
                        <section className="happy-tool-call-preview__section">
                            <span className="happy-tool-call-preview__label">Arguments</span>
                            <pre className="happy-tool-call-preview__arguments">
                                {json(tool.arguments)}
                            </pre>
                        </section>
                    ) : null}
                    {tool.display || tool.failure?.message ? (
                        <section className="happy-tool-call-preview__section">
                            <span className="happy-tool-call-preview__label">
                                {tool.failed ? "Failure" : "Result"}
                            </span>
                            <pre
                                className="happy-tool-call-preview__result"
                                data-failed={tool.failed ? "" : undefined}
                            >
                                {tool.failure?.message ?? tool.display}
                            </pre>
                        </section>
                    ) : null}
                </div>
            </ScrollArea>
        </section>
    );
}
