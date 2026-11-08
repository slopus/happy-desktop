import type {
    HappyAgentArtifactId,
    HappyAgentArtifacts,
    HappyAgentPanelStore,
} from "happy-desktop-state";

/**
 * Opens an artifact beside the conversation. A live artifact is a web page,
 * so it opens as a browser tab bound to that artifact — its own restricted
 * proxy, the network it was made on, and a browser profile of its own — and a
 * tab already showing it is selected rather than a second one added. Every
 * other artifact, and a live one with no conversation to hold its tab, goes
 * to `otherwise`, which defaults to the panel's artifact viewer.
 *
 * Whether it is live is read from the titles the transcript already holds;
 * an artifact not read yet is asked for once, and opens when it answers.
 */
export function artifactBesideOpen(input: {
    readonly artifacts: HappyAgentArtifacts;
    readonly panel: HappyAgentPanelStore;
    readonly artifactId: HappyAgentArtifactId;
    readonly version?: number;
    /** Where an artifact that is not a live page opens instead of the panel's viewer. */
    readonly otherwise?: () => void;
    /** Called once a live artifact's tab is shown, as when its panel is out of sight. */
    readonly liveOpened?: () => void;
}): void {
    const { artifacts, panel, artifactId, version } = input;
    const otherwise = input.otherwise ?? (() => panel.artifactViewOpen(artifactId, version));
    const held = artifacts.titles().get().get(artifactId);
    if (held?.type === "missing" || (held?.type === "ready" && held.status === "deleted")) {
        otherwise();
        return;
    }
    if (held?.type === "ready" && (version === undefined || version === held.latestVersion)) {
        if (held.live !== null && panel.artifactBrowserOpen(artifactId, held.live, held.title))
            input.liveOpened?.();
        else otherwise();
        return;
    }
    void artifacts.liveRead(artifactId, version).then((target) => {
        if (
            target !== undefined &&
            panel.artifactBrowserOpen(artifactId, target.live, target.title)
        )
            input.liveOpened?.();
        else otherwise();
    });
}
