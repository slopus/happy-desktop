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
          /** In milliseconds. */
          readonly expiresAt: number;
      }
    | { readonly step: "failed"; readonly error: string };

/**
 * "Connect this Mac". The app cannot run the command on this machine, so the
 * press copies it; the first computer of the reader's that shows up after the
 * press is taken to be this one.
 */
export type HappyAgentOnboardingThisComputer =
    | { readonly step: "idle" }
    | { readonly step: "copying" }
    /** The command was copied; no new computer of the reader's has shown up yet. */
    | { readonly step: "waiting" }
    /** The first computer of the reader's that showed up after the press, by ID. */
    | { readonly step: "joined"; readonly computerId: string }
    | { readonly step: "failed"; readonly error: string };

export type HappyAgentOnboardingComputerDialog = "add" | "explainer";

export interface HappyAgentOnboardingComputerSnapshot {
    readonly dialog?: HappyAgentOnboardingComputerDialog;
    readonly command: HappyAgentOnboardingComputerCommand;
    readonly thisComputer: HappyAgentOnboardingThisComputer;
}

/** Where "Connect this Mac" sends the command: today, the clipboard. */
export interface HappyAgentOnboardingComputerConnectTarget {
    copy(text: string): Promise<void>;
}

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
    const { commands, expiresAt } = answer as { commands?: unknown; expiresAt?: unknown };
    const unix =
        typeof commands === "object" && commands !== null
            ? (commands as { unix?: unknown }).unix
            : undefined;
    if (typeof unix !== "string" || unix === "" || typeof expiresAt !== "number") return undefined;
    return { step: "ready", unix, expiresAt };
}

export function happyAgentOnboardingComputerCreate(deps: {
    readonly request: HappyCloudRequest | undefined;
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

    const set = (change: Partial<HappyAgentOnboardingComputerSnapshot>): void => {
        snapshot = { ...snapshot, ...change };
        for (const listener of listeners) listener();
    };

    /** The command is gone: it expired, or a computer that joined may have spent it. */
    const commandDrop = (reason: "expired" | "spent"): void => {
        if (expiry) clearTimeout(expiry);
        expiry = undefined;
        const waiting = snapshot.thisComputer.step === "waiting";
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
            const step = snapshot.thisComputer.step;
            if (disposed || step === "copying" || step === "waiting") return;
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
            if (mine.step === "waiting") {
                const joined = [...own].find((id) => !before.has(id));
                if (joined) set({ thisComputer: { step: "joined", computerId: joined } });
            } else if (mine.step === "joined" && !own.has(mine.computerId))
                set({ thisComputer: { step: "idle" } });
            if (arrived.length > 0 && snapshot.command.step === "ready") commandDrop("spent");
        },
        [Symbol.dispose]() {
            disposed = true;
            if (expiry) clearTimeout(expiry);
            expiry = undefined;
            listeners.clear();
        },
    };
}
