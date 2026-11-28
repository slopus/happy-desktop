import { createContext, useState, type CSSProperties, type ReactNode } from "react";
import type { ConversationToolCall } from "happy-desktop-state";
import { AgentActivityRow, AgentActivityTime, agentActivityKindName } from "./AgentActivityRow";
import { ArrivingText } from "./ArrivingText";
import type {
    ConversationToolSection,
    ConversationToolSectionEntry,
} from "./conversationToolSections";
import { elapsedTimeFormat } from "./elapsedTimeFormat";
import { Icon } from "./Icon";
import type { MessageReferences } from "./messageReferences";

export type AgentToolSectionProps = {
    /** The run of calls, whether it is still going, and how long it took. */
    section: ConversationToolSection;
    /** The surface clock, for how long a running call has run. */
    now?: number;
    /** When the run's last call started, shown on hover. */
    time?: string;
    /** Opens the shown call's complete body in an owner-provided detail surface. */
    onToolSelect?: (entryId: string, tool: ConversationToolCall) => void;
    /** What the Happy references a call names read as. */
    references?: MessageReferences;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * Group tool calls: whether a transcript draws a run of tool calls as one
 * `AgentToolSection` line rather than a row for each call. It comes from the
 * appearance (`ThemeScope`), and is off unless the reader turned it on.
 */
export const ToolCallsGroupedContext = createContext(false);

/** How many kinds of step a summary names before it counts the rest. */
const KINDS_NAMED = 4;

/**
 * What a run was made of: each kind of step with how many of it there were,
 * the most frequent first and otherwise in the order they first ran. A kind
 * that ran once goes without its number. Past `KINDS_NAMED` kinds the rest
 * are counted together, so the line ends on a whole word rather than being
 * cut through one.
 */
function sectionKinds(members: readonly ConversationToolSectionEntry[]): readonly string[] {
    const counts = new Map<string, number>();
    for (const member of members) {
        const name = agentActivityKindName(member.activity) ?? "Tool";
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    /* `sort` is stable, so kinds that ran equally often keep their first order. */
    const kinds = [...counts].sort((left, right) => right[1] - left[1]);
    const named = kinds.length > KINDS_NAMED ? kinds.slice(0, KINDS_NAMED - 1) : kinds;
    const rest = kinds.slice(named.length).reduce((total, kind) => total + kind[1], 0);
    return [
        ...named.map(([name, count]) => (count > 1 ? `${name} ${String(count)}` : name)),
        ...(rest > 0 ? [`+${String(rest)} more`] : []),
    ];
}

/** The line shows the run summed up rather than one of its calls. */
const SUMMARY = Symbol("summary");

/**
 * AgentToolSection — one run of tool calls as a single grey transcript line.
 *
 * While the run is going the line is its latest call and nothing else; each
 * new call comes in the way a reply arrives in the mobile app, a character at
 * a time, and replaces the one before it letter by letter: as each place's
 * turn comes, the character that stood there goes and the new one takes it.
 * Once the run ends the summary replaces the last call the same way: what the
 * run was made of, then how long it took, as "Read 4 · Edit 2 · Bash · 3m 12s".
 * A run of one call is never summed up: it ends as that call's line, at rest,
 * and history draws it the same way. How a call ended is not this line's
 * news: a failed call reads in the same grey as any other, and the summary
 * counts it with its kind. The line is one height throughout, so nothing
 * around it ever moves.
 */
export function AgentToolSection(props: AgentToolSectionProps) {
    const section = props.section;
    const latest = section.members.at(-1)!;
    /* What the line shows: a call, by its entry, or the summary. A run of
       one call is never summed up: that call is all there is to say. */
    const showing = section.live || section.members.length === 1 ? latest.id : SUMMARY;
    /* What this line showed last, what that replaced, and whether it is at
       rest: drawn already ended, as history is, with nothing arriving since.
       Only a line this component drew can leave, and one first drawn mid-run
       starts at its latest call. Compared during render, as TypedText
       compares its own. */
    const [line, setLine] = useState<{
        shown: string | typeof SUMMARY;
        left?: string;
        rest?: boolean;
    }>({ shown: showing, ...(section.live ? {} : { rest: true }) });
    if (line.shown !== showing)
        setLine({ shown: showing, ...(line.shown === SUMMARY ? {} : { left: line.shown }) });
    const leaving =
        line.left === undefined
            ? undefined
            : section.members.find((member) => member.id === line.left);
    /* What the run was made of, then how long it took. The duration is
       never what gives way to a narrow row: the kinds end in an ellipsis
       first. */
    const kinds = sectionKinds(section.members).join(" · ");
    /* A run over within the second says no time at all rather than "0s". */
    const duration =
        section.durationMs === undefined || section.durationMs < 1_000
            ? undefined
            : ` · ${elapsedTimeFormat(section.durationMs)}`;
    const runningAt = section.live
        ? section.members
              .filter((m) => m.activity.kind === "tool" && m.activity.tool.status === "running")
              .at(-1)?.occurredAt
        : undefined;
    const runningMs =
        runningAt === undefined || props.now === undefined ? 0 : props.now - runningAt;
    const onToolSelect = props.onToolSelect;
    const call = (entry: ConversationToolSectionEntry, state: "current" | "leaving") => (
        <div
            aria-hidden={state === "leaving" ? true : undefined}
            className="happy-tool-section__item"
            data-arrives={line.rest === true ? undefined : ""}
            data-arriving-text={state === "leaving" ? "leaving" : undefined}
            data-happy-desktop-ui="tool-section-item"
            data-state={state}
            /* Its own key: the call keeps its characters as it leaves. */
            key={`call:${entry.id}`}
        >
            <AgentActivityRow
                activity={entry.activity}
                className="happy-tool-section__call"
                motion={line.rest === true ? "calm" : "arriving"}
                {...(onToolSelect && state === "current"
                    ? { onToolSelect: (tool: ConversationToolCall) => onToolSelect(entry.id, tool) }
                    : {})}
                {...(props.references ? { references: props.references } : {})}
                singleLine={entry.activity.kind === "tool"}
                treatment="focused"
            />
            {state === "current" && runningMs >= 1_000 ? (
                <span className="happy-tool-section__duration">
                    {`· ${elapsedTimeFormat(runningMs)}`}
                </span>
            ) : null}
        </div>
    );
    const items: ReactNode[] = [];
    if (leaving) items.push(call(leaving, "leaving"));
    if (showing !== SUMMARY) items.push(call(latest, "current"));
    else
        items.push(
            <div
                className="happy-tool-section__item"
                /* The summary arrives only over a call it replaces. */
                data-arrives={leaving ? "" : undefined}
                data-happy-desktop-ui="tool-section-summary"
                data-state="current"
                key="summary"
            >
                <span aria-hidden="true" className="happy-tool-section__glyph">
                    <Icon name="zap" size={12} />
                </span>
                <span
                    className="happy-tool-section__facts"
                    data-happy-desktop-ui="tool-section-facts"
                >
                    <span className="happy-tool-section__kinds">
                        {leaving ? <ArrivingText value={kinds} /> : kinds}
                    </span>
                    {duration === undefined ? null : (
                        <span className="happy-tool-section__duration">
                            {leaving ? (
                                <ArrivingText lead={Array.from(kinds).length} value={duration} />
                            ) : (
                                duration
                            )}
                        </span>
                    )}
                </span>
            </div>,
        );
    return (
        <div
            className={["happy-tool-section", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="tool-section"
            data-live={section.live ? "" : undefined}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-tool-section__line" data-happy-desktop-ui="tool-section-line">
                {items}
                <AgentActivityTime time={props.time} />
            </div>
        </div>
    );
}
