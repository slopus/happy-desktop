import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { promisify } from "node:util";

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
    gymPersonaAnswersCreate,
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
/**
 * What the window's own setup offers to move on, in the order a person
 * reaches for them, for a Happy Agent that runs no onboarding conversation.
 */
const CLASSIC_PRESSES: readonly RegExp[] = [
    /^Continue$/u,
    /^Get started$/u,
    /^Next$/u,
    /^Skip/u,
    /^Not now$/u,
    /^Later$/u,
    /^Maybe later$/u,
    /^Done$/u,
    /^Finish/u,
];

const execFileAsync = promisify(execFile);

export interface GymOnboardingRecording {
    readonly root: string;
    readonly chatOnboarding: boolean;
    /** Each time the app was closed and opened again, after that many turns. */
    readonly relaunches: readonly number[];
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
    /**
     * `worked`: a computer the persona already works on, with their Git
     * identity and one recent project, so onboarding has real work to read.
     * `fresh` by default: an empty home.
     */
    readonly machine?: "fresh" | "worked";
    /**
     * Closes the app after this many turns and opens it again on the same
     * Happy Agent and window storage, as a person quitting mid-setup would.
     * The video carries on across it.
     */
    readonly relaunchAfterTurns?: number;
    /**
     * Once the first task starts, opens it from the sidebar and stays there,
     * as a person watching their task would, until the Chief of Staff's row
     * says something new arrived; then goes back and carries on.
     */
    readonly visitFirstTask?: boolean;
}): Promise<GymOnboardingRecording> {
    if (extname(options.out) !== ".mkv") throw new Error("The recording is H.264 in a .mkv file.");
    const persona = options.persona ?? GYM_PERSONA_NEW_USER;
    const limitMs = options.limitMs ?? 6 * 60_000;
    const { paths } = await gymRunPathsCreate("smoke", options.root);
    if (options.machine === "worked") await workedMachineSeed(paths.home, paths.bin, persona);
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
        const launch = () =>
            gymElectronLaunch({
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
        let app = await launch();
        /** The video's parts, one per launch, joined into `out` at the end. */
        const parts: string[] = [];
        const partPath = () =>
            parts.length === 0
                ? options.out
                : join(
                      dirname(options.out),
                      `${basename(options.out, ".mkv")}.part-${String(parts.length + 1)}.mkv`,
                  );
        const relaunches: number[] = [];
        try {
            let page = await app.firstWindow();
            await page.waitForLoadState("domcontentloaded");
            await gymElectronInvisibleAssert(app);
            const welcome = page.locator('[data-happy-desktop-ui="welcome-screen"]');
            await welcome.waitFor({ state: "visible", timeout: 45_000 });
            await page.evaluate(() => document.fonts.ready);
            parts.push(partPath());
            let video = await gymElectronVideoRecord(page, {
                path: parts.at(-1)!,
                codec: "h264",
                scale: options.scale ?? 1,
            });
            let driver = await gymPersonaDriverCreate(page, persona);
            const started = Date.now();
            let turns = 0;
            let ended: GymOnboardingRecording["ended"] = "limit";
            const flowSteps: (string | null)[] = [];
            const timeline: Record<string, number> = {};
            /** The first tasks the flow last listed, oldest first. */
            let firstTasks: readonly { readonly name: string }[] = [];
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
                firstTasks = flow.firstTasks ?? [];
                return flow.status === "finished";
            };
            /** Where the visit to the first task stands. */
            // Widened on purpose: `visitTurn` moves it on, which narrowing can't see.
            let visit = (options.visitFirstTask ? "before" : "back") as
                | "before"
                | "inTask"
                | "back";
            const sidebarRow = (name: string) =>
                page
                    .locator('[data-happy-desktop-ui="sidebar-item"]:visible')
                    .filter({ hasText: name })
                    .first();
            /** Opens the first task, or comes back once the Chief of Staff has news. */
            const visitTurn = async (): Promise<boolean> => {
                if (visit === "before") {
                    const first = firstTasks[0];
                    // After the Started message, which names the task.
                    const named =
                        first !== undefined &&
                        (await page
                            .locator('[data-happy-desktop-ui="message"]:visible')
                            .last()
                            .getByText(first.name)
                            .first()
                            .isVisible()
                            .catch(() => false));
                    const row = first === undefined ? undefined : sidebarRow(first.name);
                    if (!named || row === undefined || !(await row.isVisible().catch(() => false)))
                        return false;
                    await driver.pause(2_000, 3_000);
                    await driver.press(row);
                    visit = "inTask";
                    timeline.firstTaskOpened = Date.now() - (timeline.pressedAtEpochMs ?? 0);
                    await driver.pause(1_500, 2_000);
                    await shot(page, "in-task");
                    return true;
                }
                if (visit !== "inTask") return false;
                const chief = page
                    .locator('[data-happy-desktop-ui="sidebar-item"][data-unread]:visible')
                    .filter({ hasText: "Chief of Staff" })
                    .first();
                if (!(await chief.isVisible().catch(() => false))) return false;
                timeline.chiefUnreadShown = Date.now() - (timeline.pressedAtEpochMs ?? 0);
                await shot(page, "chief-unread");
                await driver.pause(2_000, 3_000);
                await driver.press(chief);
                visit = "back";
                await driver.pause(1_500, 2_000);
                await shot(page, "back-with-chief");
                return true;
            };
            /** Whether the window's own setup has handed over to the app. */
            const classicFinished = async (): Promise<boolean> =>
                !chatOnboarding &&
                (await page
                    .locator('[data-happy-desktop-ui="composer-textarea"]')
                    .first()
                    .isVisible()
                    .catch(() => false));
            /** Presses what the window's own setup offers to move on, if anything. */
            const classicTurn = async (): Promise<boolean> => {
                for (const pattern of CLASSIC_PRESSES) {
                    const button = page.getByRole("button", { name: pattern }).first();
                    if (!(await button.isVisible().catch(() => false))) continue;
                    if (!(await button.isEnabled().catch(() => false))) continue;
                    await driver.read(await page.locator("main, body").first().innerText());
                    await driver.press(button);
                    return true;
                }
                return false;
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
                const answers = gymPersonaAnswersCreate();
                let idleSince = Date.now();
                while (Date.now() - started < limitMs) {
                    if ((await flowFinished()) || (await classicFinished())) {
                        ended = "finished";
                        await driver.pause(1_500, 2_000);
                        await shot(page, "finished");
                        await driver.pause(FINISHED_WATCH_MS, FINISHED_WATCH_MS + 1_000);
                        break;
                    }
                    if (
                        options.relaunchAfterTurns !== undefined &&
                        turns === options.relaunchAfterTurns &&
                        relaunches.length === 0
                    ) {
                        // Quit mid-setup, then open the app again on the same
                        // Happy Agent: the window comes back where it was.
                        await driver.pause(1_500, 2_000);
                        await shot(page, "before-quit");
                        await video.stop();
                        await app.close().catch(() => undefined);
                        relaunches.push(turns);
                        app = await launch();
                        page = await app.firstWindow();
                        await page.waitForLoadState("domcontentloaded");
                        await gymElectronInvisibleAssert(app);
                        await page.evaluate(() => document.fonts.ready);
                        parts.push(partPath());
                        video = await gymElectronVideoRecord(page, {
                            path: parts.at(-1)!,
                            codec: "h264",
                            scale: options.scale ?? 1,
                        });
                        driver = await gymPersonaDriverCreate(page, persona);
                        await page
                            .locator('[data-happy-desktop-ui="composer-textarea"]')
                            .first()
                            .waitFor({ state: "visible", timeout: 45_000 })
                            .catch(() => undefined);
                        await driver.pause(2_500, 3_000);
                        await shot(page, "relaunched");
                        idleSince = Date.now();
                        continue;
                    }
                    // In the task, nothing there is the persona's to answer.
                    const acted =
                        (await visitTurn()) ||
                        (visit !== "inTask" &&
                            (chatOnboarding
                                ? await gymPersonaTurn(page, persona, driver, answers)
                                : await classicTurn()));
                    if (acted) {
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
                    // A reply being written, or tools still running under it.
                    const streaming =
                        (await page
                            .locator('[data-happy-desktop-ui="message"][aria-busy="true"]')
                            .count()) > 0 ||
                        (await page
                            .getByRole("button", { name: "Stop the agent" })
                            .first()
                            .isVisible()
                            .catch(() => false));
                    // A first task at work wakes the Chief of Staff when it
                    // finishes or needs the person, however long that takes.
                    if (streaming || firstTasks.length > 0) idleSince = Date.now();
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
            if (parts.length > 1) recorded = await videoPartsJoin(parts, recorded);
            await journalTimeline(runtime, timeline);
            await gymElectronInvisibleAssert(app);
            return {
                root: paths.root,
                chatOnboarding,
                relaunches,
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
 * reply, when focus chat holds the window and lets it go, and when a first
 * task's sidebar row is pointed at, relative to the welcome's press. Stops
 * once all are seen, the window closes, or after the take's longest run.
 */
function watchTimeline(
    page: import("playwright").Page,
    pressedAt: number,
    timeline: Record<string, number>,
): void {
    const marks: readonly (readonly [string, string])[] = [
        ["conversationShown", '[data-happy-desktop-ui="composer-textarea"]'],
        ["firstReplyShown", '[data-happy-desktop-ui="message"]:not([data-own])'],
        ["focusShown", '[data-happy-desktop-ui="app-shell-focus"]'],
        ["firstTaskHighlighted", '[data-happy-desktop-ui="sidebar-item"][data-highlight]'],
    ];
    const visible = (selector: string): Promise<boolean> =>
        page
            .locator(selector)
            .first()
            .isVisible()
            .catch(() => false);
    const tick = async (): Promise<void> => {
        if (page.isClosed()) return;
        for (const [name, selector] of marks) {
            if (timeline[name] !== undefined) continue;
            if (await visible(selector)) timeline[name] = Date.now() - pressedAt;
        }
        if (
            timeline.focusShown !== undefined &&
            timeline.focusReleased === undefined &&
            !(await visible('[data-happy-desktop-ui="app-shell-focus"]'))
        )
            timeline.focusReleased = Date.now() - pressedAt;
        if (
            marks.every(([name]) => timeline[name] !== undefined) &&
            timeline.focusReleased !== undefined
        )
            return;
        if (Date.now() - pressedAt > 30 * 60_000) return;
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

/**
 * Joins the video's parts, one per launch, into the first part's path, as one
 * H.264 Matroska. The last part's result stands for the size; its duration
 * becomes the whole.
 */
async function videoPartsJoin(
    parts: readonly string[],
    last: GymElectronVideoResult,
): Promise<GymElectronVideoResult> {
    const out = parts[0]!;
    const joined = join(dirname(out), `${basename(out, ".mkv")}.joined.mkv`);
    const list = join(dirname(out), `${basename(out, ".mkv")}.parts.txt`);
    await writeFile(
        list,
        parts.map((part) => `file '${part.replaceAll("'", "'\\''")}'`).join("\n"),
    );
    await execFileAsync(
        process.env.HAPPY_DESKTOP_GYM_FFMPEG?.trim() || "ffmpeg",
        [
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list,
            "-c",
            "copy",
            joined,
        ],
        { timeout: 120_000 },
    );
    const { stdout } = await execFileAsync(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", joined],
        { timeout: 30_000 },
    );
    await rm(list, { force: true });
    for (const part of parts) await rm(part, { force: true });
    await rename(joined, out);
    return { ...last, path: out, durationMs: Math.round(Number(stdout.trim()) * 1_000) };
}

/**
 * A computer the persona already works on: Git knows them, and one project
 * has a few days of work in it, a TODO added yesterday, and changes not yet
 * committed. Claude Code's session metadata names the project's folder, the
 * way recent-project discovery finds it. Every value is fixture data.
 */
async function workedMachineSeed(home: string, bin: string, persona: GymPersona): Promise<void> {
    // A computer someone works on has a current Node, which discovery runs on.
    await mkdir(bin, { recursive: true });
    await symlink(process.execPath, join(bin, "node")).catch(() => undefined);
    const project = join(home, "code", "weather-cli");
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(
        join(home, ".gitconfig"),
        `[user]\n\tname = ${persona.name}\n\temail = ${persona.email}\n[init]\n\tdefaultBranch = main\n`,
    );
    const git = async (args: readonly string[], daysAgo?: number): Promise<void> => {
        const date =
            daysAgo === undefined
                ? undefined
                : new Date(Date.now() - daysAgo * 86_400_000).toISOString();
        await execFileAsync("git", [...args], {
            cwd: project,
            env: {
                PATH: process.env.PATH ?? "/usr/bin:/bin",
                HOME: home,
                ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
            },
            timeout: 30_000,
        });
    };
    const commit = async (message: string, daysAgo: number): Promise<void> => {
        await git(["add", "-A"]);
        await git(["commit", "-q", "-m", message], daysAgo);
    };
    await git(["init", "-q"]);
    await writeFile(
        join(project, "README.md"),
        "# weather-cli\n\nCurrent conditions for a city, in the terminal.\n\n    weather-cli lisbon\n",
    );
    await writeFile(
        join(project, "package.json"),
        `${JSON.stringify({ name: "weather-cli", version: "0.3.0", type: "module", bin: { "weather-cli": "src/cli.ts" } }, null, 2)}\n`,
    );
    await writeFile(
        join(project, "src", "cli.ts"),
        [
            'import { current } from "./current.ts";',
            "",
            "const city = process.argv[2];",
            'if (!city) throw new Error("Usage: weather-cli <city>");',
            "console.log(await current(city));",
            "",
        ].join("\n"),
    );
    await writeFile(
        join(project, "src", "current.ts"),
        [
            "export async function current(city: string): Promise<string> {",
            "    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`);",
            "    return (await response.text()).trim();",
            "}",
            "",
        ].join("\n"),
    );
    await commit("Current conditions for a city", 6);
    await writeFile(
        join(project, "src", "cli.ts"),
        [
            'import { current } from "./current.ts";',
            "",
            'const units = process.argv.includes("--imperial") ? "u" : "m";',
            'const city = process.argv.slice(2).find((argument) => !argument.startsWith("--"));',
            'if (!city) throw new Error("Usage: weather-cli <city> [--imperial]");',
            "console.log(await current(city, units));",
            "",
        ].join("\n"),
    );
    await writeFile(
        join(project, "src", "current.ts"),
        [
            'export async function current(city: string, units: "m" | "u"): Promise<string> {',
            "    const url = `https://wttr.in/${encodeURIComponent(city)}?format=3&${units}`;",
            "    const response = await fetch(url);",
            "    return (await response.text()).trim();",
            "}",
            "",
        ].join("\n"),
    );
    await commit("Add --imperial for Fahrenheit and mph", 3);
    await git(["checkout", "-q", "-b", "hourly-forecast"]);
    await writeFile(
        join(project, "src", "forecast.ts"),
        [
            "// TODO: cache forecast responses for ten minutes; repeated runs hit wttr.in's rate limit.",
            "export async function hourly(city: string): Promise<string[]> {",
            "    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);",
            "    const body = (await response.json()) as {",
            "        weather: { hourly: { time: string; tempC: string }[] }[];",
            "    };",
            '    return body.weather[0]!.hourly.map((hour) => `${hour.time.padStart(4, "0")} ${hour.tempC}°C`);',
            "}",
            "",
        ].join("\n"),
    );
    await commit("Start the hourly forecast", 1);
    // Today's work, not committed yet.
    await writeFile(
        join(project, "src", "cli.ts"),
        [
            'import { current } from "./current.ts";',
            'import { hourly } from "./forecast.ts";',
            "",
            'const units = process.argv.includes("--imperial") ? "u" : "m";',
            'const city = process.argv.slice(2).find((argument) => !argument.startsWith("--"));',
            'if (!city) throw new Error("Usage: weather-cli <city> [--imperial] [--hourly]");',
            'if (process.argv.includes("--hourly")) for (const line of await hourly(city)) console.log(line);',
            "else console.log(await current(city, units));",
            "",
        ].join("\n"),
    );
    await writeFile(
        join(project, "README.md"),
        "# weather-cli\n\nCurrent conditions for a city, in the terminal.\n\n    weather-cli lisbon\n    weather-cli lisbon --hourly\n",
    );
    // Claude Code's sessions name the folder they ran in; discovery reads that alone.
    const sessions = join(home, ".claude", "projects", "-code-weather-cli");
    await mkdir(sessions, { recursive: true });
    const session = join(sessions, "6f1c2a9e-4b7d-4e2a-9c51-3d8e0f7a2b64.jsonl");
    const at = new Date(Date.now() - 2 * 3_600_000);
    await writeFile(
        session,
        `${JSON.stringify({ type: "user", cwd: project, sessionId: "6f1c2a9e-4b7d-4e2a-9c51-3d8e0f7a2b64", timestamp: at.toISOString(), message: { role: "user", content: "Add an --hourly flag." } })}\n`,
    );
    await utimes(session, at, at);
}
