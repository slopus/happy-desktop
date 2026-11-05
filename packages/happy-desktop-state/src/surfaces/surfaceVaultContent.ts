import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { HappyAgentArtifactSiteOpening } from "../happyAgent/happyAgentHostServices.js";
import { happyAgentUserError } from "../happyAgent/happyAgentSupport.js";
import { happyAgentArtifactPageModeRead } from "../artifacts/artifactPageMode.js";
import type { HappyAgentArtifactStaticReason } from "../artifacts/artifactViewerStore.js";
import { UserError } from "../types.js";
import type { HappyAgentSurfaceId } from "./surfaceTypes.js";
import type { HappyAgentVaultContent, HappyAgentVaultFile } from "./surfaceVaultTypes.js";

/** The largest file read whole to be shown as text. */
const TEXT_MAX_BYTES = 4 * 1024 * 1024;
/** The largest PDF read whole for the host's viewer. */
const DOCUMENT_MAX_BYTES = 128 * 1024 * 1024;
/** What a static page preview inlines, as the artifact viewer bounds it. */
const HTML_ASSET_MAX_BYTES = 8 * 1024 * 1024;
const HTML_ASSETS_MAX_BYTES = 24 * 1024 * 1024;

export interface HappyAgentVaultContentDeps {
    readonly client: Pick<
        HappyAgentClient,
        | "getVaultFileContent"
        | "vaultFileContentUrl"
        | "getVaultVersion"
        | "getVaultArtifactFile"
        | "vaultArtifactFileUrl"
    >;
    readonly surfaceId: HappyAgentSurfaceId;
    /**
     * Serves an artifact's HTML version as a live site and names its item
     * page's address. Absent, the page is shown as a static preview.
     */
    readonly siteOpen?: (
        surfaceId: HappyAgentSurfaceId,
        fileId: string,
        version: number,
    ) => Promise<HappyAgentArtifactSiteOpening>;
}

/** What a version shows, and what to let go of once it is no longer shown. */
export interface HappyAgentVaultContentRead {
    readonly content: HappyAgentVaultContent;
    readonly release?: () => void;
}

/** How the preview reads a file, from its media type: by address, whole as a document, or as text. */
function fileView(mediaType: string): "url" | "document" | "text" {
    if (/^(image|video|audio)\//u.test(mediaType)) return "url";
    if (mediaType === "application/pdf") return "document";
    return "text";
}

function base64Of(data: ArrayBuffer): string {
    const bytes = new Uint8Array(data);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
}

/** The bytes as text, or `undefined` when they are not UTF-8 text. */
function textOf(data: ArrayBuffer): string | undefined {
    const bytes = new Uint8Array(data);
    if (bytes.includes(0)) return undefined;
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        return undefined;
    }
}

/**
 * Reads what one numbered version of a file or an artifact shows. Every
 * address names a numbered version, never `latest`, so a page and everything
 * it refers to come from the same version and can be cached for good.
 */
export async function happyAgentVaultContentRead(
    deps: HappyAgentVaultContentDeps,
    vaultFile: HappyAgentVaultFile,
    number: number,
    signal: AbortSignal,
): Promise<HappyAgentVaultContentRead> {
    const { client, surfaceId } = deps;
    if (vaultFile.kind === "file") {
        const view = fileView(vaultFile.mediaType);
        if (view === "url")
            return {
                content: {
                    type: "url",
                    url: client.vaultFileContentUrl(surfaceId, vaultFile.id, number),
                },
            };
        const version = await client.getVaultVersion(surfaceId, vaultFile.id, number, { signal });
        const size = version.version.size;
        if (view === "document") {
            if (size > DOCUMENT_MAX_BYTES || typeof URL.createObjectURL !== "function")
                return { content: { type: "unavailable", reason: "large" } };
            const file = await client.getVaultFileContent(surfaceId, vaultFile.id, number, {
                signal,
            });
            if (file === null) throw new UserError("The file could not be read.");
            const url = URL.createObjectURL(new Blob([file.data], { type: vaultFile.mediaType }));
            return { content: { type: "url", url }, release: () => URL.revokeObjectURL(url) };
        }
        if (size > TEXT_MAX_BYTES) return { content: { type: "unavailable", reason: "large" } };
        const file = await client.getVaultFileContent(surfaceId, vaultFile.id, number, { signal });
        if (file === null) throw new UserError("The file could not be read.");
        const text = textOf(file.data);
        return {
            content:
                text === undefined
                    ? { type: "unavailable", reason: "binary" }
                    : { type: "text", text },
        };
    }
    const { version } = await client.getVaultVersion(surfaceId, vaultFile.id, number, { signal });
    const manifest = version.artifact;
    if (manifest === null || !("files" in manifest))
        throw new UserError("This version of the site could not be read.");
    const fileText = async (path: string): Promise<ArrayBuffer> => {
        const file = await client.getVaultArtifactFile(surfaceId, vaultFile.id, number, path, {
            signal,
        });
        if (file === null) throw new UserError("The site's file could not be read.");
        return file.data;
    };
    const entryPath = manifest.entry;
    if (manifest.type === "markdown")
        return {
            content: {
                type: "markdownSite",
                entryPath,
                text: new TextDecoder().decode(await fileText(entryPath)),
                files: new Map(
                    manifest.files.map((file) => [
                        file.path,
                        client.vaultArtifactFileUrl(surfaceId, vaultFile.id, number, file.path),
                    ]),
                ),
            },
        };
    const entryText = fileText(entryPath).then((data) => new TextDecoder().decode(data));
    entryText.catch(() => undefined);
    let reason: HappyAgentArtifactStaticReason = { type: "no-guest" };
    if (deps.siteOpen) {
        const opening = await deps.siteOpen(surfaceId, vaultFile.id, number).then(
            (value) => value,
            (error: unknown) => ({ type: "failed" as const, error: happyAgentUserError(error) }),
        );
        if (opening.type === "opened") {
            const pageMode = await entryText.then(
                happyAgentArtifactPageModeRead,
                () => "page" as const,
            );
            return {
                content: {
                    type: "htmlSite",
                    entryPath,
                    page: { kind: "site", url: opening.url },
                    pageMode,
                },
            };
        }
        reason = opening;
    }
    const text = await entryText;
    const assets = new Map<string, string>();
    const omitted: string[] = [];
    let budget = HTML_ASSETS_MAX_BYTES;
    for (const file of manifest.files) {
        if (file.path === entryPath) continue;
        if (file.size > HTML_ASSET_MAX_BYTES || file.size > budget) {
            omitted.push(file.path);
            continue;
        }
        budget -= file.size;
        const data = await fileText(file.path);
        assets.set(file.path, `data:${file.mimeType};base64,${base64Of(data)}`);
    }
    return {
        content: {
            type: "htmlSite",
            entryPath,
            page: { kind: "static", reason, text, assets, omitted },
            pageMode: happyAgentArtifactPageModeRead(text),
        },
    };
}
