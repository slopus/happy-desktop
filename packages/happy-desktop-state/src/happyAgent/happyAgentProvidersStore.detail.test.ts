import { describe, expect, it } from "vitest";
import { happyAgentProvidersStoreCreate } from "./happyAgentProvidersStore.js";

/* Inference opens one account's details behind its row. Which one is open
   is this store's, so it survives every configuration read, and leaving the
   category brings the reader back to the list. */

function storeCreate() {
    return happyAgentProvidersStoreCreate({
        client: {
            // The configuration never answers: the details do not wait on it.
            getConfig: () => new Promise(() => undefined),
            patchConfig: () => new Promise(() => undefined),
        },
    });
}

describe("provider details", () => {
    it("opens one account, switches to another, and closes", () => {
        const store = storeCreate();
        const release = store.subscribe(() => undefined);
        store.providerDetailOpen("work");
        expect(store.get().providerDetail).toEqual({ providerId: "work" });
        store.providerDetailOpen("personal_steve");
        expect(store.get().providerDetail).toEqual({ providerId: "personal_steve" });
        store.providerDetailClose();
        expect(store.get()).not.toHaveProperty("providerDetail");
        release();
        store[Symbol.dispose]();
    });

    it("closes when the last surface stops watching", () => {
        const store = storeCreate();
        const first = store.subscribe(() => undefined);
        const second = store.subscribe(() => undefined);
        store.providerDetailOpen("work");
        first();
        expect(store.get().providerDetail).toEqual({ providerId: "work" });
        second();
        expect(store.get()).not.toHaveProperty("providerDetail");
        store[Symbol.dispose]();
    });
});
