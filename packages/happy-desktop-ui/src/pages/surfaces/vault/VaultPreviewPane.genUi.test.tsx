import { expect, it } from "vitest";
import type {
    HappyAgentSurfaceId,
    HappyAgentVaultFile,
    HappyAgentVaultItemId,
    HappyAgentVaultPreview,
} from "happy-desktop-state";
import "../../../theme.css";
import "../../../styles.css";
import type { GenUiAction } from "../../../genUi/genUiRender";
import { createRenderer } from "../../../testing";
import { VaultPreviewPane } from "./VaultPreviewPane";

const compiled = import.meta.glob<string>("../../../../dev/assets/genui/11-release.render.json", {
    eager: true,
    import: "default",
    query: "?raw",
});
const render = Object.values(compiled)[0] ?? "";

const actor = { userId: null, agentId: "agent-1" };
const app: HappyAgentVaultFile = {
    kind: "artifact",
    id: "app-1" as HappyAgentVaultItemId,
    surfaceId: "surface-1" as HappyAgentSurfaceId,
    parentId: null,
    name: "Release.artifact",
    createdAt: 1,
    createdBy: actor,
    updatedAt: 1,
    updatedBy: actor,
    deletedAt: null,
    version: "r-1",
    latestVersion: 1,
    size: render.length,
    artifact: { type: "gen_ui", entry: "index.genui.json", fileCount: 2 },
};

function preview(content: HappyAgentVaultPreview["content"]): HappyAgentVaultPreview {
    return {
        itemId: app.id,
        file: app,
        path: "/Release.artifact",
        inTrash: false,
        versionShown: 1,
        content,
        panel: "preview",
        history: { status: "loading" },
    };
}

const noop = () => {};

it("draws a Gen UI vault app from its render document and runs its actions through the host", async () => {
    const reported: GenUiAction[] = [];
    const view = createRenderer();
    view.render(
        () => (
            <div style={{ display: "flex", flexDirection: "column", width: 720, height: 900 }}>
                <VaultPreviewPane
                    genUi={{
                        actionsSupported: new Set(["copy"]),
                        onAction: (_key, action) => {
                            reported.push(action);
                        },
                    }}
                    items={new Map([[app.id, app]])}
                    names={{ viewerUserId: null, people: new Map(), agents: new Map() }}
                    now={2}
                    onDownload={async () => {}}
                    onHistoryMoreLoad={noop}
                    onPanelChange={noop}
                    onTrashRestore={noop}
                    onVersionPinnedChange={noop}
                    onVersionRestore={noop}
                    onVersionSelect={noop}
                    preview={preview({ type: "genUiArtifact", render, files: new Map() })}
                    rootName="Vault"
                    zone={{ locale: "en-US", timeZone: "UTC" }}
                />
            </div>
        ),
        { width: 760, height: 940, padding: 16 },
    );
    await view.ready();
    const drawn = view.container.querySelector(
        '[data-testid="happy-vault-preview-gen-ui"] [data-happy-desktop-ui="gen-ui"]',
    );
    expect(drawn).not.toBeNull();
    expect(drawn?.textContent).toContain("Release 2.41");
    /* The vault host runs copy but has no chat, so message buttons stay unavailable. */
    const ship = [...view.container.querySelectorAll<HTMLButtonElement>(".gen-ui-button")].find(
        (button) => button.textContent?.includes("Ship it"),
    );
    expect(ship?.disabled).toBe(true);
    expect(reported).toEqual([]);
});
