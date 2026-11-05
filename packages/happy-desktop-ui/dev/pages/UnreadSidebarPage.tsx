import type { CSSProperties } from "react";
import { Sidebar, type SidebarItem, type SidebarSection } from "../../src/Sidebar";
import { ThemeScope } from "../../src/ThemeScope";

/**
 * A review sheet, not a specimen: the real sidebar, light and dark, with the
 * red unread dot on the corner of each row's mark and the mention badge that
 * dot grows into, once per colour being weighed for that badge.
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

type Swatch = { readonly background: string; readonly text: string };

const COLOURS: readonly {
    readonly name: string;
    readonly light: Swatch;
    readonly dark: Swatch;
}[] = [
    {
        name: "Teal, the mention tint",
        light: { background: "#1a7f99", text: "#ffffff" },
        dark: { background: "#2399b5", text: "#ffffff" },
    },
    {
        name: "Red, the dot's own",
        light: { background: "#ff3b30", text: "#ffffff" },
        dark: { background: "#ff453a", text: "#ffffff" },
    },
    {
        name: "Blue",
        light: { background: "#007aff", text: "#ffffff" },
        dark: { background: "#0a84ff", text: "#ffffff" },
    },
    {
        name: "Violet",
        light: { background: "#7c5cff", text: "#ffffff" },
        dark: { background: "#8e7bff", text: "#ffffff" },
    },
    {
        name: "Orange",
        light: { background: "#f2760f", text: "#ffffff" },
        dark: { background: "#ff8a2a", text: "#ffffff" },
    },
    {
        name: "Ink, the text colour",
        light: { background: "#1d1d1f", text: "#ffffff" },
        dark: { background: "#f5f5f7", text: "#1d1d1f" },
    },
];

export function UnreadSidebarPage() {
    return (
        <div
            data-unread-sidebar=""
            style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}
        >
            {(["light", "dark"] as const).map((appearance) => (
                <div key={appearance} style={{ display: "flex", gap: 16 }}>
                    {COLOURS.map((colour, index) => (
                        <div
                            key={colour.name}
                            style={{ display: "flex", flexDirection: "column", gap: 8 }}
                        >
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{colour.name}</div>
                            <ThemeScope mode={appearance}>
                                <div
                                    data-unread-variant={index}
                                    style={
                                        {
                                            "--happy-unread-mention-background":
                                                colour[appearance].background,
                                            "--happy-unread-mention-text": colour[appearance].text,
                                            background: "var(--groupped-background)",
                                            color: "var(--text)",
                                            display: "flex",
                                            height: 400,
                                            overflow: "hidden",
                                            width: 250,
                                        } as CSSProperties
                                    }
                                >
                                    <Sidebar
                                        activeItemId="notes"
                                        onItemAction={noop}
                                        onItemCollapseToggle={noop}
                                        onItemSelect={noop}
                                        sections={sections()}
                                        style={{ width: 250 }}
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
