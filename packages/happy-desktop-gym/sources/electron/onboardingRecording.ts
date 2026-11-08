import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import { happyAgentRuntimeCreate } from "./happyAgentRuntime.js";
import {
    gymElectronInvisibleAssert,
    gymElectronLaunch,
    gymElectronVideoRecord,
    type GymElectronVideoResult,
} from "./launch.js";
import { electronEntrypointResolve, gymRunPathsCreate } from "./paths.js";
import {
    GYM_PERSONA_NEW_USER,
    gymPersonaDriverCreate,
    gymPersonaTurn,
    type GymPersona,
} from "./persona.js";
import { linuxDisplayEnvironment } from "./workloads.js";

/** No assistant is set up: the machine a new person brings. */
const NO_PROVIDERS = "[settings]\nhappy_integration = false\nmenu_bar = false\n";
/**
 * How long nothing may be offered, with nothing streaming, before the run is
 * over. A real model may think for a while before its reply starts streaming.
 */
const IDLE_END_MS = 60_000;
/** How long the window is watched after onboarding finishes, to show what it becomes. */
const FINISHED_WATCH_MS = 8_000;

export interface GymOnboardingRecording {
    readonly root: string;
    readonly chatOnboarding: boolean;
    readonly video: GymElectronVideoResult;
    readonly screenshots: readonly string[];
    readonly turns: number;
    readonly ended: "finished" | "idle" | "limit";
    /** Each step the flow reported, in order, with `null` once the model leads. */
    readonly flowSteps: readonly (string | null)[];
    /**
     * Milliseconds from pressing the welcome's action: what the window showed,
     * and when the Happy Agent's journal says its onboarding events happened.
     * One machine's clock serves both.
     */
    readonly timeline: Readonly<Record<string, number>>;
    readonly composerStates: readonly {
        readonly disabled: boolean;
        readonly placeholder: string;
    }[];
}

/**
 * Records a person's first run of the desktop app against a fresh, real Happy
 * Agent: the welcome, then whatever onboarding that Happy Agent runs. A Happy
 * Agent with `chatOnboarding` runs it in Chief of Staff's conversation, where
 * the persona reads each reply and presses or types at a person's pace; one
 * without it shows the window's own setup, which is recorded as it is.
 *
 * The app runs hidden (`gymElectronLaunch`) and the video is its own
 * compositor frames as H.264 Matroska, so on Linux this runs under `xvfb-run`.
 * The Happy Agent is `HAPPY_DESKTOP_AGENT_EXECUTABLE`, or the selected install,
 * with its home inside the run root and no provider unless one is given.
 */
export async function gymOnboardingRecord(options: {
    /** Absolute `.mkv` path for the video; screenshots go beside it. */
    readonly out: string;
    readonly root?: string;
    /** A run-owned `happy.toml` with the providers to start with; none by default. */
    readonly providersFile?: string;
    readonly persona?: GymPersona;
    readonly limitMs?: number;
    readonly scale?: number;
    /**
     * Values only the Happy Agent receives, such as a provider's sign-in token;
     * never written to the run, given to the app, or returned.
     */
    readonly daemonSecrets?: Readonly<Record<string, string>>;
}): Promise<GymOnboardingRecording> {
    if (extname(options.out) !== ".mkv") throw new Error("The recording is H.264 in a .mkv file.");
    const persona = options.persona ?? GYM_PERSONA_NEW_USER;
    const limitMs = options.limitMs ?? 6 * 60_000;
    const { paths } = await gymRunPathsCreate("smoke", options.root);
    const configuration = options.providersFile
        ? await readFile(options.providersFile, "utf8")
        : NO_PROVIDERS;
    const runtime = await happyAgentRuntimeCreate(
        paths,
        undefined,
        configuration,
        options.daemonSecrets,
    );
    const screenshots: string[] = [];
    const shot = async (page: import("playwright").Page, label: string) => {
        const path = join(
            dirname(options.out),
            `${basename(options.out, ".mkv")}-${String(screenshots.length + 1).padStart(2, "0")}-${label}.png`,
        );
        await page.screenshot({ path }).catch(() => undefined);
        screenshots.push(path);
    };
    try {
        const chatOnboarding =
            (await runtime.client.health()).capabilities?.chatOnboarding === true;
        const entrypoint = electronEntrypointResolve(paths.workspaceRoot);
        const app = await gymElectronLaunch({
            args: [`--user-data-dir=${paths.electronUserData}`, entrypoint.main],
            cwd: paths.workspaceRoot,
            env: {
                ...runtime.environment,
                ...linuxDisplayEnvironment(),
                HAPPY_DESKTOP_GYM_ELECTRON_USER_DATA: paths.electronUserData,
            },
            executablePath: entrypoint.executable,
            timeout: 60_000,
        });
        try {
            const page = await app.firstWindow();
            await page.waitForLoadState("domcontentloaded");
            await gymElectronInvisibleAssert(app);
            const welcome = page.locator('[data-happy-desktop-ui="welcome-screen"]');
            await welcome.waitFor({ state: "visible", timeout: 45_000 });
            await page.evaluate(() => document.fonts.ready);
            const video = await gymElectronVideoRecord(page, {
                path: options.out,
                codec: "h264",
                scale: options.scale ?? 1,
            });
            const driver = await gymPersonaDriverCreate(page, persona);
            const started = Date.now();
            let turns = 0;
            let ended: GymOnboardingRecording["ended"] = "limit";
            const flowSteps: (string | null)[] = [];
            const timeline: Record<string, number> = {};
            /**
             * Whether the flow has finished, noting each new step it reports on
             * the way. Requirements met (`completedVersion`) is not the end of
             * the conversation, which goes on until the model finishes it.
             */
            const flowFinished = async (): Promise<boolean> => {
                if (!chatOnboarding) return false;
                const flow = await runtime.client.onboardingFlow().catch(() => undefined);
                if (flow === undefined) return false;
                const step = flow.step ?? null;
                if (flow.status !== "not_started" && flowSteps.at(-1) !== step)
                    flowSteps.push(step);
                return flow.status === "finished";
            };
            let recorded: GymElectronVideoResult;
            /** The composer after each turn, as onboarding's flow set it. */
            const composerStates: { disabled: boolean; placeholder: string }[] = [];
            try {
                await driver.read(await welcome.innerText());
                await shot(page, "welcome");
                await driver.press(welcome.locator(".happy-welcome-screen__action").first());
                const pressedAt = Date.now();
                watchTimeline(page, pressedAt, timeline);
                const answered = new Set<string>();
                let idleSince = Date.now();
                while (Date.now() - started < limitMs) {
                    if (await flowFinished()) {
                        ended = "finished";
                        await driver.pause(1_500, 2_000);
                        await shot(page, "finished");
                        await driver.pause(FINISHED_WATCH_MS, FINISHED_WATCH_MS + 1_000);
                        break;
                    }
                    if (await gymPersonaTurn(page, persona, driver, answered)) {
                        turns += 1;
                        idleSince = Date.now();
                        // What the press brought, once it has had a moment to arrive.
                        await driver.pause(1_200, 1_800);
                        await shot(page, `turn-${String(turns)}`);
                        composerStates.push(
                            await page
                                .locator('[data-happy-desktop-ui="composer-textarea"]')
                                .first()
                                .evaluate((element) => ({
                                    disabled: (element as HTMLTextAreaElement).disabled,
                                    placeholder: (element as HTMLTextAreaElement).placeholder,
                                }))
                                .catch(() => ({ disabled: false, placeholder: "(none)" })),
                        );
                        continue;
                    }
                    const streaming = await page
                        .locator('[data-happy-desktop-ui="message"][aria-busy="true"]')
                        .count();
                    if (streaming > 0) idleSince = Date.now();
                    if (Date.now() - idleSince > IDLE_END_MS) {
                        ended = "idle";
                        break;
                    }
                    await driver.pause(400, 700);
                }
                await shot(page, "end");
            } finally {
                recorded = await video.stop();
            }
            await journalTimeline(runtime, timeline);
            await gymElectronInvisibleAssert(app);
            return {
                root: paths.root,
                chatOnboarding,
                video: recorded,
                screenshots,
                turns,
                ended,
                flowSteps,
                timeline,
                composerStates,
            };
        } finally {
            await app.close().catch(() => undefined);
        }
    } finally {
        await runtime.stop();
    }
}

/**
 * Notes, once each, when the window first shows a conversation and its first
 * reply, relative to the welcome's press. Stops after a minute.
 */
function watchTimeline(
    page: import("playwright").Page,
    pressedAt: number,
    timeline: Record<string, number>,
): void {
    const marks: readonly (readonly [string, string])[] = [
        ["conversationShown", '[data-happy-desktop-ui="composer-textarea"]'],
        ["firstReplyShown", '[data-happy-desktop-ui="message"]:not([data-own])'],
    ];
    const tick = async (): Promise<void> => {
        for (const [name, selector] of marks) {
            if (timeline[name] !== undefined) continue;
            const visible = await page
                .locator(selector)
                .first()
                .isVisible()
                .catch(() => false);
            if (visible) timeline[name] = Date.now() - pressedAt;
        }
        if (marks.every(([name]) => timeline[name] !== undefined)) return;
        if (Date.now() - pressedAt > 60_000) return;
        setTimeout(() => void tick(), 100);
    };
    timeline.welcomePressed = 0;
    timeline.pressedAtEpochMs = pressedAt;
    void tick();
}

/** When the Happy Agent's journal says onboarding started and its first run spoke. */
async function journalTimeline(
    runtime: { readonly client: import("./happyAgentProtocol.js").GymHappyAgentClient },
    timeline: Record<string, number>,
): Promise<void> {
    const pressedAt = timeline.pressedAtEpochMs;
    if (pressedAt === undefined) return;
    const events = await runtime.client.journalEvents().catch(() => []);
    const first = (type: string): number | undefined => {
        const found = events.find((entry) => entry.event.type === type);
        return found === undefined ? undefined : found.event.occurredAt - pressedAt;
    };
    for (const [name, type] of [
        ["flowUpdated", "onboarding.flow.updated"],
        ["runStarted", "run.started"],
        ["messageCreated", "message.created"],
        ["messageDelta", "message.delta"],
    ] as const) {
        const at = first(type);
        if (at !== undefined) timeline[name] = at;
    }
}
