import type {
    ConversationActivityPresentation,
    ConversationFileDiff,
    ConversationToolCall,
} from "happy-desktop-state";
import { happyAgentArtifactTypeLabel } from "happy-desktop-state";
import { ConversationMedia } from "./ConversationMedia";
import { conversationMediaVisible } from "./conversationInlineLayouts";
import { codeBlockLanguage } from "./codeBlockLanguage";
import { DiffSnippet, type DiffLine, type DiffSnippetSource } from "./DiffSnippet";
import { Icon, type IconName } from "./Icon";
import { ArtifactTypeGlyph } from "./pages/artifacts/artifactPresentation";
import { ResultCard } from "./ResultCard";
import { ScrollArea } from "./Scrollbar";
import {
    humanizeToolKey,
    JsonFields,
    knownToolPreview,
    PreviewSection,
    resultWords,
} from "./toolCallPreviewKnown";

export interface ToolCallPreviewProps {
    readonly tool: ConversationToolCall;
}

/**
 * A created file as the file it is: its lines as one text, highlighted in the
 * language the producer named or the one its path implies.
 */
function createdFileSource(file: ConversationFileDiff): DiffSnippetSource {
    const lang = codeBlockLanguage(file.language);
    return {
        name: file.path,
        text: file.hunks.flatMap((hunk) => hunk.lines.map((line) => line.text)).join("\n"),
        ...(lang === undefined ? {} : { lang }),
    };
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
): "File edit" | "Terminal" | "Sub-agent spawn" | "Presented files" | "Artifact" | "Tool call" {
    if (presentation?.type === "agentSpawn") return "Sub-agent spawn";
    if (presentation?.type === "media") return "Presented files";
    if (presentation?.type === "artifact") return "Artifact";
    if (presentation?.type === "fileDiff") return "File edit";
    if (
        presentation?.type === "execCommand" ||
        presentation?.type === "backgroundTerminalInteraction"
    )
        return "Terminal";
    return "Tool call";
}

function presentationIcon(title: ReturnType<typeof presentationTitle>): IconName {
    if (title === "Terminal") return "terminal";
    if (title === "File edit" || title === "Presented files") return "doc";
    if (title === "Artifact") return "package";
    if (title === "Sub-agent spawn") return "agents";
    return "zap";
}

/** The result read as words where it is words, else as its own labeled fields. */
function ResultSection(props: { tool: ConversationToolCall; shown?: string }) {
    const { tool } = props;
    const failed = tool.failed || tool.status === "failed";
    const message = tool.failure?.message;
    const words =
        message ??
        resultWords(tool.result) ??
        (tool.result === undefined ? tool.display : undefined);
    // A terminal already shows the output its result repeats.
    if (words !== undefined && words === props.shown) return null;
    if (words) {
        return (
            <PreviewSection label={failed ? "Failure" : "Result"}>
                <pre
                    className="happy-tool-call-preview__result"
                    data-failed={failed ? "" : undefined}
                >
                    {words}
                </pre>
            </PreviewSection>
        );
    }
    if (tool.result === undefined) return null;
    return <JsonFields failed={failed} label={failed ? "Failure" : "Result"} value={tool.result} />;
}

/**
 * Full, read-only body of one tool invocation. Rich producers render as a terminal
 * transcript or file diff; a tool the inspector knows by name reads its own
 * arguments and structured result; everything else shows its arguments and
 * result as labeled fields, text kept as text.
 */
export function ToolCallPreview(props: ToolCallPreviewProps) {
    const { tool } = props;
    const presentation = tool.presentation;
    const title = presentationTitle(presentation);
    /* An absurdly tall tree is broken, and its files fall back to the automatic layout. */
    const mediaLayout =
        presentation?.type === "media"
            ? conversationMediaVisible(presentation.items, presentation.layout, undefined).layout
            : undefined;
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
    const known = presentation === undefined ? knownToolPreview(tool) : undefined;
    const generic = known === undefined && title === "Tool call";
    const heading = known?.title ?? (generic ? humanizeToolKey(tool.toolName) : title);
    const detail =
        presentation?.type === "agentSpawn"
            ? (presentation.model?.name ?? "Model unresolved")
            : (tool.summary ??
              known?.detail ??
              (generic ? "Tool call" : humanizeToolKey(tool.toolName)));
    return (
        <section
            className="happy-tool-call-preview"
            data-fills={known?.fills ? "" : undefined}
            data-happy-desktop-ui="tool-call-preview"
            data-kind={presentation?.type ?? "generic"}
            data-tool={known === undefined ? undefined : tool.toolName}
        >
            <header className="happy-tool-call-preview__heading">
                <span aria-hidden="true" className="happy-tool-call-preview__icon">
                    <Icon name={known?.icon ?? presentationIcon(title)} size={16} />
                </span>
                <span className="happy-tool-call-preview__heading-copy">
                    <strong>{heading}</strong>
                    <span>{detail}</span>
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
                    {known?.body}
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
                                  {...(file.kind === "add"
                                      ? { created: true, source: createdFileSource(file) }
                                      : { lines: diffLines(file) })}
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
                    {presentation?.type === "media" ? (
                        <section className="happy-tool-call-preview__section">
                            <span className="happy-tool-call-preview__label">Files</span>
                            <ConversationMedia
                                items={presentation.items}
                                {...(mediaLayout ? { layout: mediaLayout } : {})}
                            />
                        </section>
                    ) : null}
                    {presentation?.type === "artifact" ? (
                        <section className="happy-tool-call-preview__section">
                            <span className="happy-tool-call-preview__label">Published</span>
                            <ResultCard
                                detail={`${happyAgentArtifactTypeLabel(presentation.artifactType)} · Version ${String(presentation.version)}`}
                                glyph={
                                    <ArtifactTypeGlyph size={20} type={presentation.artifactType} />
                                }
                                title={presentation.title || "Untitled artifact"}
                            />
                        </section>
                    ) : null}
                    {presentation?.type === "exploration" ? (
                        <section className="happy-tool-call-preview__section">
                            <span className="happy-tool-call-preview__label">Operations</span>
                            <div className="happy-tool-call-preview__operations">
                                {presentation.operations.map((operation, index) => (
                                    <div
                                        className="happy-tool-call-preview__operation"
                                        key={`${operation.kind}:${index}`}
                                    >
                                        <span>{humanizeToolKey(operation.kind)}</span>
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
                    {known === undefined &&
                    (presentation === undefined || presentation.type === "agentSpawn") ? (
                        <JsonFields
                            label="Arguments"
                            // The heading already reads the call's description.
                            skip={tool.summaryKind === "description" ? ["description"] : []}
                            value={tool.arguments}
                        />
                    ) : null}
                    {known === undefined ? (
                        <ResultSection
                            tool={tool}
                            {...(terminalBody === undefined ? {} : { shown: terminalBody })}
                        />
                    ) : null}
                </div>
            </ScrollArea>
        </section>
    );
}
