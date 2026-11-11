import type { ReactNode } from "react";
import { APP_SHELL_SIDEBAR_DEFAULT_WIDTH, AppShell } from "../../AppShell";
import { Box } from "../../Box";
import { Icon, type IconName } from "../../Icon";
import { IconTile, type IconTileTone } from "../../IconTile";
import { PanelHeader } from "../../PanelHeader";
import { ScrollArea } from "../../Scrollbar";
import { Sidebar } from "../../Sidebar";

export interface HappyAgentSettingsCategory {
    readonly id: string;
    readonly label: string;
    readonly icon: IconName;
    /** The hue of the tile the category's glyph sits on, in the column and the header. */
    readonly tone: IconTileTone;
}

export type HappyAgentSettingsShellProps = {
    activeCategoryId: string;
    categories: readonly HappyAgentSettingsCategory[];
    children: ReactNode;
    /** The open category's own subtitle, shown under its title. */
    description?: string;
    onCategorySelect: (id: string) => void;
    /** Leaves settings and returns to the workspace. */
    onClose: () => void;
    /**
     * Present on a page opened from inside the category: the header leads with
     * a back control that returns to the category instead of with its icon.
     */
    onBack?: () => void;
    title: string;
    /** Native macOS window chrome, matching the workspace shell it replaces. */
    windowControls?: boolean;
    windowFullScreen?: boolean;
    windowTrafficLights?: boolean;
    /** A connection rail holds the window's left edge; see `AppShell`. */
    connectionRail?: boolean;
    /** The workspace sidebar's width, so opening Settings does not move the column. */
    sidebarWidth?: number;
};

/**
 * The local workspace's settings window: a permanent category column beside one
 * category's body.
 *
 * The column is not the workspace sidebar and does not collapse — settings is a
 * two-pane place with nothing to gain from hiding half of it — so the control at
 * the top of that column is the way back out rather than a collapse toggle. It is
 * the `Sidebar` drill-down heading, which puts the back control on the same line
 * as the workspace's own toggle and clear of the native traffic lights.
 */
export function HappyAgentSettingsShell(props: HappyAgentSettingsShellProps) {
    return (
        <AppShell
            windowControls={props.windowControls}
            windowFullScreen={props.windowFullScreen}
            windowTrafficLights={props.windowTrafficLights}
            connectionRail={props.connectionRail}
            sidebarDefaultWidth={props.sidebarWidth ?? APP_SHELL_SIDEBAR_DEFAULT_WIDTH}
            sidebar={
                <Sidebar
                    activeItemId={props.activeCategoryId}
                    onBack={props.onClose}
                    onItemSelect={props.onCategorySelect}
                    sections={[
                        {
                            id: "categories",
                            items: props.categories.map((category) => ({
                                icon: category.icon,
                                id: category.id,
                                kind: "view" as const,
                                label: category.label,
                                tile: category.tone,
                            })),
                        },
                    ]}
                    title="Settings"
                />
            }
        >
            <PanelHeader className="happy-agent-settings__header">
                {props.onBack ? (
                    <button
                        aria-label={`Back to ${categoryLabel(props)}`}
                        className="happy-agent-settings__back"
                        data-happy-desktop-ui="happy-agent-settings-back"
                        onClick={props.onBack}
                        type="button"
                    >
                        <Icon name="chevron-right" size={16} />
                    </button>
                ) : null}
                <Box className="happy-agent-settings__heading">
                    {props.onBack ? null : (
                        <IconTile
                            className="happy-agent-settings__heading-tile"
                            icon={activeCategory(props)?.icon ?? "settings"}
                            size="small"
                            tone={activeCategory(props)?.tone ?? "gray"}
                        />
                    )}
                    <span
                        className="happy-agent-settings__heading-title"
                        data-happy-desktop-ui="happy-agent-settings-heading-title"
                    >
                        {props.title}
                    </span>
                    {props.description ? (
                        <span
                            className="happy-agent-settings__heading-description"
                            data-happy-desktop-ui="happy-agent-settings-heading-description"
                        >
                            {props.description}
                        </span>
                    ) : null}
                </Box>
            </PanelHeader>
            <ScrollArea
                className="happy-agent-settings__body"
                data-happy-desktop-ui="happy-agent-settings-body"
                viewportClassName="happy-agent-settings__body-viewport"
            >
                <Box className="happy-agent-settings__content">{props.children}</Box>
            </ScrollArea>
        </AppShell>
    );
}

function activeCategory(
    props: HappyAgentSettingsShellProps,
): HappyAgentSettingsCategory | undefined {
    return props.categories.find((category) => category.id === props.activeCategoryId);
}

function categoryLabel(props: HappyAgentSettingsShellProps): string {
    return activeCategory(props)?.label ?? "Settings";
}

export interface HappyAgentSettingsSectionProps {
    children: ReactNode;
    description?: string;
    /**
     * `form` puts the children in one inset group, as rows split by hairlines.
     * `cards` stacks free-standing blocks with a gap instead — notices, editors,
     * and `HappyAgentSettingsGroup`s the section composes itself.
     */
    rows?: "form" | "cards";
    /**
     * Omitted when the category's own header already names the block — the
     * first section of a one-subject category would otherwise repeat the title
     * printed directly above it.
     */
    title?: string;
}

/** One block of settings rows inside a category body, titled or not: a heading over its group. */
export function HappyAgentSettingsSection(props: HappyAgentSettingsSectionProps) {
    return (
        <section
            className="happy-agent-settings__section"
            data-happy-desktop-ui="happy-agent-settings-section"
        >
            {props.title === undefined && props.description === undefined ? null : (
                <Box className="happy-agent-settings__section-heading">
                    {props.title === undefined ? null : (
                        <h2
                            className="happy-agent-settings__section-title"
                            data-happy-desktop-ui="happy-agent-settings-section-title"
                        >
                            {props.title}
                        </h2>
                    )}
                    {props.description ? (
                        <p
                            className="happy-agent-settings__section-description"
                            data-happy-desktop-ui="happy-agent-settings-section-description"
                        >
                            {props.description}
                        </p>
                    ) : null}
                </Box>
            )}
            {props.rows === "cards" ? (
                <Box className="happy-agent-settings__section-rows" data-rows="cards">
                    {props.children}
                </Box>
            ) : (
                <HappyAgentSettingsGroup>{props.children}</HappyAgentSettingsGroup>
            )}
        </section>
    );
}

export interface HappyAgentSettingsGroupProps {
    children: ReactNode;
}

/**
 * The inset group settings rows sit in, as the native clients draw theirs: one
 * rounded card on the grouped background, its rows split by hairlines. A row
 * owns its hairline, and the group hides the last one so the card's own edge
 * closes it.
 */
export function HappyAgentSettingsGroup(props: HappyAgentSettingsGroupProps) {
    return (
        <Box
            className="happy-agent-settings__group"
            data-happy-desktop-ui="happy-agent-settings-group"
        >
            {props.children}
        </Box>
    );
}
