import { UI_PERMISSION_IDS } from "@slopus/happy-agent-client";
import type { ChatUiGranted, UiPermissionId } from "./chatUi.js";
import type { HappyCloudRequest } from "../happyAgent/happyAgentProviderCredentials.js";

/** Follows the viewer's chat UI permissions; `undefined` until the server has answered. */
export type ChatUiGrantedFollow = (
    listener: (granted: ChatUiGranted | undefined) => void,
) => () => void;

/** Shown where a reader without `content.write` would write into a conversation. */
export const CHAT_CONTENT_WRITE_REFUSAL =
    "You can read this chat, but your role here doesn't let you write in it.";

/**
 * What the viewer may do with chat UI on a Happy Cloud server: the permissions
 * its `GET /v0/permissions` grants them, read once per connection while some
 * conversation draws chat UI. Only for drawing controls disabled; the server
 * decides every click. Until it answers, listeners hear `undefined`: nothing is
 * drawn as allowed, and nothing is refused on its account either.
 */
export function chatUiGrantedFollowCreate(request: HappyCloudRequest): ChatUiGrantedFollow {
    let granted: ChatUiGranted | undefined;
    let reading: Promise<void> | undefined;
    const listeners = new Set<(granted: ChatUiGranted | undefined) => void>();
    const read = (): void => {
        reading ??= request("GET", "v0/permissions").then(
            (body) => {
                const list = (body as { readonly granted?: unknown } | null)?.granted;
                granted = new Set(
                    Array.isArray(list)
                        ? UI_PERMISSION_IDS.filter((id: UiPermissionId) => list.includes(id))
                        : [],
                );
                for (const listener of listeners) listener(granted);
            },
            () => {
                // Asked again by the next conversation that draws chat UI.
                reading = undefined;
            },
        );
    };
    return (listener) => {
        listeners.add(listener);
        listener(granted);
        if (granted === undefined) read();
        return () => {
            listeners.delete(listener);
        };
    };
}
