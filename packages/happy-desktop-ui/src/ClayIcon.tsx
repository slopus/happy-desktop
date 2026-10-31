import { Avatar, type ToneName } from "./Avatar";

/**
 * The clay icon library: one generated raster per kind of work, which a task
 * wears as its picture. It is task art, not a UI glyph — interface icons stay
 * `Icon`. The slug is the contract with Happy Agent: its naming job picks one
 * from this same list (the agent's library manifest, in its order), and this
 * package bundles each at 40px and 64px.
 */
export const clayIconSlugs = [
    "code",
    "new-feature",
    "cli-terminal",
    "refactor",
    "cleanup",
    "wip",
    "project-kickoff",
    "git",
    "pull-request",
    "code-review",
    "revert",
    "open-source",
    "crash",
    "hotfix",
    "flaky",
    "triage",
    "debugging",
    "investigate",
    "testing",
    "build",
    "ci-fix",
    "ci-watcher",
    "config",
    "dependencies",
    "dependency-upgrade",
    "deploy",
    "feature-flag",
    "app-store-release",
    "infra",
    "cloud",
    "database",
    "migration",
    "trend-up",
    "presentation-report",
    "login",
    "permissions",
    "user-account",
    "vulnerability",
    "secrets",
    "privacy",
    "incident",
    "on-call",
    "alerting",
    "marketing",
    "performance",
    "monitoring",
    "design",
    "dark-mode",
    "design-system",
    "navigation",
    "settings",
    "notifications",
    "ux",
    "accessibility",
    "localization",
    "web",
    "location",
    "links",
    "api",
    "architecture",
    "backend",
    "frontend",
    "email",
    "ai",
    "llm",
    "ai-agent",
    "prompt",
    "bots",
    "docs",
    "notes",
    "roadmap",
    "goals",
    "prioritize",
    "blocked",
    "urgent",
    "kanban",
    "brainstorm",
    "milestone-done",
    "team",
    "standup",
    "meeting",
    "feature-request",
    "user-feedback",
    "support",
    "pricing",
    "billing",
    "revenue",
    "home",
    "travel",
    "apple-macos",
    "windows",
    "android",
    "app-store",
    "google-play",
    "javascript",
    "typescript",
    "swift",
    "nodejs",
    "react",
    "expo-react-native",
    "aws",
    "docker",
    "postgres",
    "github",
    "slack",
    "figma",
    "claude",
    "openai",
    "linux",
    "kotlin",
    "python",
    "rust",
    "nextjs",
    "electron",
    "kubernetes",
    "vercel",
    "cloudflare",
    "redis",
    "stripe",
    "linear",
    "bun",
    "golang",
    "java",
    "ruby",
    "firebase",
    "homebrew",
    "datadog",
    "raspberry-pi",
    "local-models",
    "delete-code",
    "rename",
    "move-files",
    "types",
    "typo",
    "formatting",
    "lint",
    "waveform",
    "microphone",
    "headphones",
] as const;

export type ClayIconSlug = (typeof clayIconSlugs)[number];

const slugs: ReadonlySet<string> = new Set(clayIconSlugs);

/** Narrows a slug named by another layer to one this library draws. */
export function clayIconSlugIs(value: string): value is ClayIconSlug {
    return slugs.has(value);
}

function urlsBySlug(modules: Record<string, string>): ReadonlyMap<string, string> {
    return new Map(
        Object.entries(modules).map(([path, url]) => [
            path.slice(path.lastIndexOf("/") + 1, path.lastIndexOf("@")),
            url,
        ]),
    );
}

// Bundling every icon is inefficient; these should eventually come from the daemon.
const small = urlsBySlug(
    import.meta.glob<string>("./assets/clay-icons/*@40.png", {
        eager: true,
        import: "default",
        query: "?url",
    }),
);
const large = urlsBySlug(
    import.meta.glob<string>("./assets/clay-icons/*@64.png", {
        eager: true,
        import: "default",
        query: "?url",
    }),
);

/** The artwork for a slug, or `undefined` when this library does not draw it. */
export function clayIconImage(slug: string): { src: string; srcSet: string } | undefined {
    const small40 = small.get(slug);
    const large64 = large.get(slug);
    if (!clayIconSlugIs(slug) || small40 === undefined || large64 === undefined) return undefined;
    return { src: large64, srcSet: `${small40} 40w, ${large64} 64w` };
}

export type ClayIconProps = {
    /** The library slug the task wears; any other value, or none, draws the fallback. */
    slug: string | null | undefined;
    /** Edge in CSS pixels: 20 for a row's mark lane, 40 inside a card's disc. */
    size: number;
    /** The task's name; its first letter fills the fallback tile. */
    label: string;
    tone?: ToneName;
};

/**
 * A task's clay icon at one size. A slug the library does not draw (an older or
 * newer agent's) falls back to the row's own avatar tile, never a broken image.
 */
export function ClayIcon(props: ClayIconProps) {
    const image = props.slug ? clayIconImage(props.slug) : undefined;
    if (image === undefined)
        return (
            <Avatar
                className="happy-clay-icon-fallback"
                initials={props.label.slice(0, 1).toUpperCase()}
                size={props.size <= 24 ? "xs" : "lg"}
                style={{ width: props.size, height: props.size }}
                tone={props.tone}
                type="agent"
            />
        );
    return (
        <img
            alt=""
            className="happy-clay-icon"
            data-happy-desktop-ui="clay-icon"
            data-slug={props.slug}
            draggable={false}
            height={props.size}
            sizes={`${props.size}px`}
            src={image.src}
            srcSet={image.srcSet}
            width={props.size}
        />
    );
}
