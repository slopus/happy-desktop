import type {
    HappyAgentBackgroundProcess,
    HappyAgentGoal,
    HappyAgentSessionUsage,
    SubagentSummary,
    HappyAgentTodo,
} from "happy-desktop-state";
import { ComposerPanel } from "../../src/ComposerPanel";
import { HappyAgentActivityPanel } from "../../src/HappyAgentActivityPanel";
import { HappyAgentUsagePanel } from "../../src/HappyAgentUsagePanel";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-249";

// Fixed "now" keeps subagent elapsed timing and quota resets deterministic.
const NOW = Date.UTC(2026, 6, 25, 17, 0, 0);

const goal: HappyAgentGoal = {
    objective: "Keep every session readout out of the transcript's way.",
    status: "active",
    createdAt: NOW - 3_600_000,
    updatedAt: NOW - 60_000,
};

const tasks: readonly HappyAgentTodo[] = [
    {
        id: "t1",
        subject: "Move the readouts above the composer",
        description: "",
        status: "in_progress",
        activeForm: "Moving the readouts above the composer",
        blockedBy: [],
        blocks: [],
    },
    {
        id: "t2",
        subject: "Give each one a way out",
        description: "",
        status: "pending",
        blockedBy: ["t1"],
        blocks: [],
    },
];

/** Enough subagents that the card's bound is what decides its height. */
const subagents: readonly SubagentSummary[] = Array.from({ length: 6 }, (_value, index) => ({
    id: `sub-${String(index + 1)}` as SubagentSummary["id"],
    parentSessionId: "s1" as SubagentSummary["parentSessionId"],
    description: "Adversarial review of the session title",
    taskName: `adversarial_review_${String(index + 1)}`,
    modelId: "openai/gpt-5.6-sol",
    status: index === 0 ? ("running" as const) : ("completed" as const),
    depth: 1,
    createdAt: NOW - 600_000,
    updatedAt: NOW - 5_000,
    ...(index === 0 ? { activeSince: NOW - 95_000 } : { elapsedMs: 140_000 }),
    totalTokens: 170_710 - index * 12_000,
    latestText:
        "The generic parse error rules out the simple path: that one emits a provider error with a specific message before parsing.",
}));

const backgroundProcesses: readonly HappyAgentBackgroundProcess[] = [
    {
        id: 1,
        command: "pnpm --dir packages/happy-desktop-electron dev",
        cwd: "/repo",
        status: "running",
    },
];

const usage: HappyAgentSessionUsage = {
    currentProviderId: "openai",
    groups: [
        {
            modelId: "gpt-5.6-sol",
            providerId: "openai",
            inputTokens: 128_400,
            outputTokens: 24_100,
            cacheReadTokens: 96_000,
            cacheWriteTokens: 12_000,
            totalTokens: 260_500,
            reasoningTokens: 8_200,
            cost: 1.42,
        },
    ],
    totalTokens: 260_500,
    totalCost: 1.42,
    context: {
        modelId: "gpt-5.6-sol",
        providerId: "openai",
        totalTokens: 184_200,
        approximate: true,
    },
    quotas: [
        {
            providerId: "openai",
            windows: [{ kind: "fiveHour", usedPercent: 42, resetsAt: NOW }],
        },
    ],
};

export function ComposerPanelPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The bounded, dismissible card the write end carries at the composer's exact measure: one uninterrupted surface with a 40px title band and capped scrollport. Hosts the `/agents` and `/usage` readouts without taking the transcript's place."
            title="ComposerPanel"
        >
            <Specimen
                detail="`/agents`: a goal, tasks, six subagents, and a background terminal, capped and scrolling"
                label="Session activity"
                number="01"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <ComposerPanel onClose={() => undefined} title="Session activity">
                        <HappyAgentActivityPanel
                            backgroundProcesses={backgroundProcesses}
                            goal={goal}
                            now={NOW}
                            onBackgroundProcessStop={() => undefined}
                            subagents={subagents}
                            tasks={tasks}
                        />
                    </ComposerPanel>
                </div>
            </Specimen>

            <Specimen
                detail="`/usage` with a poll in flight; the freshness word sits beside the title"
                label="Session usage, updating"
                number="02"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <ComposerPanel
                        onClose={() => undefined}
                        status="Updating…"
                        title="Session usage"
                    >
                        <HappyAgentUsagePanel loading usage={usage} />
                    </ComposerPanel>
                </div>
            </Specimen>

            <Specimen
                detail="a reading with nothing in it yet: the card shrinks to its content"
                label="Short content"
                number="03"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <ComposerPanel onClose={() => undefined} title="Session activity">
                        <HappyAgentActivityPanel
                            backgroundProcesses={[]}
                            now={NOW}
                            subagents={[]}
                            tasks={[]}
                        />
                    </ComposerPanel>
                </div>
            </Specimen>

            <Specimen
                detail="at the composer's exact measure, with no divider between title and reading"
                label="Chat measure"
                number="04"
                stage="surface"
            >
                <div style={{ width: "880px" }}>
                    <ComposerPanel onClose={() => undefined} title="Session activity">
                        <HappyAgentActivityPanel
                            backgroundProcesses={backgroundProcesses}
                            now={NOW}
                            onBackgroundProcessStop={() => undefined}
                            subagents={subagents.slice(0, 2)}
                            tasks={[]}
                        />
                    </ComposerPanel>
                </div>
            </Specimen>

            <Specimen
                detail="the activity reading at the narrow content measure available inside the 720×640 minimum desktop window"
                label="Minimum desktop measure"
                number="05"
                stage="surface"
            >
                <div style={{ width: "360px" }}>
                    <ComposerPanel onClose={() => undefined} title="Session activity">
                        <HappyAgentActivityPanel
                            backgroundProcesses={backgroundProcesses}
                            now={NOW}
                            onBackgroundProcessStop={() => undefined}
                            subagents={subagents.slice(0, 2)}
                            tasks={tasks}
                        />
                    </ComposerPanel>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
