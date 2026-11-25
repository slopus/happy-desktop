import { afterEach, describe, expect, it, vi } from "vitest";
import type { GptLiveRuntime, GptLiveRuntimeEvent, GptLiveVoiceFocus } from "./gptLiveRuntime";
import { GPT_LIVE_VOICE_FOCUS_MS, gptLiveStoreCreate } from "./gptLiveStore";

const account = { id: "codex", label: "codex", providerId: "codex", kind: "subscription" } as const;

function focus(id: string, sessionId = "session-1"): GptLiveVoiceFocus {
    return {
        id,
        reason: "mention",
        target: { kind: "session", connectionId: "local", groupId: "group-1", sessionId },
    };
}

/** A call that opens at once and hands the test the channel its events arrive on. */
async function activeCall() {
    let receive: ((event: GptLiveRuntimeEvent) => void) | undefined;
    const runtime: GptLiveRuntime = {
        availabilityRead: async () => ({ supported: true, accounts: [account] }),
        callOpen: async (_input, listener) => {
            receive = listener;
            return {
                close: async () => {},
                microphoneMutedUpdate: () => {},
                outputLevelsRead: () => [0, 0, 0] as const,
            };
        },
    };
    const store = gptLiveStoreCreate(
        { read: () => ({ gptLiveEnabled: true, accountIds: { local: "codex" } }), write: () => {} },
        () => runtime,
    );
    // The first Start reads availability, then opens the call.
    store.callStart("local");
    await vi.waitFor(() => expect(receive).toBeDefined());
    return { store, receive: (event: GptLiveRuntimeEvent) => receive!(event) };
}

afterEach(() => vi.useRealTimers());

describe("GPT-Live voice focus", () => {
    it("points only while the call is live, apart from the window's selection", async () => {
        const { store, receive } = await activeCall();
        receive({ type: "voiceFocusUpdated", focus: focus("early") });
        expect(store.get().voiceFocus).toBeUndefined();
        receive({ type: "callActive" });
        receive({ type: "voiceFocusUpdated", focus: focus("first") });
        expect(store.get().voiceFocus?.id).toBe("first");
        const pointed = store.get();
        receive({ type: "voiceFocusUpdated", focus: focus("second", "session-2") });
        expect(store.get().voiceFocus?.target).toMatchObject({ sessionId: "session-2" });
        expect(pointed.voiceFocus?.id).toBe("first");
        receive({ type: "voiceFocusUpdated", focus: null });
        expect(store.get().voiceFocus).toBeUndefined();
        receive({ type: "voiceFocusUpdated", focus: focus("third") });
        store.callEnd();
        expect(store.get().voiceFocus).toBeUndefined();
        expect(store.get().call).toEqual({ kind: "idle" });
        store[Symbol.dispose]();
    });

    it("clears itself after thirty seconds, and an earlier highlight's clock never clears a later one", async () => {
        const { store, receive } = await activeCall();
        receive({ type: "callActive" });
        vi.useFakeTimers();
        receive({ type: "voiceFocusUpdated", focus: focus("first") });
        vi.advanceTimersByTime(GPT_LIVE_VOICE_FOCUS_MS - 1_000);
        receive({ type: "voiceFocusUpdated", focus: focus("second", "session-2") });
        vi.advanceTimersByTime(1_000);
        // The first highlight's thirty seconds are up, but it was replaced.
        expect(store.get().voiceFocus?.id).toBe("second");
        vi.advanceTimersByTime(GPT_LIVE_VOICE_FOCUS_MS - 1_001);
        expect(store.get().voiceFocus?.id).toBe("second");
        vi.advanceTimersByTime(1);
        expect(store.get().voiceFocus).toBeUndefined();
        store[Symbol.dispose]();
    });
});
