import { UserError } from "../types.js";
import type { HappyAgentOnboardingGate } from "./happyAgentOnboardingGates.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/**
 * The one-time command a machine joins with as one of the reader's own
 * computers. It works once and expires, so it is minted when it is asked for
 * and dropped once it expires or a new computer of the reader's shows up,
 * which may have spent it.
 */
export type HappyAgentOnboardingComputerCommand =
    | { readonly step: "none" }
    | { readonly step: "minting" }
    | {
          readonly step: "ready";
          /** `curl … | sh`, the same on macOS and Linux. */
          readonly unix: string;
          /** The token the command carries, for the desktop shell's own installer run. */
          readonly token: string;
          /** In milliseconds. */
          readonly expiresAt: number;
      }
    | { readonly step: "failed"; readonly error: string };

/**
 * "Connect this Mac". Where the desktop shell runs the installer itself the
 * press hands it the token; elsewhere the press copies the command. Either
 * way the first computer of the reader's that shows up after the press is
 * taken to be this one: the installer finishing proves nothing.
 */
export type HappyAgentOnboardingThisComputer =
    | { readonly step: "idle" }
    | { readonly step: "copying" }
    /** The command was copied; no new computer of the reader's has shown up yet. */
    | { readonly step: "waiting" }
    /** The shell is fetching the installer. */
    | { readonly step: "downloading" }
    /** The shell's installer runs, or ran; no new computer of the reader's has shown up yet. */
    | { readonly step: "installing" }
    /** The first computer of the reader's that showed up after the press, by ID. */
    | { readonly step: "joined"; readonly computerId: string }
    | {
          readonly step: "failed";
          readonly error: string;
          /** The reason in full: what stopped the shell, or what the installer said last. */
          readonly detail?: string;
          /** The next press copies the command instead: the shell couldn't run it. */
          readonly copyNext?: boolean;
      };

export type HappyAgentOnboardingComputerDialog = "add" | "explainer";

export interface HappyAgentOnboardingComputerSnapshot {
    readonly dialog?: HappyAgentOnboardingComputerDialog;
    readonly command: HappyAgentOnboardingComputerCommand;
    readonly thisComputer: HappyAgentOnboardingThisComputer;
}

/** Where "Connect this Mac" sends the command when the shell doesn't run it: the clipboard. */
export interface HappyAgentOnboardingComputerConnectTarget {
    copy(text: string): Promise<void>;
}

/** What the desktop shell reports of the installer it runs. */
export type HappyAgentOnboardingComputerJoinState =
    | { readonly kind: "downloading" }
    | { readonly kind: "running" }
    | { readonly kind: "exited"; readonly code: number; readonly lastLine: string | null }
    | {
          readonly kind: "failed";
          readonly reason: "busy" | "root" | "download" | "launch" | "cancelled";
      };

/**
 * The desktop shell's own installer run for this server, on macOS and Linux:
 * it fetches the installer itself and runs it with the token, as the person.
 */
export interface HappyAgentOnboardingComputerJoinHost {
    /** Starts the installer; rejects when the shell refuses the request outright. */
    join(token: string): Promise<void>;
    cancel(): Promise<void>;
    subscribe(listener: (state: HappyAgentOnboardingComputerJoinState) => void): () => void;
}

const JOIN_REFUSED: Readonly<
    Record<
        Exclude<
            Extract<HappyAgentOnboardingComputerJoinState, { kind: "failed" }>["reason"],
            "cancelled"
        >,
        string
    >
> = {
    busy: "Happy is already setting up this computer.",
    root: "Happy runs as root here, so it can't set this up.",
    download: "Happy couldn't get the installer.",
    launch: "Happy couldn't run the installer.",
};

/** The computer gate's own actions, while it is on screen. */
export interface HappyAgentOnboardingComputerStore {
    get(): HappyAgentOnboardingComputerSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens a dialog; "add" mints the command its rows show. */
    dialogOpen(dialog: HappyAgentOnboardingComputerDialog): void;
    dialogClose(): void;
    /** Hands this machine's command to `target`, then waits for the computer to show up. */
    thisComputerConnect(target: HappyAgentOnboardingComputerConnectTarget): void;
}

/** The onboarding store's side: the gate as the server last said it, and disposal. */
export interface HappyAgentOnboardingComputerOwner extends HappyAgentOnboardingComputerStore {
    gateUpdate(gate: HappyAgentOnboardingGate | undefined): void;
    [Symbol.dispose](): void;
}

type CommandReady = Extract<HappyAgentOnboardingComputerCommand, { readonly step: "ready" }>;

function commandRead(answer: unknown): CommandReady | undefined {
    if (typeof answer !== "object" || answer === null) return undefined;
    const { commands, expiresAt, token } = answer as {
        commands?: unknown;
        expiresAt?: unknown;
        token?: unknown;
    };
    const unix =
        typeof commands === "object" && commands !== null
            ? (commands as { unix?: unknown }).unix
            : undefined;
    if (
        typeof unix !== "string" ||
        unix === "" ||
        typeof token !== "string" ||
        typeof expiresAt !== "number"
    )
        return undefined;
    return { step: "ready", unix, token, expiresAt };
}

export function happyAgentOnboardingComputerCreate(deps: {
    readonly request: HappyCloudRequest | undefined;
    /** The desktop shell's installer run, where it offers one. */
    readonly join?: HappyAgentOnboardingComputerJoinHost | undefined;
}): HappyAgentOnboardingComputerOwner {
    let snapshot: HappyAgentOnboardingComputerSnapshot = {
        command: { step: "none" },
        thisComputer: { step: "idle" },
    };
    const listeners = new Set<() => void>();
    let disposed = false;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    /** The reader's own computers on the last gate read, by ID; absent before the first. */
    let known: ReadonlySet<string> | undefined;
    /** The reader's own computers when "Connect this Mac" was pressed. */
    let before: ReadonlySet<string> = new Set();
    let joinUnsubscribe: (() => void) | undefined;

    const set = (change: Partial<HappyAgentOnboardingComputerSnapshot>): void => {
        snapshot = { ...snapshot, ...change };
        for (const listener of listeners) listener();
    };

    /** The command is gone: it expired, or a computer that joined may have spent it. */
    const commandDrop = (reason: "expired" | "spent"): void => {
        if (expiry) clearTimeout(expiry);
        expiry = undefined;
        const step = snapshot.thisComputer.step;
        const waiting = step === "waiting" || step === "downloading" || step === "installing";
        set({
            command: { step: "none" },
            ...(waiting && reason === "expired"
                ? {
                      thisComputer: { step: "failed", error: "The command expired." },
                  }
                : {}),
        });
        if (snapshot.dialog === "add") void commandEnsure();
    };

    /** The command, minted when there is none. */
    const commandEnsure = async (): Promise<CommandReady> => {
        const current = snapshot.command;
        if (current.step === "ready") return current;
        const request = deps.request;
        if (!request) throw new UserError("This server can't add computers.");
        set({ command: { step: "minting" } });
        try {
            const command = commandRead(
                await request("POST", "v0/computers/join-tokens", { access: "private" }),
            );
            if (!command) throw new UserError("Happy Cloud didn't send a setup command.");
            if (disposed) return command;
            set({ command });
            if (expiry) clearTimeout(expiry);
            expiry = setTimeout(
                () => {
                    expiry = undefined;
                    if (snapshot.command === command) commandDrop("expired");
                },
                Math.max(0, command.expiresAt - Date.now()),
            );
            return command;
        } catch (error) {
            const refused = happyAgentUserError(error);
            if (!disposed) set({ command: { step: "failed", error: refused.message } });
            throw refused;
        }
    };

    const fail = (error: string, more: { detail?: string; copyNext?: boolean } = {}): void =>
        set({ thisComputer: { step: "failed", error, ...more } });

    /** The shell's word on its installer, while this machine is being set up through it. */
    const joinState = (state: HappyAgentOnboardingComputerJoinState): void => {
        const step = snapshot.thisComputer.step;
        if (disposed || (step !== "downloading" && step !== "installing")) return;
        switch (state.kind) {
            case "downloading":
                return set({ thisComputer: { step: "downloading" } });
            case "running":
                return set({ thisComputer: { step: "installing" } });
            case "exited":
                // A clean exit waits for the server to list the computer.
                if (state.code !== 0)
                    fail("Setup stopped", state.lastLine ? { detail: state.lastLine } : {});
                return;
            case "failed":
                if (state.reason === "cancelled") return set({ thisComputer: { step: "idle" } });
                return fail("Setup failed", {
                    detail: JOIN_REFUSED[state.reason],
                    copyNext: state.reason !== "busy",
                });
        }
    };

    const joinStart = (host: HappyAgentOnboardingComputerJoinHost): void => {
        joinUnsubscribe ??= host.subscribe(joinState);
        set({ thisComputer: { step: "downloading" } });
        void commandEnsure()
            .then(async (command) => {
                if (disposed) return;
                before = known ?? new Set();
                try {
                    await host.join(command.token);
                } catch {
                    fail("Setup failed", { detail: JOIN_REFUSED.launch, copyNext: true });
                }
            })
            .catch((error: unknown) => {
                if (!disposed) fail(happyAgentUserError(error).message);
            });
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dialogOpen(dialog) {
            if (disposed) return;
            set({ dialog });
            if (dialog === "add" && snapshot.command.step !== "minting")
                void commandEnsure().catch(() => undefined);
        },
        dialogClose() {
            if (disposed || !snapshot.dialog) return;
            const { dialog: _closed, ...rest } = snapshot;
            snapshot = rest;
            for (const listener of listeners) listener();
        },
        thisComputerConnect(target) {
            const mine = snapshot.thisComputer;
            if (disposed || (mine.step !== "idle" && mine.step !== "failed")) return;
            const host = mine.step === "failed" && mine.copyNext ? undefined : deps.join;
            if (host) {
                joinStart(host);
                return;
            }
            set({ thisComputer: { step: "copying" } });
            void commandEnsure()
                .then(async (command) => {
                    try {
                        await target.copy(command.unix);
                    } catch {
                        throw new UserError("Happy couldn't copy the command.");
                    }
                    if (disposed) return;
                    before = known ?? new Set();
                    set({ thisComputer: { step: "waiting" } });
                })
                .catch((error: unknown) => {
                    if (!disposed)
                        set({
                            thisComputer: {
                                step: "failed",
                                error: happyAgentUserError(error).message,
                            },
                        });
                });
        },
        gateUpdate(gate) {
            if (disposed || gate?.kind !== "computer") return;
            const own = new Set(
                gate.computers
                    .filter((computer) => computer.access === "private")
                    .map((computer) => computer.id),
            );
            const arrived = known ? [...own].filter((id) => !known!.has(id)) : [];
            known = own;
            const mine = snapshot.thisComputer;
            if (
                mine.step === "waiting" ||
                mine.step === "downloading" ||
                mine.step === "installing"
            ) {
                const joined = [...own].find((id) => !before.has(id));
                if (joined) set({ thisComputer: { step: "joined", computerId: joined } });
            } else if (mine.step === "joined" && !own.has(mine.computerId))
                set({ thisComputer: { step: "idle" } });
            if (arrived.length > 0 && snapshot.command.step === "ready") commandDrop("spent");
        },
        [Symbol.dispose]() {
            // The connection is going away: so does the installer it started.
            const step = snapshot.thisComputer.step;
            if (step === "downloading" || step === "installing") void deps.join?.cancel();
            joinUnsubscribe?.();
            disposed = true;
            if (expiry) clearTimeout(expiry);
            expiry = undefined;
            listeners.clear();
        },
    };
}
