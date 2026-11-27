import type {
    LiveAppState,
    LiveAppStateModel,
    LiveAppStateServer,
    LiveAppStateSession,
} from "@slopus/happy-agent-client";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import type { ConversationSummary } from "../conversation/conversationSummary.js";
import type { HappyAgentModelStore } from "../happyAgent/happyAgentModelStore.js";
import {
    happyAgentSidebarTree,
    happyAgentTabsOrdered,
} from "../happyAgent/happyAgentSidebarTree.js";
import { happyAgentServiceName } from "../happyAgent/happyAgentSupport.js";
import type { HappyAgentWorkspaceSnapshot } from "../happyAgent/happyAgentWorkspaceStore.js";
import { gptLiveSerializedBytes, gptLiveWorkspaceStatus } from "./gptLiveDesktopContext.js";
import type { GptLiveDesktopSource, GptLiveNavigationTarget } from "./gptLiveDesktopSource.js";

/**
 * The window as its sidebar shows it, for voice to answer from without asking
 * the controller. It is a whole replacement each time, never a revision.
 */
export type GptLiveAppState = LiveAppState;

/**
 * What is on screen and its newest settled public message, read from what the
 * window has already loaded. Nothing is fetched to fill it: a transcript that
 * has not loaded says so instead of claiming an empty conversation.
 */
type GptLiveAppStateFocus = NonNullable<LiveAppState["focused"]>;

const SERVER_LIMIT = 32;
const ROW_LIMIT = 100;
const MODEL_LIMIT = 200;
const EFFORT_LIMIT = 16;
/** Per-row text bound. */
const NAME_LIMIT = 256;
const LATEST_MESSAGE_LIMIT = 16_384;
/** Leaves the create request room for the desktop context beside it. */
export const GPT_LIVE_APP_STATE_BYTES = 128 * 1024;
const MINUTE_MS = 60_000;

function lastActivityAt(summary: ConversationSummary): number | null {
    return summary.updatedAt > 0 ? Math.floor(summary.updatedAt / MINUTE_MS) * MINUTE_MS : null;
}

function sessionOf(
    connectionId: string,
    groupId: string,
    summary: ConversationSummary,
    text: (value: string) => string,
): LiveAppStateSession {
    return {
        target: { connectionId, groupId, sessionId: summary.id },
        title: text(summary.title) || null,
        status: summary.activity,
        lastActivityAt: lastActivityAt(summary),
    };
}

/**
 * A group's sessions in the order its tab strip shows them: the workspace's
 * recorded tab order for the group on screen, the host's arrangement for every
 * other. Files, reviews, and tools share that strip and are left out.
 */
function sessionsOf(
    connectionId: string,
    groupId: string,
    conversations: readonly ConversationSummary[],
    workspace: HappyAgentWorkspaceSnapshot,
    text: (value: string) => string,
): LiveAppStateSession[] {
    const ordered =
        workspace.address.groupId === groupId
            ? happyAgentTabsOrdered(conversations, workspace.tabOrder)
            : conversations;
    return ordered.map((summary) => sessionOf(connectionId, groupId, summary, text));
}

/**
 * The models the session pickers on this server offer, in their order, each
 * named with the service its picker files it under. A model without reasoning
 * levels has no default one.
 */
function modelsOf(
    models: HappyAgentModelStore | undefined,
    text: (value: string) => string,
    bounded: <T>(items: readonly T[], limit?: number) => T[],
): LiveAppStateModel[] {
    const snapshot = models?.get();
    if (snapshot?.type !== "ready") return [];
    return bounded(
        snapshot.menus.modelOptions.filter((option) => !option.disabled),
        MODEL_LIMIT,
    ).map((option) => ({
        providerId: option.providerId,
        providerName: text(happyAgentServiceName(option.providerType)),
        modelId: option.modelId,
        name: text(option.name),
        efforts: bounded(option.efforts, EFFORT_LIMIT).map((effort) => effort.level),
        defaultEffort: option.efforts.length > 0 ? option.defaultEffort : null,
    }));
}

/**
 * The window as its sidebar shows it, for voice. Servers are the directory's
 * order (this Mac first, then the host's roster); within one, its bots, then
 * the reader's tasks, then its projects, exactly as `happyAgentSidebarTree`
 * arranges them. Only roots are listed: bot and task subtasks, the worktrees
 * they work in, and sessions started by another session, are not.
 */
export function gptLiveAppStateRead(source: GptLiveDesktopSource): GptLiveAppState {
    const current = source.get();
    let truncated = current.connections.length > SERVER_LIMIT;
    const servers: LiveAppStateServer[] = [];
    let focused: GptLiveAppStateFocus | null = null;
    const bounded = <Item>(
        items: readonly Item[],
        limit = ROW_LIMIT,
        keep: (item: Item) => boolean = () => false,
    ): Item[] => {
        if (items.length > limit) truncated = true;
        const selected = items.findIndex(keep);
        const prefix = limit - (selected >= limit ? 1 : 0);
        return items.filter((_item, index) => index < prefix || index === selected);
    };
    const text = (value: string) => {
        if (value.length > NAME_LIMIT) truncated = true;
        return value.slice(0, NAME_LIMIT);
    };
    // Retain the selected server even beyond the row limit, in directory order.
    const activeIndex = current.connections.findIndex(
        (item) => item.id === current.activeConnectionId,
    );
    const prefix = SERVER_LIMIT - (activeIndex >= SERVER_LIMIT ? 1 : 0);
    const connections = current.connections.filter(
        (connection, index) => index < prefix || connection.id === current.activeConnectionId,
    );
    for (const connection of connections) {
        const workspace = connection.workspace?.get();
        const connectionId = connection.id;
        const catalog = workspace?.list.projects;
        const server: LiveAppStateServer = {
            connectionId,
            name: text(connection.name),
            kind: connection.kind,
            online: connection.online,
            catalog:
                catalog?.type === "ready"
                    ? "ready"
                    : catalog?.type === "error"
                      ? "error"
                      : "loading",
            bots: [],
            tasks: [],
            projects: [],
            models: bounded(modelsOf(connection.models, text, bounded), MODEL_LIMIT),
        };
        servers.push(server);
        if (!workspace || !catalog) continue;
        const tree = happyAgentSidebarTree({
            bots: workspace.list.bots,
            tasks: workspace.list.tasks,
            projects: catalog.type === "ready" ? catalog.value : [],
        });
        const focusedGroupId =
            current.activeConnectionId === connectionId ? workspace.address.groupId : undefined;
        const selectedSession = (item: LiveAppStateSession) =>
            item.target.groupId === focusedGroupId &&
            item.target.sessionId === workspace.address.conversationId;
        // A shared bot is drawn in the first group rather than under Bots,
        // and is still a bot to talk to.
        server.bots = bounded(
            [...tree.sharedBots, ...tree.bots],
            ROW_LIMIT,
            (bot) => bot.workspaceId === focusedGroupId,
        ).map((bot) => ({
            target: {
                kind: "bot",
                connectionId,
                groupId: bot.workspaceId,
                sessionId: bot.conversation.id,
                botId: bot.id,
            },
            name: text(bot.name),
            status: bot.conversation.activity,
            lastActivityAt: lastActivityAt(bot.conversation),
        }));
        server.tasks = bounded(
            tree.tasks,
            ROW_LIMIT,
            (task) => task.workspaceId === focusedGroupId,
        ).map((task) => ({
            target: {
                kind: "task",
                connectionId,
                groupId: task.workspaceId,
                sessionId: task.conversation.id,
                taskId: task.id,
            },
            name: text(task.name),
            status: task.conversation.activity,
            lastActivityAt: lastActivityAt(task.conversation),
        }));
        server.projects = bounded(
            tree.projects,
            ROW_LIMIT,
            ({ project, worktrees }) =>
                project.id === focusedGroupId ||
                worktrees.some((item) => item.id === focusedGroupId),
        ).map(({ project, worktrees }) => ({
            target: { kind: "project", connectionId, projectId: project.id, groupId: project.id },
            name: text(project.name),
            sessions: bounded(
                sessionsOf(connectionId, project.id, project.conversations, workspace, text),
                ROW_LIMIT,
                selectedSession,
            ),
            workspaces: bounded(worktrees, ROW_LIMIT, (item) => item.id === focusedGroupId).map(
                (worktree) => ({
                    target: {
                        kind: "workspace",
                        connectionId,
                        projectId: project.id,
                        workspaceId: worktree.id,
                        groupId: worktree.id,
                    },
                    name: text(worktree.name),
                    status: gptLiveWorkspaceStatus(worktree.lifecycle),
                    sessions: bounded(
                        sessionsOf(
                            connectionId,
                            worktree.id,
                            worktree.conversations,
                            workspace,
                            text,
                        ),
                        ROW_LIMIT,
                        selectedSession,
                    ),
                }),
            ),
        }));
        if (current.activeConnectionId === connectionId)
            focused = focusOf(connectionId, workspace, server);
    }
    const appState = {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        servers,
        focused,
        truncated,
    };
    return gptLiveAppStateBound(appState, current.activeConnectionId);
}

/**
 * Trims catalogs from the far end without reordering the retained rows. Focus
 * and its server take priority over other catalogs. Account for each removal
 * once, so model-heavy catalogs do not repeatedly serialize the whole frame.
 */
function gptLiveAppStateBound(
    appState: {
        timeZone: string;
        servers: LiveAppStateServer[];
        focused: GptLiveAppStateFocus | null;
        truncated: boolean;
    },
    activeConnectionId: string | null,
): GptLiveAppState {
    let bytes = gptLiveSerializedBytes(appState);
    if (bytes <= GPT_LIVE_APP_STATE_BYTES) return appState;
    if (!appState.truncated) bytes--; // JSON true is one byte shorter than false.
    appState.truncated = true;
    const over = () => bytes > GPT_LIVE_APP_STATE_BYTES;
    const remove = <T extends object>(items: T[], index: number) => {
        bytes -= gptLiveSerializedBytes(items[index]!) + (items.length > 1 ? 1 : 0);
        items.splice(index, 1);
    };
    const trim = <T extends object>(items: T[], keep: (item: T) => boolean = () => false) => {
        for (let index = items.length - 1; index >= 0 && over(); index--)
            if (!keep(items[index]!)) remove(items, index);
    };
    const focus = appState.focused?.target;
    const focusedGroup = (target: { connectionId: string; groupId: string }) =>
        focus?.connectionId === target.connectionId && focus.groupId === target.groupId;
    const focusedSession = (item: LiveAppStateSession) =>
        focusedGroup(item.target) &&
        focus !== undefined &&
        "sessionId" in focus &&
        focus.sessionId === item.target.sessionId;
    const servers = [...appState.servers].reverse();
    // Catalogs on other machines must not evict the current sidebar first.
    for (const server of servers)
        if (server.connectionId !== activeConnectionId) trim(server.models);
    for (const server of servers) {
        for (let index = server.projects.length - 1; index >= 0 && over(); index--) {
            const project = server.projects[index]!;
            const keepProject =
                focusedGroup(project.target) ||
                project.workspaces.some((item) => focusedGroup(item.target));
            trim(project.sessions, focusedSession);
            for (let wi = project.workspaces.length - 1; wi >= 0 && over(); wi--) {
                const workspace = project.workspaces[wi]!;
                trim(workspace.sessions, focusedSession);
                if (over() && !focusedGroup(workspace.target)) remove(project.workspaces, wi);
            }
            if (over() && !keepProject) remove(server.projects, index);
        }
        trim(server.tasks, (item) => focusedGroup(item.target));
        trim(server.bots, (item) => focusedGroup(item.target));
    }
    for (const server of servers) trim(server.models);
    if (over() && appState.focused?.latestMessage.state === "loaded") {
        bytes -=
            gptLiveSerializedBytes(appState.focused.latestMessage) -
            gptLiveSerializedBytes({ state: "notLoaded" });
        appState.focused = { ...appState.focused, latestMessage: { state: "notLoaded" } };
    }
    trim(appState.servers, (server) => server.connectionId === activeConnectionId);
    // Even pathological identity metadata must fit. Ordinary catalogs retain
    // the complete focused target; an impossible target is explicitly omitted.
    if (over() && appState.focused) {
        bytes -= gptLiveSerializedBytes(appState.focused) - 4;
        appState.focused = null;
    }
    trim(appState.servers);
    return appState;
}

/** The newest public message that has finished arriving; a reply still streaming is not one yet. */
function latestSettled(
    entries: readonly ConversationEntry[],
): { role: "user" | "assistant"; text: string } | undefined {
    for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index]!;
        if (
            entry.kind !== "message" ||
            entry.source !== "server" ||
            entry.pendingSend === true ||
            entry.message.generationStatus === "streaming" ||
            !entry.message.sender ||
            !entry.message.text
        )
            continue;
        const sender = entry.message.sender.kind;
        if (sender !== "human" && sender !== "agent") continue;
        return { role: sender === "human" ? "user" : "assistant", text: entry.message.text };
    }
    return undefined;
}

/**
 * What the active connection has on screen. A bot's or task's own
 * conversation is named as that bot or task, a group with no conversation open
 * as its project or workspace, and anything else as the session it is.
 */
function focusOf(
    connectionId: string,
    workspace: HappyAgentWorkspaceSnapshot,
    server: LiveAppStateServer,
): GptLiveAppStateFocus | null {
    const { groupId, conversationId } = workspace.address;
    if (!groupId) return null;
    if (!conversationId) {
        for (const project of server.projects) {
            if (project.target.groupId === groupId)
                return {
                    target: project.target,
                    title: project.name,
                    latestMessage: { state: "empty" },
                };
            const worktree = project.workspaces.find((item) => item.target.groupId === groupId);
            if (worktree)
                return {
                    target: worktree.target,
                    title: worktree.name,
                    latestMessage: { state: "empty" },
                };
        }
        return null;
    }
    const bot = server.bots.find(
        (item) => item.target.groupId === groupId && item.target.sessionId === conversationId,
    );
    const task = server.tasks.find(
        (item) => item.target.groupId === groupId && item.target.sessionId === conversationId,
    );
    const target: GptLiveNavigationTarget = bot?.target ??
        task?.target ?? { kind: "session", connectionId, groupId, sessionId: conversationId };
    const conversation = workspace.conversation;
    if (conversation.type !== "ready" || conversation.value.conversationId !== conversationId)
        return {
            target,
            title: bot?.name ?? task?.name ?? null,
            latestMessage: { state: "notLoaded" },
        };
    const latest = latestSettled(conversation.value.entries);
    return {
        target,
        title: (bot?.name ?? task?.name ?? conversation.value.title)?.slice(0, NAME_LIMIT) ?? null,
        latestMessage: latest
            ? {
                  state: "loaded",
                  role: latest.role,
                  text: latest.text.slice(0, LATEST_MESSAGE_LIMIT),
                  truncated: latest.text.length > LATEST_MESSAGE_LIMIT,
              }
            : // Older messages may simply not be loaded yet.
              { state: conversation.value.transcriptComplete ? "empty" : "notLoaded" },
    };
}
