/**
 * Whether the sidebar shows each Happy Agent's Projects section.
 *
 * It is the window's own choice, like the experiments switch: it decides what
 * this installation shows the person at it, for every Happy Agent the window
 * addresses — a team connection and a local one alike — so it is kept by the
 * host's storage rather than by any machine the window connects to. Hiding the
 * section hides the projects only; their work keeps running and bots and tasks
 * stay listed.
 *
 * The constructor opens nothing: it reads the host's record once, and writes
 * back only when the reader changes the setting.
 */
export interface ProjectsVisibilityDocument {
    readonly projectsHidden: boolean;
}

/** Where the choice is kept. Omitting it keeps the choice for this window's lifetime only. */
export interface ProjectsVisibilityPersistence {
    read(): ProjectsVisibilityDocument | undefined;
    write(document: ProjectsVisibilityDocument): void;
}

export interface ProjectsVisibilitySnapshot {
    /** Off until the reader hides the section by name. */
    readonly projectsHidden: boolean;
}

export interface ProjectsVisibilityStore {
    get(): ProjectsVisibilitySnapshot;
    subscribe(listener: () => void): () => void;
    /** Hides or shows every Happy Agent's Projects section across this whole window. */
    projectsHiddenUpdate(hidden: boolean): void;
}

/**
 * A stored record read back as this window's own value. Anything that is not
 * the field this version knows is no record at all, since a person can edit the
 * host's storage by hand.
 */
function documentParse(value: unknown): ProjectsVisibilityDocument | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const hidden = (value as { projectsHidden?: unknown }).projectsHidden;
    return typeof hidden === "boolean" ? { projectsHidden: hidden } : undefined;
}

const SHOWN: ProjectsVisibilitySnapshot = { projectsHidden: false };

/** Creates the window-lifetime store, hydrated from the host's storage when it has one. */
export function projectsVisibilityStoreCreate(
    persistence?: ProjectsVisibilityPersistence,
): ProjectsVisibilityStore {
    let snapshot: ProjectsVisibilitySnapshot = (() => {
        try {
            return documentParse(persistence?.read()) ?? SHOWN;
        } catch {
            // Storage the host refused is a window with no record.
            return SHOWN;
        }
    })();
    const listeners = new Set<() => void>();

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        projectsHiddenUpdate(hidden) {
            if (snapshot.projectsHidden === hidden) return;
            snapshot = { projectsHidden: hidden };
            try {
                persistence?.write(snapshot);
            } catch {
                // Storage the host refused still keeps this window's choice for
                // as long as it stays open.
            }
            for (const listener of listeners) listener();
        },
    };
}

/** The store a host that remembers nothing stands in: projects shown, never changing. */
export const projectsVisibilityStoreNoop: ProjectsVisibilityStore = {
    get: () => SHOWN,
    projectsHiddenUpdate: () => {},
    subscribe: () => () => {},
};
