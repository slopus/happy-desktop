import type { WebContents } from "electron";
import { ArtifactActivation } from "./artifactBrowser";
import { happyLinkUrl } from "./happyLink";

/**
 * Whether an address is one of this process's own preview sites. The proxy
 * publishes each document folder under `.localhost`, which is loopback by
 * specification, so a page keeps the secure context it would have when served
 * for real.
 */
export function htmlPreviewUrl(candidate: string): string | undefined {
    try {
        const parsed = new URL(candidate);
        return parsed.protocol === "http:" &&
            parsed.port === "" &&
            parsed.hostname.endsWith(".localhost")
            ? parsed.href
            : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Holds one attached HTML preview guest to the document it was opened with.
 *
 * A preview is one page of one file. Following a web link out of it, or
 * opening a window from it, is browsing, and browsing is the browser tab's
 * job — so the guest stays on its document and the address goes to
 * `browserOpen`. A Happy link it follows goes to the app through
 * `happyLinkOpen` instead, once per input from the reader, and never to the
 * browser or the OS.
 */
export function htmlPreviewGuestAttach(
    guest: WebContents,
    browserOpen: (url: string) => void,
    happyLinkOpen: (url: string) => void,
): void {
    const activation = new ArtifactActivation();
    const happy = (candidate: string): boolean => {
        const url = happyLinkUrl(candidate);
        if (url === undefined) return false;
        if (activation.consume()) happyLinkOpen(url);
        return true;
    };
    guest.on("input-event", (_event, input) => activation.record(input.type));
    guest.setWindowOpenHandler(({ url }) => {
        if (!happy(url)) browserOpen(url);
        return { action: "deny" };
    });
    guest.on("will-navigate", (event, candidate) => {
        if (htmlPreviewUrl(candidate) !== undefined) return;
        event.preventDefault();
        happy(candidate);
    });
    guest.on("will-redirect", (event, candidate) => {
        if (htmlPreviewUrl(candidate) === undefined) event.preventDefault();
    });
}
