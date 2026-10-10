import { useState } from "react";
import type {
    HappyAgentBackgroundProcess,
    HappyAgentGoal,
    SubagentSummary,
    HappyAgentTodo,
} from "happy-desktop-state";
import { Button } from "../../src/Button";
import { HappyAgentActivityPanel } from "../../src/HappyAgentActivityPanel";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-157";

// Fixed "now" keeps subagent elapsed timing deterministic for screenshots.
const NOW = Date.UTC(2026, 6, 25, 17, 0, 0);

const goal: HappyAgentGoal = {
    objective:
        "Build a fully featured Happy Agent client UI that matches the TUI feature-for-feature.",
    status: "active",
    createdAt: NOW - 3_600_000,
    updatedAt: NOW - 60_000,
};

const tasks: readonly HappyAgentTodo[] = [
    {
        id: "t1",
        subject: "Design the usage API",
        description: "",
        status: "completed",
        blockedBy: [],
        blocks: [],
    },
    {
        id: "t2",
        subject: "Wire the activity panel",
        description: "",
        status: "in_progress",
        activeForm: "Wiring the activity panel through the store",
        blockedBy: [],
        blocks: [],
    },
    {
        id: "t3",
        subject: "Cross-browser tests",
        description: "",
        status: "pending",
        blockedBy: ["t2"],
        blocks: [],
    },
];

const subagents: readonly SubagentSummary[] = [
    {
        id: "sub-1" as SubagentSummary["id"],
        parentSessionId: "s1" as SubagentSummary["parentSessionId"],
        description: "Research the protocol surface",
        taskName: "protocol-research",
        modelId: "gpt-5.6-sol",
        status: "running",
        depth: 1,
        createdAt: NOW - 120_000,
        updatedAt: NOW - 5_000,
        activeSince: NOW - 90_000,
        totalTokens: 12_500,
        latestText: "Reading the transport module to map the usage endpoint.",
    },
    {
        id: "sub-2" as SubagentSummary["id"],
        parentSessionId: "s1" as SubagentSummary["parentSessionId"],
        description: "Draft the migration",
        modelId: "sonnet-5",
        status: "completed",
        depth: 1,
        createdAt: NOW - 300_000,
        updatedAt: NOW - 200_000,
        elapsedMs: 95_000,
        totalTokens: 48_200,
    },
];

const backgroundProcesses: readonly HappyAgentBackgroundProcess[] = [
    {
        id: 1,
        command: "pnpm --dir packages/happy-desktop-electron dev",
        cwd: "/repo",
        status: "running",
    },
    { id: 2, command: "vite --host", cwd: "/repo", status: "running" },
];

function DynamicActivityPanelFixture() {
    const [completed, setCompleted] = useState(false);
    const currentSubagents: readonly SubagentSummary[] = subagents.map((subagent, index) =>
        index !== 0
            ? subagent
            : {
                  ...subagent,
                  status: completed ? "completed" : "running",
                  ...(completed ? { elapsedMs: 90_000 } : {}),
              },
    );
    return (
        <div
            style={{
                alignItems: "flex-start",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                width: "560px",
            }}
        >
            <Button
                onClick={() => setCompleted((value) => !value)}
                size="small"
                variant="secondary"
            >
                {completed ? "Resume active subagent" : "Complete active subagent"}
            </Button>
            <HappyAgentActivityPanel
                backgroundProcesses={backgroundProcesses}
                onBackgroundProcessStop={() => undefined}
                goal={goal}
                now={NOW}
                onSubagentSelect={() => undefined}
                subagents={currentSubagents}
                tasks={tasks}
            />
        </div>
    );
}

export function HappyAgentActivityPanelPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Happy Agent session activity monitor (`/goal`, `/tasks`, `/agents`, `/ps`): live agents and terminals lead, settled agents stay in a collapsed disclosure, and agent rows can open their session. SSE-reactive."
            title="HappyAgentActivityPanel"
        >
            <Specimen
                detail="a live fixture: complete and resume its active subagent to inspect stable alignment across reactive updates"
                label="Dynamic populated"
                number="01"
                stage="surface"
            >
                <DynamicActivityPanelFixture />
            </Specimen>

            <Specimen
                detail="the Completed disclosure directly rendered open, with its delegated-session navigation affordance"
                label="Completed expanded"
                number="01b"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <HappyAgentActivityPanel
                        backgroundProcesses={[]}
                        completedInitiallyOpen
                        now={NOW}
                        onSubagentSelect={() => undefined}
                        subagents={subagents.slice(1)}
                        tasks={[]}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="tasks only, no goal or subagents"
                label="Tasks only"
                number="02"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <HappyAgentActivityPanel
                        backgroundProcesses={[]}
                        now={NOW}
                        subagents={[]}
                        tasks={tasks}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="nothing tracked for this session yet"
                label="Empty"
                number="03"
                stage="surface"
            >
                <div style={{ width: "560px" }}>
                    <HappyAgentActivityPanel
                        backgroundProcesses={[]}
                        now={NOW}
                        subagents={[]}
                        tasks={[]}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="360px content measure inside the 720×640 minimum desktop window; long model, activity, and terminal text must wrap without horizontal overflow"
                label="Minimum desktop measure"
                number="04"
                stage="surface"
            >
                <div style={{ width: "360px" }}>
                    <HappyAgentActivityPanel
                        backgroundProcesses={backgroundProcesses.slice(0, 1)}
                        now={NOW}
                        onBackgroundProcessStop={() => undefined}
                        onSubagentSelect={() => undefined}
                        subagents={subagents.slice(0, 1)}
                        tasks={tasks.slice(0, 2)}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="the full-height, independently scrolling treatment used by the workspace side panel"
                label="Activity tab"
                number="05"
                stage="surface"
            >
                <div style={{ display: "flex", height: "360px", width: "360px" }}>
                    <HappyAgentActivityPanel
                        backgroundProcesses={backgroundProcesses}
                        goal={goal}
                        now={NOW}
                        onBackgroundProcessStop={() => undefined}
                        onSubagentSelect={() => undefined}
                        placement="panel"
                        subagents={subagents}
                        tasks={tasks}
                    />
                </div>
            </Specimen>

            <Specimen
                detail="the 250px minimum side-panel width; status moves above content so names and commands keep their readable measure"
                label="Narrow activity tab"
                number="06"
                stage="surface"
            >
                <div style={{ display: "flex", height: "360px", width: "250px" }}>
                    <HappyAgentActivityPanel
                        backgroundProcesses={backgroundProcesses}
                        goal={goal}
                        now={NOW}
                        onBackgroundProcessStop={() => undefined}
                        onSubagentSelect={() => undefined}
                        placement="panel"
                        subagents={subagents}
                        tasks={tasks}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
