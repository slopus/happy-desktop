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
    ).toBe("Edit");
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
