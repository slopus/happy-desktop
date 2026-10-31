/**
 * The custom theme: the fourth appearance, which the person — or an agent acting
 * for them — shapes by hand. It is one of the three built-in palettes taken as a
 * base, with any of its colour roles replaced.
 *
 * The object lives in `~/.happy/desktop/config.json` as `customTheme`. The host parses it
 * with `customThemeParse` and delivers the result to the window, which applies it
 * without a restart. Every role named here is a colour property of
 * `happy-desktop-ui/src/theme.css`; keep the two in step when a role is added.
 */
export type ThemePalette = "dark" | "light" | "midnight";

export const THEME_COLOR_ROLES = [
    "text",
    "text-destructive",
    "text-secondary",
    "text-link",
    "delete-action",
    "warning-critical",
    "warning",
    "success",
    "surface",
    "surface-ripple",
    "surface-pressed",
    "surface-selected",
    "surface-pressed-overlay",
    "surface-high",
    "surface-highest",
    "surface-inverse",
    "text-inverse",
    "divider",
    "shadow-color",
    "shadow-subtle",
    "shadow-rail",
    "shadow-floating",
    "shadow-elevated",
    "shadow-activity-card",
    "overlay-backdrop",
    "overlay-panel",
    "groupped-background",
    "groupped-chevron",
    "groupped-section-title",
    "header-background",
    "header-tint",
    "header-tint-secondary",
    "switch-track-active",
    "switch-track-inactive",
    "switch-thumb-active",
    "switch-thumb-inactive",
    "fab-background",
    "fab-background-pressed",
    "fab-icon",
    "radio-active",
    "radio-inactive",
    "radio-dot",
    "modal-border",
    "button-primary-background",
    "button-primary-tint",
    "button-primary-ripple",
    "button-primary-disabled",
    "button-secondary-tint",
    "composer-send-background",
    "composer-send-icon",
    "input-background",
    "sidebar-search-background",
    "sidebar-search-border",
    "input-text",
    "input-placeholder",
    "review-accent",
    "status-connected",
    "status-connecting",
    "status-disconnected",
    "status-error",
    "status-default",
    "diff-outline",
    "diff-success",
    "diff-error",
    "diff-added-bg",
    "diff-added-border",
    "diff-added-text",
    "diff-removed-bg",
    "diff-removed-border",
    "diff-removed-text",
    "code-comment",
    "code-string",
    "code-number",
    "code-keyword",
    "code-type",
    "code-function",
    "code-variable",
    "code-constant",
    "code-operator",
    "code-punctuation",
    "code-gutter",
    "code-gutter-active",
    "code-caret",
    "code-selection",
    "code-active-line",
    "code-reveal",
    "terminal-selection",
    "diff-context-bg",
    "diff-context-text",
    "diff-line-number-bg",
    "diff-line-number-text",
    "diff-hunk-header-bg",
    "diff-hunk-header-text",
    "diff-leading-space-dot",
    "diff-inline-added-bg",
    "diff-inline-added-text",
    "diff-inline-removed-bg",
    "diff-inline-removed-text",
    "user-message-background",
    "user-message-text",
    "agent-message-text",
    "agent-event-text",
    "syntax-keyword",
    "syntax-string",
    "syntax-comment",
    "syntax-number",
    "syntax-function",
    "syntax-bracket-1",
    "syntax-bracket-2",
    "syntax-bracket-3",
    "syntax-bracket-4",
    "syntax-bracket-5",
    "syntax-default",
    "git-branch-text",
    "git-file-count-text",
    "git-added-text",
    "git-removed-text",
    "git-status-new",
    "git-status-modified",
    "git-status-renamed",
    "git-status-deleted",
    "file-code",
    "file-data",
    "file-style",
    "file-image",
    "file-video",
    "file-audio",
    "file-shell",
    "file-secret",
    "file-archive",
    "file-prose",
    "file-config",
    "file-directory",
    "file-other",
    "file-path-text",
    "terminal-background",
    "terminal-prompt",
    "terminal-command",
    "terminal-stdout",
    "terminal-stderr",
    "terminal-error",
    "terminal-empty-output",
] as const;

export type ThemeColorRole = (typeof THEME_COLOR_ROLES)[number];

export interface CustomTheme {
    /** The built-in palette every role not named in `colors` comes from. */
    readonly base: ThemePalette;
    /** Replaced roles, each a `#rgb`, `#rgba`, `#rrggbb`, or `#rrggbbaa` colour. */
    readonly colors: Readonly<Partial<Record<ThemeColorRole, string>>>;
}

/** What the custom theme is before anyone has written one. */
export const customThemeEmpty: CustomTheme = { base: "midnight", colors: {} };

const HEX_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/iu;
const ROLES: ReadonlySet<string> = new Set(THEME_COLOR_ROLES);

export type CustomThemeParseResult =
    | { readonly ok: true; readonly theme: CustomTheme; readonly issues: readonly string[] }
    | { readonly ok: false; readonly error: string };

/**
 * Parses the customTheme field independently. Invalid roles are dropped, while
 * invalid base/colors fields retain their last accepted value (or the default).
 * Diagnostics name paths, never arbitrary values from the config document.
 */
export function customThemeParse(
    candidate: unknown,
    previous: CustomTheme = customThemeEmpty,
): CustomThemeParseResult {
    const fail = (error: string): CustomThemeParseResult => ({ ok: false, error });
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
        return fail('"customTheme" must be a JSON object; keeping the previous theme or default.');
    const document = candidate as Record<string, unknown>;
    const issues: string[] = [];
    for (const key of Object.keys(document))
        if (key !== "base" && key !== "colors")
            issues.push(
                `"customTheme.${key}" is unknown; ignored by the app and preserved on disk.`,
            );
    const candidateBase = document.base === undefined ? customThemeEmpty.base : document.base;
    const base: ThemePalette =
        candidateBase === "dark" || candidateBase === "light" || candidateBase === "midnight"
            ? candidateBase
            : previous.base;
    if (candidateBase !== "dark" && candidateBase !== "light" && candidateBase !== "midnight") {
        issues.push(
            '"customTheme.base" must be "light", "dark", or "midnight"; keeping the previous base or default.',
        );
    }
    const colors = document.colors === undefined ? {} : document.colors;
    if (typeof colors !== "object" || colors === null || Array.isArray(colors)) {
        issues.push(
            '"customTheme.colors" must be an object of role names to hex colours; keeping the previous colors or default.',
        );
        return { ok: true, theme: { base, colors: previous.colors }, issues };
    }
    const parsed: Partial<Record<ThemeColorRole, string>> = {};
    for (const [role, value] of Object.entries(colors)) {
        if (!ROLES.has(role)) {
            issues.push(`"customTheme.colors.${role}" is not an overridable color role; ignored.`);
            continue;
        }
        if (typeof value !== "string" || !HEX_COLOR.test(value)) {
            issues.push(
                `"customTheme.colors.${role}" must be a hex colour such as "#121212"; ignored.`,
            );
            continue;
        }
        parsed[role as ThemeColorRole] = value.toLowerCase();
    }
    return { ok: true, theme: { base, colors: parsed }, issues };
}

/** Whether two custom themes render identically. */
export function customThemeEqual(left: CustomTheme, right: CustomTheme): boolean {
    if (left.base !== right.base) return false;
    const leftRoles = Object.keys(left.colors) as ThemeColorRole[];
    if (leftRoles.length !== Object.keys(right.colors).length) return false;
    return leftRoles.every((role) => left.colors[role] === right.colors[role]);
}
