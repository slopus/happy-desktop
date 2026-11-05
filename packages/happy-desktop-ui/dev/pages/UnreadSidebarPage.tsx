import type { CSSProperties, ReactNode } from "react";
import { Sidebar, type SidebarItem, type SidebarSection } from "../../src/Sidebar";
import { ThemeScope } from "../../src/ThemeScope";

/**
 * A review sheet, not a specimen: the same tasks under the unread treatments
 * that were weighed, light and dark, beside folded rows whose corner number
 * counts what the fold hides. The earlier treatments are mocked up with plain
 * markup; "Final" is the real sidebar.
 */
export const componentNumber = "B-003";

const noop = () => undefined;

type Unread = { readonly count?: number; readonly mentioned?: boolean } | undefined;
type Variant = "dot" | "counts" | "mentions" | "final";

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
                unread: { count: 4 },
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
                unread: { count: 3 },
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
                unread: { count: 2, mentioned: true },
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
                unread: { count: 5 },
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
                unread: { mentioned: true, count: 1 },
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
                unread: undefined,
            },
            {
                item: {
                    action: { icon: "close", label: "Leave", reveal: "hover" },
                    id: "onboarding",
                    imageUrl: "people/carol.jpg",
                    kind: "project",
                    label: "Onboarding copy",
                },
                unread: { count: 6 },
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

/* The earlier treatments, drawn as plain markup so the sheet still shows them
   after the sidebar stopped drawing counts. */
const pill: CSSProperties = {
    alignItems: "center",
    background: "var(--surface)",
    borderRadius: 999,
    boxShadow: "inset 0 0 0 0.5px var(--divider)",
    display: "flex",
    fontSize: 9,
    fontWeight: 700,
    height: 12,
    justifyContent: "center",
    minWidth: 12,
    padding: "0 3px",
};

function mockMark(variant: Exclude<Variant, "final">, unread: Unread): ReactNode {
    if (unread === undefined) return null;
    const dot = (
        <span
            style={{ background: "var(--status-error)", borderRadius: 999, height: 6, width: 6 }}
        />
    );
    if (variant === "dot") return dot;
    if (variant === "mentions" && !unread.mentioned) return dot;
    const count = unread.count === undefined ? "" : unread.count >= 100 ? "99+" : unread.count;
    return unread.mentioned ? (
        <span
            style={{
                ...pill,
                background: "var(--happy-unread-mention-background)",
                boxShadow: "none",
                color: "var(--happy-unread-mention-text)",
            }}
        >
            @{count}
        </span>
    ) : (
        <span style={pill}>{count}</span>
    );
}

function Mock(props: { variant: Exclude<Variant, "final"> }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "12px 16px" }}>
            {ROWS.map(({ section, rows }) => (
                <div key={section} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <div
                        style={{
                            color: "var(--text-secondary)",
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: 1,
                            padding: "10px 0 4px",
                            textTransform: "uppercase",
                        }}
                    >
                        {section}
                    </div>
                    {rows.map(({ item, unread }) => (
                        <div
                            key={item.id}
                            style={{
                                alignItems: "center",
                                display: "flex",
                                fontSize: 13,
                                fontWeight: unread ? 700 : 500,
                                gap: 8,
                                height: 26,
                                paddingLeft: (item.depth ?? 0) * 22,
                            }}
                        >
                            <span
                                style={{
                                    flex: 1,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {item.label}
                            </span>
                            {mockMark(props.variant, unread)}
                            {item.changeStats ? (
                                <span
                                    style={{ fontFamily: "var(--happy-font-mono)", fontSize: 11 }}
                                >
                                    +{item.changeStats.added} -{item.changeStats.deleted}
                                </span>
                            ) : null}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

const VARIANTS: readonly { readonly variant: Variant; readonly title: string }[] = [
    { variant: "dot", title: "Before: red dot" },
    { variant: "counts", title: "Every unread counted" },
    { variant: "mentions", title: "Dot, @count for mentions" },
    { variant: "final", title: "Final: dot, @ for mentions, in the spinner's cell" },
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
                                    data-unread-variant={variant}
                                    style={{
                                        background: "var(--groupped-background)",
                                        color: "var(--text)",
                                        display: "flex",
                                        height: 400,
                                        overflow: "hidden",
                                        width: 300,
                                    }}
                                >
                                    {variant === "final" ? (
                                        <Sidebar
                                            activeItemId="notes"
                                            onItemAction={noop}
                                            onItemCollapseToggle={noop}
                                            onItemSelect={noop}
                                            sections={sections()}
                                            style={{ width: 300 }}
                                        />
                                    ) : (
                                        <Mock variant={variant} />
                                    )}
                                </div>
                            </ThemeScope>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
