import { type ReactNode } from "react";
import { AgentUpdateCard, type AgentUpdateCardView } from "../../src/AgentUpdateCard";
import { AppShell } from "../../src/AppShell";
import { Composer } from "../../src/Composer";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import { SidebarAgentUpdate } from "../../src/SidebarAgentUpdate";
import { SidebarFooter } from "../../src/SidebarFooter";
import { SidebarUpdateAction } from "../../src/SidebarUpdateAction";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-288";

const noop = () => undefined;

const AGENTS = [
    { id: "a1", name: "Release bot", onSelect: noop, stage: "tools" },
    { id: "a2", name: "update-progress-blueprints", onSelect: noop, stage: "inference" },
    { id: "a3", name: "release-preview-4", onSelect: noop, stage: "compaction" },
    { id: "a4", name: "inbox-free-text-replies", onSelect: noop, stage: "inference" },
    { id: "a5", name: "sandbox-network-proxy", onSelect: noop, stage: "tools" },
] as const;

/** The card's width in a sidebar of each width: the footer row, inside its 12px insets. */
const CARD_WIDTHS = [
    { card: 264, sidebar: 288 },
    { card: 196, sidebar: 220 },
] as const;

type Phase = {
    readonly label: string;
    readonly detail: string;
    readonly view: AgentUpdateCardView;
    /** Whether the drain can still be cut short, and whether that was asked for. */
    readonly restart?: "available" | "pending";
};

const DRAINING_FIVE: Phase = {
    detail: "More than fit: one named, the second line counts the rest, Restart now below them",
    label: "Finishing work · 5 agents",
    restart: "available",
    view: {
        agentCount: 5,
        agents: AGENTS,
        elapsedMs: 252_000,
        kind: "draining",
        operationCount: 0,
    },
};
const STOPPING: Phase = {
    detail: "Drained, the daemon is asked to exit",
    label: "Shutting down",
    view: { elapsedMs: 261_000, kind: "stopping", killed: false },
};
const STARTING: Phase = {
    detail: "The new version is coming up",
    label: "Starting",
    view: { elapsedMs: 264_000, kind: "starting" },
};
const RESTARTED: Phase = {
    detail: "A restart onto the same version, such as happy-agent reload, closes with its own word",
    label: "Restarted",
    view: { kind: "done", reason: "restart", tookMs: 272_000 },
};
const DONE: Phase = {
    detail: "Measured by this window from the update's start; clears itself after 3 seconds",
    label: "Updated",
    view: { kind: "done", tookMs: 102_000 },
};
const FAILED: Phase = {
    detail: "A failed drain leaves the old daemon serving · one way out besides retrying",
    label: "Failed while finishing work",
    view: {
        failedAt: "draining",
        kind: "failed",
        message: "Happy Agent was still finishing 2 agents after 15 minutes.",
    },
};

const PHASES: readonly Phase[] = [
    {
        detail: "What is still running first: each agent by name, opening its chat · Restart now below the list · the clock counts from the update's start",
        label: "Finishing work · 2 agents",
        restart: "available",
        view: {
            agentCount: 2,
            agents: AGENTS.slice(0, 2),
            elapsedMs: 42_000,
            fraction: 0.4,
            kind: "draining",
            operationCount: 0,
        },
    },
    DRAINING_FIVE,
    {
        detail: "A reload run from the command line cannot be cut short here, so all three lines list what is running",
        label: "Finishing work · CLI reload",
        view: {
            agentCount: 3,
            agents: AGENTS.slice(0, 3),
            elapsedMs: 3_729_000,
            fraction: 0.2,
            kind: "draining",
            operationCount: 0,
        },
    },
    {
        detail: "Only internal workers are left: said once, never counted as +N more",
        label: "Finishing work · background only",
        restart: "available",
        view: { agentCount: 0, agents: [], elapsedMs: 9_000, kind: "draining", operationCount: 2 },
    },
    {
        detail: "Asked for: the link waits until the daemon reports it stopping",
        label: "Finishing work · restarting",
        restart: "pending",
        view: {
            agentCount: 5,
            agents: AGENTS,
            elapsedMs: 255_000,
            kind: "draining",
            operationCount: 0,
        },
    },
    STOPPING,
    {
        detail: "Restarted without waiting: what that cost, said plainly",
        label: "Shutting down · restarted now",
        view: { elapsedMs: 256_000, kind: "stopping", killed: true },
    },
    STARTING,
    {
        detail: "The window catches up with the new daemon",
        label: "Reconnecting",
        view: { elapsedMs: 268_000, kind: "reconnecting" },
    },
    DONE,
    RESTARTED,
    {
        detail: "A window that arrived mid-update has no start to measure from and says nothing",
        label: "Updated · unmeasured",
        view: { kind: "done" },
    },
    FAILED,
    {
        detail: "A reload that failed says so in the restart's words",
        label: "Restart failed",
        view: {
            failedAt: "starting",
            kind: "failed",
            message: "The new Happy Agent was not ready after 5 minutes.",
            reason: "restart",
        },
    },
];

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/gu, "-");

const SECTIONS: SidebarSection[] = [
    {
        id: "bots",
        items: [
            { id: "chief", kind: "agent", label: "Chief of Staff" },
            { id: "release", kind: "agent", label: "Release bot", status: "working" },
        ],
        label: "Bots",
    },
    {
        id: "tasks",
        items: [
            { id: "t1", kind: "agent", label: "update-progress-blueprints", status: "working" },
            { id: "t2", kind: "agent", label: "release-preview-4" },
            { id: "t3", kind: "agent", label: "inbox-free-text-replies" },
            { id: "t4", kind: "agent", label: "sandbox-network-proxy" },
        ],
        label: "Tasks",
    },
    {
        id: "projects",
        items: [
            { id: "p1", kind: "project", label: "happy-desktop" },
            { id: "p2", kind: "project", label: "happy-agent" },
            { id: "p3", kind: "project", label: "happy" },
        ],
        label: "Projects",
    },
];

/** The card's handlers for a phase: Restart now while draining, the two ways out once failed. */
function phaseActions(phase: Phase) {
    return {
        ...(phase.restart === undefined
            ? {}
            : { onRestartNow: noop, restartNowPending: phase.restart === "pending" }),
        ...(phase.view.kind === "failed" ? { onChiefOfStaffAsk: noop, onRetry: noop } : {}),
    };
}

/** The whole window: the sidebar with the card, a conversation with its composer beside it. */
function UpdateWindow(props: { readonly sidebar: number; readonly phase: Phase }) {
    return (
        <AppShell
            sidebar={
                <Sidebar
                    activeItemId="t1"
                    brand
                    footer={
                        <SidebarFooter
                            actions={
                                <SidebarAgentUpdate
                                    expanded
                                    onCollapse={noop}
                                    onToggle={noop}
                                    view={props.phase.view}
                                    {...phaseActions(props.phase)}
                                />
                            }
                            onSettingsOpen={noop}
                        />
                    }
                    onCompose={noop}
                    onItemSelect={noop}
                    sections={SECTIONS}
                />
            }
            sidebarCollapsible
            sidebarDefaultWidth={props.sidebar}
        >
            <div
                style={{
                    display: "flex",
                    flex: "1 1 auto",
                    flexDirection: "column",
                    height: "100%",
                    justifyContent: "flex-end",
                    padding: "12px",
                }}
            >
                <Composer
                    mentions={[]}
                    onSend={noop}
                    onValueChange={noop}
                    placeholder="Message Happy…"
                    value="Keep the waveform quiet while I am reading another session."
                />
            </div>
        </AppShell>
    );
}

const WINDOWS = [
    { height: 760, sidebar: 288, width: 1100 },
    { height: 900, sidebar: 288, width: 720 },
    { height: 900, sidebar: 220, width: 720 },
] as const;

const WINDOW_PHASES: readonly Phase[] = [DRAINING_FIVE, STOPPING, STARTING, RESTARTED, FAILED];

function CardAt(props: { readonly width: number; readonly children: ReactNode }) {
    return (
        <div style={{ display: "flex", width: `${String(props.width)}px` }}>{props.children}</div>
    );
}

export function AgentUpdateCardPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A Happy Agent update or restart, told on a card that stands on the sidebar footer while the window stays usable. Every phase is the same 128px-tall frame, as wide as the footer row: the bare looping snail in a 56px square, a title naming the step with the time since the update began beside it, three fixed detail lines, and four equal unlabelled tracks. While work is finishing, the lines list what is still running first and Restart now, with what it costs, sits below them. Only the words change. The footer's update slot turns into a slowly spinning sync button while the update runs and toggles the card; once the update is cleared, the slot is empty again."
            title="Agent update card"
        >
            {CARD_WIDTHS.map((width, widthIndex) => (
                <Specimen
                    detail={`Every phase in the one frame, ${String(width.card)}px wide in a ${String(width.sidebar)}px sidebar · the snail is mounted once per update and loops until it finishes or fails`}
                    key={width.sidebar}
                    label={`Phases · ${String(width.sidebar)}px sidebar`}
                    number={`0${String(widthIndex + 1)}`}
                    stage="surface"
                >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
                        {PHASES.map((phase, index) => (
                            <div
                                data-screen={`1-${String(width.sidebar)}-${String(index + 1).padStart(2, "0")}-${slug(phase.label)}`}
                                key={phase.label}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                    padding: "4px",
                                    width: `${String(width.card + 8)}px`,
                                }}
                            >
                                <CardAt width={width.card}>
                                    <AgentUpdateCard
                                        onCollapse={noop}
                                        view={phase.view}
                                        {...phaseActions(phase)}
                                    />
                                </CardAt>
                                <DimensionRule label={`${phase.label} · ${phase.detail}`} />
                            </div>
                        ))}
                    </div>
                </Specimen>
            ))}

            <Specimen
                detail="Try again · Ask Chief of Staff while the Chief of Staff can be reached; only Try again when it cannot, rather than a link that goes nowhere"
                label="Failure actions"
                number="03"
                stage="surface"
            >
                <div
                    data-screen="2-failure-actions"
                    style={{ display: "flex", flexWrap: "wrap", gap: "24px", padding: "4px" }}
                >
                    <CardAt width={264}>
                        <AgentUpdateCard
                            onChiefOfStaffAsk={noop}
                            onCollapse={noop}
                            onRetry={noop}
                            view={{
                                failedAt: "draining",
                                kind: "failed",
                                message: "Happy Agent refused to drain.",
                            }}
                        />
                    </CardAt>
                    <CardAt width={264}>
                        <AgentUpdateCard
                            onCollapse={noop}
                            onRetry={noop}
                            view={{
                                failedAt: "starting",
                                kind: "failed",
                                message: "The new version did not start in time.",
                            }}
                        />
                    </CardAt>
                    <CardAt width={196}>
                        <AgentUpdateCard
                            chiefOfStaffPending
                            onChiefOfStaffAsk={noop}
                            onCollapse={noop}
                            onRetry={noop}
                            view={{
                                failedAt: "reconnecting",
                                kind: "failed",
                                message: "Happy Agent did not answer after it started.",
                            }}
                        />
                    </CardAt>
                </div>
            </Specimen>

            <Specimen
                detail="Before: the orange update mark · during: the sync button, pressed while the card is open, the card standing 8px above the footer on its 12px insets · folded: the sync button alone, still turning · after: the slot is empty"
                label="Footer lifecycle"
                number="04"
                stage="app"
            >
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "24px",
                        alignItems: "flex-end",
                    }}
                >
                    {(
                        [
                            { key: "before", slot: "offer" },
                            { key: "open", slot: "open" },
                            { key: "folded", slot: "folded" },
                            { key: "after", slot: "none" },
                        ] as const
                    ).map((state) => (
                        <div
                            data-screen={`3-footer-${state.key}`}
                            key={state.key}
                            style={{
                                border: "1px solid var(--divider)",
                                display: "flex",
                                height: "260px",
                                width: "288px",
                            }}
                        >
                            <Sidebar
                                activeItemId=""
                                footer={
                                    <SidebarFooter
                                        actions={
                                            state.slot === "offer" ? (
                                                <SidebarUpdateAction
                                                    action="install"
                                                    onAction={noop}
                                                    status="downloaded"
                                                    subject="happyAgent"
                                                    version="0.4.2"
                                                />
                                            ) : state.slot === "none" ? undefined : (
                                                <SidebarAgentUpdate
                                                    expanded={state.slot === "open"}
                                                    onCollapse={noop}
                                                    onToggle={noop}
                                                    view={{ kind: "starting" }}
                                                />
                                            )
                                        }
                                        onSettingsOpen={noop}
                                    />
                                }
                                onCompose={noop}
                                onItemSelect={noop}
                                sections={[]}
                                style={{ width: "100%" }}
                            />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="The snail is drawn at its own proportions in a square it never gives up, at either sidebar width"
                label="Snail"
                number="05"
                stage="surface"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
                    {CARD_WIDTHS.map((width) => (
                        <div
                            data-screen={`4-snail-${String(width.sidebar)}`}
                            key={width.sidebar}
                            style={{ display: "flex", padding: "4px" }}
                        >
                            <CardAt width={width.card}>
                                <AgentUpdateCard
                                    onCollapse={noop}
                                    view={DRAINING_FIVE.view}
                                    {...phaseActions(DRAINING_FIVE)}
                                />
                            </CardAt>
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="The stacked Happy Engineering wordmark heads the sidebar where the window has no traffic lights: Happy in the theme's ink, Engineering in #e6522c"
                label="Wordmark"
                number="06"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "24px" }}>
                    {(["light", "dark"] as const).map((mode) => (
                        <div
                            data-screen={`5-wordmark-${mode}`}
                            key={mode}
                            style={{ display: "flex" }}
                        >
                            <ThemeScope mode={mode}>
                                <div
                                    style={{
                                        background: "var(--surface)",
                                        border: "1px solid var(--divider)",
                                        display: "flex",
                                        height: "200px",
                                        width: "288px",
                                    }}
                                >
                                    <Sidebar
                                        activeItemId=""
                                        brand
                                        onCompose={noop}
                                        onItemSelect={noop}
                                        sections={SECTIONS.slice(0, 1)}
                                        style={{ width: "288px" }}
                                    />
                                </div>
                            </ThemeScope>
                        </div>
                    ))}
                </div>
            </Specimen>

            {WINDOWS.flatMap((size, sizeIndex) =>
                WINDOW_PHASES.map((phase, phaseIndex) => (
                    <FullScreenSpecimen
                        detail={`${String(size.width)} × ${String(size.height)} window, ${String(size.sidebar)}px sidebar · the card stays inside the sidebar column, clear of the conversation and its composer`}
                        key={`${String(sizeIndex)}-${phase.label}`}
                        label={`${phase.label} · ${String(size.width)} × ${String(size.height)} · ${String(size.sidebar)}px sidebar`}
                        number={`${String(7 + sizeIndex)}.${String(phaseIndex + 1)}`}
                        screen={`6-sb${String(size.sidebar)}-${String(phaseIndex + 1)}-${slug(phase.label)}-${String(size.width)}x${String(size.height)}`}
                        window={{ height: size.height, width: size.width }}
                    >
                        <UpdateWindow phase={phase} sidebar={size.sidebar} />
                    </FullScreenSpecimen>
                )),
            )}
        </ComponentPage>
    );
}
