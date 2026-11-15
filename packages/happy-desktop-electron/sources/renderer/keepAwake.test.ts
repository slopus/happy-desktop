import type { ConversationSummary } from "happy-desktop-state";
import { describe, expect, it, vi } from "vitest";
import { LOCAL_HAPPY_AGENT_ID, type HappyAgentDirectorySnapshot } from "./happyAgentDirectoryStore";
import { happyAgentDirectoryAgentWorking } from "./keepAwake";

vi.mock("./happyAgentDirectoryStore", () => ({ LOCAL_HAPPY_AGENT_ID: "local" }));

type Conversation = Pick<ConversationSummary, "activity" | "backgroundOnly">;

/** A directory whose local Happy Agent has one project holding these conversations. */
function directory(...conversations: Conversation[]): HappyAgentDirectorySnapshot {
    return {
        happyAgents: [
            {
                id: LOCAL_HAPPY_AGENT_ID,
                bots: [],
                projects: [{ conversations, worktrees: [] }],
            },
        ],
    } as unknown as HappyAgentDirectorySnapshot;
}

describe("keeping this computer awake", () => {
    it("holds the machine up while a conversation is working", () => {
        expect(happyAgentDirectoryAgentWorking(directory({ activity: "running" }))).toBe(true);
        expect(happyAgentDirectoryAgentWorking(directory({ activity: "idle" }))).toBe(false);
    });

    it("does not hold it up for a conversation running only a background process", () => {
        // A dev server a finished turn left running can live for days.
        const server: Conversation = { activity: "running", backgroundOnly: true };
        expect(happyAgentDirectoryAgentWorking(directory(server))).toBe(false);
        expect(happyAgentDirectoryAgentWorking(directory(server, { activity: "running" }))).toBe(
            true,
        );
    });
});
