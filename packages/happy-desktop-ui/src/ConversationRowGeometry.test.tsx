import { useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import type {
    ConversationAuthor,
    ConversationEntry,
    ConversationMessageEntry,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import { server } from "vitest/browser";
import "./styles.css";
import { ConversationEntryView } from "./ConversationEntryView";
import {
    contentWidth,
    conversationRowHeight,
    conversationRowHeightCacheCreate,
} from "./conversationRowHeight";
import {
    conversationAgentRowStartsGroup,
    conversationEntryPrecedesActivity,
    conversationEntryResumesAfterActivity,
    conversationMessageClosedByStatus,
    conversationMessageGrouped,
    conversationTurnStatusAfterActivity,
    conversationTurnStatusStartsGroup,
} from "./conversationMessageGrouped";
import { MessageList } from "./Message";
import {
    messageTextLayoutFontGenerationGet,
    messageTextLayoutFontGenerationSubscribe,
} from "./messageTextLayout";
import { createRenderer } from "./testing";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const nextLayout = async () => {
    await nextFrame();
    await nextFrame();
};
/* WebKit retains fractional font-box remainders across overflowing Markdown
   formatting contexts. The modeled and painted surfaces stay within two CSS
   pixels in aggregate; a missed wrapped line is at least 18px and remains
   unambiguously visible. */
const GEOMETRY_TOLERANCE = 2.1;

const agent: ConversationAuthor = {
    id: "geometry-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};

function message(id: string, sender: "agent" | "human", text: string): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "geometry",
            sequence: id,
            changePts: id,
            sender:
                sender === "agent"
                    ? agent
                    : {
                          id: "geometry-reader",
                          displayName: "Steve",
                          username: "steve",
                          kind: "human",
                      },
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-08-22T12:34:00.000Z",
        },
    };
}

const richText = [
    "# Release **verification** with `inline-code`",
    "",
    "The release is complete, and the **authoritative manifest** now contains `arm64`, *x64*, ~~obsolete metadata~~, and [the updater metadata](https://example.com/releases/stable) for both channels.  ",
    "This sentence follows a forced Markdown line break.",
    "",
    "The rendered shell note keeps `Nothing carries over between calls: a directory change or a variable set by one command is gone by the next.` inline before the surrounding prose continues in the same paragraph.",
    "",
    "> The transcript must keep the same geometry with **formatted quote text** and `quoted_inline_code`.",
    ">",
    "> A second quoted paragraph proves nested block spacing instead of only one default paragraph margin.",
    "",
    "- TypeScript packages compile at the final revision.",
    "  - The nested package result contains `happy-desktop-ui`.",
    "  - The second nested result is deliberately long enough to wrap at several narrow widths.",
    "- The updater feed names the same release.",
    "- [x] The stable artifacts exist.",
    "- [ ] The nightly artifacts stay independent.",
    "",
    "Commit | Result | Verification detail",
    ":-- | --: | :--",
    "`5fe0dd31` | **Passed** | Restart progress and package publication",
    "`e200a7da` | Passed | Parallel provider sessions remain stable across the deliberately-wide-table-content boundary",
    "`10437d0f` | Passed | Release artifacts and manifests published",
    "",
    "```ts",
    "const release = await publish({ channel: 'stable', architectures: ['arm64', 'x64'], immutableArtifactIdentity: 'happy-desktop-release-artifact-with-an-intentionally-unbroken-identifier-that-must-overflow-the-code-scrollport-on-every-supported-message-width' });",
    "",
    "await verifyManifest(release);",
    "```",
    "",
    "~~~text",
    "A tilde-fenced block follows the same non-wrapping code geometry.",
    "~~~",
    "",
    "    const indentedCode = 'CommonMark also renders this as a code block';",
    "    await verify(indentedCode);",
    "",
    "A footnote reference is numbered from the parsed document[^geometry], and the same definition can be cited twice[^geometry], while <b>raw tags</b> stay inert.",
    "",
    "[^geometry]: Footnote **details** contain `inline-code`, a [safe link](https://example.com/geometry), and enough prose to wrap when its generated return markers share a narrow line.",
    "",
    "---",
    "",
    "The final paragraph is deliberately long enough to cross several wrapping thresholds while the container narrows one pixel at a time.",
].join("\n");

const shellOutput = [
    "> pnpm release --channel stable --architecture arm64 --architecture x64",
    "packages/happy-desktop-state: typecheck passed",
    "packages/happy-desktop-ui: production bundle emitted with updater metadata and release manifests",
    "artifacts/Happy-arm64.dmg",
    "artifacts/Happy-x64.dmg",
    "release complete",
].join("\n");

/* A real completion-boundary message. Unlike the synthetic Markdown stress
   body above, this is shaped like the long implementation summaries that
   exposed the visible overlap with the following "Completed in…" row. */
const completionText = [
    "Fixed.",
    "",
    "- Transcript sizing now observes only the scroll container and rebuilds the complete keyed size model when its effective width or semantic dependencies change. No row/cell uses `measureElement`, `resizeItem`, or persisted DOM measurements: [Message.tsx](/Users/steve/Developer/happy-desktop/packages/happy-desktop-ui/src/Message.tsx:943).",
    "- Markdown rendering and estimation share the same remark/GFM AST: [messageMarkdownAst.ts](/Users/steve/Developer/happy-desktop/packages/happy-desktop-ui/src/messageMarkdownAst.ts:5).",
    "- The estimator explicitly handles formatting, hard breaks, nested quotes/lists, tasks, tables, inline and fenced/tilde/indented code, rules, footnotes, images, and inert raw HTML: [messageTextLayout.ts](/Users/steve/Developer/happy-desktop/packages/happy-desktop-ui/src/messageTextLayout.ts:252).",
    "- The requested test covers rich text and output rows, each with and without identity, at every width from 1500px through 200px: [ConversationRowGeometry.test.tsx](/Users/steve/Developer/happy-desktop/packages/happy-desktop-ui/src/ConversationRowGeometry.test.tsx:227).",
    "",
    "Validation passed:",
    "",
    "- 5,204 geometry checks per engine",
    "- Chromium and WebKit",
    "- UI/state typechecks",
    "- UI lint and production build",
    "- `git diff --check`",
    "",
    "Other ResizeObservers remain for the failed-generation marker and shared scrollbar internals; neither supplies transcript row sizes. The browser run still reports the pre-existing Scrollbar ResizeObserver-loop warning, but all geometry assertions pass. Existing image/icon worktree changes were left untouched.",
].join("\n");

const reviewText = [
    "## Review: callbacks, races, and branches",
    "",
    "1. **Modal cleanup** - remove the obsolete modal and its message case.",
    "",
    "2. **Permission callback** - the Claude permission-callback needed there predates this branch.",
    "",
    "   - The verbose block-race explanation belongs to the earlier implementation.",
    "   - The follow-up keeps `permissionResult` and delivery ordered.",
    "",
    "3. ~~Old path~~ - no compatibility branch remains.",
    "",
    "Suggested order: delete the modal and message case, then (separately) move the callback. Want me to start on the first two?",
].join("\n");

const richLeading = message("rich-leading", "agent", richText);
const richGrouped = message("rich-grouped", "agent", richText);
const reviewLeading = message("review-leading", "agent", reviewText);
const agentPrelude = message("agent-prelude", "agent", "I checked the release inputs.");
const humanBoundary = message("human-boundary", "human", "Please verify the release.");
const shellLeading: ConversationEntry = {
    kind: "agentActivity",
    id: "shell-leading",
    sequence: "shell-leading",
    activity: {
        kind: "shell",
        command: "pnpm release",
        output: shellOutput,
        exitCode: 0,
        running: false,
        timedOut: false,
    },
};
const shellPlain: ConversationEntry = {
    ...shellLeading,
    id: "shell-plain",
    sequence: "shell-plain",
};
const completionLeading = message("completion-leading", "agent", completionText);
const completionStreaming: ConversationMessageEntry = {
    ...completionLeading,
    message: {
        ...completionLeading.message,
        generationStatus: "streaming",
        text: "Fixed.\n\n- Transcript sizing is being verified.",
    },
};
const completionWithTrace: ConversationMessageEntry = {
    ...completionLeading,
    message: {
        ...completionLeading.message,
        agentTrace: {
            turnId: "completion-turn",
            agentUserId: agent.id,
            status: "complete",
            entryCount: 8,
            toolCallCount: 4,
            totalTokens: 12_345,
            subagents: [],
            backgroundTerminals: [],
        },
    },
};
const completionWithUntimedTrace: ConversationMessageEntry = {
    ...completionWithTrace,
    message: {
        ...completionWithTrace.message,
        createdAt: "",
        id: "completion-untimed-trace",
        sequence: "completion-untimed-trace",
    },
};
const completionStatus: ConversationEntry = {
    kind: "turnStatus",
    id: "completion-status",
    sequence: "completion-status",
    status: "complete",
    reason: "completed",
    durationMs: 44 * 60_000 + 51_000,
    copyText: completionText,
};
const failureNotice: ConversationEntry = {
    kind: "notice",
    id: "failure-notice",
    sequence: "failure-notice",
    variant: "notice",
    level: "error",
    title: "Failure",
    text: "You've hit your Codex usage limit on the ChatGPT Pro plan. Try again at Aug 24, 2026 at 11:37 PM.",
};
const failureStatus: ConversationEntry = {
    kind: "turnStatus",
    id: "failure-status",
    sequence: "failure-status",
    status: "failed",
    reason: "error",
    durationMs: 1_000,
};

type Specimen = {
    readonly entries: readonly ConversationEntry[];
    readonly name: string;
    readonly targetIndex: number;
};

const specimens: readonly Specimen[] = [
    { entries: [richLeading], name: "rich-with-identity", targetIndex: 0 },
    { entries: [agentPrelude, richGrouped], name: "rich-without-identity", targetIndex: 1 },
    { entries: [humanBoundary, shellLeading], name: "output-with-identity", targetIndex: 1 },
    { entries: [agentPrelude, shellPlain], name: "output-without-identity", targetIndex: 1 },
    {
        entries: [completionLeading, completionStatus],
        name: "completion-boundary",
        targetIndex: 0,
    },
    {
        entries: [agentPrelude, completionWithTrace, completionStatus],
        name: "traced-completion-boundary",
        targetIndex: 1,
    },
    {
        entries: [agentPrelude, completionWithUntimedTrace, completionStatus],
        name: "untimed-traced-completion-boundary",
        targetIndex: 1,
    },
    {
        entries: [reviewLeading, completionStatus],
        name: "review-completion-boundary",
        targetIndex: 0,
    },
    {
        entries: [humanBoundary, failureNotice, failureStatus],
        name: "failure-boundary",
        targetIndex: 1,
    },
];

function GeometrySpecimen(props: Specimen & { readonly width: number }) {
    const [cache] = useState(conversationRowHeightCacheCreate);
    const fontGeneration = useSyncExternalStore(
        messageTextLayoutFontGenerationSubscribe,
        messageTextLayoutFontGenerationGet,
        messageTextLayoutFontGenerationGet,
    );
    return (
        <div
            className="happy-conversation"
            data-testid={`${props.name}-container`}
            style={{ flex: "none", height: 440, width: props.width }}
        >
            <MessageList
                estimateDependencies={[props.entries]}
                estimateRowSize={(index, width) =>
                    index === props.entries.length
                        ? 1
                        : conversationRowHeight(
                              props.entries,
                              index,
                              {
                                  activityTreatment: "detailed",
                                  expanded:
                                      props.entries[index]?.kind === "agentActivity" &&
                                      props.entries[index].activity.kind === "shell",
                                  surface: "conversation",
                                  viewerId: "geometry-reader",
                                  width,
                              },
                              cache,
                          )
                }
                estimateRowWidth={contentWidth}
                estimateVersion={fontGeneration}
                virtualize
            >
                {props.entries.map((entry, index) => {
                    const target = index === props.targetIndex;
                    return (
                        <ConversationEntryView
                            activityAuthor={
                                conversationAgentRowStartsGroup(props.entries, index) ||
                                conversationTurnStatusStartsGroup(props.entries, index)
                                    ? agent
                                    : undefined
                            }
                            activityTreatment="detailed"
                            className={
                                [
                                    entry.kind === "turnStatus" &&
                                    conversationTurnStatusAfterActivity(props.entries, index)
                                        ? "happy-turn-status--after-trace"
                                        : undefined,
                                    conversationEntryResumesAfterActivity(props.entries, index)
                                        ? "happy-conversation__resumed"
                                        : undefined,
                                    conversationEntryPrecedesActivity(props.entries, index)
                                        ? "happy-conversation__continues"
                                        : undefined,
                                    conversationMessageClosedByStatus(props.entries, index)
                                        ? "happy-conversation__closing"
                                        : undefined,
                                ]
                                    .filter(Boolean)
                                    .join(" ") || undefined
                            }
                            data-testid={target ? props.name : undefined}
                            entry={entry}
                            grouped={
                                entry.kind === "message"
                                    ? conversationMessageGrouped(props.entries, index)
                                    : undefined
                            }
                            key={entry.kind === "message" ? entry.message.id : entry.id}
                            onFileOpen={() => {}}
                            rowExpanded={entry.kind === "agentActivity"}
                            viewerId="geometry-reader"
                        />
                    );
                })}
                <div data-testid={`${props.name}-sentinel`} key="sentinel" style={{ height: 1 }} />
            </MessageList>
        </div>
    );
}

function expectModeledRowsMatchPaint(container: Element, count: number, label: string) {
    for (let index = 0; index < count; index += 1) {
        const row = container.querySelector<HTMLElement>(
            `.happy-message-list__virtual-row[data-index="${String(index)}"]`,
        );
        const next = container.querySelector<HTMLElement>(
            `.happy-message-list__virtual-row[data-index="${String(index + 1)}"]`,
        );
        expect(row, `${label} row ${String(index)}`).not.toBeNull();
        expect(next, `${label} successor ${String(index)}`).not.toBeNull();
        const rowBounds = row!.getBoundingClientRect();
        const modeledHeight = next!.getBoundingClientRect().top - rowBounds.top;
        expect(
            Math.abs(rowBounds.height - modeledHeight),
            `${label} row ${String(index)}: painted ${String(rowBounds.height)}px, modeled ${String(modeledHeight)}px`,
        ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
    }
}

it.skipIf(server.browser === "firefox")(
    "keeps the completion boundary exact while a streamed turn settles",
    async () => {
        const view = createRenderer();
        let entriesUpdate!: (entries: readonly ConversationEntry[]) => void;
        function CompletionHarness() {
            const [entries, setEntries] = useState<readonly ConversationEntry[]>([
                completionStreaming,
            ]);
            entriesUpdate = setEntries;
            return (
                <GeometrySpecimen
                    entries={entries}
                    name="live-completion-boundary"
                    targetIndex={0}
                    width={360}
                />
            );
        }

        view.render(CompletionHarness, { width: 360, height: 440 });
        await view.ready();
        await document.fonts.ready;
        await nextLayout();

        const container = view.$('[data-testid="live-completion-boundary-container"]').element;
        flushSync(() => entriesUpdate([completionLeading]));
        expectModeledRowsMatchPaint(container, 1, "final agent message");

        flushSync(() => entriesUpdate([completionLeading, completionStatus]));
        expectModeledRowsMatchPaint(container, 2, "settled completion");
        await nextFrame();
        expectModeledRowsMatchPaint(container, 2, "first painted completion frame");

        flushSync(() => entriesUpdate([agentPrelude, completionWithTrace, completionStatus]));
        expectModeledRowsMatchPaint(container, 3, "grouped traced completion");
        await nextFrame();
        expectModeledRowsMatchPaint(container, 3, "first painted traced-completion frame");
    },
);

it.skipIf(server.browser === "firefox")(
    "keeps modeled rich-message and output-row heights exact at every container width",
    async () => {
        const view = createRenderer();
        let widthUpdate!: (width: number) => void;
        function GeometryHarness() {
            const [width, setWidth] = useState(1500);
            widthUpdate = setWidth;
            return (
                <div
                    style={{
                        background: "#f5f5f5",
                        display: "flex",
                        flexDirection: "column",
                        width: "100%",
                    }}
                >
                    {specimens.map((specimen) => (
                        <GeometrySpecimen {...specimen} key={specimen.name} width={width} />
                    ))}
                </div>
            );
        }

        view.render(GeometryHarness, { width: 1500, height: specimens.length * 440 });
        await view.ready();
        await document.fonts.ready;
        await nextLayout();

        for (const specimen of specimens.filter((candidate) =>
            candidate.name.startsWith("rich-"),
        )) {
            const target = view.$(`[data-testid="${specimen.name}"]`).element;
            expect(target.querySelectorAll("table"), `${specimen.name} GFM table`).toHaveLength(1);
            expect(target.querySelectorAll("pre"), `${specimen.name} code blocks`).toHaveLength(3);
            expect(
                target.querySelectorAll("p > code, li code, blockquote code, h1 code"),
                `${specimen.name} inline code`,
            ).not.toHaveLength(0);
            const flowingCode = [...target.querySelectorAll<HTMLElement>("p > code")].find(
                (element) => element.textContent?.startsWith("Nothing carries over between calls"),
            );
            expect(flowingCode, `${specimen.name} long inline code`).not.toBeUndefined();
            expect(
                getComputedStyle(flowingCode!).display,
                `${specimen.name} long code stays inline`,
            ).toBe("inline");
            expect(
                flowingCode!.getClientRects().length,
                `${specimen.name} long inline code wraps with its paragraph`,
            ).toBeGreaterThan(1);
            expect(
                target.querySelectorAll('input[type="checkbox"]'),
                `${specimen.name} task list`,
            ).toHaveLength(2);
            expect(
                target.querySelectorAll("blockquote > p"),
                `${specimen.name} quote blocks`,
            ).toHaveLength(2);
            expect(target.querySelectorAll("li > ul"), `${specimen.name} nested list`).toHaveLength(
                1,
            );
            expect(target.querySelectorAll("br"), `${specimen.name} hard break`).toHaveLength(1);
            expect(target.querySelectorAll("hr"), `${specimen.name} thematic break`).toHaveLength(
                1,
            );
            expect(
                target.querySelectorAll("[data-footnotes]"),
                `${specimen.name} footnotes`,
            ).toHaveLength(1);
            expect(
                target.querySelectorAll("[data-footnote-ref]"),
                `${specimen.name} footnote references`,
            ).toHaveLength(2);
            expect(
                target.querySelectorAll("[data-footnote-backref]"),
                `${specimen.name} footnote backreferences`,
            ).toHaveLength(2);
            expect(target.querySelector("b"), `${specimen.name} raw HTML remains inert`).toBeNull();
            expect(target.textContent, `${specimen.name} raw HTML text`).toContain("raw tags");
            const tableScrollport = target.querySelector<HTMLElement>(
                ".happy-message__table-scroll-viewport",
            );
            const codeScrollports = [
                ...target.querySelectorAll<HTMLElement>(".happy-message__code-block-viewport"),
            ];
            expect(tableScrollport, `${specimen.name} table scrollport`).not.toBeNull();
            expect(
                tableScrollport!.scrollWidth,
                `${specimen.name} wide table horizontally overflows`,
            ).toBeGreaterThan(tableScrollport!.clientWidth);
            expect(
                codeScrollports.some(
                    (scrollport) => scrollport.scrollWidth > scrollport.clientWidth,
                ),
                `${specimen.name} long code horizontally overflows`,
            ).toBe(true);
        }

        for (let width = 1500; width >= 200; width -= 1) {
            flushSync(() => widthUpdate(width));
            await nextFrame();
            for (const specimen of specimens) {
                const container = view.$(`[data-testid="${specimen.name}-container"]`).element;
                const scrollport = container.querySelector<HTMLElement>(
                    "[data-scrollbar-viewport]",
                );
                expect(scrollport, `${specimen.name} scrollport`).not.toBeNull();
                for (let index = 0; index < specimen.entries.length; index += 1) {
                    const row = container.querySelector<HTMLElement>(
                        `.happy-message-list__virtual-row[data-index="${String(index)}"]`,
                    );
                    const next = container.querySelector<HTMLElement>(
                        `.happy-message-list__virtual-row[data-index="${String(index + 1)}"]`,
                    );
                    expect(
                        row,
                        `${specimen.name} row ${String(index)} at ${String(width)}px`,
                    ).not.toBeNull();
                    expect(
                        next,
                        `${specimen.name} successor ${String(index)} at ${String(width)}px`,
                    ).not.toBeNull();
                    const rowBounds = row!.getBoundingClientRect();
                    const modeledHeight = next!.getBoundingClientRect().top - rowBounds.top;
                    expect(
                        Math.abs(rowBounds.height - modeledHeight),
                        `${specimen.name} row ${String(index)} at ${String(width)}px: painted ${String(rowBounds.height)}px, modeled ${String(modeledHeight)}px`,
                    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
                    expect(
                        rowBounds.width,
                        `${specimen.name} row ${String(index)} effective width at ${String(width)}px`,
                    ).toBe(Math.min(scrollport!.clientWidth, 880));
                }
            }
        }
    },
    60_000,
);
