import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import type { ConversationMediaItem, ConversationToolCall } from "happy-desktop-state";
import { afterEach, expect, it, vi } from "vitest";
import "./styles.css";
import { AgentActivityRow } from "./AgentActivityRow";
import { ConversationMedia } from "./ConversationMedia";
import { FileRevealContext, type FileReveal } from "./LinkContextMenu";

/* A file a chat was shown is a file on the machine: its card, its picture
 * or recording, and the line naming it offer what any file's name does —
 * show it in Finder and copy its path — and the card and tile offer opening
 * it, as a click does. */

const IMAGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>')}`;
const SHEET_PATH = "/Users/happy/app/out/sales-report.xlsx";

const sheet: ConversationMediaItem = {
    kind: "file",
    name: "sales-report.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 661_401,
    url: "https://happy.test/media/sheet",
    source: { path: "out/sales-report.xlsx", absolutePath: SHEET_PATH },
};
const picture: ConversationMediaItem = {
    kind: "image",
    name: "chart.png",
    mimeType: "image/png",
    size: 1,
    width: 800,
    height: 400,
    url: IMAGE_URL,
    source: { path: "out/chart.png", absolutePath: "/Users/happy/app/out/chart.png" },
};
const recording: ConversationMediaItem = {
    kind: "video",
    name: "demo.mp4",
    mimeType: "video/mp4",
    size: 1,
    width: 640,
    height: 360,
    url: "https://happy.test/media/demo.mp4",
    source: { path: "demo.mp4", absolutePath: "/Users/happy/app/demo.mp4" },
};

const roots: (() => void)[] = [];
afterEach(() => {
    for (const unmount of roots.splice(0)) unmount();
});

function mount(element: ReactElement): HTMLElement {
    const host = document.createElement("div");
    host.style.cssText = "width:640px;";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(element));
    roots.push(() => {
        root.unmount();
        host.remove();
    });
    return host;
}

function revealSpy() {
    return {
        path: vi.fn<FileReveal["path"]>(),
        link: vi.fn<FileReveal["link"]>(),
    } satisfies FileReveal;
}

/** Right-clicks `element` and reports whether the page's own menu was held back. */
function rightClick(element: Element): boolean {
    const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 40,
    });
    flushSync(() => element.dispatchEvent(event));
    return event.defaultPrevented;
}

const MENU_LABELS =
    '[data-happy-desktop-ui="context-menu"] [data-happy-desktop-ui="menu-item-label"]';

function menuRows(): string[] {
    return [...document.querySelectorAll(MENU_LABELS)].map((label) => label.textContent ?? "");
}

function choose(label: string) {
    const row = [...document.querySelectorAll(MENU_LABELS)]
        .find((element) => element.textContent === label)
        ?.closest<HTMLElement>('[role^="menuitem"]');
    expect(row, label).toBeDefined();
    flushSync(() => row!.click());
}

function clipboardSpy() {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    return writeText;
}

it("offers Open, Show in Finder, and Copy path on a presented file's card", () => {
    const reveal = revealSpy();
    const open = vi.fn();
    const writeText = clipboardSpy();
    const host = mount(
        <FileRevealContext.Provider value={reveal}>
            <ConversationMedia items={[sheet]} onItemOpen={open} />
        </FileRevealContext.Provider>,
    );
    const card = host.querySelector('[data-happy-desktop-ui="result-card"]')!;
    const height = card.getBoundingClientRect().height;

    expect(rightClick(card)).toBe(true);
    expect(menuRows()).toEqual(["Open", "Show in Finder", "Copy path"]);
    // The menu floats; the card keeps its 64px row.
    expect(card.getBoundingClientRect().height).toBe(height);
    choose("Show in Finder");
    expect(reveal.path).toHaveBeenCalledWith(SHEET_PATH);
    expect(menuRows()).toEqual([]);

    rightClick(card);
    choose("Copy path");
    expect(writeText).toHaveBeenCalledWith(SHEET_PATH);
    expect(menuRows()).toEqual([]);

    rightClick(card);
    choose("Open");
    expect(open).toHaveBeenCalledWith(0);
    expect(menuRows()).toEqual([]);
});

it("offers Finder only where a host reveals files, and the path only where it is known", () => {
    const withoutHost = mount(<ConversationMedia items={[sheet]} onItemOpen={() => undefined} />);
    rightClick(withoutHost.querySelector('[data-happy-desktop-ui="result-card"]')!);
    expect(menuRows()).toEqual(["Open", "Copy path"]);
    choose("Open");

    const { source: _source, ...unsourced } = sheet;
    const withoutSource = mount(
        <FileRevealContext.Provider value={revealSpy()}>
            <ConversationMedia items={[unsourced]} onItemOpen={() => undefined} />
        </FileRevealContext.Provider>,
    );
    rightClick(withoutSource.querySelector('[data-happy-desktop-ui="result-card"]')!);
    expect(menuRows()).toEqual(["Open"]);
    choose("Open");

    // Nothing to offer: the right-click is left to the page.
    const inert = mount(<ConversationMedia items={[unsourced]} />);
    expect(rightClick(inert.querySelector('[data-happy-desktop-ui="result-card"]')!)).toBe(false);
    expect(menuRows()).toEqual([]);
});

it("offers the same menu on a picture and a recording, without moving either", () => {
    const reveal = revealSpy();
    const open = vi.fn();
    const host = mount(
        <FileRevealContext.Provider value={reveal}>
            <ConversationMedia items={[picture, recording]} onItemOpen={open} />
        </FileRevealContext.Provider>,
    );
    const media = host.querySelector('[data-happy-desktop-ui="conversation-media"]')!;
    const before = media.getBoundingClientRect().height;
    const tile = host.querySelector('[data-happy-desktop-ui="media-image-tile"]')!;
    const video = host.querySelector('[data-happy-desktop-ui="media-video-tile"]')!;

    expect(rightClick(tile)).toBe(true);
    expect(menuRows()).toEqual(["Open", "Show in Finder", "Copy path"]);
    expect(media.getBoundingClientRect().height).toBe(before);
    choose("Show in Finder");
    expect(reveal.path).toHaveBeenLastCalledWith("/Users/happy/app/out/chart.png");

    // Asked from the recording's own play surface, the menu is the recording's.
    rightClick(video.querySelector('[data-happy-desktop-ui="media-video-tile-surface"]')!);
    expect(menuRows()).toEqual(["Open", "Show in Finder", "Copy path"]);
    choose("Open");
    expect(open).toHaveBeenLastCalledWith(1);
    expect(media.getBoundingClientRect().height).toBe(before);
});

const presented = (items: readonly ConversationMediaItem[]): ConversationToolCall => ({
    toolCallId: "present",
    toolName: "present_files",
    arguments: { filepaths: items.map((item) => item.source?.path ?? item.name) },
    status: "success",
    failed: false,
    display: `File ${items[0]!.name}`,
    presentation: { type: "media", items },
});

it("reveals the one file a call showed from its line", () => {
    const reveal = revealSpy();
    const host = mount(
        <FileRevealContext.Provider value={reveal}>
            <AgentActivityRow activity={{ kind: "tool", tool: presented([sheet]) }} />
        </FileRevealContext.Provider>,
    );
    expect(rightClick(host.querySelector('[data-happy-desktop-ui="agent-activity-line"]')!)).toBe(
        true,
    );
    expect(menuRows()).toEqual(["Show in Finder", "Copy path"]);
    choose("Show in Finder");
    expect(reveal.path).toHaveBeenCalledWith(SHEET_PATH);

    // Two files have no one file to name; each card still offers its own.
    const two = mount(
        <FileRevealContext.Provider value={revealSpy()}>
            <AgentActivityRow activity={{ kind: "tool", tool: presented([sheet, picture]) }} />
        </FileRevealContext.Provider>,
    );
    expect(rightClick(two.querySelector('[data-happy-desktop-ui="agent-activity-line"]')!)).toBe(
        false,
    );
    expect(menuRows()).toEqual([]);
});
