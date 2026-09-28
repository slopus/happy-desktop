import { type CSSProperties, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { Box } from "./Box";
import { Button } from "./Button";
import { SidebarKeepAwakeMenu, type SidebarKeepAwakeMode } from "./SidebarKeepAwakeMenu";

export type SidebarFooterProps = {
    /**
     * Display name beside the avatar; the identity this surface is rendered for.
     * Omit it on a machine-owned surface that has no identity to show — the row
     * then carries only its controls.
     */
    name?: string;
    /** Avatar initials fallback when no image is available. */
    initials?: string;
    /** Durable avatar image, when the identity has one. */
    imageUrl?: string;
    /** Shows the presence dot on the avatar. */
    online?: boolean;
    /**
     * Opens the identity's profile. Omit it on a surface with no profile to
     * open — the identity then renders as a plain, non-interactive row rather
     * than a button wired to nothing.
     */
    onProfileOpen?: () => void;
    /**
     * Opens administration. Omit it wherever no administration exists or is
     * reachable; the control is then genuinely absent, not disabled.
     */
    onAdminOpen?: () => void;
    /** Overrides the administration control's label. */
    adminLabel?: string;
    /** Opens this surface's settings. Omit it when the surface has none. */
    onSettingsOpen?: () => void;
    /** Overrides the settings control's label. */
    settingsLabel?: string;
    /** Development-only branch and Blueprint control, pinned beside the footer actions. */
    devMenu?: ReactNode;
    /** The appearance currently rendered; picks the toggle's icon and label. */
    appearance: "dark" | "light";
    onAppearanceToggle: () => void;
    /**
     * The keep-awake control, pinned after the appearance toggle. Omit it on a
     * host that cannot hold the machine out of sleep — a browser tab, say — and
     * the control is genuinely absent rather than wired to nothing.
     */
    keepAwake?: {
        readonly mode: SidebarKeepAwakeMode;
        readonly active: boolean;
        readonly onModeSelect: (mode: SidebarKeepAwakeMode) => void;
    };
    /** Extra trailing controls, placed before the appearance toggle. */
    actions?: ReactNode;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/**
 * SidebarFooter — the identity strip pinned to the bottom of a navigation
 * column: who the surface is rendered for, the controls that belong to that
 * identity, and the appearance toggle.
 *
 * Every affordance beyond the appearance toggle is optional, because the
 * surfaces that use this differ in what genuinely exists rather than in what
 * they choose to show. A workspace with an account has a profile to open and may
 * have administration; a local machine-owned workspace has no account at all, so
 * it shows no identity either and its controls sit alone on the row. An absent
 * handler removes its control entirely instead of rendering a disabled one, so
 * there is no mode flag here and no control wired to nothing.
 *
 * The row is also the anchor for a panel one of its controls opens upward. A
 * 28px glyph in the middle of the row is far too narrow to hang a readable card
 * from — measured against the glyph, the card leaves the window — so
 * `.happy-sidebar-footer` is positioned and such a panel measures itself against
 * the footer's own gutters instead.
 */
export function SidebarFooter(props: SidebarFooterProps) {
    const name = props.name;
    const identity =
        name === undefined ? undefined : (
            <>
                <Avatar
                    aria-label={props.online ? `${name} — online` : name}
                    imageUrl={props.imageUrl}
                    initials={props.initials ?? ""}
                    online={props.online}
                    size="sm"
                    tone="brand"
                />
                <span className="happy-sidebar__profile-name">{name}</span>
            </>
        );
    return (
        <Box
            className={["happy-sidebar-footer", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="sidebar-footer"
            data-testid={props["data-testid"]}
            style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                width: "100%",
                ...props.style,
            }}
        >
            {identity !== undefined ? (
                props.onProfileOpen ? (
                    <button
                        aria-label="Open profile"
                        className="happy-sidebar__profile"
                        data-happy-desktop-ui="sidebar-profile"
                        onClick={props.onProfileOpen}
                        type="button"
                    >
                        {identity}
                    </button>
                ) : (
                    <span
                        className="happy-sidebar__profile happy-sidebar__profile--static"
                        data-happy-desktop-ui="sidebar-profile"
                    >
                        {identity}
                    </span>
                )
            ) : props.devMenu === undefined ? (
                // No identity to show: the controls keep their trailing position
                // rather than sliding to the left of an empty row.
                <span style={{ flex: "1 1 auto" }} />
            ) : null}
            {props.devMenu !== undefined ? (
                <span
                    className="happy-sidebar__dev-build"
                    data-happy-desktop-ui="sidebar-dev-build"
                >
                    {props.devMenu}
                </span>
            ) : null}
            {props.actions}
            {props.onAdminOpen ? (
                <Button
                    aria-label={props.adminLabel ?? "Administration"}
                    icon="settings"
                    iconOnly
                    onClick={props.onAdminOpen}
                    size="small"
                    variant="ghost"
                />
            ) : null}
            {props.onSettingsOpen ? (
                <Button
                    aria-label={props.settingsLabel ?? "Settings"}
                    icon="settings"
                    iconOnly
                    onClick={props.onSettingsOpen}
                    size="small"
                    variant="ghost"
                />
            ) : null}
            <Button
                aria-label={
                    props.appearance === "dark" ? "Use light appearance" : "Use dark appearance"
                }
                icon={props.appearance === "dark" ? "sun" : "moon"}
                iconOnly
                onClick={props.onAppearanceToggle}
                size="small"
                variant="ghost"
            />
            {props.keepAwake ? (
                <SidebarKeepAwakeMenu
                    active={props.keepAwake.active}
                    mode={props.keepAwake.mode}
                    onModeSelect={props.keepAwake.onModeSelect}
                />
            ) : null}
        </Box>
    );
}
