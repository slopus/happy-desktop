import { useState, type ReactNode } from "react";
import { Avatar } from "../../src/Avatar";
import { Button } from "../../src/Button";
import { DevBuildMenu } from "../../src/DevBuildMenu";
import { Icon } from "../../src/Icon";
import { commandShortcut } from "../../src/keyboardShortcut";
import {
    Sidebar,
    SIDEBAR_TRAILING_GAP,
    type SidebarItem,
    type SidebarReorder,
    type SidebarSection,
} from "../../src/Sidebar";
import { SidebarFooter } from "../../src/SidebarFooter";
import {
    SidebarUpdateAction,
    type SidebarUpdateActionProps,
    type SidebarUpdateNotes,
} from "../../src/SidebarUpdateAction";
import { Spinner } from "../../src/Spinner";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-009";
const workspaceShortcut = commandShortcut("n", { shift: true });
const workspaceSections: SidebarSection[] = [
    {
        id: "views",
        items: [
            { badge: 12, icon: "inbox", id: "inbox", kind: "view", label: "Inbox", unread: true },
            {
                changeStats: { added: 128, deleted: 34 },
                icon: "tasks",
                id: "my-issues",
                kind: "view",
                label: "My issues",
            },
            { icon: "spark", id: "agent-runs", kind: "view", label: "Agent runs", meta: "3" },
            { icon: "eye", id: "watching", kind: "view", label: "Watching" },
        ],
    },
    {
        action: { icon: "plus", label: "New project" },
        headingOnly: true,
        id: "projects",
        items: [],
        label: "Projects",
    },
    {
        action: { icon: "plus", label: "Add channel to Product" },
        id: "project-product",
        items: [
            { id: "launch-week", kind: "channel", label: "launch-week" },
            {
                depth: 1,
                id: "launch-week-ios",
                kind: "workspace",
                label: "ios-rollout",
                status: "working",
            },
            {
                archived: true,
                depth: 1,
                id: "launch-week-legacy",
                kind: "channel",
                label: "legacy-notes",
            },
            { badge: 4, id: "eng-core", kind: "channel", label: "eng-core", unread: true },
            { depth: 1, id: "eng-core-infra", kind: "channel", label: "infra", unread: true },
            { id: "design", kind: "channel", label: "design" },
            { archived: true, id: "support-fires", kind: "channel", label: "support-fires" },
            { icon: "lock", id: "founders", kind: "channel", label: "founders" },
            { depth: 1, icon: "lock", id: "founders-hiring", kind: "channel", label: "hiring" },
        ],
        label: "Product",
    },
    {
        action: { icon: "plus", label: "Add channel to Operations" },
        id: "project-operations",
        items: [
            {
                badge: 2,
                icon: "lock",
                id: "security",
                kind: "channel",
                label: "security",
                unread: true,
            },
        ],
        label: "Operations",
    },
    {
        id: "humans",
        items: [
            {
                id: "maya",
                initials: "MJ",
                kind: "person",
                label: "Maya Johnson",
                online: true,
                tone: "rose",
            },
            {
                id: "arun",
                initials: "AP",
                kind: "person",
                label: "Arun Patel",
                meta: "12m",
                tone: "ocean",
            },
            {
                badge: 2,
                id: "sofia",
                initials: "SR",
                kind: "person",
                label: "Sofía Reyes",
                online: true,
                tone: "amber",
                unread: true,
            },
            { id: "invite", kind: "action", label: "Invite teammates" },
        ],
        label: "Humans",
    },
    {
        action: { icon: "plus", label: "Add agent", shortcut: commandShortcut("n") },
        id: "agents",
        items: [
            {
                id: "claude",
                initials: "CL",
                kind: "agent",
                label: "Claude",
                status: "ready",
                tone: "ember",
            },
            {
                id: "codex",
                initials: "CX",
                kind: "agent",
                label: "Codex",
                status: "working",
                tone: "mint",
            },
            {
                id: "triage-bot",
                initials: "TB",
                kind: "agent",
                label: "Triage bot",
                status: "ready",
                tone: "violet",
            },
        ],
        label: "Agents",
    },
];
/* A tiny inline photo so the blueprint shows the image-avatar row state. */
const PHOTO =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPorvk+ufrTrOp3i6perqx8srHiwY6K2wfKrzNgFT1edokBq+j5srMMWEWvlZ5kwCp6r+QIA1bRp8X7GbCKvi3ezYBV9EvRNgD7aoNVazUeBQAAAABJRU5ErkJggg==";
/*
 * One Happy Agent as the app lists it: its bots, then the reader's joined tasks
 * in their own order, then its projects. A task is a bot's row worn by its
 * owner's face — their photo, their initials without one, and the bot
 * placeholder when nobody was identified — with Leave as its hover control and
 * its delegated subtasks nested under it the way a bot's are.
 */
const agentSections: SidebarSection[] = [
    {
        action: { icon: "plus", label: "New bot", reveal: "always" },
        id: "agent-bots",
        items: [{ initials: "N", id: "bot-nova", kind: "project", label: "Nova" }],
        label: "Bots",
    },
    {
        action: { icon: "search", label: "Browse tasks", reveal: "always" },
        id: "agent-tasks",
        items: [
            {
                action: { icon: "close", label: "Leave Ship the launch", reveal: "hover" },
                id: "task-launch",
                imageUrl: PHOTO,
                initials: "AL",
                kind: "project",
                label: "Ship the launch",
                status: "working",
            },
            {
                depth: 1,
                id: "task-launch-checklist",
                kind: "workspace",
                label: "Write the checklist",
            },
            {
                action: { icon: "close", label: "Leave Fix invoice rounding", reveal: "hover" },
                id: "task-billing",
                initials: "BD",
                kind: "project",
                label: "Fix invoice rounding",
                unread: true,
            },
            {
                action: { icon: "close", label: "Leave Triage nightly failures", reveal: "hover" },
                icon: "tasks",
                id: "task-orphan",
                kind: "project",
                label: "Triage nightly failures",
            },
        ],
        label: "Tasks",
    },
    {
        action: { icon: "plus", label: "Add project", reveal: "always" },
        id: "agent-projects",
        items: [
            {
                action: { icon: "plus", label: "New workspace", reveal: "hover" },
                id: "agent-project",
                initials: "H",
                kind: "project",
                label: "happy",
            },
        ],
        label: "Projects",
    },
];
/*
 * A project whose worktrees are in every phase of their own life at once. Each
 * row is the same workspace row, so the specimen shows what the reader actually
 * compares: the leading slot and the trailing word change while the row's name,
 * indent, and branch stay exactly where they were.
 */
const lifecycleSections: SidebarSection[] = [
    {
        id: "lifecycle",
        items: [
            {
                action: { icon: "plus", label: "New workspace", reveal: "hover" },
                id: "lifecycle-project",
                initials: "H",
                kind: "project",
                label: "happy",
                secondaryAction: { icon: "settings", label: "Project settings", reveal: "hover" },
                tone: "ember",
            },
            {
                action: { icon: "archive", label: "Archive", reveal: "hover" },
                depth: 1,
                id: "lifecycle-creating",
                kind: "workspace",
                label: "fix-login-redirect",
                lifecycle: "creating",
                lifecycleLabel: "creating",
            },
            {
                action: { icon: "archive", label: "Archive", reveal: "hover" },
                changeStats: { added: 42, deleted: 7 },
                depth: 1,
                id: "lifecycle-ready",
                kind: "workspace",
                label: "session-catalogue",
                status: "working",
            },
            {
                action: { icon: "archive", label: "Archive", reveal: "hover" },
                depth: 1,
                id: "lifecycle-failed",
                kind: "workspace",
                label: "port-sharing-spike",
                lifecycle: "failed",
                lifecycleLabel: "failed",
            },
            {
                action: { icon: "archive", label: "Archive", reveal: "hover" },
                depth: 1,
                id: "lifecycle-missing",
                kind: "workspace",
                label: "documents-rewrite",
                lifecycle: "unavailable",
                lifecycleLabel: "missing",
            },
            {
                action: { icon: "archive", label: "Archive", reveal: "hover" },
                depth: 1,
                id: "lifecycle-long",
                kind: "workspace",
                label: "reconcile-worktrees-from-the-catalogue-stream",
                lifecycle: "creating",
                lifecycleLabel: "creating",
            },
        ],
        label: "happy",
    },
];

const treatmentSections: SidebarSection[] = [
    {
        id: "states",
        items: [
            { icon: "inbox", id: "active", kind: "view", label: "Active row" },
            { icon: "home", id: "resting", kind: "view", label: "Resting row" },
            { id: "unread", kind: "channel", label: "unread-channel", unread: true },
            { icon: "clock", id: "meta", kind: "view", label: "Meta trailing", meta: "4h" },
        ],
        label: "Row states",
    },
    {
        id: "kinds",
        items: [
            { icon: "files", id: "kind-view", kind: "view", label: "View — 16px icon" },
            { id: "kind-channel", kind: "channel", label: "channel — hash" },
            { icon: "lock", id: "kind-channel-lock", kind: "channel", label: "channel — lock" },
            {
                id: "kind-person",
                initials: "MJ",
                kind: "person",
                label: "Person — xs avatar",
                online: true,
                tone: "rose",
            },
            {
                id: "kind-agent",
                initials: "CX",
                kind: "agent",
                label: "Agent — working",
                status: "working",
                tone: "mint",
            },
            {
                action: { icon: "plus", label: "New workspace", reveal: "hover" },
                changeStats: { added: 309, deleted: 324 },
                id: "kind-project",
                initials: "R",
                kind: "project",
                label: "Project — working",
                secondaryAction: { icon: "settings", label: "Project settings", reveal: "hover" },
                status: "working",
                tone: "ember",
            },
            {
                id: "kind-project-waiting",
                initials: "W",
                kind: "project",
                label: "Project — waiting",
                status: "waiting",
                tone: "ocean",
            },
            {
                id: "kind-project-asking",
                initials: "Q",
                kind: "project",
                label: "Project — asking a question",
                status: "awaitingInput",
                tone: "violet",
            },
            {
                action: { icon: "plus", label: "New workspace", reveal: "hover" },
                changeStats: { added: 1, deleted: 0 },
                id: "kind-project-narrow",
                initials: "N",
                kind: "project",
                label: "Project — narrowest delta, settings beside the name",
                secondaryAction: { icon: "settings", label: "Project settings", reveal: "hover" },
                tone: "mint",
            },
            {
                action: { icon: "plus", label: "New workspace" },
                id: "kind-project-clean",
                initials: "H",
                kind: "project",
                label: "Project — settings beside the name",
                secondaryAction: { icon: "settings", label: "Project settings", reveal: "hover" },
                tone: "ocean",
            },
            {
                icon: "home",
                id: "kind-agent-glyph",
                initials: "H",
                kind: "agent",
                label: "Agent — glyph avatar",
                tone: "brand",
            },
            {
                id: "kind-person-photo",
                imageUrl: PHOTO,
                initials: "MJ",
                kind: "person",
                label: "Person — photo avatar",
                online: true,
                tone: "rose",
            },
            {
                id: "kind-agent-photo",
                imageUrl: PHOTO,
                initials: "CX",
                kind: "agent",
                label: "Agent — photo avatar",
                tone: "mint",
            },
            {
                id: "kind-project-generated",
                initials: "N",
                kind: "project",
                label: "Bot — initials avatar",
            },
            {
                id: "kind-project-generated-busy",
                initials: "A",
                kind: "project",
                label: "Bot — initials avatar, working",
                status: "working",
                unread: true,
            },
            {
                id: "kind-project-generated-photo",
                imageUrl: PHOTO,
                initials: "O",
                kind: "project",
                label: "Bot — picture avatar",
            },
            { id: "kind-action", kind: "action", label: "Action — muted plus" },
        ],
        label: "Row kinds",
    },
];
/* Footer composition used by the app: profile control, then the permission-gated
   Administration cog, then the appearance toggle. Administration is icon-only and
   sits directly before the theme control. */
function FooterUser() {
    return (
        <div
            style={{
                alignItems: "center",
                display: "flex",
                gap: "4px",
                width: "100%",
            }}
        >
            <div
                style={{
                    alignItems: "center",
                    display: "flex",
                    flex: "1 1 auto",
                    gap: "10px",
                    minWidth: "0",
                }}
            >
                <Avatar initials="SK" online size="sm" tone="ocean" />
                <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                    <span
                        style={{
                            color: "var(--text)",
                            fontSize: "13px",
                            fontWeight: "600",
                            lineHeight: "16px",
                        }}
                    >
                        Sasha K.
                    </span>
                    <span
                        style={{
                            color: "var(--text-secondary)",
                            fontSize: "11px",
                            lineHeight: "14px",
                        }}
                    >
                        Online
                    </span>
                </div>
            </div>
            <Button
                aria-label="Administration"
                icon="settings"
                iconOnly
                size="small"
                variant="ghost"
            />
            <Button
                aria-label="Use light appearance"
                icon="moon"
                iconOnly
                size="small"
                variant="ghost"
            />
        </div>
    );
}
/* Reorder specimen. The tree is held here rather than flattened into items so a
   reported move can be applied the way a product store applies it: a top-level
   row carries its children, a nested row stays inside its own parent. */
interface ReorderNode {
    readonly children: readonly ReorderNode[];
    readonly id: string;
    readonly label: string;
}
const REORDER_TREE: readonly ReorderNode[] = [
    { children: [], id: "chan-one", label: "Chan one" },
    {
        children: [
            { children: [], id: "sub-a", label: "Sub a" },
            // Three levels, because nested rows may contain more nested rows: a
            // row this deep must be ordered among
            // its own siblings, not among everything under its top-level row.
            {
                children: [
                    { children: [], id: "deep-a", label: "Deep a" },
                    { children: [], id: "deep-b", label: "Deep b" },
                ],
                id: "sub-b",
                label: "Sub b",
            },
        ],
        id: "chan-two",
        label: "Chan two",
    },
    { children: [], id: "chan-three", label: "Chan three" },
    {
        children: [
            { children: [], id: "sub-c", label: "Sub c" },
            { children: [], id: "sub-d", label: "Sub d" },
        ],
        id: "chan-four",
        label: "Chan four",
    },
    { children: [], id: "chan-five", label: "Chan five" },
];
function reorderItems(tree: readonly ReorderNode[], depth = 0): SidebarItem[] {
    return tree.flatMap((node) => [
        { depth, id: node.id, kind: "channel" as const, label: node.label },
        ...reorderItems(node.children, depth + 1),
    ]);
}
/** Applies a reported move wherever in the tree its parent sits. */
function treeMove(
    tree: readonly ReorderNode[],
    parentId: string | undefined,
    id: string,
    afterId: string | null,
): readonly ReorderNode[] {
    if (parentId === undefined) return listMove(tree, id, afterId);
    return tree.map((node) =>
        node.id === parentId
            ? { ...node, children: listMove(node.children, id, afterId) }
            : { ...node, children: treeMove(node.children, parentId, id, afterId) },
    );
}
function listMove<T extends { id: string }>(
    values: readonly T[],
    id: string,
    afterId: string | null,
): readonly T[] {
    const moved = values.find((value) => value.id === id);
    if (!moved) return values;
    const rest = values.filter((value) => value.id !== id);
    const at = afterId === null ? 0 : rest.findIndex((value) => value.id === afterId) + 1;
    const next = [...rest];
    next.splice(at, 0, moved);
    return next;
}
function ReorderDemo() {
    const [tree, setTree] = useState(REORDER_TREE);
    const [move, setMove] = useState<string>("— drag a row —");
    const [added, setAdded] = useState(0);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Frame height={500}>
                <Sidebar
                    activeItemId="chan-one"
                    onItemReorder={(sectionId, reorder) => {
                        setMove(
                            `${sectionId}: ${reorder.id} after ${reorder.afterId ?? "«front»"}${
                                reorder.parentId ? ` in ${reorder.parentId}` : ""
                            }`,
                        );
                        setTree((current) =>
                            treeMove(current, reorder.parentId, reorder.id, reorder.afterId),
                        );
                    }}
                    onItemSelect={() => {}}
                    sections={[{ id: "channels", items: reorderItems(tree), label: "Channels" }]}
                    title="Reorder"
                />
            </Frame>
            <div style={{ alignItems: "center", display: "flex", gap: "8px" }}>
                <Button
                    onClick={() => {
                        // Lands while a drag is still in flight, which is what a
                        // live workspace does when an agent opens a channel
                        // mid-gesture: the drop must survive it.
                        const at = added + 1;
                        setAdded(at);
                        window.setTimeout(
                            () =>
                                setTree((current) => [
                                    ...current,
                                    { children: [], id: `late-${at}`, label: `Late ${at}` },
                                ]),
                            1500,
                        );
                    }}
                    size="small"
                    variant="ghost"
                >
                    Add a channel in 1.5s
                </Button>
                <span
                    data-blueprint="sidebar-reorder-move"
                    style={{ color: "var(--text-secondary)", font: "var(--font-caption)" }}
                >
                    {move}
                </span>
            </div>
            <DimensionRule label="cursor pointer → grabbing · nested rows reorder inside their parent" />
        </div>
    );
}

/**
 * Folding, over the same nested tree the reorder specimen uses, so a row that
 * folds is seen to be an ordinary row of the list rather than a shape of its
 * own — and so a fold and a drag are reviewed against one another.
 *
 * The folded rows are held here exactly as a product store holds them: the
 * sidebar is told which rows are shut and reports a press, and never decides for
 * itself what is open. A folded row takes its descendants with it,
 * which is why the tree is three levels deep and why one row starts shut.
 */
function FoldDemo() {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set(["chan-four"]));
    const rows = reorderItems(REORDER_TREE);
    const items = rows.map((item, index) =>
        collapsed.has(item.id) && (rows[index + 1]?.depth ?? 0) > (item.depth ?? 0)
            ? { ...item, collapsed: true }
            : item,
    );
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Frame height={420}>
                <Sidebar
                    activeItemId="chan-one"
                    onItemCollapseToggle={(id) => {
                        setCollapsed((current) => {
                            const next = new Set(current);
                            if (!next.delete(id)) next.add(id);
                            return next;
                        });
                    }}
                    onItemSelect={() => {}}
                    sections={[{ id: "channels", items, label: "Channels" }]}
                    title="Fold"
                />
            </Frame>
            <DimensionRule label="chevron 12px over the 20px leading lane · row 32 px unchanged · a shut row keeps its chevron showing" />
        </div>
    );
}

const QUIET_BOTS: readonly {
    readonly id: string;
    readonly label: string;
    readonly unread: boolean;
}[] = [
    { id: "chief-of-staff", label: "Chief of Staff", unread: true },
    { id: "growth", label: "Growth", unread: true },
    { id: "release-notes", label: "Release notes", unread: false },
    { id: "scraper", label: "Scraper", unread: true },
];

/**
 * Muted and hidden bots, held here the way the window's attention store holds
 * them. A muted unread row keeps its 700 weight and loses only its dot; a
 * hidden row leaves the list, and the Bots heading's eye-off control lists it
 * to bring it back. Right-click a row to mute or hide it.
 */
function QuietBotsDemo() {
    const [muted, setMuted] = useState<ReadonlySet<string>>(new Set(["growth", "release-notes"]));
    const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set(["scraper"]));
    const toggle = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
        const next = new Set(set);
        if (!next.delete(id)) next.add(id);
        return next;
    };
    const hiddenBots = QUIET_BOTS.filter((bot) => hidden.has(bot.id));
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Frame height={300}>
                <Sidebar
                    activeItemId=""
                    itemMenuItems={(item) => [
                        {
                            kind: "item",
                            id: "mute",
                            label: muted.has(item.id) ? "Unmute bot" : "Mute bot",
                            icon: "bell",
                        },
                        { kind: "item", id: "hide", label: "Hide from sidebar", icon: "eye-off" },
                    ]}
                    onItemMenuSelect={(item, actionId) => {
                        if (actionId === "mute") setMuted((current) => toggle(current, item.id));
                        if (actionId === "hide") setHidden((current) => toggle(current, item.id));
                    }}
                    onItemSelect={() => {}}
                    onSectionAction={() => {}}
                    onSectionMenuSelect={(_section, _source, actionId) => {
                        setHidden((current) =>
                            actionId === "show-all"
                                ? new Set()
                                : toggle(current, actionId.slice("show:".length)),
                        );
                    }}
                    sections={[
                        {
                            action: { icon: "plus", label: "New bot", reveal: "always" },
                            id: "bots",
                            items: QUIET_BOTS.filter((bot) => !hidden.has(bot.id)).map(
                                (bot): SidebarItem => ({
                                    initials: bot.label.slice(0, 1).toUpperCase(),
                                    id: bot.id,
                                    kind: "project",
                                    label: bot.label,
                                    ...(bot.unread ? { unread: true } : {}),
                                    ...(muted.has(bot.id) ? { muted: true } : {}),
                                }),
                            ),
                            label: "Bots",
                            ...(hiddenBots.length > 0
                                ? {
                                      secondaryAction: {
                                          icon: "eye-off" as const,
                                          label: "Hidden bots",
                                          reveal: "always" as const,
                                          menuItems: [
                                              { kind: "label" as const, label: "Hidden bots" },
                                              ...hiddenBots.map((bot) => ({
                                                  kind: "item" as const,
                                                  id: `show:${bot.id}`,
                                                  label: `Show ${bot.label}`,
                                                  icon: "eye" as const,
                                              })),
                                          ],
                                      },
                                  }
                                : {}),
                        },
                    ]}
                    title="Quiet bots"
                />
            </Frame>
            <DimensionRule label="muted unread = 700, no dot · hidden = absent · heading eye-off opens the hidden list" />
        </div>
    );
}

const PINNED_ROWS: SidebarItem[] = [
    { icon: "doc", id: "notes", kind: "action", label: "Notes" },
    { badge: 3, icon: "bell", id: "inbox", kind: "action", label: "Inbox" },
    { icon: "zap", id: "usage", kind: "action", label: "Usage" },
];

/**
 * The pinned rows arranged by drag and by keyboard. Both report the same one
 * move, so this demo applies them through the same list operation the product
 * applies its durable order with.
 */
function PinnedReorderDemo() {
    const [rows, setRows] = useState<SidebarItem[]>(PINNED_ROWS);
    const [move, setMove] = useState<string>("— drag a row, or focus one and press ⌥↑ / ⌥↓ —");
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Frame height={300}>
                <Sidebar
                    actions={rows}
                    activeItemId=""
                    footer={
                        <SidebarFooter
                            devMenu={
                                <DevBuildMenu
                                    branch="feature/sidebar-reorder"
                                    label="workspace-23"
                                    onBlueprintOpen={() => setMove("opened Blueprint")}
                                    onCopyPath={() => setMove("copied worktree path")}
                                    path="/Users/kirilldubovitskiy/Happy/Workspaces/happy-desktop"
                                />
                            }
                            onSettingsOpen={() => {}}
                        />
                    }
                    onActionReorder={(reorder) => {
                        setMove(`${reorder.id} after ${reorder.afterId ?? "«front»"}`);
                        setRows((current) => [...listMove(current, reorder.id, reorder.afterId)]);
                    }}
                    onItemSelect={(id) => setMove(`opened ${id}`)}
                    sections={[
                        {
                            id: "projects",
                            items: [{ id: "happy", kind: "project", label: "happy" }],
                            label: "Projects",
                        },
                    ]}
                    title="Pinned"
                />
            </Frame>
            <span
                data-blueprint="sidebar-action-reorder-move"
                style={{ color: "var(--text-secondary)", font: "var(--font-caption)" }}
            >
                {move}
            </span>
            <DimensionRule label="cursor pointer → grabbing · pinned rows arrange above the projects · ⌥↑ / ⌥↓ moves the focused row" />
        </div>
    );
}

/** An open heading's `+`, shown on hover or focus, which makes new work right under it. */
const SECTION_NEW = (label: string) => ({
    icon: "plus" as const,
    label: `New in ${label}`,
    reveal: "hover" as const,
});

/** One list where Search, Create, separators and rows are all items of it. */
const LIST_ROWS: SidebarItem[] = [
    {
        icon: "search",
        id: "search",
        kind: "action",
        label: "Search",
        shortcut: commandShortcut("k"),
    },
    {
        icon: "compose",
        id: "create",
        kind: "action",
        label: "Create",
        shortcut: commandShortcut("n"),
    },
    { emoji: "🙂", id: "happy", kind: "view", label: "Happy" },
    { id: "divider", kind: "separator", label: "" },
    { collapsed: false, id: "bots", kind: "section", label: "Bots" },
    { emoji: "🤖", id: "release-bot", kind: "view", label: "Release bot" },
    { collapsed: false, id: "tasks", kind: "section", label: "Tasks" },
    {
        changeStats: { added: 628, deleted: 364 },
        emoji: "🎨",
        id: "sidebar",
        kind: "view",
        label: "Sidebar UI fixes",
    },
    {
        changeStats: { added: 251, deleted: 57 },
        emoji: "🧱",
        id: "model",
        kind: "view",
        label: "Release notes",
    },
    { collapsed: true, id: "later", kind: "section", label: "Later" },
    { emoji: "🎲", id: "flaky", kind: "view", label: "Fix flaky CI" },
];

/**
 * A top-level move carries the row's nested rows with it; a section carries its
 * whole block, every row up to the next section or separator, and lands after
 * the block it was dropped behind.
 */
function oneListMove(items: readonly SidebarItem[], move: SidebarReorder): SidebarItem[] {
    if (move.parentId !== undefined) return [...items];
    const section = items.find((item) => item.id === move.id)?.kind === "section";
    const blocks: SidebarItem[][] = [];
    let open = false;
    for (const item of items) {
        const top = (item.depth ?? 0) === 0;
        const breaks = top && (item.kind === "section" || item.kind === "separator");
        const joins = section ? !breaks && open : !top;
        if (joins && blocks.length > 0) blocks.at(-1)!.push(item);
        else blocks.push([item]);
        open = !(top && item.kind === "separator");
    }
    return listMove(
        blocks.map((block) => ({ id: block[0]!.id, block })),
        move.id,
        move.afterId,
    ).flatMap(({ block }) => block);
}

function OneListDemo() {
    const [items, setItems] = useState(LIST_ROWS);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Frame height={460}>
                <Sidebar
                    activeItemId="sidebar"
                    data-testid="one-list"
                    foldControlPlacement="trailing"
                    foldControlReveal="hover"
                    onItemCollapseToggle={(id) =>
                        setItems((current) =>
                            current.map((item) =>
                                item.id === id && item.collapsed !== undefined
                                    ? { ...item, collapsed: !item.collapsed }
                                    : item,
                            ),
                        )
                    }
                    onItemReorder={(_section, move) =>
                        setItems((current) => oneListMove(current, move))
                    }
                    onItemAction={(id) =>
                        setItems((current) => {
                            const at = current.findIndex((item) => item.id === id);
                            const made: SidebarItem = {
                                emoji: "🌱",
                                id: `new-${String(current.length)}`,
                                kind: "view",
                                label: "New",
                            };
                            return [...current.slice(0, at + 1), made, ...current.slice(at + 1)];
                        })
                    }
                    onItemSelect={() => {}}
                    sections={[
                        {
                            id: "one-list",
                            // Only an open heading offers new work under it.
                            items: items.map((item) =>
                                item.kind === "section" && item.collapsed === false
                                    ? { ...item, action: SECTION_NEW(item.label) }
                                    : item,
                            ),
                        },
                    ]}
                    title="Work"
                />
            </Frame>
            <DimensionRule label="section 28 px open or folded, title only · an open section's + on hover makes new work under it · separator 17 px, full width · key caps on the row's edge" />
        </div>
    );
}

function Frame(props: { children: ReactNode; height: number }) {
    return (
        <div
            style={{
                border: "1px solid var(--divider)",
                display: "flex",
                height: `${props.height}px`,
                overflow: "hidden",
                width: "max-content",
            }}
        >
            {props.children}
        </div>
    );
}

/*
 * The trailing-lane alignment cases: real workspace names and real deltas, in a
 * run of rows long enough that the scrollbar arrives on its own rather than
 * being simulated.
 *
 * What they prove is that a quiet row's delta ends the row on the panel's own
 * column, that a running row — and only a running row — moves it left by the
 * one activity cell, and that hover changes neither: the controls are laid over
 * the lane, so the row is the same width with the pointer on it as without. The
 * project row heading them keeps both of its controls hover-only, so neither
 * the + nor the settings gear can widen the lane the worktrees share.
 */
const ALIGNMENT_WORKTREES: readonly {
    readonly added: number;
    readonly deleted: number;
    readonly id: string;
    readonly label: string;
    readonly working: boolean;
}[] = [
    {
        added: 4124,
        deleted: 1431,
        id: "move-activity",
        label: "Move Activity into Files",
        working: true,
    },
    {
        added: 4038,
        deleted: 1453,
        id: "react-electron-plugin",
        label: "React Electron Plugin Host",
        working: true,
    },
    {
        added: 8463,
        deleted: 23,
        id: "telegram-emoji",
        label: "Telegram Custom Emoji",
        working: false,
    },
    { added: 3504, deleted: 907, id: "file-viewer", label: "File viewer polish", working: true },
    {
        added: 245,
        deleted: 82,
        id: "happy-agent-documents",
        label: "Happy Agent documents",
        working: false,
    },
    { added: 1200, deleted: 34, id: "slots", label: "Contribution slots", working: false },
    {
        added: 96,
        deleted: 0,
        id: "multiple-happy-agents",
        label: "Multiple Happy Agents",
        working: false,
    },
    { added: 12800, deleted: 4310, id: "portless", label: "Portless loopback", working: false },
];

function alignmentSections(props: {
    readonly rows: number;
    readonly working: boolean;
}): SidebarSection[] {
    return [
        {
            action: { icon: "plus", label: "New workspace in happy-desktop" },
            id: "happy-desktop",
            items: [
                {
                    action: {
                        icon: "plus",
                        label: "New workspace in happy-desktop",
                        reveal: "hover",
                    },
                    id: "happy-desktop-project",
                    initials: "H",
                    kind: "project",
                    label: "happy-desktop",
                    secondaryAction: {
                        icon: "settings",
                        label: "Settings for happy-desktop",
                        reveal: "hover",
                    },
                    tone: "ember",
                },
                ...ALIGNMENT_WORKTREES.slice(0, props.rows).map(
                    (worktree): SidebarItem => ({
                        action: {
                            icon: "archive",
                            label: `Archive ${worktree.label}`,
                            reveal: "hover",
                        },
                        changeStats: { added: worktree.added, deleted: worktree.deleted },
                        depth: 1,
                        id: worktree.id,
                        kind: "workspace",
                        label: worktree.label,
                        ...(props.working && worktree.working
                            ? { status: "working" as const }
                            : {}),
                    }),
                ),
            ],
            label: "happy-desktop",
        },
    ];
}

const ALIGNMENT_CASES: readonly {
    readonly height: number;
    readonly label: string;
    readonly sections: SidebarSection[];
    readonly testId: string;
}[] = [
    {
        height: 300,
        label: "No scrollbar · sessions running · deltas one cell in",
        sections: alignmentSections({ rows: 4, working: true }),
        testId: "alignment-short-working",
    },
    {
        height: 300,
        label: "Scrollbar present · sessions running · same columns, bar over the inset",
        sections: alignmentSections({ rows: 8, working: true }),
        testId: "alignment-scrolling-working",
    },
    {
        height: 300,
        label: "No scrollbar · nothing running · deltas end the row",
        sections: alignmentSections({ rows: 4, working: false }),
        testId: "alignment-short-quiet",
    },
    {
        height: 300,
        label: "Scrollbar present · nothing running · deltas end the row",
        sections: alignmentSections({ rows: 8, working: false }),
        testId: "alignment-scrolling-quiet",
    },
];

/*
 * An experiment, drawn only for specimen 07 and deliberately not a Sidebar
 * variant: the shipping component has no prop for this and must not grow one
 * until the shape is chosen. A worktree is a peer row carrying a branch glyph
 * where the tree used to spend a lane on stems and elbows, and the spinner
 * takes that glyph's place while work runs rather than adding a second mark at
 * the far end of the row.
 *
 * It borrows the shipping row's own classes rather than restating their
 * geometry, so what is being judged is the real row height, inset, gap, and
 * hover — only the arrangement inside it is new.
 */
function BranchListSketch(props: { working: boolean }) {
    return (
        <div className="happy-sidebar">
            <div className="happy-sidebar__body">
                <div className="happy-sidebar__body-content">
                    <div className="happy-sidebar__section">
                        <div className="happy-sidebar__section-head">
                            <span className="happy-sidebar__section-label">happy-desktop</span>
                        </div>
                        {ALIGNMENT_WORKTREES.map((worktree) => (
                            <button
                                className="happy-sidebar__item"
                                data-active={
                                    worktree.id === "react-electron-plugin" ? "" : undefined
                                }
                                data-kind="workspace"
                                key={worktree.id}
                                type="button"
                            >
                                <span className="happy-sidebar__item-leading">
                                    {props.working && worktree.working ? (
                                        <Spinner
                                            label={`${worktree.label} is working`}
                                            size={16}
                                            tone="muted"
                                        />
                                    ) : (
                                        <Icon name="branch" size={16} />
                                    )}
                                </span>
                                <span className="happy-sidebar__item-label">{worktree.label}</span>
                                <span
                                    className="happy-sidebar__item-trailing"
                                    style={{ columnGap: SIDEBAR_TRAILING_GAP }}
                                >
                                    <span className="happy-sidebar__item-change-stats">
                                        <span data-tone="added">
                                            +{sketchCount(worktree.added)}
                                        </span>
                                        <span data-tone="deleted">
                                            −{sketchCount(worktree.deleted)}
                                        </span>
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** The delta abbreviation the shipping row uses, restated for the sketch alone. */
function sketchCount(lines: number): string {
    return lines < 1000 ? String(lines) : `${(lines / 1000).toFixed(1)}k`;
}

/** The rows a machine's section holds, reused by each heading-action state. */
const HEADING_ACTION_ITEMS: SidebarItem[] = [
    { id: "happy", initials: "H", kind: "project", label: "happy" },
    { id: "happy-agent", initials: "H", kind: "project", label: "happy-agent" },
];

const HEADING_ACTION_STATES: readonly {
    readonly label: string;
    readonly rule: string;
    readonly section: SidebarSection;
}[] = [
    {
        label: "Resting",
        rule: "18 px control · always visible · glyph 12",
        section: {
            action: { icon: "plus", label: "Add project", reveal: "always" },
            id: "happy-agent:local",
            items: HEADING_ACTION_ITEMS,
            label: "This Mac",
        },
    },
    {
        label: "Pending",
        rule: "spinner 12 in the 18 px control · not pressable",
        section: {
            action: { busy: true, icon: "plus", label: "Add project", reveal: "always" },
            id: "happy-agent:local",
            items: HEADING_ACTION_ITEMS,
            label: "This Mac",
        },
    },
    {
        label: "Refused",
        rule: "error under the 24 px heading · 11/15 · pad 0 10",
        section: {
            action: { icon: "plus", label: "Add project", reveal: "always" },
            error: "“notes” is not a Git repository. Add a folder with a repository in it.",
            id: "happy-agent:local",
            items: HEADING_ACTION_ITEMS,
            label: "This Mac",
        },
    },
    {
        label: "Hover-revealed",
        rule: "default reveal · appears on heading hover or focus",
        section: {
            action: { icon: "plus", label: "Add channel" },
            id: "hover",
            items: HEADING_ACTION_ITEMS,
            label: "Hover to reveal",
        },
    },
];

const UPDATE_STATES: readonly {
    readonly label: string;
    readonly update: SidebarUpdateActionProps;
}[] = [
    {
        label: "Available",
        update: {
            action: "restart",
            status: "available",
            subject: "application",
            version: "0.0.22",
        },
    },
    {
        label: "Downloading",
        update: {
            action: "restart",
            detail: "64% downloaded",
            status: "downloading",
            subject: "application",
            version: "0.0.22",
        },
    },
    {
        label: "Native ready",
        update: {
            action: "restart",
            onAction: () => {},
            status: "downloaded",
            subject: "application",
            version: "0.0.22",
        },
    },
    {
        label: "Web ready",
        update: {
            action: "refresh",
            onAction: () => {},
            status: "downloaded",
            subject: "application",
            version: "build 8250610",
        },
    },
    {
        label: "Agent downloading",
        update: {
            action: "install",
            detail: "64% downloaded",
            status: "downloading",
            subject: "happyAgent",
            version: "0.3.10",
        },
    },
    {
        label: "Agent ready",
        update: {
            action: "install",
            onAction: () => {},
            status: "downloaded",
            subject: "happyAgent",
            version: "0.3.10",
        },
    },
];

const CHANGELOG_URL = "https://happy.engineering/changelog/";

/*
 * Real Happy Agent notes, merged the way the desktop host merges them: every
 * release in range, newest first, each bullet kept where it first appears.
 */
const UPDATE_NOTES: readonly {
    readonly label: string;
    readonly detail: string;
    readonly version: string;
    readonly notes?: SidebarUpdateNotes;
}[] = [
    {
        detail: "stable 0.4.105 → 0.4.106",
        label: "One release",
        notes: {
            changelogUrl: CHANGELOG_URL,
            features: {
                items: ["Sidebar sorts work by topic", "New work appears instantly"],
                total: 2,
            },
            fixes: { items: ["Reliable task and bot names"], total: 1 },
            from: "0.4.105",
            kind: "list",
            releaseCount: 1,
            to: "0.4.106",
        },
        version: "0.4.106",
    },
    {
        detail: "stable 0.4.102 → 0.4.106",
        label: "Several releases",
        notes: {
            changelogUrl: CHANGELOG_URL,
            features: {
                items: [
                    "Sidebar sorts work by topic",
                    "New work appears instantly",
                    "MCP servers can ask approval",
                    "Sidebar keeps your manual changes",
                    "Spawned agents show their names",
                ],
                total: 7,
            },
            fixes: {
                items: [
                    "Reliable task and bot names",
                    "No freezes with many MCP tools",
                    "Failure switch menu stays current",
                ],
                total: 3,
            },
            from: "0.4.102",
            kind: "list",
            releaseCount: 4,
            to: "0.4.106",
        },
        version: "0.4.106",
    },
    {
        detail: "preview 0.4.102 → 0.4.106",
        label: "Long gap",
        notes: {
            changelogUrl: CHANGELOG_URL,
            features: {
                items: [
                    "Sidebar sorts work by topic",
                    "New work appears instantly",
                    "Distractions fold out of sight",
                    "Widgets in the sidebar",
                    "Agent messages explain themselves",
                ],
                total: 16,
            },
            fixes: {
                items: [
                    "Reliable task and bot names",
                    "Sidebar edits no longer collide",
                    "Hostile replies cannot freeze chat",
                    "No freezes with many MCP tools",
                    "No crash loop after downgrade",
                ],
                total: 12,
            },
            from: "0.4.102",
            kind: "list",
            releaseCount: 15,
            to: "0.4.106",
        },
        version: "0.4.106",
    },
    {
        detail: "past 20 releases",
        label: "Way out of date",
        notes: {
            changelogUrl: CHANGELOG_URL,
            from: "0.3.17",
            kind: "overflow",
            releaseCount: 108,
            to: "0.4.106",
        },
        version: "0.4.106",
    },
    {
        detail: "opens on Fixes",
        label: "Fixes only",
        notes: {
            changelogUrl: CHANGELOG_URL,
            features: { items: [], total: 0 },
            fixes: { items: ["Updated bundled Bun runtime"], total: 1 },
            from: "0.4.105-preview.1",
            kind: "list",
            releaseCount: 1,
            to: "0.4.105-preview.2",
        },
        version: "0.4.105-preview.2",
    },
    {
        detail: "today's card",
        label: "No notes",
        version: "0.4.107",
    },
];

const SHORTCUT_ACTIONS: SidebarItem[] = [
    { icon: "braces", id: "blueprint", kind: "action", label: "Blueprint" },
];
const SHORTCUT_SECTIONS: SidebarSection[] = [
    {
        id: "shortcuts",
        items: [
            {
                action: {
                    icon: "plus",
                    label: "New workspace in keyboard-shortcuts",
                    shortcut: workspaceShortcut,
                },
                id: "project",
                kind: "project",
                label: "keyboard-shortcuts",
                status: "working",
            },
            {
                depth: 1,
                id: "workspace-hints",
                kind: "workspace",
                label: "hover-hints",
            },
            {
                depth: 1,
                id: "workspace-layout",
                kind: "workspace",
                label: "stable-layout",
            },
            {
                id: "other-project",
                kind: "project",
                label: "desktop-shell",
            },
        ],
        label: "This Mac",
    },
];
const SHORTCUT_TARGETS = [
    { itemId: "project", sectionId: "shortcuts" },
    { itemId: "workspace-hints", sectionId: "shortcuts" },
    { itemId: "workspace-layout", sectionId: "shortcuts" },
    { itemId: "other-project", sectionId: "shortcuts" },
] as const;

function InlineRenameDemo() {
    const [items, setItems] = useState<SidebarItem[]>([
        { id: "rename-task", kind: "agent", label: "Sidebar polish", initials: "SP" },
        { id: "rename-unread", kind: "agent", label: "Unread task", unread: true },
        { id: "rename-working", kind: "agent", label: "Working task", status: "working" },
        { id: "rename-project", kind: "project", label: "Happy desktop" },
        { id: "rename-worktree", kind: "workspace", label: "Sidebar branch", depth: 1 },
    ]);
    return (
        <Frame height={260}>
            <Sidebar
                activeItemId="rename-task"
                itemMenuItems={() => [
                    { kind: "item", id: "rename", label: "Rename", icon: "edit" },
                    { kind: "item", id: "leave", label: "Leave task", icon: "close" },
                    { kind: "separator" },
                    {
                        kind: "item",
                        id: "archive",
                        label: "Archive task",
                        icon: "archive",
                        danger: true,
                    },
                ]}
                itemRename={{
                    actionId: "rename",
                    onSubmit: (item, name) =>
                        setItems((current) =>
                            current.map((row) =>
                                row.id === item.id ? { ...row, label: name } : row,
                            ),
                        ),
                }}
                onItemSelect={() => {}}
                sections={[{ id: "rename", label: "Right-click to rename", items }]}
                title="Rename in place"
            />
        </Frame>
    );
}

export function SidebarPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="288px workspace navigation column — header with workspace switcher, sectioned rows for views, channels, people, agents, and actions, actionable empty states, and an optional footer."
            title="Sidebar"
        >
            <Specimen
                detail="Choose Rename, or focus a row and press Enter. The label itself becomes editable without moving. Enter or blur saves; Escape cancels."
                label="Rename in place"
                number="00"
                stage="app"
            >
                <InlineRenameDemo />
            </Specimen>
            <Specimen
                detail="288 wide · header 52 · rows 32 on a 2px rhythm · footer 52 with top hairline"
                label="Full workspace sidebar"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={620}>
                        <Sidebar
                            activeItemId="inbox"
                            footer={<FooterUser />}
                            onItemSelect={() => {}}
                            onSectionAction={() => {}}
                            sections={workspaceSections}
                            subtitle="12 members · 3 agents"
                            title="Acme Studio"
                        />
                    </Frame>
                    <DimensionRule label="288 px wide · 620 px viewport" />
                </div>
            </Specimen>

            <Specimen
                detail="The 28px orange arrow-up-circle appears only once an update is downloaded. Available and downloading updates leave the footer quiet; their status stays in Settings."
                label="Desktop update footer"
                number="01c"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {UPDATE_STATES.map(({ label, update }) => (
                        <div
                            key={label}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <Frame height={180}>
                                <Sidebar
                                    activeItemId=""
                                    footer={
                                        <SidebarFooter
                                            actions={<SidebarUpdateAction {...update} />}
                                            onSettingsOpen={() => {}}
                                        />
                                    }
                                    onItemSelect={() => {}}
                                    sections={[]}
                                    title={label}
                                />
                            </Frame>
                            <DimensionRule label={`${label} · footer 56 px · 28 px mark`} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="A downloaded update opens a 236px panel on the footer's gutters: version, readiness, and one line promising work in flight survives. A native package applies with Restart; a hosted renderer deploy with Refresh; the agent binary with Install. Pending downloads show no mark or panel."
                label="Update panel"
                number="01d"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {UPDATE_STATES.map(({ label, update }) => (
                        <div
                            key={label}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <Frame height={280}>
                                <Sidebar
                                    activeItemId=""
                                    footer={
                                        <SidebarFooter
                                            actions={
                                                <SidebarUpdateAction {...update} defaultOpen />
                                            }
                                            onSettingsOpen={() => {}}
                                        />
                                    }
                                    onItemSelect={() => {}}
                                    sections={[]}
                                    title={label}
                                />
                            </Frame>
                            <DimensionRule
                                label={`${label} · panel 236 px · 8 px above the mark`}
                            />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="A ready Happy Agent update lists what is new since the installed version above the panel, inside the same 236px card: Features and Fixes tabs with counts, the range, at most five bullets, then the changelog. Past 20 releases it lists nothing and points at the changelog. Install folds the notes away first."
                label="Update notes"
                number="01f"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {UPDATE_NOTES.map(({ detail, label, notes, version }) => (
                        <div
                            key={label}
                            data-happy-desktop-ui-blueprint-update-notes={label}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <Frame height={440}>
                                <Sidebar
                                    activeItemId=""
                                    footer={
                                        <SidebarFooter
                                            actions={
                                                <SidebarUpdateAction
                                                    action="install"
                                                    defaultOpen
                                                    {...(notes ? { notes } : {})}
                                                    onAction={() => {}}
                                                    status="downloaded"
                                                    subject="happyAgent"
                                                    version={version}
                                                />
                                            }
                                            onSettingsOpen={() => {}}
                                        />
                                    }
                                    onItemSelect={() => {}}
                                    sections={[]}
                                    title={label}
                                />
                            </Frame>
                            <DimensionRule label={`${label} · ${detail}`} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="A dropped machine is stated in the footer's leading slot: a spinner while reconnecting, an alert once settled. The line takes the free space and truncates; the trailing controls never move and nothing above shifts."
                label="Connection lost"
                number="01e"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {[
                        {
                            label: "Reconnecting",
                            connection: { message: "This Mac is unreachable.", retrying: true },
                        },
                        {
                            label: "Settled error",
                            connection: {
                                message: "This Happy Agent connection is closed.",
                                retrying: false,
                            },
                        },
                    ].map(({ label, connection }) => (
                        <div
                            key={label}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <Frame height={160}>
                                <Sidebar
                                    activeItemId=""
                                    footer={
                                        <SidebarFooter
                                            connection={connection}
                                            onSettingsOpen={() => {}}
                                        />
                                    }
                                    onItemSelect={() => {}}
                                    sections={[]}
                                    title={label}
                                />
                            </Frame>
                            <DimensionRule label={`${label} · 28 px line · 14 px glyph`} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Drill-down level: back button + title replace the brand; body animates in. Used for the administration sub-navigation."
                label="Back / drill-down header"
                number="01b"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={460}>
                        <Sidebar
                            activeItemId="users"
                            footer={<FooterUser />}
                            onBack={() => {}}
                            onItemSelect={() => {}}
                            sections={[
                                {
                                    id: "admin",
                                    items: [
                                        {
                                            id: "users",
                                            kind: "view",
                                            icon: "users",
                                            label: "Users",
                                        },
                                        {
                                            id: "reports",
                                            kind: "view",
                                            icon: "shield",
                                            label: "Reports",
                                        },
                                        {
                                            id: "automations",
                                            kind: "view",
                                            icon: "zap",
                                            label: "Automations",
                                        },
                                        {
                                            id: "integrations",
                                            kind: "view",
                                            icon: "link",
                                            label: "Integrations",
                                        },
                                        {
                                            id: "roles",
                                            kind: "view",
                                            icon: "shield",
                                            label: "Roles",
                                        },
                                    ],
                                },
                            ]}
                            title="Administration"
                        />
                    </Frame>
                    <DimensionRule label="back chevron 28px · title 15/700 · sub-nav rows" />
                </div>
            </Specimen>

            <Specimen
                detail="Active = raised + 600 · unread = 700 + dot · direct mention = numeric CountBadge · meta 11px muted"
                label="Row treatments and kinds"
                number="02"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={460}>
                        <Sidebar
                            activeItemId="active"
                            onItemAction={() => {}}
                            onItemSecondaryAction={() => {}}
                            onItemSelect={() => {}}
                            sections={treatmentSections}
                            title="Row anatomy"
                        />
                    </Frame>
                    <DimensionRule label="row 32 px · radius 6 · pad 0 10 · gap 8" />
                </div>
            </Specimen>

            <Specimen
                detail="A worktree's own phase takes the leading slot and the trailing word: a spinner while its checkout is being prepared, an alert once it could not be, an unlink once its directory has gone. A ready row is unchanged and still reports the work inside it."
                label="Workspace lifecycle rows"
                number="02a"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={300}>
                        <Sidebar
                            activeItemId="lifecycle-creating"
                            onItemAction={() => {}}
                            onItemSecondaryAction={() => {}}
                            onItemSelect={() => {}}
                            sections={lifecycleSections}
                            title="Lifecycle"
                        />
                    </Frame>
                    <DimensionRule label="leading 16 · trailing label 11px mono · row 32 px unchanged in every phase" />
                </div>
            </Specimen>

            <Specimen
                detail="A top-level row carries its nested rows; a nested row reorders among its siblings and cannot leave its parent. Rows keep their ordinary pointer until one is actually carried, then use the grabbing hand. The drop reports one move — the row and the row it now follows — so a list that changes mid-drag cannot lose it."
                label="Reorder by dragging"
                number="02b"
                stage="app"
            >
                <ReorderDemo />
            </Specimen>

            <Specimen
                detail="A row with anything nested under it folds from the chevron stacked over its own mark, so no lane is taken from every row in the window for a control most rows do not have. A shut row keeps its chevron showing — work folded away has to be findable by looking down the column. A fold takes the whole tree beneath it, and the rows it hides can be neither dragged past nor counted as anyone's neighbour."
                label="Fold a row"
                number="02c"
                stage="app"
            >
                <FoldDemo />
            </Specimen>

            <Specimen
                detail="The pinned rows above the projects arrange the same way, by drag or by ⌥↑ / ⌥↓ on the focused row. Their pointer becomes a grabbing hand only after a drag begins. A move is announced to a screen reader, the badge and the row's identity travel with it, and the click the browser fires on release does not open what was dragged."
                label="Arrange the pinned rows"
                number="02d"
                stage="app"
            >
                <PinnedReorderDemo />
            </Specimen>

            <Specimen
                detail="A heading control the section exists to offer stands without hover (reveal: always), spins in place while its act runs, and refuses a second press. A refusal is said under the heading in the reader's terms, because the thing it would have added never came into being and has no row to fail on."
                label="Section heading action — resting, pending, refused"
                number="02e"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {HEADING_ACTION_STATES.map((state) => (
                        <div
                            key={state.label}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <Frame height={200}>
                                <Sidebar
                                    activeItemId=""
                                    onItemSelect={() => {}}
                                    onSectionAction={() => {}}
                                    sections={[state.section]}
                                    title="This Mac"
                                />
                            </Frame>
                            <DimensionRule label={state.rule} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Bots, then the reader's joined tasks in their own order, then projects. A task wears its owner's photo, their initials, or the bot placeholder; Leave waits for hover, and Browse tasks heads the list."
                label="Bots, tasks, and projects"
                number="02f"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={420}>
                        <Sidebar
                            activeItemId="task-billing"
                            onItemAction={() => {}}
                            onItemSelect={() => {}}
                            onSectionAction={() => {}}
                            sections={agentSections}
                            title="This Mac"
                        />
                    </Frame>
                    <DimensionRule label="task row = bot row · 32 px · owner face 16 px · leave on hover" />
                </div>
            </Specimen>

            <Specimen
                detail="A muted bot's unread keeps the heavier name without the dot. A hidden bot leaves the list; the Bots heading's eye-off control opens a menu that brings it back."
                label="Muted and hidden bots"
                number="02g"
                stage="app"
            >
                <QuietBotsDemo />
            </Specimen>

            <Specimen
                detail="No subtitle, no footer, unlabelled section — body starts on the 8px pad"
                label="Minimal"
                number="03"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={220}>
                        <Sidebar
                            activeItemId="second"
                            onItemSelect={() => {}}
                            sections={[
                                {
                                    id: "only",
                                    items: [
                                        {
                                            icon: "home",
                                            id: "first",
                                            kind: "view",
                                            label: "Overview",
                                        },
                                        {
                                            icon: "inbox",
                                            id: "second",
                                            kind: "view",
                                            label: "Inbox",
                                            badge: 3,
                                            unread: true,
                                        },
                                        {
                                            icon: "settings",
                                            id: "third",
                                            kind: "view",
                                            label: "Settings",
                                        },
                                    ],
                                },
                            ]}
                            title="Minimal"
                        />
                    </Frame>
                    <DimensionRule label="header 52 px · body x-pad 8 px" />
                </div>
            </Specimen>

            <Specimen
                detail="Empty sections keep their heading and expose one compact contextual action"
                label="Empty channels and direct messages"
                number="04"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Frame height={380}>
                        <Sidebar
                            activeItemId=""
                            onCompose={() => {}}
                            onItemSelect={() => {}}
                            onSectionAction={() => {}}
                            sections={[
                                {
                                    action: { icon: "plus", label: "Add channel" },
                                    empty: {
                                        actionLabel: "Create a channel",
                                        description:
                                            "Shared channels keep your team's work in one place.",
                                        icon: "hash",
                                        title: "No shared channels yet",
                                    },
                                    id: "shared",
                                    items: [],
                                    label: "Shared",
                                },
                                {
                                    action: { icon: "plus", label: "Add channel" },
                                    empty: {
                                        actionLabel: "Create a channel",
                                        description:
                                            "Private channels are visible only to members.",
                                        icon: "lock",
                                        title: "No private channels yet",
                                    },
                                    id: "private",
                                    items: [],
                                    label: "Private",
                                },
                                {
                                    action: { icon: "compose", label: "New message" },
                                    empty: {
                                        actionLabel: "Start a conversation",
                                        description: "Message a teammate to start a direct chat.",
                                        icon: "chat",
                                        title: "No direct messages",
                                    },
                                    id: "dms",
                                    items: [],
                                    label: "Humans",
                                },
                            ]}
                            title="Empty workspace"
                        />
                    </Frame>
                    <DimensionRule label="empty row 28 px · copy 11/15 · ghost action" />
                </div>
            </Specimen>

            <Specimen
                detail="rest and held-Command states · the current project's main checkout is Cmd-1, then its workspaces, then other projects; its plus keeps Shift-Cmd-N as a delayed floating hover hint, and the Agents heading's plus Cmd-N"
                label="Number shortcuts"
                number="04b"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", gap: "20px" }}>
                        {[
                            { label: "REST", revealed: false },
                            { label: "HELD", revealed: true },
                        ].map((state) => (
                            <div
                                data-shortcut-hints={state.revealed ? "" : undefined}
                                key={state.label}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                }}
                            >
                                <span
                                    style={{
                                        color: "var(--text-secondary)",
                                        font: "600 10px var(--happy-font-mono)",
                                    }}
                                >
                                    {state.label}
                                </span>
                                <Frame height={320}>
                                    <Sidebar
                                        actions={SHORTCUT_ACTIONS}
                                        activeItemId="project"
                                        composeLabel="Create"
                                        numberShortcuts="display"
                                        numberShortcutTargets={SHORTCUT_TARGETS}
                                        onCompose={() => {}}
                                        onItemAction={() => {}}
                                        onItemSelect={() => {}}
                                        sections={SHORTCUT_SECTIONS}
                                        title="Happy"
                                    />
                                </Frame>
                            </div>
                        ))}
                    </div>
                    <DimensionRule label="row 32 px · labels yield width to held-Command caps" />
                </div>
            </Specimen>

            <Specimen
                detail="A quiet row ends on the delta, on the same column the panel gives every other row. A running row — and only a running row — moves it left by the one activity cell. Hover changes neither: the controls are laid over the lane, so what they cover is hidden where it stands and the row is the same width with the pointer on it as without. The scrolling frames show the other half of it: the bar is laid over the 6px trailing inset rather than beside it, so rows, deltas, and controls keep exactly the columns they have without a scrollbar."
                label="Trailing lane alignment · real workspaces"
                number="06"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {ALIGNMENT_CASES.map((alignmentCase) => (
                        <div
                            key={alignmentCase.testId}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <Frame height={alignmentCase.height}>
                                <Sidebar
                                    activeItemId="react-electron-plugin"
                                    data-testid={alignmentCase.testId}
                                    onItemAction={() => {}}
                                    onItemSecondaryAction={() => {}}
                                    onItemSelect={() => {}}
                                    onSectionAction={() => {}}
                                    sections={alignmentCase.sections}
                                    title="happy-desktop"
                                />
                            </Frame>
                            <DimensionRule label={alignmentCase.label} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Experimental, and only here: nothing in the product renders this. Every workspace is a peer marked by a branch glyph, so the reader is told what a row is by a symbol they can name rather than by an elbow they have to trace, and the panel loses a column of stems it was spending indentation on. Work replaces that glyph instead of adding a mark at the far end, which puts what is happening in the same place as what the row is — but it costs the branch mark exactly while the row is most worth picking out, and it is the second thing in this panel to claim the leading lane after the fold chevron. Compare against 06 above: same rows, same deltas."
                label="Flat rows with branch marks · experiment"
                number="07"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <Frame height={300}>
                            <BranchListSketch working />
                        </Frame>
                        <DimensionRule label="Sessions running · spinner in the branch's lane" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <Frame height={300}>
                            <BranchListSketch working={false} />
                        </Frame>
                        <DimensionRule label="Nothing running · every row a branch" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                detail="Which end of a row says that work is running in it. Trailing is the default and the product's own answer: the leading lane is identity, so a busy row still shows the avatar or glyph the reader picks it out by, and the delta beside it steps left by exactly the activity cell. Leading reads the column as what is happening rather than as what exists — the mark stands where the identity was, for as long as the work runs, and the trailing lane never moves. Only a row with something to report differs; a quiet row is identical in both frames, because a lane opened for an absent mark would indent every name in the column."
                label="Where a row reports its work"
                number="08"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {(["trailing", "leading"] as const).map((placement) => (
                        <div
                            key={placement}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <Frame height={220}>
                                <Sidebar
                                    activeItemId="react-electron-plugin"
                                    activityPlacement={placement}
                                    data-testid={`activity-${placement}`}
                                    onItemAction={() => {}}
                                    onItemSecondaryAction={() => {}}
                                    onItemSelect={() => {}}
                                    onSectionAction={() => {}}
                                    sections={alignmentSections({ rows: 4, working: true })}
                                    title="happy-desktop"
                                />
                            </Frame>
                            <DimensionRule
                                label={
                                    placement === "trailing"
                                        ? "trailing · default · the delta steps left by one cell"
                                        : "leading · the mark takes the identity lane"
                                }
                            />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Create is a destination, so the row that leads to it takes the same selection every other row does while the window is showing it. Beside it, the same row leading somewhere the window is not."
                label="Compose row · active and idle"
                number="09"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {[true, false].map((composeActive) => (
                        <div
                            key={composeActive ? "active" : "idle"}
                            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
                        >
                            <Frame height={220}>
                                <Sidebar
                                    activeItemId={composeActive ? "" : "react-electron-plugin"}
                                    composeActive={composeActive}
                                    composeLabel="Create"
                                    data-testid={`compose-${composeActive ? "active" : "idle"}`}
                                    onCompose={() => {}}
                                    onItemSelect={() => {}}
                                    sections={alignmentSections({ rows: 3, working: false })}
                                    title="happy-desktop"
                                />
                            </Frame>
                            <DimensionRule
                                label={
                                    composeActive
                                        ? "showing Create · the row is lit and no project is"
                                        : "showing a project · the row is a plain action"
                                }
                            />
                        </div>
                    ))}
                </div>
            </Specimen>
            <Specimen
                detail="A sidebar can be one list: Search, Create, rows, separators and sections are all items of it. Search and Create are rows with their key caps at the edge; a section is a title alone (no rule) that folds the run up to the next section or separator, keeping its height and look when folded (only the chevron turns); a separator is only a full-width rule. Everything is carried like any other row, and a section carries its whole block. A row with nothing trailing keeps no empty column."
                label="One list · items, sections, separators"
                number="10"
                stage="app"
            >
                <OneListDemo />
            </Specimen>
        </ComponentPage>
    );
}
