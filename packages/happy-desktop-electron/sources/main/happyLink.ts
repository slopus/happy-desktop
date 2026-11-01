/** The longest Happy address a page may hand the app, as the shared grammar caps it. */
const HAPPY_LINK_LENGTH_MAX = 4096;

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

export function happyLinkUrl(candidate: string): string | undefined {
    return candidate.length <= HAPPY_LINK_LENGTH_MAX && /^happy(?:-file)?:\/\//iu.test(candidate)
        ? candidate
        : undefined;
}
