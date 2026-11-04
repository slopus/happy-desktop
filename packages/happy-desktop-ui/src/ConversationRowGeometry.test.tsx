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
    conversationRowHeightCached,
    conversationRowHeightPrepare,
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
import { Message, MessageList } from "./Message";
import {
    markdownBodyHeight,
    messageTextLayoutFontGenerationGet,
    messageTextLayoutFontGenerationSubscribe,
} from "./messageTextLayout";
import { createRenderer } from "./testing";
import goldFiveMinuteLists from "./fixtures/gold-five-minute-lists.txt?raw";
import goldFiveMinuteSse from "./fixtures/gold-five-minute-sse.txt?raw";
import goldSubagentDelegation from "./fixtures/gold-subagent-delegation.txt?raw";
import nestedLinkList from "./fixtures/nested-link-list.txt?raw";
import previewChannelsReport from "./fixtures/preview-channels-report.txt?raw";

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

it.each([
    "",
    "<!-- comment -->",
    "<span></span>",
    "<span> </span>",
    "[<span></span>](https://example.com)",
])("reserves one modeled line for empty ordered and unordered items: %j", async (empty) => {
    const view = createRenderer();
    const texts = [
        `1. First\n\n2. ${empty}\n\n3. Next`,
        `- First\n\n- ${empty}\n\n- Next`,
        `1. First\n2. ${empty}\n3. Next`,
        `- First\n- ${empty}\n- Next`,
    ];
    try {
        view.render(
            () => (
                <>
                    {texts.map((body, index) => (
                        <Message agent author="Happy" body={body} key={index} />
                    ))}
                </>
            ),
            { width: 560, height: 500 },
        );
        await view.ready();
        await nextLayout();
        const bodies = [
            ...view.container.querySelectorAll<HTMLElement>(".happy-message__body--markdown"),
        ];
        expect(bodies).toHaveLength(4);
        for (const [index, body] of bodies.entries()) {
            const items = [...body.querySelectorAll<HTMLElement>("li")];
            expect(items).toHaveLength(3);
            const middle = items[1]!;
            const contentHeight =
                middle.getBoundingClientRect().height -
                parseFloat(getComputedStyle(middle).paddingTop);
            expect(Math.abs(contentHeight - 24)).toBeLessThanOrEqual(1 / 64);
            const modeled = markdownBodyHeight(texts[index]!, body.getBoundingClientRect().width);
            expect(Math.abs(body.getBoundingClientRect().height - modeled)).toBeLessThanOrEqual(
                1 / 64,
            );
            expect(
                items[2]!.getBoundingClientRect().top - middle.getBoundingClientRect().bottom,
            ).toBeGreaterThanOrEqual(0);
        }
    } finally {
        view.destroy();
    }
});

it.each(["##", ">"])(
    "keeps empty list block geometry without adding a text line: %s",
    async (empty) => {
        const view = createRenderer();
        const texts = [`- ${empty}\n- Next`, `1. ${empty}\n2. Next`];
        try {
            view.render(
                () => (
                    <>
                        {texts.map((body, index) => (
                            <Message agent author="Happy" body={body} key={index} />
                        ))}
                    </>
                ),
                { width: 560, height: 500 },
            );
            await view.ready();
            await nextLayout();
            const bodies = [
                ...view.container.querySelectorAll<HTMLElement>(".happy-message__body--markdown"),
            ];
            expect(bodies).toHaveLength(2);
            for (const [index, body] of bodies.entries()) {
                const modeled = markdownBodyHeight(
                    texts[index]!,
                    body.getBoundingClientRect().width,
                );
                expect(modeled).toBe(30);
                expect(Math.abs(body.getBoundingClientRect().height - modeled)).toBeLessThanOrEqual(
                    1 / 64,
                );
            }
        } finally {
            view.destroy();
        }
    },
);

it.each([false, true])(
    "matches an empty paragraph before a nested list (spread: %s)",
    async (spread) => {
        const view = createRenderer();
        const texts = [
            ["-", "-"],
            ["1.", "1."],
            ["-", "1."],
            ["1.", "-"],
        ].map(
            ([outer, inner]) =>
                `${outer} <span></span>\n${spread ? "\n" : ""}${outer === "-" ? "  " : "   "}${inner} Child`,
        );
        try {
            view.render(
                () => (
                    <>
                        {texts.map((body, index) => (
                            <Message agent author="Happy" body={body} key={index} />
                        ))}
                    </>
                ),
                { width: 560, height: 600 },
            );
            await view.ready();
            await nextLayout();
            const bodies = [
                ...view.container.querySelectorAll<HTMLElement>(".happy-message__body--markdown"),
            ];
            expect(bodies).toHaveLength(4);
            for (const [index, body] of bodies.entries()) {
                const modeled = markdownBodyHeight(
                    texts[index]!,
                    body.getBoundingClientRect().width,
                );
                expect(modeled).toBe(spread ? 54 : 48);
                expect(Math.abs(body.getBoundingClientRect().height - modeled)).toBeLessThanOrEqual(
                    1 / 64,
                );
            }
        } finally {
            view.destroy();
        }
    },
);

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

function incomingMessage(id: string, text: string): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "geometry",
            sequence: id,
            changePts: id,
            sender: {
                id: "geometry-collaborator",
                displayName: "Agent",
                username: "agent",
                kind: "human",
            },
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-08-22T12:34:00.000Z",
        },
    };
}

it("publishes a background row only after canonical preparation completes", () => {
    const entries = [
        message("prepare-first", "agent", "First message"),
        message("prepare-body", "agent", "# Heading\n\nParagraph with **words**.\n\n- One\n- Two"),
    ];
    const cache = conversationRowHeightCacheCreate();
    for (const width of [1200, 800, 420, 1200]) {
        const context = { width, surface: "conversation" as const };
        const work = conversationRowHeightPrepare(entries, 1, context, cache);
        const alreadyCached = conversationRowHeightCached(entries, 1, context, cache);
        let steps = 0;
        while (!work.next().done) {
            steps += 1;
            expect(conversationRowHeightCached(entries, 1, context, cache)).toBeUndefined();
        }
        expect(steps).toBe(alreadyCached === undefined ? 4 : 0);
        expect(conversationRowHeightCached(entries, 1, context, cache)).toBe(
            conversationRowHeight(entries, 1, context, conversationRowHeightCacheCreate()),
        );
        expect(conversationRowHeightCached(entries, 1, context, cache)).toBe(
            conversationRowHeight(entries, 1, { ...context, width: contentWidth(width) }),
        );
    }
});

it("finishes interrupted font-generation preparation with fresh canonical row geometry", () => {
    const entries = [message("prepare-font", "agent", "# Heading\n\nText with **styled words**.")];
    const context = { width: 540, surface: "conversation" as const };
    const cache = conversationRowHeightCacheCreate();
    const work = conversationRowHeightPrepare(entries, 0, context, cache);
    expect(work.next().done).toBe(false);
    expect(work.next().done).toBe(false);
    cache.text.generation -= 1;
    cache.generation -= 1;
    while (!work.next().done) {
        /* Finish without publishing interim geometry. */
    }
    expect(conversationRowHeightCached(entries, 0, context, cache)).toBe(
        conversationRowHeight(entries, 0, context, conversationRowHeightCacheCreate()),
    );
    expect(cache.generation).toBe(cache.text.generation);
});

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
const nestedLinkListLeading = message("nested-link-list", "agent", nestedLinkList);
const previewChannelsLeading = message("preview-channels-agent", "agent", previewChannelsReport);
const previewChannelsIncoming = incomingMessage("preview-channels-incoming", previewChannelsReport);
const goldListsLeading = message("gold-lists", "agent", goldFiveMinuteLists);
const goldSseLeading = message("gold-sse", "agent", goldFiveMinuteSse);
const goldDelegationLeading = message("gold-delegation", "agent", goldSubagentDelegation);
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
    { entries: [nestedLinkListLeading], name: "nested-link-list", targetIndex: 0 },
];

const realChatSpecimens: readonly Specimen[] = [
    { entries: [nestedLinkListLeading], name: "nested-link-list-widths", targetIndex: 0 },
    { entries: [previewChannelsLeading], name: "preview-channels-agent", targetIndex: 0 },
    { entries: [previewChannelsIncoming], name: "preview-channels-incoming", targetIndex: 0 },
    { entries: [goldListsLeading], name: "gold-lists", targetIndex: 0 },
    { entries: [goldSseLeading], name: "gold-sse", targetIndex: 0 },
    { entries: [goldDelegationLeading], name: "gold-delegation", targetIndex: 0 },
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

/* Idle refinement has laid out and published every pending row: the list
   stops changing for longer than one batched refinement commit waits. */
const settled = async () => {
    let previous = "";
    let since = performance.now();
    for (let index = 0; index < 400; index += 1) {
        await new Promise<void>((resolve) =>
            typeof requestIdleCallback === "function"
                ? requestIdleCallback(() => resolve(), { timeout: 100 })
                : setTimeout(resolve, 16),
        );
        await nextFrame();
        const rows = [
            ...document.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
        ];
        const current = rows.map((row) => `${row.dataset.index}:${row.style.transform}`).join();
        if (current !== previous) {
            previous = current;
            since = performance.now();
        } else if (performance.now() - since > 600) return;
    }
};
/**
 * The frame contract: every row the scrollport shows is mounted and painted
 * at its modeled height. Rows offscreen may still be pending idle layout.
 */
function expectVisibleRowsMatchPaint(container: Element, label: string) {
    const scrollport = container.querySelector<HTMLElement>("[data-scrollbar-viewport]")!;
    const viewport = scrollport.getBoundingClientRect();
    const rows = [
        ...container.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row"),
    ].sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
    let covered = viewport.top;
    for (const [position, row] of rows.entries()) {
        const bounds = row.getBoundingClientRect();
        if (bounds.bottom <= viewport.top || bounds.top >= viewport.bottom) continue;
        expect(
            bounds.top,
            `${label} row ${row.dataset.index} leaves no gap above it`,
        ).toBeLessThanOrEqual(covered + GEOMETRY_TOLERANCE);
        covered = Math.max(covered, bounds.bottom);
        const next = rows[position + 1];
        if (!next || Number(next.dataset.index) !== Number(row.dataset.index) + 1) continue;
        const modeledHeight = next.getBoundingClientRect().top - bounds.top;
        expect(
            Math.abs(bounds.height - modeledHeight),
            `${label} visible row ${row.dataset.index}: painted ${String(bounds.height)}px, modeled ${String(modeledHeight)}px`,
        ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE);
    }
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
        expectVisibleRowsMatchPaint(container, "final agent message");
        await settled();
        expectModeledRowsMatchPaint(container, 1, "settled final agent message");

        flushSync(() => entriesUpdate([completionLeading, completionStatus]));
        expectVisibleRowsMatchPaint(container, "settled completion");
        await nextFrame();
        expectVisibleRowsMatchPaint(container, "first painted completion frame");
        await settled();
        expectModeledRowsMatchPaint(container, 2, "settled completion rows");

        flushSync(() => entriesUpdate([agentPrelude, completionWithTrace, completionStatus]));
        expectVisibleRowsMatchPaint(container, "grouped traced completion");
        await nextFrame();
        expectVisibleRowsMatchPaint(container, "first painted traced-completion frame");
        await settled();
        expectModeledRowsMatchPaint(container, 3, "settled traced completion");
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
                `${specimen.name} wide table wraps its prose column instead of scrolling`,
            ).toBe(tableScrollport!.clientWidth);
            expect(
                Math.max(
                    ...[...target.querySelectorAll("tr")].map(
                        (row) => row.getBoundingClientRect().height,
                    ),
                ),
                `${specimen.name} wide table row wraps`,
            ).toBeGreaterThan(40);
            expect(
                codeScrollports.some(
                    (scrollport) => scrollport.scrollWidth > scrollport.clientWidth,
                ),
                `${specimen.name} long code horizontally overflows`,
            ).toBe(true);
        }

        for (const specimen of specimens.filter(
            (candidate) => candidate.name === "nested-link-list",
        )) {
            const target = view.$(`[data-testid="${specimen.name}"]`).element;
            const nestedLists = [...target.querySelectorAll<HTMLElement>("li > ul")];
            expect(nestedLists, `${specimen.name} nested lists`).toHaveLength(3);
            for (const [index, nested] of nestedLists.entries()) {
                expect(
                    nested.previousElementSibling?.tagName.toLowerCase(),
                    `${specimen.name} nested list ${String(index)} follows an inline element`,
                ).toBe("a");
                expect(
                    Number.parseFloat(getComputedStyle(nested).marginTop),
                    `${specimen.name} nested list ${String(index)} paints the child-block gap`,
                ).toBe(6);
            }
        }

        // The list mounts offscreen overscan rows one per idle callback. Wait
        // for those rows before measuring every entry and its successor.
        await settled();
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

it.skipIf(server.browser === "firefox")(
    "keeps modeled heights exact for real chat messages at conversation widths",
    async () => {
        /* Conversation measure is 880. Narrower widths still share that
           Markdown body; 400px is omitted here because a classic scrollbar
           in the 440px tester changes clientWidth enough to add wraps that
           the outer `width={400}` style does not. */
        const widths = [880, 720, 560] as const;
        const view = createRenderer();
        let widthUpdate!: (width: number) => void;
        function RealChatHarness() {
            const [width, setWidth] = useState(880);
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
                    {realChatSpecimens.map((specimen) => (
                        <GeometrySpecimen {...specimen} key={specimen.name} width={width} />
                    ))}
                </div>
            );
        }

        view.render(RealChatHarness, {
            width: 880,
            height: realChatSpecimens.length * 440,
        });
        await view.ready();
        await document.fonts.ready;
        await nextLayout();

        const previewTarget = view.$('[data-testid="preview-channels-agent"]').element;
        const nestedLists = [...previewTarget.querySelectorAll<HTMLElement>("li > ul")];
        expect(nestedLists.length, "preview-channels nested lists").toBe(10);
        expect(
            nestedLists.filter((nested) => nested.previousElementSibling?.tagName === "A").length,
            "preview-channels nested lists after a link",
        ).toBe(10);

        for (const width of widths) {
            flushSync(() => widthUpdate(width));
            await nextFrame();
            for (const specimen of realChatSpecimens) {
                const container = view.$(`[data-testid="${specimen.name}-container"]`).element;
                expectModeledRowsMatchPaint(
                    container,
                    specimen.entries.length,
                    `${specimen.name} at ${String(width)}px`,
                );
            }
        }
    },
    30_000,
);
