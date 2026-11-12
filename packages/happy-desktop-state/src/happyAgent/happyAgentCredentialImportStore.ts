import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import type { HappyAgentProviderCredentialsApi } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/** Whose credential an import becomes: the whole team's, or the importer's own. */
export type HappyAgentCredentialImportScope = "team" | "private";

/**
 * What can be done with a credential found on this computer.
 *
 * - `import`: copied to the server as it is. A `subscription` is a sign-in the
 *   server takes over: the copy on this computer may stop working.
 * - `unsupported`: the server can't use it; `reason` says why.
 */
export type HappyAgentCredentialFoundUse =
    | { readonly kind: "import"; readonly subscription: boolean }
    | { readonly kind: "unsupported"; readonly reason: string };

/** A model provider credential found on this computer. Never the secret itself. */
export interface HappyAgentCredentialFound {
    /** Names this entry of the last scan; not stable across scans. */
    readonly id: string;
    /** The vendor's display name, such as "OpenAI". */
    readonly vendorName: string;
    readonly use: HappyAgentCredentialFoundUse;
    /** Where it was found, such as `~/.codex/auth.json` or `$OPENAI_API_KEY`. */
    readonly source: string;
    readonly label: string;
    /** The account it signs in as, when its vendor's own files say. */
    readonly account?: string;
    /** The last four characters behind dots; absent for a sign-in. */
    readonly masked?: string;
}

/** How one credential's import ended. */
export type HappyAgentCredentialImportResult =
    | {
          readonly ok: true;
          /** It was already there; nothing was stored. */
          readonly duplicate: boolean;
          readonly account?: string;
      }
    | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * The host that can read this computer's credentials and send them on. Only
 * a desktop shell has one; secrets stay in it and never reach this store.
 */
export interface HappyAgentCredentialImportHost {
    /** Looks for credentials; `shell` also reads the login shell's environment. */
    scan(options: { readonly shell: boolean }): Promise<readonly HappyAgentCredentialFound[]>;
    /** Sends entries of the last scan; rejects with a displayable reason. */
    import(
        items: readonly {
            readonly id: string;
            readonly scope: HappyAgentCredentialImportScope;
        }[],
    ): Promise<ReadonlyMap<string, HappyAgentCredentialImportResult>>;
}

export interface HappyAgentCredentialImportSnapshot {
    /** Whether the import dialog is on screen. */
    readonly open: boolean;
    /**
     * - `idle`: nothing looked for yet.
     * - `scanning`: looking.
     * - `ready`: `found` is the last scan's answer.
     * - `importing`: the picked entries are being sent.
     */
    readonly phase: "idle" | "scanning" | "ready" | "importing";
    readonly found: readonly HappyAgentCredentialFound[];
    /** Importable entries the person chose, and where each goes. */
    readonly picked: ReadonlyMap<string, HappyAgentCredentialImportScope>;
    /** How each entry the person sent ended, for this scan. */
    readonly results: ReadonlyMap<string, HappyAgentCredentialImportResult>;
    /** Whether the last scan also read the login shell's environment. */
    readonly shellScanned: boolean;
    /** Whether the member may add credentials for the whole team. */
    readonly teamAllowed: boolean;
    /** Why the last scan or import failed as a whole. */
    readonly error?: UserError;
}

/**
 * Settings › Inference › Import: finds model provider credentials already on
 * this computer and copies the ones the person picks to a Happy Cloud server.
 */
export interface HappyAgentCredentialImportStore {
    get(): HappyAgentCredentialImportSnapshot;
    subscribe(listener: () => void): () => void;
    /** Shows the import dialog and looks again, with the last shell choice. */
    dialogOpen(): void;
    /** Hides the dialog; an import already sent still finishes. */
    dialogClose(): void;
    /** Looks again; a new scan forgets the last one's picks and results. */
    scanStart(options: { readonly shell: boolean }): void;
    /** Picks or unpicks one importable entry. */
    pickToggle(id: string): void;
    pickScopeUpdate(id: string, scope: HappyAgentCredentialImportScope): void;
    /** Sends every picked entry. */
    importSubmit(): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentCredentialImportStoreDeps {
    readonly host: HappyAgentCredentialImportHost;
    /** Where the member's permissions are read from. */
    readonly credentials: Pick<HappyAgentProviderCredentialsApi, "permissionsRead">;
}

const NO_PICKS: ReadonlyMap<string, HappyAgentCredentialImportScope> = new Map();
const NO_RESULTS: ReadonlyMap<string, HappyAgentCredentialImportResult> = new Map();

export function happyAgentCredentialImportStoreCreate(
    deps: HappyAgentCredentialImportStoreDeps,
): HappyAgentCredentialImportStore {
    const store = createStore<HappyAgentCredentialImportSnapshot>()(() => ({
        open: false,
        phase: "idle",
        found: [],
        picked: NO_PICKS,
        results: NO_RESULTS,
        shellScanned: false,
        teamAllowed: false,
    }));
    let disposed = false;
    let permissionsAsked = false;
    /** Counts scans so an older answer never replaces a newer one. */
    let scan = 0;

    const permissionsAsk = (): void => {
        if (permissionsAsked) return;
        permissionsAsked = true;
        void deps.credentials.permissionsRead().then(
            (granted) => {
                if (disposed || !granted.has("providers.manage")) return;
                store.setState({ teamAllowed: true }, false);
            },
            () => {
                // Not knowing leaves imports private, which every member may make.
                permissionsAsked = false;
            },
        );
    };

    const actions: HappyAgentCredentialImportStore = {
        get: () => store.getState(),
        subscribe: (listener) => (disposed ? () => undefined : store.subscribe(listener)),
        dialogOpen() {
            if (disposed || store.getState().open) return;
            store.setState({ open: true }, false);
            actions.scanStart({ shell: store.getState().shellScanned });
        },
        dialogClose() {
            if (disposed || !store.getState().open) return;
            store.setState({ open: false }, false);
        },
        scanStart(options) {
            const current = store.getState();
            if (disposed || current.phase === "scanning" || current.phase === "importing") return;
            permissionsAsk();
            const ticket = ++scan;
            const { error: _cleared, ...rest } = current;
            store.setState({ ...rest, phase: "scanning" }, true);
            void deps.host.scan(options).then(
                (found) => {
                    if (disposed || ticket !== scan) return;
                    store.setState(
                        {
                            phase: "ready",
                            found,
                            picked: new Map(
                                // A subscription waits to be picked: signing in
                                // from Happy keeps this computer's copy working.
                                found
                                    .filter(
                                        (entry) =>
                                            entry.use.kind === "import" && !entry.use.subscription,
                                    )
                                    .map((entry) => [entry.id, "private" as const]),
                            ),
                            results: NO_RESULTS,
                            shellScanned: options.shell,
                        },
                        false,
                    );
                },
                (error: unknown) => {
                    if (disposed || ticket !== scan) return;
                    store.setState(
                        {
                            phase: store.getState().found.length > 0 ? "ready" : "idle",
                            error: happyAgentUserError(error),
                        },
                        false,
                    );
                },
            );
        },
        pickToggle(id) {
            const current = store.getState();
            if (disposed || current.phase !== "ready") return;
            const entry = current.found.find((candidate) => candidate.id === id);
            if (entry?.use.kind !== "import" || current.results.get(id)?.ok === true) return;
            const picked = new Map(current.picked);
            if (picked.has(id)) picked.delete(id);
            else picked.set(id, "private");
            store.setState({ picked }, false);
        },
        pickScopeUpdate(id, scope) {
            const current = store.getState();
            if (disposed || current.phase !== "ready" || !current.picked.has(id)) return;
            if (scope === "team" && !current.teamAllowed) return;
            store.setState({ picked: new Map(current.picked).set(id, scope) }, false);
        },
        importSubmit() {
            const current = store.getState();
            if (disposed || current.phase !== "ready" || current.picked.size === 0) return;
            const items = [...current.picked].map(([id, scope]) => ({ id, scope }));
            const { error: _cleared, ...rest } = current;
            store.setState({ ...rest, phase: "importing" }, true);
            void deps.host.import(items).then(
                (answered) => {
                    if (disposed) return;
                    const latest = store.getState();
                    const results = new Map(latest.results);
                    const picked = new Map(latest.picked);
                    for (const [id, result] of answered) {
                        results.set(id, result);
                        if (result.ok) picked.delete(id);
                    }
                    store.setState({ phase: "ready", results, picked }, false);
                },
                (error: unknown) => {
                    if (disposed) return;
                    store.setState({ phase: "ready", error: happyAgentUserError(error) }, false);
                },
            );
        },
        [Symbol.dispose]() {
            disposed = true;
        },
    };
    return actions;
}

const INERT_SNAPSHOT: HappyAgentCredentialImportSnapshot = {
    open: false,
    phase: "idle",
    found: [],
    picked: NO_PICKS,
    results: NO_RESULTS,
    shellScanned: false,
    teamAllowed: false,
};

/** Where there is no import to make: it never looks and never changes. */
export const happyAgentCredentialImportStoreNoop: HappyAgentCredentialImportStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    dialogOpen: () => undefined,
    dialogClose: () => undefined,
    scanStart: () => undefined,
    pickToggle: () => undefined,
    pickScopeUpdate: () => undefined,
    importSubmit: () => undefined,
    [Symbol.dispose]: () => undefined,
};
