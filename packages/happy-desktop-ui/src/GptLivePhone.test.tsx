import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { gptLiveStoreCreate, type GptLiveRuntimeEvent } from "happy-desktop-state";
import { GptLivePhone } from "./GptLivePhone";
import { SidebarFooter } from "./SidebarFooter";
import { createRenderer } from "./testing";
import "./styles.css";

it("starts only on trusted click and keeps the existing composer without a draft dialog", async () => {
    let receive: (event: GptLiveRuntimeEvent) => void = () => {};
    const open = vi.fn(async (_input, listener) => {
        receive = listener;
        return {
            close: () => {},
            microphoneMutedUpdate: () => {},
        };
    });
    const store = gptLiveStoreCreate(undefined, {
        availabilityRead: async () => ({
            supported: true,
            accounts: [{ id: "codex", providerId: "codex", kind: "subscription", label: "Codex" }],
        }),
        callOpen: open,
    });
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
                    appearance="light"
                    onAppearanceToggle={() => {}}
                    onSettingsOpen={() => {}}
                    voice={
                        state.gptLiveEnabled ? (
                            <GptLivePhone
                                state={state}
                                onStart={store.callStart}
                                onEnd={store.callEnd}
                            />
                        ) : undefined
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
        store.availabilityRead();
        await expect.poll(() => store.get().availability?.supported).toBe(true);
        store.accountSelect("codex");
        await expect
            .poll(() => document.querySelector('[aria-label="Start voice call"]') !== null)
            .toBe(true);
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(2);
        expect(input.selectionEnd).toBe(7);
        const phone = view.$('[aria-label="Start voice call"]').element as HTMLButtonElement;
        phone.click();
        expect(open).not.toHaveBeenCalled();
        await userEvent.click(phone);
        await expect.poll(() => open.mock.calls.length).toBe(1);
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
        expect(view.$('[aria-label="End voice call"]').element).toBe(phone);
        expect(view.$('[aria-label="End voice call"]').bounds().width).toBe(28);
        expect(view.$('[aria-label="End voice call"]').bounds().height).toBe(28);
        const icon = view.$('[data-name="call"]');
        expect(icon.bounds().width).toBe(14);
        expect(icon.bounds().height).toBe(14);
        expect((await icon.visibleMetrics()).pixelCount).toBeGreaterThan(0);
        expect(
            view.$('[aria-label="Settings"]').bounds().x -
                view.$('[aria-label="End voice call"]').bounds().x -
                28,
        ).toBe(4);
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
    } finally {
        view.destroy();
        store[Symbol.dispose]();
    }
    expect(subscriptions).toBe(0);
});
