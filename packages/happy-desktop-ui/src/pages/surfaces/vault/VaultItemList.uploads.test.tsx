import { useSyncExternalStore } from "react";
import { expect, it } from "vitest";
import {
    UserError,
    type HappyAgentSurfaceId,
    type HappyAgentVaultItem,
    type HappyAgentVaultItemId,
    type HappyAgentVaultRow,
    type HappyAgentVaultUpload,
} from "happy-desktop-state";
import "../../../theme.css";
import "../../../styles.css";
import { createRenderer } from "../../../testing";
import { VaultItemList } from "./VaultItemList";

const actor = { userId: null, agentId: null };
const id = (value: string) => value as HappyAgentVaultItemId;

function file(itemId: string, name: string): HappyAgentVaultItem {
    return {
        kind: "file",
        id: id(itemId),
        surfaceId: "surface-1" as HappyAgentSurfaceId,
        parentId: null,
        name,
        createdAt: 1,
        createdBy: actor,
        updatedAt: 1,
        updatedBy: actor,
        deletedAt: null,
        version: "r-1",
        latestVersion: 1,
        size: 2_048,
        sha256: "x",
        mediaType: "text/plain",
    };
}

const sending: HappyAgentVaultUpload = {
    id: "up-b",
    itemId: id("b"),
    name: "beta.txt",
    kind: "file",
    mediaType: "text/plain",
    folderId: null,
    size: 4_000_000,
    sent: 1_000_000,
    phase: "sending",
};
const alpha: HappyAgentVaultRow = { kind: "item", id: id("a"), item: file("a", "alpha.txt") };
const gamma: HappyAgentVaultRow = { kind: "item", id: id("c"), item: file("c", "gamma.txt") };
const beta = file("b", "beta.txt");

/** The rows the store publishes as an upload goes from sending to landed. */
const PHASES: readonly (readonly HappyAgentVaultRow[])[] = [
    [alpha, { kind: "upload", id: id("b"), name: "beta.txt", upload: sending }, gamma],
    [
        alpha,
        {
            kind: "upload",
            id: id("b"),
            name: "beta.txt",
            upload: {
                ...sending,
                phase: "failed",
                error: new UserError("Lost."),
                retryable: true,
            },
        },
        gamma,
    ],
    [alpha, { kind: "upload", id: id("b"), name: "beta.txt", upload: sending }, gamma],
    [
        alpha,
        { kind: "item", id: id("b"), item: beta, upload: { ...sending, phase: "placing" } },
        gamma,
    ],
    [alpha, { kind: "item", id: id("b"), item: beta }, gamma],
];

let rows = PHASES[0]!;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};
const noop = () => {};

function Harness() {
    const shown = useSyncExternalStore(subscribe, () => rows);
    return (
        <div style={{ display: "flex", flexDirection: "column", width: 640, height: 480 }}>
            <VaultItemList
                empty={null}
                label="Vault"
                mode={{ kind: "folder" }}
                now={1}
                onDelete={noop}
                onMenu={noop}
                onOpen={noop}
                onRestore={noop}
                onSelect={noop}
                rows={shown}
                zone={{ locale: "en-US", timeZone: "UTC" }}
            />
        </div>
    );
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

it("turns an upload's row into its item's in place: same node, same box, no second row", async () => {
    const view = createRenderer();
    view.render(() => <Harness />, { width: 680, height: 520, padding: 16 });
    await view.ready();
    const drawn = () => [
        ...view.container.querySelectorAll<HTMLElement>('[data-happy-desktop-ui="vault-row"]'),
    ];
    const first = drawn();
    expect(first.map((row) => row.textContent)).toEqual([
        expect.stringContaining("alpha.txt"),
        expect.stringContaining("beta.txt"),
        expect.stringContaining("gamma.txt"),
    ]);
    expect(first[1]!.hasAttribute("data-pending")).toBe(true);
    const boxes = first.map((row) => row.getBoundingClientRect().toJSON() as DOMRect);

    for (const next of PHASES.slice(1)) {
        rows = next;
        for (const listener of listeners) listener();
        await frame();
        const now = drawn();
        expect(now).toHaveLength(3);
        // The very same nodes, in the same order, in the same boxes.
        now.forEach((row, index) => {
            expect(row).toBe(first[index]);
            expect(row.getBoundingClientRect().toJSON()).toEqual(boxes[index]);
        });
    }
    expect(first[1]!.hasAttribute("data-pending")).toBe(false);
    expect(first[1]!.getAttribute("data-vault-entry")).toBe("b");
    expect(first[1]!.textContent).toContain("2 KB");
});
