import type {
    HappyAgentAttentionDocument,
    HappyAgentAttentionPersistence,
} from "happy-desktop-state";

const ATTENTION_KEY = "happy.attention.v1";

/**
 * Where this machine keeps its copy of which bots the person muted or hid and
 * when each connection chimes, plus the desktop-wide subtask completion default.
 * Connection and per-subtask choices are the person's user
 * settings on each Happy Agent; this record holds the last of them the window
 * knew and the changes not yet sent, so they outlive a connection going away
 * and coming back, plus the device's own choices for a Happy Agent too old to
 * keep them. Every connection's sits in one record, addressed by connection id.
 */
export function desktopAttentionPersistence(): HappyAgentAttentionPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(ATTENTION_KEY);
                return value ? (JSON.parse(value) as HappyAgentAttentionDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(ATTENTION_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still keeps the choices for as long
                // as the window stays open.
            }
        },
    };
}
