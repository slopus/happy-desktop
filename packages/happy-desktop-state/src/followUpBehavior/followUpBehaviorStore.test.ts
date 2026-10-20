import { expect, it, vi } from "vitest";
import {
    followUpBehaviorStoreCreate,
    followUpDeliveries,
    type FollowUpBehaviorDocument,
} from "./followUpBehaviorStore.js";

it("starts with Enter steering, changes at once for every subscriber, and writes only the change", () => {
    const write = vi.fn<(document: FollowUpBehaviorDocument) => void>();
    const store = followUpBehaviorStoreCreate({ read: () => undefined, write });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get().followUp).toBe("steer");

    store.followUpUpdate("alwaysQueue");
    expect(store.get().followUp).toBe("alwaysQueue");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ followUp: "alwaysQueue" });

    // Saying the same thing again changes nothing.
    store.followUpUpdate("alwaysQueue");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
});

it("reads the stored choice back, and treats a malformed or refused record as none", () => {
    expect(
        followUpBehaviorStoreCreate({
            read: () => ({ followUp: "queue" }),
            write: () => undefined,
        }).get().followUp,
    ).toBe("queue");
    expect(
        followUpBehaviorStoreCreate({
            read: () => ({ followUp: "later" }) as unknown as FollowUpBehaviorDocument,
            write: () => undefined,
        }).get().followUp,
    ).toBe("steer");
    const refused = followUpBehaviorStoreCreate({
        read: () => {
            throw new Error("denied");
        },
        write: () => {
            throw new Error("denied");
        },
    });
    expect(refused.get().followUp).toBe("steer");
    refused.followUpUpdate("queue");
    expect(refused.get().followUp).toBe("queue");
});

it("gives Command+Enter the other delivery unless the choice is locked", () => {
    expect(followUpDeliveries("steer")).toEqual({ plain: "steer", command: "queue" });
    expect(followUpDeliveries("queue")).toEqual({ plain: "queue", command: "steer" });
    expect(followUpDeliveries("alwaysSteer")).toEqual({ plain: "steer", command: "steer" });
    expect(followUpDeliveries("alwaysQueue")).toEqual({ plain: "queue", command: "queue" });
});
