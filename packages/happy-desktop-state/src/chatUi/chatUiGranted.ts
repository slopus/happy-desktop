import { UI_PERMISSION_IDS } from "@slopus/happy-agent-client";
import type { ChatUiGranted, UiPermissionId } from "./chatUi.js";
import type { HappyCloudRequest } from "../happyAgent/happyAgentProviderCredentials.js";

/**
 * What the viewer may do with chat UI on a Happy Cloud server: the permissions
 * its `GET /v0/permissions` grants them, read once per connection while some
 * conversation draws chat UI. Only for drawing controls disabled; the server
 * decides every click. Until it answers, nothing is drawn as allowed.
 */
export function chatUiGrantedFollowCreate(
    request: HappyCloudRequest,
): (listener: (granted: ChatUiGranted) => void) => () => void {
    let granted: ChatUiGranted | undefined;
    let reading: Promise<void> | undefined;
    const listeners = new Set<(granted: ChatUiGranted) => void>();
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
        listener(granted ?? new Set());
        if (granted === undefined) read();
        return () => {
            listeners.delete(listener);
        };
    };
}
