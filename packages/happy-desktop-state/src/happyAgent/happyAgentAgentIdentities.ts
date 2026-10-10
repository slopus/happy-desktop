import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type {
    ConversationAgentFace,
    ConversationAgentIdentity,
} from "../conversation/conversationEntry.js";
import type { ChatElement } from "../happyAgentConnection/index.js";
import { happyAgentBotSubtasks } from "./happyAgentBotSubtasks.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type { HappyAgentTask } from "./happyAgentTypes.js";

/**
 * Who an agent is, for a transcript that received a message from it. Happy
 * Agent stamps a message with the sending agent's id and nothing else, and the
 * id stays in the message text because the receiving model replies to it — so
 * naming the sender is the window's job, from what it already lists.
 */
export interface HappyAgentAgentIdentitySource {
    /** What the window knows this agent as, or nothing yet. */
    lookup(agentId: string): ConversationAgentIdentity | undefined;
    /**
     * Asks the host about an agent nothing listed names. The answer arrives
     * through `subscribe`; an agent the host will not show stays unnamed.
     */
    request(agentId: string): void;
    subscribe(listener: () => void): () => void;
}

/** Up to two initials from a person's name, as the task's own row shows them. */
function initialsOf(name: string): string {
    return name
        .trim()
        .split(/\s+/u)
        .filter((word) => word.length > 0)
        .slice(0, 2)
        .map((word) => word.slice(0, 1).toUpperCase())
        .join("");
}

/**
 * A task's face, by the same rules as its row: on a standalone machine every
 * task is the reader's own and wears the tasks glyph; in a team it wears its
 * owner's photo, then their initials, then the mark generated from the task.
 */
function taskFace(task: HappyAgentTask): ConversationAgentFace {
    const owner = task.owner;
    if (owner === null) return { kind: "task" };
    if (owner.avatar !== undefined) return { kind: "image", url: owner.avatar.url };
    const initials = owner.name === undefined ? "" : initialsOf(owner.name);
    return initials === "" ? { kind: "generated", seed: task.id } : { kind: "initials", initials };
}

/**
 * Every agent the session list names, by agent id: each bot and task by its
 * own name and face, and every other conversation — a subtask, a project's
 * session — by its title and the mark generated from its id. Bots and tasks
 * come last so they win over a conversation listed under a project too.
 */
export function happyAgentAgentIdentitiesIndex(
    list: HappyAgentSessionListSnapshot,
): ReadonlyMap<string, ConversationAgentIdentity> {
    const index = new Map<string, ConversationAgentIdentity>();
    const titled = (conversation: { readonly id: string; readonly title: string }): void => {
        if (conversation.title.trim().length === 0) return;
        index.set(conversation.id, {
            name: conversation.title,
            face: { kind: "generated", seed: conversation.id },
        });
    };
    if (list.projects.type === "ready")
        for (const project of list.projects.value) {
            project.conversations.forEach(titled);
            for (const worktree of project.worktrees) worktree.conversations.forEach(titled);
        }
    for (const subtask of happyAgentBotSubtasks([...list.bots, ...list.taskDirectory]))
        titled(subtask.conversation);
    for (const task of list.taskDirectory)
        index.set(task.conversation.id, { name: task.name, face: taskFace(task) });
    for (const bot of list.bots)
        index.set(bot.conversation.id, {
            name: bot.name,
            face:
                bot.avatar === undefined
                    ? { kind: "generated", seed: bot.id }
                    : { kind: "image", url: bot.avatar.url },
        });
    return index;
}

/**
 * The identity source over one session list, asking the host with `getAgent`
 * for an agent the list does not name. An agent the host refuses — deleted, or
 * not visible to this reader — is asked about once and then left unnamed.
 */
export function happyAgentAgentIdentitySourceCreate(deps: {
    readonly client: Pick<HappyAgentClient, "getAgent">;
    readonly list: {
        get(): HappyAgentSessionListSnapshot;
        subscribe(listener: () => void): () => void;
    };
}): HappyAgentAgentIdentitySource {
    let indexedFrom: HappyAgentSessionListSnapshot | undefined;
    let index: ReadonlyMap<string, ConversationAgentIdentity> = new Map();
    const fetched = new Map<string, ConversationAgentIdentity | null>();
    const listeners = new Set<() => void>();
    const indexed = (): ReadonlyMap<string, ConversationAgentIdentity> => {
        const list = deps.list.get();
        if (list !== indexedFrom) {
            indexedFrom = list;
            index = happyAgentAgentIdentitiesIndex(list);
        }
        return index;
    };
    const notify = (): void => {
        for (const listener of [...listeners]) listener();
    };
    return {
        lookup: (agentId) => indexed().get(agentId) ?? fetched.get(agentId) ?? undefined,
        request(agentId) {
            if (indexed().has(agentId) || fetched.has(agentId)) return;
            // Held as unnamed while asked, so a second request waits on the first.
            fetched.set(agentId, null);
            void deps.client.getAgent(agentId).then(
                ({ agent }) => {
                    const title = agent.title?.trim();
                    if (!title) return;
                    fetched.set(agentId, {
                        name: title,
                        face: { kind: "generated", seed: agentId },
                    });
                    notify();
                },
                () => undefined,
            );
        },
        subscribe(listener) {
            listeners.add(listener);
            const unsubscribeList = deps.list.subscribe(listener);
            return () => {
                listeners.delete(listener);
                unsubscribeList();
            };
        },
    };
}

/** The agents that sent messages into a transcript, other than the reader's own. */
export function happyAgentTranscriptSenderIds(
    elements: readonly ChatElement[],
): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const element of elements) {
        if (element.kind === "inbound_agent_message") ids.add(element.agentId);
        else if (element.kind === "user_message" && element.senderAgent !== undefined)
            ids.add(element.senderAgent.agentId);
    }
    return ids;
}
