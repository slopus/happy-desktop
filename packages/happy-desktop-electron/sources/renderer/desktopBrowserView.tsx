import { Component, createElement } from "react";
import type { BrowserContentProps, BrowserController } from "happy-desktop-ui";
import type { DesktopBrowserStatus } from "../shared/desktopContract";

interface BrowserWebViewEvent extends Event {
    readonly canGoBack?: boolean;
    readonly canGoForward?: boolean;
    readonly errorCode?: number;
    readonly errorDescription?: string;
    readonly isMainFrame?: boolean;
    readonly title?: string;
    readonly url?: string;
    readonly validatedURL?: string;
}

interface BrowserWebViewElement extends HTMLElement {
    canGoBack(): boolean;
    canGoForward(): boolean;
    executeJavaScript(code: string): Promise<unknown>;
    getTitle(): string;
    getURL(): string;
    getWebContentsId(): number;
    goBack(): void;
    goForward(): void;
    loadURL(url: string): Promise<void>;
    reload(): void;
    stop(): void;
}

const browserEvents = [
    "crashed",
    "did-fail-load",
    "did-navigate",
    "did-navigate-in-page",
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
    /** Response of the navigation that is loading or has just committed. */
    private status?: DesktopBrowserStatus;
    /** Address of the newest requested navigation, for failures with no commit. */
    private requested?: string;

    private readonly controller: BrowserController = {
        browserBack: () => {
            const view = this.element;
            if (view?.canGoBack()) view.goBack();
        },
        browserForward: () => {
            const view = this.element;
            if (view?.canGoForward()) view.goForward();
        },
        browserLoad: (url) => {
            this.status = undefined;
            this.requested = url;
            void this.element?.loadURL(url).catch((error: unknown) => {
                // The rejection repeats the Chromium failure `did-fail-load`
                // already reported, but it is the only report for an address
                // Chromium refuses before it starts loading at all.
                if (this.requested !== url) return;
                this.props.browserFailed({
                    url,
                    ...browserErrorDescribe(error),
                });
            });
        },
        browserReload: () => this.element?.reload(),
        browserStop: () => this.element?.stop(),
    };

    private readonly receive = (raw: Event): void => {
        const event = raw as BrowserWebViewEvent;
        const view = this.element;
        if (!view) return;
        if (event.type === "did-start-loading") {
            this.status = undefined;
            this.props.browserLoadingChanged(true);
            return;
        }
        if (event.type === "did-stop-loading") {
            this.props.browserLoadingChanged(false);
            this.locationPublish();
            void this.statusVerify();
            return;
        }
        if (event.type === "did-fail-load") {
            // Chromium reports an intentional stop/replacement as ERR_ABORTED.
            if (event.errorCode !== -3 && event.isMainFrame !== false)
                this.props.browserFailed({
                    ...(event.errorCode === undefined ? {} : { code: event.errorCode }),
                    ...(event.errorDescription ? { description: event.errorDescription } : {}),
                    url: event.validatedURL || this.requested || view.getURL(),
                });
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
        this.statusUnsubscribe = window.happyDesktop?.browserStatusSubscribe((status) => {
            if (status.guestId !== this.element?.getWebContentsId()) return;
            this.status = status;
            void this.statusVerify();
        });
        this.proxyApply();
    }

    componentDidUpdate(before: BrowserContentProps): void {
        if (
            before.target?.workspaceId !== this.props.target?.workspaceId ||
            before.target?.connectionId !== this.props.target?.connectionId
        )
            this.proxyApply();
    }

    componentWillUnmount(): void {
        this.proxyGeneration += 1;
        this.statusUnsubscribe?.();
        this.statusUnsubscribe = undefined;
        this.elementApply(undefined);
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
        if (this.element) {
            for (const event of browserEvents) this.element.addEventListener(event, this.receive);
            this.props.browserControllerReady(this.controller);
        } else {
            this.props.browserControllerReady(undefined);
        }
    };

    private proxyApply(): void {
        const target = this.props.target;
        const desktop = window.happyDesktop;
        const generation = (this.proxyGeneration += 1);
        this.elementApply(undefined);
        if (this.state.partition) this.setState({ partition: undefined });
        if (!target || !desktop) {
            this.props.browserFailed({ message: "The browser has no Happy Agent workspace." });
            return;
        }
        void desktop.browserProxyApply(target).then(
            (partition) => {
                if (generation === this.proxyGeneration) this.setState({ partition });
            },
            (error: unknown) => {
                if (generation !== this.proxyGeneration) return;
                this.props.browserFailed({
                    message:
                        error instanceof Error
                            ? error.message
                            : "The Happy Agent browser proxy could not be opened.",
                });
            },
        );
    }

    private locationPublish(candidate?: string): void {
        const view = this.element;
        if (!view) return;
        const url = candidate || view.getURL();
        if (!url) return;
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
            src: this.props.source,
            webpreferences: "contextIsolation=yes,nodeIntegration=no,sandbox=yes",
        });
    }
}

/**
 * Recover the engine failure from a rejected `loadURL`. Electron formats these
 * as `ERR_NAME_NOT_RESOLVED (-105) loading 'https://…'`, so the panel can show
 * the same page it shows for the event-reported failure instead of a raw string.
 */
function browserErrorDescribe(error: unknown): { code?: number; description?: string } {
    const message = error instanceof Error ? error.message : String(error);
    const parsed = /^(ERR_[A-Z0-9_]+)\s+\((-?\d+)\)/u.exec(message);
    if (!parsed) return { description: message };
    return { code: Number(parsed[2]), description: parsed[1] };
}
