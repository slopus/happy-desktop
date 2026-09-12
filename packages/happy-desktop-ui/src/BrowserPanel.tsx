import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import type { IconName } from "./Icon";
import { Ionicon } from "./vectorIcons/VectorIcon";
import { TextField } from "./TextField";

export interface BrowserController {
    browserBack(): void;
    browserForward(): void;
    browserLoad(url: string): void;
    browserReload(): void;
    browserStop(): void;
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
    /** Owning workspace and host-published Happy Agent route. No chat is required. */
    readonly target?: {
        readonly connectionId: string | null;
        readonly workspaceId: string;
    };
    /** Initial location for the Chromium guest. Further navigation uses the controller. */
    readonly source: string;
    browserControllerReady(controller: BrowserController | undefined): void;
    browserLoadingChanged(loading: boolean): void;
    browserLocationChanged(url: string, canGoBack: boolean, canGoForward: boolean): void;
    browserTitleChanged(title: string): void;
    browserFailed(failure: BrowserFailure): void;
}

/** Native browser-content adapter supplied by the host (Electron in production). */
export type BrowserContentRenderer = (props: BrowserContentProps) => ReactNode;

export interface BrowserPanelProps {
    /** Keeps inactive browser guests mounted so page/history state survives tab switches. */
    active: boolean;
    initialUrl: string;
    renderContent?: BrowserContentRenderer;
    onLocationChange?(url: string): void;
    onTitleChange?(title: string): void;
    /** Why Happy Agent-bound browser navigation is unavailable while the guest remains mounted. */
    unavailable?: string;
}

interface BrowserViewState {
    readonly address: string;
    readonly canGoBack: boolean;
    readonly canGoForward: boolean;
    readonly failure?: BrowserFailure;
    readonly loading: boolean;
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
    const [view, viewSet] = useState<BrowserViewState>({
        address: props.initialUrl === "about:blank" ? "" : props.initialUrl,
        canGoBack: false,
        canGoForward: false,
        loading: props.initialUrl !== "about:blank",
    });

    const load = (url: string) => {
        if (props.unavailable !== undefined) return;
        viewSet((current) => ({ ...current, address: url, failure: undefined, loading: true }));
        controller?.browserLoad(url);
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
                    disabled={props.unavailable !== undefined || !view.canGoBack}
                    iconOnly
                    onClick={() => controller?.browserBack()}
                    size="small"
                    variant="ghost"
                >
                    <Ionicon name="arrow-back-outline" size={14} />
                </Button>
                <Button
                    aria-label="Forward"
                    disabled={props.unavailable !== undefined || !view.canGoForward}
                    iconOnly
                    onClick={() => controller?.browserForward()}
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
                        if (view.loading) controller?.browserStop();
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
                    className="happy-browser-panel__address"
                    fullWidth
                    leadingIcon={view.address.startsWith("https://") ? "lock" : "globe"}
                    onSubmit={navigate}
                    onValueChange={(address) =>
                        viewSet((current) => ({ ...current, address, error: undefined }))
                    }
                    placeholder="Search or enter address"
                    size="small"
                    value={view.address}
                />
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
                                address: url === "about:blank" ? "" : url,
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
                ) : (
                    <EmptyState
                        description="The browser content renderer is not connected."
                        icon="globe"
                        size="panel"
                        title="Browser unavailable"
                    />
                )}
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

interface BrowserFailurePage {
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
function browserFailureDescribe(failure: BrowserFailure): BrowserFailurePage {
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
