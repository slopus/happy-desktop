import { describe, expect, it, vi } from "vitest";
import {
    WindowsSandbox,
    windowsSandboxSetupParse,
    windowsSandboxStatusParse,
    type WindowsSandboxCommandRun,
} from "./windowsSandbox";

const AGENT = { path: "C:\\Happy\\happy-agent-0.4.120.exe", version: "0.4.120" };
const ENVIRONMENT = { PATH: "C:\\Windows" };

function json(value: unknown): string {
    return `${JSON.stringify(value)}\n`;
}

/** A Happy Agent whose `sandbox` commands answer from the queue, recording every call. */
function agent(answers: Record<"status" | "setup", (() => Promise<string>)[]>) {
    const calls: { args: readonly string[]; env: NodeJS.ProcessEnv }[] = [];
    const run: WindowsSandboxCommandRun = async (executable, args, options) => {
        expect(executable).toBe(AGENT.path);
        calls.push({ args, env: options.env });
        const answer = answers[args[1] as "status" | "setup"].shift();
        if (!answer) throw new Error(`Unexpected ${args.join(" ")}`);
        return answer();
    };
    return { calls, run };
}

function sandbox(run: WindowsSandboxCommandRun, applicable = true) {
    return new WindowsSandbox({
        applicable,
        environment: ENVIRONMENT,
        run,
        selectedBinary: async () => AGENT,
    });
}

describe("Windows sandbox contract", () => {
    it("reads Happy Agent's typed status and setup answers", () => {
        expect(windowsSandboxStatusParse(json({ status: "ready", setupVersion: 5 }))).toEqual({
            state: "ready",
        });
        expect(
            windowsSandboxStatusParse(
                json({ status: "required", setupVersion: 5, previousAttempt: "cancelled" }),
            ),
        ).toEqual({ state: "required", previousAttempt: "cancelled" });
        expect(windowsSandboxSetupParse(json({ status: "cancelled", setupVersion: 5 }))).toEqual({
            state: "required",
            previousAttempt: "cancelled",
        });
        expect(windowsSandboxSetupParse(json({ status: "failed", setupVersion: 0 }))).toEqual({
            state: "required",
            previousAttempt: "failed",
        });
    });

    it("refuses anything the contract does not say", () => {
        expect(windowsSandboxStatusParse("Happy's Windows sandbox is configured.")).toBeUndefined();
        expect(windowsSandboxStatusParse(json({ status: "ready" }))).toBeUndefined();
        expect(
            windowsSandboxStatusParse(
                json({ status: "required", setupVersion: 5, previousAttempt: "denied" }),
            ),
        ).toBeUndefined();
        expect(windowsSandboxSetupParse(json({ status: "required", setupVersion: 5 }))).toBe(
            undefined,
        );
    });
});

describe("Windows sandbox consent", () => {
    it("holds a supported Agent's daemon back from opening Windows' prompt", async () => {
        const { calls, run } = agent({
            status: [async () => json({ status: "required", setupVersion: 5 })],
            setup: [],
        });
        const subject = sandbox(run);
        const environment = await subject.launchEnvironment();
        expect(environment).toEqual({ ...ENVIRONMENT, HAPPY_WINDOWS_SANDBOX_NO_PROVISION: "1" });
        expect(subject.get()).toEqual({ state: "required" });
        // Reading readiness never asks Windows for anything.
        expect(calls).toEqual([
            {
                args: ["sandbox", "status", "--json"],
                env: { ...ENVIRONMENT, HAPPY_WINDOWS_SANDBOX_NO_PROVISION: "1" },
            },
        ]);
        // The answer is per executable, so starting again does not ask again.
        await subject.launchEnvironment();
        expect(calls).toHaveLength(1);
    });

    it("leaves an Agent without the JSON commands to set itself up, as before", async () => {
        const { run } = agent({
            status: [async () => Promise.reject(new Error("unknown option --json"))],
            setup: [],
        });
        const subject = sandbox(run);
        expect(await subject.launchEnvironment()).toBe(ENVIRONMENT);
        expect(subject.get()).toEqual({ state: "unsupported" });
        await expect(subject.setup()).rejects.toThrow("does not need setting up");
    });

    it("does nothing at all where there is no Windows sandbox", async () => {
        const run = vi.fn<WindowsSandboxCommandRun>();
        const subject = sandbox(run, false);
        expect(await subject.launchEnvironment()).toBe(ENVIRONMENT);
        expect(subject.get()).toEqual({ state: "notApplicable" });
        expect(run).not.toHaveBeenCalled();
    });

    it("waits for an Agent to be selected before asking one", async () => {
        const run = vi.fn<WindowsSandboxCommandRun>();
        const subject = new WindowsSandbox({
            applicable: true,
            environment: ENVIRONMENT,
            run,
            selectedBinary: async () => undefined,
        });
        await subject.check();
        expect(subject.get()).toEqual({ state: "noAgent" });
        expect(run).not.toHaveBeenCalled();
    });

    it("opens one prompt for repeated presses, and only without the hold", async () => {
        let approve!: (stdout: string) => void;
        const { calls, run } = agent({
            status: [async () => json({ status: "required", setupVersion: 5 })],
            setup: [() => new Promise<string>((resolve) => (approve = resolve))],
        });
        const subject = new WindowsSandbox({
            applicable: true,
            // A hold inherited from the person's own shell must not refuse their click.
            environment: { ...ENVIRONMENT, HAPPY_WINDOWS_SANDBOX_NO_PROVISION: "1" },
            run,
            selectedBinary: async () => AGENT,
        });
        await subject.check();
        const first = subject.setup();
        const second = subject.setup();
        expect(second).toBe(first);
        expect(subject.get()).toEqual({ state: "settingUp" });
        await vi.waitFor(() => expect(calls).toHaveLength(2));
        expect(calls[1]).toEqual({ args: ["sandbox", "setup", "--json"], env: ENVIRONMENT });
        approve(json({ status: "ready", setupVersion: 5 }));
        await first;
        expect(subject.get()).toEqual({ state: "ready" });
    });

    it("reports a cancelled prompt, then retries explicitly", async () => {
        const { calls, run } = agent({
            status: [async () => json({ status: "required", setupVersion: 5 })],
            setup: [
                async () => json({ status: "cancelled", setupVersion: 5 }),
                async () => json({ status: "ready", setupVersion: 5 }),
            ],
        });
        const subject = sandbox(run);
        await subject.check();
        await subject.setup();
        expect(subject.get()).toEqual({ state: "required", previousAttempt: "cancelled" });
        await subject.setup();
        expect(calls.map((call) => call.args)).toEqual([
            ["sandbox", "status", "--json"],
            ["sandbox", "setup", "--json"],
            ["sandbox", "setup", "--retry", "--json"],
        ]);
        expect(subject.get()).toEqual({ state: "ready" });
    });

    it("retries an attempt a returning machine left unfinished", async () => {
        const { calls, run } = agent({
            status: [
                async () =>
                    json({ status: "required", setupVersion: 5, previousAttempt: "failed" }),
            ],
            setup: [async () => json({ status: "ready", setupVersion: 5 })],
        });
        const subject = sandbox(run);
        await subject.check();
        await subject.setup();
        expect(calls[1]?.args).toEqual(["sandbox", "setup", "--retry", "--json"]);
    });

    it("treats a helper that crashed or answered nonsense as a failed attempt", async () => {
        const { run } = agent({
            status: [async () => json({ status: "required", setupVersion: 5 })],
            setup: [
                async () => Promise.reject(new Error("exit 125")),
                async () => "Sandbox ready.",
            ],
        });
        const subject = sandbox(run);
        await subject.check();
        await subject.setup();
        expect(subject.get()).toEqual({ state: "required", previousAttempt: "failed" });
        await subject.setup();
        expect(subject.get()).toEqual({ state: "required", previousAttempt: "failed" });
    });

    it("asks a newly selected release again", async () => {
        let selected = AGENT;
        const next = { path: "C:\\Happy\\happy-agent-0.4.121.exe", version: "0.4.121" };
        const run = vi.fn<WindowsSandboxCommandRun>(async (executable) =>
            json(
                executable === AGENT.path
                    ? { status: "ready", setupVersion: 5 }
                    : { status: "required", setupVersion: 6 },
            ),
        );
        const subject = new WindowsSandbox({
            applicable: true,
            environment: ENVIRONMENT,
            run,
            selectedBinary: async () => selected,
        });
        await subject.check();
        expect(subject.get()).toEqual({ state: "ready" });
        selected = next;
        await subject.check();
        expect(subject.get()).toEqual({ state: "required" });
        expect(run).toHaveBeenCalledTimes(2);
    });
});
