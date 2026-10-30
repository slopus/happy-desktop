import type { Session, WebContents, WebPreferences } from "electron";
import { happyArtifactPartition } from "../shared/desktopContract";
import {
    artifactHostRefused,
    artifactRequestAllowed,
    artifactRequestHeaders,
    artifactResponseHeaders,
} from "./artifactNetwork";
import { artifactSiteAddress, artifactSiteScheme, type ArtifactSiteHandle } from "./artifactSite";
import { happyLinkUrl } from "./happyLink";

/** A proxy that refuses everything, for a partition whose own proxy could not start. */
const unavailableProxy = "http://127.0.0.1:9";
/** How long after the reader's own input a page may still open a link outside. */
const ACTIVATION_MS = 5_000;
const ACTIVATING_INPUT = new Set([
    "mouseDown",
    "mouseUp",
    "rawKeyDown",
    "keyDown",
    "gestureTap",
    "touchEnd",
]);

/**
 * Whether the webview the renderer asked for may become an artifact guest: the
 * artifact partition, loading exactly an address a site was opened for.
 */
export function artifactWebviewAdmitted(
    params: Readonly<Record<string, string | undefined>>,
    sites: Pick<ArtifactSiteHandle, "owns">,
): boolean {
    return (
        params.partition === happyArtifactPartition &&
        typeof params.src === "string" &&
        sites.owns(params.src)
    );
}

/**
 * The only preferences an artifact guest runs with, whatever the element asked
 * for: no preload and no Node, isolated and sandboxed, web security on, and no
 * nested guests, plugins, or experimental platform features.
 */
export function artifactWebPreferencesEnforce(webPreferences: WebPreferences): void {
    delete webPreferences.preload;
    delete webPreferences.enableBlinkFeatures;
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.nodeIntegrationInWorker = false;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.webviewTag = false;
    webPreferences.plugins = false;
    webPreferences.experimentalFeatures = false;
    webPreferences.navigateOnDragDrop = false;
    webPreferences.safeDialogs = true;
}

/** A link a page may hand to the default browser: the web, with no credential in it, and not this machine or its network. */
export function artifactExternalUrl(candidate: string): string | undefined {
    if (candidate.length > 8192) return undefined;
    try {
        const address = new URL(candidate);
        return (address.protocol === "http:" || address.protocol === "https:") &&
            address.username === "" &&
            address.password === "" &&
            !artifactHostRefused(address.hostname)
            ? address.href
            : undefined;
    } catch {
        return undefined;
    }
}

/** Whether a guest's own page may navigate to an address: only within its one site. */
export function artifactPageNavigationAllowed(
    candidate: string,
    site: string | undefined,
): boolean {
    const address = artifactSiteAddress(candidate);
    return site !== undefined && address?.host === site;
}

/**
 * Whether a frame inside the page may navigate to an address: the guest's own
 * site, an inert local document, or the web.
 */
export function artifactFrameNavigationAllowed(
    candidate: string,
    site: string | undefined,
): boolean {
    if (candidate === "about:blank" || candidate === "about:srcdoc") return true;
    return artifactRequestAllowed({ url: candidate, resourceType: "subFrame", site });
}

/**
 * The reader's own input, as the one thing that lets a page open a link
 * outside. Without it, a page could send the default browser anywhere on a
 * timer; with it, each click or key press opens at most one link.
 */
export class ArtifactActivation {
    #at = Number.NEGATIVE_INFINITY;

    record(type: string, now = Date.now()): void {
        if (ACTIVATING_INPUT.has(type)) this.#at = now;
    }

    consume(now = Date.now()): boolean {
        const active = now - this.#at <= ACTIVATION_MS;
        this.#at = Number.NEGATIVE_INFINITY;
        return active;
    }
}

/**
 * The one site each artifact guest serves, learned from its first page.
 *
 * Every guest in the partition is admitted by `will-attach-webview` with the
 * address a site was opened for, so the first page it loads is that one; from
 * then on the guest is held to it.
 */
export class ArtifactGuests {
    readonly #sites = new Map<number, string>();

    constructor(private readonly sites: Pick<ArtifactSiteHandle, "owns">) {}

    siteOf(guestId: number | undefined): string | undefined {
        return guestId === undefined ? undefined : this.#sites.get(guestId);
    }

    /** Learns a guest's site from a page it is loading, if it has none yet. */
    learn(guestId: number | undefined, candidate: string): string | undefined {
        if (guestId === undefined) return undefined;
        const held = this.#sites.get(guestId);
        if (held !== undefined || !this.sites.owns(candidate)) return held;
        const host = artifactSiteAddress(candidate)!.host;
        this.#sites.set(guestId, host);
        return host;
    }

    forget(guestId: number): void {
        this.#sites.delete(guestId);
    }
}

/**
 * Walls the artifact partition off from everything Happy holds.
 *
 * Its pages run their own scripts, so everything that keeps them in their box
 * is decided here rather than by the page: the protocol handler answers only
 * this partition, every permission is refused, nothing is downloaded, every
 * request is held to the guest's own site or the public web, no credential or
 * cookie leaves for the web or is kept from it, and the only route onto the
 * network is the proxy that judges each resolved address.
 */
export async function artifactSessionConfigure(
    session: Session,
    sites: ArtifactSiteHandle,
    guests: ArtifactGuests,
    networkProxyPort: number | undefined,
): Promise<void> {
    await session.setProxy({
        mode: "fixed_servers",
        proxyBypassRules: "<-loopback>",
        proxyRules:
            networkProxyPort === undefined
                ? unavailableProxy
                : `http://127.0.0.1:${String(networkProxyPort)}`,
    });
    session.protocol.handle(artifactSiteScheme, (request) => sites.handle(request));
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    session.setDevicePermissionHandler(() => false);
    session.on("will-download", (event) => event.preventDefault());
    session.webRequest.onBeforeRequest((details, callback) => {
        const site =
            details.resourceType === "mainFrame"
                ? guests.learn(details.webContentsId, details.url)
                : guests.siteOf(details.webContentsId);
        callback({
            cancel: !artifactRequestAllowed({
                url: details.url,
                resourceType: details.resourceType,
                site,
            }),
        });
    });
    session.webRequest.onBeforeSendHeaders((details, callback) => {
        callback({ requestHeaders: artifactRequestHeaders(details.requestHeaders) });
    });
    session.webRequest.onHeadersReceived((details, callback) => {
        callback(
            details.responseHeaders
                ? { responseHeaders: artifactResponseHeaders(details.responseHeaders) }
                : {},
        );
    });
    await session.closeAllConnections();
}

/**
 * Holds one attached artifact guest to its site.
 *
 * The page stays where it was opened: navigating its own frame anywhere but
 * its site is refused, and a web link it follows, or a window it opens, goes
 * to the default browser instead — once per input from the reader, and never
 * to this machine or its network. A Happy link it follows goes to the app
 * itself, on the same terms, and never to the browser or the OS. A frame
 * inside the page may show the web or the site's own files, and nothing else.
 * No window is ever opened from a guest.
 */
export function artifactGuestAttach(
    guest: WebContents,
    guests: ArtifactGuests,
    externalOpen: (url: string) => void,
    happyLinkOpen: (url: string) => void,
): void {
    const guestId = guest.id;
    const activation = new ArtifactActivation();
    const outside = (candidate: string): void => {
        const happy = happyLinkUrl(candidate);
        if (happy !== undefined) {
            if (activation.consume()) happyLinkOpen(happy);
            return;
        }
        const url = artifactExternalUrl(candidate);
        if (url !== undefined && activation.consume()) externalOpen(url);
    };
    guest.on("input-event", (_event, input) => activation.record(input.type));
    guest.on("did-start-navigation", (details) => {
        if (details.isMainFrame) guests.learn(guestId, details.url);
    });
    guest.setWindowOpenHandler(({ url }) => {
        outside(url);
        return { action: "deny" };
    });
    guest.on("will-frame-navigate", (details) => {
        const site = guests.siteOf(guestId);
        if (details.isMainFrame) {
            if (artifactPageNavigationAllowed(details.url, site)) return;
            details.preventDefault();
            outside(details.url);
            return;
        }
        if (!artifactFrameNavigationAllowed(details.url, site)) details.preventDefault();
    });
    guest.on("will-redirect", (details) => {
        const site = guests.siteOf(guestId);
        if (
            details.isMainFrame
                ? !artifactPageNavigationAllowed(details.url, site)
                : !artifactFrameNavigationAllowed(details.url, site)
        )
            details.preventDefault();
    });
    guest.once("destroyed", () => guests.forget(guestId));
}
