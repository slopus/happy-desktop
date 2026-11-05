import {
    artifactPageAppModeScript,
    artifactPageHostObserve,
    artifactPageHostStyle,
    type ArtifactPagePlacement,
} from "happy-desktop-ui";

/** The guest calls styling an artifact's page needs. */
export interface StyleGuestElement extends HTMLElement {
    executeJavaScript(code: string): Promise<unknown>;
    /** Electron forwards the options to the guest's `webContents.insertCSS`. */
    insertCSS(css: string, options?: { readonly cssOrigin?: "user" | "author" }): Promise<string>;
    removeInsertedCSS(key: string): Promise<void>;
}

/**
 * Happy's standard styles, read by the page from the address every artifact
 * page is told to link them from, so a page that does not link them still
 * gets them and their one definition stays the daemon's.
 */
const STANDARD_STYLES_READ =
    "fetch('/api/v1/style.css').then((response) => (response.ok ? response.text() : ''), () => '')";

/**
 * Makes an artifact's page read as part of the surface it is shown on: the
 * app's resolved colours, typefaces, scrollbar, colour scheme, and the inset
 * its placement calls for, plus Happy's standard styles where the page did not
 * link them.
 *
 * Everything goes into the page's user origin, which ranks below every rule of
 * the page's own whatever its specificity or order: a page that styles itself
 * wins, and one that does not looks like the app. The host values are inserted
 * as soon as the document is committed, before it is parsed, and again
 * whenever the app's appearance changes, so a theme change follows through
 * without a reload. A page that declares itself an app has its root marked
 * as one at the same moment.
 */
export class GuestPageStyle {
    private generation = 0;
    private guest?: StyleGuestElement;
    private hostKey?: string;
    /** The standard styles as this view's daemon serves them, read once. */
    private standard?: Promise<string>;
    private unobserve?: () => void;

    /** `placement` is read each time the page is styled, so it is always the view's current one. */
    constructor(private readonly placement: () => ArtifactPagePlacement) {}

    /** A new document was committed in `guest`; style it before it is drawn. */
    documentStarted(guest: StyleGuestElement): void {
        const generation = ++this.generation;
        if (this.guest !== guest) {
            this.unobserve?.();
            this.unobserve = artifactPageHostObserve(guest, this.appearanceChanged);
        }
        this.guest = guest;
        this.hostKey = undefined;
        this.hostApply(guest, generation);
        this.standardApply(guest, generation);
        // A guest that is already gone has no document left to mark.
        guest.executeJavaScript(artifactPageAppModeScript()).catch(() => undefined);
    }

    /** Stops styling: the guest is gone, or another one replaced it. */
    stop(): void {
        this.generation += 1;
        this.guest = undefined;
        this.hostKey = undefined;
        this.unobserve?.();
        this.unobserve = undefined;
    }

    private hostApply(guest: StyleGuestElement, generation: number): void {
        const previous = this.hostKey;
        guest.insertCSS(artifactPageHostStyle(guest, this.placement()), { cssOrigin: "user" }).then(
            (key) => {
                if (generation !== this.generation) return;
                this.hostKey = key;
                if (previous !== undefined)
                    guest.removeInsertedCSS(previous).catch(() => undefined);
            },
            // A guest that is already gone has no document left to style.
            () => undefined,
        );
    }

    private standardApply(guest: StyleGuestElement, generation: number): void {
        const standard = (this.standard ??= guest
            .executeJavaScript(STANDARD_STYLES_READ)
            .then((css) => (typeof css === "string" ? css : "")));
        standard.then(
            (css) => {
                if (generation !== this.generation || css === "") return;
                guest.insertCSS(css, { cssOrigin: "user" }).catch(() => undefined);
            },
            () => {
                // The document went away mid-read; the next one reads again.
                if (this.standard === standard) this.standard = undefined;
            },
        );
    }

    /** The app turned light or dark; the page follows without reloading. */
    private readonly appearanceChanged = (): void => {
        if (this.guest) this.hostApply(this.guest, this.generation);
    };
}
