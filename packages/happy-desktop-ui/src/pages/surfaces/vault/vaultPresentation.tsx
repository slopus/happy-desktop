import type {
    HappyAgentVaultActor,
    HappyAgentVaultItem,
    HappyAgentVaultUploadFile,
} from "happy-desktop-state";
import { FileTreeFamilyIcon, fileTreeFamily, type FileTreeFamily } from "../../../FileTree";
import {
    localClockTime,
    localDaysFrom,
    localShortDate,
    type LocalTimeZone,
} from "../../../localTime";
import { Ionicon, type IoniconName } from "../../../vectorIcons/VectorIcon";

/** The drag payload of an entry carried within the vault: its ID. */
export const VAULT_ENTRY_DRAG_TYPE = "application/x-happy-vault-entry";

/** Who and what the page names in words: the reader, the people, and the agents. */
export interface VaultNames {
    readonly viewerUserId: string | null;
    readonly people: ReadonlyMap<string, { readonly name: string | null }>;
    readonly agents: ReadonlyMap<string, string>;
}

/** Who made a change, as the reader reads it: "You", a person, or an agent. */
export function vaultActorName(actor: HappyAgentVaultActor, names: VaultNames): string {
    if (actor.agentId !== null) return names.agents.get(actor.agentId) ?? "An agent";
    // A standalone installation names no person, its reader included.
    if (actor.userId === names.viewerUserId) return "You";
    if (actor.userId === null) return "Someone";
    return names.people.get(actor.userId)?.name ?? "Someone";
}

/** The folder a path's entry sits in; empty at the root, which the breadcrumb already names. */
export function vaultParentPath(path: string): string {
    const cut = path.lastIndexOf("/");
    return cut <= 0 ? "" : path.slice(0, cut);
}

/** A byte count in the unit a person reads it in. */
export function vaultSizeText(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 102.4) / 10)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${String(Math.round(bytes / (102.4 * 1024)) / 10)} MB`;
    return `${String(Math.round(bytes / (102.4 * 1024 * 1024)) / 10)} GB`;
}

/** When something changed, as Finder says it: today and yesterday by name, then the date. */
export function vaultTimeText(at: number, now: number, zone: LocalTimeZone): string {
    const days = localDaysFrom(now, at, zone);
    if (days === 0) return `Today, ${localClockTime(at, zone)}`;
    if (days === -1) return `Yesterday, ${localClockTime(at, zone)}`;
    return `${localShortDate(at, now, zone)}, ${localClockTime(at, zone)}`;
}

/**
 * The colour family an entry wears. A folder and a file take the file tree's
 * own; an artifact is an app whatever it is written in, so every one wears
 * the same family.
 */
export function vaultItemFamily(entry: HappyAgentVaultItem): FileTreeFamily {
    if (entry.kind === "folder") return "directory";
    if (entry.kind === "artifact") return "code";
    return fileTreeFamily({ kind: "file", name: entry.name });
}

/**
 * The glyph an artifact wears in place of a file's: one app glyph, the same
 * for an HTML app and a Markdown one, so an app reads as one kind of thing.
 * It is one item however many files it holds, and its name is shown without
 * the `.artifact` that would otherwise have said what it is.
 */
export const VAULT_APP_GLYPH: IoniconName = "globe-outline";

/**
 * A Skills folder's glyph: what it holds teaches agents, so it does not wear
 * the plain folder's. Its row also carries a "Skills" badge and, open, a line
 * saying what goes in it.
 */
export const VAULT_SKILLS_GLYPH: IoniconName = "sparkles-sharp";

/** What a Skills folder is for, said once over its listing. */
export const VAULT_SKILLS_NOTE =
    "Agents learn from this folder: each folder in it with a SKILL.md teaches them one task.";

/**
 * The hue of an item's tile, the phone vault's: blue folders, teal apps,
 * purple prose, red PDFs, and so on by family; anything else is neutral.
 */
export type VaultTileTint =
    | "blue"
    | "teal"
    | "purple"
    | "red"
    | "orange"
    | "indigo"
    | "green"
    | "neutral";

export function vaultItemTint(entry: HappyAgentVaultItem): VaultTileTint {
    if (entry.kind === "folder") return entry.role === "skills" ? "indigo" : "blue";
    if (entry.kind === "artifact") return "teal";
    if (entry.mediaType === "application/pdf") return "red";
    switch (vaultItemFamily(entry)) {
        case "prose":
            return "purple";
        case "image":
        case "archive":
            return "orange";
        case "video":
            return "red";
        case "audio":
            return "indigo";
        case "data":
            return "green";
        case "code":
            return "teal";
        default:
            return "neutral";
    }
}

/**
 * An item's mark in a card row: its glyph on a softly tinted 36px tile, or a
 * picture's own thumbnail filling the tile.
 */
export function VaultItemTile(props: { item: HappyAgentVaultItem; thumbnail?: string }) {
    const family = vaultItemFamily(props.item);
    return (
        <span
            aria-hidden="true"
            className="happy-vault-tile"
            data-happy-desktop-ui="vault-tile"
            data-thumbnail={props.thumbnail ? "" : undefined}
            data-tint={vaultItemTint(props.item)}
        >
            {props.thumbnail ? (
                <img
                    alt=""
                    className="happy-vault-tile__thumbnail"
                    draggable={false}
                    loading="lazy"
                    src={props.thumbnail}
                />
            ) : props.item.kind === "folder" ? (
                <Ionicon
                    name={props.item.role === "skills" ? VAULT_SKILLS_GLYPH : "folder-sharp"}
                    size={20}
                />
            ) : props.item.kind === "artifact" ? (
                <Ionicon name={VAULT_APP_GLYPH} size={20} />
            ) : (
                <FileTreeFamilyIcon family={family} size={20} />
            )}
        </span>
    );
}

/** What is being dragged over a target: an entry of this vault, files from the computer, or neither. */
export function vaultDragKind(transfer: DataTransfer): "entry" | "files" | undefined {
    const types = [...transfer.types];
    if (types.includes(VAULT_ENTRY_DRAG_TYPE)) return "entry";
    if (types.includes("Files")) return "files";
    return undefined;
}

/**
 * The files a drop from the computer carries, with a dropped folder's files
 * named by where they sit in it. The items must be taken while the drop
 * event is still being handled, which is why this reads them before it waits
 * on anything.
 */
export function vaultDroppedFiles(transfer: DataTransfer): Promise<HappyAgentVaultUploadFile[]> {
    const roots: FileSystemEntry[] = [];
    const loose: File[] = [];
    for (const item of transfer.items) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry();
        if (entry) roots.push(entry);
        else {
            const file = item.getAsFile();
            if (file) loose.push(file);
        }
    }
    if (roots.length === 0 && loose.length === 0) loose.push(...transfer.files);
    const walk = async (entry: FileSystemEntry): Promise<HappyAgentVaultUploadFile[]> => {
        if (entry.isFile) {
            const file = await new Promise<File>((resolve, reject) =>
                (entry as FileSystemFileEntry).file(resolve, reject),
            );
            const relativePath = entry.fullPath.replace(/^\//u, "");
            return relativePath.includes("/") ? [{ file, relativePath }] : [{ file }];
        }
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        const children: FileSystemEntry[] = [];
        // A directory reader hands its items over in batches until one is empty.
        for (;;) {
            const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
                reader.readEntries(resolve, reject),
            );
            if (batch.length === 0) break;
            children.push(...batch);
        }
        return (await Promise.all(children.map(walk))).flat();
    };
    return Promise.all(roots.map(walk)).then((found) => [
        ...found.flat(),
        ...loose.map((file) => ({ file })),
    ]);
}
