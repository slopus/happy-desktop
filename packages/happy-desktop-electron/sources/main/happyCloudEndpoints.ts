import { HAPPY_CLOUD_ACCOUNTS_URL, happyCloudServerUrl } from "../shared/happyCloud";

/** Where Happy Cloud lives for this run: its accounts service, and each server's address. */
export interface HappyCloudEndpoints {
    /** The accounts service, ending in `/`; also the audience of the account's tokens. */
    readonly accountsUrl: string;
    /** A server's address from its name, ending in `/`; also the audience of its tokens. */
    serverUrl(name: string): string;
}

/** Happy Cloud itself. */
export const HAPPY_CLOUD_ENDPOINTS: HappyCloudEndpoints = {
    accountsUrl: HAPPY_CLOUD_ACCOUNTS_URL,
    serverUrl: happyCloudServerUrl,
};

const NAME = "{name}";

/**
 * Where Happy Cloud lives for this run. A packaged build is always Happy Cloud
 * itself and reads nothing from its environment. A development run may point
 * at a local stack instead: `HAPPY_CLOUD_ACCOUNTS_URL` for the accounts
 * service, and `HAPPY_CLOUD_SERVER_URL` for the servers, with `{name}` where
 * the server's name goes in the host (`http://{name}.localhost:31340/`). The
 * accounts service there must issue each server's tokens for that same
 * address, or the server refuses them. A value set but unusable stops the run
 * rather than quietly reaching Happy Cloud.
 */
export function happyCloudEndpointsRead(input: {
    readonly packaged: boolean;
    readonly env: Readonly<Record<string, string | undefined>>;
}): HappyCloudEndpoints {
    if (input.packaged) return HAPPY_CLOUD_ENDPOINTS;
    const accounts = input.env.HAPPY_CLOUD_ACCOUNTS_URL;
    const server = input.env.HAPPY_CLOUD_SERVER_URL;
    if (!accounts && !server) return HAPPY_CLOUD_ENDPOINTS;
    return {
        accountsUrl: accounts ? accountsUrlRead(accounts) : HAPPY_CLOUD_ACCOUNTS_URL,
        serverUrl: server ? serverUrlTemplateRead(server) : happyCloudServerUrl,
    };
}

function accountsUrlRead(value: string): string {
    const url = httpUrlRead(value, "HAPPY_CLOUD_ACCOUNTS_URL");
    if (url.search !== "" || url.hash !== "")
        throw new Error("HAPPY_CLOUD_ACCOUNTS_URL takes no query or fragment.");
    return directory(url);
}

function serverUrlTemplateRead(template: string): (name: string) => string {
    if (template.split(NAME).length !== 2)
        throw new Error("HAPPY_CLOUD_SERVER_URL needs {name} exactly once.");
    // A stand-in name shows where `{name}` landed; each server needs its own
    // host, since its tokens are issued for its address alone.
    const sample = httpUrlRead(
        template.replace(NAME, "happy-cloud-name"),
        "HAPPY_CLOUD_SERVER_URL",
    );
    if (!sample.hostname.includes("happy-cloud-name"))
        throw new Error("HAPPY_CLOUD_SERVER_URL needs {name} in its host.");
    if (sample.search !== "" || sample.hash !== "")
        throw new Error("HAPPY_CLOUD_SERVER_URL takes no query or fragment.");
    return (name) => directory(new URL(template.replace(NAME, name)));
}

function httpUrlRead(value: string, variable: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${variable} is not a URL.`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:")
        throw new Error(`${variable} must be an http or https URL.`);
    if (url.username !== "" || url.password !== "")
        throw new Error(`${variable} takes no user or password.`);
    return url;
}

/** The address as a directory, ending in `/`, so relative API paths resolve under it. */
function directory(url: URL): string {
    return url.href.endsWith("/") ? url.href : `${url.href}/`;
}
