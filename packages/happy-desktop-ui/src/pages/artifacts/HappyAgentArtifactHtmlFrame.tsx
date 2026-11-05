import type { HappyAgentArtifactStaticReason } from "happy-desktop-state";
import { Banner, type BannerTone } from "../../Banner";
import { artifactHtmlDocument } from "./artifactHtmlDocument";

export interface HappyAgentArtifactHtmlFrameProps {
    /** The entry's path in the version, which every reference in it is relative to. */
    entryPath: string;
    /** The entry's markup. */
    text: string;
    /** The version's other files by path, as `data:` URLs. */
    assets: ReadonlyMap<string, string>;
    /** Files too large to hand to the page, which it will find missing. */
    omitted: readonly string[];
    /**
     * Why the page is drawn here rather than run. The reader is told only when
     * it is something they can act on: an app to update or a page that failed.
     */
    reason: HappyAgentArtifactStaticReason;
    /** The page's name, for anyone who cannot see it. */
    title: string;
}

/**
 * An HTML artifact shown as a static page.
 *
 * The page is built from its own files alone and handed to a `srcdoc` frame
 * whose sandbox grants no script and no origin: it is a stranger's markup in
 * the app's own window, so it gets nothing that window holds — not its
 * credentials, not its storage, not a way to reach the daemon. The only grant
 * is a link opening outside the frame, where the window decides where a web
 * address goes. Where the app can run the page but is too old to, or failed
 * to, that is said above it, since the reader can do something about either.
 */
export function HappyAgentArtifactHtmlFrame(props: HappyAgentArtifactHtmlFrameProps) {
    const document = artifactHtmlDocument({
        assets: props.assets,
        entryPath: props.entryPath,
        text: props.text,
    });
    return (
        <div
            className="happy-agent-artifact-html"
            data-happy-desktop-ui="happy-agent-artifact-html"
        >
            {props.reason.type === "no-guest" ? null : (
                <div
                    className="happy-agent-artifact-html__notice"
                    data-reason={props.reason.type}
                    data-testid="happy-agent-artifact-static-notice"
                >
                    <StaticNotice omitted={props.omitted.length} reason={props.reason} />
                </div>
            )}
            <iframe
                className="happy-agent-artifact-html__frame"
                data-happy-desktop-ui="happy-agent-artifact-html-frame"
                referrerPolicy="no-referrer"
                // No `allow-scripts` and no `allow-same-origin`: the page is
                // inert markup in an opaque origin. Popups let a link to the
                // web leave the frame through the window's own link handling.
                sandbox="allow-popups"
                srcDoc={document}
                title={props.title}
            />
        </div>
    );
}

/** What the reader is told above a static page: why it is not running, and what is missing. */
function StaticNotice(props: {
    reason: Exclude<HappyAgentArtifactStaticReason, { readonly type: "no-guest" }>;
    omitted: number;
}) {
    const missing =
        props.omitted > 0
            ? ` ${String(props.omitted)} large ${props.omitted === 1 ? "file is" : "files are"} also left out of it.`
            : "";
    const notice: { tone: BannerTone; title: string; text: string } =
        props.reason.type === "app-outdated"
            ? {
                  tone: "warning",
                  title: "Update Happy to run this app",
                  text: `This version of Happy shows the app without running its scripts. Update Happy and restart it to run the app live.${missing}`,
              }
            : {
                  tone: "danger",
                  title: "The app could not be run",
                  text: `${props.reason.error.message} This is a static preview of it, without its scripts.${missing}`,
              };
    return (
        <Banner tone={notice.tone} title={notice.title}>
            {notice.text}
        </Banner>
    );
}
