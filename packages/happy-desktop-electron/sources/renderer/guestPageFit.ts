import type { InlinePageFit } from "happy-desktop-ui";
import { guestFitScript, guestFitHeight } from "../shared/guestFitScript";

/** The guest calls a fitted page needs: its own document's styles and scripts. */
export interface FitGuestElement extends HTMLElement {
    executeJavaScript(code: string): Promise<unknown>;
    getWebContentsId(): number;
    insertCSS(css: string): Promise<string>;
    removeInsertedCSS(key: string): Promise<void>;
}

/**
 * The styles a page laid inline into a conversation is given.
 *
 * The chat's colour scheme replaces whatever the page asked for, so a page
 * that follows `light dark` is drawn in the conversation's, and the page is
 * laid out at its content height: a root or body sized to the viewport would
 * otherwise measure as whatever height it was last given, and nothing inside
 * an inline page ever scrolls. Happy's standard styles inset a page shown on a
 * surface of its own; inline, it lines up with the reply around it instead.
 */
function fitStyles(scheme: "light" | "dark"): string {
    return [
        `:root { color-scheme: ${scheme} !important; --happy-page-inset: 0px; }`,
        "html, body { height: auto !important; min-height: 0 !important; max-height: none !important; overflow: hidden !important; }",
    ].join("\n");
}

/** The colour scheme the conversation around a guest is drawn in. */
function hostColorScheme(element: HTMLElement): "light" | "dark" {
    const declared = getComputedStyle(element).colorScheme;
    const dark = declared.includes("dark");
    const light = declared.includes("light");
    if (dark !== light) return dark ? "dark" : "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * The guest's next content height. Main measures it in a world of the guest's
 * own, out of the page's reach; a host from before that could only measure in
 * the page's world, where the page may misreport its height within the cap.
 */
function guestHeightNext(guest: FitGuestElement, previous: number): Promise<unknown> {
    const measure = window.happyDesktop?.guestFitMeasure;
    if (measure) return measure(guest.getWebContentsId(), previous);
    return guest.executeJavaScript(guestFitScript(previous));
}

/**
 * Lays one guest's page inline: gives every document it loads the
 * conversation's colour scheme and its content height, and reports each
 * height that document settles on to the fit the view currently holds.
 *
 * The view owns the guest; this only follows the newest document in it, so a
 * height a previous document was still owed is never reported for the next.
 */
export class GuestPageFit {
    private generation = 0;
    private guest?: FitGuestElement;
    private stylesKey?: string;
    private readonly schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    /** `fit` is read each time a height arrives, so it is always the view's current one. */
    constructor(private readonly fit: () => InlinePageFit | undefined) {
        this.schemeQuery.addEventListener("change", this.schemeChanged);
    }

    /** A new document is ready in `guest`: style it and follow its height. */
    documentReady(guest: FitGuestElement): void {
        const generation = ++this.generation;
        this.guest = guest;
        this.stylesKey = undefined;
        this.stylesApply(guest, generation);
        let previous = -1;
        const follow = (): void => {
            guestHeightNext(guest, previous).then(
                (reported) => {
                    const height = guestFitHeight(reported);
                    if (generation !== this.generation || height === undefined) return;
                    // Poll against what the page measured, not the capped height,
                    // or a page taller than the cap would answer every call at once.
                    previous = reported as number;
                    this.fit()?.heightChanged(height);
                    follow();
                },
                // The document went away mid-call; the next one starts again.
                () => undefined,
            );
        };
        follow();
    }

    /** Stops following: the guest is gone, or no longer fitted. */
    stop(): void {
        this.generation += 1;
        this.guest = undefined;
        this.stylesKey = undefined;
    }

    dispose(): void {
        this.stop();
        this.schemeQuery.removeEventListener("change", this.schemeChanged);
    }

    private stylesApply(guest: FitGuestElement, generation: number): void {
        const previous = this.stylesKey;
        guest.insertCSS(fitStyles(hostColorScheme(guest))).then(
            (key) => {
                if (generation !== this.generation) return;
                this.stylesKey = key;
                if (previous !== undefined)
                    guest.removeInsertedCSS(previous).catch(() => undefined);
            },
            () => undefined,
        );
    }

    /** The conversation turned light or dark; the page follows without reloading. */
    private readonly schemeChanged = (): void => {
        if (this.guest) this.stylesApply(this.guest, this.generation);
    };
}
