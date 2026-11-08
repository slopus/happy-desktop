import type { HappyAgentCloudScope } from "./happyAgentCloudProviders.js";
import type { HappyAgentCloudProviderAddFlow } from "./happyAgentCloudProvidersStore.js";

/** What a `happy://settings/providers/add…` link opens. */
export interface HappyAgentProviderAddLink {
    readonly flow: HappyAgentCloudProviderAddFlow;
    /** Where it asks to keep what is added; the reader's own account when absent. */
    readonly to?: HappyAgentCloudScope;
}

const PREFIX = "happy://settings/";

const FLOWS: Readonly<Record<string, HappyAgentCloudProviderAddFlow>> = {
    "providers/add": { kind: "choose" },
    "providers/add/openai": { kind: "chatgpt" },
    "providers/add/anthropic": { kind: "claude", setupToken: false },
};

/**
 * Parses a Happy Cloud provider add page, such as `providers/add` or
 * `providers/add/api-key?vendor=anthropic&to=team`, as agreed with the
 * Chief of Staff. The grammar is strict: an unknown path or parameter is not
 * partly read. No link carries a secret or a code.
 *
 * These pages are not in happy-agent-client's settings list yet, so its parser
 * leaves them unread and this one reads them.
 */
export function happyAgentProviderAddLinkParse(
    page: string,
): HappyAgentProviderAddLink | undefined {
    const [path = "", query, extra] = page.split("?");
    if (extra !== undefined) return undefined;
    const params = new URLSearchParams(query ?? "");
    const keys = [...params.keys()];
    if (new Set(keys).size !== keys.length) return undefined;
    const to = params.get("to");
    if (to !== null && to !== "private" && to !== "team") return undefined;
    const vendor = params.get("vendor");
    let flow = FLOWS[path];
    if (path === "providers/add/api-key") {
        if (vendor !== "openai" && vendor !== "anthropic") return undefined;
        flow = { kind: "apiKey", vendor };
    } else if (vendor !== null) return undefined;
    if (!flow || keys.some((key) => key !== "to" && key !== "vendor")) return undefined;
    return { flow, ...(to === null ? {} : { to }) };
}

/** The provider add page a `happy://settings/…` URL names, or nothing for any other URL. */
export function happyAgentProviderAddPageOf(url: string): string | undefined {
    if (!url.startsWith(PREFIX)) return undefined;
    const page = url.slice(PREFIX.length);
    return happyAgentProviderAddLinkParse(page) ? page : undefined;
}
