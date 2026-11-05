import { execFile } from "node:child_process";
import type { HappyAgentBinary } from "./happyAgentBinaryConfig";

/** Set on a daemon Happy starts, so its sandbox is only ever set up by the person's click. */
const NO_PROVISION = "HAPPY_WINDOWS_SANDBOX_NO_PROVISION";
/** Reading readiness opens no prompt; an Agent that has not answered by now is treated as one that cannot. */
const STATUS_TIMEOUT_MS = 15_000;
const MAXIMUM_OUTPUT_BYTES = 64 * 1024;

/**
 * Where the Windows sandbox stands for the Happy Agent Happy runs.
 *
 * Happy Agent owns the sandbox and answers for it through `happy-agent sandbox
 * status --json` and `happy-agent sandbox setup [--retry] --json`. Desktop only
 * decides when setup is allowed to ask Windows for permission: after the person
 * pressed the button that says it will.
 */
export type WindowsSandboxSnapshot =
    /** Nothing to set up: another OS, or a daemon Happy does not manage. */
    | { readonly state: "notApplicable" }
    /** No Agent has been selected yet, so there is nobody to ask. */
    | { readonly state: "noAgent" }
    /** The selected Agent has not answered yet. */
    | { readonly state: "checking" }
    /**
     * The selected Agent predates the JSON sandbox commands. It sets the
     * sandbox up on first use, as it always has, so Desktop leaves it alone.
     */
    | { readonly state: "unsupported" }
    | { readonly state: "ready" }
    | {
          readonly state: "required";
          /** How the last attempt ended; the next one must be an explicit retry. */
          readonly previousAttempt?: "cancelled" | "failed";
      }
    /** Setup the person started is running; Windows' prompt may be open. */
    | { readonly state: "settingUp" };

/** Runs the Agent executable and resolves with its stdout; rejects on any failed exit. */
export type WindowsSandboxCommandRun = (
    executable: string,
    args: readonly string[],
    options: { readonly env: NodeJS.ProcessEnv; readonly timeoutMs?: number },
) => Promise<string>;

export interface WindowsSandboxOptions {
    /** Windows, with a daemon Happy manages. Everything else is `notApplicable`. */
    readonly applicable: boolean;
    /** The environment Happy launches its daemon with. */
    readonly environment: NodeJS.ProcessEnv;
    selectedBinary(): Promise<HappyAgentBinary | undefined>;
    readonly run?: WindowsSandboxCommandRun;
}

/**
 * Holds Windows sandbox setup for the person's consent.
 *
 * A supported Agent is launched with `HAPPY_WINDOWS_SANDBOX_NO_PROVISION=1`, so
 * no command it runs can open Windows' administrator prompt on its own. The
 * prompt opens only from `setup()`, which onboarding calls when the person
 * presses Set up sandbox or Try again. An Agent that cannot answer
 * `sandbox status --json` keeps its old behaviour: it is launched unchanged and
 * the onboarding step stays out of the way.
 */
export class WindowsSandbox {
    private readonly listeners = new Set<(snapshot: WindowsSandboxSnapshot) => void>();
    private readonly run: WindowsSandboxCommandRun;
    private snapshotValue: WindowsSandboxSnapshot;
    /** The executable the current answer came from. */
    private answeredFor?: string;
    private checking?: Promise<void>;
    private settingUp?: Promise<void>;
    /** Advanced by every setup, so a status read that started before it is discarded. */
    private epoch = 0;

    constructor(private readonly options: WindowsSandboxOptions) {
        this.run = options.run ?? commandRun;
        this.snapshotValue = options.applicable
            ? { state: "checking" }
            : { state: "notApplicable" };
    }

    get(): WindowsSandboxSnapshot {
        return this.snapshotValue;
    }

    subscribe(listener: (snapshot: WindowsSandboxSnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Asks the selected Agent where its sandbox stands, once per selected
     * executable. A newly selected release can carry a newer setup version, so
     * its answer is read again rather than assumed.
     */
    check(): Promise<void> {
        if (!this.options.applicable) return Promise.resolve();
        this.checking ??= (async () => {
            try {
                const binary = await this.options.selectedBinary().catch(() => undefined);
                if (this.settingUp) return;
                if (!binary) {
                    this.answeredFor = undefined;
                    this.publish({ state: "noAgent" });
                    return;
                }
                if (binary.path === this.answeredFor) return;
                const epoch = this.epoch;
                if (this.snapshotValue.state === "noAgent") this.publish({ state: "checking" });
                const status = await this.statusRead(binary.path);
                if (epoch !== this.epoch) return;
                this.answeredFor = binary.path;
                this.publish(status);
            } finally {
                this.checking = undefined;
            }
        })();
        return this.checking;
    }

    /**
     * The environment for a daemon Happy starts. Only an Agent that answers for
     * its own sandbox is told to wait for the person; an older one would
     * otherwise have no way to set the sandbox up at all.
     */
    async launchEnvironment(): Promise<NodeJS.ProcessEnv> {
        await this.check();
        switch (this.snapshotValue.state) {
            case "notApplicable":
            case "noAgent":
            case "checking":
            case "unsupported":
                return this.options.environment;
            case "ready":
            case "required":
            case "settingUp":
                return { ...this.options.environment, [NO_PROVISION]: "1" };
        }
    }

    /**
     * Runs explicit setup, which is the one thing that opens Windows' prompt.
     * A second press while it runs joins the first rather than opening another
     * prompt, and an attempt after an unfinished one is an explicit retry.
     */
    setup(): Promise<void> {
        if (this.settingUp) return this.settingUp;
        const current = this.snapshotValue;
        if (current.state !== "required")
            return Promise.reject(new Error("The Windows sandbox does not need setting up."));
        const retry = current.previousAttempt !== undefined;
        this.epoch += 1;
        this.publish({ state: "settingUp" });
        this.settingUp = (async () => {
            try {
                const binary = await this.options.selectedBinary();
                if (!binary) throw new Error("Happy Agent is not installed.");
                this.publish(await this.setupRun(binary.path, retry));
                this.answeredFor = binary.path;
            } catch {
                this.publish({ state: "required", previousAttempt: "failed" });
            } finally {
                this.settingUp = undefined;
            }
        })();
        return this.settingUp;
    }

    private async statusRead(executable: string): Promise<WindowsSandboxSnapshot> {
        let stdout: string;
        try {
            stdout = await this.run(executable, ["sandbox", "status", "--json"], {
                env: { ...this.options.environment, [NO_PROVISION]: "1" },
                timeoutMs: STATUS_TIMEOUT_MS,
            });
        } catch {
            return { state: "unsupported" };
        }
        return windowsSandboxStatusParse(stdout) ?? { state: "unsupported" };
    }

    private async setupRun(executable: string, retry: boolean): Promise<WindowsSandboxSnapshot> {
        // The person asked for this, so nothing inherited may refuse it for them.
        const { [NO_PROVISION]: _held, ...env } = this.options.environment;
        const stdout = await this.run(
            executable,
            ["sandbox", "setup", ...(retry ? ["--retry"] : []), "--json"],
            { env },
        );
        return windowsSandboxSetupParse(stdout) ?? { state: "required", previousAttempt: "failed" };
    }

    private publish(snapshot: WindowsSandboxSnapshot): void {
        this.snapshotValue = snapshot;
        for (const listener of this.listeners) listener(snapshot);
    }
}

/** `sandbox status --json`: `{status: "ready" | "required", setupVersion, previousAttempt?}`. */
export function windowsSandboxStatusParse(stdout: string): WindowsSandboxSnapshot | undefined {
    const value = jsonObjectParse(stdout);
    if (!value || typeof value.setupVersion !== "number") return undefined;
    if (value.status === "ready") return { state: "ready" };
    if (value.status !== "required") return undefined;
    const previousAttempt = value.previousAttempt;
    if (previousAttempt === undefined) return { state: "required" };
    if (previousAttempt === "cancelled" || previousAttempt === "failed")
        return { state: "required", previousAttempt };
    return undefined;
}

/** `sandbox setup [--retry] --json`: `{status: "ready" | "cancelled" | "failed", setupVersion}`. */
export function windowsSandboxSetupParse(stdout: string): WindowsSandboxSnapshot | undefined {
    const value = jsonObjectParse(stdout);
    if (!value || typeof value.setupVersion !== "number") return undefined;
    switch (value.status) {
        case "ready":
            return { state: "ready" };
        case "cancelled":
        case "failed":
            return { state: "required", previousAttempt: value.status };
        default:
            return undefined;
    }
}

function jsonObjectParse(stdout: string): Record<string, unknown> | undefined {
    try {
        const value: unknown = JSON.parse(stdout.trim());
        return value !== null && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
    } catch {
        return undefined;
    }
}

const commandRun: WindowsSandboxCommandRun = (executable, args, options) =>
    new Promise((resolve, reject) => {
        execFile(
            executable,
            args,
            {
                encoding: "utf8",
                env: options.env,
                maxBuffer: MAXIMUM_OUTPUT_BYTES,
                windowsHide: true,
                ...(options.timeoutMs === undefined ? {} : { timeout: options.timeoutMs }),
            },
            (error, stdout) => (error ? reject(error) : resolve(stdout)),
        );
    });
