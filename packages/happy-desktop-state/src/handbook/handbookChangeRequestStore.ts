import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";
import { deepEqual, happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import type { UserError } from "../types.js";
import { cuid2Create } from "../utils/cuid2Create.js";
import { handbookFollowCreate } from "./handbookFollow.js";
import { HANDBOOK_UNREADABLE, handbookMutate } from "./handbookMutate.js";
import { handbookChangeRequestDetailRead } from "./handbookRead.js";
import type { HandbookChangeRequestDetail, HandbookChangeRequestInput } from "./handbookTypes.js";

export interface HandbookChangeRequestSnapshot {
    readonly changeRequestId: string;
    /** True until the first answer. */
    readonly loading: boolean;
    /** Null until read, and for a change request the server does not have. */
    readonly detail: HandbookChangeRequestDetail | null;
    /** The server answered that there is no such change request. */
    readonly missing: boolean;
    /** Why the last read failed; what is shown is the last one read. */
    readonly error?: UserError;
}

/**
 * One change request's page: the proposal, the text it was proposed against,
 * the document as it is now, and what merging would make of the two. Read
 * again whenever the request or its document changes, so the merge result
 * stays the one Merge would produce.
 */
export interface HandbookChangeRequestStore {
    get(): HandbookChangeRequestSnapshot;
    subscribe(listener: () => void): () => void;
    /** Merges it into the document, resolving conflicting blocks on the server. */
    changeRequestMerge(): Promise<void>;
    changeRequestReject(reason: string): Promise<void>;
    /** The author takes their own open request back. */
    changeRequestWithdraw(): Promise<void>;
    /** The author changes their own open request, still against the text it was proposed on. */
    changeRequestEdit(input: HandbookChangeRequestInput): Promise<void>;
    [Symbol.dispose](): void;
}

export function handbookChangeRequestStoreCreate(deps: {
    readonly changeRequestId: string;
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
    readonly now?: () => number;
}): HandbookChangeRequestStore {
    const changeRequestId = deps.changeRequestId;
    const store = createStore<HandbookChangeRequestSnapshot>()(() => ({
        changeRequestId,
        loading: true,
        detail: null,
        missing: false,
    }));
    const path = `v0/handbook/change-requests/${encodeURIComponent(changeRequestId)}`;
    const idCreate = cuid2Create(deps.now ?? Date.now);
    let disposed = false;
    let listeners = 0;

    const follow = handbookFollowCreate({
        sync: deps.sync,
        events: ["handbook.document.updated", "handbook.change_request.updated"],
        concerns: (event) =>
            event.type === "handbook.change_request.updated"
                ? event.changeRequestId === changeRequestId
                : event.type === "handbook.document.updated" &&
                  event.documentId === store.getState().detail?.changeRequest.documentId,
        read: async () => {
            let answer: unknown;
            try {
                answer = await deps.request("GET", path);
            } catch (error) {
                if (error instanceof HappyCloudRequestRefusal && error.status === 404) {
                    if (!disposed) store.setState({ loading: false, missing: true, detail: null });
                    return;
                }
                throw error;
            }
            if (disposed) return;
            const detail = handbookChangeRequestDetailRead(answer);
            if (!detail) throw HANDBOOK_UNREADABLE;
            const { error: _cleared, ...current } = store.getState();
            store.setState(
                {
                    ...current,
                    loading: false,
                    missing: false,
                    detail:
                        current.detail !== null && deepEqual(current.detail, detail)
                            ? current.detail
                            : detail,
                },
                true,
            );
        },
        failed: (error) => {
            store.setState({ loading: false, error: happyAgentUserError(error) });
        },
    });

    /** Sends one decision about the request, then reads its page again. */
    const decide = async (suffix: string, body?: unknown): Promise<void> => {
        await handbookMutate(
            deps.request,
            suffix === "" ? "PATCH" : "POST",
            `${path}${suffix}`,
            body,
        );
        follow.load();
    };

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
        changeRequestMerge: () => decide("/merge", { mutationId: idCreate() }),
        changeRequestReject: (reason) =>
            decide("/reject", reason.trim() === "" ? {} : { reason: reason.trim() }),
        changeRequestWithdraw: () => decide("/withdraw"),
        changeRequestEdit: (input) =>
            decide("", {
                title: input.title,
                description: input.description,
                // Still proposed against the text it was first: the base stays.
                text: input.text,
            }),
        [Symbol.dispose]() {
            disposed = true;
            follow.stop();
        },
    };
}
