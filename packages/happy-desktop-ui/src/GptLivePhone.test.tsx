import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { gptLiveStoreCreate, type GptLiveRuntimeEvent } from "happy-desktop-state";
import { DevBuildMenu } from "./DevBuildMenu";
import { GptLiveCallBar } from "./GptLiveCallBar";
import { GptLivePhone } from "./GptLivePhone";
import { SidebarFooter } from "./SidebarFooter";
import { createRenderer } from "./testing";
import "./styles.css";

it("starts only on trusted click, hangs up in the phone's own slot without moving a button, and keeps the existing composer", async () => {
    let receive: (event: GptLiveRuntimeEvent) => void = () => {};
    const open = vi.fn(async (_input, listener) => {
        receive = listener;
        return {
            close: async () => {},
            microphoneMutedUpdate: () => {},
            outputLevelsRead: () => [0, 0, 0] as const,
        };
    });
    const store = gptLiveStoreCreate(undefined, () => ({
        availabilityRead: async () => ({
            supported: true,
            accounts: [{ id: "codex", providerId: "codex", kind: "subscription", label: "Codex" }],
        }),
        callOpen: open,
    }));
    let mounts = 0;
    let subscriptions = 0;
    const subscribe = (listener: () => void) => {
        subscriptions++;
        const stop = store.subscribe(listener);
        return () => {
            subscriptions--;
            stop();
        };
    };
    const mounted = (node: HTMLInputElement | null) => {
        if (node) mounts++;
    };
    function Fixture() {
        const state = useSyncExternalStore(subscribe, store.get, store.get);
        const call = state.call;
        // As the app composes them: what the call is doing at the left, and the
        // phone's slot, which hangs up and mutes while a call runs.
        const live = call.kind === "connecting" || call.kind === "active";
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    width: 320,
                    height: 400,
                }}
            >
                <input aria-label="Existing composer" defaultValue="Keep my text" ref={mounted} />
                <SidebarFooter
                    call={
                        call.kind === "active" ? (
                            <GptLiveCallBar since={call.since} state="active" />
                        ) : call.kind === "connecting" ? (
                            <GptLiveCallBar state="connecting" />
                        ) : undefined
                    }
                    // A long branch name fills the row with no call; it must
                    // truncate rather than squeeze the phone out of its box.
                    devMenu={
                        <DevBuildMenu branch="feature/a-long-branch-name-that-has-to-truncate" />
                    }
                    onSettingsOpen={() => {}}
                    voice={
                        !state.gptLiveEnabled ? undefined : live ? (
                            <GptLivePhone
                                muted={call.muted}
                                onEnd={store.callEnd}
                                onMutedChange={store.microphoneMutedUpdate}
                                status={call.kind}
                            />
                        ) : (
                            <GptLivePhone
                                onStart={() => store.callStart("local")}
                                status={call.kind === "ended" ? "ended" : "idle"}
                            />
                        )
                    }
                />
            </div>
        );
    }
    const view = createRenderer();
    view.render(() => <Fixture />, { width: 320, height: 400, padding: 0 });
    try {
        await view.ready();
        const input = view.$("input").element as HTMLInputElement;
        input.focus();
        input.setSelectionRange(2, 7);
        store.gptLiveEnabledUpdate(true);
        store.availabilityRead("local");
        await expect.poll(() => store.get().availability.get("local")?.status).toBe("ready");
        store.accountSelect("local", "codex");
        await expect
            .poll(() => document.querySelector('[aria-label="Start voice call"]') !== null)
            .toBe(true);
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(2);
        expect(input.selectionEnd).toBe(7);
        const phone = view.$('[aria-label="Start voice call"]').element as HTMLButtonElement;
        expect(view.$('[aria-label="Start voice call"]').bounds().width).toBe(28);
        expect(view.$('[aria-label="Start voice call"]').bounds().height).toBe(28);
        const icon = view.$('[data-name="call"]');
        expect(icon.bounds().width).toBe(14);
        expect(icon.bounds().height).toBe(14);
        expect((await icon.visibleMetrics()).pixelCount).toBeGreaterThan(0);
        // No theme or keep-awake menu in this footer, so the phone sits 4px from Settings.
        expect(
            view.$('[aria-label="Settings"]').bounds().x -
                view.$('[aria-label="Start voice call"]').bounds().x -
                28,
        ).toBe(4);
        // Every button's box, which no state may move.
        const box = (label: string) => {
            const bounds = view.$(`[aria-label="${label}"]`).bounds();
            return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        };
        const phoneBox = box("Start voice call");
        const settingsBox = box("Settings");
        const muteBox = { ...phoneBox, x: phoneBox.x - 28 - 4 };
        phone.click();
        expect(open).not.toHaveBeenCalled();
        await userEvent.click(phone);
        await expect.poll(() => open.mock.calls.length).toBe(1);
        // Connecting: the phone's slot cancels, mute appears before it, nothing moves.
        await expect
            .poll(() => document.querySelector('[aria-label="Cancel voice call"]') !== null)
            .toBe(true);
        expect(box("Cancel voice call")).toEqual(phoneBox);
        expect(box("Mute microphone")).toEqual(muteBox);
        expect(box("Settings")).toEqual(settingsBox);
        receive({ type: "callActive" });
        receive({
            type: "actionStatusUpdated",
            message: "Review the draft in the conversation composer.",
        });
        await expect
            .poll(() => document.querySelector('[aria-label="End voice call"]') !== null)
            .toBe(true);
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(view.$("input").element).toBe(input);
        expect(input.value).toBe("Keep my text");
        expect(mounts).toBe(1);
        expect(subscriptions).toBe(1);
        // Live: hang-up is the phone's own box, mute just before it, and the
        // call's length at the left moves neither.
        expect(box("End voice call")).toEqual(phoneBox);
        expect(box("Mute microphone")).toEqual(muteBox);
        expect(box("Settings")).toEqual(settingsBox);
        expect(document.querySelector(".happy-gpt-live-call__time")).not.toBeNull();
        await userEvent.click(view.$('[aria-label="Mute microphone"]').element);
        await expect
            .poll(() => store.get().call.kind === "active" && store.get().call)
            .toMatchObject({ muted: true });
        expect(box("Unmute microphone")).toEqual(muteBox);
        expect(box("End voice call")).toEqual(phoneBox);
        expect(box("Settings")).toEqual(settingsBox);
        input.focus();
        input.setSelectionRange(2, 7);
        receive({
            type: "transcriptReceived",
            fragment: { id: "one", role: "assistant", text: "Ready." },
        });
        await expect.poll(() => store.get().transcripts.length).toBe(1);
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(2);
        expect(input.selectionEnd).toBe(7);
        expect(view.$("input").element).toBe(input);
        await view.screenshot("GptLivePhone.composer.test");
        // The hang-up handset paints in the phone glyph's own 14px box.
        const handset = view.$('[data-name="call-end"]');
        expect(handset.bounds().width).toBe(14);
        expect(handset.bounds().height).toBe(14);
        expect((await handset.visibleMetrics()).pixelCount).toBeGreaterThan(0);
        // Hung up, the phone is back in the very same box.
        await userEvent.click(view.$('[aria-label="End voice call"]').element);
        await expect
            .poll(() => document.querySelector('[aria-label="Start voice call"]') !== null)
            .toBe(true);
        expect(document.querySelector('[aria-label="Unmute microphone"]')).toBeNull();
        expect(box("Start voice call")).toEqual(phoneBox);
        expect(box("Settings")).toEqual(settingsBox);
    } finally {
        view.destroy();
        store[Symbol.dispose]();
    }
    expect(subscriptions).toBe(0);
});
