import { Value } from "@sinclair/typebox/value";
import {
    clusterSecretSchema,
    HappyAgentApiError,
    type HappyAgentClient,
} from "@slopus/happy-agent-client";
import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import type {
    HappyAgentClusterSecret,
    HappyAgentClusterSecretCreateInput,
    HappyAgentClusterSecretOwner,
    HappyAgentClusterSecretUpdateInput,
} from "./happyAgentClusterSecretsStore.js";
import {
    happyAgentClusterSecretOwnersRead,
    happyAgentClusterSecretProject,
} from "./happyAgentClusterSecretsStore.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { type HappyAgentSecret, happyAgentSecretProject } from "./happyAgentSecretsStore.js";

/**
 * The artifact version a Gen UI document was read from. Its actions are sent
 * against it, and `origin` says whether an agent wrote it: `message` and the
 * secret actions go to that agent, so without one they cannot run.
 */
export interface HappyAgentGenUiSource {
    readonly artifactId: HappyAgentArtifactId;
    readonly version: number;
    readonly origin: boolean;
}

/** What saving a secret form did: the secret, and whether the origin agent may now use it. */
export interface HappyAgentGenUiSecretSaved {
    readonly secretId: string;
    readonly granted: boolean;
}

/**
 * One opening of a cluster secret form, from one element of one version. Every
 * save from it sends the same click ID, so a retried save answers with what
 * the first one did instead of making a second secret.
 */
export interface HappyAgentGenUiClusterSecretForm {
    /** The owners the reader may create a secret for; the first is chosen first. */
    readonly owners: readonly HappyAgentClusterSecretOwner[];
    /** The secret a change-mode action names, as it is now; nothing when the action creates one. */
    readonly secret: HappyAgentClusterSecret | undefined;
    create(input: HappyAgentClusterSecretCreateInput): Promise<HappyAgentGenUiSecretSaved>;
    /** Changes `secret` at `version`; an omitted field keeps its value. */
    update(
        version: string,
        input: HappyAgentClusterSecretUpdateInput,
    ): Promise<HappyAgentGenUiSecretSaved>;
}

/**
 * One opening of a Happy Agent `secret` form. Every save from it sends the
 * same click ID, so a retried save answers with what the first one did.
 */
export interface HappyAgentGenUiSecretForm {
    /** The secret the action names when it already exists: the form changes it. */
    readonly secret: HappyAgentSecret | undefined;
    /** Stores a new secret under `id`, the name the person settled on. */
    create(input: {
        readonly id: string;
        readonly description: string;
        readonly environment: ReadonlyMap<string, string>;
    }): Promise<HappyAgentGenUiSecretSaved>;
    /**
     * Changes `secret` at the version the form opened on. A value sets a
     * variable, `null` removes it, and a name left out keeps its stored value.
     */
    update(input: {
        readonly description: string;
        readonly environment: ReadonlyMap<string, string | null>;
    }): Promise<HappyAgentGenUiSecretSaved>;
}

/** The Gen UI actions a server runs itself, by which kind of server it is. */
export type HappyAgentGenUiActions = HappyAgentGenUiClusterActions | HappyAgentGenUiDaemonActions;

/** What a Happy Agent does for Gen UI actions that need it. */
export interface HappyAgentGenUiDaemonActions {
    readonly backend: "happyAgent";
    /**
     * Opens the form a `secret` action asks for. With `secretId` naming a
     * secret that exists, the form changes it; otherwise it creates one.
     */
    secretFormOpen(
        source: HappyAgentGenUiSource,
        element: string,
        secretId: string | undefined,
    ): Promise<HappyAgentGenUiSecretForm>;
}

/** What a Happy Cloud server does for Gen UI actions that need it. */
export interface HappyAgentGenUiClusterActions {
    readonly backend: "cluster";
    /**
     * Opens the form a `cluster_secret` action asks for. With `secretId` it
     * changes that secret, and rejects when the reader cannot see it.
     */
    clusterSecretFormOpen(
        source: HappyAgentGenUiSource,
        element: string,
        secretId: string | undefined,
    ): Promise<HappyAgentGenUiClusterSecretForm>;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function savedRead(answer: unknown): HappyAgentGenUiSecretSaved {
    const body = recordOf(answer);
    const secretId = recordOf(body?.secret)?.id;
    if (typeof secretId !== "string") throw new UserError("The server's answer had no secret.");
    return { secretId, granted: body?.granted === true };
}

/**
 * Gen UI actions on a Happy Cloud server. A secret form is saved in one
 * request against the version's element: the server reads the action from the
 * stored document, stores the secret, gives the origin agent access and tells
 * it which secret changed, never its value.
 */
export function happyAgentGenUiClusterActionsCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly now?: () => number;
}): HappyAgentGenUiClusterActions {
    const clickId = cuid2Create(deps.now ?? Date.now);
    const secretRead = async (secretId: string) => {
        try {
            const answer = recordOf(
                await deps.request("GET", `v0/cluster/secrets/${encodeURIComponent(secretId)}`),
            );
            const secret = answer?.secret;
            if (!Value.Check(clusterSecretSchema, secret))
                throw new UserError("The server's answer was not a secret.");
            return happyAgentClusterSecretProject(secret);
        } catch (error) {
            if (error instanceof UserError && error.code === "not_found")
                throw new UserError(
                    "This secret is gone, or it isn't shared with you.",
                    "not_found",
                );
            throw error;
        }
    };
    return {
        backend: "cluster",
        async clusterSecretFormOpen(source, element, secretId) {
            const [permissions, secret] = await Promise.all([
                deps.request("GET", "v0/permissions"),
                secretId === undefined ? undefined : secretRead(secretId),
            ]);
            const id = clickId();
            const path = `v0/artifacts/${encodeURIComponent(source.artifactId)}/versions/${String(source.version)}/actions`;
            const send = async (body: unknown) =>
                savedRead(
                    await deps.request("POST", path, { id, element, secret: body, grant: true }),
                );
            return {
                owners: happyAgentClusterSecretOwnersRead(permissions),
                secret,
                create: (input) => send(input),
                update: (version, input) => send({ ...input, version }),
            };
        },
    };
}

const DAEMON_TOO_OLD =
    "This machine's Happy Agent can't save this form yet. Update Happy Agent and try again.";

/**
 * Gen UI actions on a Happy Agent. A secret form is saved in one request
 * against the version's element: the daemon stores the secret, gives it to
 * the origin agent and tells that agent which secret changed, never a value.
 */
export function happyAgentGenUiDaemonActionsCreate(deps: {
    readonly client: Pick<HappyAgentClient, "getSecret" | "saveArtifactSecretAction">;
    readonly now?: () => number;
}): HappyAgentGenUiDaemonActions {
    const clickId = cuid2Create(deps.now ?? Date.now);
    return {
        backend: "happyAgent",
        async secretFormOpen(source, element, secretId) {
            let secret: HappyAgentSecret | undefined;
            if (secretId !== undefined)
                try {
                    secret = happyAgentSecretProject(
                        (await deps.client.getSecret(secretId)).secret,
                    );
                } catch (error) {
                    // No secret by that name yet: the form creates it.
                    if (!(error instanceof HappyAgentApiError && error.status === 404)) throw error;
                }
            const id = clickId();
            const mutationId = globalThis.crypto.randomUUID();
            const save = async (
                request: Parameters<HappyAgentClient["saveArtifactSecretAction"]>[2],
            ): Promise<HappyAgentGenUiSecretSaved> => {
                try {
                    const answer = await deps.client.saveArtifactSecretAction(
                        source.artifactId,
                        source.version,
                        request,
                    );
                    return { secretId: answer.secret.id, granted: true };
                } catch (error) {
                    if (
                        error instanceof HappyAgentApiError &&
                        error.status === 404 &&
                        error.code !== "not_found"
                    )
                        throw new UserError(DAEMON_TOO_OLD, "unsupported", error);
                    throw error;
                }
            };
            return {
                secret,
                create: (input) =>
                    save({
                        id,
                        element,
                        mutationId,
                        secret: {
                            id: input.id,
                            description: input.description,
                            environment: Object.fromEntries(input.environment),
                        },
                    }),
                update: (input) => {
                    if (!secret)
                        return Promise.reject(new UserError("There is no secret to change."));
                    return save({
                        id,
                        element,
                        mutationId,
                        ifMatch: secret.version,
                        secret: {
                            id: secret.id,
                            description: input.description,
                            environment: Object.fromEntries(input.environment),
                        },
                    });
                },
            };
        },
    };
}
