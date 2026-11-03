/**
 * Where a picture the daemon serves is read from, named by the picture it is.
 * The daemon lets a picture be cached for an hour under its route, so a route
 * alone would keep showing the old picture after it changed; the ThumbHash of
 * the current one makes each picture its own address.
 */
export function happyAgentImageUrl(endpoint: string, path: string, thumbhash: string): string {
    return `${endpoint.replace(/\/$/u, "")}${path}?v=${encodeURIComponent(thumbhash)}`;
}
