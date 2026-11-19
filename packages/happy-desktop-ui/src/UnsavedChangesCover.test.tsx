import { useState, type ReactNode } from "react";
import { expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import "./styles.css";
import { AppShell } from "./AppShell";
import { Button } from "./Button";
import { ConnectionShell } from "./ConnectionShell";
import { ConnectionSurface } from "./ConnectionSurface";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { WindowCover, WindowOverlay } from "./WindowOverlay";
import { createRenderer } from "./testing";

/*
 * The "Save changes?" question the editor asks over a dirty file, hosted the way
 * the application hosts it: a WindowCover inside the connection's surface, so
 * the dim reaches the connection rail. Without the cover it stays in the shell
 * and the rail (the avatar and "+" tiles) is left lit and clickable beside it.
 */
function UnsavedWindow(props: { covered: boolean; events: string[] }) {
    const [open, setOpen] = useState(false);
    const cancel = () => {
        props.events.push("cancel");
        setOpen(false);
    };
    const dialog = (
        <ModalOverlay onDismiss={cancel}>
            <Modal
                title="Save changes?"
                size="small"
                onClose={cancel}
                footer={
                    <>
                        <Button onClick={cancel} variant="ghost">
                            Cancel
                        </Button>
                        <Button onClick={() => props.events.push("discard")} variant="danger">
                            Discard
                        </Button>
                        <Button onClick={() => props.events.push("save")}>Save and close</Button>
                    </>
                }
            >
                <p>Your changes to notes.md have not been saved.</p>
            </Modal>
        </ModalOverlay>
    );
    const surface: ReactNode = (
        <ConnectionSurface active>
            <AppShell>
                <button data-testid="editor" onClick={() => setOpen(true)}>
                    Close file
                </button>
                <input aria-label="Behind" data-testid="behind" />
                {open ? (
                    <WindowOverlay>
                        {props.covered ? <WindowCover>{dialog}</WindowCover> : dialog}
                    </WindowOverlay>
                ) : null}
            </AppShell>
        </ConnectionSurface>
    );
    return (
        <div
            data-testid="window"
            style={{
                display: "flex",
                position: "relative",
                transform: "translateZ(0)",
                width: 1000,
                height: 640,
            }}
        >
            <ConnectionShell
                add={{ label: "Add connection", onAdd: () => props.events.push("add") }}
                items={[
                    { id: "local", label: "This computer", local: true, status: "connected" },
                    { id: "remote", label: "Neutral Remote", local: false, status: "connected" },
                ]}
                onSelect={(id) => props.events.push(`select:${id}`)}
                selectedId="local"
            >
                {surface}
            </ConnectionShell>
        </div>
    );
}

async function mount(covered: boolean, events: string[]) {
    const view = createRenderer();
    view.render(() => <UnsavedWindow covered={covered} events={events} />, {
        width: 1080,
        height: 720,
        padding: 40,
    });
    await view.ready();
    const editor = view.$('[data-testid="editor"]').element as HTMLButtonElement;
    editor.focus();
    await userEvent.click(editor);
    await view.ready();
    return { view, editor };
}

const railTiles = (root: ParentNode) => [
    ...root.querySelectorAll<HTMLElement>(".happy-connections__rail button"),
];

it("dims the whole window, rail included, when the unsaved question is covered", async () => {
    const events: string[] = [];
    const { view } = await mount(true, events);
    const frame = view.$('[data-testid="window"]').element.getBoundingClientRect();
    const overlay = view.container.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="modal-overlay"]',
    )!;
    const box = overlay.getBoundingClientRect();
    expect([box.left, box.top, box.right, box.bottom]).toEqual([
        frame.left,
        frame.top,
        frame.right,
        frame.bottom,
    ]);
    expect(getComputedStyle(overlay).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");

    const tiles = railTiles(view.container);
    expect(tiles.length).toBeGreaterThanOrEqual(3);
    for (const tile of tiles) {
        const rect = tile.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(box.left);
        expect(rect.right).toBeLessThanOrEqual(box.right);
        const x = (rect.left + rect.right) / 2;
        const y = (rect.top + rect.bottom) / 2;
        // The overlay, not the rail tile, is what a press at the tile reaches.
        expect(document.elementFromPoint(x, y)).toBe(overlay);
    }

    // A press on the avatar or the "+" neither selects nor adds a connection:
    // it lands on the dim, which is Cancel.
    await userEvent.click(overlay, { position: { x: 24, y: 40 } });
    expect(events).toEqual(["cancel"]);
});

it("traps focus in the question and hands it back to the editor on Cancel", async () => {
    const events: string[] = [];
    const { view, editor } = await mount(true, events);
    const overlay = view.container.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="modal-overlay"]',
    )!;
    expect(overlay.contains(document.activeElement)).toBe(true);
    const buttons = [...overlay.querySelectorAll<HTMLButtonElement>("button")].filter(
        (button) => !button.hasAttribute("disabled"),
    );
    for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        expect(
            button.contains(
                document.elementFromPoint(
                    (rect.left + rect.right) / 2,
                    (rect.top + rect.bottom) / 2,
                ),
            ),
        ).toBe(true);
    }
    // Nothing behind the dim, in the editor or the rail, takes a press or focus.
    const behind = view.$('[data-testid="behind"]').element.getBoundingClientRect();
    expect(
        document.elementFromPoint(
            (behind.left + behind.right) / 2,
            (behind.top + behind.bottom) / 2,
        ),
    ).toBe(overlay);
    await userEvent.click(overlay, {
        position: { x: 24, y: 120 },
    });
    expect(events).toEqual(["cancel"]);
    expect(document.activeElement).toBe(editor);
    expect(events.some((event) => event.startsWith("select") || event === "add")).toBe(false);
});

it("answers Discard and Save and close from the covered question", async () => {
    const events: string[] = [];
    const { view } = await mount(true, events);
    const find = (name: string) =>
        [...view.container.querySelectorAll<HTMLButtonElement>("button")].find(
            (button) => button.textContent === name,
        )!;
    await userEvent.click(find("Discard"));
    await userEvent.click(find("Save and close"));
    await userEvent.click(find("Cancel"));
    expect(events).toEqual(["discard", "save", "cancel"]);
});

it("leaves the rail beside an uncovered question, which is what the cover fixes", async () => {
    const { view } = await mount(false, []);
    const overlay = view.container.querySelector<HTMLElement>(
        '[data-happy-desktop-ui="modal-overlay"]',
    )!;
    const tile = railTiles(view.container)[0]!;
    const rect = tile.getBoundingClientRect();
    expect(
        tile.contains(
            document.elementFromPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2),
        ),
    ).toBe(true);
    expect(overlay.getBoundingClientRect().left).toBeGreaterThan(rect.left);
});
