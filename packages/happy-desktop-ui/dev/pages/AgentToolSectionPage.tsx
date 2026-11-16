import { useState } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ConversationAuthor,
    type ConversationEntry,
    type ConversationToolCall,
} from "happy-desktop-state";
import { AgentToolSection } from "../../src/AgentToolSection";
import { ConversationView } from "../../src/ConversationView";
import {
    conversationToolSections,
    type ConversationToolSection,
} from "../../src/conversationToolSections";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-351";

/*
 * One long turn as the app would hand it to the view moment by moment: the
 * agent says something, runs a batch of tools, says something more, runs
 * another batch with a failure in it, and finishes. Every step is the props
 * at that moment, so a section can be watched going from its live line to its
 * summary on the same line.
 */

const START = Date.parse("2026-11-16T10:00:00.000Z");

function message(
    id: string,
    sender: ConversationAuthor,
    text: string,
    at: number,
): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "tool-sections",
            sequence: id,
            changePts: id,
            sender,
            text,
            ...(sender.kind === "agent" ? { generationStatus: "complete" as const } : {}),
            attachments: [],
            reactions: [],
            createdAt: new Date(START + at).toISOString(),
        },
    };
}

type Call = Extract<ConversationEntry, { kind: "agentActivity" }>;

function call(
    id: string,
    toolName: string,
    summary: string,
    status: ConversationToolCall["status"],
    at: number,
    extra: Partial<ConversationToolCall> = {},
): Call {
    return {
        kind: "agentActivity",
        id,
        sequence: id,
        occurredAt: START + at,
        activity: {
            kind: "tool",
            tool: {
                toolCallId: id,
                toolName,
                arguments: {},
                status,
                failed: status === "failed",
                summary,
                summaryKind: "description",
                ...extra,
            },
        },
    };
}

function added(path: string, lines: number): ConversationToolCall["presentation"] {
    return {
        type: "fileDiff",
        files: [{ path, kind: "add", added: lines, deleted: 0, omittedLines: 0, hunks: [] }],
        omittedFiles: 0,
    };
}

function edited(path: string, more: number, fewer: number): ConversationToolCall["presentation"] {
    return {
        type: "fileDiff",
        files: [{ path, kind: "update", added: more, deleted: fewer, omittedLines: 0, hunks: [] }],
        omittedFiles: 0,
    };
}

function compaction(id: string, status: "running" | "success", at: number): Call {
    return {
        kind: "agentActivity",
        id,
        sequence: id,
        occurredAt: START + at,
        activity: {
            kind: "labeled",
            label: status === "running" ? "Compacting context" : "Compacted context",
            subject: status === "running" ? "404k tokens" : "404k → 39.1k tokens",
            status,
            mono: false,
        },
    };
}

function turnStatus(id: string, at: number, failed = false): ConversationEntry {
    return {
        kind: "turnStatus",
        id,
        sequence: id,
        status: failed ? "failed" : "complete",
        reason: failed ? "abort" : "completed",
        durationMs: at,
        endedAt: START + at,
    };
}

const ASK = message(
    "u1",
    happyAgentOwnerAuthor,
    "Move the numeric limits every tool hard-codes into one constants module.",
    0,
);
const INTRO = message(
    "a1",
    agentAuthor,
    "I'll read the compiler head first, then list the constants each tool defines.",
    2_000,
);

/** The first run, with its last call in the state the step asks for. */
function firstRun(last: ConversationToolCall["status"], count = 6): readonly Call[] {
    const calls = [
        call("t1", "read", "Read compiler head", "success", 4_000),
        call("t2", "read", "Read tool registry", "success", 9_000),
        call("t3", "grep", "List numeric constants per tool", "failed", 15_000),
        call("t4", "grep", "List numeric constants in src/tools", "success", 21_000),
        call("t5", "read", "Read limits.ts", "success", 30_000),
        call(
            "t6",
            "apply_patch",
            "Add constants.ts",
            last,
            41_000,
            last === "success" ? { presentation: added("src/constants.ts", 118) } : {},
        ),
    ];
    return calls.slice(0, count);
}

/** The first run with its failed search behind it and the next one going. */
function live3(): readonly Call[] {
    return [
        ...firstRun("success", 3),
        call("t4", "grep", "List numeric constants in src/tools", "running", 21_000),
    ];
}

const MIDDLE = message(
    "a2",
    agentAuthor,
    "The constants are in one module now. Next I'll point each tool at it and run the tests.",
    196_000,
);

function secondRun(count: number, last: ConversationToolCall["status"]): readonly Call[] {
    const calls: Call[] = [
        call("s1", "edit", "Edit read.ts", "success", 200_000, {
            presentation: edited("src/tools/read.ts", 4, 9),
        }),
        call("s2", "edit", "Edit grep.ts", "success", 208_000, {
            presentation: edited("src/tools/grep.ts", 12, 3),
        }),
        compaction("s3", "success", 215_000),
        call("s4", "edit", "Edit bash.ts", "success", 240_000),
        call("s5", "bash", "Run the tool tests", "failed", 262_000),
        call("s6", "edit", "Fix the bash timeout import", "success", 281_000),
        call("s7", "bash", "Run the tool tests", "success", 300_000),
        call("s8", "bash", "Run the type checker", last, 322_000),
    ];
    return calls.slice(0, count);
}

const ANSWER = message(
    "a3",
    agentAuthor,
    "Every tool reads its limits from `src/constants.ts`. The tests and the type checker pass.",
    341_000,
);

/** A turn that reaches for tools before it says anything, then one already folded away. */
const TOOL_FIRST: readonly ConversationEntry[] = [
    message("f-u1", happyAgentOwnerAuthor, "Why does the nightly build fail?", 0),
    call("f1", "bash", "Fetch the nightly build log", "success", 2_000),
    call("f2", "grep", "Search the log for errors", "success", 9_000),
    call("f3", "read", "Read build.config.ts", "success", 14_000),
    message(
        "f-a1",
        agentAuthor,
        "The build runs out of memory while bundling the workers. I'll raise the limit and rerun it.",
        21_000,
    ),
    call("f4", "edit", "Edit build.config.ts", "success", 24_000, {
        presentation: {
            type: "fileDiff",
            files: [
                {
                    path: "build.config.ts",
                    kind: "update",
                    added: 2,
                    deleted: 1,
                    omittedLines: 0,
                    hunks: [],
                },
            ],
            omittedFiles: 0,
        },
    }),
    call("f5", "bash", "Run the nightly build", "running", 31_000),
];

interface Step {
    readonly label: string;
    readonly entries: readonly ConversationEntry[];
    readonly running: boolean;
}

const STEPS: readonly Step[] = [
    {
        label: "First call running",
        entries: [ASK, INTRO, ...firstRun("running", 1)],
        running: true,
    },
    {
        label: "A failed call",
        entries: [
            ASK,
            INTRO,
            ...firstRun("success", 2),
            call("t3", "grep", "List numeric constants per tool", "running", 15_000),
        ],
        running: true,
    },
    { label: "Done, failed, and running", entries: [ASK, INTRO, ...live3()], running: true },
    { label: "Sixth call running", entries: [ASK, INTRO, ...firstRun("running")], running: true },
    { label: "Sixth call done", entries: [ASK, INTRO, ...firstRun("success")], running: true },
    {
        label: "Text resumes: the section ends",
        entries: [ASK, INTRO, ...firstRun("success"), MIDDLE],
        running: true,
    },
    {
        label: "Second run: an edit lands",
        entries: [ASK, INTRO, ...firstRun("success"), MIDDLE, ...secondRun(1, "running")],
        running: true,
    },
    {
        label: "Another edit replaces it",
        entries: [ASK, INTRO, ...firstRun("success"), MIDDLE, ...secondRun(2, "running")],
        running: true,
    },
    {
        label: "Second run live",
        entries: [ASK, INTRO, ...firstRun("success"), MIDDLE, ...secondRun(5, "running")],
        running: true,
    },
    {
        label: "Second run, last call running",
        entries: [ASK, INTRO, ...firstRun("success"), MIDDLE, ...secondRun(8, "running")],
        running: true,
    },
    {
        label: "Answer streaming",
        entries: [ASK, INTRO, ...firstRun("success"), MIDDLE, ...secondRun(8, "success"), ANSWER],
        running: true,
    },
    {
        label: "Turn finished",
        entries: [
            ASK,
            INTRO,
            ...firstRun("success"),
            MIDDLE,
            ...secondRun(8, "success"),
            ANSWER,
            turnStatus("status", 344_000),
        ],
        running: false,
    },
    {
        label: "Turn stopped mid-call",
        entries: [
            ASK,
            INTRO,
            ...firstRun("success"),
            MIDDLE,
            ...secondRun(7, "success"),
            call("s8", "bash", "Run the type checker", "stopped", 322_000),
            turnStatus("status", 330_000, true),
        ],
        running: false,
    },
];

function Transcript(props: { step: Step; testId?: string }) {
    return (
        <div
            style={{
                display: "flex",
                flex: "1 1 auto",
                minHeight: 0,
                height: "100%",
                background: "var(--surface)",
            }}
        >
            <ConversationView
                activityTreatment="focused"
                agentAuthor={agentAuthor}
                conversationId={`tool-sections-${props.testId ?? "static"}`}
                data-testid={props.testId}
                elapsedMs={props.step.running ? 41_000 : undefined}
                entries={props.step.entries}
                running={props.step.running}
                style={{ flex: "1 1 auto", minWidth: 0 }}
                viewerId={happyAgentOwnerAuthor.id}
                workingPhase="callingTools"
            />
        </div>
    );
}

/** The same conversation stepped through by hand, to watch that nothing moves. */
function ToolSectionPlayer() {
    const [index, setIndex] = useState(0);
    const step = STEPS[index]!;
    return (
        <div
            data-step={index}
            data-testid="tool-section-player"
            style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}
        >
            <div style={{ display: "flex", gap: 8, padding: 8, alignItems: "center" }}>
                <button
                    data-testid="tool-section-back"
                    onClick={() => setIndex((current) => Math.max(0, current - 1))}
                    type="button"
                >
                    Back
                </button>
                <button
                    data-testid="tool-section-next"
                    onClick={() => setIndex((current) => Math.min(STEPS.length - 1, current + 1))}
                    type="button"
                >
                    Next
                </button>
                <span>{`Step ${String(index + 1)} / ${String(STEPS.length)} · ${step.label}`}</span>
            </div>
            <Transcript step={step} testId="tool-section-transcript" />
        </div>
    );
}

/** The section a fixture run comes to, as the transcript would group it. */
function sectionOf(
    calls: readonly Call[],
    running: boolean,
    endedAt = 196_000,
): ConversationToolSection {
    const grouped = conversationToolSections(
        running ? calls : [...calls, turnStatus("end", endedAt)],
        running,
        new Set(),
    );
    return grouped.sections.get(calls[0]!.id)!;
}

export function AgentToolSectionPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One run of tool calls as a single grey transcript line: its latest call while it runs, each new one coming in a character at a time the way a reply arrives in the mobile app, then how long the run took on the same line."
            title="AgentToolSection"
        >
            <Specimen
                detail="32px line · the latest call and nothing else · a failed call reads like any other"
                label="Live"
                number="live"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 760 }}>
                    <AgentToolSection
                        section={sectionOf(
                            [
                                call("l1", "read", "Read compiler head", "success", 4_000),
                                call(
                                    "l2",
                                    "grep",
                                    "List numeric constants per tool",
                                    "failed",
                                    15_000,
                                ),
                                call("l3", "apply_patch", "Add constants.ts", "running", 41_000),
                            ],
                            true,
                        )}
                    />
                    <AgentToolSection section={sectionOf(firstRun("running", 1), true)} />
                    <AgentToolSection section={sectionOf(secondRun(8, "running"), true)} />
                </div>
            </Specimen>
            <Specimen
                detail="The same 32px line · how long the run took, then how many calls it was"
                label="Ended"
                number="ended"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 760 }}>
                    <AgentToolSection
                        section={sectionOf(
                            firstRun("success").filter((entry) => entry.id !== "t3"),
                            false,
                        )}
                    />
                    <AgentToolSection section={sectionOf(firstRun("success"), false)} />
                    <AgentToolSection
                        section={sectionOf(
                            [
                                ...secondRun(7, "success"),
                                call("s8", "bash", "Run the type checker", "stopped", 322_000),
                            ],
                            false,
                            330_000,
                        )}
                    />
                    <AgentToolSection section={sectionOf(firstRun("success", 1), false)} />
                </div>
            </Specimen>
            <FullScreenSpecimen
                detail="A live section: the call in flight and the run so far on one line."
                label="Transcript, live"
                number={`${componentNumber}.1`}
                screen="01-live-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <Transcript step={STEPS[2]!} testId="live" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The first run summed up; the second still live."
                label="Transcript, one section ended"
                number={`${componentNumber}.2`}
                screen="02-ended-and-live-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <Transcript step={STEPS[9]!} testId="ended-and-live" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Both runs summed up: duration, then calls."
                label="Transcript, turn finished"
                number={`${componentNumber}.3`}
                screen="03-finished-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <Transcript step={STEPS[11]!} testId="finished" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A turn stopped mid-call: its run is summed up, nothing spins."
                label="Transcript, turn stopped"
                number={`${componentNumber}.4`}
                screen="04-stopped-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <Transcript step={STEPS[12]!} testId="stopped" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Step through the turn: no row moves as calls arrive, finish, fail, or a section ends."
                label="Transcript, stepped"
                number={`${componentNumber}.5`}
                screen="05-stepped-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <ToolSectionPlayer />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A turn that opens on tools: the section sits under the agent's name."
                label="Transcript, tool-first turn"
                number={`${componentNumber}.7`}
                screen="07-tool-first-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <Transcript
                    step={{ label: "Tool-first", entries: TOOL_FIRST, running: true }}
                    testId="tool-first"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The minimum window: the same one line."
                label="Transcript, minimum window"
                number={`${componentNumber}.6`}
                screen="06-live-720x640"
                window={{ width: 720, height: 640 }}
            >
                <Transcript step={STEPS[9]!} testId="narrow" />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
