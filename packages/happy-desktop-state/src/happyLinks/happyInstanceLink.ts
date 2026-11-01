import { formatHappyUrl, parseHappyUrl, type HappyLink } from "@slopus/happy-agent-client";

/*
 * Instance links, as the Happy Agent API specifies them: an external link is
 * `happy://<instanceId>/<internal link without "happy://">`, naming the one
 * installation whose health reports that `instanceId`. The grammar is the
 * client's; this module only says what the window does with it.
 */

/** A link from outside the app, as the window can act on it. */
export type HappyExternalLink =
    /** Names one server and something on it; `url` is the internal form its views open. */
    | {
          readonly kind: "instance";
          readonly instanceId: string;
          readonly url: string;
          readonly link: HappyLink;
      }
    /** No instance, or anything Happy for desktop does not open from outside. */
    | { readonly kind: "unsupported" };

/**
 * Reads a `happy://` URL that reached the window from the system. Only an
 * instance link can be opened; a link with no instance never is, so it can
 * never be opened on the wrong server.
 */
export function happyExternalLinkParse(url: string): HappyExternalLink {
    const parsed = parseHappyUrl(url);
    if (parsed?.instanceId === undefined) return { kind: "unsupported" };
    const { instanceId, ...link } = parsed;
    return { kind: "instance", instanceId, url: formatHappyUrl(link), link };
}

/**
 * The external form of a Happy link on the server `instanceId` names, for a
 * link that leaves the app. Anything that is not a Happy link, or already
 * names an instance, is returned unchanged.
 */
export function happyExternalLinkFormat(instanceId: string, url: string): string {
    const link = parseHappyUrl(url);
    if (link === undefined || link.instanceId !== undefined) return url;
    try {
        return formatHappyUrl({ ...link, instanceId });
    } catch {
        // An instance the grammar cannot write has no external form.
        return url;
    }
}
