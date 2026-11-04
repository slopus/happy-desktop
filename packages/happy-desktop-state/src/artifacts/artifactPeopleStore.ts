import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentTeamRoster } from "../happyAgentConnection/types.js";
import type { HappyAgentArtifact, HappyAgentArtifactAuthor } from "./artifactTypes.js";

/** The daemon's bound on one user lookup. */
const BATCH_LIMIT = 100;

/**
 * The names of the people artifacts credit and transcripts mention, by user
 * id. One per connection, shared by every surface, so a person named by both
 * the catalog and a conversation is read once. A standalone installation names
 * no user ids at all, and this stays empty there.
 */
export interface HappyAgentArtifactPeopleStore {
    get(): ReadonlyMap<string, string>;
    subscribe(listener: () => void): () => void;
    /** Reads one person's name if it is not known yet, such as one a message mentions. */
    userNameRequest(userId: string): void;
    /**
     * Who one teammate is, for a mention of them: their current name, photo,
     * and role, and whether they are the reader. Nothing for anyone the team
     * does not list, such as everyone in standalone mode.
     */
    person(userId: string): HappyAgentPerson | undefined;
}

/** Someone on the team, as a mention of them shows them. */
export interface HappyAgentPerson {
    readonly name: string;
    readonly imageUrl?: string;
    readonly role?: string;
    /** The reader themselves. */
    readonly self: boolean;
}

export interface HappyAgentArtifactPeople {
    readonly store: HappyAgentArtifactPeopleStore;
    /** Reads the names of the people these artifacts credit that are not known yet. */
    request(authors: readonly (HappyAgentArtifactAuthor | null)[]): void;
    [Symbol.dispose](): void;
}

/** Every author an artifact credits: its creation, its latest change, and its deletion. */
export function happyAgentArtifactAuthors(
    artifacts: readonly HappyAgentArtifact[],
): readonly (HappyAgentArtifactAuthor | null)[] {
    return artifacts.flatMap((artifact) => [
        artifact.createdBy,
        artifact.updatedBy,
        artifact.deletedBy,
    ]);
}

export function happyAgentArtifactPeopleCreate(
    client: Pick<HappyAgentClient, "getUsers">,
    /** The team the connection holds, current with every profile change it has read. */
    team?: () => HappyAgentTeamRoster,
): HappyAgentArtifactPeople {
    const listeners = new Set<() => void>();
    const controller = new AbortController();
    /** Ids asked for, answered or not, so a name nobody can read is asked for once. */
    const asked = new Set<string>();
    let names: ReadonlyMap<string, string> = new Map();
    const namesRead = (userIds: readonly string[]): void => {
        if (controller.signal.aborted) return;
        const ids: string[] = [];
        for (const userId of userIds) {
            if (asked.has(userId)) continue;
            asked.add(userId);
            ids.push(userId);
        }
        for (let start = 0; start < ids.length; start += BATCH_LIMIT) {
            const batch = ids.slice(start, start + BATCH_LIMIT);
            void client.getUsers(batch, { signal: controller.signal }).then(
                (response) => {
                    if (controller.signal.aborted || response.users.length === 0) return;
                    const next = new Map(names);
                    for (const user of response.users) next.set(user.id, user.name);
                    names = next;
                    for (const listener of listeners) listener();
                },
                () => {
                    // A name that cannot be read leaves the author credited as
                    // "a person"; asking again on every list would not help.
                },
            );
        }
    };
    return {
        store: {
            get: () => names,
            subscribe(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            userNameRequest(userId) {
                // Asked while a transcript renders; the read starts after it.
                queueMicrotask(() => namesRead([userId]));
            },
            person(userId) {
                const current = team?.();
                const member = current?.members.find((candidate) => candidate.id === userId);
                if (member === undefined) return undefined;
                return {
                    name: member.name,
                    ...(member.imageUrl === undefined ? {} : { imageUrl: member.imageUrl }),
                    ...(member.role === undefined ? {} : { role: member.role }),
                    self: current?.viewerId === userId,
                };
            },
        },
        request(authors) {
            namesRead(
                authors.flatMap((author) =>
                    author?.kind === "user" && author.userId !== null ? [author.userId] : [],
                ),
            );
        },
        [Symbol.dispose]() {
            controller.abort();
            listeners.clear();
        },
    };
}
