import {
    type HappyAgentAttentionDocument,
    type HappyAgentBotId,
    happyAgentAttentionStoreOwnedCreate,
} from "happy-desktop-state";
import { expect, it } from "vitest";
import {
    desktopConnectionDataErase,
    desktopConnectionStorageKeys,
} from "./desktopConnectionDataErase";

function storageCreate(entries: Record<string, string>) {
    const values = new Map(Object.entries(entries));
    return {
        values,
        removeItem: (key: string) => void values.delete(key),
    };
}

it("erases one server's stored keys and store records, leaving every other server's", () => {
    const ended = "cloud-ended";
    const other = "cloud-other";
    const storage = storageCreate(
        Object.fromEntries(
            [...desktopConnectionStorageKeys(ended), ...desktopConnectionStorageKeys(other)].map(
                (key) => [key, "{}"],
            ),
        ),
    );
    storage.values.set("happy.welcome.v1", "{}");
    const forgotten: string[] = [];
    desktopConnectionDataErase({
        happyAgentId: ended,
        storage,
        forget: [
            (id) => forgotten.push(`history:${id}`),
            (id) => forgotten.push(`attention:${id}`),
        ],
    });
    expect(forgotten).toEqual([`history:${ended}`, `attention:${ended}`]);
    for (const key of desktopConnectionStorageKeys(ended))
        expect(storage.values.has(key)).toBe(false);
    for (const key of desktopConnectionStorageKeys(other))
        expect(storage.values.has(key)).toBe(true);
    // The window's own welcome is nobody's server data.
    expect(storage.values.has("happy.welcome.v1")).toBe(true);
});

it("drops a server's attention record from memory and storage, keeping the others", () => {
    let stored: HappyAgentAttentionDocument | undefined = {
        connections: {
            "cloud-ended": { completionSound: "never", mutedBots: ["bot-a"], hiddenBots: [] },
            "cloud-other": { completionSound: "never", mutedBots: [], hiddenBots: ["bot-b"] },
        },
    } as unknown as HappyAgentAttentionDocument;
    const { store, connectionForget } = happyAgentAttentionStoreOwnedCreate({
        persistence: {
            read: () => stored,
            write: (document) => {
                stored = document;
            },
        },
    });
    expect(store.get().connections.get("cloud-ended")?.completionSound).toBe("never");
    connectionForget("cloud-ended");
    expect(store.get().connections.has("cloud-ended")).toBe(false);
    expect(Object.keys(stored?.connections ?? {})).toEqual(["cloud-other"]);
    expect(
        store
            .get()
            .connections.get("cloud-other")
            ?.hiddenBots.has("bot-b" as HappyAgentBotId),
    ).toBe(true);
});
