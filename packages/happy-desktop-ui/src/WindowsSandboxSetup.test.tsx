import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/scrollbar.css";
import "./styles/setup-page.css";
import "./styles/onboarding-sky.css";
import "./styles/onboarding-steps.css";
import "./styles/segmented-progress.css";
import "./styles/window-chrome.css";
import "./styles/title-bar.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import "./styles/windows-sandbox-setup.css";
import { WindowsSandboxSetup, type WindowsSandboxSetupState } from "./WindowsSandboxSetup";
import { createRenderer } from "./testing";

it("keeps the onboarding page and button still while Windows setup waits or needs another attempt", async () => {
    let state: WindowsSandboxSetupState = "before";
    let continued = 0;
    const listeners = new Set<() => void>();
    const publish = (next: WindowsSandboxSetupState) => {
        state = next;
        flushSync(() => {
            for (const listener of listeners) listener();
        });
    };
    function Fixture() {
        const current = useSyncExternalStore(
            (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            () => state,
        );
        return (
            <div
                data-testid="frame"
                style={{ width: 720, height: 640, transform: "translateZ(0)" }}
            >
                <WindowsSandboxSetup
                    appearance="light"
                    state={current}
                    onContinue={() => {
                        continued += 1;
                        publish("waiting");
                    }}
                />
            </div>
        );
    }
    const view = createRenderer();
    view.render(() => <Fixture />, { width: 720, height: 640, padding: 0 });
    await view.ready();
    const screen = view.$('[data-testid="windows-sandbox-setup"]').element;
    const action = screen.querySelector<HTMLButtonElement>('button[data-variant="primary"]')!;
    const diagram = view.$(".happy-windows-sandbox__diagram");
    const bounds = action.getBoundingClientRect().toJSON();
    const frame = view.$('[data-testid="frame"]').element.getBoundingClientRect();
    expect(window.devicePixelRatio).toBe(2);
    expect(bounds.width).toBe(240);
    expect(bounds.height).toBe(44);
    expect(bounds.x - frame.x).toBe(240);
    expect(bounds.y - frame.y).toBe(520);
    expect(screen.querySelector("h1")!.getBoundingClientRect().top - frame.top).toBe(280);
    expect(getComputedStyle(diagram.element).display).toBe("flex");
    expect(getComputedStyle(diagram.element).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(screen.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.textContent).toContain("Anything riskier gets checked first.");
    const steps = screen.querySelector('[data-happy-desktop-ui="onboarding-steps"]')!.textContent!;
    expect(steps.indexOf("Subscriptions")).toBeLessThan(steps.indexOf("Sandbox"));
    expect(steps.indexOf("Sandbox")).toBeLessThan(steps.indexOf("Get Mobile App"));
    expect(screen.querySelectorAll("button")).toHaveLength(1);
    expect(continued).toBe(0);
    expect((await diagram.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const glyph = view.$(".happy-windows-sandbox__private [data-happy-desktop-ui=vector-icon]");
    expect(glyph.width()).toBe(24);
    expect(glyph.height()).toBe(24);
    expect((await glyph.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    await userEvent.click(action);
    expect(continued).toBe(1);
    expect(action.disabled).toBe(true);
    expect(screen.querySelector('[role="status"]')?.textContent).toBe("Waiting for Windows…");
    publish("unfinished");
    expect(screen.querySelector('[role="status"]')?.textContent).toBe(
        "That didn’t finish. Try again?",
    );
    expect(action.textContent).toBe("Set up");
    expect(action.disabled).toBe(false);
    expect(view.$('[data-testid="windows-sandbox-setup"]').element).toBe(screen);
    expect(action.getBoundingClientRect().toJSON()).toEqual(bounds);
    await userEvent.click(action);
    expect(continued).toBe(2);
    expect(action.disabled).toBe(true);
    expect(action.getBoundingClientRect().toJSON()).toEqual(bounds);
});
