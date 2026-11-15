import { isVaultArtifactName, VAULT_ARTIFACT_SUFFIX } from "@slopus/happy-agent-client";
import type {
    HappyAgentVaultCrumb,
    HappyAgentVaultItem,
    HappyAgentVaultItemId,
    HappyAgentVaultRow,
    HappyAgentVaultRowUploads,
    HappyAgentVaultUpload,
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
    return nameFreeOf(new Set(siblings.map((entry) => vaultNameKey(entry.name))), name);
}

/** `name`, or the first `name N.ext` whose key `taken` does not hold. */
function nameFreeOf(taken: ReadonlySet<string>, name: string): string {
    if (!taken.has(vaultNameKey(name))) return name;
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    for (let count = 2; ; count += 1) {
        const candidate = `${stem} ${String(count)}${extension}`;
        if (!taken.has(vaultNameKey(candidate))) return candidate;
    }
}

function rowName(row: HappyAgentVaultRow): string {
    return row.kind === "item" ? row.item.name : row.name;
}

function rowKind(row: HappyAgentVaultRow): HappyAgentVaultItem["kind"] {
    return row.kind === "item" ? row.item.kind : row.upload.kind;
}

/** The listing's order, uploads among items: folders first, then by name. */
function rowCompare(left: HappyAgentVaultRow, right: HappyAgentVaultRow): number {
    return (
        Number(rowKind(right) === "folder") - Number(rowKind(left) === "folder") ||
        collator.compare(
            happyAgentVaultNameShown(rowName(left)),
            happyAgentVaultNameShown(rowName(right)),
        ) ||
        (left.id < right.id ? -1 : 1)
    );
}

/**
 * The rows of folder `folderId`: its `listing`, with each upload into it
 * drawn where its item will stand.
 *
 * An upload is drawn as the store's `uploadPlace` places it: as a new
 * version of the file or app of its kind holding its name, on that item's
 * row, or else as a new item under `upload.itemId`, renamed past a name an
 * item of another kind holds. Once that item is in the listing the upload is
 * drawn on its row, so the row neither moves nor doubles as it lands.
 * `uploads` are in the order they are sent: an earlier one claims a name
 * first, and a later one of the same name and kind becomes its next version.
 * An upload into a folder deeper down is counted on the row of the folder
 * here that holds it.
 */
export function happyAgentVaultRows(
    live: Entries,
    folderId: HappyAgentVaultItemId | null,
    listing: readonly HappyAgentVaultItem[],
    uploads: readonly HappyAgentVaultUpload[],
): readonly HappyAgentVaultRow[] {
    const rows: HappyAgentVaultRow[] = listing.map((item) => ({ kind: "item", id: item.id, item }));
    if (uploads.length === 0) return rows;
    const at = new Map(rows.map((row, index) => [row.id, index]));
    const named = new Map(rows.map((row, index) => [vaultNameKey(rowName(row)), index]));
    const within = new Map<HappyAgentVaultItemId, HappyAgentVaultRowUploads>();
    let added = false;
    for (const upload of uploads) {
        if (upload.folderId !== folderId) {
            const holder = holderOf(live, folderId, upload.folderId);
            if (holder === undefined || !at.has(holder)) continue;
            const counted = within.get(holder) ?? { going: 0, failed: 0, sent: 0, size: 0 };
            within.set(
                holder,
                upload.phase === "failed"
                    ? { ...counted, failed: counted.failed + 1 }
                    : {
                          ...counted,
                          going: counted.going + 1,
                          sent: counted.sent + upload.sent,
                          size: counted.size + upload.size,
                      },
            );
            continue;
        }
        let index = at.get(upload.itemId);
        if (index === undefined) {
            const held = named.get(vaultNameKey(upload.name));
            if (held !== undefined && rowKind(rows[held]!) === upload.kind) index = held;
        }
        if (index !== undefined) {
            const row = rows[index]!;
            // The first one sent is the one drawn; the rest follow it as its later versions.
            if (row.kind === "item" && row.upload === undefined) rows[index] = { ...row, upload };
            continue;
        }
        const name = nameFreeOf(new Set(named.keys()), upload.name);
        index = rows.length;
        rows.push({ kind: "upload", id: upload.itemId, name, upload });
        at.set(upload.itemId, index);
        named.set(vaultNameKey(name), index);
        added = true;
    }
    for (const [holder, counted] of within) {
        const index = at.get(holder)!;
        const row = rows[index]!;
        if (row.kind === "item") rows[index] = { ...row, within: counted };
    }
    return added ? rows.sort(rowCompare) : rows;
}

/** The folder in `folderId` that `inside` is or lies beneath, if it lies beneath one. */
function holderOf(
    live: Entries,
    folderId: HappyAgentVaultItemId | null,
    inside: HappyAgentVaultItemId | null,
): HappyAgentVaultItemId | undefined {
    let id = inside;
    for (let depth = 0; id !== null && depth < 128; depth += 1) {
        const entry = live.get(id);
        if (entry === undefined) return undefined;
        if (entry.parentId === folderId) return id;
        id = entry.parentId;
    }
    return undefined;
}
