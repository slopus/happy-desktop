import { Component, createElement } from "react";
import type { BrowserContentProps, BrowserController } from "happy-desktop-ui";
import type {
    DesktopBrowserCommand,
    DesktopBrowserStatus,
    DesktopBrowserTunnelFailure,
} from "../shared/desktopContract";
import { GuestPageFit, type FitGuestElement } from "./guestPageFit";

interface BrowserWebViewEvent extends Event {
    readonly canGoBack?: boolean;
    readonly canGoForward?: boolean;
    readonly errorCode?: number;
    readonly errorDescription?: string;
    readonly isInPlace?: boolean;
    readonly isMainFrame?: boolean;
    readonly title?: string;
    readonly url?: string;
    readonly validatedURL?: string;
}

interface BrowserWebViewElement extends FitGuestElement {
    canGoBack(): boolean;
    canGoForward(): boolean;
    getTitle(): string;
    getURL(): string;
    getWebContentsId(): number;
}

const browserEvents = [
    "crashed",
    "did-fail-load",
    "did-navigate",
    "did-navigate-in-page",
    "did-start-navigation",
    "did-start-loading",
    "did-stop-loading",
    "dom-ready",
    "page-title-updated",
    "render-process-gone",
] as const;

/**
 * Whether the committed document shows anything at all. A 4xx/5xx response that
 * carries its own error page is a normal page and must be rendered as one; an
 * empty one leaves Electron on a blank document, which is what the panel
 * replaces with a readable failure page.
 */
const browserBodyProbe = `(() => {
    const body = document.body;
    if (!body) return false;
    if (body.innerText.trim().length > 0) return true;
    return body.querySelector("img, svg, video, canvas, iframe, form, table, input, button") !== null;
})()`;

/**
 * Electron-only adapter for BrowserPanel. The class lifecycle is the imperative
 * boundary that attaches to one `<webview>` guest and cleans every listener up;
 * it owns no visual state or styling.
 */
export class DesktopBrowserView extends Component<BrowserContentProps> {
    state: { partition?: string } = {};
    private element?: BrowserWebViewElement;
    private proxyGeneration = 0;
    private statusUnsubscribe?: () => void;
    private tunnelFailureUnsubscribe?: () => void;
    private popupUnsubscribe?: () => void;
    private networkMissingUnsubscribe?: () => void;
    /**
     * Counts main-frame navigations, the page's own links and forms included;
     * the retry a recovery issues is not one. A recovery belongs to the
     * navigation it started in.
     */
    private navigation = 0;
    /** Where the newest main-frame navigation went, committed or not. */
    private navigationUrl?: string;
    /** The address a recovery retried, until its navigation starts. */
    private recoveryRetryUrl?: string;
    /**
     * Whether this tab has already asked its agent again during the current
     * navigation. One question per navigation keeps a network that stays
     * missing from retrying forever.
     */
    private networkRecoveryUsed = false;
    /**
     * A recent tunnel failure main reported for the current navigation's
     * address. It and the engine's failure event arrive in either order, so
     * the later one shows the page with both.
     */
    private tunnelFailure?: DesktopBrowserTunnelFailure;
    private initialized = false;
    /** Response of the navigation that is loading or has just committed. */
    private status?: DesktopBrowserStatus;
    /** Address of the newest requested navigation, for failures with no commit. */
    private requested?: string;
    /** Lays the page inline while the owner asks for that; see `BrowserContentProps.fit`. */
    private readonly fitter = new GuestPageFit(() => this.props.fit);
    /** This view's own name for its inline page's profile; see `profileOpen`. */
    private readonly inlinePage = crypto.randomUUID();

    private readonly controller: BrowserController = {
        browserBack: () => {
            this.navigationStart();
            this.requested = undefined;
            this.command({ action: "back" });
        },
        browserForward: () => {
            this.navigationStart();
            this.requested = undefined;
            this.command({ action: "forward" });
        },
        browserLoad: (url) => {
            this.navigationStart();
            this.status = undefined;
            this.requested = url;
            this.command({ action: "load", url });
        },
        browserReload: () => {
            this.navigationStart();
            if (this.element?.getURL() === "about:blank" && this.requested)
                this.controller.browserLoad(this.requested);
            else this.command({ action: "reload" });
        },
        browserStop: () => {
            this.command({ action: "stop" });
            this.props.browserLoadingChanged(false);
        },
    };

    private navigationStart(): void {
        this.navigation += 1;
        this.networkRecoveryUsed = false;
        this.recoveryRetryUrl = undefined;
    }

    private command(command: DesktopBrowserCommand): void {
        const desktop = window.happyDesktop;
        const partition = this.state.partition;
        const view = this.element;
        if (!desktop?.browserNetworkCommand || !partition || !view || !this.initialized) return;
        const generation = this.proxyGeneration;
        void desktop
            .browserNetworkCommand(partition, view.getWebContentsId(), command)
            .catch((error: unknown) => {
                const described = browserErrorDescribe(error);
                // ERR_ABORTED: the navigation was stopped or replaced, as when
                // a recovered network retries it.
                if (
                    generation !== this.proxyGeneration ||
                    described.code === -3 ||
                    (command.action === "load" && this.requested !== command.url)
                )
                    return;
                const url = command.action === "load" ? command.url : view.getURL();
                this.props.browserFailed({
                    url,
                    ...described,
                    ...this.tunnelFailureMessage(url),
                });
            });
    }

    private readonly receive = (raw: Event): void => {
        const event = raw as BrowserWebViewEvent;
        const view = this.element;
        if (!view) return;
        // The blank document a guest boots on is not the page; each document
        // after it is laid inline when the owner asks.
        if (event.type === "dom-ready" && this.props.fit && view.getURL() !== "about:blank")
            this.fitter.documentReady(view);
        if (!this.initialized) {
            if (event.type === "dom-ready") {
                this.initialized = true;
                this.props.browserControllerReady(this.controller);
                if (this.props.source !== "about:blank")
                    this.controller.browserLoad(this.props.source);
                return;
            }
            if (!["crashed", "render-process-gone", "did-fail-load"].includes(event.type)) return;
        }
        if (event.type === "did-start-navigation") {
            if (event.isMainFrame === false || event.isInPlace || !event.url) return;
            this.navigationUrl = event.url;
            const retry = this.recoveryRetryUrl;
            this.recoveryRetryUrl = undefined;
            // The recovery's own retry keeps the navigation it recovers.
            if (retry !== undefined && browserSameAddress(retry, event.url)) return;
            this.navigationStart();
            return;
        }
        if (event.type === "did-start-loading") {
            this.status = undefined;
            this.tunnelFailure = undefined;
            this.props.browserLoadingChanged(true);
            return;
        }
        if (event.type === "did-stop-loading") {
            // The bootstrap blank document can finish before the requested
            // navigation has committed through the workspace proxy.
            if (
                view.getURL() === "about:blank" &&
                this.requested &&
                this.requested !== "about:blank"
            )
                return;
            this.props.browserLoadingChanged(false);
            this.locationPublish();
            void this.statusVerify();
            return;
        }
        if (event.type === "did-fail-load") {
            // Chromium reports an intentional stop/replacement as ERR_ABORTED.
            if (event.errorCode !== -3 && event.isMainFrame !== false) {
                const url = event.validatedURL || this.requested || view.getURL();
                this.props.browserFailed({
                    ...(event.errorCode === undefined ? {} : { code: event.errorCode }),
                    ...(event.errorDescription ? { description: event.errorDescription } : {}),
                    url,
                    ...this.tunnelFailureMessage(url),
                });
            }
            return;
        }
        if (event.type === "crashed" || event.type === "render-process-gone") {
            this.props.browserFailed({
                message: "This page stopped responding and was closed.",
                url: view.getURL() || this.requested,
            });
            return;
        }
        if (event.type === "page-title-updated") {
            this.props.browserTitleChanged(event.title ?? view.getTitle());
            return;
        }
        if (event.type === "dom-ready") {
            this.locationPublish();
            const title = view.getTitle();
            if (title) this.props.browserTitleChanged(title);
            return;
        }
        this.locationPublish(event.url ?? event.validatedURL);
    };

    componentDidMount(): void {
        this.tunnelFailureUnsubscribe = window.happyDesktop?.browserTunnelFailureSubscribe?.(
            (failure) => {
                if (!this.initialized) return;
                if (failure.guestId !== this.element?.getWebContentsId()) return;
                this.tunnelFailure = failure;
                this.props.browserFailed({
                    code: -111,
                    description: "ERR_TUNNEL_CONNECTION_FAILED",
                    url: failure.url,
                    message: failure.message,
                });
            },
        );
        this.popupUnsubscribe = window.happyDesktop?.browserNetworkPopupSubscribe?.((popup) => {
            if (!this.initialized) return;
            if (popup.guestId !== this.element?.getWebContentsId()) return;
            this.props.browserPopupRequested?.(popup.url);
        });
        this.networkMissingUnsubscribe = window.happyDesktop?.browserNetworkMissingSubscribe?.(
            (missing) => {
                if (!this.initialized || this.networkRecoveryUsed) return;
                if (missing.partition !== this.state.partition) return;
                this.networkRecoveryUsed = true;
                this.networkRecover();
            },
        );
        this.statusUnsubscribe = window.happyDesktop?.browserStatusSubscribe((status) => {
            if (!this.initialized) return;
            if (status.guestId !== this.element?.getWebContentsId()) return;
            this.status = status;
            void this.statusVerify();
        });
        this.proxyApply();
    }

    componentDidUpdate(before: BrowserContentProps): void {
        if (
            before.target?.workspaceId !== this.props.target?.workspaceId ||
            before.target?.connectionId !== this.props.target?.connectionId ||
            before.target?.agentId !== this.props.target?.agentId ||
            before.target?.networkId !== this.props.target?.networkId
        )
            this.proxyApply();
    }

    componentWillUnmount(): void {
        this.proxyGeneration += 1;
        this.statusUnsubscribe?.();
        this.statusUnsubscribe = undefined;
        this.tunnelFailureUnsubscribe?.();
        this.tunnelFailureUnsubscribe = undefined;
        this.popupUnsubscribe?.();
        this.popupUnsubscribe = undefined;
        this.networkMissingUnsubscribe?.();
        this.networkMissingUnsubscribe = undefined;
        this.elementApply(undefined);
        this.fitter.dispose();
        this.inlineProfileClose(this.state.partition);
    }

    /**
     * Report a committed error response that rendered nothing. Electron ships no
     * built-in error page, so a 4xx/5xx with an empty body leaves a blank guest
     * unless the panel is told to draw the failure itself.
     */
    private async statusVerify(): Promise<void> {
        const status = this.status;
        const view = this.element;
        if (!view || !status || status.status < 400) return;
        if (status.url !== view.getURL()) return;
        const rendered = await view.executeJavaScript(browserBodyProbe).catch(() => true);
        if (rendered !== false) return;
        if (this.status !== status || this.element !== view) return;
        this.props.browserFailed({
            status: status.status,
            description: status.statusText,
            url: status.url,
        });
    }

    private readonly elementApply = (view: BrowserWebViewElement | null | undefined): void => {
        if (view === this.element) return;
        if (this.element)
            for (const event of browserEvents)
                this.element.removeEventListener(event, this.receive);
        this.element = view ?? undefined;
        this.initialized = false;
        this.fitter.stop();
        if (this.element) {
            for (const event of browserEvents) this.element.addEventListener(event, this.receive);
        } else {
            this.props.browserControllerReady(undefined);
        }
    };

    private proxyApply(): void {
        const target = this.props.target;
        const desktop = window.happyDesktop;
        const generation = (this.proxyGeneration += 1);
        this.elementApply(undefined);
        this.inlineProfileClose(this.state.partition);
        if (this.state.partition) this.setState({ partition: undefined });
        if (!target || !desktop) {
            this.props.browserFailed({ message: "The browser has no Happy Agent workspace." });
            return;
        }
        // A host without network profiles would put the page on some other
        // machine's network, so it does not get to open one.
        if (
            !desktop.browserNetworkResolve ||
            !desktop.browserNetworkProfileOpen ||
            !desktop.browserNetworkCommand ||
            !desktop.browserNetworkPopupSubscribe
        ) {
            this.props.browserFailed({
                message: "Update Happy to use the workspace browser.",
            });
            return;
        }
        const failed = (error: unknown) => {
            if (generation !== this.proxyGeneration) return;
            this.props.browserFailed({
                message:
                    error instanceof Error
                        ? error.message
                        : "The Happy Agent browser proxy could not be opened.",
            });
        };
        // A tab is bound to a network once. A bound tab only ever opens that
        // network's profile; if the network has ended, its tunnels are refused
        // and the tab is not moved to whatever the agent names now.
        if (target.networkId === undefined) {
            // Bind the tab this view was asked for, even if the view has moved
            // on by the time the agent answers. A page with no tab to bind —
            // one laid inline into a conversation — opens the network itself.
            const bind = this.props.browserNetworkResolved;
            void desktop
                .browserNetworkResolve({
                    connectionId: target.connectionId,
                    workspaceId: target.workspaceId,
                    agentId: target.agentId,
                })
                .then((networkId) => {
                    if (bind) bind(networkId);
                    else if (generation === this.proxyGeneration)
                        this.profileOpen(target.connectionId, networkId, generation, failed);
                }, failed);
            return;
        }
        this.profileOpen(target.connectionId, target.networkId, generation, failed);
    }

    private profileOpen(
        connectionId: string | null,
        networkId: string,
        generation: number,
        failed: (error: unknown) => void,
    ): void {
        // A page laid inline gets a profile of its own for as long as it is
        // mounted, never the workspace browser's, whose logins it must not see.
        // Each attempt names its own, so one abandoned midway is closed alone.
        const page = this.props.fit ? `${this.inlinePage}-${String(generation)}` : undefined;
        void window.happyDesktop
            ?.browserNetworkProfileOpen?.({ connectionId, networkId, page })
            .then((partition) => {
                if (generation === this.proxyGeneration) this.setState({ partition });
                else if (page !== undefined) this.inlineProfileClose(partition);
            }, failed);
    }

    private inlineProfileClose(partition: string | undefined): void {
        if (partition === undefined || !this.props.fit) return;
        void window.happyDesktop?.browserNetworkProfileClose?.(partition).catch(() => undefined);
    }

    /**
     * Happy Agent no longer knows this tab's network. A network can be missing
     * only until its agent is asked for it again, so ask the tab's own agent
     * once: the same network is retried in the same profile; any other one is
     * a different network, which this tab never moves to.
     */
    private networkRecover(): void {
        const desktop = window.happyDesktop;
        const target = this.props.target;
        const partition = this.state.partition;
        if (!desktop?.browserNetworkResolve || !target?.networkId || !partition) return;
        const bound = target.networkId;
        const generation = this.proxyGeneration;
        const navigation = this.navigation;
        // An answer that arrives after the reader navigated, or after the view
        // moved to another tab, belongs to nothing on screen.
        const current = () =>
            generation === this.proxyGeneration &&
            navigation === this.navigation &&
            partition === this.state.partition;
        void desktop
            .browserNetworkResolve({
                connectionId: target.connectionId,
                workspaceId: target.workspaceId,
                agentId: target.agentId,
            })
            .then(
                (networkId) => {
                    const view = this.element;
                    if (!current() || !view) return;
                    const url = this.navigationUrl ?? view.getURL();
                    if (networkId !== bound) {
                        this.props.browserFailed({
                            message:
                                "This tab's network has ended, and its agent now uses another one. Open a new tab to continue.",
                            ...(url ? { url } : {}),
                        });
                        return;
                    }
                    const retry = url && url !== "about:blank" ? url : undefined;
                    this.recoveryRetryUrl = retry ?? view.getURL();
                    this.command(retry ? { action: "load", url: retry } : { action: "reload" });
                },
                (error: unknown) => {
                    if (!current()) return;
                    this.props.browserFailed({
                        message:
                            error instanceof Error
                                ? error.message
                                : "This tab's network could not be found again.",
                    });
                },
            );
    }

    /** The tunnel's own reason, when main reported one for this address. */
    private tunnelFailureMessage(url: string): { message?: string } {
        const failure = this.tunnelFailure;
        return failure && browserSameAddress(failure.url, url) ? { message: failure.message } : {};
    }

    private locationPublish(candidate?: string): void {
        const view = this.element;
        if (!view) return;
        const url = candidate || view.getURL();
        if (!url) return;
        if (url === "about:blank" && this.requested && this.requested !== "about:blank") return;
        this.props.browserLocationChanged(url, view.canGoBack(), view.canGoForward());
    }

    render() {
        if (!this.state.partition)
            return createElement("div", {
                "data-happy-browser-proxy-loading": "",
            });
        return createElement("webview", {
            allowpopups: "",
            "data-happy-browser-guest": "",
            partition: this.state.partition,
            ref: this.elementApply,
            src: "about:blank",
            webpreferences: "contextIsolation=yes,nodeIntegration=no,sandbox=yes",
        });
    }
}

function browserSameAddress(first: string, second: string): boolean {
    try {
        return new URL(first).href === new URL(second).href;
    } catch {
        return first === second;
    }
}

/**
 * Recover the engine failure from a rejected `loadURL`. Electron formats these
 * as `ERR_NAME_NOT_RESOLVED (-105) loading 'https://…'`, behind the IPC error's
 * own prefix, and sometimes without the name, so the panel can show the same
 * page it shows for the event-reported failure instead of a raw string.
 */
function browserErrorDescribe(error: unknown): { code?: number; description?: string } {
    const message = error instanceof Error ? error.message : String(error);
    const parsed = /(ERR_[A-Z0-9_]+)?\s*\((-?\d+)\) loading '/u.exec(message);
    if (!parsed) return { description: message };
    return { code: Number(parsed[2]), ...(parsed[1] ? { description: parsed[1] } : {}) };
}
