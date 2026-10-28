import { randomUUID } from "node:crypto";
import {
    app,
    dialog,
    Menu,
    shell,
    type BrowserWindow,
    type IpcMainEvent,
    type WebContents,
    type WebFrameMain,
} from "electron";
import {
    browserPasswordGuestChannel,
    browserPasswordGuestDeliveryChannel,
    type BrowserPasswordGuestDelivery,
    type BrowserPasswordGuestField,
    type BrowserPasswordGuestFieldKind,
} from "../shared/browserPasswordGuestContract";
import { BrowserLoginCryptoCancelledError } from "./browserLoginCrypto";
import {
    browserLoginRelation,
    BrowserLoginUseError,
    type BrowserLoginCandidate,
    type BrowserLoginSourceList,
} from "./browserLoginSources";

interface GuestDocument {
    readonly frame: WebFrameMain;
    readonly origin: string;
    readonly generation: number;
    readonly nonce: string;
    readonly token: string;
    readonly expiresAt: number;
    fieldId: string | null;
    fieldKind: BrowserPasswordGuestFieldKind | null;
}

export interface BrowserPasswordGuestOptions {
    readonly guest: WebContents;
    readonly window: BrowserWindow;
    /** Every source's saved logins for one page origin, read on demand. */
    readonly logins: (origin: string) => Promise<BrowserLoginSourceList>;
}

/**
 * Attach only to an admitted network guest. This module never exports a fill action:
 * its sole fill authorization is a click callback owned by a native Menu instance.
 */
export function browserPasswordGuestAttach(options: BrowserPasswordGuestOptions): {
    pickerOpen(): void;
    dispose(): void;
} {
    const { guest, window, logins } = options;
    const guestIpc = guest.ipc;
    // will-attach-webview owns the sandbox, isolated-world and preload settings;
    // Electron has no public API for re-reading a guest's WebPreferences here.
    if (guest.hostWebContents !== window.webContents) {
        throw new Error("Password access requires an isolated network browser.");
    }

    let disposed = false;
    let navigating = false;
    let generation = 0;
    let document: GuestDocument | null = null;
    let documentTimer: ReturnType<typeof setTimeout> | undefined;
    let menu: Menu | null = null;
    let menuTimer: ReturnType<typeof setTimeout> | undefined;
    let pickerPending = false;
    let pickerGeneration = 0;
    let probePending: {
        readonly document: GuestDocument;
        readonly requestId: string;
        readonly finish: (eligible: boolean) => void;
    } | null = null;

    function owned(): boolean {
        return (
            !disposed &&
            !guest.isDestroyed() &&
            !window.isDestroyed() &&
            !window.webContents.isDestroyed() &&
            guest.hostWebContents === window.webContents
        );
    }

    function originOf(frame: WebFrameMain): string | null {
        try {
            if (frame.detached || frame !== guest.mainFrame || frame.parent !== null) return null;
            const origin = frame.origin;
            const url = new URL(frame.url);
            return new URL(origin).protocol === "https:" &&
                new URL(origin).origin === origin &&
                url.protocol === "https:" &&
                url.origin === origin
                ? origin
                : null;
        } catch {
            return null;
        }
    }

    function current(expected: GuestDocument): boolean {
        return (
            owned() &&
            !navigating &&
            document === expected &&
            expected.generation === generation &&
            Date.now() < expected.expiresAt &&
            originOf(expected.frame) === expected.origin
        );
    }

    function send(frame: WebFrameMain, message: BrowserPasswordGuestDelivery): void {
        // Callers check the authoritative frame immediately before delivery. A navigation
        // after this send is also rejected by the receiving document's private token.
        frame.send(browserPasswordGuestDeliveryChannel, message);
    }

    function invalidate(): void {
        const old = document;
        document = null;
        clearTimeout(documentTimer);
        generation += 1;
        pickerGeneration += 1;
        pickerPending = false;
        clearTimeout(menuTimer);
        try {
            menu?.closePopup(window);
        } catch {
            /* Window already closed. */
        }
        menu = null;
        probePending?.finish(false);
        probePending = null;
        if (old && owned()) {
            try {
                send(old.frame, { type: "invalidate", token: old.token });
            } catch {
                /* Detached frame. */
            }
        }
    }

    /** One short native sheet, as the browser's other prompts are; never OS error text. */
    async function errorShow(message: string, detail?: string): Promise<void> {
        if (!owned()) return;
        try {
            await dialog.showMessageBox(window, {
                type: "error",
                title: "Saved logins",
                message,
                ...(detail ? { detail } : {}),
                buttons: ["OK"],
                noLink: true,
            });
        } catch {
            /* Window closed. Never forward OS errors or credential-bearing exceptions. */
        }
    }

    /**
     * macOS 27 keeps some browsers' folders private to the browser itself and
     * records the refusal as a per-app switch under Files & Folders. Only the
     * person can turn it on, so this says where; Happy changes no setting.
     */
    async function accessDeniedExplain(browser: string): Promise<void> {
        if (!owned()) return;
        try {
            const { response } = await dialog.showMessageBox(window, {
                type: "info",
                title: "Saved logins",
                message: `macOS blocked access to ${browser}’s saved logins`,
                detail:
                    `To let ${app.getName()} read them, open System Settings › Privacy & Security › ` +
                    `Files & Folders, find ${app.getName()}, and turn on ${browserAppName(browser)}. ` +
                    "Then click the sign-in field again.",
                buttons: ["Open System Settings", "Cancel"],
                defaultId: 0,
                cancelId: 1,
                noLink: true,
            });
            if (response === 0 && owned()) await shell.openExternal(privacyFilesAndFoldersUrl);
        } catch {
            /* Window closed, or System Settings could not be opened. */
        }
    }

    function fieldProbe(expected: GuestDocument, fieldId: string): Promise<string | null> {
        if (!current(expected) || expected.fieldId !== fieldId) return Promise.resolve(null);
        probePending?.finish(false);
        const requestId = randomUUID();
        return new Promise((resolve) => {
            const timer = setTimeout(() => finish(false), 2000);
            function finish(eligible: boolean): void {
                clearTimeout(timer);
                if (probePending?.requestId === requestId) probePending = null;
                resolve(
                    eligible && current(expected) && expected.fieldId === fieldId
                        ? requestId
                        : null,
                );
            }
            probePending = { document: expected, requestId, finish };
            try {
                send(expected.frame, {
                    type: "probe",
                    token: expected.token,
                    requestId,
                    fieldId,
                    origin: expected.origin,
                });
            } catch {
                finish(false);
            }
        });
    }

    async function nativeLoginChosen(
        expected: GuestDocument,
        fieldId: string,
        fieldKind: BrowserPasswordGuestFieldKind,
        candidate: BrowserLoginCandidate,
        expiresAt: number,
        pickerId: number,
    ): Promise<void> {
        // Focus is required up to the unlock. A Keychain prompt during
        // the unlock takes focus away from Happy, so afterwards only presence is.
        const eligible = (focused: boolean) =>
            current(expected) &&
            expected.fieldId === fieldId &&
            expected.fieldKind === fieldKind &&
            pickerId === pickerGeneration &&
            Date.now() < expiresAt &&
            window.isVisible() &&
            (!focused || window.isFocused()) &&
            browserLoginRelation(expected.origin, candidate.origin) === candidate.relation;
        try {
            if (!eligible(true) || !(await fieldProbe(expected, fieldId)) || !eligible(true))
                return;
            // The source decrypts this one record and keeps nothing; the
            // plaintext lives only for this callback.
            await candidate.use(fieldKind, async (login) => {
                if (!eligible(false)) return;
                // Unlocking can outlive either the field or its document. Probe
                // again afterwards, then check main's origin immediately before send.
                const requestId = await fieldProbe(expected, fieldId);
                if (!requestId || !eligible(false)) return;
                send(expected.frame, {
                    type: "fill",
                    token: expected.token,
                    requestId,
                    fieldId,
                    origin: expected.origin,
                    username: login.username,
                    password: fieldKind === "password" ? login.password : null,
                    expiresAt: Math.min(expiresAt, Date.now() + 2000),
                });
            });
        } catch (error) {
            // Only a login the person picked reports a failure, in one sentence.
            if (error instanceof BrowserLoginCryptoCancelledError) return;
            await errorShow(
                "The login could not be filled",
                error instanceof BrowserLoginUseError ? error.message : undefined,
            );
        }
    }

    /**
     * The toolbar button always opens the picker. A trusted click in an empty
     * sign-in field opens it only when this site has saved logins.
     */
    function pickerOpen(automatic = false): void {
        const expected = document;
        if (
            !expected ||
            !current(expected) ||
            pickerPending ||
            menu ||
            !window.isVisible() ||
            !window.isFocused()
        )
            return;
        const fieldId = expected.fieldId;
        const fieldKind = expected.fieldKind;
        if (automatic && (fieldId === null || fieldKind === null)) return;
        const pickerId = ++pickerGeneration;
        pickerPending = true;
        void (async () => {
            try {
                const { candidates, accessDenied } = await logins(expected.origin);
                if (!current(expected) || pickerId !== pickerGeneration || !window.isFocused())
                    return;
                if (automatic && candidates.length === 0) return;
                let chosen = false;
                let openedAt = Number.POSITIVE_INFINITY;
                const expiresAt = Date.now() + 60_000;
                const nativeMenu = Menu.buildFromTemplate(
                    browserLoginPickerTemplate({
                        origin: expected.origin,
                        fieldReady: fieldId !== null && fieldKind !== null,
                        candidates,
                        accessDenied,
                        accessDeniedExplain: (browser) => {
                            if (pickerId !== pickerGeneration || Date.now() - openedAt < 500)
                                return;
                            void accessDeniedExplain(browser);
                        },
                        choose: (candidate) => {
                            // This closure is never exposed through IPC, a bridge,
                            // an application menu command, or an agent/tool API.
                            // A click that lands before the menu could be read
                            // (a double click, a menu opened under the pointer)
                            // is not a choice, as in Chrome's own picker.
                            if (
                                chosen ||
                                fieldId === null ||
                                fieldKind === null ||
                                pickerId !== pickerGeneration ||
                                Date.now() - openedAt < 500
                            )
                                return;
                            chosen = true;
                            void nativeLoginChosen(
                                expected,
                                fieldId,
                                fieldKind,
                                candidate,
                                expiresAt,
                                pickerId,
                            );
                        },
                    }),
                );
                menu = nativeMenu;
                const timer = setTimeout(() => {
                    try {
                        nativeMenu.closePopup(window);
                    } catch {
                        /* Window already closed. */
                    }
                }, 60_000);
                menuTimer = timer;
                openedAt = Date.now();
                nativeMenu.popup({
                    window,
                    callback: () => {
                        clearTimeout(timer);
                        if (menuTimer === timer) menuTimer = undefined;
                        if (menu === nativeMenu) menu = null;
                    },
                });
            } catch {
                /* Every source fails closed to no logins; there is nothing to report. */
            } finally {
                if (pickerId === pickerGeneration) pickerPending = false;
            }
        })();
    }

    function messageReceive(event: IpcMainEvent, payload: unknown): void {
        if (
            !owned() ||
            event.sender !== guest ||
            !event.senderFrame ||
            typeof payload !== "object" ||
            payload === null
        )
            return;
        const frame = event.senderFrame;
        const origin = originOf(frame);
        if (!origin) return;
        const message = payload as Record<string, unknown>;
        if (navigating) return;
        if (message.type === "ready") {
            if (!identifier(message.nonce)) return;
            if (document?.nonce === message.nonce && current(document)) return;
            invalidate();
            const next: GuestDocument = {
                frame,
                origin,
                generation,
                nonce: message.nonce,
                token: randomUUID(),
                expiresAt: Date.now() + 300_000,
                fieldId: null,
                fieldKind: null,
            };
            document = next;
            try {
                send(frame, {
                    type: "bind",
                    nonce: next.nonce,
                    token: next.token,
                    origin,
                    expiresAt: next.expiresAt,
                });
                documentTimer = setTimeout(() => {
                    if (document !== next) return;
                    invalidate();
                    documentReady();
                }, 300_000);
            } catch {
                invalidate();
            }
            return;
        }
        const expected = document;
        if (
            !expected ||
            !current(expected) ||
            frame !== expected.frame ||
            message.token !== expected.token
        )
            return;
        switch (message.type) {
            case "focus": {
                const field = fieldParse(message.field);
                if (field === undefined || typeof message.open !== "boolean") break;
                expected.fieldId = field?.id ?? null;
                expected.fieldKind = field?.kind ?? null;
                if (message.open && field) pickerOpen(true);
                break;
            }
            case "probeResult":
                if (
                    probePending?.document === expected &&
                    message.requestId === probePending.requestId &&
                    typeof message.eligible === "boolean"
                )
                    probePending.finish(message.eligible);
                break;
        }
    }

    function navigationStart(
        details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
    ): void {
        if (!details.isMainFrame) return;
        // A same-document route change can replace a form just as a full navigation
        // can. Both cancel the picker, probe and document capability.
        navigating = !details.isSameDocument;
        invalidate();
    }

    function documentReady(): void {
        if (!owned()) return;
        navigating = false;
        try {
            send(guest.mainFrame, { type: "readyRequest" });
        } catch {
            /* Gone document. */
        }
    }

    function navigationCommitted(): void {
        navigating = false;
    }
    function inPageNavigationReady(
        _event: Electron.Event,
        _url: string,
        isMainFrame: boolean,
    ): void {
        if (isMainFrame) documentReady();
    }
    function loadingStopped(): void {
        // A stopped or failed navigation can leave the old document alive. Give it a
        // fresh capability; the canceled document's picker/fill authorization stays dead.
        if (navigating) documentReady();
    }
    function rendererGone(): void {
        navigating = true;
        invalidate();
    }
    function dispose(): void {
        if (disposed) return;
        invalidate();
        disposed = true;
        guestIpc.off(browserPasswordGuestChannel, messageReceive);
        guest.off("did-start-navigation", navigationStart);
        guest.off("did-navigate", navigationCommitted);
        guest.off("did-navigate-in-page", inPageNavigationReady);
        guest.off("did-stop-loading", loadingStopped);
        guest.off("dom-ready", documentReady);
        guest.off("render-process-gone", rendererGone);
        guest.off("destroyed", dispose);
        window.off("closed", dispose);
    }

    guestIpc.on(browserPasswordGuestChannel, messageReceive);
    guest.on("did-start-navigation", navigationStart);
    guest.on("did-navigate", navigationCommitted);
    guest.on("did-navigate-in-page", inPageNavigationReady);
    guest.on("did-stop-loading", loadingStopped);
    guest.on("dom-ready", documentReady);
    guest.on("render-process-gone", rendererGone);
    guest.once("destroyed", dispose);
    window.once("closed", dispose);
    return { pickerOpen, dispose };
}

/**
 * The picker: logins for this exact site first, then related sites under their
 * own label, each named by account, site, and source; then each browser the OS
 * would not let Happy read; then one line saying that Happy stores no password.
 */
export function browserLoginPickerTemplate(options: {
    readonly origin: string;
    /** A sign-in field is focused, so a login can be filled. */
    readonly fieldReady: boolean;
    readonly candidates: readonly BrowserLoginCandidate[];
    /** Browsers whose saved logins the OS refused to Happy, such as "Chrome". */
    readonly accessDenied: readonly string[];
    /** Explains how the person can allow a refused browser (macOS only). */
    readonly accessDeniedExplain: (browser: string) => void;
    readonly choose: (candidate: BrowserLoginCandidate) => void;
}): Electron.MenuItemConstructorOptions[] {
    const item = (candidate: BrowserLoginCandidate): Electron.MenuItemConstructorOptions => {
        // The account name comes from the stored login, so it is cut short and
        // can never push the site or source out of view.
        const login = `${nativePart(candidate.name, 40)} · ${nativePart(candidate.source, 80)}`;
        return {
            label: nativeLabel(
                candidate.relation === "related"
                    ? `${nativePart(new URL(candidate.origin).host, 80)} — ${login}`
                    : login,
            ),
            enabled: options.fieldReady,
            click: () => options.choose(candidate),
        };
    };
    const exact = options.candidates.filter((candidate) => candidate.relation === "exact");
    const related = options.candidates.filter((candidate) => candidate.relation === "related");
    return [
        {
            label: options.fieldReady
                ? new URL(options.origin).host
                : "Click a sign-in field to fill it",
            enabled: false,
        },
        { type: "separator" },
        ...(options.candidates.length === 0 && options.accessDenied.length === 0
            ? [{ label: "No saved logins for this site", enabled: false }]
            : exact.map(item)),
        ...(related.length > 0
            ? [
                  ...(exact.length > 0 ? [{ type: "separator" as const }] : []),
                  { label: "Related sites", enabled: false },
                  ...related.map(item),
              ]
            : []),
        ...(options.accessDenied.length > 0
            ? [
                  ...(options.candidates.length > 0 ? [{ type: "separator" as const }] : []),
                  ...options.accessDenied.map(
                      (browser): Electron.MenuItemConstructorOptions =>
                          process.platform === "darwin"
                              ? {
                                    label: nativeLabel(
                                        `macOS blocked access to ${nativePart(browser, 40)}’s saved logins…`,
                                    ),
                                    click: () => options.accessDeniedExplain(browser),
                                }
                              : {
                                    label: nativeLabel(
                                        `Windows blocked access to ${nativePart(browser, 40)}’s saved logins`,
                                    ),
                                    enabled: false,
                                },
                  ),
              ]
            : []),
        { type: "separator" },
        {
            label: "Happy reads these from your browsers and never stores passwords.",
            enabled: false,
        },
    ];
}

const privacyFilesAndFoldersUrl =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders";

/** The name System Settings shows for a browser, which is its app's name. */
function browserAppName(browser: string): string {
    switch (browser) {
        case "Chrome":
            return "Google Chrome";
        case "Brave":
            return "Brave Browser";
        case "Edge":
            return "Microsoft Edge";
        default:
            return browser;
    }
}

function identifier(value: unknown): value is string {
    return typeof value === "string" && /^[0-9a-f-]{36}$/.test(value);
}

/** Undefined for a malformed field; null when no sign-in field is focused. */
function fieldParse(value: unknown): BrowserPasswordGuestField | null | undefined {
    if (value === null) return null;
    if (typeof value !== "object") return undefined;
    const field = value as Record<string, unknown>;
    return identifier(field.id) && (field.kind === "username" || field.kind === "password")
        ? { id: field.id, kind: field.kind }
        : undefined;
}

function nativeLabel(value: string): string {
    const text = nativeText(value);
    return process.platform === "darwin" ? text : text.replaceAll("&", "&&");
}

function nativeText(value: string): string {
    // Untrusted account names cannot inject line breaks or invisible bidi controls.
    return value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ").slice(0, 256);
}

/** One part of a label: untrusted text cut to `length` characters, ending in an ellipsis when cut. */
function nativePart(value: string, length: number): string {
    const characters = [...nativeText(value).trim()];
    return characters.length > length
        ? `${characters.slice(0, length - 1).join("")}…`
        : characters.join("");
}
