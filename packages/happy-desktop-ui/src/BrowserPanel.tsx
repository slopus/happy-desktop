import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Icon, type IconName } from "./Icon";
import { Ionicon } from "./vectorIcons/VectorIcon";
import type { InlinePageFit } from "./inlinePageFit";
import { TextField } from "./TextField";

export interface BrowserController {
    browserBack(): void;
    browserForward(): void;
    browserLoad(url: string): void;
    browserReload(): void;
    browserStop(): void;
    /** Opens developer tools for the page alone, where the host allows inspecting it. */
    browserDevToolsOpen?(): void;
}

/**
 * One failed navigation, described by the host in the terms its engine reports.
 * The panel turns this into the page a person reads; the host writes no copy.
 */
export interface BrowserFailure {
    /** Chromium network error code, when the network stack refused the load. */
    readonly code?: number;
    /** Engine failure name (`ERR_NAME_NOT_RESOLVED`) or HTTP status text. */
    readonly description?: string;
    /** HTTP status of a committed response that rendered nothing readable. */
    readonly status?: number;
    /** Host-level explanation when the failure is not the page's own network result. */
    readonly message?: string;
    /** Address that failed, so a commit elsewhere can retire this failure. */
    readonly url?: string;
}

export interface BrowserContentProps {
    /** A host can retain a guest beyond the displaying component's lifetime. */
    readonly retention?: {
        readonly id: string;
        readonly owner: BrowserGuestOwner;
    };
    /** The browser's own start/error page covers the native guest. */
    readonly visible?: boolean;
    /** Where the page's traffic leaves from, and whose profile it runs in. */
    readonly target?: BrowserContentTarget;
    /** Initial location for the Chromium guest. Further navigation uses the controller. */
    readonly source: string;
    browserControllerReady(controller: BrowserController | undefined): void;
    browserLoadingChanged(loading: boolean): void;
    browserLocationChanged(url: string, canGoBack: boolean, canGoForward: boolean): void;
    browserTitleChanged(title: string): void;
    browserFailed(failure: BrowserFailure): void;
    /** The tab's agent named its network; the tab is bound to it from now on. */
    browserNetworkResolved?(networkId: string): void;
    /** The page asked to open another page, which belongs on the same network. */
    browserPopupRequested?(url: string): void;
    /**
     * The page is laid inline into a conversation: the engine lays it out at its
     * content height in the chat's colour scheme, never scrolls inside it, and
     * reports each height. Absent, the page fills the region it is given.
     */
    readonly fit?: InlinePageFit;
}

/** Where a browser page's traffic leaves from, and whose profile it runs in. */
export type BrowserContentTarget =
    /**
     * A workspace browser tab: owning workspace, host-published Happy Agent
     * route, the agent the tab was opened for, and the network it is bound to
     * once that has been named. Every tab on one network shares its profile.
     */
    | {
          readonly connectionId: string | null;
          readonly workspaceId: string;
          readonly agentId: string;
          readonly networkId?: string;
          readonly artifactId?: undefined;
      }
    /**
     * A live artifact's page, on the network the artifact was made on, through
     * that artifact's own restricted proxy, in a browser profile of the
     * artifact's own, shared with no tab, page, or other artifact.
     */
    | {
          readonly connectionId: string | null;
          readonly artifactId: string;
          readonly networkId: string;
          /**
           * The agent asked again for the network when Happy Agent no longer
           * knows it; the page is retried only if that agent names the same
           * network. Absent, a missing network fails closed.
           */
          readonly recovery?: { readonly workspaceId: string; readonly agentId: string };
      };

/** One authoritative subscription for all browser lifetimes in a workspace. */
export interface BrowserGuestOwner {
    get(): {
        readonly browserTabs: readonly { readonly id: string; readonly networkId?: string }[];
    };
    subscribe(listener: () => void): () => void;
}

/** Native browser-content adapter supplied by the host (Electron in production). */
export type BrowserContentRenderer = (props: BrowserContentProps) => ReactNode;

/** One thing a new tab can become instead of a page. */
export interface BrowserStartTool {
    readonly id: string;
    readonly icon: IconName;
    readonly label: string;
    onSelect(): void;
}

/** A page this browser visited, offered again on a new tab. */
export interface BrowserStartPage {
    readonly url: string;
    readonly label: string;
}

export interface BrowserPanelProps {
    /** Keeps inactive browser guests mounted so page/history state survives tab switches. */
    active: boolean;
    initialUrl: string;
    renderContent?: BrowserContentRenderer;
    onLocationChange?(url: string): void;
    onTitleChange?(title: string): void;
    /** Why Happy Agent-bound browser navigation is unavailable while the guest remains mounted. */
    unavailable?: string;
    /**
     * The page may be inspected — a live artifact's page — so the toolbar
     * keeps a place for developer tools, usable once the host offers them.
     */
    inspectable?: boolean;
    /**
     * What a tab that has not been anywhere yet shows under its address: the
     * tools it can become, then the pages this browser visited.
     */
    start?: {
        readonly tools: readonly BrowserStartTool[];
        readonly recent: readonly BrowserStartPage[];
    };
}

interface BrowserViewState {
    readonly address: string;
    /**
     * Whether the address is the reader's draft rather than the page's
     * location. A page that commits a redirect or a hash change while the
     * reader is halfway through typing must not replace what they typed; the
     * location is written back once the draft is submitted or abandoned.
     */
    readonly editing: boolean;
    readonly canGoBack: boolean;
    readonly canGoForward: boolean;
    readonly failure?: BrowserFailure;
    readonly loading: boolean;
    /** Whether the tab has not navigated anywhere yet, so it is still a new tab. */
    readonly fresh: boolean;
}

/**
 * The page history of a tab drawn without a host renderer, where an iframe
 * stands in for the guest. A frame does not report a cross-origin page's own
 * navigations, so this history holds the addresses the reader loaded.
 */
interface BrowserFrameHistory {
    readonly entries: readonly string[];
    readonly index: number;
    /** Bumped to load the current entry again. */
    readonly reloads: number;
}

/**
 * Browser panel — compact desktop browser chrome around a host-supplied page
 * renderer. The visual component knows no Electron or IPC API: the host receives
 * a narrow controller/events contract, while Blueprint can supply inert content.
 *
 * The address draft and live navigation affordances are local UI state owned by
 * this reusable surface. Cookies, storage, history, redirects, downloads, and
 * page execution remain entirely inside the host's Chromium guest.
 */
export function BrowserPanel(props: BrowserPanelProps) {
    const [controller, controllerSet] = useState<BrowserController | undefined>(undefined);
    // Keep the guest's mount source stable. Main-frame navigation is imperative;
    // rewriting `src` after every redirect would restart the page.
    const [source] = useState(props.initialUrl);
    // A tab opened on nothing has nothing to read, so the address is the one
    // thing on it worth typing into, and it takes the caret as the tab opens —
    // the way a browser's new tab hands its omnibox to the reader.
    const blank = props.initialUrl === "about:blank";
    const [view, viewSet] = useState<BrowserViewState>({
        address: blank ? "" : props.initialUrl,
        editing: false,
        canGoBack: false,
        canGoForward: false,
        loading: !blank,
        fresh: blank,
    });
    const [frame, frameSet] = useState<BrowserFrameHistory>({
        entries: blank ? [] : [props.initialUrl],
        index: blank ? -1 : 0,
        reloads: 0,
    });
    const framed = props.renderContent === undefined;
    const canGoBack = framed ? frame.index > 0 : view.canGoBack;
    const canGoForward = framed ? frame.index < frame.entries.length - 1 : view.canGoForward;

    const load = (url: string) => {
        if (props.unavailable !== undefined) return;
        viewSet((current) => ({
            ...current,
            address: url,
            editing: false,
            failure: undefined,
            loading: true,
            fresh: false,
        }));
        if (!framed) {
            controller?.browserLoad(url);
            return;
        }
        frameSet((current) => ({
            entries: [...current.entries.slice(0, current.index + 1), url],
            index: current.index + 1,
            reloads: current.reloads,
        }));
        props.onLocationChange?.(url);
    };

    const frameStep = (step: number) => {
        const url = frame.entries[frame.index + step];
        if (url === undefined) return;
        frameSet((current) => ({ ...current, index: current.index + step }));
        viewSet((current) => ({ ...current, address: url, editing: false, loading: true }));
        props.onLocationChange?.(url);
    };

    const navigate = () => {
        const url = browserAddressResolve(view.address);
        if (url) load(url);
    };

    const retry = () => {
        const url = view.failure?.url ?? browserAddressResolve(view.address);
        if (url) load(url);
    };

    return (
        <section
            className="happy-browser-panel"
            data-unavailable={props.unavailable === undefined ? undefined : ""}
            data-happy-desktop-ui="browser-panel"
            hidden={!props.active}
        >
            <div className="happy-browser-panel__toolbar" data-happy-desktop-ui="browser-toolbar">
                <Button
                    aria-label="Back"
                    disabled={props.unavailable !== undefined || !canGoBack}
                    iconOnly
                    onClick={() => (framed ? frameStep(-1) : controller?.browserBack())}
                    size="small"
                    variant="ghost"
                >
                    <Ionicon name="arrow-back-outline" size={14} />
                </Button>
                <Button
                    aria-label="Forward"
                    disabled={props.unavailable !== undefined || !canGoForward}
                    iconOnly
                    onClick={() => (framed ? frameStep(1) : controller?.browserForward())}
                    size="small"
                    variant="ghost"
                >
                    <Ionicon name="arrow-forward-outline" size={14} />
                </Button>
                <Button
                    aria-label={view.loading ? "Stop loading" : "Reload"}
                    disabled={props.unavailable !== undefined}
                    iconOnly
                    onClick={() => {
                        if (framed) {
                            if (view.loading)
                                viewSet((current) => ({ ...current, loading: false }));
                            else if (frame.index >= 0) {
                                frameSet((current) => ({
                                    ...current,
                                    reloads: current.reloads + 1,
                                }));
                                viewSet((current) => ({ ...current, loading: true }));
                            }
                        } else if (view.loading) controller?.browserStop();
                        // A failed navigation may never have committed, so its
                        // history entry cannot be reloaded — load the address again.
                        else if (view.failure) retry();
                        else controller?.browserReload();
                    }}
                    size="small"
                    variant="ghost"
                >
                    <Ionicon name={view.loading ? "close-outline" : "reload-outline"} size={14} />
                </Button>
                <TextField
                    aria-label="Address and search"
                    autoFocus={blank}
                    className="happy-browser-panel__address"
                    fullWidth
                    leadingIcon={view.address.startsWith("https://") ? "lock" : "globe"}
                    onBlur={() => viewSet((current) => ({ ...current, editing: false }))}
                    onSubmit={navigate}
                    onValueChange={(address) =>
                        viewSet((current) => ({ ...current, address, editing: true }))
                    }
                    placeholder="Search or enter a URL"
                    size="small"
                    value={view.address}
                />
                {props.inspectable ? (
                    <Button
                        aria-label="Open developer tools"
                        disabled={
                            props.unavailable !== undefined || !controller?.browserDevToolsOpen
                        }
                        iconOnly
                        onClick={() => controller?.browserDevToolsOpen?.()}
                        size="small"
                        title="Developer tools"
                        variant="ghost"
                    >
                        <Ionicon name="code-slash-outline" size={14} />
                    </Button>
                ) : null}
            </div>
            {props.unavailable ? (
                <div
                    className="happy-browser-panel__unavailable"
                    data-happy-desktop-ui="browser-unavailable"
                    role="status"
                >
                    {props.unavailable}
                </div>
            ) : null}
            <div className="happy-browser-panel__content" data-happy-desktop-ui="browser-content">
                {props.renderContent ? (
                    props.renderContent({
                        source,
                        visible: !view.failure && !view.fresh,
                        browserControllerReady(next) {
                            controllerSet(next);
                        },
                        browserLoadingChanged(loading) {
                            // A new navigation retires the previous error page;
                            // finishing one must not, because the failure that
                            // produced it is reported before loading stops.
                            viewSet((current) => ({
                                ...current,
                                failure: loading ? undefined : current.failure,
                                loading,
                            }));
                        },
                        browserLocationChanged(url, canGoBack, canGoForward) {
                            viewSet((current) => ({
                                ...current,
                                // The page's location, unless the reader is in
                                // the middle of typing over it.
                                address: current.editing
                                    ? current.address
                                    : url === "about:blank"
                                      ? ""
                                      : url,
                                canGoBack,
                                canGoForward,
                                // The guest keeps reporting the failed address
                                // after a failure; only a different document
                                // means there is something to show again.
                                failure:
                                    current.failure?.url && current.failure.url !== url
                                        ? undefined
                                        : current.failure,
                            }));
                            props.onLocationChange?.(url);
                        },
                        browserTitleChanged(title) {
                            props.onTitleChange?.(title);
                        },
                        browserFailed(failure) {
                            if (props.unavailable !== undefined) return;
                            viewSet((current) => ({
                                ...current,
                                failure,
                                loading: false,
                            }));
                        },
                    })
                ) : frame.entries[frame.index] !== undefined ? (
                    // Without the host's guest the page is framed instead, which
                    // a site may refuse; the frame then stays blank.
                    <iframe
                        className="happy-browser-panel__frame"
                        key={`${String(frame.index)}:${String(frame.reloads)}`}
                        onLoad={() => viewSet((current) => ({ ...current, loading: false }))}
                        referrerPolicy="no-referrer"
                        sandbox="allow-forms allow-popups allow-scripts"
                        src={frame.entries[frame.index]}
                        title={view.address}
                    />
                ) : null}
                {props.start && view.fresh && !view.failure ? (
                    <BrowserStart
                        onPageOpen={load}
                        recent={props.start.recent}
                        tools={props.start.tools}
                    />
                ) : null}
                {view.failure
                    ? ((page) => (
                          <div
                              className="happy-browser-panel__error"
                              data-happy-desktop-ui="browser-error"
                              role="alert"
                          >
                              <EmptyState
                                  {...(props.unavailable === undefined
                                      ? { action: { label: "Try again", onClick: retry } }
                                      : {})}
                                  description={page.description}
                                  icon={page.icon}
                                  // Content-sized, so the raw engine code stays
                                  // grouped under the action instead of being
                                  // pushed to the bottom of a filled region.
                                  size="inline"
                                  title={page.title}
                              />
                              <p
                                  className="happy-browser-panel__error-code"
                                  data-happy-desktop-ui="browser-error-code"
                              >
                                  {page.code}
                              </p>
                          </div>
                      ))(browserFailureDescribe(view.failure))
                    : null}
            </div>
        </section>
    );
}

function BrowserStart(props: {
    tools: readonly BrowserStartTool[];
    recent: readonly BrowserStartPage[];
    onPageOpen: (url: string) => void;
}) {
    return (
        <nav className="happy-browser-panel__start" data-happy-desktop-ui="browser-start">
            <div className="happy-browser-panel__start-list">
                {props.tools.map((tool) => (
                    <button
                        className="happy-browser-panel__start-row"
                        key={tool.id}
                        onClick={tool.onSelect}
                        type="button"
                    >
                        <span className="happy-browser-panel__start-icon">
                            <Icon name={tool.icon} size={16} />
                        </span>
                        <span className="happy-browser-panel__start-label">{tool.label}</span>
                    </button>
                ))}
                {props.recent.length > 0 ? (
                    <>
                        <h3 className="happy-browser-panel__start-heading">Recent</h3>
                        {props.recent.map((page) => (
                            <button
                                className="happy-browser-panel__start-row"
                                key={page.url}
                                onClick={() => props.onPageOpen(page.url)}
                                title={page.url}
                                type="button"
                            >
                                <span className="happy-browser-panel__start-icon">
                                    <Icon name="globe" size={16} />
                                </span>
                                <span className="happy-browser-panel__start-label">
                                    {page.label}
                                </span>
                            </button>
                        ))}
                    </>
                ) : null}
            </div>
        </nav>
    );
}

export interface BrowserFailurePage {
    readonly code: string;
    readonly description: string;
    readonly icon: IconName;
    readonly title: string;
}

/**
 * Turn one engine-level failure into the page a person reads. The wording
 * follows the browser conventions people already know, names the host that
 * failed, and always ends with the raw engine code so a developer debugging a
 * local service still sees exactly what Chromium reported.
 */
export function browserFailureDescribe(failure: BrowserFailure): BrowserFailurePage {
    const host = browserFailureHost(failure.url);
    const code =
        failure.status !== undefined
            ? `HTTP ERROR ${failure.status}`
            : (failure.description ?? (failure.code !== undefined ? `ERROR ${failure.code}` : ""));
    const page = (title: string, description: string, icon: IconName = "globe") => ({
        code,
        description,
        icon,
        title,
    });
    if (failure.message) return page("This page could not be loaded", failure.message);
    if (failure.status !== undefined)
        return page(
            "This page isn’t working",
            `${host} could not handle this request${failure.description ? ` (${failure.description})` : ""}.`,
        );
    switch (failure.code) {
        case -105: // ERR_NAME_NOT_RESOLVED
            return page(
                "This site can’t be reached",
                `${host}’s server address could not be found.`,
            );
        case -102: // ERR_CONNECTION_REFUSED
            return page("This site can’t be reached", `${host} refused to connect.`);
        case -104: // ERR_CONNECTION_FAILED
        case -109: // ERR_ADDRESS_UNREACHABLE
            return page("This site can’t be reached", `${host} is unreachable.`);
        case -7: // ERR_TIMED_OUT
        case -118: // ERR_CONNECTION_TIMED_OUT
            return page("This site can’t be reached", `${host} took too long to respond.`);
        case -101: // ERR_CONNECTION_RESET
        case -100: // ERR_CONNECTION_CLOSED
            return page("This site can’t be reached", `The connection to ${host} was interrupted.`);
        case -106: // ERR_INTERNET_DISCONNECTED
            return page("No internet connection", "This computer is offline.");
        case -324: // ERR_EMPTY_RESPONSE
            return page("This page isn’t working", `${host} did not send any data.`);
        case -6: // ERR_FILE_NOT_FOUND
            return page("This page could not be found", `Nothing is served at this address.`);
        case -300: // ERR_INVALID_URL
            return page("That address isn’t valid", "Check the address and try again.");
        default:
            break;
    }
    // The certificate range Chromium reserves for a rejected secure connection.
    if (failure.code !== undefined && failure.code <= -200 && failure.code > -220)
        return page(
            "Your connection isn’t private",
            `The security certificate for ${host} could not be verified.`,
            "lock",
        );
    return page("This page could not be loaded", `${host} did not return a page.`);
}

/** Host label for failure copy; a malformed address is described as typed. */
function browserFailureHost(url: string | undefined): string {
    if (!url) return "This site";
    try {
        return new URL(url).host || url;
    } catch {
        return url;
    }
}

/** Chromium-like omnibox resolution: URL/host first, otherwise a web search. */
function browserAddressResolve(value: string): string | undefined {
    const candidate = value.trim();
    if (!candidate) return undefined;
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch {
        // A host name or search query has no scheme yet.
    }
    if (!/\s/u.test(candidate) && browserHostLike(candidate)) {
        const local = /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)(?::\d+)?(?:\/|$)/iu.test(
            candidate,
        );
        try {
            return new URL(`${local ? "http" : "https"}://${candidate}`).href;
        } catch {
            // Fall through to search for malformed host-like text.
        }
    }
    return `https://www.google.com/search?q=${encodeURIComponent(candidate)}`;
}

function browserHostLike(value: string): boolean {
    return (
        /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3}|\[?[a-f0-9:]+\]?)(?::\d+)?(?:\/|$)/iu.test(value) ||
        /^[^\s/]+\.[^\s/]+(?::\d+)?(?:\/|$)/u.test(value)
    );
}
