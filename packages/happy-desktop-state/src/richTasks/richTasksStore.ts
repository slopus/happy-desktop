import type {
    HappyAgentConnection,
    HappyAgentRichTasksInput,
} from "../happyAgentConnection/types.js";
import {
    happyAgentUserSettingsCreate,
    type HappyAgentUserSettingsSource,
} from "../happyAgent/happyAgentUserSettings.js";
import { richTaskList, type RichTaskChildRef, type RichTaskListEntry } from "./richTaskList.js";

/**
 * What the Tasks area draws. Rich only while the daemon reports
 * `capabilities.taskSections` and the reader's `tasks.rich` is JSON `true`;
 * anything else is today's classic list, unchanged.
 */
export type HappyAgentRichTasksSnapshot =
    | { readonly mode: "classic" }
    | {
          readonly mode: "rich";
          /** In key order; section headers only while `tasks.sections` is on too. */
          readonly entries: readonly RichTaskListEntry[];
      };

export interface HappyAgentRichTasksStore {
    get(): HappyAgentRichTasksSnapshot;
    subscribe(listener: () => void): () => void;
    /** "+k more" or "hide" under a card: the reader's own view, never sent. */
    taskExpandToggle(taskId: string): void;
    /** Folds or unfolds one of the reader's sections. */
    sectionCollapseToggle(sectionId: string): void;
    /** Takes one child out from under a task's card, for every member. */
    childHide(taskId: string, ref: RichTaskChildRef): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentRichTasksDeps {
    readonly client: HappyAgentUserSettingsSource["client"];
    readonly connection: Pick<
        HappyAgentConnection,
        "sync" | "richTasks" | "replaceTaskSections" | "setTaskChild"
    >;
}

type Settings = { readonly rich: boolean; readonly sections: boolean };

const OFF: Settings = { rich: false, sections: false };
const CLASSIC: HappyAgentRichTasksSnapshot = { mode: "classic" };
const CONNECTION = "connection";

/** A store that only ever draws the classic list, for a window with no Happy Agent. */
export const happyAgentRichTasksStoreNone: HappyAgentRichTasksStore = {
    get: () => CLASSIC,
    subscribe: () => () => undefined,
    taskExpandToggle: () => undefined,
    sectionCollapseToggle: () => undefined,
    childHide: () => undefined,
    [Symbol.dispose]: () => undefined,
};

/**
 * The rich task list of one connection. Tasks, memberships and sections come
 * from what the connection already reconciles; the two settings are read and
 * followed only from a daemon with the capability, so an older daemon is
 * asked nothing it was not asked before. Opens nothing until subscribed.
 */
export function happyAgentRichTasksStoreCreate(
    deps: HappyAgentRichTasksDeps,
): HappyAgentRichTasksStore {
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
        deviceSerialize: () => undefined,
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
              readonly snapshot: HappyAgentRichTasksSnapshot;
          }
        | undefined;

    const capable = (): boolean =>
        deps.connection.sync.health()?.capabilities?.taskSections === true;

    const get = (): HappyAgentRichTasksSnapshot => {
        if (!capable()) return CLASSIC;
        const chosen = settings.choicesRead(CONNECTION);
        if (!chosen.rich) return CLASSIC;
        const input = deps.connection.richTasks.get();
        if (
            last?.input === input &&
            last.sections === chosen.sections &&
            last.expanded === expanded
        )
            return last.snapshot;
        const tasks = input.tasks.filter((task) => task.status === "active");
        const snapshot: HappyAgentRichTasksSnapshot = {
            mode: "rich",
            entries: richTaskList({
                tasks,
                agents: [...tasks.map((task) => task.agent), ...input.bots.map((bot) => bot.agent)],
                memberships: input.memberships,
                sections: chosen.sections ? input.sections : [],
                workspaces: input.workspaces.filter((workspace) => workspace.status === "active"),
                artifacts: input.artifacts,
                viewerUserId: input.viewerUserId,
                expandedTaskIds: expanded,
            }),
        };
        last = { input, sections: chosen.sections, expanded, snapshot };
        return snapshot;
    };

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
                    sync: deps.connection.sync,
                });
            } finally {
                settingsStarting = false;
            }
        }
    };

    const notify = (): void => {
        if (disposed) return;
        settingsFollow();
        for (const listener of listeners) listener();
    };

    const rich = (): boolean => get().mode === "rich";

    return {
        get,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (release.length === 0)
                release = [deps.connection.richTasks.subscribe(notify), settings.subscribe(notify)];
            settingsFollow();
            return () => {
                listeners.delete(listener);
                if (listeners.size > 0) return;
                for (const stop of release) stop();
                release = [];
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
            const { sections } = deps.connection.richTasks.get();
            if (!sections.some((section) => section.id === sectionId)) return;
            deps.connection.replaceTaskSections(
                sections.map((section) =>
                    section.id === sectionId
                        ? { ...section, collapsed: !section.collapsed }
                        : section,
                ),
            );
        },
        childHide(taskId, ref) {
            if (rich()) deps.connection.setTaskChild(taskId, ref, "hidden");
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            listeners.clear();
            for (const stop of release) stop();
            release = [];
            settingsStop?.();
            settingsStop = undefined;
        },
    };
}
