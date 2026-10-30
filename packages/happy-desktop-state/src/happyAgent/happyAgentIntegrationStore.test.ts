import { HappyAgentApiError, type HappyIntegration } from "@slopus/happy-agent-client";
import { describe, expect, it, vi } from "vitest";
import type {
    HappyAgentSync,
    HappyAgentSyncInput,
} from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentIntegrationRemovalIncomplete,
    happyAgentIntegrationStoreCreate,
    type HappyAgentIntegrationStoreDeps,
} from "./happyAgentIntegrationStore.js";

const REMOVAL_REFUSED =
    "Happy Agent couldn't remove this computer from Happy Mobile. Check your internet connection and try again. This computer stays linked until it is removed.";

const connected: HappyIntegration = {
    authorization: null,
    configured: true,
    error: null,
    status: "connected",
    updatedAt: 1,
    version: "0001",
};
const removalFailed: HappyIntegration = {
    authorization: null,
    configured: true,
    error: { code: "happy_unavailable", message: REMOVAL_REFUSED },
    status: "failed",
    updatedAt: 2,
    version: "0002",
};
const unlinked: HappyIntegration = {
    authorization: null,
    configured: false,
    error: null,
    status: "disconnected",
    updatedAt: 3,
    version: "0003",
};
const reconnecting: HappyIntegration = {
    authorization: null,
    configured: true,
    error: null,
    status: "connecting",
    updatedAt: 3,
    version: "0003",
};

/** The connection's stream, fed one input at a time by the test. */
function syncScript() {
    const queue: HappyAgentSyncInput[] = [];
    let wake: (() => void) | undefined;
    const sync: HappyAgentSync = {
        async *follow({ signal }) {
            while (!signal.aborted) {
                const next = queue.shift();
                if (next) {
                    yield next;
                    continue;
                }
                await new Promise<void>((resume) => {
                    wake = resume;
                    signal.addEventListener("abort", () => resume(), { once: true });
                });
            }
        },
        health: () => undefined,
    };
    const push = (input: HappyAgentSyncInput): void => {
        queue.push(input);
        wake?.();
    };
    return {
        sync,
        bootstrap(integration: HappyIntegration): void {
            push({
                kind: "bootstrap",
                bootstrap: { happyIntegration: integration } as never,
            });
        },
        event(integration: HappyIntegration): void {
            push({
                kind: "update",
                update: {
                    kind: "event",
                    event: { type: "happy.integration.updated", payload: { integration } },
                } as never,
            });
        },
    };
}

function removalRefusal(): HappyAgentApiError {
    return new HappyAgentApiError(503, REMOVAL_REFUSED, "happy_unavailable", {
        error: REMOVAL_REFUSED,
        code: "happy_unavailable",
        integration: removalFailed,
    });
}

function harness() {
    const stream = syncScript();
    const client = {
        cancelHappyIntegration: vi.fn(),
        disconnectHappyIntegration: vi.fn(),
        getHappyIntegration: vi.fn(),
        startHappyIntegration: vi.fn(),
    };
    const store = happyAgentIntegrationStoreCreate({
        sync: stream.sync,
        client: client as unknown as HappyAgentIntegrationStoreDeps["client"],
    });
    const statuses: string[] = [];
    const unsubscribe = store.subscribe(() => {
        const status = store.get().status;
        if (statuses.at(-1) !== status) statuses.push(status);
    });
    return { client, store, stream, statuses, unsubscribe };
}

async function settle(): Promise<void> {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

/** Opens the Disconnect confirmation on a connected computer and confirms it once. */
async function removalRefused(test: ReturnType<typeof harness>): Promise<void> {
    test.stream.bootstrap(connected);
    await settle();
    test.store.happyIntegrationDisconnectRequest();
    test.client.disconnectHappyIntegration.mockRejectedValueOnce(removalRefusal());
    test.store.mobileManagementConfirm();
    await settle();
}

describe("Disconnect removes this computer from Happy", () => {
    it("adopts the refused removal from the 503 body, then a retry unlinks", async () => {
        const test = harness();
        await removalRefused(test);

        // No stream event arrived; the error body alone says what is left.
        const refused = test.store.get();
        expect(refused).toMatchObject({
            configured: true,
            disconnecting: false,
            message: REMOVAL_REFUSED,
            messageCode: "happy_unavailable",
            status: "failed",
        });
        expect(refused.disconnectError?.message).toBe(REMOVAL_REFUSED);
        expect(refused.management).toEqual({
            kind: "disconnect",
            pending: false,
            error: REMOVAL_REFUSED,
        });
        expect(happyAgentIntegrationRemovalIncomplete(refused)).toBe(true);

        test.client.disconnectHappyIntegration.mockResolvedValueOnce({ integration: unlinked });
        test.store.mobileManagementConfirm();
        await settle();

        const removed = test.store.get();
        expect(removed.configured).toBe(false);
        expect(removed.disconnectError).toBeUndefined();
        expect(removed.management).toBeUndefined();
        expect(happyAgentIntegrationRemovalIncomplete(removed)).toBe(false);
        test.unsubscribe();
    });

    it("adopts the refusal once when the stream reports it before the response", async () => {
        const test = harness();
        test.stream.bootstrap(connected);
        await settle();
        let refuse!: (error: unknown) => void;
        test.client.disconnectHappyIntegration.mockReturnValueOnce(
            new Promise((_resolve, reject) => {
                refuse = reject;
            }),
        );
        test.store.happyIntegrationDisconnect();
        test.stream.event(removalFailed);
        await settle();
        expect(test.store.get().status).toBe("failed");
        expect(test.store.get().disconnecting).toBe(true);

        refuse(removalRefusal());
        await settle();

        expect(test.statuses).toEqual(["connected", "failed"]);
        expect(happyAgentIntegrationRemovalIncomplete(test.store.get())).toBe(true);
        test.unsubscribe();
    });

    it("keeps the computer linked and reconnects it on request", async () => {
        const test = harness();
        await removalRefused(test);
        test.store.mobileManagementCancel();
        test.client.startHappyIntegration.mockResolvedValueOnce({ integration: reconnecting });

        test.store.happyIntegrationReconnect();
        expect(test.store.get().pairingStarting).toBe(true);
        expect(test.store.get().disconnectError).toBeUndefined();
        await settle();

        expect(test.client.startHappyIntegration).toHaveBeenCalledTimes(1);
        expect(test.store.get()).toMatchObject({
            configured: true,
            pairingStarting: false,
            status: "connecting",
        });
        expect(happyAgentIntegrationRemovalIncomplete(test.store.get())).toBe(false);

        // Nothing to reconnect once it is connecting, nor for an unlinked computer.
        test.store.happyIntegrationReconnect();
        test.stream.event(unlinked);
        await settle();
        test.store.happyIntegrationReconnect();
        expect(test.client.startHappyIntegration).toHaveBeenCalledTimes(1);
        test.unsubscribe();
    });

    it("does not reconnect while a removal or a pairing start is in flight", async () => {
        const test = harness();
        await removalRefused(test);
        test.client.disconnectHappyIntegration.mockReturnValueOnce(new Promise(() => undefined));
        test.store.happyIntegrationDisconnect();
        test.store.happyIntegrationReconnect();
        expect(test.client.startHappyIntegration).not.toHaveBeenCalled();

        const second = harness();
        await removalRefused(second);
        second.client.startHappyIntegration.mockReturnValue(new Promise(() => undefined));
        second.store.happyIntegrationReconnect();
        second.store.happyIntegrationReconnect();
        expect(second.client.startHappyIntegration).toHaveBeenCalledTimes(1);
        test.unsubscribe();
        second.unsubscribe();
    });

    it("closes everything without a banner when the phone deletes the computer", async () => {
        const test = harness();
        test.stream.bootstrap(connected);
        await settle();
        test.store.happyIntegrationDisconnectRequest();
        expect(test.store.get().management?.kind).toBe("disconnect");

        test.stream.event(unlinked);
        await settle();

        const snapshot = test.store.get();
        expect(snapshot).toMatchObject({ configured: false, status: "disconnected" });
        expect(snapshot.management).toBeUndefined();
        expect(snapshot.disconnectError).toBeUndefined();
        expect(snapshot.message).toBeUndefined();
        expect(happyAgentIntegrationRemovalIncomplete(snapshot)).toBe(false);
        test.unsubscribe();
    });

    it("pairs again after a completed removal", async () => {
        const test = harness();
        await removalRefused(test);
        test.client.disconnectHappyIntegration.mockResolvedValueOnce({ integration: unlinked });
        test.store.mobileManagementConfirm();
        await settle();
        test.client.startHappyIntegration.mockReturnValueOnce(new Promise(() => undefined));

        test.store.happyIntegrationPair();

        expect(test.client.startHappyIntegration).toHaveBeenCalledTimes(1);
        expect(test.store.get().pairingStarting).toBe(true);
        test.unsubscribe();
    });

    it("ignores a 503 body that is not an integration snapshot", async () => {
        const test = harness();
        test.stream.bootstrap(connected);
        await settle();
        test.client.disconnectHappyIntegration.mockRejectedValueOnce(
            new HappyAgentApiError(503, "Unavailable.", "happy_unavailable", {
                integration: { status: "failed" },
            }),
        );
        test.store.happyIntegrationDisconnect();
        await settle();

        expect(test.store.get().status).toBe("connected");
        expect(test.store.get().disconnectError?.message).toBe("Unavailable.");
        expect(happyAgentIntegrationRemovalIncomplete(test.store.get())).toBe(false);
        test.unsubscribe();
    });
});
