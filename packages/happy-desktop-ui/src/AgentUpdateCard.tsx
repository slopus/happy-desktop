import { Button } from "./Button";
import { LottieScene } from "./LottieScene";
import { SegmentedProgress, type SegmentedProgressSegment } from "./SegmentedProgress";
import { Octicon } from "./vectorIcons/VectorIcon";

/** The steps an update runs through, in the order it runs them. */
export type AgentUpdateStep = "draining" | "stopping" | "starting" | "reconnecting";

/** One agent the update is still waiting on, as the daemon named it. */
export interface AgentUpdateCardAgent {
    readonly id: string;
    /** The daemon's stage for it. */
    readonly stage: "inference" | "tools" | "compaction" | "settlement";
    /** The conversation's title, when this window knows the conversation. */
    readonly name?: string;
    /** Opens that conversation. Absent when this window cannot address it. */
    onSelect?(): void;
}

/**
 * What the card is about: moving onto another version, or coming back on the
 * same one. Only the words that close it differ.
 */
export type AgentUpdateCardReason = "update" | "restart";

export type AgentUpdateCardView =
    | {
          readonly kind: "draining";
          /** How long the whole restart has been going, from its own start. */
          readonly elapsedMs?: number;
          /** The waiting agents the reader would recognise, in the daemon's order. */
          readonly agents: readonly AgentUpdateCardAgent[];
          /**
           * How many such agents are waiting in all: the list, plus any the
           * daemon left out of a long one. Internal workers are not counted.
           */
          readonly agentCount: number;
          /** Other work still open, such as internal workers and API writes. */
          readonly operationCount: number;
          /** The share of the drain already finished, once the daemon has reported one. */
          readonly fraction?: number;
      }
    | { readonly kind: "stopping"; readonly killed: boolean; readonly elapsedMs?: number }
    | { readonly kind: "starting"; readonly elapsedMs?: number }
    | { readonly kind: "reconnecting"; readonly elapsedMs?: number }
    /** `tookMs` is present only when the update's start is known. */
    | { readonly kind: "done"; readonly tookMs?: number; readonly reason?: AgentUpdateCardReason }
    | {
          readonly kind: "failed";
          readonly failedAt: AgentUpdateStep;
          readonly message: string;
          readonly reason?: AgentUpdateCardReason;
      };

export interface AgentUpdateCardProps {
    readonly view: AgentUpdateCardView;
    /**
     * Folds the card away. While the update runs it can be opened again from
     * the footer; once it has finished or failed, folding it away clears it.
     */
    onCollapse(): void;
    /** Runs the update again. Offered only on a failed card. */
    onRetry?(): void;
    /**
     * Hands the failure to the Chief of Staff. Absent while the Chief of Staff
     * cannot be reached, so the card never offers a link that goes nowhere.
     */
    onChiefOfStaffAsk?(): void;
    /** The handoff is being written; the link waits for it. */
    chiefOfStaffPending?: boolean;
    /** The Chief of Staff bot's live name. Defaults to "Chief of Staff". */
    chiefOfStaffName?: string;
    /**
     * Stops waiting for the work still running and restarts at once. Offered
     * only while work is finishing; the link says what it costs.
     */
    onRestartNow?(): void;
    /** The restart was asked for; the link waits for the daemon to stop. */
    restartNowPending?: boolean;
    readonly className?: string;
    readonly "data-testid"?: string;
}

/** What an agent is doing, named the way a status is named. */
const STAGE_WORDS: Record<AgentUpdateCardAgent["stage"], string> = {
    compaction: "Compacting history",
    inference: "Thinking",
    settlement: "Finishing up",
    tools: "Running a tool",
};

const STEPS: readonly { readonly id: AgentUpdateStep; readonly label: string }[] = [
    { id: "draining", label: "Finishing work" },
    { id: "stopping", label: "Shutting down" },
    { id: "starting", label: "Starting" },
    { id: "reconnecting", label: "Reconnecting" },
];

/** Every card has exactly this many detail lines, filled or not. */
const DETAIL_LINES = 3;

/**
 * What skipping the drain costs, said beside the action. A shell command or a
 * file edit still running is stopped and recorded as interrupted, and is not
 * run again after the restart; a read-only tool is, and a reply being written
 * picks up from what was saved.
 */
const RESTART_COST = "stops tools";

const RESTART_LINE = { kind: "restart" } as const;
/** The narrow card's cost of "Restart now", on its own line under the action. */
const RESTART_COST_LINE = { kind: "text", text: "Stops running tools" } as const;

type Line =
    | { readonly kind: "empty" }
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "agent"; readonly agent: AgentUpdateCardAgent }
    | { readonly kind: "more"; readonly count: number }
    | { readonly kind: "restart" }
    /** "Try again", and beside it whether the previous version is still serving. */
    | { readonly kind: "retry"; readonly previousRunning: boolean }
    | { readonly kind: "ask" };

/**
 * C-288 AgentUpdateCard — a Happy Agent update, told while the window keeps
 * working.
 *
 * Every box but the width has a fixed size: the 128px-tall card, the 56px
 * snail, one title slot, three detail slots, and the four-track bar. The width
 * is its host's — the sidebar column it sits in — and every line truncates
 * inside it. A phase change rewrites the text in those slots and nothing else,
 * so the card never moves under the pointer while the update runs on its own.
 *
 * While work is finishing the slots list what is still running first, and
 * "Restart now", which stops waiting, takes the last slot below them.
 *
 * The title names the step, and beside it, while the update runs, how long it
 * has been going (at the bar's end on a narrow card, where it cannot fit): measured from the update's own start, which its owner
 * supplies, so a card shown part-way through still counts from the beginning.
 * The bar says where in the sequence that step is, so it carries no labels of
 * its own, and there is no version or step count to read twice. The snail is mounted once and loops while the update runs; when
 * it finishes or fails, the cycle under way plays out and holds.
 */
export function AgentUpdateCard(props: AgentUpdateCardProps) {
    const { view } = props;
    const settled = view.kind === "done" || view.kind === "failed";
    const elapsed = settled ? undefined : view.elapsedMs;
    const detail = (line: Line, index: number) => (
        <DetailLine
            // Slots, not entities: the lines are fixed positions whose words
            // change.
            key={index}
            line={line}
            onChiefOfStaffAsk={props.onChiefOfStaffAsk}
            chiefOfStaffPending={props.chiefOfStaffPending === true}
            chiefOfStaffName={props.chiefOfStaffName ?? "Chief of Staff"}
            onRestartNow={props.onRestartNow}
            restartNowPending={props.restartNowPending === true}
            onRetry={props.onRetry}
        />
    );
    return (
        <div
            aria-live="polite"
            className={["happy-agent-update-card", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="agent-update-card"
            data-phase={view.kind}
            data-testid={props["data-testid"]}
            role="status"
        >
            <div className="happy-agent-update-card__row">
                <span aria-hidden="true" className="happy-agent-update-card__scene">
                    <LottieScene
                        loop={!settled}
                        name="snail"
                        replayLabel="Play the snail again"
                        size={56}
                    />
                </span>
                <span className="happy-agent-update-card__content">
                    <span
                        className="happy-agent-update-card__heading"
                        data-happy-desktop-ui="agent-update-card-heading"
                    >
                        <span
                            className="happy-agent-update-card__title"
                            data-happy-desktop-ui="agent-update-card-title"
                            data-tone={view.kind === "failed" ? "failed" : undefined}
                        >
                            {title(view)}
                        </span>
                        {elapsed === undefined ? null : (
                            <span
                                className="happy-agent-update-card__elapsed"
                                data-form="wide"
                                data-happy-desktop-ui="agent-update-card-elapsed"
                            >
                                {clockText(elapsed)}
                            </span>
                        )}
                    </span>
                    {view.kind === "draining" && props.onRestartNow ? (
                        /* What is still running fills the slots first, and the
                           way out takes the last one. In each of the card's two
                           widths; the narrow card cannot fit the cost beside the
                           action, so it says it on a line of its own. */
                        <>
                            <span className="happy-agent-update-card__lines" data-form="wide">
                                {[
                                    ...slots(drainLines(view, DETAIL_LINES - 1), DETAIL_LINES - 1),
                                    RESTART_LINE,
                                ].map(detail)}
                            </span>
                            <span className="happy-agent-update-card__lines" data-form="narrow">
                                {[drainSummaryNarrow(view), RESTART_LINE, RESTART_COST_LINE].map(
                                    detail,
                                )}
                            </span>
                        </>
                    ) : (
                        slots(linesFilled(view), DETAIL_LINES).map(detail)
                    )}
                </span>
            </div>
            <Button
                aria-label={settled ? "Dismiss" : "Hide update progress"}
                className="happy-agent-update-card__collapse"
                icon="chevron-down"
                iconOnly
                onClick={props.onCollapse}
                size="small"
                variant="ghost"
            />
            <span className="happy-agent-update-card__footer">
                <SegmentedProgress
                    className="happy-agent-update-card__bar"
                    label="Update progress"
                    labels="hidden"
                    segments={segments(view)}
                />
                {/* The narrow card has no room for the clock beside its title,
                    so it reads at the end of the bar instead. */}
                {elapsed === undefined ? null : (
                    <span
                        aria-hidden="true"
                        className="happy-agent-update-card__elapsed"
                        data-form="narrow"
                    >
                        {clockText(elapsed)}
                    </span>
                )}
            </span>
        </div>
    );
}

function DetailLine(props: {
    line: Line;
    onRetry: (() => void) | undefined;
    onChiefOfStaffAsk: (() => void) | undefined;
    chiefOfStaffPending: boolean;
    chiefOfStaffName: string;
    onRestartNow: (() => void) | undefined;
    restartNowPending: boolean;
}) {
    const { line } = props;
    switch (line.kind) {
        case "restart":
            return (
                <span
                    className="happy-agent-update-card__line"
                    data-happy-desktop-ui="agent-update-card-line"
                    title="Restart without waiting. Running commands and file edits are stopped and not run again."
                >
                    <button
                        className="happy-agent-update-card__action"
                        data-happy-desktop-ui="agent-update-card-restart-now"
                        disabled={props.restartNowPending}
                        onClick={props.onRestartNow}
                        type="button"
                    >
                        {props.restartNowPending ? "Restarting…" : "Restart now"}
                    </button>
                    <span className="happy-agent-update-card__text happy-agent-update-card__restart-cost">{`· ${RESTART_COST}`}</span>
                </span>
            );
        case "empty":
            return (
                <span
                    aria-hidden="true"
                    className="happy-agent-update-card__line"
                    data-happy-desktop-ui="agent-update-card-line"
                />
            );
        case "text":
            return (
                <span
                    className="happy-agent-update-card__line"
                    data-happy-desktop-ui="agent-update-card-line"
                    title={line.text}
                >
                    <span className="happy-agent-update-card__text">{line.text}</span>
                </span>
            );
        case "agent": {
            // Only the name is shown, so it gets the whole row; the stage is
            // still read out to a screen reader.
            const name = line.agent.name ?? "Agent";
            const status = STAGE_WORDS[line.agent.stage];
            const words = (
                <span className="happy-agent-update-card__agent-name" title={name}>
                    {name}
                </span>
            );
            return (
                <span
                    className="happy-agent-update-card__line"
                    data-happy-desktop-ui="agent-update-card-line"
                >
                    {line.agent.onSelect ? (
                        <button
                            aria-label={`Open ${name} — ${status}`}
                            className="happy-agent-update-card__agent"
                            data-happy-desktop-ui="agent-update-card-agent"
                            onClick={line.agent.onSelect}
                            type="button"
                        >
                            {words}
                            <Octicon
                                className="happy-agent-update-card__agent-go"
                                name="arrow-up-right"
                                size={12}
                            />
                        </button>
                    ) : (
                        <span
                            className="happy-agent-update-card__agent"
                            data-happy-desktop-ui="agent-update-card-agent"
                        >
                            {words}
                        </span>
                    )}
                </span>
            );
        }
        case "more":
            return (
                <span
                    className="happy-agent-update-card__line"
                    data-happy-desktop-ui="agent-update-card-line"
                >
                    <span
                        className="happy-agent-update-card__text"
                        data-happy-desktop-ui="agent-update-card-more"
                    >
                        {`+${String(line.count)} more`}
                    </span>
                </span>
            );
        case "retry":
            return (
                <span
                    className="happy-agent-update-card__line"
                    data-happy-desktop-ui="agent-update-card-line"
                >
                    {props.onRetry ? (
                        <button
                            className="happy-agent-update-card__action"
                            data-happy-desktop-ui="agent-update-card-retry"
                            onClick={props.onRetry}
                            type="button"
                        >
                            Try again
                        </button>
                    ) : null}
                    {line.previousRunning ? (
                        <span
                            className="happy-agent-update-card__text happy-agent-update-card__note"
                            title="The previous version is still running."
                        >
                            {props.onRetry
                                ? "· old version still running"
                                : "Old version still running"}
                        </span>
                    ) : null}
                </span>
            );
        case "ask":
            return (
                <span
                    className="happy-agent-update-card__line"
                    data-happy-desktop-ui="agent-update-card-line"
                >
                    {props.onChiefOfStaffAsk ? (
                        <button
                            className="happy-agent-update-card__action"
                            data-happy-desktop-ui="agent-update-card-ask"
                            data-quiet=""
                            disabled={props.chiefOfStaffPending}
                            onClick={props.onChiefOfStaffAsk}
                            type="button"
                        >
                            Ask {props.chiefOfStaffName}
                        </button>
                    ) : null}
                </span>
            );
    }
}

function title(view: AgentUpdateCardView): string {
    switch (view.kind) {
        case "draining":
            return "Finishing work";
        case "stopping":
            return "Shutting down";
        case "starting":
            return "Starting";
        case "reconnecting":
            return "Reconnecting";
        case "done":
            return view.reason === "restart" ? "Restarted" : "Updated";
        case "failed":
            return view.reason === "restart" ? "Restart failed" : "Update failed";
    }
}

/** Exactly `count` slots, filled from the top. */
function slots(filled: readonly Line[], count: number): readonly Line[] {
    return Array.from({ length: count }, (_, index): Line => filled[index] ?? { kind: "empty" });
}

/**
 * What the drain is waiting on, in the one slot a narrow card has above
 * "Restart now": the agent when there is only one, otherwise counted.
 */
function drainSummaryNarrow(view: Extract<AgentUpdateCardView, { kind: "draining" }>): Line {
    const total = Math.max(view.agentCount, view.agents.length);
    const only = view.agents.length === 1 && total === 1 ? view.agents[0] : undefined;
    if (total === 0)
        return {
            kind: "text",
            text: view.operationCount === 0 ? "Nothing new starts." : "Background only.",
        };
    if (only) return { agent: only, kind: "agent" };
    return { kind: "text", text: `${String(total)} ${total === 1 ? "agent" : "agents"} working` };
}

/** What a drain is waiting on, in `count` lines; past that the last one counts the rest. */
function drainLines(
    view: Extract<AgentUpdateCardView, { kind: "draining" }>,
    count: number,
): readonly Line[] {
    const total = Math.max(view.agentCount, view.agents.length);
    if (total === 0)
        return [
            {
                kind: "text",
                // Internal work has no name worth reading, so it is said once
                // rather than counted.
                text:
                    view.operationCount === 0 ? "Nothing new is started." : "Background work only.",
            },
        ];
    // Everything fits only when every waiting agent was listed; past that the
    // last slot becomes the count of the rest.
    if (total <= count && view.agents.length === total)
        return view.agents.map((agent): Line => ({ kind: "agent", agent }));
    const shown = view.agents.slice(0, count - 1);
    return [
        ...shown.map((agent): Line => ({ kind: "agent", agent })),
        { kind: "more", count: total - shown.length },
    ];
}

function linesFilled(view: AgentUpdateCardView): readonly Line[] {
    switch (view.kind) {
        case "draining":
            return drainLines(view, DETAIL_LINES);
        case "stopping":
            return view.killed
                ? [
                      { kind: "text", text: "Tools stopped." },
                      { kind: "text", text: "Edits, commands not rerun." },
                  ]
                : [
                      { kind: "text", text: "All work is done." },
                      { kind: "text", text: "Nothing was lost." },
                  ];
        case "starting":
            return [{ kind: "text", text: "Your work is kept." }];
        case "reconnecting":
            return [{ kind: "text", text: "Restoring sessions." }];
        case "done":
            return view.tookMs === undefined
                ? []
                : [{ kind: "text", text: `Took ${durationText(view.tookMs)}` }];
        case "failed":
            return [
                { kind: "text", text: view.message },
                // Only a drain that failed leaves the old daemon in place. Past
                // that it has been stopped, and saying otherwise would be untrue.
                view.failedAt === "draining"
                    ? { kind: "retry", previousRunning: true }
                    : { kind: "retry", previousRunning: false },
                // A line of its own: beside "Try again" it would not fit the
                // sidebar.
                { kind: "ask" },
            ];
    }
}

function segments(view: AgentUpdateCardView): readonly SegmentedProgressSegment[] {
    const at =
        view.kind === "done"
            ? STEPS.length
            : view.kind === "failed"
              ? STEPS.findIndex((step) => step.id === view.failedAt)
              : STEPS.findIndex((step) => step.id === view.kind);
    return STEPS.map((step, index) => {
        const state =
            index < at
                ? "done"
                : index === at
                  ? view.kind === "failed"
                      ? "failed"
                      : "running"
                  : "pending";
        const fraction =
            state === "running" && view.kind === "draining" ? view.fraction : undefined;
        return {
            id: step.id,
            label: step.label,
            state,
            ...(fraction === undefined ? {} : { fraction }),
        };
    });
}

/** "0:42", "4:12", "1:03:09": a running clock, as a stopwatch reads it. */
function clockText(ms: number): string {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(seconds / 60);
    const two = (value: number) => String(value).padStart(2, "0");
    if (minutes < 60) return `${String(minutes)}:${two(seconds % 60)}`;
    return `${String(Math.floor(minutes / 60))}:${two(minutes % 60)}:${two(seconds % 60)}`;
}

/** "42s", "1m 42s", "1h 3m": the measured time, to the second under an hour. */
function durationText(ms: number): string {
    const seconds = Math.max(1, Math.round(ms / 1000));
    if (seconds < 60) return `${String(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${String(minutes)}m ${String(seconds % 60)}s`;
    return `${String(Math.floor(minutes / 60))}h ${String(minutes % 60)}m`;
}
