import { isVaultArtifactName, VAULT_ARTIFACT_SUFFIX } from "@slopus/happy-agent-client";
import type {
    HappyAgentVaultCrumb,
    HappyAgentVaultItem,
    HappyAgentVaultItemId,
    HappyAgentVaultSort,
} from "./surfaceVaultTypes.js";

type Entries = ReadonlyMap<HappyAgentVaultItemId, HappyAgentVaultItem>;

/** Finder's order for names: case-insensitive, and `file 2` before `file 10`. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** What two names that would collide in one folder share: NFC, lowercased. */
export function vaultNameKey(name: string): string {
    return name.normalize("NFC").toLowerCase();
}

/**
 * The live items: those that are not deleted and whose folders are all
 * live. A folder's Trash takes everything in it along without marking it.
 */
export function vaultLive(items: Entries): Entries {
    const live = new Map<HappyAgentVaultItemId, HappyAgentVaultItem>();
    const known = new Map<HappyAgentVaultItemId, boolean>();
    const isLive = (entry: HappyAgentVaultItem, depth: number): boolean => {
        const cached = known.get(entry.id);
        if (cached !== undefined) return cached;
        let result = entry.deletedAt === null;
        if (result && entry.parentId !== null) {
            const parent = items.get(entry.parentId);
            // A loop can only come from a half-applied move; it is not shown.
            result = parent !== undefined && depth < 128 && isLive(parent, depth + 1);
        }
        known.set(entry.id, result);
        return result;
    };
    for (const entry of items.values()) if (isLive(entry, 0)) live.set(entry.id, entry);
    return live;
}

function nameCompare(left: HappyAgentVaultItem, right: HappyAgentVaultItem): number {
    return (
        collator.compare(
            happyAgentVaultNameShown(left.name),
            happyAgentVaultNameShown(right.name),
        ) || (left.id < right.id ? -1 : 1)
    );
}

/** Each folder's children, folders first, then by name; `null` is the root. */
export function vaultChildren(
    live: Entries,
): Map<HappyAgentVaultItemId | null, HappyAgentVaultItem[]> {
    const children = new Map<HappyAgentVaultItemId | null, HappyAgentVaultItem[]>();
    for (const entry of live.values()) {
        const list = children.get(entry.parentId);
        if (list) list.push(entry);
        else children.set(entry.parentId, [entry]);
    }
    for (const list of children.values())
        list.sort(
            (left, right) =>
                Number(right.kind === "folder") - Number(left.kind === "folder") ||
                nameCompare(left, right),
        );
    return children;
}

/** A folder's contents in the reader's order; folders always come first. */
export function vaultListing(
    children: readonly HappyAgentVaultItem[],
    sort: HappyAgentVaultSort,
): readonly HappyAgentVaultItem[] {
    if (sort.key === "name" && sort.order === "asc") return children;
    const sign = sort.order === "asc" ? 1 : -1;
    const size = (entry: HappyAgentVaultItem) => (entry.kind === "folder" ? 0 : entry.size);
    return [...children].sort(
        (left, right) =>
            Number(right.kind === "folder") - Number(left.kind === "folder") ||
            sign *
                (sort.key === "name"
                    ? collator.compare(
                          happyAgentVaultNameShown(left.name),
                          happyAgentVaultNameShown(right.name),
                      )
                    : sort.key === "size"
                      ? size(left) - size(right)
                      : left.updatedAt - right.updatedAt) ||
            nameCompare(left, right),
    );
}

/** The folders from the root down to `folderId`, the root first. */
export function vaultCrumbs(
    items: Entries,
    folderId: HappyAgentVaultItemId | null,
    rootName: string,
): readonly HappyAgentVaultCrumb[] {
    const crumbs: HappyAgentVaultCrumb[] = [];
    let id = folderId;
    while (id !== null && crumbs.length < 128) {
        const entry = items.get(id);
        if (entry === undefined) break;
        crumbs.push({ id: entry.id, name: entry.name });
        id = entry.parentId;
    }
    crumbs.push({ id: null, name: rootName });
    return crumbs.reverse();
}

/** `/Reports/Q3/summary.pdf`, from the names of an item and its folders. */
export function vaultPath(items: Entries, itemId: HappyAgentVaultItemId): string {
    const names: string[] = [];
    let entry = items.get(itemId);
    while (entry !== undefined && names.length < 128) {
        names.push(entry.name);
        entry = entry.parentId === null ? undefined : items.get(entry.parentId);
    }
    return `/${names.reverse().join("/")}`;
}

/** Whether `folderId` is `itemId` or lies inside it. */
export function vaultContains(
    items: Entries,
    itemId: HappyAgentVaultItemId,
    folderId: HappyAgentVaultItemId | null,
): boolean {
    let id = folderId;
    for (let depth = 0; id !== null && depth < 128; depth += 1) {
        if (id === itemId) return true;
        id = items.get(id)?.parentId ?? null;
    }
    return false;
}

/** Whether a name is an artifact's: it ends in `.artifact`, in any case. */
export function happyAgentVaultArtifactNamed(name: string): boolean {
    return isVaultArtifactName(name);
}

/**
 * A name as the reader sees and types it. Every artifact's name ends in
 * `.artifact` and no other item's does, so the suffix says nothing the
 * artifact's glyph and preview do not; it is left off everywhere it is shown.
 */
export function happyAgentVaultNameShown(name: string): string {
    if (!isVaultArtifactName(name) || name.length === VAULT_ARTIFACT_SUFFIX.length) return name;
    return name.slice(0, -VAULT_ARTIFACT_SUFFIX.length);
}

/** A path as the reader sees it: each artifact in it named as `happyAgentVaultNameShown` does. */
export function happyAgentVaultPathShown(path: string): string {
    return path.split("/").map(happyAgentVaultNameShown).join("/");
}

/** The name stored for one the reader typed: an artifact's keeps its `.artifact`. */
export function happyAgentVaultNameStored(
    shown: string,
    kind: HappyAgentVaultItem["kind"],
): string {
    return kind === "artifact" && !isVaultArtifactName(shown)
        ? `${shown}${VAULT_ARTIFACT_SUFFIX}`
        : shown;
}

/**
 * The daemon's name rule, in words for the reader, for a name as they typed
 * it, or `undefined` for a name it takes.
 */
export function happyAgentVaultNameProblem(
    shown: string,
    kind: HappyAgentVaultItem["kind"],
): string | undefined {
    if (shown.length === 0) return "Give it a name.";
    if (kind !== "artifact" && happyAgentVaultArtifactNamed(shown))
        return "A name can’t end in “.artifact”.";
    const name = happyAgentVaultNameStored(shown, kind);
    if (name === "." || name === "..") return "That name is reserved.";
    if (/[/\\]/u.test(name)) return "A name can’t hold “/” or “\\”.";
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/u.test(name)) return "A name can’t hold control characters.";
    if (new TextEncoder().encode(name.normalize("NFC")).length > 255)
        return "That name is too long.";
    return undefined;
}

/** `name`, or `name 2.ext`, `name 3.ext`, …, the first one no sibling holds. */
export function vaultNameFree(siblings: readonly HappyAgentVaultItem[], name: string): string {
    const taken = new Set(siblings.map((entry) => vaultNameKey(entry.name)));
    if (!taken.has(vaultNameKey(name))) return name;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    for (let count = 2; ; count += 1) {
        const candidate = `${stem} ${String(count)}${extension}`;
        if (!taken.has(vaultNameKey(candidate))) return candidate;
    }
}
