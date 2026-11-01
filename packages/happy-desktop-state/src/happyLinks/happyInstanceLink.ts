import { parseHappyUrl, type HappyLink } from "@slopus/happy-agent-client";
import type { HappyAgentHealth } from "../happyAgentConnection/happyAgentSync.js";

/*
 * Instance links, as the Happy Agent API specifies them: an external link is
 * `happy://<instanceId>/<internal link without "happy://">`, where the
 * instance ID is the 24-character cuid2 a server's health reports.
 *
 * Stand-in until @slopus/happy-agent-client 0.0.140, whose `parseHappyUrl`,
 * `formatHappyUrl`, and health schema carry `instanceId`. Everything that
 * reads or writes an instance link goes through this module, so swapping it
 * for the client's is local to this file.
 */

const INSTANCE_ID = /^[a-z][a-z0-9]{23}$/u;
const EXTERNAL = /^happy:\/\/([^/?#]*)\/(.+)$/isu;
const INTERNAL_PREFIX = "happy://";

/** A link from outside the app, as the window can act on it. */
export type HappyExternalLink =
    /** Names one server and something on it, in the internal form that server's views open. */
    | {
          readonly kind: "instance";
          readonly instanceId: string;
          readonly url: string;
          readonly link: HappyLink;
      }
    /** No instance, a malformed one, or anything Happy for desktop does not open from outside. */
    | { readonly kind: "unsupported" };

/** The installation ID a server's health reports, when it reports a well-formed one. */
export function happyInstanceIdOf(health: HappyAgentHealth | undefined): string | undefined {
    // The field is in the API's health schema from client 0.0.140; until then
    // it is read here, the one place, and only a well-formed value counts.
    const instanceId = (health as { readonly instanceId?: unknown } | undefined)?.instanceId;
    return typeof instanceId === "string" && INSTANCE_ID.test(instanceId) ? instanceId : undefined;
}

/**
 * Reads a `happy://` URL that reached the window from the system. Only an
 * instance link with a well-formed internal remainder can be opened; a link
 * with no instance never is, so it can never be opened on the wrong server.
 */
export function happyExternalLinkParse(url: string): HappyExternalLink {
    const match = EXTERNAL.exec(url);
    const instanceId = match?.[1];
    const rest = match?.[2];
    if (instanceId === undefined || rest === undefined || !INSTANCE_ID.test(instanceId))
        return { kind: "unsupported" };
    const internal = `${INTERNAL_PREFIX}${rest}`;
    const link = parseHappyUrl(internal);
    if (link === undefined) return { kind: "unsupported" };
    return { kind: "instance", instanceId, url: internal, link };
}

/**
 * The external form of an internal Happy link on the server `instanceId`
 * names, for a link that leaves the app. Anything that is not an internal
 * `happy://` link, a `happy-file://` one included, is returned unchanged.
 */
export function happyExternalLinkFormat(instanceId: string, url: string): string {
    if (!INSTANCE_ID.test(instanceId) || !url.startsWith(INTERNAL_PREFIX)) return url;
    if (parseHappyUrl(url) === undefined) return url;
    return `${INTERNAL_PREFIX}${instanceId}/${url.slice(INTERNAL_PREFIX.length)}`;
}
