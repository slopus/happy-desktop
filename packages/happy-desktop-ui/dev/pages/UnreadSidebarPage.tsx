import { Sidebar, type SidebarItem, type SidebarSection } from "../../src/Sidebar";
import { ThemeScope } from "../../src/ThemeScope";

/**
 * A review sheet, not a specimen: the real sidebar, light and dark, with the
 * red unread dot on the top corner of each row's mark, mirrored by the folded
 * count on the bottom one, and the mention badge drawn each way being weighed
 * for it. "Blue" is what the sidebar draws; the other two restyle it here.
 */
export const componentNumber = "B-003";

const noop = () => undefined;

type Unread = { readonly mentioned?: boolean } | undefined;

type Row = {
    readonly item: SidebarItem;
    readonly unread: Unread;
};

const ROWS: readonly { readonly section: string; readonly rows: readonly Row[] }[] = [
    {
        section: "Bots",
        rows: [
            {
                item: { id: "chief", kind: "agent", label: "Chief of Staff", icon: "agents" },
                unread: {},
            },
            {
                item: { id: "notes", kind: "agent", label: "Release notes", placeholderSeed: "n" },
                unread: undefined,
            },
        ],
    },
    {
        section: "Tasks",
        rows: [
            {
                item: {
                    action: { icon: "close", label: "Leave", reveal: "hover" },
                    collapsed: true,
                    id: "mention",
                    imageUrl: "people/alice.jpg",
                    kind: "project",
                    label: "@Person Mention Autocomplete",
                },
                unread: {},
            },
            {
                item: {
                    contextAvatars: [{ icon: "agents", id: "m", label: "Bot" }],
                    depth: 1,
                    id: "mention-sub",
                    kind: "workspace",
                    label: "Mention tags",
                },
                unread: undefined,
            },
            {
                item: {
                    action: { icon: "close", label: "Leave", reveal: "hover" },
                    collapsed: false,
                    id: "create",
                    imageUrl: "people/alice.jpg",
                    kind: "project",
                    label: "Enable Top-Level Task Creation",
                },
                unread: { mentioned: true },
            },
            {
                item: {
                    changeStats: { added: 518, deleted: 52 },
                    contextAvatars: [{ icon: "agents", id: "u", label: "Bot" }],
                    depth: 1,
                    id: "create-sub",
                    kind: "workspace",
                    label: "Universal Task Creation",
                },
                unread: {},
            },
            {
                item: {
                    action: { icon: "close", label: "Leave", reveal: "hover" },
                    collapsed: true,
                    id: "pricing",
                    imageUrl: "people/bob.jpg",
                    kind: "project",
                    label: "Pricing page",
                },
                unread: { mentioned: true },
            },
            {
                item: { depth: 1, id: "pricing-a", kind: "workspace", label: "Annual discount" },
                unread: undefined,
            },
            {
                item: { depth: 1, id: "pricing-b", kind: "workspace", label: "Plan table" },
                unread: undefined,
            },
            {
                item: {
                    action: { icon: "close", label: "Leave", reveal: "hover" },
                    id: "support",
                    imageUrl: "people/dana.jpg",
                    kind: "project",
                    label: "Support inbox triage",
                    status: "working",
                },
                unread: {},
            },
            {
                item: {
                    action: { icon: "close", label: "Leave", reveal: "hover" },
                    id: "onboarding",
                    imageUrl: "people/carol.jpg",
                    kind: "project",
                    label: "Onboarding copy",
                },
                unread: {},
            },
        ],
    },
];

function sections(): SidebarSection[] {
    return ROWS.map(({ section, rows }) => ({
        id: section,
        label: section,
        items: rows.map(({ item, unread }) =>
            unread === undefined
                ? item
                : { ...item, unread: true, ...(unread.mentioned ? { unreadMentioned: true } : {}) },
        ),
    }));
}

const VARIANTS: readonly { readonly id: string; readonly title: string }[] = [
    { id: "red", title: "A. Big red" },
    { id: "blue", title: "B. Blue, no glyph" },
    { id: "at", title: "C. Blue with @" },
];

/* A and C restyle the mention badge on this sheet only. C's `@` is the folded
   count's own type. Its ink hangs 0.675px below its line box's centre, the
   descender of the bowl, so it is raised by the nearest device pixel. */
const VARIANT_STYLES = `
[data-badge-variant="red"] .happy-sidebar__item-unread[data-mentioned] {
    background: var(--status-error);
}
[data-badge-variant="at"] .happy-sidebar__item-unread[data-mentioned] {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font-family: var(--happy-font-mono);
    font-size: 8.5px;
    font-weight: 700;
    line-height: 1;
    font-synthesis: none;
}
[data-badge-variant="at"] .happy-sidebar__item-unread[data-mentioned]::after {
    content: "@";
    transform: translateY(-0.5px);
}
`;

export function UnreadSidebarPage() {
    return (
        <div
            data-unread-sidebar=""
            style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}
        >
            <style>{VARIANT_STYLES}</style>
            {(["light", "dark"] as const).map((appearance) => (
                <div key={appearance} style={{ display: "flex", gap: 16 }}>
                    {VARIANTS.map((variant) => (
                        <div
                            key={variant.id}
                            style={{ display: "flex", flexDirection: "column", gap: 8 }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                                {variant.title} ({appearance})
                            </div>
                            <ThemeScope mode={appearance}>
                                <div
                                    data-badge-variant={variant.id}
                                    data-unread-variant={variant.id}
                                    style={{
                                        background: "var(--groupped-background)",
                                        color: "var(--text)",
                                        display: "flex",
                                        height: 400,
                                        overflow: "hidden",
                                        width: 280,
                                    }}
                                >
                                    <Sidebar
                                        activeItemId="notes"
                                        onItemAction={noop}
                                        onItemCollapseToggle={noop}
                                        onItemSelect={noop}
                                        sections={sections()}
                                        style={{ width: 280 }}
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
