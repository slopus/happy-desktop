import type {
    ConsoleWatchEntry,
    ConsoleWatchSnapshot,
    ConsoleWatchSource,
    ConsoleWatchStore,
} from "happy-desktop-ui";

const CONSOLE_WATCH_KEY = "happy.console-watch.v1";
/** The newest entries kept for the card; the counts keep running past it. */
const ENTRY_LIMIT = 30;
const TEXT_LIMIT = 600;

function enabledRead(): boolean {
    try {
        return localStorage.getItem(CONSOLE_WATCH_KEY) === "on";
    } catch {
        return false;
    }
}

function enabledWrite(enabled: boolean): void {
    try {
        if (enabled) localStorage.setItem(CONSOLE_WATCH_KEY, "on");
        else localStorage.removeItem(CONSOLE_WATCH_KEY);
    } catch {
        // A storage-denied renderer keeps the choice for this window's lifetime.
    }
}

/** Never throws: a value the logger was handed must not break the logging call. */
function valueText(value: unknown): string {
    try {
        if (typeof value === "string") return value;
        if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
        try {
            const json = JSON.stringify(value);
            if (json !== undefined) return json;
        } catch {
            // Cyclic or hostile values fall back to their string form.
        }
        return String(value);
    } catch {
        // A null-prototype object has no `toString`, and a getter may throw.
        return Object.prototype.toString.call(value);
    }
}

function requestDescribe(input: RequestInfo | URL, init: RequestInit | undefined): string {
    const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const url = input instanceof Request ? input.url : String(input);
    return `${method} ${url}`;
}

/**
 * What a preview build shows of its own console, for the status bar's console
 * mark. It is intentionally not a product store: it holds diagnostics about
 * this window only, and the choice lives in this window's own storage.
 *
 * Disabled, which is the default, it patches nothing and listens to nothing.
 * Enabled, it observes only what page JavaScript can: `console.error` and
 * `console.warn`, uncaught errors, unhandled rejections, elements whose
 * resource failed to load, and `fetch` calls that reject or answer 4xx/5xx.
 * Messages Chromium writes to the console itself (Mixed Content, WebGL context
 * loss, "Failed to load resource" for anything outside `fetch` and elements)
 * never reach the page and are not seen here.
 */
export function desktopConsoleWatchCreate(): ConsoleWatchStore {
    let snapshot: ConsoleWatchSnapshot = {
        enabled: false,
        entries: [],
        errorCount: 0,
        warningCount: 0,
    };
    const listeners = new Set<() => void>();
    let nextId = 1;
    let publishScheduled = false;
    let uninstall: (() => void) | undefined;

    // `console.error` is called from inside React renders. Notifying
    // subscribers there would update a component mid-render, which React
    // reports through `console.error` again; the notice goes out afterwards.
    const publish = (): void => {
        if (publishScheduled) return;
        publishScheduled = true;
        setTimeout(() => {
            publishScheduled = false;
            for (const listener of listeners) listener();
        }, 0);
    };

    const record = (level: ConsoleWatchEntry["level"], source: ConsoleWatchSource, raw: string) => {
        const text = raw.length > TEXT_LIMIT ? `${raw.slice(0, TEXT_LIMIT)}…` : raw;
        const newest = snapshot.entries[0];
        const repeated =
            newest !== undefined &&
            newest.level === level &&
            newest.source === source &&
            newest.text === text;
        const entries = repeated
            ? [{ ...newest, count: newest.count + 1 }, ...snapshot.entries.slice(1)]
            : [{ count: 1, id: nextId++, level, source, text }, ...snapshot.entries].slice(
                  0,
                  ENTRY_LIMIT,
              );
        snapshot = {
            ...snapshot,
            entries,
            errorCount: snapshot.errorCount + (level === "error" ? 1 : 0),
            warningCount: snapshot.warningCount + (level === "warning" ? 1 : 0),
        };
        publish();
    };

    const install = (): (() => void) => {
        // A wrapper can outlive this installation: a client created while the
        // watcher was on keeps the `fetch` it was handed, and so may a module
        // that kept `console.warn`. Uninstalling retires every wrapper, so a
        // retained one passes straight through and records nothing.
        let live = true;
        const observe = (
            level: ConsoleWatchEntry["level"],
            source: ConsoleWatchSource,
            text: () => string,
        ): void => {
            if (!live) return;
            try {
                record(level, source, text());
            } catch {
                // Observing must never change what the observed call does.
            }
        };
        const errorOriginal = console.error;
        const warnOriginal = console.warn;
        const errorPatched = (...values: unknown[]): void => {
            errorOriginal.apply(console, values);
            observe("error", "console", () => values.map(valueText).join(" "));
        };
        const warnPatched = (...values: unknown[]): void => {
            warnOriginal.apply(console, values);
            observe("warning", "console", () => values.map(valueText).join(" "));
        };
        console.error = errorPatched;
        console.warn = warnPatched;

        // Capture phase: a failed <img>, <script> or <link> fires a plain
        // `error` event on the element that never bubbles to the window.
        const errorListener = (event: Event): void => {
            if (event instanceof ErrorEvent) {
                observe("error", "uncaught", () =>
                    event.error === undefined || event.error === null
                        ? event.message
                        : valueText(event.error),
                );
                return;
            }
            const target = event.target;
            if (!(target instanceof Element)) return;
            const url = target.getAttribute("src") ?? target.getAttribute("href") ?? "";
            // Inline data and blob URLs can be megabytes; the tag is the useful part.
            const shown = /^(data|blob):/.test(url) ? `${url.slice(0, 32)}…` : url;
            observe(
                "error",
                "resource",
                () => `<${target.tagName.toLowerCase()}> failed to load ${shown}`,
            );
        };
        const rejectionListener = (event: PromiseRejectionEvent): void => {
            observe("error", "rejection", () => valueText(event.reason));
        };
        window.addEventListener("error", errorListener, true);
        window.addEventListener("unhandledrejection", rejectionListener);

        // There is no single request layer in the window, so the global is the
        // one place every call-time `fetch(...)` passes. A module that kept its
        // own reference to `fetch` before this was enabled is not observed,
        // and one kept from while it was enabled stops being observed with it.
        const fetchOriginal = globalThis.fetch;
        const fetchPatched: typeof fetch = async (input, init) => {
            if (!live) return fetchOriginal.call(globalThis, input, init);
            try {
                const response = await fetchOriginal.call(globalThis, input, init);
                if (response.status >= 400)
                    observe("error", "request", () =>
                        `${requestDescribe(input, init)} failed: ${response.status} ${response.statusText}`.trim(),
                    );
                return response;
            } catch (error) {
                // An abort is the caller changing its mind, not a failure.
                if (!(error instanceof DOMException && error.name === "AbortError"))
                    observe(
                        "error",
                        "request",
                        () =>
                            `${requestDescribe(input, init)} failed: ${valueText(
                                error instanceof Error ? error.message : error,
                            )}`,
                    );
                throw error;
            }
        };
        globalThis.fetch = fetchPatched;

        return () => {
            live = false;
            // Something else may have wrapped these since; only take back our own.
            if (console.error === errorPatched) console.error = errorOriginal;
            if (console.warn === warnPatched) console.warn = warnOriginal;
            if (globalThis.fetch === fetchPatched) globalThis.fetch = fetchOriginal;
            window.removeEventListener("error", errorListener, true);
            window.removeEventListener("unhandledrejection", rejectionListener);
        };
    };

    const store: ConsoleWatchStore = {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        enabledUpdate(enabled) {
            if (enabled === snapshot.enabled) return;
            enabledWrite(enabled);
            if (enabled) {
                uninstall = install();
                snapshot = { ...snapshot, enabled: true };
            } else {
                uninstall?.();
                uninstall = undefined;
                snapshot = { enabled: false, entries: [], errorCount: 0, warningCount: 0 };
            }
            publish();
        },
        entriesClear() {
            snapshot = { ...snapshot, entries: [], errorCount: 0, warningCount: 0 };
            publish();
        },
    };

    if (enabledRead()) {
        uninstall = install();
        snapshot = { ...snapshot, enabled: true };
    }
    return store;
}
