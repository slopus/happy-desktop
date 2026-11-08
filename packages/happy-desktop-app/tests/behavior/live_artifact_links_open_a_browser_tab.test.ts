import { expect, it } from "vitest";
import {
    happyAgentPanelStoreCreate,
    type HappyAgentArtifactId,
    type HappyAgentArtifactLiveTarget,
    type HappyAgentArtifactTitle,
    type HappyAgentArtifacts,
    type HappyAgentGroupId,
    type HappyAgentSessionId,
    type HappyAgentTerminalHandle,
} from "happy-desktop-state";
import { artifactBesideOpen } from "../../sources/artifactOpen";

/*
 * A live artifact is a web page. Following a link to one, or opening it beside
 * the chat from its inline row, opens a browser tab bound to that artifact —
 * its own proxy, the network it was made on, its own profile — never the
 * artifact viewer, and a second open selects the tab already showing it.
 * Every other artifact still opens in the viewer.
 */

const GROUP = "grp_a" as HappyAgentGroupId;
const AGENT = "ses_a" as HappyAgentSessionId;
const LIVE = "art_live" as HappyAgentArtifactId;
const DOC = "art_doc" as HappyAgentArtifactId;
const live = { url: "http://localhost:5173/", networkId: "net_agent" };

function title(overrides: Partial<Extract<HappyAgentArtifactTitle, { type: "ready" }>>) {
    return {
        type: "ready",
        title: "OpenArm world-model playground",
        artifactType: "html",
        status: "active",
        latestVersion: 2,
        cover: null,
        summary: null,
        background: null,
        live: null,
        ...overrides,
    } satisfies HappyAgentArtifactTitle;
}

function open(titles: ReadonlyMap<HappyAgentArtifactId, HappyAgentArtifactTitle>) {
    const reads: { artifactId: HappyAgentArtifactId; version?: number }[] = [];
    const answers = new Map<string, HappyAgentArtifactLiveTarget>();
    const artifacts = {
        titles: () => ({ get: () => titles }),
        liveRead: async (artifactId: HappyAgentArtifactId, version?: number) => {
            reads.push({ artifactId, ...(version === undefined ? {} : { version }) });
            return answers.get(`${artifactId}@${String(version)}`);
        },
    } as unknown as HappyAgentArtifacts;
    const panel = happyAgentPanelStoreCreate({
        terminalOpen: () => ({}) as unknown as HappyAgentTerminalHandle,
    });
    panel.scopeApply(GROUP, AGENT);
    return { artifacts, panel, reads, answers };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

it("opens a live artifact's link as a browser tab bound to the artifact, then focuses it", () => {
    const { artifacts, panel, reads } = open(new Map([[LIVE, title({ live })]]));
    artifactBesideOpen({ artifacts, panel, artifactId: LIVE });
    const tab = panel.get().tabs[0];
    expect(panel.get().tabs).toEqual([
        {
            id: tab?.id,
            kind: "browser",
            label: "OpenArm world-model playground",
            placement: "panel",
            url: "http://localhost:5173/",
            workspaceId: GROUP,
            agentId: AGENT,
            networkId: "net_agent",
            artifactId: LIVE,
        },
    ]);
    expect(panel.get().artifactView).toBeUndefined();
    expect(panel.get().activeViewId).toBe(tab?.id);

    panel.filesSelect();
    artifactBesideOpen({ artifacts, panel, artifactId: LIVE });
    expect(panel.get().tabs).toHaveLength(1);
    expect(panel.get().activeViewId).toBe(tab?.id);
    // Known from the titles the transcript holds: nothing is read.
    expect(reads).toEqual([]);
});

it("opens any other artifact in the viewer", () => {
    const { artifacts, panel } = open(
        new Map([[DOC, title({ artifactType: "markdown", title: "Notes" })]]),
    );
    artifactBesideOpen({ artifacts, panel, artifactId: DOC, version: 2 });
    expect(panel.get().tabs).toEqual([]);
    expect(panel.get().artifactView).toEqual({ artifactId: DOC, version: 2 });
});

it("reads an artifact it does not know yet, and a pinned version's own address", async () => {
    const { artifacts, panel, reads, answers } = open(new Map([[LIVE, title({ live })]]));
    answers.set(`${LIVE}@1`, {
        title: "OpenArm world-model playground",
        live: { url: "http://localhost:4000/", networkId: "net_agent" },
    });
    artifactBesideOpen({ artifacts, panel, artifactId: LIVE, version: 1 });
    expect(panel.get().tabs).toEqual([]);
    await settle();
    expect(reads).toEqual([{ artifactId: LIVE, version: 1 }]);
    expect(panel.get().tabs).toMatchObject([
        { kind: "browser", artifactId: LIVE, url: "http://localhost:4000/" },
    ]);

    // One that turns out not to be live opens in the viewer.
    artifactBesideOpen({ artifacts, panel, artifactId: DOC });
    await settle();
    expect(panel.get().artifactView).toEqual({ artifactId: DOC });
});

it("opens a live artifact named outside a conversation where it says, when there is no tab", () => {
    const { artifacts } = open(new Map([[LIVE, title({ live })]]));
    const panel = happyAgentPanelStoreCreate({
        terminalOpen: () => ({}) as unknown as HappyAgentTerminalHandle,
    });
    let pageOpened = 0;
    artifactBesideOpen({
        artifacts,
        panel,
        artifactId: LIVE,
        otherwise: () => (pageOpened += 1),
    });
    expect(pageOpened).toBe(1);
    expect(panel.get().tabs).toEqual([]);
});
