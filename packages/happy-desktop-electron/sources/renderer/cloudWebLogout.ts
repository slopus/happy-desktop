import { cloudWebOrigins } from "./cloudWebOrigins";

/** Where a person signs out to and switches servers from. */
export const CLOUD_WEB_PICKER_URL = cloudWebOrigins.pickerUrl;

/**
 * Where the page goes once the edge signed it out. The edge names the
 * accounts service's end-session page as `{next}`, so the sign-in there ends
 * too and the next visit asks again; it returns to the picker afterwards.
 * Anything else, or an address off the accounts origin, goes to the picker.
 */
export async function cloudWebLogoutNext(
    response: Response | undefined,
    accountsOrigin: string,
): Promise<string> {
    if (response?.status !== 200) return CLOUD_WEB_PICKER_URL;
    const body = (await response.json().catch(() => undefined)) as
        | { readonly next?: unknown }
        | undefined;
    if (typeof body?.next !== "string") return CLOUD_WEB_PICKER_URL;
    let next: URL;
    try {
        next = new URL(body.next);
    } catch {
        return CLOUD_WEB_PICKER_URL;
    }
    return next.protocol === "https:" && next.origin === accountsOrigin
        ? next.href
        : CLOUD_WEB_PICKER_URL;
}
