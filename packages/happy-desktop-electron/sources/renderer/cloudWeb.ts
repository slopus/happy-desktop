import { cloudWebLocked, cloudWebRefreshCreate, cloudWebStorageErase } from "./cloudWebRefresh";

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
const PASSWORD_PATH = "/auth/password";
/** Where a person signs out to and switches servers from. */
export const CLOUD_WEB_PICKER_URL = "https://happybases.com/";

/** Sends the page to sign in, coming back to where it is now. */
export function cloudWebSignIn(): void {
    const back = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`${LOGIN_PATH}?return=${encodeURIComponent(back)}`);
}

/**
 * Signs in to a test account at the edge, which takes only accounts an
 * operator created. Resolves with the refusal to show, or reloads the page
 * into its new session.
 */
export async function cloudWebPasswordSignIn(
    login: string,
    password: string,
): Promise<string | undefined> {
    let response: Response;
    try {
        response = await originalFetch(PASSWORD_PATH, {
            method: "POST",
            credentials: "same-origin",
            headers: { accept: "application/json", "content-type": "application/json" },
            body: JSON.stringify({ login, password }),
        });
    } catch {
        return "Happy Cloud isn't reachable right now.";
    }
    if (response.ok) {
        window.location.reload();
        return undefined;
    }
    const body = (await response.json().catch(() => undefined)) as
        | { readonly error?: unknown }
        | undefined;
    return typeof body?.error === "string" ? body.error : "Signing in didn't work.";
}

/** Signs out at the edge, then leaves for the server picker. */
export async function cloudWebSignOut(): Promise<void> {
    await originalFetch(LOGOUT_PATH, { method: "POST", credentials: "same-origin" }).catch(
        () => undefined,
    );
    window.location.assign(CLOUD_WEB_PICKER_URL);
}

/**
 * Back from a page Stripe hosts: Stripe returns to the server's address with
 * `?payments=setup|top-up|portal` (and `&result=` for the first two). The
 * marks leave the address, the page opens on Settings › Payments, and the
 * server is asked to read Stripe again; what changed arrives as
 * `payments.updated`.
 */
export function cloudWebPaymentsReturn(): void {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("payments")) return;
    url.searchParams.delete("payments");
    url.searchParams.delete("result");
    url.hash = "#/settings/payments";
    window.history.replaceState(window.history.state, "", url);
    void fetch("/v0/payments/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: "{}",
    }).catch(() => undefined);
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

const refresh = cloudWebRefreshCreate({
    post: () =>
        originalFetch(REFRESH_PATH, { method: "POST", credentials: "same-origin" }).then(
            (response) => response.ok,
        ),
    locked: cloudWebLocked,
    storage: globalThis.localStorage,
    now: () => Date.now(),
});

let sessionEnded = false;
const sessionEndListeners = new Set<() => void>();

/** Whether this page's session ended; it then shows only the way to sign in. */
export function cloudWebSessionEnded(): boolean {
    return sessionEnded;
}

/** Calls `listener` once when this page's session ends. */
export function cloudWebSessionEndSubscribe(listener: () => void): () => void {
    sessionEndListeners.add(listener);
    return () => sessionEndListeners.delete(listener);
}

/**
 * Ends this page's session: everything the origin stored for this server is
 * erased, and the page shows nothing but a Sign in button.
 */
export function cloudWebSessionEnd(): void {
    if (sessionEnded) return;
    sessionEnded = true;
    void cloudWebStorageErase();
    for (const listener of sessionEndListeners) listener();
}

function sameOriginApi(input: RequestInfo | URL): boolean {
    const raw = input instanceof Request ? input.url : input.toString();
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith("/v0/");
}

/**
 * A request to the page's own `/v0/*` refused with 401 refreshes the edge's
 * cookies once and is sent again; refused again, the session has ended. Every
 * other request goes out untouched.
 */
if (cloudWeb)
    globalThis.fetch = async (input, init) => {
        if (!sameOriginApi(input)) return originalFetch(input, init);
        // Once the session ended nothing is sent: a refused request would only
        // spend another refresh on cookies the edge already gave up.
        if (sessionEnded) return new Response(null, { status: 401 });
        // A Request body can be read once, so the retry sends a copy.
        const retry = input instanceof Request ? input.clone() : input;
        const response = await originalFetch(input, init);
        if (response.status !== 401) return response;
        if (!(await refresh(Date.now()))) {
            cloudWebSessionEnd();
            return response;
        }
        const again = await originalFetch(retry, init);
        if (again.status === 401) cloudWebSessionEnd();
        return again;
    };
