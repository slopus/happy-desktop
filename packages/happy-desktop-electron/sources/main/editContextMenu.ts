import {
    BrowserWindow,
    Menu,
    type ContextMenuParams,
    type MenuItemConstructorOptions,
    type WebContents,
} from "electron";

/**
 * The text menu a right click opens on a field or on ordinary text. Electron shows none of its
 * own, so without this nothing can be cut, copied, pasted or selected by mouse. A field gets all
 * four; other text gets Copy and Select All. Each item is enabled only where Chromium says it
 * applies.
 */
export function editContextMenuTemplate(
    params: Pick<ContextMenuParams, "isEditable" | "editFlags">,
): MenuItemConstructorOptions[] {
    const flags = params.editFlags;
    if (params.isEditable) {
        return [
            { role: "cut", enabled: flags.canCut },
            { role: "copy", enabled: flags.canCopy },
            { role: "paste", enabled: flags.canPaste },
            { type: "separator" },
            { role: "selectAll", enabled: flags.canSelectAll },
        ];
    }
    return [
        { role: "copy", enabled: flags.canCopy },
        { type: "separator" },
        { role: "selectAll", enabled: flags.canSelectAll },
    ];
}

/**
 * Opens the text menu for one of the app's own pages. A page element with a menu of its own
 * (sidebar rows, tabs, links) handles the right click itself, and Chromium then sends no request
 * here.
 */
export function editContextMenuAttach(contents: WebContents): void {
    contents.on("context-menu", (_event, params) => {
        const window = BrowserWindow.fromWebContents(contents) ?? undefined;
        Menu.buildFromTemplate(editContextMenuTemplate(params)).popup(window ? { window } : {});
    });
}
