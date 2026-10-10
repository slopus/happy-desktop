import { expect, it, vi } from "vitest";
import type {
    HappyAgentBackgroundProcess,
    HappyAgentGoal,
    SubagentSummary,
    HappyAgentTodo,
} from "happy-desktop-state";
import "./theme.css";
import "./styles/button.css";
import "./styles/delegated-agent.css";
import "./styles/icon.css";
import "./styles/happy-agent-activity.css";
import "./styles/spinner.css";
import { HappyAgentActivityPanel } from "./HappyAgentActivityPanel";
import { createRenderer } from "./testing";

const goal: HappyAgentGoal = {
    objective: "Ship the usage panel end to end.",
    status: "active",
    createdAt: 1000,
    updatedAt: 2000,
};

const tasks: readonly HappyAgentTodo[] = [
    {
        id: "t1",
        subject: "Design the API",
        description: "",
        status: "completed",
        blockedBy: [],
        blocks: [],
    },
    {
        id: "t2",
        subject: "Implement the store",
        description: "",
        status: "in_progress",
        activeForm: "Implementing the store",
        blockedBy: [],
        blocks: [],
    },
    {
        id: "t3",
        subject: "Write tests",
        description: "",
        status: "pending",
        blockedBy: [],
        blocks: [],
    },
];

const subagents: readonly SubagentSummary[] = [
    {
        id: "sub-1" as SubagentSummary["id"],
        parentSessionId: "s1" as SubagentSummary["parentSessionId"],
        description: "Research the protocol",
        taskName: "protocol-research",
        modelId: "gpt-5.6-sol",
        status: "running",
        depth: 1,
        createdAt: 1000,
        updatedAt: 2000,
        activeSince: 4_000,
        totalTokens: 12_500,
        latestText: "Reading the transport module.",
    },
];

const backgroundProcesses: readonly HappyAgentBackgroundProcess[] = [
    { id: 7, command: "pnpm server dev", cwd: "/repo", status: "running" },
];

it("renders a grouped activity reading with the compact transcript row grammar", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ width: "560px" }}>
                <HappyAgentActivityPanel
                    backgroundProcesses={backgroundProcesses}
                    goal={goal}
                    now={64_000}
                    subagents={subagents}
                    tasks={tasks}
                />
            </div>
        ),
        { width: 600, height: 760, padding: 12 },
    );
    await view.ready();

    // Goal objective + status fact.
    expect(
        view.$('[data-happy-desktop-ui="happy-agent-activity-goal"] .happy-delegated-agent__meta')
            .element.textContent,
    ).toContain("Active");
    expect(view.container.textContent).toContain("Ship the usage panel end to end.");

    // Three tasks; the in-progress one shows its active form.
    const taskRows = view.container.querySelectorAll(
        '[data-happy-desktop-ui="happy-agent-activity-task"]',
    );
    expect(taskRows.length).toBe(3);
    expect(view.container.textContent).toContain("Implementing the store");

    // Subagent monitor: status, elapsed (now - activeSince = 60s), tokens.
    const monitor = view.$('[data-happy-desktop-ui="happy-agent-activity-subagent"]').element;
    expect(monitor.textContent).toContain("running");
    expect(monitor.textContent).toContain("1m 0s");
    expect(monitor.textContent).toContain("12,500 tokens");

    // Background terminals (`/ps`) listed with their command.
    const processRows = view.container.querySelectorAll(
        '[data-happy-desktop-ui="happy-agent-activity-process"]',
    );
    expect(processRows.length).toBe(1);
    expect(processRows[0]?.textContent).toContain("pnpm server dev");

    const panel = view.$('[data-happy-desktop-ui="happy-agent-activity-panel"]');
    expect(panel.bounds().width).toBe(560);
    expect(panel.computedStyles(["display", "gap", "width"])).toEqual({
        display: "flex",
        gap: "16px",
        width: "560px",
    });

    const sections = Array.from(
        view.container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="happy-agent-activity-panel"] > [data-happy-desktop-ui]',
        ),
    );
    expect(sections).toHaveLength(3);
    for (let index = 1; index < sections.length; index += 1) {
        const previous = sections[index - 1]!.getBoundingClientRect();
        const current = sections[index]!.getBoundingClientRect();
        expect(current.top - previous.bottom).toBe(16);
    }

    const heading = view.$('[data-happy-desktop-ui="happy-agent-activity-tasks"] h3');
    expect(heading.bounds().height).toBe(20);
    expect(
        view
            .$(
                '[data-happy-desktop-ui="happy-agent-activity-tasks"] [data-happy-desktop-ui="happy-agent-activity-heading-label"]',
            )
            .textMetrics(),
    ).toMatchObject({
        font: {
            family: "happy Figtree, system-ui, sans-serif",
            lineHeight: 16,
            size: 12,
            weight: "600",
        },
    });

    const lists = Array.from(
        view.container.querySelectorAll<HTMLElement>(
            '[data-happy-desktop-ui="happy-agent-activity-list"]',
        ),
    );
    expect(lists).toHaveLength(4);
    for (const list of lists) {
        const styles = getComputedStyle(list);
        expect({
            background: styles.backgroundColor,
            border: styles.borderTopWidth,
            boxSizing: styles.boxSizing,
            padding: styles.padding,
            radius: styles.borderTopLeftRadius,
        }).toEqual({
            background: "rgba(0, 0, 0, 0)",
            border: "0px",
            boxSizing: "border-box",
            padding: "0px",
            radius: "0px",
        });
    }

    // Every row's primary content shares the transcript's glyph/content inset.
    const contentLefts = [
        view
            .$(
                '[data-happy-desktop-ui="happy-agent-activity-goal"] .happy-delegated-agent__content',
            )
            .bounds().x,
        view
            .$(
                '[data-happy-desktop-ui="happy-agent-activity-task"] .happy-delegated-agent__content',
            )
            .bounds().x,
        view
            .$(
                '[data-happy-desktop-ui="happy-agent-activity-subagent"] .happy-delegated-agent__content',
            )
            .bounds().x,
        view
            .$(
                '[data-happy-desktop-ui="happy-agent-activity-process"] .happy-delegated-agent__content',
            )
            .bounds().x,
    ];
    expect(new Set(contentLefts).size).toBe(1);

    await view.screenshot("HappyAgentActivityPanel.test");
}, 120_000);

it("shows a Stop control on a background terminal only when onBackgroundProcessStop is wired", async () => {
    const stopped: number[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ width: "560px" }}>
                <HappyAgentActivityPanel
                    backgroundProcesses={backgroundProcesses}
                    onBackgroundProcessStop={(id) => stopped.push(id)}
                    now={0}
                    subagents={[]}
                    tasks={[]}
                />
            </div>
        ),
        { width: 600, height: 240, padding: 12 },
    );
    // A second panel without the handler must not render the control.
    view.render(
        () => (
            <div data-testid="no-stop" style={{ width: "560px" }}>
                <HappyAgentActivityPanel
                    backgroundProcesses={backgroundProcesses}
                    now={0}
                    subagents={[]}
                    tasks={[]}
                />
            </div>
        ),
        { width: 600, height: 240, padding: 12 },
    );
    await view.ready();

    expect(
        view.container.querySelector(
            '[data-testid="no-stop"] [data-happy-desktop-ui="happy-agent-activity-process-stop"]',
        ),
    ).toBeNull();

    const stop = view.$(
        '[data-happy-desktop-ui="happy-agent-activity-process-stop"] [data-happy-desktop-ui="button"]',
    ).element as HTMLButtonElement;
    stop.click();
    await vi.waitFor(() => expect(stopped).toEqual([7]));

    await view.screenshot("HappyAgentActivityPanel.stop.test");
}, 120_000);

it("fits long live activity at the minimum desktop content measure", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ width: "320px" }}>
                <HappyAgentActivityPanel
                    backgroundProcesses={[
                        {
                            id: 9,
                            command:
                                "pnpm --dir packages/happy-desktop-electron run-development-server-with-a-long-name",
                            cwd: "/repo",
                            status: "running",
                        },
                    ]}
                    now={64_000}
                    onBackgroundProcessStop={() => undefined}
                    subagents={[
                        {
                            ...subagents[0]!,
                            taskName: "adversarial_review_of_the_minimum_desktop_activity_surface",
                            modelId: "openai/gpt-5.6-sol-with-a-long-provider-suffix",
                        },
                    ]}
                    tasks={tasks.slice(0, 2)}
                />
            </div>
        ),
        { width: 360, height: 640, padding: 12 },
    );
    await view.ready();

    const panel = view.$('[data-happy-desktop-ui="happy-agent-activity-panel"]');
    const panelBounds = panel.bounds();
    const panelRect = panel.element.getBoundingClientRect();
    expect(panelBounds.width).toBe(320);
    expect(
        (panel.element as HTMLElement).scrollWidth,
        "activity panel must not overflow horizontally",
    ).toBeLessThanOrEqual((panel.element as HTMLElement).clientWidth);

    for (const row of view.container.querySelectorAll<HTMLElement>(".happy-delegated-agent")) {
        const bounds = row.getBoundingClientRect();
        expect(bounds.left).toBeGreaterThanOrEqual(panelRect.left);
        expect(
            bounds.right,
            `${row.className} extends to ${String(bounds.right)} inside panel right ${String(panelRect.right)}`,
        ).toBeLessThanOrEqual(panelRect.right);
        expect(getComputedStyle(row).borderTopWidth).toBe("0px");
    }

    const processCommand = view.$(
        '[data-happy-desktop-ui="happy-agent-activity-process"] .happy-delegated-agent__argument',
    );
    expect(processCommand.computedStyle("overflow")).toBe("hidden");
    expect(processCommand.computedStyle("text-overflow")).toBe("ellipsis");

    await view.screenshot("HappyAgentActivityPanel.minimum.test");
}, 120_000);

it("shows an empty state when there is no goal, task, subagent, or process", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ width: "560px" }}>
                <HappyAgentActivityPanel
                    backgroundProcesses={[]}
                    now={0}
                    subagents={[]}
                    tasks={[]}
                />
            </div>
        ),
        { width: 600, height: 200, padding: 12 },
    );
    await view.ready();

    expect(
        view.container.querySelector('[data-happy-desktop-ui="happy-agent-activity-empty"]'),
    ).not.toBeNull();
}, 120_000);
