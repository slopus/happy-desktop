import type { IoniconName } from "../../vectorIcons/VectorIcon";
import { ioniconsGlyphs } from "../../vectorIcons/ioniconsGlyphs";
import type { HappyAgentHandbookPerson } from "./handbookPresentation";

/** Folders nest at most this deep; a top-level folder is level 1. */
export const HANDBOOK_FOLDER_DEPTH_MAX = 4;

/** One folder as the page shows it. Siblings share a `parentId`, in the order given. */
export interface HappyAgentHandbookFolderView {
    readonly id: string;
    /** `null` for a top-level folder: a category on the home. */
    readonly parentId: string | null;
    readonly name: string;
    /** An Ionicons name from `HANDBOOK_FOLDER_ICONS`; shown only on a category. */
    readonly icon: string | null;
}

/** One item as the page lists it. */
export interface HappyAgentHandbookListRow {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    /** The folder it lives in; `null` for the root. */
    readonly folderId: string | null;
    readonly alwaysInContext: boolean;
    readonly pending: boolean;
    /** The revision agents follow; `null` for an item never applied. */
    readonly revision: number | null;
    /** Whose edits are not applied yet. */
    readonly pendingPeople: readonly HappyAgentHandbookPerson[];
}

/**
 * The glyphs a category can wear, from the house's own Ionicons. The server
 * keeps whichever name was picked; a name outside this set shows as a folder.
 */
export const HANDBOOK_FOLDER_ICONS = [
    "folder-outline",
    "trending-up-outline",
    "megaphone-outline",
    "code-slash-outline",
    "headset-outline",
    "settings-outline",
    "wallet-outline",
    "people-outline",
    "color-palette-outline",
    "grid-outline",
    "rocket-outline",
    "shield-checkmark-outline",
    "server-outline",
    "bar-chart-outline",
    "briefcase-outline",
    "school-outline",
    "heart-outline",
    "globe-outline",
    "chatbubbles-outline",
    "flask-outline",
    "construct-outline",
    "bulb-outline",
    "library-outline",
    "sparkles-outline",
] as const satisfies readonly IoniconName[];

export function handbookFolderIcon(icon: string | null): IoniconName {
    return icon !== null && Object.hasOwn(ioniconsGlyphs, icon)
        ? (icon as IoniconName)
        : "folder-outline";
}

/** The handbook as a tree: each folder's subfolders and items, and every count, read once. */
export interface HandbookTree {
    readonly folders: ReadonlyMap<string, HappyAgentHandbookFolderView>;
    /** Subfolders by parent; the key `null` holds the categories. */
    readonly children: ReadonlyMap<string | null, readonly HappyAgentHandbookFolderView[]>;
    /** Items by folder; the key `null` holds those at the root. */
    readonly items: ReadonlyMap<string | null, readonly HappyAgentHandbookListRow[]>;
    /** Every item under a folder, however deep. */
    readonly counts: ReadonlyMap<string, number>;
}

export function handbookTreeOf(
    folders: readonly HappyAgentHandbookFolderView[],
    items: readonly HappyAgentHandbookListRow[],
): HandbookTree {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const children = new Map<string | null, HappyAgentHandbookFolderView[]>();
    for (const folder of folders) {
        // A folder whose parent is gone is shown as a category rather than lost.
        const parent =
            folder.parentId !== null && byId.has(folder.parentId) ? folder.parentId : null;
        children.set(parent, [...(children.get(parent) ?? []), folder]);
    }
    const filed = new Map<string | null, HappyAgentHandbookListRow[]>();
    for (const item of items) {
        const folder = item.folderId !== null && byId.has(item.folderId) ? item.folderId : null;
        filed.set(folder, [...(filed.get(folder) ?? []), item]);
    }
    const counts = new Map<string, number>();
    const count = (folderId: string): number => {
        const known = counts.get(folderId);
        if (known !== undefined) return known;
        let total = filed.get(folderId)?.length ?? 0;
        for (const child of children.get(folderId) ?? []) total += count(child.id);
        counts.set(folderId, total);
        return total;
    };
    for (const folder of folders) count(folder.id);
    return { folders: byId, children, items: filed, counts };
}

/** The folder names from the category down to `folderId`. */
export function handbookPath(tree: HandbookTree, folderId: string | null): readonly string[] {
    const names: string[] = [];
    let current = folderId === null ? undefined : tree.folders.get(folderId);
    while (current && names.length <= HANDBOOK_FOLDER_DEPTH_MAX) {
        names.unshift(current.name);
        current = current.parentId === null ? undefined : tree.folders.get(current.parentId);
    }
    return names;
}

/** How deep a folder sits: a category is 1, the root 0. */
export function handbookDepth(tree: HandbookTree, folderId: string | null): number {
    return handbookPath(tree, folderId).length;
}

/** How many levels a folder holds, itself included. */
export function handbookHeight(tree: HandbookTree, folderId: string): number {
    let tallest = 0;
    for (const child of tree.children.get(folderId) ?? [])
        tallest = Math.max(tallest, handbookHeight(tree, child.id));
    return tallest + 1;
}

/** `folderId` is `ancestorId` or somewhere inside it. */
export function handbookWithin(tree: HandbookTree, folderId: string, ancestorId: string): boolean {
    let current = tree.folders.get(folderId);
    for (let step = 0; current && step <= HANDBOOK_FOLDER_DEPTH_MAX; step += 1) {
        if (current.id === ancestorId) return true;
        current = current.parentId === null ? undefined : tree.folders.get(current.parentId);
    }
    return false;
}

/** One item the search found, with where it lives. */
export interface HandbookSearchResult {
    readonly item: HappyAgentHandbookListRow;
    readonly path: readonly string[];
}

/**
 * Items whose title, description or folder path holds every word typed,
 * ignoring case. What the items say is not searched here.
 */
export function handbookSearch(tree: HandbookTree, query: string): HandbookSearchResult[] {
    const words = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    if (words.length === 0) return [];
    const results: HandbookSearchResult[] = [];
    for (const [folderId, items] of tree.items) {
        const path = handbookPath(tree, folderId);
        for (const item of items) {
            const text = [item.title, item.description, ...path].join("\n").toLocaleLowerCase();
            if (words.every((word) => text.includes(word))) results.push({ item, path });
        }
    }
    return results.sort((left, right) =>
        left.item.title.localeCompare(right.item.title, undefined, { sensitivity: "base" }),
    );
}
