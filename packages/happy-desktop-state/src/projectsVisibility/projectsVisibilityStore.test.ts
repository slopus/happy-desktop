import { expect, it, vi } from "vitest";
import {
    projectsVisibilityStoreCreate,
    type ProjectsVisibilityDocument,
} from "./projectsVisibilityStore.js";

it("starts shown, hides at once for every subscriber, and writes only the change", () => {
    const write = vi.fn<(document: ProjectsVisibilityDocument) => void>();
    const store = projectsVisibilityStoreCreate({ read: () => undefined, write });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get().projectsHidden).toBe(false);

    store.projectsHiddenUpdate(true);
    expect(store.get().projectsHidden).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ projectsHidden: true });

    // Saying the same thing again changes nothing.
    store.projectsHiddenUpdate(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
});

it("reads the stored choice back, and treats a malformed or refused record as none", () => {
    expect(
        projectsVisibilityStoreCreate({
            read: () => ({ projectsHidden: true }),
            write: () => undefined,
        }).get().projectsHidden,
    ).toBe(true);
    expect(
        projectsVisibilityStoreCreate({
            read: () => ({ projectsHidden: "yes" }) as unknown as ProjectsVisibilityDocument,
            write: () => undefined,
        }).get().projectsHidden,
    ).toBe(false);
    const refused = projectsVisibilityStoreCreate({
        read: () => {
            throw new Error("denied");
        },
        write: () => {
            throw new Error("denied");
        },
    });
    expect(refused.get().projectsHidden).toBe(false);
    refused.projectsHiddenUpdate(true);
    expect(refused.get().projectsHidden).toBe(true);
});
