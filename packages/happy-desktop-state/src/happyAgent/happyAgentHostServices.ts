import type { HappyAgentComponent } from "../artifacts/artifactComponentStore.js";
import type { TerminalConnection } from "../transport.js";
import type { HappyAgentDeviceBridgeHost } from "./happyAgentDeviceBridgeHost.js";
import type {
    HappyAgentGroupId,
    HappyAgentOpenInTarget,
    HappyAgentOpenInTargets,
    HappyAgentTerminalId,
    HappyAgentWorkspaceFileBytes,
} from "./happyAgentTypes.js";

/** What the host made of a request to serve an HTML artifact version as a site. */
export type HappyAgentArtifactSiteOpening =
    | { readonly type: "opened"; readonly url: string }
    /**
     * The desktop app this renderer runs in predates artifact sites. The
     * renderer is updated on its own, so it can be newer than the app around
     * it; updating the app is what lets the page run.
     */
    | { readonly type: "app-outdated" };

/**
 * Desktop-local services that are not Happy Agent product resources.
 *
 * The state package talks to Happy Agent directly for every `/v0` read and
 * mutation. This boundary is intentionally limited to work that needs the
 * desktop host: launching another application, turning local bytes into an
 * isolated preview asset, placing an attachment chosen by the user, and
 * attaching the terminal's binary WebSocket protocol.
 */
export interface HappyAgentHostServices {
    openInTargetsRead(): Promise<HappyAgentOpenInTargets>;
    /**
     * Hands the group's directory to that application, and records it as the one
     * this machine opened a project in most recently. The whole target is passed
     * because the host is what remembers the choice across a reload, and the
     * control that wears it needs the label and the icon, not only the id.
     */
    openIn(groupId: HappyAgentGroupId, target: HappyAgentOpenInTarget): Promise<void>;
    workspaceFileBytesRead(
        groupId: HappyAgentGroupId,
        path: string,
        signal?: AbortSignal,
    ): Promise<HappyAgentWorkspaceFileBytes>;
    htmlPreviewOpen(groupId: HappyAgentGroupId, path: string): Promise<string>;
    /**
     * Serves one numbered version of an HTML artifact as a site of its own and
     * names the address of its entry. Absent where the host has no isolated
     * guest to show such a site in. Rejects when the host serves sites and
     * could not serve this one.
     */
    artifactSiteOpen?(artifactId: string, version: number): Promise<HappyAgentArtifactSiteOpening>;
    /**
     * Serves one standard component — a chart, diagram, code quote, or file
     * list a reply holds — as a page of its own, drawn by Happy Agent's
     * standard components, and names its address. Absent where the host has
     * no isolated guest to show such a page in.
     */
    componentSiteOpen?(component: HappyAgentComponent): Promise<HappyAgentArtifactSiteOpening>;
    /**
     * Where a file the reader chose lives on this machine, when it lives
     * anywhere. A pasted screenshot exists only in the browser and answers
     * undefined, as does a host that cannot tell.
     */
    attachmentSourcePath(file: File): string | undefined;
    /**
     * Whether an agent working in this group could open that path as it stands,
     * because its work and the reader's disk are the same machine. When they
     * are, an attachment needs no transfer at all and is named where it lies.
     * A container workspace and a Happy Agent on another machine both answer false, and
     * the caller sends the bytes instead.
     */
    attachmentSourceReachable(groupId: HappyAgentGroupId, sourcePath: string): Promise<boolean>;
    /** Places an attachment by value, as base64. The route for bytes with no path. */
    attachmentWrite(
        groupId: HappyAgentGroupId,
        name: string,
        content: string,
    ): Promise<{ readonly path: string }>;
    terminalConnect(
        workspaceId: HappyAgentGroupId,
        terminalId: HappyAgentTerminalId,
    ): TerminalConnection;
    /**
     * USB devices, Bluetooth adapters, and ports of this computer, bridged to
     * a workspace of this Happy Agent. Absent where there is nothing to bridge
     * to: the machine's own Happy Agent is this computer.
     */
    readonly deviceBridges?: HappyAgentDeviceBridgeHost;
}
