import type {
    HappyAgentConnection,
    HappyAgentRichTasksInput,
} from "../happyAgentConnection/types.js";
import {
    happyAgentUserSettingsCreate,
    type HappyAgentUserSettingsSource,
} from "../happyAgent/happyAgentUserSettings.js";
import {
    richTaskList,
    type RichTask,
    type RichTaskChildRef,
    type RichTaskListEntry,
} from "./richTaskList.js";

/**
 * What the Tasks area draws. Rich only while the daemon reports
 * `capabilities.taskSections` and the reader's `tasks.rich` is JSON `true`;
 * anything else is today's classic list, unchanged.
 */
export type HappyAgentRichTasksSnapshot =
    | { readonly mode: "classic" }
    /** Entries in key order; section headers only while `tasks.sections` is on too. */
    | { readonly mode: "rich"; readonly entries: readonly RichTaskListEntry[] };

/** Where a moved card lands: after a card (`null`: first of all), or first under a section. */
export type RichTaskMoveAnchor =
    | { readonly afterId: string | null }
    | { readonly afterSectionId: string };

export interface HappyAgentRichTasksStore {
    get(): HappyAgentRichTasksSnapshot;
    subscribe(listener: () => void): () => void;
    /** "+k more" or "hide" under a card: the reader's own view, never sent. */
    taskExpandToggle(taskId: string): void;
    sectionCollapseToggle(sectionId: string): void;
    /** Takes one child out from under a task's card, for every member. */
    childHide(taskId: string, ref: RichTaskChildRef): void;
    taskMove(taskId: string, anchor: RichTaskMoveAnchor): void;
    [Symbol.dispose](): void;
}

type Settings = { readonly rich: boolean; readonly sections: boolean };

const OFF: Settings = { rich: false, sections: false };
const CLASSIC: HappyAgentRichTasksSnapshot = { mode: "classic" };
const CONNECTION = "connection";
const nothing = () => undefined;

/** A store that only ever draws the classic list, for a window with no Happy Agent. */
export const happyAgentRichTasksStoreNone: HappyAgentRichTasksStore = {
    get: () => CLASSIC,
    subscribe: () => nothing,
    taskExpandToggle: nothing,
    sectionCollapseToggle: nothing,
    childHide: nothing,
    taskMove: nothing,
    [Symbol.dispose]: nothing,
};

/**
 * The rich task list of one connection, from what the connection already
 * reconciles. The two settings are read and followed only from a daemon with
 * the capability, so an older daemon is asked nothing new. Opens nothing until
 * subscribed.
 */
export function happyAgentRichTasksStoreCreate(deps: {
    readonly client: HappyAgentUserSettingsSource["client"];
    readonly connection: Pick<
        HappyAgentConnection,
        | "sync"
        | "richTasks"
        | "taskIcons"
        | "replaceTaskSections"
        | "setTaskChild"
        | "reorderTask"
        | "reorderTaskAfterSection"
    >;
}): HappyAgentRichTasksStore {
    const { connection } = deps;
    const settings = happyAgentUserSettingsCreate<Settings>({
        empty: OFF,
        equal: (left, right) => left.rich === right.rich && left.sections === right.sections,
        keyAccept: (key) => key === "tasks.rich" || key === "tasks.sections",
        // Only JSON `true` turns either on; anything else, or nothing, is off.
        decode: (values) => ({
            rich: values.get("tasks.rich") === true,
            sections: values.get("tasks.sections") === true,
        }),
        encode: (chosen) =>
            new Map([
                ["tasks.rich", chosen.rich || null],
                ["tasks.sections", chosen.sections || null],
            ]),
        deviceParse: () => OFF,
        deviceSerialize: nothing,
    });
    const listeners = new Set<() => void>();
    let expanded: ReadonlySet<string> = new Set();
    let release: (() => void)[] = [];
    let settingsStop: (() => void) | undefined;
    let settingsStarting = false;
    let disposed = false;
    let last:
        | {
              readonly input: HappyAgentRichTasksInput;
              readonly sections: boolean;
              readonly expanded: ReadonlySet<string>;
              readonly icons: ReadonlyMap<string, string | null>;
              readonly snapshot: HappyAgentRichTasksSnapshot;
          }
        | undefined;

    const capable = (): boolean => connection.sync.health()?.capabilities?.taskSections === true;

    const get = (): HappyAgentRichTasksSnapshot => {
        const chosen = capable() ? settings.choicesRead(CONNECTION) : OFF;
        if (!chosen.rich) return CLASSIC;
        const input = connection.richTasks.get();
        const icons = connection.taskIcons.get();
        if (
            last?.input === input &&
            last.sections === chosen.sections &&
            last.expanded === expanded &&
            last.icons === icons
        )
            return last.snapshot;
        const tasks = input.tasks.filter((task) => task.status === "active");
        const iconSrcOf = (task: RichTask) =>
            task.icon?.hash === undefined ? undefined : (icons.get(task.icon.hash) ?? undefined);
        const snapshot: HappyAgentRichTasksSnapshot = {
            mode: "rich",
            entries: richTaskList({
                tasks,
                agents: [...tasks, ...input.bots].map((owner) => owner.agent),
                memberships: input.memberships,
                sections: chosen.sections ? input.sections : [],
                workspaces: input.workspaces.filter((workspace) => workspace.status === "active"),
                artifacts: input.artifacts,
                viewerUserId: input.viewerUserId,
                expandedTaskIds: expanded,
            }).map((entry) => {
                const iconSrc = entry.kind === "task" ? iconSrcOf(entry.task) : undefined;
                return iconSrc ? { ...entry, iconSrc } : entry;
            }),
        };
        last = { input, sections: chosen.sections, expanded, icons, snapshot };
        return snapshot;
    };
    const rich = (): boolean => get().mode === "rich";

    // Settings are followed only while someone listens and the daemon has the capability.
    const settingsFollow = (): void => {
        const wanted = listeners.size > 0 && capable();
        if (!wanted && settingsStop) {
            settingsStop();
            settingsStop = undefined;
        } else if (wanted && !settingsStop && !settingsStarting) {
            settingsStarting = true;
            try {
                settingsStop = settings.connectionFollow(CONNECTION, {
                    client: deps.client,
                    sync: connection.sync,
                });
            } finally {
                settingsStarting = false;
            }
        }
    };

    // A shown artifact the bootstrap did not list (it lists each task's latest
    // twenty) is read on its own, only while the list is rich.
    const artifactsRead = (): void => {
        if (listeners.size === 0 || !rich()) return;
        const { tasks, memberships, artifacts } = connection.richTasks.get();
        const joined = new Set(memberships.map((membership) => membership.taskId));
        const held = new Set(artifacts.map((artifact) => artifact.id));
        for (const task of tasks)
            for (const { ref, visibility } of joined.has(task.id) ? (task.children ?? []) : [])
                if (ref.kind === "artifact" && visibility === "shown" && !held.has(ref.id))
                    connection.richTasks.artifactRead(ref.id);
    };

    // A card's icon is read when the card is drawn; one without a hash keeps its letter tile.
    const iconsRead = (): void => {
        const snapshot = get();
        if (listeners.size === 0 || snapshot.mode !== "rich") return;
        for (const entry of snapshot.entries)
            if (entry.kind === "task" && entry.task.icon?.hash !== undefined)
                connection.taskIcons.iconRequest({
                    slug: entry.task.icon.slug,
                    hash: entry.task.icon.hash,
                });
    };

    const notify = (): void => {
        if (disposed) return;
        settingsFollow();
        artifactsRead();
        iconsRead();
        for (const listener of listeners) listener();
    };

    const releaseAll = (): void => {
        for (const stop of release) stop();
        release = [];
    };

    return {
        get,
        subscribe(listener) {
            if (disposed) return nothing;
            listeners.add(listener);
            if (release.length === 0)
                release = [
                    connection.richTasks.subscribe(notify),
                    connection.taskIcons.subscribe(notify),
                    settings.subscribe(notify),
                ];
            settingsFollow();
            artifactsRead();
            iconsRead();
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                releaseAll();
                settingsFollow();
            };
        },
        taskExpandToggle(taskId) {
            const next = new Set(expanded);
            if (!next.delete(taskId)) next.add(taskId);
            expanded = next;
            notify();
        },
        sectionCollapseToggle(sectionId) {
            if (!rich()) return;
            const { sections } = connection.richTasks.get();
            if (!sections.some((section) => section.id === sectionId)) return;
            connection.replaceTaskSections(
                sections.map((section) =>
                    section.id === sectionId
                        ? { ...section, collapsed: !section.collapsed }
                        : section,
                ),
            );
        },
        childHide(taskId, ref) {
            if (rich()) connection.setTaskChild(taskId, ref, "hidden");
        },
        taskMove(taskId, anchor) {
            if (!rich()) return;
            if ("afterSectionId" in anchor)
                connection.reorderTaskAfterSection(taskId, anchor.afterSectionId);
            else connection.reorderTask(taskId, anchor.afterId);
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            listeners.clear();
            releaseAll();
            settingsStop?.();
            settingsStop = undefined;
        },
    };
}
