import { expect, it } from "vitest";
import { happyAgentDirectoryLinkTarget } from "./happyAgentDirectoryLinkTarget";
import type {
    HappyAgentDirectoryEntry,
    HappyAgentDirectorySnapshot,
} from "./happyAgentDirectoryStore";

const TEAM = "k3x9q2m7p0a4b8c1d5e6f7g2";
const LOCAL = "m1n2b3v4c5x6z7l8k9j0h1g2";

function entry(
    id: string,
    patch: Partial<HappyAgentDirectoryEntry> = {},
): HappyAgentDirectoryEntry {
    return {
        id,
        label: id,
        status: "connecting",
        projects: [],
        bots: [],
        botsCreating: [],
        projectsStatus: "loading",
        subtaskFailures: new Map(),
        tasks: [],
        taskFailures: new Map(),
        ...patch,
    } as HappyAgentDirectoryEntry;
}

const session = {} as NonNullable<HappyAgentDirectoryEntry["session"]>;

it("finds the instance only on the connection whose health named it", () => {
    const directory: HappyAgentDirectorySnapshot = {
        activeHappyAgentId: "local",
        happyAgents: [
            entry("local", { instanceId: LOCAL, status: "connected", session }),
            entry("connection:team", { label: "Example Engineering", instanceId: TEAM }),
        ],
    };
    // Known but not live: the link waits for that connection, not the one on screen.
    expect(happyAgentDirectoryLinkTarget(directory, TEAM)).toEqual({
        kind: "waiting",
        label: "Example Engineering",
    });
    expect(happyAgentDirectoryLinkTarget(directory, LOCAL)).toEqual({
        kind: "live",
        happyAgentId: "local",
    });
    expect(happyAgentDirectoryLinkTarget(directory, "z".repeat(24))).toEqual({ kind: "unknown" });
});

it("leaves an unnamed instance open while a connection has not said which it is", () => {
    const directory: HappyAgentDirectorySnapshot = {
        happyAgents: [
            entry("local", { instanceId: LOCAL, status: "connected", session }),
            entry("connection:team"),
        ],
    };
    expect(happyAgentDirectoryLinkTarget(directory, TEAM)).toEqual({ kind: "undetermined" });
});
