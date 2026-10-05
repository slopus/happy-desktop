import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type {
    HappyTerminalCliInspection,
    HappyTerminalCliResetOutcome,
    HappyTerminalCliResetRequest,
} from "happy-desktop-state";
import { legacyCliInstalledResolve, type PreparedLegacyCli } from "./legacyCliConnect";

const text = Type.String({ minLength: 1, maxLength: 4096 });
const fingerprint = Type.String({ pattern: "^[a-f0-9]{64}$" });
const machineId = Type.String({ minLength: 1, maxLength: 256, pattern: "^[a-zA-Z0-9_-]+$" });
const connection = Type.Object(
    {
        machineId,
        cliVersion: text,
        serverUrl: text,
        connected: Type.Boolean(),
    },
    { additionalProperties: false },
);
const registration = Type.Object(
    {
        machineId,
        serverUrl: text,
        accountKeyFingerprint: fingerprint,
    },
    { additionalProperties: false },
);
const statusResponse = Type.Object(
    {
        version: Type.Literal(1),
        ok: Type.Literal(true),
        status: Type.Object(
            {
                cliVersion: text,
                scope: Type.Literal("cli-root"),
                auth: Type.Union([
                    Type.Literal("missing"),
                    Type.Literal("v2"),
                    Type.Literal("legacy"),
                    Type.Literal("invalid"),
                ]),
                accountKeyFingerprint: Type.Union([fingerprint, Type.Null()]),
                serverUrl: text,
                machineId: Type.Union([machineId, Type.Null()]),
                identityGuard: fingerprint,
                daemon: Type.Object(
                    {
                        state: Type.Union(
                            (
                                [
                                    "stopped",
                                    "online",
                                    "offline",
                                    "unavailable",
                                    "identity-mismatch",
                                    "version-mismatch",
                                ] as const
                            ).map((state) => Type.Literal(state)),
                        ),
                        connection: Type.Union([connection, Type.Null()]),
                    },
                    { additionalProperties: false },
                ),
                resetPreview: Type.Object(
                    {
                        credentialFile: text,
                        settingsFile: text,
                        settingsFields: Type.Tuple([
                            Type.Literal("machineId"),
                            Type.Literal("machineIdConfirmedByServer"),
                        ]),
                        registration: Type.Union([registration, Type.Null()]),
                        stopsDaemon: Type.Literal(true),
                    },
                    { additionalProperties: false },
                ),
            },
            { additionalProperties: false },
        ),
    },
    { additionalProperties: false },
);
const errorResponse = Type.Object(
    {
        version: Type.Literal(1),
        ok: Type.Literal(false),
        error: Type.Object(
            {
                code: Type.Union(
                    (
                        [
                            "credential_missing",
                            "credential_invalid",
                            "account_mismatch",
                            "server_mismatch",
                            "identity_changed",
                            "daemon_unavailable",
                            "daemon_not_ready",
                            "unsupported",
                            "read_failed",
                            "reset_failed",
                            "machine_delete_failed",
                            "invalid_request",
                            "auth_busy",
                        ] as const
                    ).map((code) => Type.Literal(code)),
                ),
                message: text,
                localAuthCleared: Type.Boolean(),
                registrationRemoved: Type.Boolean(),
                daemonStopped: Type.Boolean(),
            },
            { additionalProperties: false },
        ),
    },
    { additionalProperties: false },
);
const resetResponse = Type.Object(
    {
        version: Type.Literal(1),
        ok: Type.Literal(true),
        result: Type.Object(
            {
                localAuthCleared: Type.Literal(true),
                registrationRemoved: Type.Boolean(),
                daemonStopped: Type.Boolean(),
            },
            { additionalProperties: false },
        ),
    },
    { additionalProperties: false },
);
const resetRequest = Type.Object(
    {
        expectedGuard: fingerprint,
        confirmed: Type.Literal(true),
        removeRegistration: Type.Boolean(),
    },
    { additionalProperties: false },
);

/** Root CLI management has no access to any Agent owner's credentials. */
export function legacyCliManagementCreate(launchEnvironment: () => Promise<NodeJS.ProcessEnv>): {
    read(current: () => boolean): Promise<HappyTerminalCliInspection>;
    reset(
        request: HappyTerminalCliResetRequest,
        current: () => boolean,
    ): Promise<HappyTerminalCliResetOutcome>;
} {
    let cached: { cli: PreparedLegacyCli | undefined; expiresAt: number } | undefined;
    let reading: Promise<HappyTerminalCliInspection> | undefined;
    let resetting = false;
    const cliResolve = async () => {
        if (cached && cached.expiresAt > Date.now()) return cached.cli;
        const cli = await legacyCliInstalledResolve(launchEnvironment);
        cached = { cli, expiresAt: Date.now() + 30_000 };
        return cli;
    };
    return {
        async read(current) {
            if (!current()) throw new Error("The local Happy Agent connection changed.");
            reading ??= (async (): Promise<HappyTerminalCliInspection> => {
                let cli: PreparedLegacyCli | undefined;
                try {
                    cli = await cliResolve();
                } catch (error) {
                    return {
                        snapshot: {
                            status: "unavailable",
                            message:
                                error instanceof Error
                                    ? error.message
                                    : "The terminal CLI could not be located.",
                        },
                    };
                }
                if (!cli) return { snapshot: { status: "not-installed" } };
                let response: unknown;
                try {
                    response = JSON.parse(await invoke(cli, "--status-json"));
                } catch {
                    const version = await installedVersion(cli.entry);
                    return {
                        snapshot: {
                            status: "unavailable",
                            message:
                                "This installed Happy CLI does not support terminal connection management yet. Its sign-in has not been changed; Happy Mobile pairing works independently.",
                            ...(version ? { cliVersion: version } : {}),
                        },
                    };
                }
                if (Value.Check(errorResponse, response))
                    return { snapshot: { status: "unavailable", message: response.error.message } };
                if (!Value.Check(statusResponse, response))
                    return {
                        snapshot: {
                            status: "unavailable",
                            message:
                                "The Happy CLI returned an unsupported status response. Its sign-in has not been changed.",
                        },
                    };
                const status = response.status;
                const home = cli.environment.HAPPY_HOME_DIR;
                const preview = status.resetPreview;
                if (
                    !home ||
                    preview.credentialFile !== join(resolve(home), "access.key") ||
                    preview.settingsFile !== join(resolve(home), "settings.json") ||
                    !serverSafe(status.serverUrl) ||
                    (status.daemon.connection && !serverSafe(status.daemon.connection.serverUrl)) ||
                    (preview.registration &&
                        (preview.registration.machineId !== status.machineId ||
                            preview.registration.accountKeyFingerprint !==
                                status.accountKeyFingerprint ||
                            preview.registration.serverUrl !== status.serverUrl))
                )
                    return {
                        snapshot: {
                            status: "unavailable",
                            message:
                                "The CLI removal preview did not match its inspected login. Nothing was removed.",
                        },
                    };
                return inspectionProject(status);
            })().finally(() => {
                reading = undefined;
            });
            const result = await reading;
            if (!current()) throw new Error("The local Happy Agent connection changed.");
            return result;
        },
        async reset(request, current) {
            if (!Value.Check(resetRequest, request))
                throw new Error(
                    "Review the terminal sign-out confirmation before removing anything.",
                );
            if (!current())
                throw new Error("The local Happy Agent connection changed. Nothing was removed.");
            if (resetting) throw new Error("Terminal sign-out is already in progress.");
            resetting = true;
            try {
                const cli = await cliResolve();
                if (!cli)
                    throw new Error("The Happy CLI is no longer installed. Nothing was removed.");
                if (!current())
                    throw new Error(
                        "The local Happy Agent connection changed. Nothing was removed.",
                    );
                let response: unknown;
                try {
                    response = JSON.parse(
                        await invoke(
                            cli,
                            "--reset-json",
                            JSON.stringify({ version: 1, ...request }),
                        ),
                    );
                } catch {
                    throw new Error(
                        "Terminal sign-out could not be confirmed. Review the current CLI status before trying again.",
                    );
                }
                if (Value.Check(errorResponse, response))
                    return { status: "failed", ...response.error };
                if (!Value.Check(resetResponse, response))
                    throw new Error(
                        "The CLI did not return a confirmed sign-out result. Review its current status before trying again.",
                    );
                return { status: "succeeded", ...response.result };
            } finally {
                resetting = false;
                cached = undefined;
            }
        },
    };
}

function serverSafe(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
        );
    } catch {
        return false;
    }
}

function inspectionProject(
    status: Static<typeof statusResponse>["status"],
): HappyTerminalCliInspection {
    return {
        identityGuard: status.identityGuard,
        snapshot: {
            status: "available",
            cliVersion: status.cliVersion,
            auth: status.auth,
            ...(status.accountKeyFingerprint
                ? { accountKeyFingerprint: status.accountKeyFingerprint }
                : {}),
            serverUrl: status.serverUrl,
            ...(status.machineId ? { machineId: status.machineId } : {}),
            daemon: {
                state: status.daemon.state,
                ...(status.daemon.connection ? { connection: status.daemon.connection } : {}),
            },
            resetPreview: {
                credentialFile: status.resetPreview.credentialFile,
                settingsFile: status.resetPreview.settingsFile,
                settingsFields: status.resetPreview.settingsFields,
                stopsDaemon: true,
                ...(status.resetPreview.registration
                    ? { registration: status.resetPreview.registration }
                    : {}),
            },
        },
    };
}

async function installedVersion(entry: string): Promise<string | undefined> {
    try {
        const manifest: unknown = JSON.parse(
            await readFile(join(dirname(entry), "..", "package.json"), "utf8"),
        );
        const schema = Type.Object({ name: Type.Literal("happy"), version: text });
        return Value.Check(schema, manifest) ? manifest.version : undefined;
    } catch {
        return undefined;
    }
}

/** Accept only the CLI's structured stdout; stderr and execution errors stay private. */
function invoke(
    cli: PreparedLegacyCli,
    action: "--status-json" | "--reset-json",
    input?: string,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = execFile(
            cli.node,
            [cli.entry, "auth", "desktop", action],
            {
                env: cli.environment,
                timeout: action === "--reset-json" ? 60_000 : 10_000,
                encoding: "utf8",
                windowsHide: true,
                maxBuffer: 64 * 1024,
            },
            (_error, stdout) => {
                if (stdout.trim()) resolve(stdout);
                else reject(new Error("The Happy CLI did not return a structured result."));
            },
        );
        child.stdin?.on("error", () => undefined);
        child.stdin?.end(input ?? "");
    });
}
