import { HAPPY_SHARE_LINK_ORIGIN } from "happy-desktop-state";

/** The longest Happy address a page may hand the app, as the shared grammar caps it. */
const HAPPY_LINK_LENGTH_MAX = 4096;
/** A share link: the origin, `/#`, and a payload the shared grammar caps like an address. */
const HAPPY_SHARE_LINK_LENGTH_MAX = HAPPY_SHARE_LINK_ORIGIN.length + 2 + HAPPY_LINK_LENGTH_MAX;
/** The activity macOS continues Happy with for a Universal Link. */
const BROWSING_WEB_ACTIVITY = "NSUserActivityTypeBrowsingWeb";

/**
 * A Happy address a guest page asked to follow — `happy://` or `happy-file://`,
 * in any letter case — or nothing for anything else.
 *
 * Such an address belongs to Happy: it opens in the app, and never in the
 * default browser or another application, since the Happy mobile app may own
 * the scheme on this machine. This only recognizes the scheme; the window
 * reads the address with the shared grammar and does nothing for one that is
 * malformed or names no place in the app.
 */
/**
 * A `happy://` address the operating system handed the app, from a browser or
 * another application, or nothing for anything else. Only the scheme Happy
 * registers is taken; the window reads the address, including which
 * installation it names, with the shared grammar.
 */
export function happyExternalLinkUrl(candidate: string): string | undefined {
    return candidate.length <= HAPPY_LINK_LENGTH_MAX && /^happy:\/\//iu.test(candidate)
        ? candidate
        : undefined;
}

/**
 * The link.happy.page share link a macOS user activity carries as a Universal
 * Link, or nothing for any other activity: Handoff is not a link.
 */
export function happyUniversalLinkUrl(
    type: string,
    details: { readonly webpageURL?: string },
): string | undefined {
    return type === BROWSING_WEB_ACTIVITY && details.webpageURL !== undefined
        ? happyShareLinkSystemUrl(details.webpageURL)
        : undefined;
}

/**
 * A link.happy.page share link the system handed the app, or nothing for any
 * other address. Like `happyExternalLinkUrl`, this only recognizes where the
 * link lives; the window reads the fragment with the same grammar as a share
 * link clicked inside it, and says so when it names nothing it can open.
 */
export function happyShareLinkSystemUrl(candidate: string): string | undefined {
    if (candidate.length > HAPPY_SHARE_LINK_LENGTH_MAX) return undefined;
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        return undefined;
    }
    return url.origin === HAPPY_SHARE_LINK_ORIGIN &&
        url.pathname === "/" &&
        url.username === "" &&
        url.password === "" &&
        url.search === ""
        ? url.href
        : undefined;
}

export function happyLinkUrl(candidate: string): string | undefined {
    return candidate.length <= HAPPY_LINK_LENGTH_MAX && /^happy(?:-file)?:\/\//iu.test(candidate)
        ? candidate
        : undefined;
}
