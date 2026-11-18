import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: {}, Menu: {} }));

const { editContextMenuTemplate } = await import("./editContextMenu");

const flags = {
    canUndo: false,
    canRedo: false,
    canCut: false,
    canCopy: false,
    canPaste: false,
    canDelete: false,
    canSelectAll: false,
    canEditRichly: false,
};

it("offers cut, copy, paste and select all in a field, enabled as Chromium allows", () => {
    const template = editContextMenuTemplate({
        isEditable: true,
        editFlags: { ...flags, canCopy: true, canPaste: true, canSelectAll: true },
    });
    expect(template.map((item) => item.role ?? item.type)).toEqual([
        "cut",
        "copy",
        "paste",
        "separator",
        "selectAll",
    ]);
    expect(template.map((item) => item.enabled)).toEqual([false, true, true, undefined, true]);
});

it("offers copy and select all on other text", () => {
    const template = editContextMenuTemplate({
        isEditable: false,
        editFlags: { ...flags, canSelectAll: true },
    });
    expect(template.map((item) => item.role ?? item.type)).toEqual([
        "copy",
        "separator",
        "selectAll",
    ]);
    expect(template.map((item) => item.enabled)).toEqual([false, undefined, true]);
});
