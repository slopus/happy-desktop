import { useState, type ReactNode } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./styles.css";
import { AppShell } from "./AppShell";
import { ConnectionShell } from "./ConnectionShell";
import { ConnectionSurface } from "./ConnectionSurface";
import { FileModal } from "./FileModal";
import { ModalOverlay } from "./ModalOverlay";
import { WindowCover, WindowOverlay } from "./WindowOverlay";
import { createRenderer } from "./testing";

function FileWindow(props: {
    width: number;
    height: number;
    contained: boolean;
    events: string[];
}) {
    const [open, setOpen] = useState(true);
    const close = (event: string) => {
        props.events.push(event);
        setOpen(false);
    };
    const surface = (children: ReactNode) =>
        props.contained ? (
            <ConnectionSurface active>{children}</ConnectionSurface>
        ) : (
            <div style={{ display: "flex", flex: 1 }}>{children}</div>
        );
    return (
        <div
            data-testid="window"
            style={{
                display: "flex",
                position: "relative",
                transform: "translateZ(0)",
                width: props.width,
                height: props.height,
            }}
        >
            <ConnectionShell
                items={[{ id: "local", label: "This computer", local: true, status: "connected" }]}
                onSelect={() => props.events.push("connection")}
                selectedId="local"
            >
                {surface(
                    <AppShell>
                        <button onClick={() => setOpen(true)}>Open file</button>
                        {open ? (
                            <WindowOverlay>
                                <WindowCover>
                                    <ModalOverlay onDismiss={() => close("dismiss")}>
                                        <FileModal
                                            onBesideOpen={() => close("beside")}
                                            onClose={() => close("close")}
                                            onReveal={() => props.events.push("reveal")}
                                            path="drive-notes.md"
                                        >
                                            <p>Drive notes</p>
                                        </FileModal>
                                    </ModalOverlay>
                                </WindowCover>
                            </WindowOverlay>
                        ) : null}
                    </AppShell>,
                )}
            </ConnectionShell>
        </div>
    );
}

for (const size of [
    { width: 1360, height: 860 },
    { width: 720, height: 640 },
]) {
    for (const contained of [false, true]) {
        it(`covers the rail and keeps file actions inside ${size.width}×${size.height}, contained=${contained}`, async () => {
            const events: string[] = [];
            const view = createRenderer();
            view.render(() => <FileWindow {...size} contained={contained} events={events} />, {
                width: size.width + 80,
                height: size.height + 80,
                padding: 40,
            });
            await view.ready();
            const window = view.$('[data-testid="window"]').element;
            const overlay = view.$('[data-happy-desktop-ui="modal-overlay"]').element;
            const card = view.$('[data-happy-desktop-ui="file-modal"]').element;
            const frame = window.getBoundingClientRect();
            const backdrop = overlay.getBoundingClientRect();
            const file = card.getBoundingClientRect();
            expect(getComputedStyle(card).fontFamily).toBe(
                getComputedStyle(card.querySelector("button")!).fontFamily,
            );
            expect([backdrop.left, backdrop.top, backdrop.right, backdrop.bottom]).toEqual([
                frame.left,
                frame.top,
                frame.right,
                frame.bottom,
            ]);
            expect(getComputedStyle(overlay).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
            expect(file.left).toBeGreaterThanOrEqual(frame.left + 24);
            expect(file.top).toBeGreaterThanOrEqual(frame.top + 24);
            expect(file.right).toBeLessThanOrEqual(frame.right - 24);
            expect(file.bottom).toBeLessThanOrEqual(frame.bottom - 24);
            for (const button of card.querySelectorAll("button")) {
                const bounds = button.getBoundingClientRect();
                expect(bounds.left).toBeGreaterThanOrEqual(file.left);
                expect(bounds.right).toBeLessThanOrEqual(file.right);
                expect(
                    button.contains(
                        document.elementFromPoint(
                            (bounds.left + bounds.right) / 2,
                            (bounds.top + bounds.bottom) / 2,
                        ),
                    ),
                ).toBe(true);
            }
            // This point used to reach Home through the light strip. The dim
            // now receives it, dismissing the file without selecting a connection.
            expect(document.elementFromPoint(frame.left + 12, frame.top + 66)).toBe(overlay);
            await userEvent.click(overlay, { position: { x: 12, y: 66 } });
            expect(events).toEqual(["dismiss"]);
            expect(view.container.querySelector('[data-happy-desktop-ui="file-modal"]')).toBeNull();
        });
    }
}
