import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import {
    appearanceStoreCreate,
    experimentsStoreCreate,
    gptLiveStoreCreate,
    happyAgentSettingsStoreCreate,
} from "happy-desktop-state";
import { AppHappyAgentSettingsView } from "../../happy-desktop-app/sources/views/AppHappyAgentSettingsView";
import { AppGptLiveSurface } from "../../happy-desktop-app/sources/gptLive/AppGptLiveSurface";
import "./styles.css";
import { GptLiveSettings } from "./GptLiveSettings";
import { createRenderer } from "./testing";

it("renders the default-off opt-in and preserves switch identity and focus when changed", async () => {
    const store = gptLiveStoreCreate();
    let subscriptions = 0;
    const subscribe = (listener: () => void) => {
        subscriptions++;
        const unsubscribe = store.subscribe(listener);
        return () => {
            subscriptions--;
            unsubscribe();
        };
    };
    function Fixture() {
        const snapshot = useSyncExternalStore(subscribe, store.get, store.get);
        return (
            <GptLiveSettings
                enabled={snapshot.gptLiveEnabled}
                onEnabledChange={store.gptLiveEnabledUpdate}
            />
        );
    }
    const view = createRenderer();
    view.render(() => <Fixture />, { width: 720, height: 340, padding: 24 });
    await view.ready();

    expect(window.devicePixelRatio).toBe(2);
    expect(subscriptions).toBe(1);
    const control = view.$('[role="switch"]').element as HTMLButtonElement;
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(control.getAttribute("aria-label")).toBe("Enable GPT-Live voice");
    const section = view.$('[data-happy-desktop-ui="happy-agent-settings-section"]');
    expect(section.element.textContent).toContain(
        "Choose an account, then explicitly start a call",
    );
    expect(section.element.textContent).toContain("Running tasks are unaffected");
    expect(section.computedStyle("display")).toBe("flex");
    expect(section.computedStyle("gap")).toBe("12px");
    expect(section.bounds().width).toBe(672);
    const row = view.$('[data-happy-desktop-ui="form-row"]');
    const switchBox = view.$('[role="switch"]').bounds();
    expect(switchBox.width).toBe(28);
    expect(switchBox.height).toBe(16);
    expect(switchBox.x + switchBox.width).toBe(row.bounds().x + row.bounds().width);
    const label = view.$('[data-happy-desktop-ui="form-row-label"]');
    expect(label.computedStyle("font-size")).toBe("13px");
    expect(label.computedStyle("line-height")).toBe("20px");
    expect(label.computedStyle("color")).toBe("rgb(0, 0, 0)");
    const ink = await label.visibleMetrics();
    expect(ink.pixelCount).toBeGreaterThan(0);
    expect(ink.bounds.x).toBeGreaterThanOrEqual(0);
    expect(ink.bounds.y).toBeGreaterThanOrEqual(0);
    expect(ink.bounds.y + ink.bounds.height).toBeLessThanOrEqual(label.bounds().height);
    await view.screenshot("GptLiveSettings.off.test");

    await userEvent.click(control);
    await expect.poll(() => control.getAttribute("aria-checked")).toBe("true");
    expect(view.$('[role="switch"]').element).toBe(control);
    expect(document.activeElement).toBe(control);
    expect(subscriptions).toBe(1);
    expect(store.get().gptLiveEnabled).toBe(true);
    // The shared switch animates its thumb; measure the settled on state.
    await expect
        .poll(
            () =>
                view.$('[data-happy-desktop-ui="switch-thumb"]').bounds().x -
                view.$('[data-happy-desktop-ui="switch-track"]').bounds().x,
        )
        .toBe(14);
    await view.screenshot("GptLiveSettings.on.test");
    await userEvent.keyboard(" ");
    await expect.poll(() => control.getAttribute("aria-checked")).toBe("false");
    expect(store.get().gptLiveEnabled).toBe(false);
    expect(document.activeElement).toBe(control);
    view.destroy();
    expect(subscriptions).toBe(0);
});

it("hides the entire Experimental category until enabled and shows Voice only in that category", async () => {
    const experiments = experimentsStoreCreate();
    // A previously enabled voice preference must not expose the gated footer.
    const voice = gptLiveStoreCreate({ read: () => ({ gptLiveEnabled: true }), write: () => {} });
    const appearance = appearanceStoreCreate();
    const settings = happyAgentSettingsStoreCreate();
    const directorySnapshot = { happyAgents: [] };
    const directory = {
        get: () => directorySnapshot,
        subscribe: () => () => {},
        happyAgentActivate: () => {},
    };
    let route = "general";
    const listeners = new Set<() => void>();
    const routeSubscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    };
    function Fixture() {
        const section = useSyncExternalStore(
            routeSubscribe,
            () => route,
            () => route,
        );
        return (
            <AppGptLiveSurface store={voice} experiments={experiments}>
                <AppHappyAgentSettingsView
                    appearance={appearance}
                    experiments={experiments}
                    gptLive={voice}
                    happyAgents={directory}
                    onCategorySelect={(next) => {
                        route = next;
                        for (const listener of listeners) listener();
                    }}
                    onClose={() => {}}
                    section={section}
                    settings={settings}
                />
            </AppGptLiveSurface>
        );
    }
    const view = createRenderer();
    view.render(() => <Fixture />, { width: 1100, height: 800, padding: 0 });
    const category = (name: string) =>
        [
            ...document.querySelectorAll<HTMLButtonElement>(
                '[data-happy-desktop-ui="sidebar"] button',
            ),
        ].find(
            (node) =>
                node.querySelector('[data-happy-desktop-ui="sidebar-item-label"]')?.textContent ===
                name,
        );
    try {
        await view.ready();
        expect(category("Experimental")).toBeUndefined();
        expect(document.querySelector('[aria-label="Enable GPT-Live voice"]')).toBeNull();
        expect(document.querySelector(".happy-gpt-live__bar")).toBeNull();
        await view.screenshot("GptLiveSettings.experimental-hidden.test");
        const control = view.$('[aria-label="Enable experimental features"]').element;
        await userEvent.click(control);
        await expect.poll(() => category("Experimental") !== undefined).toBe(true);
        expect(document.querySelector('[aria-label="Enable GPT-Live voice"]')).toBeNull();
        await expect
            .poll(() => {
                const thumb = control
                    .querySelector('[data-happy-desktop-ui="switch-thumb"]')!
                    .getBoundingClientRect();
                const track = control
                    .querySelector('[data-happy-desktop-ui="switch-track"]')!
                    .getBoundingClientRect();
                return Math.round(thumb.x - track.x);
            })
            .toBe(14);
        await view.screenshot("GptLiveSettings.experimental-revealed.test");
        await userEvent.click(category("Experimental")!);
        await expect
            .poll(() => document.querySelector('[aria-label="Enable GPT-Live voice"]') !== null)
            .toBe(true);
        expect(
            view.$('[data-happy-desktop-ui="happy-agent-settings-heading-title"]').element
                .textContent,
        ).toBe("Experimental");
        await view.screenshot("GptLiveSettings.experimental-voice.test");
        await userEvent.click(category("General")!);
        await userEvent.click(view.$('[aria-label="Enable experimental features"]').element);
        await expect.poll(() => category("Experimental") === undefined).toBe(true);
        expect(document.querySelector(".happy-gpt-live__bar")).toBeNull();
        expect(document.querySelector('[aria-label="Enable GPT-Live voice"]')).toBeNull();
    } finally {
        view.destroy();
        voice[Symbol.dispose]();
        appearance[Symbol.dispose]();
    }
});
