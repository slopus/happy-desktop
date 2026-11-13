import { GEN_UI_RENDER_PATH } from "@slopus/happy-agent-client";
import { expect, it } from "vitest";
import type { HappyAgentSurfaceId } from "./surfaceTypes.js";
import {
    happyAgentVaultContentRead,
    type HappyAgentVaultContentDeps,
} from "./surfaceVaultContent.js";
import type { HappyAgentVaultFile, HappyAgentVaultItemId } from "./surfaceVaultTypes.js";

const SURFACE = "surface-1" as HappyAgentSurfaceId;
const RENDER = '{"genuiRender":1,"root":"t","elements":{}}';

const genUiApp = {
    id: "app-1" as HappyAgentVaultItemId,
    surfaceId: SURFACE,
    parentId: null,
    name: "Trip.artifact",
    kind: "artifact",
    latestVersion: 3,
    size: 2_000,
    artifact: { type: "gen_ui", entry: "index.genui.json", fileCount: 3 },
} as unknown as HappyAgentVaultFile;

/* Only the calls a Gen UI version makes; any other read fails the test. */
function deps(read: string[]): HappyAgentVaultContentDeps {
    return {
        surfaceId: SURFACE,
        client: {
            getVaultVersion: async (_surface, fileId, number) =>
                ({
                    version: {
                        fileId,
                        number,
                        artifact: {
                            type: "gen_ui",
                            entry: "index.genui.json",
                            files: [
                                { path: "index.genui.json", size: 100, sha256: "a" },
                                { path: GEN_UI_RENDER_PATH, size: 200, sha256: "b" },
                                { path: "assets/lake.jpg", size: 1_700, sha256: "c" },
                            ],
                        },
                    },
                }) as never,
            getVaultArtifactFile: async (_surface, _fileId, number, path) => {
                read.push(`${String(number)}:${path}`);
                return { data: new TextEncoder().encode(RENDER).buffer } as never;
            },
            vaultArtifactFileUrl: (_surface, fileId, number, path) =>
                `https://vault.test/${fileId}/${String(number)}/${path}`,
            getVaultFileContent: () => {
                throw new Error("a Gen UI app reads no plain file");
            },
            vaultFileContentUrl: () => {
                throw new Error("a Gen UI app reads no plain file");
            },
        },
    };
}

it("reads a Gen UI app's compiled render document and links its files to the same version", async () => {
    const read: string[] = [];
    const { content } = await happyAgentVaultContentRead(
        deps(read),
        genUiApp,
        2,
        new AbortController().signal,
    );
    expect(read).toEqual([`2:${GEN_UI_RENDER_PATH}`]);
    expect(content.type).toBe("genUiArtifact");
    if (content.type !== "genUiArtifact") return;
    expect(content.render).toBe(RENDER);
    expect(content.files.get("assets/lake.jpg")).toBe("https://vault.test/app-1/2/assets/lake.jpg");
});
