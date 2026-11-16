import { useState } from "react";
import { flushSync } from "react-dom";
import type {
    ComposerSnapshot,
    ConversationAuthor,
    ConversationEntry,
    ConversationMessageEntry,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import "./styles.css";
import { ConversationDock } from "./ConversationDock";
import { ConversationView } from "./ConversationView";
import { Message } from "./Message";
import {
    markdownBodyHeight,
    messageTextLayoutCacheCreate,
    monoOutputTextHeight,
} from "./messageTextLayout";
import { createRenderer } from "./testing";
import { messageListEndOffset } from "./testing/messageListEnd";
import nestedLinkList from "./fixtures/nested-link-list.txt?raw";
import richTablePayload from "./fixtures/streaming-layout-rich-table.txt?raw";
import movieListPayload from "./fixtures/movie-list-layout.txt?raw";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const agent: ConversationAuthor = {
    id: "streaming-layout-agent",
    displayName: "Happy",
    username: "happy",
    kind: "agent",
    agentRole: "default",
};
const composer: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "streaming-layout",
    submission: { status: "idle" },
    text: "",
};
function message(text: string, streaming: boolean): ConversationMessageEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id: "streaming-prose",
            chatId: "streaming-layout",
            sequence: "1",
            changePts: "1",
            sender: agent,
            text,
            attachments: [],
            reactions: [],
            createdAt: "2026-09-06T12:34:00.000Z",
            generationStatus: streaming ? "streaming" : "complete",
        },
    };
}
const tool: ConversationEntry = {
    kind: "agentActivity",
    id: "edit-tool",
    sequence: "2",
    activity: { kind: "labeled", label: "Edit", subject: "Write", status: "success", mono: true },
};
const completed: ConversationEntry = {
    kind: "turnStatus",
    id: "completed-status",
    sequence: "3",
    status: "complete",
    reason: "completed",
    durationMs: 82_000,
};
const screenshotProse = [
    "`full-access` — which is what yolo maps to. So the mapping is right; `never` just reads alarming in isolation.",
    "",
    "That said, your instinct to audit is well-placed — I spotted at least one that looks genuinely wrong (`plan` → `workspace-write`, i.e. plan mode can write files). Delegating a full audit to a **fresh** session rather than `gttdrb`, since it just concluded the mappings were fine and shouldn't grade its own homework.",
].join("\n");
const markdown = [
    screenshotProse,
    "",
    "- First check the [layout source](https://example.com/a/very/long/path/that/is/not/painted/as/the/link/label).",
    "- Then check **streaming geometry** and `inline-code`.",
    "",
    "> This quote must occupy only its rendered lines.",
    "",
    "```ts",
    "const complete = true;",
    "console.log(complete);",
    "```",
    "",
    "Kind | Result",
    "--- | ---",
    "Prose | Exact",
    "Tools | Exact",
].join("\n");

function expectRowGeometry(container: Element, label: string) {
    const rows = [...container.querySelectorAll<HTMLElement>(".happy-message-list__virtual-row")];
    expect(rows.length).toBeGreaterThan(1);
    for (let index = 0; index < rows.length - 1; index += 1) {
        const bounds = rows[index]!.getBoundingClientRect();
        const reserved = rows[index + 1]!.getBoundingClientRect().top - bounds.top;
        // The existing geometry gym allows fractional WebKit formatting-box
        // remainders, never a missing line (18px or more).
        expect(
            Math.abs(reserved - bounds.height),
            `${label}: row ${String(index)} painted ${bounds.height.toFixed(3)}px, reserved ${reserved.toFixed(3)}px, gap ${(reserved - bounds.height).toFixed(3)}px`,
        ).toBeLessThanOrEqual(2.1);
    }
    const viewport = container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    // The last row rests on the lower edge with nothing blank under it. A
    // status that appeared under a settled follower is the one thing allowed
    // below the fold: it waits there until content carries the reader to it.
    const end = messageListEndOffset(viewport);
    const status = viewport
        .querySelector<HTMLElement>('[data-happy-desktop-ui="conversation-status-line"]')
        ?.closest<HTMLElement>(".happy-message-list__virtual-row");
    expect(end, `${label}: blank under the following reader's tail`).toBeLessThanOrEqual(1);
    expect(end, `${label}: following reader stays at the tail`).toBeGreaterThanOrEqual(
        -(status?.getBoundingClientRect().height ?? 0) - 1,
    );
}

it("keeps live prose, tool, and status rows adjacent before and after settlement", async () => {
    const view = createRenderer();
    let update!: (state: { text: string; streaming: boolean; width: number }) => void;
    function Harness() {
        const [state, setState] = useState({ text: screenshotProse, streaming: true, width: 800 });
        update = setState;
        return (
            <div className="happy-theme-dark" style={{ width: state.width, height: 700 }}>
                <ConversationView
                    agentAuthor={agent}
                    dock={
                        <ConversationDock
                            composer={composer}
                            onComposerSend={() => {}}
                            onComposerValueChange={() => {}}
                            running
                        />
                    }
                    conversationId="streaming-layout"
                    elapsedMs={82_000}
                    entries={[message(state.text, state.streaming), tool]}
                    motion="calm"
                    running
                    workingLabel="Preparing tools"
                />
            </div>
        );
    }
    view.render(Harness, { width: 900, height: 700 });
    await view.ready();
    await nextFrame();
    await nextFrame();
    expect(window.devicePixelRatio).toBe(2);
    await view.screenshot("ConversationStreamingGeometry.test");
    expectRowGeometry(view.container, "screenshot-shaped live prose");

    const row = view.container.querySelector(".happy-message-list__virtual-row")!;
    const prefix = row.querySelector("p")!;
    const input = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
    input.focus();
    for (const width of [800, 560, 360, 800]) {
        for (const text of [
            screenshotProse,
            markdown,
            `${markdown}\n\n${"WWW WWW WWW ".repeat(24)}`,
        ]) {
            flushSync(() => update({ text, streaming: true, width }));
            await nextFrame();
            expect(view.container.querySelector(".happy-message-list__virtual-row")).toBe(row);
            expect(row.querySelector("p")).toBe(prefix);
            expect(document.activeElement).toBe(input);
            expectRowGeometry(view.container, `streaming at ${String(width)}px`);
            const liveHeight = row.getBoundingClientRect().height;
            flushSync(() => update({ text, streaming: false, width }));
            expectRowGeometry(view.container, `settled at ${String(width)}px`);
            expect(row.getBoundingClientRect().height).toBe(liveHeight);
            await nextFrame();
            expectRowGeometry(view.container, `first settled frame at ${String(width)}px`);
        }
    }
});

for (const width of [800, 560, 360]) {
    it(`keeps nested-link list geometry exact while it streams at ${String(width)}px`, async () => {
        const view = createRenderer();
        let update!: (text: string, streaming: boolean) => void;
        function Harness() {
            const [state, setState] = useState({ text: "", streaming: true });
            update = (text, streaming) => setState({ text, streaming });
            return (
                <div className="happy-theme-dark" style={{ width, height: 700 }}>
                    <ConversationView
                        agentAuthor={agent}
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerSend={() => {}}
                                onComposerValueChange={() => {}}
                                running
                            />
                        }
                        conversationId="nested-link-stream"
                        entries={[message(state.text, state.streaming), tool]}
                        motion="calm"
                        running
                    />
                </div>
            );
        }
        view.render(Harness, { width: 900, height: 700 });
        await view.ready();
        await nextFrame();
        await nextFrame();
        const row = view.container.querySelector(".happy-message-list__virtual-row")!;
        const input = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
        input.focus();
        const ends = [nestedLinkList.length];
        for (let index = 0; index < nestedLinkList.length; index += 1)
            if (nestedLinkList[index] === "\n") ends.push(index + 1);
        for (const end of ends.sort((a, b) => a - b)) {
            flushSync(() => update(nestedLinkList.slice(0, end), true));
            await nextFrame();
            expectRowGeometry(
                view.container,
                `nested-link prefix ${String(end)} at ${String(width)}px`,
            );
            expect(view.container.querySelector(".happy-message-list__virtual-row")).toBe(row);
            expect(document.activeElement).toBe(input);
        }
        const liveHeight = row.getBoundingClientRect().height;
        flushSync(() => update(nestedLinkList, false));
        expectRowGeometry(view.container, `nested-link settled at ${String(width)}px`);
        expect(row.getBoundingClientRect().height).toBe(liveHeight);
        expect(row.querySelectorAll("li > ul")).toHaveLength(3);
    });
}

it("keeps the transcript fixed when the live status becomes the completed summary", async () => {
    const view = createRenderer();
    let settle!: () => void;
    function Harness() {
        const [running, setRunning] = useState(true);
        settle = () => setRunning(false);
        return (
            <div className="happy-theme-dark" style={{ width: 800, height: 700 }}>
                <ConversationView
                    agentAuthor={agent}
                    dock={
                        <ConversationDock
                            composer={composer}
                            onComposerSend={() => {}}
                            onComposerValueChange={() => {}}
                            running={running}
                        />
                    }
                    conversationId="completion-transition"
                    elapsedMs={82_000}
                    entries={
                        running
                            ? [tool, message(markdown, true)]
                            : [tool, message(markdown, false), completed]
                    }
                    motion="calm"
                    running={running}
                    workingLabel="Finishing"
                />
            </div>
        );
    }
    view.render(Harness, { width: 900, height: 700 });
    await view.ready();
    await nextFrame();
    await nextFrame();
    const viewport = view.container.querySelector<HTMLElement>(".happy-message-list__viewport")!;
    const messageRow = view.container.querySelector<HTMLElement>(
        '.happy-message-list__virtual-row:has([data-generation-status="streaming"])',
    )!;
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    const scrollHeight = viewport.scrollHeight;
    const messageTop = messageRow.getBoundingClientRect().top;
    flushSync(settle);
    expect(viewport.scrollHeight).toBe(scrollHeight);
    expect(messageRow.getBoundingClientRect().top).toBe(messageTop);
    expect(messageRow.querySelector('[data-generation-status="complete"]')).not.toBeNull();
    expect(view.container.querySelector('[data-happy-desktop-ui="turn-summary"]')).not.toBeNull();
    expectRowGeometry(view.container, "completed status transition");
});

for (const width of [800, 560, 360]) {
    // Table cells wrap at their column measure, which puts this payload's URLs
    // and paths at a line edge at every width. Gecko breaks after a slash
    // there, where Blink and WebKit keep the token whole; the model marks that
    // opportunity in Gecko, so all three engines must match exactly.
    it(`keeps the reported rich-table stream adjacent at ${String(width)}px`, async () => {
        const view = createRenderer();
        let update!: (text: string, streaming: boolean, width: number) => void;
        function Harness() {
            const [state, setState] = useState({ text: "", streaming: true, width });
            update = (text, streaming, width) => setState({ text, streaming, width });
            return (
                <div className="happy-theme-dark" style={{ width: state.width, height: 700 }}>
                    <ConversationView
                        agentAuthor={agent}
                        dock={
                            <ConversationDock
                                composer={composer}
                                onComposerSend={() => {}}
                                onComposerValueChange={() => {}}
                                running
                            />
                        }
                        conversationId="reported-rich-table"
                        entries={[message(state.text, state.streaming), tool]}
                        motion="calm"
                        running
                    />
                </div>
            );
        }
        view.render(Harness, { width: 900, height: 700 });
        await view.ready();
        await nextFrame();
        await nextFrame();
        const row = view.container.querySelector(".happy-message-list__virtual-row")!;
        const input = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
        input.focus();
        const ends = new Set([richTablePayload.length]);
        for (let end = 1; end < richTablePayload.length; end += 32) ends.add(end);
        // Exercise each structural delimiter as well as ordinary growing chunks:
        // the header is prose until its GFM separator arrives, and unfinished
        // links/code/formatting must have accurate geometry before they close.
        for (let index = 0; index < richTablePayload.length; index += 1) {
            if (!"\n|`]*".includes(richTablePayload[index]!)) continue;
            ends.add(index);
            ends.add(index + 1);
        }
        for (const end of [...ends].sort((a, b) => a - b)) {
            flushSync(() => update(richTablePayload.slice(0, end), true, width));
            await nextFrame();
            expectRowGeometry(
                view.container,
                `reported payload prefix ${String(end)} at ${String(width)}px`,
            );
            expect(view.container.querySelector(".happy-message-list__virtual-row")).toBe(row);
            expect(document.activeElement).toBe(input);
        }
        const liveHeight = row.getBoundingClientRect().height;
        flushSync(() => update(richTablePayload, false, width));
        expectRowGeometry(view.container, `reported payload settled at ${String(width)}px`);
        expect(row.getBoundingClientRect().height).toBe(liveHeight);
        expect(row.querySelectorAll("table")).toHaveLength(1);
        expect(row.querySelectorAll("tr")).toHaveLength(7);
        const tableViewport = row.querySelector<HTMLElement>(
            ".happy-message__table-scroll-viewport",
        )!;
        // Wide enough, the prose columns wrap to fit; narrower, the widest
        // words no longer fit side by side and the table scrolls.
        expect(tableViewport.scrollWidth > tableViewport.clientWidth).toBe(width < 800);
    });
}

it("matches empty streamed heading, list and table boxes", async () => {
    const view = createRenderer();
    let update!: (text: string) => void;
    function Harness() {
        const [text, setText] = useState("");
        update = setText;
        return (
            <ConversationView
                agentAuthor={agent}
                dock={
                    <ConversationDock
                        composer={composer}
                        onComposerSend={() => {}}
                        onComposerValueChange={() => {}}
                        running
                    />
                }
                conversationId="empty-streamed-blocks"
                entries={[message(text, true), tool]}
                motion="calm"
                running
            />
        );
    }
    view.render(Harness, { width: 360, height: 700 });
    await view.ready();
    await nextFrame();
    await nextFrame();
    for (const text of [
        "##",
        "Before\n\n##\n\nAfter",
        "Before\n\n##",
        "1. ",
        "| |\n|---|\n| |",
        "| H |\n|---|\n| <b></b> |",
        "| H |\n|---|\n| &nbsp; |",
        "| H |\n|---|\n| ` ` |",
        "| H |\n|---|\n| | discarded |",
    ]) {
        flushSync(() => update(text));
        await nextFrame();
        expectRowGeometry(view.container, `empty-block contract ${JSON.stringify(text)}`);
    }
});

it("keeps settled narrow URL text exact, including Gecko's breaks after slashes", async () => {
    const text = richTablePayload.slice(0, 417);
    const view = createRenderer();
    view.render(() => <Message agent author="Happy" body={text} />, {
        width: 360,
        height: 700,
    });
    await view.ready();
    await document.fonts.load('16px "happy Figtree"');
    await document.fonts.load('700 16px "happy Figtree"');
    await nextFrame();
    const body = view.container.querySelector<HTMLElement>(".happy-message__body")!;
    const bounds = body.getBoundingClientRect();
    const settled = markdownBodyHeight(text, bounds.width, messageTextLayoutCacheCreate());
    expect(Math.abs(settled - bounds.height)).toBeLessThanOrEqual(2.1);
});

it("keeps the reported movie list adjacent to the next row at subpixel wrap boundaries", async () => {
    const view = createRenderer();
    let update!: (width: number, text: string, streaming: boolean) => void;
    function Harness() {
        const [state, setState] = useState({ width: 880, text: movieListPayload, streaming: true });
        update = (width, text, streaming) => setState({ width, text, streaming });
        return (
            <div style={{ width: state.width, height: 700 }}>
                <ConversationView
                    agentAuthor={agent}
                    dock={
                        <ConversationDock
                            composer={composer}
                            onComposerSend={() => {}}
                            onComposerValueChange={() => {}}
                            running={state.streaming}
                        />
                    }
                    conversationId="movie-list-layout"
                    entries={[message(state.text, state.streaming), tool]}
                    motion="calm"
                    running={state.streaming}
                />
            </div>
        );
    }
    view.render(Harness, { width: 1300, height: 700 });
    await view.ready();
    await nextFrame();
    await nextFrame();
    for (const width of [720, 876, 878, 879, 880, 881, 882, 884, 1000, 1300, 880]) {
        for (const streaming of [true, false]) {
            flushSync(() => update(width, movieListPayload, streaming));
            await nextFrame();
            expectRowGeometry(view.container, `movie list at ${width}px, streaming=${streaming}`);
        }
    }
    const boundary = movieListPayload.indexOf("3. **Ready");
    for (const end of [boundary - 3, boundary - 2, boundary - 1, boundary, boundary + 1]) {
        flushSync(() => update(880, movieListPayload.slice(0, end), true));
        expectRowGeometry(view.container, `movie list streaming prefix ${end}`);
    }
});

it("keeps expanded shell output adjacent to the live status while output grows", async () => {
    const view = createRenderer();
    let update!: (output: string, running: boolean) => void;
    function Harness() {
        const [state, setState] = useState({ output: "Starting build", running: true });
        update = (output, running) => setState({ output, running });
        const shell: ConversationEntry = {
            kind: "agentActivity",
            id: "streaming-shell",
            sequence: "1",
            activity: {
                kind: "shell",
                command: "build",
                output: state.output,
                running: state.running,
                timedOut: false,
                exitCode: state.running ? null : 0,
            },
        };
        return (
            <ConversationView
                agentAuthor={agent}
                dock={
                    <ConversationDock
                        composer={composer}
                        onComposerSend={() => {}}
                        onComposerValueChange={() => {}}
                        running
                    />
                }
                conversationId="streaming-output"
                entries={[shell]}
                motion="calm"
                running
            />
        );
    }
    view.render(Harness, { width: 560, height: 700 });
    await view.ready();
    await nextFrame();
    await nextFrame();
    const row = view.container.querySelector(".happy-message-list__virtual-row")!;
    for (const output of [
        "Starting build\nBundling packages\n",
        `Starting build\n${"漢字 ".repeat(48)}\nBundling packages\n`,
        `Starting build\n${"packages/happy-desktop-ui ".repeat(18)}\nDone\n`,
    ]) {
        flushSync(() => update(output, true));
        expectRowGeometry(view.container, "streaming shell output");
        await nextFrame();
        expectRowGeometry(view.container, "first streamed shell frame");
        const liveHeight = row.getBoundingClientRect().height;
        flushSync(() => update(output, false));
        expect(view.container.querySelector(".happy-message-list__virtual-row")).toBe(row);
        expectRowGeometry(view.container, "settled shell output");
        expect(row.getBoundingClientRect().height).toBe(liveHeight);
    }
});

it("lays out each live prefix exactly without retaining Markdown prefixes in the settled cache", async () => {
    const view = createRenderer();
    view.render(() => <div>Font readiness</div>, { width: 800, height: 40 });
    await view.ready();
    await document.fonts.load('16px "happy Figtree"');
    await document.fonts.load('12px "happy Mono"');
    const cache = messageTextLayoutCacheCreate();
    // Completed shell lines are deliberately retained; Markdown prefixes are not.
    const shellCache = messageTextLayoutCacheCreate();
    markdownBodyHeight("Existing settled history", 640, cache);
    // Let the layout module's font-generation notification settle before
    // taking the retained-cache baseline.
    await nextFrame();
    markdownBodyHeight("Existing settled history", 640, cache);
    // The bounded streaming scratch cache is separate from settled history.
    const retained = JSON.stringify({ ...cache, streaming: undefined });
    const cases = [
        screenshotProse,
        markdown,
        "WWW WWW WWW ".repeat(40),
        "first line\nsoft break\n\nsecond paragraph",
        "```mermaid\ngraph TD\nA --> B\n```",
    ];
    for (const text of cases) {
        for (let end = 1; end <= text.length; end += 23) {
            const prefix = text.slice(0, end);
            for (const width of [266, 466, 706]) {
                expect(
                    markdownBodyHeight(prefix, width, cache, 0, false, true),
                    `live Markdown prefix ${String(end)} at ${String(width)}px`,
                ).toBe(markdownBodyHeight(prefix, width, messageTextLayoutCacheCreate(), 0, false));
                expect(
                    monoOutputTextHeight(prefix, width, shellCache, true),
                    `live shell prefix ${String(end)} at ${String(width)}px`,
                ).toBe(monoOutputTextHeight(prefix, width, messageTextLayoutCacheCreate()));
            }
        }
    }
    expect(
        JSON.stringify({ ...cache, streaming: undefined }),
        "live prefixes must not enter the retained history cache",
    ).toBe(retained);
});
