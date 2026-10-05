import { useSyncExternalStore } from "react";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { gptLiveStoreCreate, type GptLiveRuntimeEvent } from "happy-desktop-state";
import { gptLiveRuntimeFixtureCreate } from "../../happy-desktop-state/src/gptLive/testing/gptLiveRuntimeFixture";
import { GptLiveSurface } from "./GptLiveSurface";
import { createRenderer } from "./testing";
import "./styles.css";

it("keeps application identity/focus stable and requires an explicit exact-text send", async () => {
    let receive: (event: GptLiveRuntimeEvent) => void = () => {};
    const confirm = vi.fn(async () => {});
    const store = gptLiveStoreCreate(undefined, {
        availabilityRead: async () => ({
            supported: true,
            accounts: [
                {
                    id: "subscription",
                    label: "Subscription account",
                    providerId: "codex",
                    kind: "subscription",
                },
            ],
        }),
        callOpen: async (_input, listener) => {
            receive = listener;
            return {
                close: () => {},
                microphoneMutedUpdate: () => {},
                messageConfirm: confirm,
                messageCancel: () => {},
            };
        },
    });
    let subscriptions = 0;
    let mounts = 0;
    const mounted = (node: HTMLInputElement | null) => {
        if (node) mounts++;
    };
    const subscribe = (listener: () => void) => {
        subscriptions++;
        const stop = store.subscribe(listener);
        return () => {
            subscriptions--;
            stop();
        };
    };
    function Fixture() {
        const state = useSyncExternalStore(subscribe, store.get, store.get);
        return (
            <GptLiveSurface
                state={state}
                onOpen={store.panelOpen}
                onClose={store.panelClose}
                onStart={store.callStart}
                onEnd={store.callEnd}
                onAccountSelect={store.accountSelect}
                onMutedChange={store.microphoneMutedUpdate}
                onMessageConfirm={store.messageConfirm}
                onMessageCancel={store.messageCancel}
            >
                <input
                    aria-label="Existing composer"
                    defaultValue="Keep my text"
                    ref={mounted}
                    style={{ alignSelf: "flex-start" }}
                />
            </GptLiveSurface>
        );
    }
    const view = createRenderer();
    // The shared overlay is fixed to its real desktop window. Bound that window
    // inside the screenshot fixture, as the ModalOverlay fixtures do.
    view.render(
        () => (
            <div
                data-testid="voice-window"
                style={{
                    display: "flex",
                    width: 900,
                    height: 700,
                    position: "relative",
                    transform: "translateZ(0)",
                    overflow: "hidden",
                }}
            >
                <Fixture />
            </div>
        ),
        { width: 900, height: 700, padding: 0 },
    );
    await view.ready();
    const input = view.$('input[aria-label="Existing composer"]').element as HTMLInputElement;
    input.focus();
    input.setSelectionRange(2, 7);
    store.gptLiveEnabledUpdate(true);
    await expect.poll(() => document.querySelector(".happy-gpt-live__bar") !== null).toBe(true);
    expect(view.$('input[aria-label="Existing composer"]').element).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(7);
    expect(mounts).toBe(1);
    expect(subscriptions).toBe(1);
    expect(view.$(".happy-gpt-live__bar").computedStyle("display")).toBe("flex");
    expect(view.$(".happy-gpt-live__bar").bounds().height).toBeGreaterThanOrEqual(48);
    await view.screenshot("GptLiveSurface.bar.test");
    const button = (text: string) =>
        [...document.querySelectorAll("button")].find((node) => node.textContent === text)!;
    await userEvent.click(button("Open voice"));
    await expect.poll(() => store.get().availability?.supported).toBe(true);
    store.accountSelect("subscription");
    await expect.poll(() => button("Start voice call")?.disabled).toBe(false);
    await userEvent.click(button("Start voice call"));
    await expect.poll(() => store.get().status).toBe("connecting");
    receive({ type: "callActive" });
    receive({
        type: "messageConfirmationRequested",
        request: {
            actionId: "action-exact",
            connectionLabel: "Development machine",
            targetLabel: "Review changes",
            modeLabel: "Auto",
            text: "Please review this exact message.",
        },
    });
    await expect.poll(() => button("Send this message") !== undefined).toBe(true);
    const send = button("Send this message");
    expect(document.activeElement).not.toBe(send);
    expect(document.body.textContent).toContain("Development machine");
    expect(document.body.textContent).toContain("Please review this exact message.");
    const modal = view.$('[data-happy-desktop-ui="modal-dialog"]').bounds();
    const frame = view.$('[data-testid="voice-window"]').bounds();
    expect(modal.x).toBeGreaterThanOrEqual(frame.x);
    expect(modal.y).toBeGreaterThanOrEqual(frame.y);
    expect(modal.x + modal.width).toBeLessThanOrEqual(frame.x + frame.width);
    expect(modal.y + modal.height).toBeLessThanOrEqual(frame.y + frame.height);
    send.focus();
    await userEvent.keyboard("{Enter}");
    expect(confirm).not.toHaveBeenCalled();
    await view.screenshot("GptLiveSurface.confirmation.test");
    await userEvent.click(send);
    await expect.poll(() => confirm.mock.calls.length).toBe(1);
    expect(confirm).toHaveBeenCalledWith("action-exact");
    expect(view.$('input[aria-label="Existing composer"]').element).toBe(input);
    expect(input.value).toBe("Keep my text");
    expect(mounts).toBe(1);
    view.destroy();
    store[Symbol.dispose]();
    expect(subscriptions).toBe(0);
});

it("drives the real call runtime through trusted Start, typed control, mute, and bounded End", async () => {
    const f = gptLiveRuntimeFixtureCreate();
    const store = gptLiveStoreCreate(undefined, f.runtime);
    function Fixture() {
        const state = useSyncExternalStore(store.subscribe, store.get, store.get);
        return (
            <GptLiveSurface
                state={state}
                onOpen={store.panelOpen}
                onClose={store.panelClose}
                onStart={store.callStart}
                onEnd={store.callEnd}
                onAccountSelect={store.accountSelect}
                onMutedChange={store.microphoneMutedUpdate}
                onMessageConfirm={store.messageConfirm}
                onMessageCancel={store.messageCancel}
            >
                <input aria-label="Runtime composer" defaultValue="Keep this task" />
            </GptLiveSurface>
        );
    }
    const view = createRenderer();
    view.render(
        () => (
            <div
                style={{
                    display: "flex",
                    width: 900,
                    height: 700,
                    transform: "translateZ(0)",
                    overflow: "hidden",
                }}
            >
                <Fixture />
            </div>
        ),
        { width: 900, height: 700, padding: 0 },
    );
    try {
        await view.ready();
        expect(f.daemon.calls).toHaveLength(0);
        expect(f.stats.permissionStarts).toBe(0);
        expect(f.stats.subscriptions).toBe(0);
        const input = view.$('input[aria-label="Runtime composer"]').element;
        const button = (text: string) =>
            [...document.querySelectorAll("button")].find((node) => node.textContent === text)!;
        store.gptLiveEnabledUpdate(true);
        await expect.poll(() => button("Open voice") !== undefined).toBe(true);
        expect(f.daemon.calls).toHaveLength(0);
        await userEvent.click(button("Open voice"));
        await expect.poll(() => store.get().availability?.accounts.length).toBe(2);
        expect(f.stats.permissionStarts).toBe(0);
        expect(button("Start voice call").disabled).toBe(true);
        await userEvent.selectOptions(
            view.$('select[aria-label="GPT-Live voice account"]').element as HTMLSelectElement,
            "codex",
        );
        await expect.poll(() => button("Start voice call").disabled).toBe(false);
        button("Start voice call").click(); // Programmatic clicks are not consent.
        expect(f.stats.permissionStarts).toBe(0);
        await userEvent.click(button("Start voice call"));
        await expect.poll(() => f.stats.socketOpens).toBe(1);
        expect(f.createRequests()).toHaveLength(1);
        expect(f.createRequests()[0]?.credential).toEqual({
            type: "codex_subscription",
            providerId: "codex",
        });
        f.hello();
        f.active();
        await Promise.resolve();
        expect(store.get().status).toBe("connecting");
        f.mediaReady();
        await expect.poll(() => store.get().status).toBe("active");
        expect(f.stats.subscriptions).toBe(1);
        f.frame({
            type: "actionRequested",
            actionId: "browser-state",
            contextRevision: f.createRequests()[0]!.contextRevision,
            inputTranscriptIds: [],
            action: { type: "desktopState" },
        });
        await expect
            .poll(() =>
                f.sent.some(
                    (frame) =>
                        frame.type === "actionResult" &&
                        frame.actionId === "browser-state" &&
                        frame.result.status === "succeeded",
                ),
            )
            .toBe(true);
        f.frame({
            type: "transcript",
            transcriptId: "browser-transcript",
            role: "assistant",
            text: "Your desktop is ready.",
        });
        await expect
            .poll(() => document.body.textContent?.includes("Your desktop is ready."))
            .toBe(true);
        await userEvent.click(button("Mute microphone"));
        expect(f.stats.microphoneMuted).toBe(true);
        expect(view.$('input[aria-label="Runtime composer"]').element).toBe(input);
        const end = [
            ...document.querySelectorAll<HTMLButtonElement>(
                '[data-happy-desktop-ui="modal-dialog"] button',
            ),
        ].find((node) => node.textContent === "End call")!;
        await userEvent.click(end);
        expect(f.stats.mediaSilences).toBe(1);
        expect(f.stats.subscriptions).toBe(0);
        await expect.poll(() => f.closeRequests().length).toBe(1);
        expect(f.order.indexOf("microphone-silenced")).toBeLessThan(f.order.indexOf("close-rpc"));
        expect(f.stats.mediaCloses).toBe(0);
        expect(f.stats.socketCloses).toBe(0);
        f.status("closed");
        await expect.poll(() => f.stats.mediaCloses).toBe(1);
        expect(f.stats.socketCloses).toBe(1);
        expect(store.get().status).toBe("idle");
        expect(f.daemon.callCount("sendAgentMessage")).toBe(0);
        expect(view.$('input[aria-label="Runtime composer"]').element).toBe(input);
    } finally {
        store[Symbol.dispose]();
        view.destroy();
    }
});
