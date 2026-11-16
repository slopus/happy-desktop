import { useState, type CSSProperties, type ReactNode } from "react";
import type { ConversationToolCall } from "happy-desktop-state";
import { AgentActivityRow } from "./AgentActivityRow";
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
    /** Opens the shown call's complete body in an owner-provided detail surface. */
    onToolSelect?: (entryId: string, tool: ConversationToolCall) => void;
    /** What the Happy references a call names read as. */
    references?: MessageReferences;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** The line shows the run summed up rather than one of its calls. */
const SUMMARY = Symbol("summary");

/**
 * AgentToolSection — one run of tool calls as a single grey transcript line.
 *
 * While the run is going the line is its latest call and nothing else; each
 * new call comes in the way a reply arrives in the mobile app, a character at
 * a time, and replaces the one before it letter by letter: as each place's
 * turn comes, the character that stood there goes and the new one takes it.
 * Once the run ends the summary replaces the last call the same way: how long
 * the run took, then how many calls it was. How a call ended is not this
 * line's news: a failed call reads in the same grey as any other, and the
 * summary counts calls without sorting them. The line is one height
 * throughout, so nothing around it ever moves.
 */
export function AgentToolSection(props: AgentToolSectionProps) {
    const section = props.section;
    const latest = section.members.at(-1)!;
    /* What the line shows: a call, by its entry, or the summary. */
    const showing = section.live ? latest.id : SUMMARY;
    /* What this line showed last, and what that replaced. Only a line this
       component drew can leave: a section first drawn already ended is
       history, and one first drawn mid-run starts at its latest call.
       Compared during render, as TypedText compares its own. */
    const [line, setLine] = useState<{ shown: string | typeof SUMMARY; left?: string }>({
        shown: showing,
    });
    if (line.shown !== showing)
        setLine({ shown: showing, ...(line.shown === SUMMARY ? {} : { left: line.shown }) });
    const leaving =
        line.left === undefined
            ? undefined
            : section.members.find((member) => member.id === line.left);
    const count = section.members.length;
    /* How long the run took, then how many calls it was. */
    const facts = [
        ...(section.durationMs === undefined ? [] : [elapsedTimeFormat(section.durationMs)]),
        `${String(count)} ${count === 1 ? "tool" : "tools"}`,
    ].join(" · ");
    const onToolSelect = props.onToolSelect;
    const call = (entry: ConversationToolSectionEntry, state: "current" | "leaving") => (
        <div
            aria-hidden={state === "leaving" ? true : undefined}
            className="happy-tool-section__item"
            data-arrives=""
            data-arriving-text={state === "leaving" ? "leaving" : undefined}
            data-happy-desktop-ui="tool-section-item"
            data-state={state}
            /* Its own key: the call keeps its characters as it leaves. */
            key={`call:${entry.id}`}
        >
            <AgentActivityRow
                activity={entry.activity}
                className="happy-tool-section__call"
                motion="arriving"
                {...(onToolSelect && state === "current"
                    ? { onToolSelect: (tool: ConversationToolCall) => onToolSelect(entry.id, tool) }
                    : {})}
                {...(props.references ? { references: props.references } : {})}
                singleLine={entry.activity.kind === "tool"}
                treatment="focused"
            />
        </div>
    );
    const items: ReactNode[] = [];
    if (leaving) items.push(call(leaving, "leaving"));
    if (section.live) items.push(call(latest, "current"));
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
                    {leaving ? <ArrivingText value={facts} /> : facts}
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
            </div>
        </div>
    );
}
