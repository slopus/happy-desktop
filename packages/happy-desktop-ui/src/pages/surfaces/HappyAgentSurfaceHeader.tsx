import type { ReactNode } from "react";
import { Badge } from "../../Badge";
import { Button } from "../../Button";
import { PanelHeader } from "../../PanelHeader";
import { SurfaceMemberStack, type HappyAgentSurfaceView } from "./surfacePresentation";

export interface HappyAgentSurfaceHeaderProps {
    surface: HappyAgentSurfaceView;
    /** What the Surface's own page offers in its header, before the faces. */
    actions?: ReactNode;
    /** The Surface's shared chat, opened beside it; absent for a type that has none. */
    chat?: HappyAgentSurfaceChatToggle;
    /** Whether the page is centred or across the whole pane; absent for a type that is neither. */
    width?: HappyAgentSurfaceWidthToggle;
    /** A word after the name for what is special about this Surface, such as the team's default vault. */
    marker?: string;
}

/**
 * Whether a Surface's page is centred on its reading column or laid across
 * the whole pane, and how to switch.
 */
export interface HappyAgentSurfaceWidthToggle {
    readonly expanded: boolean;
    readonly onToggle: () => void;
}

/** Whether a Surface's shared chat is open beside it, and how to open or close it. */
export interface HappyAgentSurfaceChatToggle {
    readonly open: boolean;
    readonly onToggle: () => void;
    /**
     * The chat's agent is working, whether or not the chat is open, so the
     * reader sees the work they asked for go on from the Surface itself.
     */
    readonly working?: boolean;
}

/**
 * The header band of one Surface, whatever its type: one line with its name,
 * who made it when that is known, and the faces of who is in it. Joining and
 * leaving belong to its row in the sidebar.
 *
 * The band lines its name and controls up with the page's column: the content
 * column every page of the main lane shares, unless the page states its own in
 * `--happy-agent-surface-column` (and how far into it its text starts,
 * `--happy-agent-surface-column-inset`), or `100%` when it is drawn across the
 * whole pane.
 *
 * It is the window's shared header band (`PanelHeader`), so it is a chat
 * header's height and the row the window is dragged by. Who made it is
 * secondary text, dropped first when the band is narrow.
 */
export function HappyAgentSurfaceHeader(props: HappyAgentSurfaceHeaderProps) {
    const creator = props.surface.creator;
    // An artifact, bot, or task was made elsewhere; who kept it here only added it.
    const kind = props.surface.type.kind;
    const credit =
        kind === "artifact" || kind === "bot" || kind === "task" ? "Added by" : "Created by";
    // A chat Surface is itself a chat among people, so the one with its agent
    // is named for the agent rather than as a second chat.
    const agentChat = kind === "chat";
    return (
        <PanelHeader className="happy-agent-surface-header">
            <div className="happy-agent-surface-header__lead">
                <h1 className="happy-agent-surface-header__title">{props.surface.name}</h1>
                {props.marker ? (
                    <Badge
                        className="happy-agent-surface-header__marker"
                        label={props.marker}
                        variant="outline"
                    />
                ) : null}
                {creator ? (
                    <>
                        <span aria-hidden="true" className="happy-agent-surface-header__dot" />
                        <span className="happy-agent-surface-header__creator">
                            {credit} {creator.name}
                        </span>
                    </>
                ) : null}
            </div>
            {props.actions === undefined ? null : (
                <div className="happy-agent-surface-header__actions">{props.actions}</div>
            )}
            {props.width ? (
                <Button
                    aria-label={props.width.expanded ? "Center the page" : "Use the full width"}
                    aria-pressed={props.width.expanded}
                    className="happy-agent-surface-header__width"
                    data-testid="happy-agent-surface-width-toggle"
                    icon={props.width.expanded ? "width-center" : "width-expand"}
                    iconOnly
                    onClick={props.width.onToggle}
                    size="small"
                    title={props.width.expanded ? "Center the page" : "Use the full width"}
                    variant="ghost"
                />
            ) : null}
            <SurfaceMemberStack members={props.surface.members} />
            {/* At the edge the chat opens from. */}
            {props.chat ? (
                <Button
                    aria-pressed={props.chat.open}
                    className="happy-agent-surface-header__chat"
                    data-testid="happy-agent-surface-chat-toggle"
                    icon={agentChat ? "spark" : "chat"}
                    onClick={props.chat.onToggle}
                    size="small"
                    working={props.chat.working === true}
                    title={
                        props.chat.open
                            ? "Close the chat"
                            : agentChat
                              ? "Open the chat with the agent everyone here shares"
                              : "Open the chat everyone here shares"
                    }
                    variant="ghost"
                >
                    {agentChat ? "Agent" : "Chat"}
                </Button>
            ) : null}
        </PanelHeader>
    );
}
