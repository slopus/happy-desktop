import { expect, it, vi } from "vitest";
import type { ConversationToolCall } from "happy-desktop-state";
import "./theme.css";
import "./styles/visually-hidden.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import "./styles/diff-snippet.css";
import "./styles/agent-activity-row.css";
import "./styles/avatar.css";
import "./styles/typed-text.css";
import { AgentActivityRow } from "./AgentActivityRow";
import { createRenderer } from "./testing";

const fileDiffTool: ConversationToolCall = {
    toolCallId: "t-diff",
    toolName: "edit",
    arguments: { path: "src/a.ts" },
    status: "success",
    failed: false,
    display: "Edited src/a.ts",
    presentation: {
        type: "fileDiff",
        files: [
            {
                path: "src/a.ts",
                kind: "update",
                added: 1,
                deleted: 1,
                hunks: [
                    {
                        oldStart: 1,
                        newStart: 1,
                        lines: [
                            { kind: "context", text: "const a = 1" },
                            { kind: "delete", text: "const b = 2" },
                            { kind: "add", text: "const b = 3" },
                        ],
                    },
                ],
            },
        ],
    },
};

const execTool: ConversationToolCall = {
    toolCallId: "t-exec",
    toolName: "bash",
    arguments: { command: "pnpm test" },
    status: "success",
    failed: false,
    display: "Ran pnpm test",
    presentation: {
        type: "execCommand",
        command: "pnpm test",
        output: Array.from({ length: 14 }, (_, index) => `out ${index}`).join("\n"),
    },
};

const genericTool: ConversationToolCall = {
    toolCallId: "t-generic",
    toolName: "TaskList",
    arguments: { filter: "in_progress" },
    status: "success",
    failed: false,
    display: "3 tasks",
};

const awaitingTool: ConversationToolCall = {
    toolCallId: "t-await",
    toolName: "write",
    arguments: null,
    status: "awaitingApproval",
    failed: false,
    review: {
        action: "write config.json",
        reason: "Outside the allowlist.",
        decision: "ask",
        risk: "high",
        userAuthorization: "low",
    },
};

const failedTool: ConversationToolCall = {
    toolCallId: "t-failed",
    toolName: "bash",
    arguments: null,
    status: "failed",
    failed: true,
    display: "exit 1",
};

const mcpTool: ConversationToolCall = {
    toolCallId: "t-mcp",
    toolName: "mcp__linear__create_issue",
    arguments: { title: "Fix the race", team: "core" },
    status: "success",
    failed: false,
    // Seven result lines → capped at 5 with a "… 2 more" overflow row.
    display: Array.from({ length: 7 }, (_, index) => `result ${index}`).join("\n"),
};

const mcpInterruptedTool: ConversationToolCall = {
    toolCallId: "t-mcp-int",
    toolName: "mcp__github__search_code",
    arguments: { query: "retry" },
    status: "stopped",
    failed: true,
    failure: { kind: "interrupted" },
};

it("renders each tool presentation and status with the correct dot tone", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "600px" }}>
                <AgentActivityRow
                    activity={{ kind: "tool", tool: fileDiffTool }}
                    data-testid="diff"
                    defaultExpanded
                />
                <AgentActivityRow
                    activity={{ kind: "tool", tool: execTool }}
                    data-testid="exec"
                    defaultExpanded
                />
                <AgentActivityRow
                    activity={{ kind: "tool", tool: genericTool }}
                    data-testid="generic"
                    defaultExpanded
                />
                <AgentActivityRow
                    activity={{ kind: "tool", tool: awaitingTool }}
                    data-testid="await"
                />
                <AgentActivityRow
                    activity={{ kind: "tool", tool: failedTool }}
                    data-testid="failed"
                />
            </div>
        ),
        { width: 660, height: 720, padding: 16 },
    );
    await view.ready();

    // File diff: verb + stats + DiffSnippet body.
    expect(
        view.$('[data-testid="diff"] [data-happy-desktop-ui="agent-activity-verb"]').element
            .textContent,
    ).toBe("Edited");
    expect(
        view.$('[data-testid="diff"] [data-happy-desktop-ui="agent-activity-text"]').element
            .textContent,
    ).toBe("a.ts");
    expect(view.$('[data-testid="diff"] .happy-agent-activity__added').element.textContent).toBe(
        "+1",
    );
    expect(
        view.container.querySelector('[data-testid="diff"] [data-happy-desktop-ui="diff-snippet"]'),
    ).not.toBeNull();
    // Success dot is green.
    expect(
        view
            .$('[data-testid="diff"] [data-happy-desktop-ui="agent-activity-dot"]')
            .computedStyle("background-color"),
    ).toBe("rgb(52, 199, 89)");

    // Exec output is head/tail truncated (14 lines > 10 budget → 10 shown + elide).
    const outputLines = view.container.querySelectorAll(
        '[data-testid="exec"] .happy-agent-activity__output-line',
    );
    expect(outputLines.length).toBe(10);
    expect(
        view.container.querySelector('[data-testid="exec"] .happy-agent-activity__output-elide')
            ?.textContent,
    ).toBe("… +4 lines");

    // Generic tool shows a result child row + JSON args.
    expect(
        view.$('[data-testid="generic"] [data-happy-desktop-ui="agent-activity-child-text"]')
            .element.textContent,
    ).toBe("3 tasks");
    expect(
        view.container.querySelector(
            '[data-testid="generic"] [data-happy-desktop-ui="agent-activity-args"]',
        ),
    ).not.toBeNull();

    // Awaiting approval: warning dot (orange #ff9500) + review row.
    expect(
        view
            .$('[data-testid="await"] [data-happy-desktop-ui="agent-activity-dot"]')
            .computedStyle("background-color"),
    ).toBe("rgb(255, 149, 0)");
    expect(
        view.$('[data-testid="await"] [data-happy-desktop-ui="agent-activity-verb"]').element
            .textContent,
    ).toBe("Awaiting approval");
    expect(
        view.container.querySelector(
            '[data-testid="await"] [data-happy-desktop-ui="agent-activity-review"]',
        ),
    ).not.toBeNull();
    expect(
        view
            .$('[data-testid="await"] [data-happy-desktop-ui="agent-activity-review-risk"]')
            .computedStyle("color"),
    ).toBe("rgb(255, 59, 48)");

    // Failed: error dot (red) + verb Failed.
    expect(
        view
            .$('[data-testid="failed"] [data-happy-desktop-ui="agent-activity-dot"]')
            .computedStyle("background-color"),
    ).toBe("rgb(255, 59, 48)");
    expect(
        view.$('[data-testid="failed"] [data-happy-desktop-ui="agent-activity-verb"]').element
            .textContent,
    ).toBe("Bash");

    await view.screenshot("AgentActivityRow.test");
}, 120_000);

it("renders MCP tool calls with a server·tool header, capped result rows, and interrupted state", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "600px" }}>
                <AgentActivityRow
                    activity={{ kind: "tool", tool: mcpTool }}
                    data-testid="mcp"
                    defaultExpanded
                />
                <AgentActivityRow
                    activity={{ kind: "tool", tool: mcpInterruptedTool }}
                    data-testid="mcp-int"
                />
            </div>
        ),
        { width: 660, height: 520, padding: 16 },
    );
    await view.ready();

    // Header is `server · tool`, derived from the mcp__server__tool name.
    expect(
        view.$('[data-testid="mcp"] [data-happy-desktop-ui="agent-activity-text"]').element
            .textContent,
    ).toBe("linear · create_issue");

    // Result is capped at 5 rows with a "… 2 more" overflow note (7 lines total).
    const resultRows = view.container.querySelectorAll(
        '[data-testid="mcp"] [data-happy-desktop-ui="agent-activity-mcp-result"] [data-happy-desktop-ui="agent-activity-child-text"]',
    );
    // 5 result rows + 1 overflow row.
    expect(resultRows.length).toBe(6);
    expect(resultRows[0]?.textContent).toBe("result 0");
    expect(resultRows[4]?.textContent).toBe("result 4");
    expect(resultRows[5]?.textContent).toBe("… 2 more");

    // Args render as the expandable invocation body.
    expect(
        view.container.querySelector(
            '[data-testid="mcp"] [data-happy-desktop-ui="agent-activity-args"]',
        ),
    ).not.toBeNull();

    // Interrupted MCP call collapses its result to a single "Interrupted." row.
    const interruptedRows = view.container.querySelectorAll(
        '[data-testid="mcp-int"] [data-happy-desktop-ui="agent-activity-mcp-result"] [data-happy-desktop-ui="agent-activity-child-text"]',
    );
    expect(interruptedRows.length).toBe(1);
    expect(interruptedRows[0]?.textContent).toBe("Interrupted.");

    await view.screenshot("AgentActivityRow.mcp.test");
}, 120_000);

it("expands and collapses its body without remounting the header or losing focus", async () => {
    const view = createRenderer();
    view.render(
        () => <AgentActivityRow activity={{ kind: "tool", tool: execTool }} data-testid="tool" />,
        {
            width: 520,
            height: 320,
            padding: 16,
        },
    );
    await view.ready();

    const header = view.$('[data-testid="tool"] [data-happy-desktop-ui="agent-activity-header"]')
        .element as HTMLButtonElement;
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(
        view.container.querySelector(
            '[data-testid="tool"] [data-happy-desktop-ui="agent-activity-body"]',
        ),
    ).toBeNull();

    header.focus();
    header.click();
    await vi.waitFor(() =>
        expect(
            view.container.querySelector(
                '[data-testid="tool"] [data-happy-desktop-ui="agent-activity-body"]',
            ),
        ).not.toBeNull(),
    );

    // The header button node is the same and keeps focus across the expansion.
    const headerAfter = view.$(
        '[data-testid="tool"] [data-happy-desktop-ui="agent-activity-header"]',
    ).element as HTMLButtonElement;
    expect(headerAfter, "header must not remount on expand").toBe(header);
    expect(document.activeElement).toBe(header);
    expect(header.getAttribute("aria-expanded")).toBe("true");

    header.click();
    await vi.waitFor(() =>
        expect(
            view.container.querySelector(
                '[data-testid="tool"] [data-happy-desktop-ui="agent-activity-body"]',
            ),
        ).toBeNull(),
    );
    expect(document.activeElement).toBe(header);
}, 120_000);

it("seats a verb on the same line whichever motion profile renders it", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", width: "600px" }}>
                <AgentActivityRow
                    activity={{ kind: "tool", tool: execTool }}
                    data-testid="typed-line"
                    motion="typewriter"
                    singleLine
                />
                <AgentActivityRow
                    activity={{ kind: "tool", tool: execTool }}
                    data-testid="still-line"
                    motion="calm"
                    singleLine
                />
            </div>
        ),
        { width: 660, height: 240, padding: 16 },
    );
    await view.ready();

    const bounds = (selector: string) => view.$(selector).bounds();
    /* Whether a row's label is a TypedText or the still span that stands in for
       it is a motion decision, and it must stay one: an inline span is sized by
       the font's ascent and descent while an inline-block aligned to the line's
       bottom fills the line box, so letting the two differ shifted a calm row's
       verb a pixel down from the glyph and monospace subject beside it. Compare
       each row against itself, since the rows sit at different heights. */
    for (const row of ["typed-line", "still-line"]) {
        const glyph = bounds(
            `[data-testid="${row}"] [data-happy-desktop-ui="agent-activity-glyph"]`,
        );
        const verb = bounds(`[data-testid="${row}"] [data-happy-desktop-ui="agent-activity-verb"]`);
        const text = bounds(`[data-testid="${row}"] [data-happy-desktop-ui="agent-activity-text"]`);
        expect(verb.y).toBe(text.y);
        expect(verb.height).toBe(text.height);
        expect(glyph.y + glyph.height / 2).toBe(verb.y + verb.height / 2);
    }

    /* And the label box itself is identical between the two, so a row does not
       change height when a tool settles from typing to still. */
    const typedLabel = bounds('[data-testid="typed-line"] .happy-typed-text');
    const stillLabel = bounds('[data-testid="still-line"] .happy-agent-activity__still-text');
    expect(stillLabel.height).toBe(typedLabel.height);
}, 120_000);

it("names a message's sender with its face, and an unnamed one by the start of its id", async () => {
    const text = "Message from agent byf9avtdw66p0lmixwkcut57:\n\nThe build is green.";
    const view = createRenderer();
    view.render(
        () => (
            <div>
                <AgentActivityRow
                    activity={{
                        kind: "agentMessage",
                        agentId: "byf9avtdw66p0lmixwkcut57",
                        agentName: "Release helper",
                        agentFace: { kind: "initials", initials: "RH" },
                        text,
                    }}
                    data-testid="named"
                />
                <AgentActivityRow
                    activity={{
                        kind: "agentMessage",
                        agentId: "p0o9i8u7y6t5r4e3w2q1a2s3",
                        agentName: "Ship the launch",
                        agentFace: { kind: "task" },
                        text,
                    }}
                    data-testid="task"
                />
                <AgentActivityRow
                    activity={{ kind: "agentMessage", agentId: "byf9avtdw66p0lmixwkcut57", text }}
                    data-testid="unnamed"
                />
            </div>
        ),
        { width: 520, height: 320, padding: 16 },
    );
    await view.ready();
    const part = (row: string, name: string) =>
        view.container.querySelector(`[data-testid="${row}"] [data-happy-desktop-ui="${name}"]`);

    expect(part("named", "agent-activity-text")?.textContent).toBe("from Release helper");
    expect(part("named", "avatar-initials")?.textContent).toBe("RH");
    expect(part("task", "agent-activity-text")?.textContent).toBe("from Ship the launch");
    expect(part("task", "avatar-glyph")).not.toBeNull();
    expect(part("task", "avatar-initials")).toBeNull();

    expect(part("unnamed", "agent-activity-text")?.textContent).toBe("from byf9avtd…");
    const header = part("unnamed", "agent-activity-header") as HTMLButtonElement;
    expect(header.title).toBe("byf9avtdw66p0lmixwkcut57");
    // The message itself keeps the whole id: the receiving model replies to it.
    header.click();
    await vi.waitFor(() =>
        expect(part("unnamed", "agent-activity-message-body")?.textContent).toContain(
            "Message from agent byf9avtdw66p0lmixwkcut57:",
        ),
    );
}, 120_000);

it("reads a call and a message in their own few words, naming the agents they mention", async () => {
    const opened: string[] = [];
    const references = {
        view: (reference: { kind: string; id: string }) =>
            reference.id === "zsyz6h9mborjt94esaykcqjs"
                ? ({ type: "link", label: "Tool descriptions", busy: false } as const)
                : ({ type: "text", label: reference.id } as const),
        open: (reference: { kind: string; id: string }) => opened.push(reference.id),
    };
    const view = createRenderer();
    view.render(
        () => (
            <div>
                <AgentActivityRow
                    activity={{ kind: "tool", tool: { ...execTool, summary: "Run the UI tests" } }}
                    data-testid="described"
                    singleLine
                />
                <AgentActivityRow
                    activity={{
                        kind: "tool",
                        tool: {
                            toolCallId: "t-subtask",
                            toolName: "create_subtask",
                            arguments: { title: "Fix trace folding" },
                            status: "running",
                            failed: false,
                            summary: "Fix trace folding",
                        },
                    }}
                    data-testid="subtask"
                    references={references}
                    singleLine
                />
                <AgentActivityRow
                    activity={{
                        kind: "agentMessage",
                        agentId: "zsyz6h9mborjt94esaykcqjs",
                        agentName: "Tool descriptions",
                        explanation: "zsyz6h9mborjt94esaykcqjs finished the daemon work",
                        text: "Done.",
                    }}
                    data-testid="message"
                    references={references}
                />
            </div>
        ),
        { width: 520, height: 320, padding: 16 },
    );
    await view.ready();
    const part = (row: string, name: string) =>
        view.container.querySelector<HTMLElement>(
            `[data-testid="${row}"] [data-happy-desktop-ui="${name}"]`,
        );

    // The description stands alone where the command did.
    await vi.waitFor(() =>
        expect(part("described", "agent-activity-text")?.textContent).toBe("Run the UI tests"),
    );
    expect(part("described", "agent-activity-verb")?.textContent).toBe("");
    const call = part("described", "agent-activity-call")!;
    expect(call.dataset.described).toBe("");
    await vi.waitFor(() =>
        expect(part("subtask", "agent-activity-text")?.textContent).toBe("Fix trace folding"),
    );
    expect(part("subtask", "agent-activity-verb")?.textContent).toBe("Subtask");

    // The message says what it is, and the agent it names reads as that agent:
    // not underlined until the pointer is on it, and opened from there. Naming
    // its sender, it does not name it twice.
    expect(part("message", "agent-activity-text")?.textContent).toBe(
        "Tool descriptions finished the daemon work",
    );
    expect(part("message", "agent-activity-verb")?.textContent).toBe("");
    const mention = part("message", "agent-activity-agent-reference")!;
    expect(getComputedStyle(mention).textDecorationLine).toBe("none");
    mention.click();
    expect(opened).toEqual(["zsyz6h9mborjt94esaykcqjs"]);
    expect(part("message", "agent-activity-message-body")).toBeNull();
}, 120_000);

it("tells each call as what it did, in words, and keeps the raw call one click away", async () => {
    const references = {
        view: (reference: { kind: string; id: string }) =>
            reference.kind === "user" && reference.id === "u-steve"
                ? ({ type: "link", label: "@Steve", busy: false } as const)
                : reference.kind === "artifact" && reference.id === "a-wave"
                  ? ({ type: "link", label: "Voice waveform", busy: false } as const)
                  : ({ type: "text", label: "…" } as const),
        open: () => undefined,
    };
    const call = (
        toolCallId: string,
        toolName: string,
        args: ConversationToolCall["arguments"],
        rest: Partial<ConversationToolCall> = {},
    ): ConversationToolCall => ({
        toolCallId,
        toolName,
        arguments: args,
        status: "success",
        failed: false,
        ...rest,
    });
    const rows: Array<[string, ConversationToolCall]> = [
        ["read", call("t-read", "read", { file_path: "src/voice/VoiceBar.tsx" })],
        ["edit", fileDiffTool],
        [
            "create",
            call(
                "t-create",
                "create_artifact",
                { title: "Voice waveform" },
                {
                    presentation: {
                        type: "artifact",
                        artifactId: "a-wave" as never,
                        version: 1,
                        artifactType: "html",
                        title: "Voice waveform",
                        shows: "latest",
                    },
                },
            ),
        ],
        [
            "update",
            call("t-update", "write_artifact_file", { artifactId: "a-wave", path: "index.html" }),
        ],
        ["team", call("t-team", "list_teammates", {})],
        ["tell", call("t-tell", "notify_teammate", { userId: "u-steve", text: "Have a look" })],
        [
            "ship",
            call(
                "t-ship",
                "bash",
                { command: "pnpm release --production", description: "Ship to production" },
                {
                    summary: "Ship to production",
                    presentation: {
                        type: "execCommand",
                        command: "pnpm release --production",
                        output: "",
                    },
                },
            ),
        ],
        [
            "telling",
            call("t-telling", "notify_teammate", { userId: "u-steve" }, { status: "running" }),
        ],
        ["raw", execTool],
        // Still being written: no diff or output yet, and maybe no path.
        [
            "editing",
            call(
                "t-editing",
                "Edit",
                { file_path: "src/voice/waveformActive.ts" },
                { status: "running" },
            ),
        ],
        ["editing-early", call("t-editing-early", "Edit", {}, { status: "running" })],
        [
            "shipping",
            call(
                "t-shipping",
                "Bash",
                { command: "pnpm release", description: "Ship to production" },
                { status: "running" },
            ),
        ],
        ["running", call("t-running", "Bash", {}, { status: "running" })],
        ["reading-early", call("t-reading-early", "Read", {}, { status: "running" })],
        // A tool told by its own name and words rather than as an action.
        [
            "subtask",
            call(
                "t-subtask",
                "create_subtask",
                { title: "Desktop chat scroll" },
                { summary: "Desktop chat scroll" },
            ),
        ],
    ];
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "600px" }}>
                {rows.map(([id, tool]) => (
                    <AgentActivityRow
                        key={id}
                        activity={{ kind: "tool", tool }}
                        data-testid={id}
                        references={references}
                        singleLine
                    />
                ))}
                {/* The transcript's still motion draws its labels in another span. */}
                <AgentActivityRow
                    activity={{ kind: "tool", tool: rows[5]![1] }}
                    data-testid="tell-calm"
                    motion="calm"
                    references={references}
                    singleLine
                />
                <AgentActivityRow
                    activity={{ kind: "tool", tool: execTool }}
                    data-testid="raw-calm"
                    motion="calm"
                    singleLine
                />
                <AgentActivityRow
                    activity={{ kind: "tool", tool: rows[6]![1] }}
                    data-testid="ship-full"
                />
                {/* An artifact's file is not a workspace file to open. */}
                <AgentActivityRow
                    activity={{ kind: "tool", tool: rows[3]![1] }}
                    data-testid="update-open"
                    onFileOpen={() => undefined}
                    references={references}
                    singleLine
                />
                <AgentActivityRow
                    activity={{ kind: "tool", tool: rows[0]![1] }}
                    data-testid="read-open"
                    onFileOpen={() => undefined}
                    singleLine
                />
            </div>
        ),
        { width: 660, height: 800, padding: 16 },
    );
    await view.ready();
    const part = (row: string, name: string) =>
        view.container.querySelector<HTMLElement>(
            `[data-testid="${row}"] [data-happy-desktop-ui="${name}"]`,
        );
    const said = (row: string) =>
        `${part(row, "agent-activity-verb")?.textContent ?? ""} ${part(row, "agent-activity-text")?.textContent ?? ""}`.trim();

    await vi.waitFor(() => expect(said("read")).toBe("Read VoiceBar.tsx"));
    expect(said("edit")).toBe("Edited a.ts");
    expect(said("create")).toBe("Created the Voice waveform preview");
    expect(said("update")).toBe("Wrote Voice waveform");
    expect(said("team")).toBe("Checked who's on the team");
    expect(said("tell")).toBe("Told Steve");
    expect(said("telling")).toBe("Telling Steve");
    expect(said("ship")).toBe("Ship to production");
    expect(said("editing")).toBe("Editing waveformActive.ts");
    expect(said("editing-early")).toBe("Editing a file");
    expect(said("shipping")).toBe("Ship to production");
    expect(said("running")).toBe("Running a command");
    expect(said("reading-early")).toBe("Reading a file");
    expect(part("read-open", "agent-activity-open")).not.toBeNull();
    expect(part("update-open", "agent-activity-open")).toBeNull();
    // With no verb, its words start where a verb would.
    expect(part("ship", "agent-activity-text")!.getBoundingClientRect().x).toBe(
        part("read", "agent-activity-verb")!.getBoundingClientRect().x,
    );

    // Every row's words are the transcript's own type, a raw command and a
    // tool told by its own name included: a run of rows never switches face.
    // Read from the glyphs' own span, typed or still, which is what draws them.
    const fontOf = (row: string, name = "agent-activity-text") => {
        const label = part(row, name)!;
        const glyphs =
            label.querySelector(".happy-typed-text, .happy-agent-activity__still-text") ?? label;
        return getComputedStyle(glyphs).fontFamily;
    };
    const words = fontOf("read");
    expect(words).toContain("Figtree");
    for (const row of [
        "edit",
        "create",
        "update",
        "team",
        "tell",
        "ship",
        "tell-calm",
        "raw",
        "raw-calm",
        "subtask",
    ])
        expect(fontOf(row), row).toBe(words);
    for (const row of ["read", "tell", "tell-calm", "raw", "raw-calm", "subtask"])
        expect(fontOf(row, "agent-activity-verb"), `${row} verb`).toBe(words);

    // A transcript row never opens, so the raw call is its hover title.
    expect(part("ship", "agent-activity-header")?.title).toBe("$ pnpm release --production");
    expect(part("tell", "agent-activity-header")?.title).toBe(
        'notify_teammate {"userId":"u-steve","text":"Have a look"}',
    );
    expect(part("raw", "agent-activity-header")?.title).toBe("");

    // A full row keeps the command a description stands for one click away.
    expect(part("ship-full", "agent-activity-command")).toBeNull();
    part("ship-full", "agent-activity-header")!.click();
    await vi.waitFor(() =>
        expect(part("ship-full", "agent-activity-command")?.textContent).toBe(
            "$ pnpm release --production",
        ),
    );

    await view.screenshot("AgentActivityRow.actions.test");
}, 120_000);
