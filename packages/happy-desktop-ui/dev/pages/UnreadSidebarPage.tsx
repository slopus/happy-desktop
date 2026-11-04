import { Sidebar, type SidebarItem, type SidebarSection } from "../../src/Sidebar";
import { ThemeScope } from "../../src/ThemeScope";

/**
 * A review sheet, not a specimen: the real sidebar with the same tasks under
 * three unread treatments, light and dark, beside folded rows — whose corner
 * number counts what the fold hides, not what is unread.
 */
export const componentNumber = "B-003";

const noop = () => undefined;

type Unread = { readonly count?: number; readonly mentioned?: boolean } | undefined;
type Variant = "dot" | "counts" | "mentions" | "at";

/** What one variant shows for a row with this much unread. */
function unreadOf(unread: Unread, variant: Variant): Partial<SidebarItem> {
    if (unread === undefined) return {};
    if (variant === "dot") return { unread: true };
    if (variant === "counts")
        return {
            unread: true,
            ...(unread.count === undefined ? {} : { unreadCount: unread.count }),
            ...(unread.mentioned ? { unreadMentioned: true } : {}),
        };
    // Only what is aimed at the reader is marked, with no number at all.
    if (variant === "at")
        return unread.mentioned ? { unread: true, unreadMentioned: true } : { unread: true };
    // Only what is aimed at the reader is counted; the rest is the dot.
    return unread.mentioned
        ? {
              unread: true,
              unreadMentioned: true,
              ...(unread.count === undefined ? {} : { unreadCount: unread.count }),
          }
        : { unread: true };
}

function sections(variant: Variant): SidebarSection[] {
    const row = (item: SidebarItem, unread: Unread): SidebarItem => ({
        ...item,
        ...unreadOf(unread, variant),
    });
    return [
        {
            id: "bots",
            label: "Bots",
            items: [
                row(
                    { id: "chief", kind: "agent", label: "Chief of Staff", icon: "agents" },
                    {
                        count: 4,
                    },
                ),
                row(
                    { id: "notes", kind: "agent", label: "Release notes", placeholderSeed: "n" },
                    undefined,
                ),
            ],
        },
        {
            id: "tasks",
            label: "Tasks",
            items: [
                row(
                    {
                        collapsed: true,
                        id: "mention",
                        imageUrl: "people/alice.jpg",
                        kind: "project",
                        label: "@Person Mention Autocomplete",
                    },
                    { count: 3 },
                ),
                {
                    contextAvatars: [{ icon: "agents", id: "m", label: "Bot" }],
                    depth: 1,
                    id: "mention-sub",
                    kind: "workspace",
                    label: "Mention tags",
                },
                row(
                    {
                        collapsed: false,
                        id: "create",
                        imageUrl: "people/alice.jpg",
                        kind: "project",
                        label: "Enable Top-Level Task Creation",
                    },
                    { count: 2, mentioned: true },
                ),
                row(
                    {
                        changeStats: { added: 518, deleted: 52 },
                        contextAvatars: [{ icon: "agents", id: "u", label: "Bot" }],
                        depth: 1,
                        id: "create-sub",
                        kind: "workspace",
                        label: "Universal Task Creation",
                    },
                    { count: 5 },
                ),
                row(
                    {
                        collapsed: true,
                        id: "pricing",
                        imageUrl: "people/bob.jpg",
                        kind: "project",
                        label: "Pricing page",
                    },
                    { mentioned: true, count: 1 },
                ),
                { depth: 1, id: "pricing-a", kind: "workspace", label: "Annual discount" },
                { depth: 1, id: "pricing-b", kind: "workspace", label: "Plan table" },
                row(
                    {
                        id: "support",
                        imageUrl: "people/dana.jpg",
                        kind: "project",
                        label: "Support inbox triage",
                        status: "working",
                    },
                    { count: 100 },
                ),
                row(
                    {
                        id: "notes-task",
                        imageUrl: "people/carol.jpg",
                        kind: "project",
                        label: "Onboarding copy",
                    },
                    undefined,
                ),
            ],
        },
    ];
}

const VARIANTS: readonly { readonly variant: Variant; readonly title: string }[] = [
    { variant: "dot", title: "Today: a dot for anything unread" },
    { variant: "counts", title: "Branch: every unread counted" },
    { variant: "mentions", title: "Proposal A: dot, @count for mentions" },
    { variant: "at", title: "Proposal B: dot, @ for mentions" },
];

export function UnreadSidebarPage() {
    return (
        <div
            data-unread-sidebar=""
            style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}
        >
            {(["light", "dark"] as const).map((appearance) => (
                <div key={appearance} style={{ display: "flex", gap: 24 }}>
                    {VARIANTS.map(({ variant, title }) => (
                        <div
                            key={variant}
                            style={{ display: "flex", flexDirection: "column", gap: 8 }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
                            <ThemeScope mode={appearance}>
                                <div
                                    style={{
                                        background: "var(--groupped-background)",
                                        display: "flex",
                                        height: 400,
                                        overflow: "hidden",
                                        width: 300,
                                    }}
                                >
                                    <Sidebar
                                        activeItemId="notes-task"
                                        style={{ width: 300 }}
                                        onItemCollapseToggle={noop}
                                        onItemSelect={noop}
                                        sections={sections(variant)}
                                    />
                                </div>
                            </ThemeScope>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
