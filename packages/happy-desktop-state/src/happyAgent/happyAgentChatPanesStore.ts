import type {
    HappyAgentFileTabKind,
    HappyAgentWorkspaceStore,
    HappyAgentWorkspaceOutput,
} from "./happyAgentWorkspaceStore.js";
import type {
    HappyAgentGroupId,
    HappyAgentSessionId,
    HappyAgentSessionCreateInput,
} from "./happyAgentTypes.js";

declare const paneIdBrand: unique symbol;
export type HappyAgentChatPaneId = string & { readonly [paneIdBrand]: true };

/** The focused pane's destination is also the URL; other panes retain their own destination. */
export interface HappyAgentChatPaneAddress {
    readonly happyAgentId: string;
    readonly groupId?: HappyAgentGroupId;
    readonly chatId?: HappyAgentSessionId;
    readonly file?: { readonly path: string; readonly kind: HappyAgentFileTabKind };
}

export interface HappyAgentChatPane {
    readonly id: HappyAgentChatPaneId;
    readonly address: HappyAgentChatPaneAddress;
    readonly workspace: HappyAgentWorkspaceStore;
    readonly weight: number;
}

export interface HappyAgentChatPanesSnapshot {
    readonly panes: readonly HappyAgentChatPane[];
    readonly activePaneId?: HappyAgentChatPaneId;
    readonly picker:
        | {
              readonly query: string;
              readonly activeIndex: number;
              readonly busy: boolean;
              readonly error?: string;
          }
        | undefined;
}

export interface HappyAgentChatPanesStore {
    get(): HappyAgentChatPanesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Router input. Returns the surface to address only when its destination changes. */
    routeApply(
        address: HappyAgentChatPaneAddress,
        source: HappyAgentWorkspaceStore,
    ): HappyAgentWorkspaceStore | undefined;
    paneOpen(address: HappyAgentChatPaneAddress, source: HappyAgentWorkspaceStore): void;
    paneFocus(id: HappyAgentChatPaneId): void;
    paneClose(id: HappyAgentChatPaneId): void;
    paneResize(
        id: HappyAgentChatPaneId,
        nextId: HappyAgentChatPaneId,
        weight: number,
        nextWeight: number,
    ): void;
    projectPickerOpen(): void;
    projectPickerClose(): void;
    projectQueryUpdate(query: string): void;
    projectIndexUpdate(index: number): void;
    projectChoose(
        address: HappyAgentChatPaneAddress & { readonly groupId: HappyAgentGroupId },
        source: HappyAgentWorkspaceStore,
        input: HappyAgentSessionCreateInput,
    ): Promise<void>;
}

const EMPTY: HappyAgentChatPanesSnapshot = { panes: [], picker: undefined };

function addressEqual(left: HappyAgentChatPaneAddress, right: HappyAgentChatPaneAddress): boolean {
    return (
        left.happyAgentId === right.happyAgentId &&
        left.groupId === right.groupId &&
        left.chatId === right.chatId &&
        left.file?.path === right.file?.path &&
        left.file?.kind === right.file?.kind
    );
}

/** Window-local arrangement. Pane stores own their drafts, scroll, panels and subscriptions. */
export function happyAgentChatPanesStoreCreate(
    navigate: (address: HappyAgentChatPaneAddress) => void = () => {},
): HappyAgentChatPanesStore {
    let snapshot = EMPTY;
    let sequence = 0;
    const listeners = new Set<() => void>();
    const sources = new Map<HappyAgentChatPaneId, HappyAgentWorkspaceStore>();
    const publish = (next: HappyAgentChatPanesSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const addressApply = (pane: HappyAgentChatPane, address: HappyAgentChatPaneAddress): void => {
        if (address.chatId) pane.workspace.conversationOpen(address.chatId, address.groupId);
        else if (address.groupId) pane.workspace.groupOpen(address.groupId);
        else pane.workspace.conversationClose();
        if (address.file && address.groupId)
            pane.workspace.filePreview(address.groupId, address.file.path, address.file.kind);
    };
    const paneAddressUpdate = (
        id: HappyAgentChatPaneId,
        address: HappyAgentChatPaneAddress,
    ): void => {
        const pane = snapshot.panes.find((entry) => entry.id === id);
        if (!pane) return;
        if (!addressEqual(pane.address, address)) {
            addressApply(pane, address);
            publish({
                ...snapshot,
                panes: snapshot.panes.map((entry) =>
                    entry.id === id ? { ...entry, address } : entry,
                ),
            });
        }
        if (snapshot.activePaneId === id) navigate(address);
    };
    const paneOutput = (id: HappyAgentChatPaneId, event: HappyAgentWorkspaceOutput): void => {
        const pane = snapshot.panes.find((entry) => entry.id === id);
        if (!pane) return;
        const happyAgentId = pane.address.happyAgentId;
        switch (event.type) {
            case "conversationOpenRequested":
                paneAddressUpdate(id, {
                    happyAgentId,
                    groupId: event.location.groupId,
                    chatId: event.location.sessionId,
                });
                break;
            case "groupOpenRequested":
                paneAddressUpdate(id, { happyAgentId, groupId: event.groupId });
                break;
            case "addressedGroupRemoved":
                paneAddressUpdate(id, { happyAgentId });
                break;
            case "subtasksRemoved":
                if (
                    pane.address.chatId &&
                    event.removed.some((location) => location.sessionId === pane.address.chatId)
                )
                    paneAddressUpdate(
                        id,
                        event.open
                            ? {
                                  happyAgentId,
                                  groupId: event.open.groupId,
                                  chatId: event.open.sessionId,
                              }
                            : { happyAgentId },
                    );
                break;
            case "activityRecorded":
                break;
        }
    };
    const paneCreate = (
        address: HappyAgentChatPaneAddress,
        source: HappyAgentWorkspaceStore,
    ): HappyAgentChatPane => {
        const id = `chat-pane-${++sequence}` as HappyAgentChatPaneId;
        const pane = {
            id,
            address,
            workspace: source.surfaceCreate((event) => paneOutput(id, event)),
            weight: 1,
        };
        sources.set(id, source);
        return pane;
    };
    const store: HappyAgentChatPanesStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        routeApply(address, source) {
            // Reopening an already visible chat focuses it instead of making two composers for it.
            const existing =
                address.chatId === undefined
                    ? undefined
                    : snapshot.panes.find(
                          (pane) =>
                              pane.address.happyAgentId === address.happyAgentId &&
                              pane.address.chatId === address.chatId,
                      );
            let pane =
                existing ?? snapshot.panes.find((entry) => entry.id === snapshot.activePaneId);
            const changed =
                !pane || sources.get(pane.id) !== source || !addressEqual(pane.address, address);
            if (pane && sources.get(pane.id) !== source) {
                pane.workspace[Symbol.dispose]();
                sources.delete(pane.id);
                const replacement = paneCreate(address, source);
                publish({
                    ...snapshot,
                    activePaneId: replacement.id,
                    panes: snapshot.panes.map((entry) =>
                        entry.id === pane!.id ? replacement : entry,
                    ),
                });
                pane = replacement;
            } else if (!pane) {
                pane = paneCreate(address, source);
                publish({ ...snapshot, activePaneId: pane.id, panes: [...snapshot.panes, pane] });
            } else if (!addressEqual(pane.address, address) || snapshot.activePaneId !== pane.id) {
                pane = { ...pane, address };
                publish({
                    ...snapshot,
                    activePaneId: pane.id,
                    panes: snapshot.panes.map((entry) => (entry.id === pane!.id ? pane! : entry)),
                });
            }
            // Focusing an unchanged pane must not reopen its chat and reset its tool tabs.
            return changed ? pane.workspace : undefined;
        },
        paneOpen(address, source) {
            const existing =
                address.chatId === undefined
                    ? undefined
                    : snapshot.panes.find(
                          (pane) =>
                              pane.address.happyAgentId === address.happyAgentId &&
                              pane.address.chatId === address.chatId,
                      );
            if (existing) {
                store.paneFocus(existing.id);
                return;
            }
            const pane = paneCreate(address, source);
            publish({ ...snapshot, panes: [...snapshot.panes, pane], activePaneId: pane.id });
            addressApply(pane, address);
            navigate(address);
        },
        paneFocus(id) {
            if (snapshot.activePaneId === id) return;
            const pane = snapshot.panes.find((entry) => entry.id === id);
            if (!pane) return;
            publish({ ...snapshot, activePaneId: id });
            navigate(pane.address);
        },
        paneClose(id) {
            if (snapshot.panes.length < 2) return;
            const index = snapshot.panes.findIndex((pane) => pane.id === id);
            const pane = snapshot.panes[index];
            if (!pane) return;
            const closingActive = snapshot.activePaneId === id;
            const panes = snapshot.panes.filter((entry) => entry.id !== id);
            const next =
                snapshot.activePaneId === id
                    ? panes[Math.max(0, index - 1)]!
                    : panes.find((entry) => entry.id === snapshot.activePaneId)!;
            publish({ ...snapshot, panes, activePaneId: next.id });
            sources.delete(id);
            pane.workspace[Symbol.dispose]();
            if (closingActive) navigate(next.address);
        },
        paneResize(id, nextId, weight, nextWeight) {
            if (
                !Number.isFinite(weight) ||
                !Number.isFinite(nextWeight) ||
                weight <= 0 ||
                nextWeight <= 0
            )
                return;
            publish({
                ...snapshot,
                panes: snapshot.panes.map((pane) =>
                    pane.id === id
                        ? { ...pane, weight }
                        : pane.id === nextId
                          ? { ...pane, weight: nextWeight }
                          : pane,
                ),
            });
        },
        projectPickerOpen() {
            if (snapshot.picker?.busy) return;
            publish({ ...snapshot, picker: { query: "", activeIndex: 0, busy: false } });
        },
        projectPickerClose() {
            if (!snapshot.picker?.busy) publish({ ...snapshot, picker: undefined });
        },
        projectQueryUpdate(query) {
            if (snapshot.picker && !snapshot.picker.busy)
                publish({ ...snapshot, picker: { query, activeIndex: 0, busy: false } });
        },
        projectIndexUpdate(activeIndex) {
            if (snapshot.picker)
                publish({ ...snapshot, picker: { ...snapshot.picker, activeIndex } });
        },
        async projectChoose(address, source, input) {
            if (!snapshot.picker || snapshot.picker.busy) return;
            publish({ ...snapshot, picker: { ...snapshot.picker, busy: true, error: undefined } });
            // Create through a temporary surface so the result belongs to the new pane,
            // even if focus moves while the server is creating the session.
            const pending = source.surfaceCreate((event) => {
                if (event.type === "conversationOpenRequested") {
                    store.paneOpen(
                        {
                            happyAgentId: address.happyAgentId,
                            groupId: event.location.groupId,
                            chatId: event.location.sessionId,
                        },
                        source,
                    );
                    publish({ ...snapshot, picker: undefined });
                }
            });
            try {
                await pending.conversationCreate(address.groupId, input, "shortcut");
                if (snapshot.picker?.busy) throw new Error("The chat could not be created.");
            } catch (error) {
                if (snapshot.picker)
                    publish({
                        ...snapshot,
                        picker: {
                            ...snapshot.picker,
                            busy: false,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : "The chat could not be created.",
                        },
                    });
            } finally {
                pending[Symbol.dispose]();
            }
        },
    };
    return store;
}

export const happyAgentChatPanesStoreNoop: HappyAgentChatPanesStore = {
    get: () => EMPTY,
    subscribe: () => () => {},
    routeApply: (_address, source) => source,
    paneOpen: () => {},
    paneFocus: () => {},
    paneClose: () => {},
    paneResize: () => {},
    projectPickerOpen: () => {},
    projectPickerClose: () => {},
    projectQueryUpdate: () => {},
    projectIndexUpdate: () => {},
    projectChoose: async () => {},
};
