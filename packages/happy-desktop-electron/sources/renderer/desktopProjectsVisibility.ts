import type {
    ProjectsVisibilityDocument,
    ProjectsVisibilityPersistence,
} from "happy-desktop-state";

const PROJECTS_VISIBILITY_KEY = "happy.projects-visibility.v1";

/**
 * Where this machine remembers whether the reader hid the Projects sections.
 * It is the window's own storage, like the experiments switch: the choice is
 * about what this app shows, so it applies to every Happy Agent the window
 * addresses — team and local alike — and survives any of them going away.
 */
export function desktopProjectsVisibilityPersistence(): ProjectsVisibilityPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(PROJECTS_VISIBILITY_KEY);
                return value ? (JSON.parse(value) as ProjectsVisibilityDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(PROJECTS_VISIBILITY_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still honours the choice for as long
                // as the window stays open.
            }
        },
    };
}
