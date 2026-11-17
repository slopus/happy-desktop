import {
    UserError,
    type HappyAgentSessionId,
    type HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import type { GenUiMessageHost } from "happy-desktop-ui";

/** A direct message has only local actions and a send to its own conversation. */
export function conversationGenUiHostCreate(input: {
    readonly workspace: Pick<HappyAgentWorkspaceStore, "messageSend">;
    readonly conversationId: HappyAgentSessionId;
    readonly writable: boolean;
    readonly online: () => boolean;
    readonly linkOpen: (url: string) => void;
}): GenUiMessageHost {
    return {
        actionsSupported: new Set(input.writable ? ["message", "open", "copy"] : ["open", "copy"]),
        async onAction(_key, action) {
            switch (action.type) {
                case "message":
                    if (!input.writable) return;
                    if (!input.online()) throw new UserError("Happy Agent is offline.");
                    await input.workspace.messageSend(input.conversationId, action.text);
                    return;
                case "open": {
                    if (
                        !/^https:\/\//iu.test(action.url) ||
                        // eslint-disable-next-line no-control-regex -- Match the producer's explicit URL control-character refusal.
                        /[\s\u0000-\u001f\u007f\\]/u.test(action.url)
                    )
                        return;
                    let url: URL;
                    try {
                        url = new URL(action.url);
                    } catch {
                        return;
                    }
                    if (url.protocol === "https:" && !url.username && !url.password)
                        input.linkOpen(url.href);
                    return;
                }
                case "copy":
                    await navigator.clipboard.writeText(action.text);
                    return;
                default:
                    return;
            }
        },
    };
}
