import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
    HAPPY_CLOUD_ACCOUNT_ID,
    HAPPY_CLOUD_ACCOUNTS_URL,
    happyCloudConnectionId,
    happyCloudServerNameValid,
    happyCloudServerUrl,
    type HappyCloudServer,
} from "../shared/happyCloud";
import type {
    DesktopHappyCloudAvailability,
    DesktopServerSignInResult,
} from "../shared/desktopContract";
import type { ServerSessions, ServerSessionsDeps } from "./serverSessions";

export interface HappyCloud {
    /** What the sign-ins hold for Happy Cloud: the added servers and the account. */
    readonly direct: NonNullable<ServerSessionsDeps["direct"]>;
    serversList(): Promise<DesktopServerSignInResult<readonly HappyCloudServer[]>>;
    availability(name: string): Promise<DesktopServerSignInResult<DesktopHappyCloudAvailability>>;
    serverCreate(name: string): Promise<DesktopServerSignInResult<HappyCloudServer>>;
    serverJoin(name: string, code: string): Promise<DesktopServerSignInResult<HappyCloudServer>>;
    /** Lists a server the account belongs to as a connection, and returns its connection ID. */
    serverAdd(name: string): DesktopServerSignInResult<string>;
    /** A listed server's picture as a `data:` URL, read with the account token. */
    imageRead(serverId: string): Promise<string | undefined>;
}

type Failure = { readonly ok: false; readonly message: string; readonly code: string };

const SIGN_IN_REQUIRED: Failure = {
    ok: false,
    message: "Sign in to Happy Cloud to continue.",
    code: "sign_in_required",
};

/**
 * Happy Cloud as main holds it. The account's token stays in the sign-ins'
 * memory and is sent only to the accounts API from here; the window gets the
 * answers. The servers the person added are one JSON list of names in this
 * app's data, so they are listed again after a restart and want a sign-in.
 */
export function happyCloudCreate(input: {
    readonly listPath: string;
    readonly fetch: typeof globalThis.fetch;
    readonly sessions: () => ServerSessions;
}): HappyCloud {
    let names = listRead(input.listPath);
    /** Each listed server's picture address, from the last list; only the accounts origin. */
    const images = new Map<string, string>();
    const servers = (): ReadonlyMap<string, string> =>
        new Map(names.map((name) => [happyCloudConnectionId(name), happyCloudServerUrl(name)]));

    const accountsCall = async <T>(
        method: "GET" | "POST",
        path: string,
        body: unknown,
        read: (status: number, json: Record<string, unknown>) => T | Failure,
    ): Promise<T | Failure> => {
        const sessions = input.sessions();
        let credential = sessions.credential(HAPPY_CLOUD_ACCOUNT_ID);
        if (!credential) return SIGN_IN_REQUIRED;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            let response: Response;
            try {
                response = await input.fetch(new URL(path, HAPPY_CLOUD_ACCOUNTS_URL), {
                    method,
                    headers: {
                        accept: "application/json",
                        authorization: `Bearer ${credential.accessToken}`,
                        ...(body === undefined ? {} : { "content-type": "application/json" }),
                    },
                    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                    redirect: "error",
                });
            } catch {
                return {
                    ok: false,
                    message: "Happy Cloud isn't reachable right now.",
                    code: "remote_unavailable",
                };
            }
            const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
            if (response.status === 401 && attempt === 0) {
                credential = await sessions.refresh(HAPPY_CLOUD_ACCOUNT_ID, credential.accessToken);
                if (!credential) return SIGN_IN_REQUIRED;
                continue;
            }
            if (response.status === 401) return SIGN_IN_REQUIRED;
            return read(response.status, json);
        }
        return SIGN_IN_REQUIRED;
    };

    const failure = (json: Record<string, unknown>, fallback: string): Failure => ({
        ok: false,
        message: typeof json.error === "string" && json.error !== "" ? json.error : fallback,
        code: typeof json.code === "string" ? json.code : "failed",
    });

    const result = <T>(value: T | Failure): DesktopServerSignInResult<T> =>
        typeof value === "object" && value !== null && "ok" in value && value.ok === false
            ? value
            : { ok: true, value: value as T };

    return {
        direct: {
            servers,
            account: {
                connectionId: HAPPY_CLOUD_ACCOUNT_ID,
                serverUrl: HAPPY_CLOUD_ACCOUNTS_URL,
                method: {
                    type: "oauth",
                    id: "happy-cloud",
                    name: "Happy Cloud",
                    authorizationUrl: new URL("authorize", HAPPY_CLOUD_ACCOUNTS_URL).href,
                    tokenUrl: new URL("token", HAPPY_CLOUD_ACCOUNTS_URL).href,
                    refreshUrl: new URL("token", HAPPY_CLOUD_ACCOUNTS_URL).href,
                    clientId: "happy",
                    resource: HAPPY_CLOUD_ACCOUNTS_URL,
                },
            },
        },
        async serversList() {
            return result(
                await accountsCall("GET", "v1/servers", undefined, (status, json) => {
                    if (status !== 200 || !Array.isArray(json.servers))
                        return failure(json, "Your servers couldn't be read.");
                    images.clear();
                    return json.servers.flatMap((value) => {
                        const server = serverRead(value);
                        if (!server) return [];
                        const url = imageUrlRead(value);
                        if (url !== undefined) images.set(server.id, url);
                        return [server];
                    });
                }),
            );
        },
        async availability(name) {
            return result(
                await accountsCall(
                    "GET",
                    `v1/servers/availability?name=${encodeURIComponent(name)}`,
                    undefined,
                    (status, json): DesktopHappyCloudAvailability | Failure =>
                        status !== 200 || typeof json.available !== "boolean"
                            ? failure(json, "That name couldn't be checked.")
                            : json.available
                              ? { available: true }
                              : {
                                    available: false,
                                    reason:
                                        json.reason === "taken" || json.reason === "reserved"
                                            ? json.reason
                                            : "invalid",
                                },
                ),
            );
        },
        async serverCreate(name) {
            return result(
                await accountsCall("POST", "v1/servers", { name }, (status, json) =>
                    status === 201
                        ? (serverRead(json.server) ??
                          failure(json, "The server couldn't be created."))
                        : failure(
                              json,
                              status === 409
                                  ? "That name is taken."
                                  : "The server couldn't be created.",
                          ),
                ),
            );
        },
        async serverJoin(name, code) {
            return result(
                await accountsCall("POST", "v1/servers/join", { name, code }, (status, json) =>
                    status === 200
                        ? (serverRead(json.server) ?? failure(json, "Joining didn't work."))
                        : failure(
                              json,
                              status === 404
                                  ? "No server has that name and invite code."
                                  : "Joining didn't work.",
                          ),
                ),
            );
        },
        async imageRead(serverId) {
            const url = images.get(serverId);
            const credential = input.sessions().credential(HAPPY_CLOUD_ACCOUNT_ID);
            if (url === undefined || !credential) return undefined;
            try {
                const response = await input.fetch(url, {
                    headers: { authorization: `Bearer ${credential.accessToken}` },
                    redirect: "error",
                });
                const type = response.headers.get("content-type") ?? "";
                if (!response.ok || !type.startsWith("image/")) return undefined;
                const bytes = Buffer.from(await response.arrayBuffer());
                return `data:${type};base64,${bytes.toString("base64")}`;
            } catch {
                return undefined;
            }
        },
        serverAdd(name) {
            if (!happyCloudServerNameValid(name))
                return { ok: false, message: "That isn't a server name.", code: "invalid" };
            if (!names.includes(name)) {
                names = [...names, name];
                void writeFile(input.listPath, `${JSON.stringify(names)}\n`).catch(
                    (error: unknown) =>
                        console.error("Happy Cloud servers could not be saved.", error),
                );
                input.sessions().directChanged();
            }
            return { ok: true, value: happyCloudConnectionId(name) };
        },
    };
}

function listRead(path: string): string[] {
    try {
        const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
        return Array.isArray(parsed)
            ? parsed.filter(
                  (name): name is string =>
                      typeof name === "string" && happyCloudServerNameValid(name),
              )
            : [];
    } catch {
        return [];
    }
}

function serverRead(value: unknown): HappyCloudServer | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const server = value as Record<string, unknown>;
    if (
        typeof server.id !== "string" ||
        typeof server.name !== "string" ||
        !happyCloudServerNameValid(server.name)
    )
        return undefined;
    const image = server.image as Record<string, unknown> | null | undefined;
    return {
        id: server.id,
        name: server.name,
        displayName:
            typeof server.displayName === "string" && server.displayName.trim() !== ""
                ? server.displayName
                : server.name,
        // The address is this build's, from the name: never one the API hands over.
        url: happyCloudServerUrl(server.name),
        role: server.role === "owner" ? "owner" : "member",
        ...(typeof image?.thumbhash === "string" ? { image: { thumbhash: image.thumbhash } } : {}),
    };
}

/** A server's picture address, only when it is on the accounts origin the token belongs to. */
function imageUrlRead(value: unknown): string | undefined {
    const image = (value as { readonly image?: { readonly url?: unknown } | null }).image;
    if (typeof image?.url !== "string") return undefined;
    try {
        const url = new URL(image.url, HAPPY_CLOUD_ACCOUNTS_URL);
        return url.origin === new URL(HAPPY_CLOUD_ACCOUNTS_URL).origin ? url.href : undefined;
    } catch {
        return undefined;
    }
}
