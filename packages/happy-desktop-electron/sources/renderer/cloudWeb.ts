declare const __HAPPY_CLOUD_WEB__: boolean;

/**
 * Whether this renderer was built as the cloud web app (`HAPPY_TARGET=cloud-web`):
 * served at `https://<name>.happybases.com/` as one Happy Cloud server's
 * client, with no Electron shell and no local Happy Agent. Its API is the
 * page's own origin, and its session is the edge's cookies, which script
 * never sees.
 */
export const cloudWeb: boolean = typeof __HAPPY_CLOUD_WEB__ !== "undefined" && __HAPPY_CLOUD_WEB__;

const LOGIN_PATH = "/auth/login";
const REFRESH_PATH = "/auth/refresh";
const SESSION_PATH = "/auth/session";
const LOGOUT_PATH = "/auth/logout";
/** Where a person signs out to and switches servers from. */
export const CLOUD_WEB_PICKER_URL = "https://happybases.com/";

/** Sends the page to sign in, coming back to where it is now. */
export function cloudWebSignIn(): void {
    const back = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`${LOGIN_PATH}?return=${encodeURIComponent(back)}`);
}

/** Signs out at the edge, then leaves for the server picker. */
export async function cloudWebSignOut(): Promise<void> {
    await originalFetch(LOGOUT_PATH, { method: "POST", credentials: "same-origin" }).catch(
        () => undefined,
    );
    window.location.assign(CLOUD_WEB_PICKER_URL);
}

/** Whether the edge holds a session for this page; never a token. */
export async function cloudWebSessionRead(): Promise<boolean> {
    const response = await originalFetch(SESSION_PATH, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
    });
    if (!response.ok) return false;
    const body = (await response.json().catch(() => undefined)) as
        | { readonly signedIn?: unknown }
        | undefined;
    return body?.signedIn === true;
}

const originalFetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis);
let refreshing: Promise<boolean> | undefined;

/** One refresh at a time, however many requests were refused together. */
function refresh(): Promise<boolean> {
    refreshing ??= originalFetch(REFRESH_PATH, { method: "POST", credentials: "same-origin" })
        .then(
            (response) => response.ok,
            () => false,
        )
        .finally(() => {
            refreshing = undefined;
        });
    return refreshing;
}

function sameOriginApi(input: RequestInfo | URL): boolean {
    const raw = input instanceof Request ? input.url : input.toString();
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith("/v0/");
}

/**
 * A request to the page's own `/v0/*` refused with 401 refreshes the edge's
 * cookies once and is sent again; refused again, the page signs in. Every
 * other request goes out untouched.
 */
if (cloudWeb)
    globalThis.fetch = async (input, init) => {
        if (!sameOriginApi(input)) return originalFetch(input, init);
        // A Request body can be read once, so the retry sends a copy.
        const retry = input instanceof Request ? input.clone() : input;
        const response = await originalFetch(input, init);
        if (response.status !== 401) return response;
        if (!(await refresh())) {
            cloudWebSignIn();
            return response;
        }
        const again = await originalFetch(retry, init);
        if (again.status === 401) cloudWebSignIn();
        return again;
    };
