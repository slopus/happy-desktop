import type {
    HappyAgentViewPreferencesDocument,
    HappyAgentViewPreferencesPersistence,
} from "happy-desktop-state";
import { desktopSettledStorageCreate } from "./desktopSettledStorage";

const VIEW_PREFERENCES_KEY = "happy.view-preferences.v1";

/**
 * The window's one view-preferences store: where this machine remembers how
 * each checkout is arranged — the right panel's width, and how its files are
 * listed.
 *
 * The window's own storage rather than anything a Happy Agent holds: how someone likes
 * to look at a project is about the person in front of this app, and a machine
 * they connect to has no opinion about it. It also has to survive a Happy Agent going
 * away, which anything kept inside a connection would not.
 *
 * A singleton because every Happy Agent this window connects to arranges the same
 * localStorage record and installs the same unload listeners: one instance per
 * connection would race its siblings' writes and add a listener per Happy Agent that
 * ever connected.
 */
const shared = new Map<string, HappyAgentViewPreferencesPersistence>();
export function desktopViewPreferencesPersistence(
    id = "local",
): HappyAgentViewPreferencesPersistence {
    let persistence = shared.get(id);
    if (!persistence) {
        persistence = desktopSettledStorageCreate<HappyAgentViewPreferencesDocument>(
            id === "local" ? VIEW_PREFERENCES_KEY : `${VIEW_PREFERENCES_KEY}:${id}`,
        );
        shared.set(id, persistence);
    }
    return persistence;
}
