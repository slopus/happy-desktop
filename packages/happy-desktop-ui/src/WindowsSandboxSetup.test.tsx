import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./theme.css";
import "./styles/scrollbar.css";
import "./styles/modal-overlay.css";
import "./styles/modal.css";
import "./styles/button.css";
import "./styles/icon.css";
import "./styles/vector-icon.css";
import "./styles/windows-sandbox-setup.css";
import { WindowsSandboxSetup, type WindowsSandboxSetupState } from "./WindowsSandboxSetup";
import { createRenderer } from "./testing";

it("waits for an explicit click, retains the dialog through decline, and offers one explicit retry", async () => {
    let state: WindowsSandboxSetupState = "explain";
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
    const dialog = view.$('[role="dialog"]').element;
    const action = dialog.querySelector<HTMLButtonElement>('button[data-variant="primary"]')!;
    const diagram = view.$(".happy-windows-sandbox__pc");
    const bounds = dialog.getBoundingClientRect().toJSON();
    const frame = view.$('[data-testid="frame"]').element.getBoundingClientRect();
    expect(window.devicePixelRatio).toBe(2);
    expect(bounds.width).toBe(640);
    expect(bounds.x - frame.x).toBe(40);
    expect(bounds.y - frame.y).toBeGreaterThanOrEqual(24);
    expect(bounds.bottom - frame.y).toBeLessThanOrEqual(616);
    expect(getComputedStyle(diagram.element).display).toBe("flex");
    expect(getComputedStyle(diagram.element).padding).toBe("16px");
    expect(getComputedStyle(diagram.element).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(dialog.textContent).toContain("Happy Sandbox Setup");
    expect(document.activeElement).toBe(action);
    expect(dialog.querySelectorAll("button")).toHaveLength(1);
    expect(continued).toBe(0);
    expect((await diagram.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    const glyph = view.$(".happy-windows-sandbox__private [data-happy-desktop-ui=vector-icon]");
    expect(glyph.width()).toBe(24);
    expect(glyph.height()).toBe(24);
    expect((await glyph.visibleMetrics()).pixelCount).toBeGreaterThan(0);
    await userEvent.click(action);
    expect(continued).toBe(1);
    expect(action.disabled).toBe(true);
    publish("declined");
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("wasn’t set up");
    expect(action.textContent).toBe("Try again");
    expect(action.disabled).toBe(false);
    expect(view.$('[role="dialog"]').element).toBe(dialog);
    expect(dialog.getBoundingClientRect().toJSON()).toEqual(bounds);
    expect(dialog.getAttribute("aria-label")).toBe("Sandbox not set up yet");
    await userEvent.click(action);
    expect(continued).toBe(2);
    expect(action.disabled).toBe(true);
    publish("failed");
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("couldn’t finish");
    expect(action.disabled).toBe(false);
    expect(dialog.getBoundingClientRect().toJSON()).toEqual(bounds);
});
