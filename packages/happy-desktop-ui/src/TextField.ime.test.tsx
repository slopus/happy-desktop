import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import "./styles.css";
import { HappyAgentCreateTaskPage } from "./HappyAgentCreateTaskPage";
import { HappyAgentProjectCloneDialog } from "./HappyAgentProjectCloneDialog";
import { HappyAgentProjectSettingsDialog } from "./HappyAgentProjectSettingsDialog";
import { SearchField } from "./TitleBar";
import { TextField } from "./TextField";
import { ModalOverlay } from "./ModalOverlay";
import { CommandPalette } from "./CommandPalette";
import { WindowShortcuts } from "./WindowShortcuts";
import { commandShortcut } from "./keyboardShortcut";
import { SidebarUpdateAction } from "./SidebarUpdateAction";
import { DevBuildMenu } from "./DevBuildMenu";
import { Sidebar } from "./Sidebar";
import { StoryEditor } from "./StoryEditor";
import { STORY_DRAFT, fixtureFrameUrl, fixtureSticker } from "../dev/pages/storyFixtures";
import { HappyAgentTodoRow } from "./pages/surfaces/HappyAgentTodoRow";
import { HappyAgentCalendarEventPopover } from "./pages/surfaces/HappyAgentCalendarEventPopover";
import type { HappyAgentCalendarEventId } from "happy-desktop-state";
import { createRenderer } from "./testing";

// Real UI entry points, with local callbacks instead of product stores/network.
// Synthetic composition events verify the DOM contract, not a native OS IME.
const sequences = ["native", "lifecycle", "end-before-keydown", "229-only"] as const;
type Sequence = (typeof sequences)[number];
function composition(input: HTMLElement, type: "compositionstart" | "compositionend") {
    flushSync(() =>
        input.dispatchEvent(new CompositionEvent(type, { bubbles: true, data: "中文" })),
    );
}
function keydown(input: HTMLElement, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        ...init,
    });
    flushSync(() => input.dispatchEvent(event));
    return event;
}
function ime(input: HTMLElement, sequence: Sequence, init: KeyboardEventInit = {}) {
    if (sequence === "lifecycle" || sequence === "end-before-keydown")
        composition(input, "compositionstart");
    if (sequence === "end-before-keydown") composition(input, "compositionend");
    return keydown(input, {
        ...init,
        isComposing: sequence === "native",
        keyCode: sequence === "229-only" || sequence === "end-before-keydown" ? 229 : 13,
    });
}

for (const surface of ["task", "clone", "project-name", "search"] as const) {
    it.each(sequences)(`${surface} does not confirm an IME candidate (%s)`, async (sequence) => {
        const submit = vi.fn();
        const close = vi.fn();
        function Harness() {
            const [value, setValue] = useState("中文草稿");
            if (surface === "task")
                return (
                    <HappyAgentCreateTaskPage
                        name={value}
                        onNameChange={setValue}
                        onSubmit={submit}
                    />
                );
            if (surface === "clone")
                return (
                    <HappyAgentProjectCloneDialog
                        repository={value}
                        onRepositoryChange={setValue}
                        onSubmit={submit}
                        onClose={close}
                    />
                );
            if (surface === "project-name")
                return (
                    <HappyAgentProjectSettingsDialog
                        name="Project"
                        draft={value}
                        onDraftChange={setValue}
                        onSubmit={submit}
                        onClose={close}
                    />
                );
            return <SearchField value={value} onChange={setValue} onSubmit={submit} />;
        }
        const view = createRenderer().render(() => <Harness />, { width: 800, height: 640 });
        await view.ready();
        const input = view.container.querySelector("input:not([type=file])") as HTMLInputElement;
        await userEvent.click(input);
        const event = ime(input, sequence);
        expect(submit).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe("中文草稿");
        expect(view.container.querySelector("input:not([type=file])")).toBe(input);
        composition(input, "compositionend");
        keydown(input);
        expect(submit).toHaveBeenCalledTimes(1);
    });
}

it.each(sequences)("does not dismiss the containing modal on IME Escape (%s)", async (sequence) => {
    const close = vi.fn();
    const view = createRenderer().render(
        () => (
            <ModalOverlay onDismiss={close}>
                <TextField value="中文" />
            </ModalOverlay>
        ),
        { width: 800, height: 640 },
    );
    await view.ready();
    const input = view.container.querySelector("input")!;
    expect(ime(input, sequence, { key: "Escape" }).defaultPrevented).toBe(false);
    expect(close).not.toHaveBeenCalled();
    composition(input, "compositionend");
    keydown(input, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
    "does not run window shortcuts from a composing TextField (multiline=%s)",
    async (multiline) => {
        const run = vi.fn();
        const view = createRenderer().render(
            () => (
                <>
                    <WindowShortcuts
                        actions={[{ shortcut: commandShortcut("Enter", {}, "Meta"), run }]}
                    />
                    <TextField multiline={multiline} value="中文" />
                </>
            ),
            { width: 600, height: 300 },
        );
        await view.ready();
        const input = view.container.querySelector("input,textarea") as HTMLElement;
        input.focus();
        for (const sequence of sequences) {
            expect(ime(input, sequence, { metaKey: true }).defaultPrevented).toBe(false);
            expect(run).not.toHaveBeenCalled();
            composition(input, "compositionend");
        }
        keydown(input, { metaKey: true });
        expect(run).toHaveBeenCalledTimes(1);
    },
);

it("lets document capture listeners see composition without swallowing the event", async () => {
    const view = createRenderer().render(
        () => (
            <>
                <SidebarUpdateAction
                    action="restart"
                    status="downloaded"
                    subject="application"
                    defaultOpen
                    onAction={() => {}}
                />
                <TextField value="中文" />
            </>
        ),
        { width: 600, height: 400 },
    );
    await view.ready();
    const input = view.container.querySelector("input")!;
    input.focus();
    const observe = vi.fn();
    window.addEventListener("keydown", observe);
    try {
        for (const sequence of sequences) {
            expect(ime(input, sequence, { key: "Escape" }).defaultPrevented).toBe(false);
            expect(
                view.container.querySelector(
                    '[data-happy-desktop-ui="sidebar-update-action-panel"]',
                ),
            ).not.toBeNull();
            composition(input, "compositionend");
        }
        expect(observe).toHaveBeenCalledTimes(4);
        keydown(input, { key: "Escape" });
        expect(
            view.container.querySelector('[data-happy-desktop-ui="sidebar-update-action-panel"]'),
        ).toBeNull();
    } finally {
        window.removeEventListener("keydown", observe);
    }
});

it("clears lifecycle on blur and keeps it scoped to the input across roots", async () => {
    const firstSubmit = vi.fn();
    const secondSubmit = vi.fn();
    const first = createRenderer().render(
        () => <TextField value="first" onSubmit={firstSubmit} />,
        { width: 300, height: 150 },
    );
    const second = createRenderer().render(
        () => <TextField value="second" onSubmit={secondSubmit} />,
        { width: 300, height: 150 },
    );
    await first.ready();
    await second.ready();
    const a = first.container.querySelector("input")!;
    const b = second.container.querySelector("input")!;
    a.focus();
    composition(a, "compositionstart");
    expect(keydown(a).defaultPrevented).toBe(false);
    expect(firstSubmit).not.toHaveBeenCalled();
    keydown(b);
    expect(secondSubmit).toHaveBeenCalledTimes(1);
    a.blur();
    a.focus();
    keydown(a);
    expect(firstSubmit).toHaveBeenCalledTimes(1);
});

for (const surface of ["todo", "sidebar-project", "sidebar-section", "story-caption"] as const) {
    it.each(sequences)(`inline ${surface} does not confirm IME input (%s)`, async (sequence) => {
        const submit = vi.fn();
        const cancel = vi.fn();
        const noop = () => {};
        const view = createRenderer().render(
            () => {
                if (surface === "todo")
                    return (
                        <div style={{ display: "flex", height: 48 }}>
                            <HappyAgentTodoRow
                                text="中文"
                                editing="中文"
                                completed={false}
                                onEditCommit={submit}
                                onEditCancel={cancel}
                                onEditTextChange={noop}
                                onEditStart={noop}
                                onDelete={noop}
                                onCompletedChange={noop}
                            />
                        </div>
                    );
                if (surface === "story-caption")
                    return (
                        <StoryEditor
                            story={STORY_DRAFT}
                            frameIndex={0}
                            frameUrl={fixtureFrameUrl}
                            sticker={fixtureSticker}
                            caption="中文"
                            posting={false}
                            roundVideoMaxMs={60000}
                            onCaptionChange={noop}
                            onFrameShow={noop}
                            onRoundVideoRecorded={noop}
                            onRoundVideoTransform={noop}
                            onRoundVideoRemove={noop}
                            onPost={submit}
                            onClose={cancel}
                        />
                    );
                return (
                    <Sidebar
                        activeItemId="item"
                        sections={[
                            {
                                id: "projects",
                                items: [
                                    {
                                        id: "item",
                                        kind: surface === "sidebar-section" ? "section" : "project",
                                        label: "中文",
                                    },
                                ],
                            },
                        ]}
                        itemMenuItems={() => [{ kind: "item", id: "rename", label: "Rename" }]}
                        itemRename={{ actionId: "rename", onSubmit: submit }}
                        onItemSelect={noop}
                    />
                );
            },
            { width: 800, height: 700 },
        );
        await view.ready();
        if (surface.startsWith("sidebar")) {
            const row = view.container.querySelector('[data-item-id="item"]') as HTMLElement;
            flushSync(() =>
                row.dispatchEvent(
                    new MouseEvent("contextmenu", { bubbles: true, clientX: 20, clientY: 30 }),
                ),
            );
            await userEvent.click(
                view.container.querySelector('[role="menuitem"][data-item-id="rename"]')!,
            );
        }
        const input = view.container.querySelector(
            "input:not([type=checkbox]), [contenteditable=plaintext-only]",
        ) as HTMLElement;
        expect(input).not.toBeNull();
        input.focus();
        if (surface.startsWith("sidebar")) input.textContent = "中文名称";
        const event = ime(input, sequence);
        expect(event.defaultPrevented).toBe(false);
        expect(submit).not.toHaveBeenCalled();
        expect(cancel).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(input);
        composition(input, "compositionend");
        keydown(input);
        expect(submit).toHaveBeenCalledTimes(1);
    });
}

it("tracks a raw contenteditable portaled through a modal without cancelling its events", async () => {
    const portal = createRenderer().render(() => <div data-testid="portal-host" />, {
        width: 300,
        height: 150,
    });
    const host = portal.container.querySelector('[data-testid="portal-host"]')!;
    const close = vi.fn();
    const view = createRenderer().render(
        () => (
            <ModalOverlay onDismiss={close}>
                {createPortal(
                    <div
                        contentEditable="plaintext-only"
                        tabIndex={0}
                        role="textbox"
                        suppressContentEditableWarning
                    >
                        中文
                    </div>,
                    host,
                )}
            </ModalOverlay>
        ),
        { width: 800, height: 640 },
    );
    await view.ready();
    const input = host.querySelector("[contenteditable]") as HTMLElement;
    input.focus();
    composition(input, "compositionstart");
    const event = keydown(input, { key: "Escape" });
    expect(event.defaultPrevented).toBe(false);
    expect(close).not.toHaveBeenCalled();
    composition(input, "compositionend");
    keydown(input, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
});

it("preserves the development menu across a captured composing Escape", async () => {
    const view = createRenderer().render(
        () => (
            <>
                <DevBuildMenu branch="fixture" />
                <TextField value="中文" />
            </>
        ),
        { width: 600, height: 400 },
    );
    await view.ready();
    await userEvent.click(view.container.querySelector("button")!);
    const input = view.container.querySelector("input")!;
    input.focus();
    for (const sequence of sequences) {
        expect(ime(input, sequence, { key: "Escape" }).defaultPrevented).toBe(false);
        expect(
            view.container.querySelector('[data-happy-desktop-ui="dev-build-menu"]'),
        ).toHaveAttribute("data-open");
        composition(input, "compositionend");
    }
    keydown(input, { key: "Escape" });
    expect(
        view.container.querySelector('[data-happy-desktop-ui="dev-build-menu"]'),
    ).not.toHaveAttribute("data-open");
});

it.each(["input", "textarea"])(
    "leaves calendar parent confirmation shortcuts to the IME from %s",
    async (selector) => {
        const save = vi.fn();
        const close = vi.fn();
        const noop = () => {};
        const view = createRenderer().render(
            () => (
                <HappyAgentCalendarEventPopover
                    editor={{
                        target: { kind: "new", eventId: "fixture" as HappyAgentCalendarEventId },
                        draft: {
                            title: "中文",
                            allDay: true,
                            startDate: "2026-10-29",
                            startMinutes: 600,
                            endDate: "2026-10-29",
                            endMinutes: 660,
                            timeZone: "UTC",
                            location: "",
                            notes: "中文",
                            recurrence: null,
                        },
                        timing: { kind: "allDay", startDate: "2026-10-29", endDate: "2026-10-30" },
                        series: false,
                    }}
                    timeZones={["UTC"]}
                    onTitleChange={noop}
                    onAllDayChange={noop}
                    onStartDateChange={noop}
                    onStartMinutesChange={noop}
                    onEndDateChange={noop}
                    onEndMinutesChange={noop}
                    onTimeZoneChange={noop}
                    onLocationChange={noop}
                    onNotesChange={noop}
                    onRecurrenceChange={noop}
                    onSave={save}
                    onDelete={noop}
                    onClose={close}
                />
            ),
            { width: 700, height: 900 },
        );
        await view.ready();
        const input = view.container.querySelector(selector) as HTMLElement;
        input.focus();
        for (const sequence of sequences) {
            for (const init of [{ metaKey: true }, { ctrlKey: true }, { key: "Escape" }]) {
                expect(ime(input, sequence, init).defaultPrevented).toBe(false);
                expect(save).not.toHaveBeenCalled();
                expect(close).not.toHaveBeenCalled();
                composition(input, "compositionend");
            }
        }
        if (selector === "input") {
            keydown(input);
            expect(save).toHaveBeenCalledTimes(1);
        } else {
            keydown(input, { metaKey: true });
            keydown(input, { ctrlKey: true });
            expect(save).toHaveBeenCalledTimes(2);
        }
        keydown(input, { key: "Escape" });
        expect(close).toHaveBeenCalledTimes(1);
    },
);

it("coalesces a Chinese palette query and selects the filtered result on the next Enter", async () => {
    const changes = vi.fn();
    const select = vi.fn();
    function Harness() {
        const [query, setQuery] = useState("");
        const matches = ["中文项目", "Other"].filter((item) => item.includes(query));
        return (
            <CommandPalette
                query={query}
                onClose={() => {}}
                onQueryChange={(value) => {
                    changes(value);
                    setQuery(value);
                }}
                onSelectionCommit={() => select(matches[0])}
            >
                <output>{matches.join(",")}</output>
            </CommandPalette>
        );
    }
    const view = createRenderer().render(() => <Harness />, { width: 600, height: 500 });
    await view.ready();
    const input = view.container.querySelector("input")!;
    composition(input, "compositionstart");
    input.value = "中";
    flushSync(() =>
        input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true })),
    );
    input.value = "中文";
    flushSync(() => input.dispatchEvent(new InputEvent("input", { bubbles: true })));
    expect(changes).not.toHaveBeenCalled();
    expect(keydown(input).defaultPrevented).toBe(false);
    expect(select).not.toHaveBeenCalled();
    composition(input, "compositionend");
    flushSync(() => input.dispatchEvent(new InputEvent("input", { bubbles: true })));
    expect(changes).toHaveBeenCalledExactlyOnceWith("中文");
    expect(view.container.querySelector("output")?.textContent).toBe("中文项目");
    keydown(input);
    expect(select).toHaveBeenCalledExactlyOnceWith("中文项目");
});
