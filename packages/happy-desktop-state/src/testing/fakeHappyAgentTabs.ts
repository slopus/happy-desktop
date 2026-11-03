import {
    HappyAgentApiError,
    type HappyAgentClient,
    type Surface,
} from "@slopus/happy-agent-client";

/** Durable tabs on the programmable daemon, sharing its failure/response gates. */
export function fakeHappyAgentTabsCreate(deps: {
    readonly record: (method: string, args: unknown[]) => Promise<void>;
    readonly viewer: () => string | null;
    readonly version: () => string;
    readonly cursor: () => string;
}) {
    const surfaces = new Map<string, Surface>();
    const seed = (input: Partial<Surface> & Pick<Surface, "id">): Surface => {
        const surface: Surface = {
            type: "document",
            name: input.id,
            image: null,
            members: [],
            creatorUserId: deps.viewer(),
            chatAgentId: null,
            version: deps.version(),
            updatedAt: 1,
            ...input,
        };
        surfaces.set(surface.id, surface);
        return surface;
    };
    const client = {
        async listSurfaces(...args) {
            await deps.record("listSurfaces", args);
            return { surfaces: [...surfaces.values()], cursor: deps.cursor() };
        },
        async createSurface(request, ...args) {
            await deps.record("createSurface", [request, ...args]);
            const id = request.id ?? `tab_${deps.version()}`;
            const existing = surfaces.get(id);
            if (existing) return { surface: existing };
            const targetBase = {
                state: "available" as const,
                name: request.name,
                hasImage: false as const,
                version: deps.version(),
            };
            const target =
                request.type === "bot"
                    ? { ...targetBase, type: "bot" as const, botId: request.botId }
                    : request.type === "task"
                      ? { ...targetBase, type: "task" as const, taskId: request.taskId }
                      : request.type === "artifact"
                        ? {
                              ...targetBase,
                              type: "artifact" as const,
                              artifactId: request.artifactId,
                          }
                        : undefined;
            return {
                surface: seed({
                    id,
                    type: request.type,
                    name: request.name,
                    members: [
                        { userId: deps.viewer(), joinedAt: 1, orderKey: `${surfaces.size + 1}` },
                    ],
                    ...(target === undefined ? {} : { target }),
                }),
            };
        },
        async joinSurface(id, ...args) {
            await deps.record("joinSurface", [id, ...args]);
            const surface = surfaces.get(id);
            if (!surface) throw new HappyAgentApiError(404, "Unknown tab.", "not_found", null);
            if (surface.members.some((member) => member.userId === deps.viewer()))
                return { surface };
            return {
                surface: seed({
                    ...surface,
                    version: deps.version(),
                    members: [
                        ...surface.members,
                        { userId: deps.viewer(), joinedAt: 1, orderKey: `${surfaces.size + 1}` },
                    ],
                }),
            };
        },
    } satisfies Pick<HappyAgentClient, "listSurfaces" | "createSurface" | "joinSurface">;
    return { client, seed };
}
