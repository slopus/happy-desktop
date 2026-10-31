import { useState } from "react";
import {
    richTaskList,
    type RichTask,
    type RichTaskAgent,
    type RichTaskArtifact,
    type RichTaskSubWork,
    type RichTaskListEntry,
    type RichTaskWorkspace,
} from "happy-desktop-state";
import { localAgoTime } from "../../src/localTime";
import {
    RichTaskList,
    type RichTaskFace,
    type RichTaskListRow,
    type RichTaskSubRowModel,
} from "../../src/RichTaskList";
import { ThemeScope } from "../../src/ThemeScope";
import type { IoniconName } from "../../src/vectorIcons/VectorIcon";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-333";

/* The "Sidebar sub-rows" proposal's list, as the protocol-32 wire would carry it. */
const NOW = Date.UTC(2026, 9, 31, 12);
const ago = (minutes: number) => NOW - minutes * 60_000;
const agent = (
    id: string,
    title: string,
    minutes: number,
    more: Partial<RichTaskAgent> = {},
): RichTaskAgent => ({
    id,
    title,
    status: "idle",
    pendingQuestionId: null,
    lastActivityAt: ago(minutes),
    statusLine: null,
    unread: null,
    subtasks: [],
    ...more,
});
const task = (
    id: string,
    slug: string,
    minutes: number,
    status: string,
    more: Partial<RichTaskAgent> = {},
): RichTask => ({
    id,
    name: "",
    icon: { type: "library", slug },
    agent: agent(`${id}-agent`, "", minutes, { statusLine: { text: status }, ...more }),
});
const working = { status: "working" } as const;
const unread = (...from: string[]) => ({ unread: { reason: "message", since: ago(4), from } });
const named = (value: RichTask, name: string, children?: RichTask["children"]): RichTask => ({
    ...value,
    name,
    agent: { ...value.agent, title: name },
    children,
});
const FOCUS = { agentId: "focus-agent", userId: null };
const hide = (kind: "workspace" | "agent" | "artifact", ...ids: string[]) =>
    ids.map((id) => ({
        ref: { kind, id },
        visibility: "hidden" as const,
        by: FOCUS,
        updatedAt: ago(10),
    }));

const TASKS: readonly RichTask[] = [
    named(
        task("ui-demo", "architecture", 0, "Planning the work split", {
            ...working,
            subtasks: [agent("spec-review", "Spec review", 9, working)],
        }),
        "Telegram-style UI demo",
    ),
    named(
        task("onboarding", "ux", 4, "Steve and Jordan replied to its story", {
            ...unread("steve", "kirill", "jordan"),
            subtasks: [
                agent("install", "Agent install & sign-in", 2, {
                    ...working,
                    pendingQuestionId: "q1",
                }),
                agent("design-review", "Design review", 40, working),
            ],
        }),
        "Onboarding redesign",
        [
            ...hide("workspace", "chat-onboarding"),
            ...hide("artifact", "walkthrough"),
            ...hide("agent", "design-review"),
        ],
    ),
    named(
        task(
            "ship-boss",
            "deploy",
            60,
            "Needs your yes on 1ff04853 to fix preview links",
            unread(),
        ),
        "SHIP BOSS",
        hide("workspace", "sidebar-dino", "onboarding-fallback", "prioritizing-gym"),
    ),
    named(
        task("ios", "swift", 60, "Crash fix on main; next build on your ask"),
        "iOS Redesign",
        hide(
            "workspace",
            "ios-settings",
            "ios-perf-gym",
            "ios-scroll",
            "ios-stories",
            "ios-parity",
            "order-gym",
        ),
    ),
    named(
        task("sidebar", "cleanup", 17 * 60, "On main; release train cutting previews"),
        "Side bar desktop",
        hide("workspace", "story-eval", "agent-stories"),
    ),
    named(
        task("breakage", "crash", 60, "Shipped: Agent 0.4.110-preview.14", {
            subtasks: [
                agent("takeover", "Takeover check", 50, working),
                agent("socket", "Linux socket cleanup", 51, working),
            ],
        }),
        "Onboarding breakage",
        [...hide("agent", "takeover", "socket"), ...hide("artifact", "before-after")],
    ),
    named(
        task("iphone", "crash", 60, "On main; iPhone build still needed"),
        "iPhone launch crashes",
    ),
    named(
        task("diff-stats", "code-review", 48, "Needs your OK on the new row layout", unread()),
        "Task diff stats",
    ),
    named(
        task("icons", "design-system", 20, "Upscaling the icon library", working),
        "Icon upscaling task",
    ),
    named(task("dino", "home", 300, "Dinosaur runs on idle"), "Sidebar dinosaur"),
];

const workspace = (
    id: string,
    name: string,
    projectId: string,
    taskId: string,
    minutes: number,
    added = 0,
    deleted = 0,
): RichTaskWorkspace => ({
    id,
    name,
    projectId,
    creatorAgentId: `${taskId}-agent`,
    updatedAt: ago(minutes),
    addedLines: added,
    deletedLines: deleted,
});
const WORKSPACES: readonly RichTaskWorkspace[] = [
    workspace("round13", "onboarding-round13", "agent", "onboarding", 5, 2783, 453),
    workspace(
        "round13-desktop",
        "onboarding-round13-desktop",
        "desktop",
        "onboarding",
        6,
        1552,
        558,
    ),
    workspace("provider-install", "provider-install-signin", "agent", "onboarding", 7, 987, 317),
    workspace("chat-onboarding", "chat-onboarding", "desktop", "onboarding", 8, 1504, 554),
    workspace("readonly-status", "readonly-set-status", "agent", "ship-boss", 61, 53, 15),
    workspace("happy-polish", "new-happy-polish", "desktop", "ship-boss", 62),
    ...["sidebar-dino", "onboarding-fallback"].map((id, index) =>
        workspace(id, id, "desktop", "ship-boss", 63 + index),
    ),
    workspace("prioritizing-gym", "prioritizing-gym", "agent", "ship-boss", 65),
    ...["ios-settings", "ios-perf-gym", "ios-scroll", "ios-stories", "ios-parity"].map(
        (id, index) => workspace(id, id, "ios", "ios", 61 + index),
    ),
    workspace("order-gym", "workspace-order-gym", "agent", "ios", 70),
    workspace("story-eval", "story-eval-recheck", "agent", "sidebar", 1100),
    workspace("agent-stories", "agent-stories", "agent", "sidebar", 1101),
    workspace("resume-socket", "iPhone resume socket fix", "ios", "iphone", 61),
];
const artifact = (
    id: string,
    type: string,
    title: string,
    agentId: string,
    minutes: number,
): RichTaskArtifact => ({
    id,
    type,
    title,
    source: { agentId },
    updatedAt: ago(minutes),
});
const ARTIFACTS: readonly RichTaskArtifact[] = [
    artifact("layout", "html", "Sidebar sub-rows: layout proposal", "ui-demo-agent", 1),
    artifact("data-model", "document", "data-model.ts", "ui-demo-agent", 3),
    artifact("walkthrough", "video", "Onboarding walkthrough", "onboarding-agent", 30),
    artifact("before-after", "image", "before-after.png", "breakage-agent", 52),
];
const SECTIONS = [
    { id: "priorities", name: "Priorities", orderKey: "a", collapsed: false },
    { id: "small-bugs", name: "Small bugs", orderKey: "g", collapsed: false },
    { id: "side-quests", name: "Side quests", orderKey: "k", collapsed: true },
    { id: "later", name: "Later", orderKey: "m", collapsed: true },
];
const MEMBERSHIPS = TASKS.map((value, index) => ({
    taskId: value.id,
    orderKey: "abcdefhijl"[index]! + "0",
}));

const asset = (name: string) => new URL(`../assets/rich-tasks/${name}`, import.meta.url).href;
const PROJECTS: Readonly<Record<string, string>> = {
    agent: asset("proj-happy-agent.webp"),
    desktop: asset("proj-happy-desktop.webp"),
    ios: asset("proj-happy.webp"),
};
const PEOPLE: Readonly<Record<string, RichTaskFace>> = {
    steve: { id: "steve", label: "Steve", imageUrl: asset("steve.jpg") },
    jordan: { id: "jordan", label: "Jordan", tone: "mint" },
};
const QUESTIONS: Readonly<Record<string, string>> = { q1: "which provider first?" };
const GLYPHS: Readonly<Record<string, IoniconName>> = {
    html: "globe-outline",
    document: "document-text-outline",
    markdown: "document-text-outline",
    video: "play-outline",
    image: "image-outline",
};

/* What the app's glue does with the state projection: words, pictures, and ids. */
function subRow(taskId: string, child: RichTaskSubWork): RichTaskSubRowModel {
    const base = { dimmed: child.hidden };
    if (child.kind === "agent")
        return {
            ...base,
            id: `${taskId}/agent:${child.agent.id}`,
            mark: { kind: "glyph", icon: "hardware-chip-outline" },
            label: child.agent.title,
            detail: child.agent.pendingQuestionId
                ? QUESTIONS[child.agent.pendingQuestionId]
                : undefined,
            working: child.agent.status === "working",
        };
    if (child.kind === "workspace") {
        const { addedLines: added, deletedLines: removed } = child.workspace;
        return {
            ...base,
            id: `${taskId}/workspace:${child.workspace.id}`,
            mark: { kind: "image", src: PROJECTS[child.workspace.projectId]! },
            label: child.workspace.name,
            changes: added || removed ? { added, removed } : "merged",
        };
    }
    return {
        ...base,
        id: `${taskId}/artifact:${child.artifact.id}`,
        mark: { kind: "glyph", icon: GLYPHS[child.artifact.type] ?? "document-outline" },
        label: child.artifact.title,
    };
}

function rows(entries: readonly RichTaskListEntry[]): readonly RichTaskListRow[] {
    return entries.map((entry) => {
        if (entry.kind === "section") return { kind: "section", ...entry.section };
        const { task: value } = entry;
        const signal = value.agent.unread
            ? "unread"
            : value.agent.status === "working"
              ? "working"
              : null;
        return {
            kind: "task",
            card: {
                id: value.id,
                title: value.name,
                time: localAgoTime(value.agent.lastActivityAt, NOW),
                status: value.agent.statusLine?.text ?? null,
                iconSlug: value.icon?.slug ?? null,
                ring: value.id === "onboarding",
                faces: entry.faces.flatMap((id) => PEOPLE[id] ?? []),
                signal,
                subRows: entry.children.map((child) => subRow(value.id, child)),
                more: entry.more,
                expanded: entry.expanded,
            },
        };
    });
}

function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
}

function Fixture(props: {
    readonly mode: "light" | "dark";
    readonly selection: "inset" | "full";
    readonly expanded?: readonly string[];
}) {
    const [selectedId, setSelectedId] = useState<string | null>("onboarding/agent:install");
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(props.expanded));
    const [sections, setSections] = useState(SECTIONS);
    const entries = richTaskList({
        tasks: TASKS,
        agents: TASKS.map((value) => value.agent),
        memberships: MEMBERSHIPS,
        sections,
        workspaces: WORKSPACES,
        artifacts: ARTIFACTS,
        viewerUserId: "kirill",
        expandedTaskIds: expanded,
    });
    return (
        <ThemeScope mode={props.mode}>
            <div className="rich-tasks-frame" style={frame}>
                <RichTaskList
                    onMoreToggle={(id) => setExpanded((current) => toggled(current, id))}
                    onSectionCollapseToggle={(id) =>
                        setSections((current) =>
                            current.map((section) =>
                                section.id === id
                                    ? { ...section, collapsed: !section.collapsed }
                                    : section,
                            ),
                        )
                    }
                    onSelect={setSelectedId}
                    rows={rows(entries)}
                    selectedId={selectedId}
                    selection={props.selection}
                    workingFrame={0}
                />
            </div>
        </ThemeScope>
    );
}

/* The proposal's sidebar column: 304px with its hairline, on the sidebar's ground. */
const frame = {
    width: 304,
    padding: "0 0 10px",
    borderRight: "1px solid var(--divider)",
    background: "var(--groupped-background)",
} as const;

export function RichTasksPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Rich tasks: three-line cards with the story ring, two status lines and corner B (faces, dot, braille and +k more centred on the last line's x-height), sections, and each card's three most urgent sub-rows."
            title="Rich tasks"
        >
            <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
                <Specimen
                    detail="304px sidebar · inset selection"
                    label="Dark"
                    number="01"
                    stage="surface"
                >
                    <Fixture mode="dark" selection="inset" />
                </Specimen>
                <Specimen
                    detail="304px sidebar · inset selection"
                    label="Light"
                    number="02"
                    stage="surface"
                >
                    <Fixture mode="light" selection="inset" />
                </Specimen>
                <Specimen
                    detail="full-width selection · Onboarding redesign expanded"
                    label="Expanded"
                    number="03"
                    stage="surface"
                >
                    <Fixture expanded={["onboarding"]} mode="dark" selection="full" />
                </Specimen>
            </div>
        </ComponentPage>
    );
}
