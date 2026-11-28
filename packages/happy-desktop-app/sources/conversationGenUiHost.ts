import {
    UserError,
    type HappyAgentSessionId,
    type HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import type { GenUiAction, GenUiMessageHost } from "happy-desktop-ui";

/**
 * A direct message has only local actions, a send to its own conversation, and
 * a plugin's page, opened where the server serves plugins. A plugin opened from
 * here is never reported set up: there is no version to report it against.
 */
export function conversationGenUiHostCreate(input: {
    readonly workspace: Pick<HappyAgentWorkspaceStore, "messageSend">;
    readonly conversationId: HappyAgentSessionId;
    readonly writable: boolean;
    readonly online: () => boolean;
    readonly linkOpen: (url: string) => void;
    readonly pluginOpen?: (pluginId: string) => void;
}): GenUiMessageHost {
    const supported: GenUiAction["type"][] = input.writable
        ? ["message", "open", "copy"]
        : ["open", "copy"];
    if (input.pluginOpen) supported.push("plugin");
    return {
        actionsSupported: new Set(supported),
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
                case "plugin":
                    input.pluginOpen?.(action.plugin.id);
                    return;
                default:
                    return;
            }
        },
    };
}
