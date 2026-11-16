import { useState, type CSSProperties, type ReactNode } from "react";
import type { ConversationToolCall } from "happy-desktop-state";
import { AgentActivityRow } from "./AgentActivityRow";
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

/**
 * AgentToolSection — one run of tool calls as a single grey transcript line.
 *
 * While the run is going the line is its latest call and nothing else; each
 * new call takes the line the way a message arrives, rising into place as the
 * one before it leaves. Once the run ends the same line sums it up: how long
 * it took, then how many calls it was. How a call ended is not this line's
 * news: a failed call reads in the same grey as any other, and the summary
 * counts calls without sorting them. The line is one height throughout, so
 * nothing around it ever moves.
 */
export function AgentToolSection(props: AgentToolSectionProps) {
    const section = props.section;
    /* Whether this line was drawn while its run was going. A section first
       drawn already ended is history: its summary is simply there, and
       nothing arrives. */
    const [watched] = useState(section.live);
    const count = section.members.length;
    const latest = section.members.at(-1)!;
    /* What is leaving the line: the call before the latest, or the latest
       itself once the summary has taken its place. It stays mounted under its
       own key so it leaves from where it stood. */
    const leaving = section.live ? section.members.at(-2) : watched ? latest : undefined;
    const onToolSelect = props.onToolSelect;
    const call = (entry: ConversationToolSectionEntry, state: "current" | "leaving") => (
        <div
            aria-hidden={state === "leaving" ? true : undefined}
            className="happy-tool-section__item"
            data-arrives={state === "current" ? "" : undefined}
            data-happy-desktop-ui="tool-section-item"
            data-state={state}
            key={entry.id}
        >
            <AgentActivityRow
                activity={entry.activity}
                className="happy-tool-section__call"
                /* The line arrives whole; nothing inside it types. */
                motion="calm"
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
                data-arrives={watched ? "" : undefined}
                data-happy-desktop-ui="tool-section-summary"
                data-state="current"
                key="summary"
            >
                <span aria-hidden="true" className="happy-tool-section__glyph">
                    <Icon name="zap" size={12} />
                </span>
                <span className="happy-tool-section__facts">
                    {section.durationMs === undefined ? null : (
                        <>
                            <span data-happy-desktop-ui="tool-section-duration">
                                {elapsedTimeFormat(section.durationMs)}
                            </span>
                            <span aria-hidden="true">·</span>
                        </>
                    )}
                    <span data-happy-desktop-ui="tool-section-count">
                        {`${String(count)} ${count === 1 ? "tool" : "tools"}`}
                    </span>
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
