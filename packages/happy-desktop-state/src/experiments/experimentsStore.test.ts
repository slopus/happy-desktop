import { expect, it } from "vitest";
import {
    EXPERIMENTAL_FEATURES,
    experimentsStoreCreate,
    type ExperimentsDocument,
} from "./experimentsStore.js";

it.each([false, true])(
    "keeps the old switch (%s) for inbox and voice, leaves the redesign off, and persists choices",
    (enabled) => {
        let saved: unknown = { experimentalFeaturesEnabled: enabled };
        const persistence = {
            read: () => saved,
            write: (document: ExperimentsDocument) => {
                saved = document;
            },
        };
        const store = experimentsStoreCreate(persistence);
        for (const feature of EXPERIMENTAL_FEATURES)
            expect(store.get()[feature.id]).toBe(
                enabled && (feature.id === "inbox" || feature.id === "voice"),
            );
        store.featureUpdate("inbox", true, "experiments");
        expect(store.get().inbox).toBe(true);
        expect(store.get().voice).toBe(enabled);
        expect(experimentsStoreCreate(persistence).get()).toEqual(store.get());
    },
);
