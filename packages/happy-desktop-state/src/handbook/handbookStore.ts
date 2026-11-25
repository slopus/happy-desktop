import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { entitiesSettle } from "../happyAgentConnection/projection.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { handbookFollowCreate } from "./handbookFollow.js";
import { HANDBOOK_UNREADABLE, handbookMutate } from "./handbookMutate.js";
import { handbookDocumentAnswerRead, handbookRead } from "./handbookRead.js";
import type {
    HandbookAbilities,
    HandbookCategory,
    HandbookDocument,
    HandbookDocumentCreateInput,
} from "./handbookTypes.js";

export interface HandbookSnapshot {
    /** True until the first answer, so "no documents" is never claimed early. */
    readonly loading: boolean;
    /** The server answered that it keeps no handbook. */
    readonly missing: boolean;
    /** In the server's order: the built-in ones, then the rest by name. */
    readonly categories: readonly HandbookCategory[];
    /** Every document not deleted, in the server's order. */
    readonly documents: readonly HandbookDocument[];
    readonly abilities: HandbookAbilities;
    /** Why the last read failed; what is shown is the last one read. */
    readonly error?: UserError;
}

/**
 * The team's handbook on Happy Cloud, for its list: the categories, and every
 * document filed under them. Read once on screen, then again on every
 * handbook event, which is how a new document, an edit, a summary, or a
 * category an admin bot changed reaches its row.
 */
export interface HandbookStore {
    get(): HandbookSnapshot;
    subscribe(listener: () => void): () => void;
    /**
     * Makes a document, named here so a retry never makes two, and answers
     * its ID once the server has it. Rejects with why it was refused.
     */
    documentCreate(input: HandbookDocumentCreateInput): Promise<string>;
    [Symbol.dispose](): void;
}

const NO_ABILITIES: HandbookAbilities = { create: false, manage: false };

export function handbookStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
    readonly now?: () => number;
}): HandbookStore {
    const store = createStore<HandbookSnapshot>()(() => ({
        loading: true,
        missing: false,
        categories: [],
        documents: [],
        abilities: NO_ABILITIES,
    }));
    const idCreate = cuid2Create(deps.now ?? Date.now);
    let disposed = false;
    let listeners = 0;

    const documentsSet = (documents: readonly HandbookDocument[]): void => {
        const current = store.getState();
        store.setState({
            documents: entitiesSettle(
                current.documents,
                documents.filter((document) => document.deletedAt === null),
            ),
        });
    };

    const follow = handbookFollowCreate({
        sync: deps.sync,
        events: [
            "handbook.updated",
            "handbook.document.updated",
            "handbook.change_request.updated",
        ],
        read: async () => {
            let answer: unknown;
            try {
                answer = await deps.request("GET", "v0/handbook");
            } catch (error) {
                if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                    if (!disposed) store.setState({ loading: false, missing: true });
                    return;
                }
                throw error;
            }
            if (disposed) return;
            const handbook = handbookRead(answer);
            if (!handbook) throw HANDBOOK_UNREADABLE;
            const { error: _cleared, ...current } = store.getState();
            const abilities =
                current.abilities.create === handbook.abilities.create &&
                current.abilities.manage === handbook.abilities.manage
                    ? current.abilities
                    : handbook.abilities;
            store.setState(
                {
                    ...current,
                    loading: false,
                    missing: false,
                    categories: referencesPreserve(current.categories, handbook.categories),
                    abilities,
                },
                true,
            );
            documentsSet(handbook.documents);
        },
        failed: (error) => {
            store.setState({ loading: false, error: happyAgentUserError(error) });
        },
    });

    return {
        get: () => store.getState(),
        subscribe(listener) {
            const unsubscribe = store.subscribe(listener);
            listeners += 1;
            if (listeners === 1 && !disposed) follow.start();
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners -= 1;
                if (listeners === 0) follow.stop();
            };
        },
        async documentCreate(input) {
            const id = idCreate();
            const answer = await handbookMutate(deps.request, "POST", "v0/handbook/documents", {
                id,
                title: input.title,
                categoryId: input.categoryId,
                ...(input.maintainerUserId === undefined
                    ? {}
                    : { maintainerUserId: input.maintainerUserId }),
                mutationId: idCreate(),
            });
            const document = handbookDocumentAnswerRead(answer);
            if (!disposed && document) {
                const current = store.getState().documents;
                if (!current.some((entry) => entry.id === document.id))
                    documentsSet([...current, document]);
                follow.load();
            }
            return document?.id ?? id;
        },
        [Symbol.dispose]() {
            disposed = true;
            follow.stop();
        },
    };
}
