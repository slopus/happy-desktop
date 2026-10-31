import { useState } from "react";
import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

export const componentNumber = "C-009b";

const items: SidebarItem[] = [
    { id: "chief", kind: "project", label: "Chief of Staff", initials: "CS", status: "working" },
    {
        id: "trip",
        depth: 1,
        kind: "workspace",
        label: "Plan the autumn trip",
        contextAvatars: [{ id: "household", label: "Project: Household", initials: "H" }],
        changeStats: { added: 81, deleted: 1 },
        status: "working",
    },
    {
        id: "flights",
        depth: 2,
        kind: "workspace",
        label: "Compare flights",
        contextAvatars: [{ id: "household", label: "Project: Household", initials: "H" }],
        changeStats: { added: 12, deleted: 4 },
        status: "working",
    },
    {
        id: "hotels",
        depth: 2,
        kind: "workspace",
        label: "Shortlist hotels",
        contextAvatars: [{ id: "household", label: "Project: Household", initials: "H" }],
        unread: true,
    },
    {
        id: "invoices",
        depth: 1,
        kind: "workspace",
        label: "Reconcile invoices",
        status: "waiting",
    },
    {
        id: "receipts",
        depth: 2,
        kind: "workspace",
        label: "Collect receipts",
    },
    { id: "builder", kind: "project", label: "Builder", initials: "B" },
    {
        id: "research",
        depth: 1,
        kind: "workspace",
        label: "Research the new API",
        contextAvatars: [{ id: "happy", label: "Project: Happy", initials: "H" }],
        changeStats: { added: 3, deleted: 0 },
    },
];

export function BotSubtasksPage() {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [selected, setSelected] = useState("hotels");
    return (
        <ComponentPage
            number={componentNumber}
            title="Bot subtasks"
            summary="Active interactive subtasks belong beneath their parent bot, recursively. Each keeps its own activity, unread state, and conversation identity, and a subtask with a worktree of its own carries that worktree's line delta in place of a second row under Projects."
        >
            <Specimen
                number="01"
                label="Parent tasks and active subtasks"
                stage="app"
                detail="Single-chat tasks · 16px project and bot avatars in the leading lane"
            >
                <div style={{ display: "flex", width: 320, height: 600 }}>
                    <Sidebar
                        style={{ width: "100%" }}
                        title="Happy"
                        activeItemId={selected}
                        onItemSelect={setSelected}
                        onItemCollapseToggle={(id) =>
                            setCollapsed((previous) => {
                                const next = new Set(previous);
                                if (!next.delete(id)) next.add(id);
                                return next;
                            })
                        }
                        sections={[
                            {
                                id: "bots",
                                label: "Bots",
                                items: items.map((item) =>
                                    collapsed.has(item.id) ? { ...item, collapsed: true } : item,
                                ),
                            },
                            {
                                id: "projects",
                                label: "Projects",
                                action: {
                                    icon: "plus",
                                    label: "Add project",
                                    reveal: "always",
                                },
                                secondaryAction: { icon: "eye-off", label: "Hide projects" },
                                items: [
                                    {
                                        id: "household",
                                        kind: "project",
                                        label: "Household",
                                        initials: "H",
                                    },
                                    {
                                        id: "happy",
                                        kind: "project",
                                        label: "Happy",
                                        initials: "H",
                                        changeStats: { added: 99, deleted: 0 },
                                    },
                                    // Only worktrees no bot's subtask works in;
                                    // the others are their subtasks' rows above.
                                    {
                                        id: "comparison-workspace",
                                        kind: "workspace",
                                        depth: 1,
                                        label: "changes-comparison-base",
                                        changeStats: { added: 40, deleted: 2 },
                                    },
                                ],
                            },
                        ]}
                    />
                </div>
                <DimensionRule label="32px rows · stable agent IDs · siblings reorder within their parent · no task reparenting" />
            </Specimen>
        </ComponentPage>
    );
}
