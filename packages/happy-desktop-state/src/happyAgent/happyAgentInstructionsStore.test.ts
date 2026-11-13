import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    happyAgentInstructionsStoreCreate,
    happyAgentPolicyAccessRead,
    type HappyAgentInstructionsStore,
} from "./happyAgentInstructionsStore.js";

const CATALOG = [{ id: "content.write" }, { id: "policy.edit" }];

type Answer = { readonly status: number; readonly instructions?: string };

/** One Happy Cloud server: its permission answer and the instructions route's answers, in order. */
function server(permissions: unknown, answers: Answer[]) {
    const sent: string[] = [];
    let last: Answer = { status: 200, instructions: "" };
    const client = {
        async getInstructions() {
            sent.push("GET v0/config/instructions");
            last = answers.shift() ?? last;
            if (last.status !== 200)
                throw new HappyAgentApiError(
                    last.status,
                    `Refused with ${last.status}.`,
                    null,
                    null,
                );
            return { instructions: last.instructions ?? "" };
        },
        async putInstructions(instructions: string) {
            sent.push("PUT v0/config/instructions");
            return { instructions };
        },
    };
    const request = async (method: string, path: string) => {
        sent.push(`${method} ${path}`);
        return permissions;
    };
    return { client, request, sent };
}

describe("global instructions on Happy Cloud", () => {
    let store: HappyAgentInstructionsStore | undefined;
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        store?.[Symbol.dispose]();
        store = undefined;
        vi.useRealTimers();
    });

    const open = async (fake: ReturnType<typeof server>) => {
        store = happyAgentInstructionsStoreCreate({
            client: fake.client as never,
            access: happyAgentPolicyAccessRead(fake.request),
        });
        store.subscribe(() => undefined);
        await vi.advanceTimersByTimeAsync(0);
        return store;
    };

    it("lets an owner edit where the catalog lists policy.edit", async () => {
        const fake = server({ granted: ["policy.edit"], permissions: CATALOG }, [
            { status: 200, instructions: "Be kind." },
        ]);
        const opened = await open(fake);
        expect(opened.get().access).toBe("edit");
        expect(opened.get().stored).toEqual({ type: "ready", value: "Be kind." });
    });

    it("shows a member the documents read-only where the catalog lists policy.edit", async () => {
        const fake = server({ granted: ["content.write"], permissions: CATALOG }, [
            { status: 200, instructions: "Be kind." },
        ]);
        const opened = await open(fake);
        expect(opened.get().access).toBe("read");
        expect(opened.get().stored).toEqual({ type: "ready", value: "Be kind." });
    });

    describe("on a server whose catalog does not list policy.edit", () => {
        const unlisted = { granted: ["content.write"], permissions: [{ id: "content.write" }] };

        it("lets the routes decide: an owner's read and write go through as before", async () => {
            const fake = server(unlisted, [{ status: 200, instructions: "Be kind." }]);
            const opened = await open(fake);
            expect(opened.get().access).toBe("edit");
            expect(opened.get().stored).toEqual({ type: "ready", value: "Be kind." });
            opened.draftUpdate("Be kinder.");
            opened.save();
            await vi.advanceTimersByTimeAsync(0);
            expect(opened.get().stored).toEqual({ type: "ready", value: "Be kinder." });
            expect(fake.sent).toContain("PUT v0/config/instructions");
        });

        it("shows a reader the route refuses its refusal, as before, and keeps asking", async () => {
            const fake = server(unlisted, [{ status: 403 }]);
            const opened = await open(fake);
            const snapshot = opened.get();
            expect(snapshot.access).not.toBe("unserved");
            expect(snapshot.stored.type).toBe("error");
            await vi.advanceTimersByTimeAsync(4_000);
            expect(fake.sent.filter((line) => line === "GET v0/config/instructions")).toHaveLength(
                2,
            );
        });

        it("leaves the documents out only when the route itself is missing", async () => {
            const fake = server(unlisted, [{ status: 404 }]);
            const opened = await open(fake);
            expect(opened.get().access).toBe("unserved");
            await vi.advanceTimersByTimeAsync(20_000);
            expect(fake.sent).toEqual(["GET v0/permissions", "GET v0/config/instructions"]);
        });
    });

    it("keeps an error, not unserved, when a server listing policy.edit answers 404", async () => {
        const fake = server({ granted: ["policy.edit"], permissions: CATALOG }, [{ status: 404 }]);
        const opened = await open(fake);
        expect(opened.get().access).not.toBe("unserved");
        expect(opened.get().stored.type).toBe("error");
    });
});

describe("global instructions on a local Happy Agent", () => {
    it("edits without asking for permissions", async () => {
        const fake = server(undefined, [{ status: 200, instructions: "Be kind." }]);
        const store = happyAgentInstructionsStoreCreate({ client: fake.client as never });
        expect(store.get().access).toBe("edit");
        const unsubscribe = store.subscribe(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(store.get().stored).toEqual({ type: "ready", value: "Be kind." });
        expect(fake.sent).toEqual(["GET v0/config/instructions"]);
        unsubscribe();
        store[Symbol.dispose]();
    });
});
