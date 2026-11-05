import type {
    HappyAgentVaultActor,
    HappyAgentVaultItem,
    HappyAgentVaultItemId,
    HappyAgentVaultUploadFile,
} from "happy-desktop-state";
import { FileTreeFamilyIcon, fileTreeFamily, type FileTreeFamily } from "../../../FileTree";
import {
    localClockTime,
    localDaysFrom,
    localShortDate,
    type LocalTimeZone,
} from "../../../localTime";
import { Ionicon } from "../../../vectorIcons/VectorIcon";

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

/** What an entry is, in a word or two, for the listing's kind column. */
export function vaultKindText(entry: HappyAgentVaultItem): string {
    if (entry.kind === "folder") return "Folder";
    if (entry.kind === "artifact")
        return entry.artifact.type === "html" ? "Web page" : "Markdown page";
    const type = entry.mediaType;
    const dot = entry.name.lastIndexOf(".");
    const extension = dot > 0 ? entry.name.slice(dot + 1).toUpperCase() : "";
    if (type.startsWith("image/")) return extension ? `${extension} image` : "Image";
    if (type.startsWith("video/")) return "Video";
    if (type.startsWith("audio/")) return "Audio";
    if (type === "application/pdf") return "PDF document";
    if (type === "text/markdown") return "Markdown";
    if (type === "application/zip") return "Zip archive";
    if (type.startsWith("text/") || type === "application/json")
        return extension ? `${extension} text` : "Text";
    return extension ? `${extension} file` : "Document";
}

/**
 * The colour family an entry wears. A folder and a file take the file tree's
 * own; a site takes the family of what it is written in, so a web page reads
 * like the HTML it is and a Markdown page like prose.
 */
export function vaultItemFamily(entry: HappyAgentVaultItem): FileTreeFamily {
    if (entry.kind === "folder") return "directory";
    if (entry.kind === "artifact") return entry.artifact.type === "html" ? "code" : "prose";
    return fileTreeFamily({ kind: "file", name: entry.name });
}

/** Whether the listing may draw a picture's thumbnail in place of its glyph. */
export function vaultItemIsImage(entry: HappyAgentVaultItem): boolean {
    return entry.kind === "file" && entry.mediaType.startsWith("image/");
}

/**
 * An entry's glyph in its family's colour: the file tree's for folders and
 * files, and a globe or a page for a site, which is one entry however many
 * files it holds.
 */
export function VaultItemGlyph(props: { item: HappyAgentVaultItem; size: 16 | 20 | 32 }) {
    const family = vaultItemFamily(props.item);
    return (
        <span
            aria-hidden="true"
            className="happy-file-family happy-vault-glyph"
            data-family={family}
            data-happy-desktop-ui="vault-glyph"
            data-size={props.size}
        >
            {props.item.kind === "artifact" ? (
                <Ionicon
                    name={props.item.artifact.type === "html" ? "globe-outline" : "reader-outline"}
                    size={props.size}
                />
            ) : (
                <FileTreeFamilyIcon family={family} size={props.size} />
            )}
        </span>
    );
}

/** The folder a drop lands in, keyed for the drop highlight: `root` is the vault's root. */
export function vaultDropKey(folderId: HappyAgentVaultItemId | null): string {
    return folderId ?? "root";
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
