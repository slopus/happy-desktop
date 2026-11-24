import { describe, expect, it } from "vitest";
import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import { HappyCloudRequestRefusal } from "./happyAgentProviderCredentials.js";
import { happyAgentGenUiClusterActionsCreate } from "./happyAgentGenUiActions.js";

const source = { artifactId: "card" as HappyAgentArtifactId, version: 3, origin: true };
const REQUEST_FILE = "v0/artifacts/card/versions/3/files/secret-request.json";
const ACTIONS = "v0/artifacts/card/versions/3/actions";

/** A cluster that answers each `METHOD path` once from `routes` and records what was sent. */
function cluster(routes: Record<string, unknown>) {
    const sent: { readonly method: string; readonly path: string; readonly body: unknown }[] = [];
    const request = async (method: string, path: string, body?: unknown) => {
        sent.push({ method, path, body });
        const key = `${method} ${path}`;
        if (!(key in routes))
            throw new HappyCloudRequestRefusal("Not found.", "not_found", 404, undefined);
        return routes[key];
    };
    return { request, sent };
}

const input = {
    type: "environment" as const,
    name: "Vercel deploy token",
    description: "",
    owner: "me" as const,
    uses: ["environment" as const],
    material: { VERCEL_TOKEN: "vercel_0123456789abcdef" },
};

describe("a Happy Cloud request card's secret form", () => {
    it("reads an agent's temporary request and saves the secret as that agent's, for that long", async () => {
        const wire = cluster({
            "GET v0/permissions": { granted: ["secrets.own"] },
            [`GET ${REQUEST_FILE}`]: { scope: "agent", expiresIn: 7_200 },
            [`POST ${ACTIONS}`]: { secret: { id: "a1g2e3n4t5v6e7r8c9e0l1t2" }, granted: true },
        });
        const actions = happyAgentGenUiClusterActionsCreate({ request: wire.request });

        const form = await actions.clusterSecretFormOpen(source, "save", undefined);
        expect(form.temporary).toEqual({ expiresIn: 7_200 });
        await form.create(input);

        expect(wire.sent.find((sent) => sent.method === "POST")?.body).toEqual({
            id: expect.any(String),
            element: "save",
            grant: true,
            secret: { ...input, scope: "agent", expiresIn: 7_200 },
        });
    });

    it("saves an ordinary secret when the card carries no request", async () => {
        const wire = cluster({
            "GET v0/permissions": { granted: ["secrets.own"] },
            [`POST ${ACTIONS}`]: { secret: { id: "e5n7v1r0n2m3e4n5t6s7e8n9" }, granted: true },
        });
        const actions = happyAgentGenUiClusterActionsCreate({ request: wire.request });

        const form = await actions.clusterSecretFormOpen(source, "save", undefined);
        expect(form.temporary).toBeUndefined();
        await form.create(input);

        const saved = wire.sent.find((sent) => sent.method === "POST")?.body;
        expect(saved).toMatchObject({ secret: input });
        expect(saved).not.toHaveProperty("secret.scope");
        expect(saved).not.toHaveProperty("secret.expiresIn");
    });
});
