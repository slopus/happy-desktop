import { describe, expect, it, vi } from "vitest";
import { gptLiveStoreCreate, type GptLiveDocument } from "./gptLiveStore";

describe("GPT-Live desktop opt-in", () => {
    it("defaults off without writing storage or allocating runtime resources", () => {
        const write = vi.fn();
        const store = gptLiveStoreCreate({ read: () => undefined, write });
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        expect(store.get()).toMatchObject({ gptLiveEnabled: false, status: "disabled" });
        expect(store.get()).toBe(store.get());
        expect(write).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
    });

    it("persists explicit choices across reconstruction independently of experiments", () => {
        let document: GptLiveDocument | undefined;
        const persistence = {
            read: () => document,
            write: (next: GptLiveDocument) => {
                document = next;
            },
        };
        const store = gptLiveStoreCreate(persistence);
        const before = store.get();
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);
        store.gptLiveEnabledUpdate(true);
        expect(before.gptLiveEnabled).toBe(false);
        expect(document).toEqual({ gptLiveEnabled: true });
        expect(gptLiveStoreCreate(persistence).get().gptLiveEnabled).toBe(true);
        store.gptLiveEnabledUpdate(true);
        expect(listener).toHaveBeenCalledTimes(1);
        store.gptLiveEnabledUpdate(false);
        expect(gptLiveStoreCreate(persistence).get().gptLiveEnabled).toBe(false);
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
        store.gptLiveEnabledUpdate(true);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it.each([null, {}, { gptLiveEnabled: "true" }, { experimentalFeaturesEnabled: true }])(
        "fails off for an invalid record %j",
        (value) => {
            const store = gptLiveStoreCreate({
                read: () => value as unknown as GptLiveDocument,
                write: vi.fn(),
            });
            expect(store.get().gptLiveEnabled).toBe(false);
        },
    );

    it("still disables synchronously when storage fails", () => {
        const store = gptLiveStoreCreate({
            read: () => {
                throw new Error("Storage denied");
            },
            write: () => {
                throw new Error("Storage full");
            },
        });
        expect(store.get().gptLiveEnabled).toBe(false);
        store.gptLiveEnabledUpdate(true);
        store.gptLiveEnabledUpdate(false);
        expect(store.get().gptLiveEnabled).toBe(false);
    });
});
