import type {
    LiveDesktopContext,
    LiveDesktopSessionStatus,
    LivePublicText,
} from "@slopus/happy-agent-client";
import type { ConversationEntry } from "../conversation/conversationEntry.js";
import type { HappyAgentChatSnapshot } from "../happyAgent/happyAgentChatStore.js";
import type { GptLiveDesktopSource } from "./gptLiveDesktopSource.js";

const encoder = new TextEncoder();
export const GPT_LIVE_FRAME_BYTES = 256 * 1024;
/** Leave room for enclosing typed frames and action IDs. */
const CONTEXT_BYTES = 192 * 1024;

export function gptLiveSerializedBytes(value: object): number {
    return encoder.encode(JSON.stringify(value)).byteLength;
}

/** Whitelist authored public messages. No reasoning, tool output, requests, activities or attachments. */
export function gptLivePublicText(entries: readonly ConversationEntry[]): {
    messages: LivePublicText[];
    truncated: boolean;
} {
    const messages: LivePublicText[] = [];
    let truncated = false;
    for (const entry of entries) {
        if (
            entry.kind !== "message" ||
            entry.source !== "server" ||
            entry.pendingSend === true ||
            !entry.message.sender ||
            !entry.message.text
        )
            continue;
        const sender = entry.message.sender.kind;
        if (sender !== "human" && sender !== "agent") continue;
        const text = entry.message.text.slice(0, 16_384);
        if (text.length !== entry.message.text.length) truncated = true;
        messages.push({
            id: entry.message.id,
            role: sender === "human" ? "user" : "assistant",
            text,
        });
    }
    if (messages.length > 50) truncated = true;
    const recent = messages.slice(-50);
    while (gptLiveSerializedBytes({ messages: recent }) > 96 * 1024 && recent.length > 0) {
        recent.shift();
        truncated = true;
    }
    return { messages: recent, truncated };
}

export function gptLiveSessionStatus(snapshot: HappyAgentChatSnapshot): LiveDesktopSessionStatus {
    if (snapshot.pendingUserInputs.length > 0) return "awaitingInput";
    if (snapshot.session.type === "error") return "error";
    if (snapshot.session.type !== "ready") return "unknown";
    if (snapshot.session.value.pendingUserInputs.length > 0) return "awaitingInput";
    if (snapshot.workingWait) return "waiting";
    if (snapshot.session.value.status === "error") return "error";
    return snapshot.runStatus === "running" ? "running" : "idle";
}

/** Reads authoritative retained UI stores; catalog/activity data is not reconstructed from text. */
export function gptLiveDesktopContextRead(
    windowId: string,
    source: GptLiveDesktopSource,
): LiveDesktopContext {
    const current = source.get();
    const context: LiveDesktopContext = {
        windowId,
        connections: current.connections.slice(0, 100).map((connection) => ({
            connectionId: connection.id,
            name: connection.name.slice(0, 256),
            online: connection.online,
        })),
        activeConnectionId: current.activeConnectionId,
        activeTarget: null,
        projects: [],
        workspaces: [],
        sessions: [],
        bots: [],
        activeSession: null,
        truncated: current.connections.length > 100,
    };
    for (const connection of current.connections.slice(0, 100)) {
        const workspace = connection.workspace?.get();
        if (!workspace) continue;
        const connectionId = connection.id;
        const active = current.activeConnectionId === connectionId;
        const catalog = workspace.list.projects;
        if (catalog.type === "ready") {
            for (const project of catalog.value) {
                const target = {
                    kind: "project" as const,
                    connectionId,
                    projectId: project.id,
                    groupId: project.id,
                };
                context.projects.push({ target, name: project.name.slice(0, 256) });
                if (active && workspace.address.groupId === project.id)
                    context.activeTarget = target;
                for (const session of project.conversations)
                    context.sessions.push({
                        target: { connectionId, groupId: project.id, sessionId: session.id },
                        title: session.title.slice(0, 256),
                        status: session.activity,
                    });
                for (const worktree of project.worktrees) {
                    const target = {
                        kind: "workspace" as const,
                        connectionId,
                        projectId: project.id,
                        workspaceId: worktree.id,
                        groupId: worktree.id,
                    };
                    context.workspaces.push({
                        target,
                        name: worktree.name.slice(0, 256),
                        status:
                            worktree.lifecycle.phase === "creating"
                                ? "preparing"
                                : worktree.lifecycle.phase === "ready"
                                  ? "ready"
                                  : "error",
                    });
                    if (active && workspace.address.groupId === worktree.id)
                        context.activeTarget = target;
                    for (const session of worktree.conversations)
                        context.sessions.push({
                            target: { connectionId, groupId: worktree.id, sessionId: session.id },
                            title: session.title.slice(0, 256),
                            status: session.activity,
                        });
                }
            }
        }
        for (const bot of workspace.list.bots) {
            const target = {
                kind: "bot" as const,
                connectionId,
                groupId: bot.workspaceId,
                botId: bot.id,
                sessionId: bot.conversation.id,
            };
            context.bots.push({
                target,
                name: bot.name.slice(0, 256),
                status: bot.conversation.activity,
            });
            if (active && workspace.address.groupId === bot.workspaceId)
                context.activeTarget = target;
        }
        if (!active || !workspace.address.groupId || !workspace.address.conversationId) continue;
        const target = {
            connectionId,
            groupId: workspace.address.groupId,
            sessionId: workspace.address.conversationId,
        };
        if (context.activeTarget?.kind !== "bot")
            context.activeTarget = { kind: "session", ...target };
        const conversation = workspace.conversation;
        if (conversation.type !== "ready") continue;
        const session = conversation.value.session;
        const publicText = gptLivePublicText(conversation.value.entries);
        const pending = session.type === "ready" && session.value.pendingUserInputs.length > 0;
        const refusal = !connection.online
            ? "This connection is offline."
            : workspace.conversationDelegated
              ? "This conversation belongs to another agent."
              : pending
                ? "Answer the pending question yourself before adding voice text."
                : workspace.groupAccess.conversationRefusal;
        context.activeSession = {
            target,
            status: pending
                ? "awaitingInput"
                : session.type === "error"
                  ? "error"
                  : conversation.value.workingWait
                    ? "waiting"
                    : conversation.value.running
                      ? "running"
                      : "idle",
            messages: publicText.messages,
            composerHasDraft:
                conversation.value.composer.text.length > 0 ||
                conversation.value.composer.attachments.length > 0,
            writeRefusal: refusal?.slice(0, 1024) ?? null,
        };
        context.truncated ||= publicText.truncated;
    }
    for (const rows of [context.projects, context.workspaces, context.sessions, context.bots]) {
        if (rows.length > 100) {
            rows.splice(100);
            context.truncated = true;
        }
    }
    while (gptLiveSerializedBytes(context) > CONTEXT_BYTES) {
        context.truncated = true;
        if (context.activeSession?.messages.length) context.activeSession.messages.shift();
        else if (context.sessions.length) context.sessions.pop();
        else if (context.workspaces.length) context.workspaces.pop();
        else if (context.projects.length) context.projects.pop();
        else if (context.bots.length) context.bots.pop();
        else break;
    }
    return context;
}

/** Public streaming text/activity does not invalidate a navigation/draft decision. */
export function gptLiveContextDecisionKey(context: LiveDesktopContext): string {
    return JSON.stringify({
        ...context,
        sessions: context.sessions.map(({ status: _status, ...session }) => session),
        bots: context.bots.map(({ status: _status, ...bot }) => bot),
        activeSession: context.activeSession
            ? {
                  ...context.activeSession,
                  messages: [],
                  status:
                      context.activeSession.status === "awaitingInput"
                          ? "awaitingInput"
                          : "unknown",
              }
            : null,
    });
}
