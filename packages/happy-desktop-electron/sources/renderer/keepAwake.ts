import type { ConversationSummary, KeepAwakeStore } from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";
import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectorySnapshot } from "./happyAgentDirectoryStore";

/**
 * Whether an agent on this computer is working right now.
 *
 * Only the local Happy Agent counts. Sleep is what would interrupt it: its
 * daemon runs on this machine, and a machine asleep is a daemon stalled in the
 * middle of an inference call. A remote Happy Agent keeps its own machine busy
 * and carries on whether or not this one sleeps, so its work is not a reason to
 * hold this one up.
 *
 * It reads the same conversation summaries the sidebar draws its activity dots
 * from, so the footer control and the rows above it cannot disagree about
 * whether anything is running. Sessions in a project's worktrees are read with
 * the project's own, and a bot's conversation beside them, because a bot
 * working overnight is exactly the case the choice exists for. A conversation
 * that is running only because a background process it started is alive, such
 * as a dev server, does not hold the machine up: such a process can outlive any
 * turn by days.
 */
export function happyAgentDirectoryAgentWorking(snapshot: HappyAgentDirectorySnapshot): boolean {
    const local = snapshot.happyAgents.find((happyAgent) => happyAgent.id === LOCAL_HAPPY_AGENT_ID);
    if (!local) return false;
    const working = (conversation: Pick<ConversationSummary, "activity" | "backgroundOnly">) =>
        conversation.activity === "running" && conversation.backgroundOnly !== true;
    for (const bot of local.bots) if (working(bot.conversation)) return true;
    for (const project of local.projects) {
        for (const conversation of project.conversations) if (working(conversation)) return true;
        for (const worktree of project.worktrees)
            for (const conversation of worktree.conversations)
                if (working(conversation)) return true;
    }
    return false;
}

/**
 * Keeps the shell's sleep assertion following the keep-awake store for as long
 * as the window lives, and returns the way to stop.
 *
 * The first state is reported immediately, so a window that opens with the
 * choice set to `on` holds the machine from its first frame rather than from
 * the first agent that happens to start. Only a change crosses the bridge: the
 * directory notifies constantly while an agent works and almost none of those
 * notifications change this one boolean.
 */
export function keepAwakePublish(store: KeepAwakeStore, bridge: HappyDesktopBridge): () => void {
    let published: boolean | undefined;
    const publish = () => {
        const active = store.get().active;
        if (active === published) return;
        published = active;
        bridge.keepAwakeSet(active);
    };
    const unsubscribe = store.subscribe(publish);
    publish();
    return unsubscribe;
}
