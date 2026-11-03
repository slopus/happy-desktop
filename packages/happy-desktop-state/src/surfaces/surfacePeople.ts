import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentSurfacePerson } from "./surfaceTypes.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";

/** The daemon's bound on one user lookup. */
const USERS_BATCH_LIMIT = 100;

/** A name and photo as the daemon describes them, with the photo's address on `endpoint`. */
export function happyAgentSurfacePersonOf(
    endpoint: string,
    name: string | null,
    photo: { readonly thumbhash: string } | null,
    path: string,
): HappyAgentSurfacePerson {
    return {
        name,
        photo:
            photo === null
                ? null
                : {
                      url: happyAgentImageUrl(endpoint, path, photo.thumbhash),
                      thumbhash: photo.thumbhash,
                  },
    };
}

/** Reads people by user ID, each once, in batches the daemon takes. */
export interface HappyAgentSurfacePeopleReader {
    /**
     * Reads everyone named who was not asked for before; `null` names nobody.
     * `again` is read even when it was, for a person whose profile changed.
     */
    request(userIds: Iterable<string | null>, again?: string): void;
}

export function happyAgentSurfacePeopleReaderCreate(deps: {
    readonly client: Pick<HappyAgentClient, "endpoint" | "getUsers">;
    /** Ends every read; aborted reads report nothing. */
    readonly signal: AbortSignal;
    /** Given the people each read found, by user ID. */
    readonly read: (people: ReadonlyMap<string, HappyAgentSurfacePerson>) => void;
}): HappyAgentSurfacePeopleReader {
    const asked = new Set<string>();
    return {
        request(userIds, again) {
            const ids: string[] = [];
            if (again !== undefined) {
                asked.add(again);
                ids.push(again);
            }
            for (const userId of userIds) {
                if (userId === null || asked.has(userId)) continue;
                asked.add(userId);
                ids.push(userId);
            }
            for (let start = 0; start < ids.length; start += USERS_BATCH_LIMIT) {
                const batch = ids.slice(start, start + USERS_BATCH_LIMIT);
                void deps.client.getUsers(batch, { signal: deps.signal }).then(
                    (response) => {
                        if (deps.signal.aborted || response.users.length === 0) return;
                        const people = new Map<string, HappyAgentSurfacePerson>();
                        for (const user of response.users)
                            people.set(
                                user.id,
                                happyAgentSurfacePersonOf(
                                    deps.client.endpoint,
                                    user.name,
                                    user.photo,
                                    `/v0/users/${encodeURIComponent(user.id)}/photo`,
                                ),
                            );
                        deps.read(people);
                    },
                    () => {
                        // A person who cannot be read stays unnamed; asking
                        // again on every update would not help.
                    },
                );
            }
        },
    };
}
