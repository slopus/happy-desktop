import type {
    HappyAgentEvent,
    VaultActivity,
    VaultFile,
    VaultFileUpdatedPayload,
    VaultFolder,
    VaultFolderUpdatedPayload,
    VaultItem,
    VaultRetention,
    VaultVersion,
} from "@slopus/happy-agent-client";
import type { HappyAgentSurfaceId } from "./surfaceTypes.js";
import type {
    HappyAgentVaultActivity,
    HappyAgentVaultFile,
    HappyAgentVaultFolder,
    HappyAgentVaultItem,
    HappyAgentVaultItemId,
    HappyAgentVaultRetention,
    HappyAgentVaultVersion,
} from "./surfaceVaultTypes.js";

/** The events an open vault follows. */
export const HAPPY_AGENT_VAULT_EVENT_TYPES = [
    "vault.folder.created",
    "vault.folder.updated",
    "vault.folder.removed",
    "vault.file.created",
    "vault.file.updated",
    "vault.file.removed",
    "vault.version.updated",
    "vault.settings.updated",
] as const satisfies readonly HappyAgentEvent["type"][];

export type HappyAgentVaultEvent = Extract<
    HappyAgentEvent,
    { readonly type: (typeof HAPPY_AGENT_VAULT_EVENT_TYPES)[number] }
>;

/** The vault a `vault.*` event is about, or `undefined` for any other event. */
export function happyAgentVaultEventSurface(event: HappyAgentEvent): string | undefined {
    switch (event.type) {
        case "vault.folder.created":
            return event.payload.folder.surfaceId;
        case "vault.file.created":
            return event.payload.file.surfaceId;
        case "vault.folder.updated":
        case "vault.folder.removed":
        case "vault.file.updated":
        case "vault.file.removed":
        case "vault.version.updated":
        case "vault.settings.updated":
            return event.payload.surfaceId;
        default:
            return undefined;
    }
}

export function happyAgentVaultItemProject(item: VaultItem): HappyAgentVaultItem {
    return item.kind === "folder"
        ? happyAgentVaultFolderProject(item)
        : happyAgentVaultFileProject(item);
}

function happyAgentVaultItemFields(item: VaultItem) {
    return {
        id: item.id as HappyAgentVaultItemId,
        surfaceId: item.surfaceId as HappyAgentSurfaceId,
        parentId: item.parentId as HappyAgentVaultItemId | null,
        name: item.name,
        createdAt: item.createdAt,
        createdBy: item.createdBy,
        updatedAt: item.updatedAt,
        updatedBy: item.updatedBy,
        deletedAt: item.deletedAt,
        version: item.version,
    };
}

export function happyAgentVaultFolderProject(folder: VaultFolder): HappyAgentVaultFolder {
    return {
        ...happyAgentVaultItemFields(folder),
        kind: "folder",
        // The client's vault protocol carries a folder's role from 0.0.169.
        role: null,
    };
}

export function happyAgentVaultFileProject(file: VaultFile): HappyAgentVaultFile {
    const fields = happyAgentVaultItemFields(file);
    return file.kind === "file"
        ? {
              ...fields,
              kind: "file",
              latestVersion: file.latestVersion,
              size: file.size,
              sha256: file.sha256,
              mediaType: file.mediaType,
          }
        : {
              ...fields,
              kind: "artifact",
              latestVersion: file.latestVersion,
              size: file.size,
              artifact: file.artifact,
          };
}

/** A folder with a `vault.folder.updated` event's changes applied. */
export function happyAgentVaultFolderChangesApply(
    folder: HappyAgentVaultFolder,
    payload: VaultFolderUpdatedPayload,
): HappyAgentVaultFolder {
    const changes = payload.changes;
    return {
        ...folder,
        ...(changes.name === undefined ? {} : { name: changes.name }),
        ...(changes.parentId === undefined
            ? {}
            : { parentId: changes.parentId as HappyAgentVaultItemId | null }),
        ...(changes.deletedAt === undefined ? {} : { deletedAt: changes.deletedAt }),
        updatedAt: changes.updatedAt,
        updatedBy: changes.updatedBy,
        version: payload.version,
    };
}

/**
 * A file with a `vault.file.updated` event's changes applied, or `undefined`
 * when they cannot apply to it: a field its kind does not have, which only a
 * refetch settles.
 */
export function happyAgentVaultFileChangesApply(
    file: HappyAgentVaultFile,
    payload: VaultFileUpdatedPayload,
): HappyAgentVaultFile | undefined {
    const changes = payload.changes;
    const base = {
        ...file,
        ...(changes.name === undefined ? {} : { name: changes.name }),
        ...(changes.parentId === undefined
            ? {}
            : { parentId: changes.parentId as HappyAgentVaultItemId | null }),
        ...(changes.deletedAt === undefined ? {} : { deletedAt: changes.deletedAt }),
        ...(changes.latestVersion === undefined ? {} : { latestVersion: changes.latestVersion }),
        ...(changes.size === undefined ? {} : { size: changes.size }),
        updatedAt: changes.updatedAt,
        updatedBy: changes.updatedBy,
        version: payload.version,
    };
    if (base.kind === "file") {
        if (changes.artifact != null || changes.sha256 === null || changes.mediaType === null)
            return undefined;
        return {
            ...base,
            ...(changes.sha256 === undefined ? {} : { sha256: changes.sha256 }),
            ...(changes.mediaType === undefined ? {} : { mediaType: changes.mediaType }),
        };
    }
    if (changes.artifact === null || changes.sha256 != null || changes.mediaType != null)
        return undefined;
    return {
        ...base,
        ...(changes.artifact === undefined ? {} : { artifact: changes.artifact }),
    };
}

export function happyAgentVaultVersionProject(version: VaultVersion): HappyAgentVaultVersion {
    return {
        fileId: version.fileId as HappyAgentVaultItemId,
        number: version.number,
        size: version.size,
        sha256: version.sha256,
        artifact: version.artifact,
        pinned: version.pinned,
        restoredFrom: version.restoredFrom,
        createdAt: version.createdAt,
        actor: version.actor,
        source: version.source,
    };
}

export function happyAgentVaultActivityProject(activity: VaultActivity): HappyAgentVaultActivity {
    const fields = {
        id: activity.id,
        itemId: activity.itemId as HappyAgentVaultItemId,
        at: activity.at,
        actor: activity.actor,
        source: activity.source,
    };
    // The daemon's set of kinds may grow; one this build does not know is a change.
    const kind: string = activity.kind;
    switch (activity.kind) {
        case "created":
            return {
                ...fields,
                kind: "created",
                parentId: activity.parentId as HappyAgentVaultItemId | null,
                name: activity.name,
                copiedFrom: activity.copiedFrom as HappyAgentVaultItemId | null,
            };
        case "moved":
            return {
                ...fields,
                kind: "moved",
                fromParentId: activity.fromParentId as HappyAgentVaultItemId | null,
                toParentId: activity.toParentId as HappyAgentVaultItemId | null,
                fromName: activity.fromName,
                toName: activity.toName,
            };
        case "deleted":
            return { ...fields, kind: "deleted" };
        case "restored":
            return {
                ...fields,
                kind: "restored",
                parentId: activity.parentId as HappyAgentVaultItemId | null,
                name: activity.name,
            };
        case "version_created":
            return {
                ...fields,
                kind: "version_created",
                number: activity.number,
                restoredFrom: activity.restoredFrom,
            };
        case "pinned":
        case "unpinned":
            return { ...fields, kind: activity.kind, number: activity.number };
        default:
            void kind;
            return { ...fields, kind: "changed" };
    }
}

export function happyAgentVaultRetentionProject(
    retention: VaultRetention,
): HappyAgentVaultRetention {
    return {
        maxVersions: retention.maxVersions,
        maxAgeDays: retention.maxAgeDays,
        keepAllDays: retention.keepAllDays,
        thinning: retention.thinning.map((tier) => ({
            afterDays: tier.afterDays,
            everyDays: tier.everyDays,
        })),
        trashDays: retention.trashDays,
    };
}

export function happyAgentVaultRetentionWire(retention: HappyAgentVaultRetention): VaultRetention {
    return {
        maxVersions: retention.maxVersions,
        maxAgeDays: retention.maxAgeDays,
        keepAllDays: retention.keepAllDays,
        thinning: retention.thinning.map((tier) => ({ ...tier })),
        trashDays: retention.trashDays,
    };
}
