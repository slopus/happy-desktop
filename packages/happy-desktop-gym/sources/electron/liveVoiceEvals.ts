import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { Cuid2 } from "@slopus/happy-agent-client";
import { gymRunPathsCreate } from "./paths.js";
import { happyAgentRuntimeCreate, type StartedHappyAgentRuntime } from "./happyAgentRuntime.js";
import { happyAgentClientCreate } from "./happyAgentProtocol.js";
import { completeOnboarding } from "./workloads.js";
import { liveVoiceSpeakersVerify } from "./liveVoiceSilence.js";
import type { LiveVoiceMedia } from "./liveVoiceMedia.js";
import {
    BENCHMARK_REPLY,
    BENCHMARK_TASK_REPLY,
    conversationTail,
    fixtureInferenceCreate,
    harborSeed,
    type FixtureInference,
    type HarborFixture,
} from "./liveVoiceFixture.js";
import {
    callStatusAwait,
    endedDismiss,
    endedMessage,
    actionsOf,
    liveVoiceWindowOpen,
    phoneStatus,
    settingsBack,
    shot,
    signInFreshAssert,
    speechWrite,
    transcriptOf,
    voiceAccountChoose,
    type ControlEvent,
    type LiveVoiceWindow,
} from "./liveVoiceWindow.js";
import type { GymRunPaths } from "./types.js";

export const LIVE_VOICE_EVALS = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;
export type LiveVoiceEval = (typeof LIVE_VOICE_EVALS)[number];

/** A received level above this is speech, far above Opus comfort noise. */
const SPEECH_LEVEL = 1e-4;
/**
 * GPT-Live has no direct tools, so a turn is answered from what the voice
 * model already holds, or delegated to the controller with an immediate
 * acknowledgment. Speech end → first audio budget for either.
 */
const FIRST_AUDIO_BUDGET_MS = 3_500;

type Tier = "context" | "delegated";

/** One assertion: `hard` decides the scenario, `soft` is a time budget, `pending` waits on a decision. */
export type Check = {
    id: string;
    kind: "hard" | "soft" | "pending";
    pass: boolean | null;
    detail: string;
};

type LiveRecord = { at: number; event: string; [key: string]: unknown };

type Turn = {
    said: string;
    heard: string[];
    assistant: string;
    words: number;
    actions: ReturnType<typeof actionsOf>;
    delegations: number;
    tools: string[];
    tier: Tier;
    expectedTier?: Tier;
    /** When the controller's first outcome reached voice, for a delegated turn. */
    deliveredAt: number | null;
    speechEnd: number;
    firstAudioMs: number | null;
    firstTranscriptMs: number | null;
    focusAfter: string | null;
};

type Context = {
    paths: GymRunPaths;
    runtime: StartedHappyAgentRuntime;
    inference: FixtureInference;
    window: LiveVoiceWindow;
    harbor: HarborFixture;
    checks: Check[];
    turns: Turn[];
    capturePath: string;
    name: LiveVoiceEval;
};

/**
 * The S1–S6 voice evals from the desktop voice eval report, on the shared
 * "Harbor" fixture: real GPT-Live and a real controller, scripted fixture
 * conversations. Each spoken turn declares the tier it should take, checked
 * from the window's control frames and the hosting daemon's live diagnostics;
 * each scenario's other checks follow the report. Muted like every live lane.
 */
export async function gymLiveVoiceEvalsRun(options: {
    authFile: string;
    artifactDirectory?: string;
    scenarios?: readonly LiveVoiceEval[];
    label?: string;
}): Promise<void> {
    if (!isAbsolute(options.authFile))
        throw new Error("--auth-file must reference an existing absolute Codex sign-in path.");
    await access(options.authFile);
    await signInFreshAssert(options.authFile);
    const scenarios = options.scenarios ?? LIVE_VOICE_EVALS;
    const report: Record<string, unknown> = {
        label: options.label ?? "unlabelled",
        agentExecutable: process.env.HAPPY_DESKTOP_AGENT_EXECUTABLE ?? "installed",
        startedAt: new Date().toISOString(),
        scenarios: {},
    };
    const results = report.scenarios as Record<string, unknown>;
    const root = options.artifactDirectory;
    for (const name of scenarios) {
        console.log(JSON.stringify({ stage: "scenario", name }));
        try {
            results[name] = await scenarioRun(
                name,
                options.authFile,
                root ? join(root, name) : undefined,
            );
        } catch (error) {
            results[name] = { error: error instanceof Error ? error.message : String(error) };
        }
    }
    report.finishedAt = new Date().toISOString();
    if (root) {
        await mkdir(root, { recursive: true });
        await writeFile(join(root, "evals.json"), JSON.stringify(report, null, 2));
        await writeFile(join(root, "evals.md"), evalsTable(report));
    }
    console.log(evalsTable(report));
}

async function scenarioRun(name: LiveVoiceEval, authFile: string, artifactDirectory?: string) {
    const { paths } = await gymRunPathsCreate("smoke", undefined, artifactDirectory);
    const inference = fixtureInferenceCreate();
    await inference.start();
    const capturePath = join(paths.artifacts, "live-capture.ndjson");
    const configuration = [
        "[settings]",
        "happy_integration = false",
        "menu_bar = false",
        "[profile]",
        'name = "Voice Gym"',
        'email = "voice-gym@example.invalid"',
        "[node]",
        'name = "Harbor Mac"',
        "[feature.mobile_connector]",
        "enabled = false",
        "[providers.voice]",
        'type = "codex"',
        "enabled = true",
        "credential_isolation = true",
        `auth_file = ${JSON.stringify(authFile)}`,
        // An explicit endpoint keeps this account live beside the scripted fixture.
        'base_url = "https://chatgpt.com/backend-api"',
        "[defaults]",
        'provider = "voice"',
        'model = "openai/gpt-6-astra"',
        'effort = "medium"',
        "",
    ].join("\n");
    const runtime = await happyAgentRuntimeCreate(paths, inference, configuration, {
        HAPPY_GYM_LIVE_INFERENCE: "1",
        // The diagnostics build writes each push to voice here as {at, kind, text, speakable}.
        HAPPY_LIVE_CONTEXT_CAPTURE_FILE: capturePath,
    });
    const checks: Check[] = [];
    const turns: Turn[] = [];
    let window: LiveVoiceWindow | undefined;
    const outcome: Record<string, unknown> = { root: paths.root };
    try {
        await happyAgentClientCreate(runtime.socketPath, runtime.token).completeOnboarding();
        const harbor = await harborSeed(runtime, inference);
        outcome.fixture = Object.fromEntries(
            [...harbor.tasks.values()].map((task) => [task.name, task]),
        );
        window = await liveVoiceWindowOpen({ paths, environment: runtime.environment });
        await completeOnboarding(window.page);
        await window.page
            .getByText("Ship the cache", { exact: true })
            .first()
            .waitFor({ timeout: 60_000 });
        await voiceAccountChoose(window.page, "voice");
        await settingsBack(window.page);
        await sidebarClick(window, "Ship the cache");
        const context: Context = {
            paths,
            runtime,
            inference,
            window,
            harbor,
            checks,
            turns,
            capturePath,
            name,
        };
        await SCENARIOS[name](context);
        const silence = await liveVoiceSpeakersVerify(window.app, window.page);
        outcome.silence = silence;
    } catch (error) {
        outcome.error = error instanceof Error ? error.message : String(error);
        if (window) await shot(window.page, paths, "failure").catch(() => undefined);
    } finally {
        checks.push(...tierChecks(turns));
        outcome.checks = checks;
        outcome.turns = turns;
        outcome.capture = await captureRead(capturePath);
        if (window) {
            await writeFile(
                join(paths.artifacts, "control-events.json"),
                JSON.stringify(window.events, null, 2),
            );
        }
        await window?.app.close().catch(() => undefined);
        await runtime.stop().catch(() => undefined);
        await inference.stop().catch(() => undefined);
        // The hosting daemon's own record of every delegation, action and push.
        await copyFile(
            join(paths.agentHome, "observation", "agent.log"),
            join(paths.artifacts, "agent.log"),
        ).catch(() => undefined);
        await writeFile(join(paths.artifacts, "outcome.json"), JSON.stringify(outcome, null, 2));
    }
    return outcome;
}

/** Each turn's tier against what it declared: no delegation, or one acknowledged at once. */
function tierChecks(turns: readonly Turn[]): Check[] {
    const checks: Check[] = [];
    turns.forEach((turn, index) => {
        if (turn.expectedTier === undefined) return;
        const label = `turn ${index + 1} "${turn.said.slice(0, 48)}"`;
        checks.push({
            id: `${label} ${turn.expectedTier === "context" ? "answered from context" : "delegated"}`,
            kind: "hard",
            pass: turn.tier === turn.expectedTier,
            detail: `took ${turn.tier} (delegations ${turn.delegations}, actions ${turn.actions.map((action) => action.type).join(",") || "none"})`,
        });
        if (turn.tier === "delegated")
            checks.push({
                id: `${label} acknowledged before the outcome`,
                kind: "hard",
                pass:
                    turn.firstAudioMs !== null &&
                    (turn.deliveredAt === null ||
                        turn.speechEnd + turn.firstAudioMs < turn.deliveredAt),
                detail: `first audio ${turn.firstAudioMs ?? "none"} ms, outcome ${turn.deliveredAt === null ? "not seen" : `${turn.deliveredAt - turn.speechEnd} ms`} after speech end`,
            });
        checks.push({
            id: `${label} first audio within ${FIRST_AUDIO_BUDGET_MS} ms`,
            kind: "soft",
            pass: turn.firstAudioMs !== null && turn.firstAudioMs <= FIRST_AUDIO_BUDGET_MS,
            detail: `first audio ${turn.firstAudioMs ?? "none"} ms`,
        });
    });
    return checks;
}

/** The call: press the phone, then speak, listen and act through these helpers. */
async function callStart(context: Context) {
    const { page } = context.window;
    await page.evaluate(() =>
        (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.peersReset(),
    );
    const pressedAt = Date.now();
    await page.getByRole("button", { name: "Start voice call", exact: true }).click();
    while (Date.now() - pressedAt < 90_000) {
        const status = await phoneStatus(page);
        if (status === "active" || status === "ended") break;
        await page.waitForTimeout(25);
    }
    const status = await phoneStatus(page);
    if (status !== "active") throw new Error(`The call did not become active: ${status}`);
    const activeAt = Date.now();
    const directory = join(context.paths.artifacts, `call-${activeAt}`);
    await mkdir(directory, { recursive: true });
    let spoken = 0;
    const play = async (text: string) => {
        const wav = await speechWrite(directory, `turn-${++spoken}`, text);
        return page.evaluate(
            (base64) =>
                (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.microphonePlay(base64),
            (await readFile(wav)).toString("base64"),
        );
    };
    const firstAudioAfter = (since: number) =>
        page.evaluate(
            ([at, level]) =>
                (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.audioAfter(
                    at!,
                    level!,
                ),
            [since, SPEECH_LEVEL] as const,
        );
    /** Speaks one turn, waits out its answer, and records what it took. */
    const say = async (
        text: string,
        options: { tier?: Tier; during?: () => Promise<void> } = {},
    ): Promise<Turn> => {
        const fromEvent = context.window.events.length;
        const playback = await play(text);
        const speechEnd = playback.startedAt + Math.round(playback.durationSeconds * 1_000);
        if (options.during) await options.during();
        await settled(context, fromEvent, speechEnd);
        return turnRecord(context, text, fromEvent, speechEnd, options.tier);
    };
    return {
        activeAt,
        say,
        /** Speaks without waiting for an answer: for overlapping requests and barge-in. */
        play,
        /** Waits for the assistant's audio after `since`, up to `timeoutMs`. */
        async audioAwait(since: number, timeoutMs = 15_000) {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                const at = await firstAudioAfter(since);
                if (at !== null) return at;
                await page.waitForTimeout(50);
            }
            return null;
        },
        /** Stays silent and reports anything the call said meanwhile. */
        async quiet(ms: number) {
            const from = Date.now();
            const fromEvent = context.window.events.length;
            await page.waitForTimeout(ms);
            const events = context.window.events.slice(fromEvent);
            return {
                transcripts: transcriptOf(events, "assistant"),
                audioAt: await firstAudioAfter(from),
            };
        },
        turnRecord: (text: string, fromEvent: number, speechEnd: number, tier?: Tier) =>
            turnRecord(context, text, fromEvent, speechEnd, tier),
        settled: (fromEvent: number, speechEnd: number) => settled(context, fromEvent, speechEnd),
        async end() {
            if ((await phoneStatus(page)) === "active")
                await page.getByRole("button", { name: "End voice call", exact: true }).click();
            await page
                .getByRole("button", { name: "Start voice call", exact: true })
                .waitFor({ timeout: 30_000 })
                .catch(() => undefined);
            const recordings = await page
                .evaluate(() =>
                    (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.recordingsFinish(),
                )
                .catch(() => []);
            for (const recording of recordings)
                await writeFile(
                    join(directory, `${recording.name}.webm`),
                    Buffer.from(recording.base64, "base64"),
                );
            await page
                .evaluate(() =>
                    (
                        window as Window & { voiceGym?: LiveVoiceMedia }
                    ).voiceGym!.microphoneRelease(),
                )
                .catch(() => undefined);
        },
    };
}

/** An answer is over once frames and the daemon's delegations have been quiet for a while. */
async function settled(context: Context, fromEvent: number, speechEnd: number) {
    const { page } = context.window;
    await page.waitForTimeout(Math.max(0, speechEnd - Date.now()) + 1_000);
    const deadline = Date.now() + 150_000;
    let seen = context.window.events.length;
    let movedAt = Date.now();
    while (Date.now() < deadline) {
        if (context.window.events.length !== seen) {
            seen = context.window.events.length;
            movedAt = Date.now();
        }
        const recent = context.window.events.slice(fromEvent);
        const answered = recent.some(
            (event) => event.frame.type === "transcript" && event.frame.role === "assistant",
        );
        const requested = recent.filter((event) => event.frame.type === "actionRequested").length;
        const finished = recent.filter((event) => event.frame.type === "actionResult").length;
        const records = await liveRecords(context, speechEnd - 2_000, Date.now());
        // Queued is logged the moment voice hands off, before the controller starts.
        const open =
            records.filter((record) => record.event === "delegation.queued").length >
            records.filter((record) => record.event === "delegation.delivered").length;
        if (answered && requested === finished && !open && Date.now() - movedAt > 12_000) return;
        if ((await phoneStatus(page)) !== "active") return;
        await page.waitForTimeout(500);
    }
}

async function turnRecord(
    context: Context,
    said: string,
    fromEvent: number,
    speechEnd: number,
    expectedTier?: Tier,
): Promise<Turn> {
    const { page } = context.window;
    const events = context.window.events.slice(fromEvent);
    const records = await liveRecords(context, speechEnd - 2_000, Date.now());
    const actions = actionsOf(events);
    const delegations = records.filter((record) => record.event === "delegation.queued").length;
    const tools = records
        .filter((record) => record.event === "tool.called")
        .map((record) => String(record.name));
    // A desktop action only comes from the controller, so it marks a delegation
    // even when its queued record fell outside this window.
    const tier: Tier = delegations > 0 || actions.length > 0 ? "delegated" : "context";
    const deliveredAt =
        records.find((record) => record.event === "delegation.delivered")?.at ?? null;
    const firstAudioAt = await page.evaluate(
        ([at, level]) =>
            (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.audioAfter(at!, level!),
        [speechEnd, SPEECH_LEVEL] as const,
    );
    const firstTranscriptAt =
        events.find(
            (event) =>
                event.frame.type === "transcript" &&
                event.frame.role === "assistant" &&
                event.at >= speechEnd,
        )?.at ?? null;
    const assistant = transcriptOf(events, "assistant").join(" ");
    const turn: Turn = {
        said,
        heard: transcriptOf(events, "user"),
        assistant,
        words: assistant.split(/\s+/).filter(Boolean).length,
        actions,
        delegations,
        tools,
        tier,
        ...(expectedTier === undefined ? {} : { expectedTier }),
        deliveredAt,
        speechEnd,
        firstAudioMs: firstAudioAt === null ? null : firstAudioAt - speechEnd,
        firstTranscriptMs: firstTranscriptAt === null ? null : firstTranscriptAt - speechEnd,
        focusAfter: focusOf(context, context.window.events),
    };
    context.turns.push(turn);
    console.log(
        JSON.stringify({
            stage: "turn",
            scenario: context.name,
            said,
            tier,
            expectedTier,
            assistant: assistant.slice(0, 240),
            firstAudioMs: turn.firstAudioMs,
        }),
    );
    return turn;
}

/** The Harbor task whose conversation the window last reported on screen. */
function focusOf(context: Context, events: readonly ControlEvent[]): string | null {
    const latest = [...events].reverse().find((event) => event.frame.type === "desktopContext");
    const target = (latest?.frame.context as { activeTarget?: { sessionId?: string } } | undefined)
        ?.activeTarget;
    if (!target?.sessionId) return null;
    for (const task of context.harbor.tasks.values())
        if (task.agentId === target.sessionId) return task.name;
    return target.sessionId;
}

/** The hosting daemon's live diagnostics in a time window. */
async function liveRecords(context: Context, from: number, to: number): Promise<LiveRecord[]> {
    const text = await readFile(
        join(context.paths.agentHome, "observation", "agent.log"),
        "utf8",
    ).catch(() => "");
    const records: LiveRecord[] = [];
    for (const line of text.split("\n")) {
        try {
            const entry = JSON.parse(line) as {
                module?: string;
                time?: string | number;
                msg?: string;
            };
            if (
                entry.module !== "live" ||
                typeof entry.msg !== "string" ||
                !entry.msg.startsWith("{")
            )
                continue;
            const at = new Date(entry.time ?? 0).getTime();
            if (at < from || at > to) continue;
            records.push({
                ...(JSON.parse(entry.msg) as Record<string, unknown>),
                at,
            } as LiveRecord);
        } catch {
            /* Not a JSON diagnostic line. */
        }
    }
    return records;
}

/** What the daemon pushed to the voice model, when a build writes it. */
async function captureRead(path: string): Promise<unknown[]> {
    const text = await readFile(path, "utf8").catch(() => "");
    return text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
            try {
                return JSON.parse(line) as unknown;
            } catch {
                return line;
            }
        });
}

async function sidebarClick(window: LiveVoiceWindow, name: string) {
    await window.page.getByText(name, { exact: true }).first().click();
    await window.page.waitForTimeout(1_200);
}

const check = (
    context: Context,
    id: string,
    pass: boolean | null,
    detail: string,
    kind: Check["kind"] = "hard",
) => context.checks.push({ id, kind, pass, detail });

const has = (text: string, pattern: RegExp) => pattern.test(text);
/** Code, paths, hashes and IDs voice must never read out. */
const UNSPEAKABLE = /```|[0-9a-f]{7,}|[\w-]+\/[\w-]+\.[a-z]{1,4}\b|\.ts\b|CacheStore\.put/i;
const NUMBER_WORDS: Record<string, number> = {
    a: 1,
    an: 1,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
};
/** "12 minutes ago", "twelve minutes ago", "just now" → minutes. */
function minutesSaid(text: string): number | null {
    if (/just now|a moment ago|seconds ago/i.test(text)) return 0;
    const match = /(\d+|[a-z]+(?:[- ][a-z]+)?) minutes? ago/i.exec(text);
    if (!match) return /an? hour ago/i.test(text) ? 60 : null;
    const value = match[1]!.toLowerCase();
    if (/^\d+$/.test(value)) return Number(value);
    return value.split(/[- ]/).reduce((sum, word) => sum + (NUMBER_WORDS[word] ?? 0), 0) || null;
}
const overlap = (a: string, b: string) => {
    const words = (value: string) => new Set(value.toLowerCase().match(/[a-z']+/g) ?? []);
    const left = words(a);
    const right = words(b);
    if (left.size === 0) return 0;
    let shared = 0;
    for (const word of left) if (right.has(word)) shared++;
    return shared / left.size;
};

const SCENARIOS: Record<LiveVoiceEval, (context: Context) => Promise<void>> = {
    /** S1. Catch-up: what is going on, from context first. */
    async S1(context) {
        const call = await callStart(context);
        const ship = context.harbor.task("Ship the cache");
        const t1 = await call.say("Hi.", { tier: "context" });
        check(
            context,
            "S1 t1 at most 25 words, no delegation or action",
            t1.words <= 25 && t1.delegations === 0 && t1.actions.length === 0,
            `${t1.words} words, tier ${t1.tier}`,
        );
        const t2 = await call.say("What's going on in this one?", { tier: "context" });
        check(context, "S1 t2 says Tuesday", has(t2.assistant, /tuesday/i), t2.assistant);
        check(context, "S1 t2 at most 60 words", t2.words <= 60, `${t2.words} words`);
        check(
            context,
            "S1 t2 reads no code, path or hash",
            !UNSPEAKABLE.test(t2.assistant),
            t2.assistant,
        );
        check(
            context,
            "S1 t2 no navigation, focus unchanged",
            !t2.actions.some((action) => action.type === "desktopOpen") &&
                t2.focusAfter === "Ship the cache",
            `focus ${t2.focusAfter}`,
        );
        const t3 = await call.say("And the release notes task?", { tier: "context" });
        check(
            context,
            "S1 t3 says it failed or hit an error",
            has(t3.assistant, /fail|error|rate.?limit/i),
            t3.assistant,
        );
        check(
            context,
            "S1 t3 no navigation",
            !t3.actions.some((action) => action.type === "desktopOpen"),
            t3.actions.map((action) => action.type).join(","),
        );
        const t4 = await call.say("Does anything need me?", { tier: "context" });
        check(
            context,
            "S1 t4 names Fix login redirect",
            has(t4.assistant, /redirect/i),
            t4.assistant,
        );
        const t5 = await call.say("Which tasks do I have about login?", { tier: "context" });
        check(
            context,
            "S1 t5 names both login tasks",
            has(t5.assistant, /redirect/i) && has(t5.assistant, /copy/i),
            t5.assistant,
        );
        const t6 = await call.say("When did the cache task finish?", { tier: "context" });
        const age = Math.round((t6.speechEnd - ship.seededAt) / 60_000);
        const said = minutesSaid(t6.assistant);
        check(
            context,
            "S1 t6 relative time within 2 minutes",
            said !== null && Math.abs(said - age) <= 2,
            `said ${said} min, actual ${age} min: ${t6.assistant}`,
        );
        check(context, "S1 t6 no clock time", !/\d{1,2}:\d{2}/.test(t6.assistant), t6.assistant);
        const t7 = await call.say("What time exactly?", { tier: "context" });
        const finished = new Date(ship.seededAt);
        const clock = /(\d{1,2})[:.](\d{2})/.exec(t7.assistant);
        const minutesOfDay = (hours: number, minutes: number) => hours * 60 + minutes;
        const actual = minutesOfDay(finished.getHours() % 12, finished.getMinutes());
        check(
            context,
            "S1 t7 clock time within 2 minutes",
            clock !== null &&
                Math.abs(minutesOfDay(Number(clock[1]) % 12, Number(clock[2])) - actual) <= 2,
            `${t7.assistant} (finished ${finished.toTimeString().slice(0, 5)})`,
        );
        await call.end();
        const capture = await captureRead(context.capturePath);
        const pushed = JSON.stringify(capture);
        check(
            context,
            "S1 call-start push has a Now line with a UTC offset",
            /Now[:\s][^\n"]*([+\-−]\d{1,2}(:?\d{2})?|[A-Za-z]+\/[A-Za-z_]+)/.test(pushed),
            `${capture.length} captured pushes`,
        );
        check(
            context,
            "S1 push has times on the on-screen turns and rows",
            /(ago|just now) \(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(pushed),
            `${capture.length} captured pushes`,
        );
    },
    /** S2. Think aloud, then send, and the screen stays. */
    async S2(context) {
        const call = await callStart(context);
        const release = context.harbor.task("Release notes");
        const ship = context.harbor.task("Ship the cache");
        const t1 = await call.say(
            "I'm thinking the cache race might be the two writers sharing one lock. Maybe we should try a mutex first.",
            { tier: "context" },
        );
        const t2 = await call.say("And, um, also check the eviction path.", { tier: "context" });
        for (const [index, turn] of [t1, t2].entries())
            check(
                context,
                `S2 t${index + 1} a few words, no action, no offer to send`,
                turn.words <= 6 &&
                    turn.actions.length === 0 &&
                    turn.delegations === 0 &&
                    !/\bsend\b/i.test(turn.assistant),
                `${turn.words} words: ${turn.assistant}`,
            );
        const t3 = await call.say("Okay, send that to the release notes task.", {
            tier: "delegated",
        });
        const sends = t3.actions.filter((action) => action.type === "sessionSend");
        check(
            context,
            "S2 t3 exactly one sessionSend",
            sends.length === 1,
            t3.actions.map((action) => `${action.type}:${action.status}`).join(","),
        );
        const tail = await conversationTail(context.runtime, release.agentId);
        const thought = `${t1.heard.join(" ")} ${t2.heard.join(" ")}`;
        const text = tail.userText ?? tail.draft ?? "";
        check(
            context,
            "S2 t3 the text keeps both thoughts (overlap ≥ 0.9)",
            overlap(thought, text) >= 0.9,
            `overlap ${overlap(thought, text).toFixed(2)}: ${text}`,
        );
        check(
            context,
            "S2 t3 the message was submitted (decision: send really sends)",
            tail.userText !== null && overlap(thought, tail.userText) >= 0.6,
            `last message: ${tail.userText ?? "none"}; draft: ${tail.draft ?? "none"}`,
        );
        check(
            context,
            "S2 t3 says sent only if sent, at most 15 words, no echo",
            t3.words <= 15 && overlap(t3.assistant, thought) < 0.5,
            t3.assistant,
        );
        check(
            context,
            "S2 t3 the screen stayed on Ship the cache (decision)",
            t3.focusAfter === "Ship the cache",
            `focus ${t3.focusAfter}`,
        );
        const t4 = await call.say("Also tell the cache task: run the benchmark again, please.", {
            tier: "delegated",
        });
        const shipTail = await conversationTail(context.runtime, ship.agentId);
        check(
            context,
            "S2 t4 one sessionSend to Ship the cache",
            t4.actions.filter((action) => action.type === "sessionSend").length === 1 &&
                /benchmark again/i.test(shipTail.userText ?? shipTail.draft ?? ""),
            `${shipTail.userText ?? shipTail.draft}`,
        );
        const t5 = await call.say("Did those go through?", { tier: "context" });
        check(
            context,
            "S2 t5 no new action",
            t5.actions.length === 0,
            t5.actions.map((action) => action.type).join(","),
        );
        await call.end();
    },
    /** S3. A reply arrives mid-call and is known before it is asked for. */
    async S3(context) {
        const ship = context.harbor.task("Ship the cache");
        const call = await callStart(context);
        // The greeting is the call's own opening, not news: let it finish before the reply arrives.
        const greeting = await call.quiet(4_000);
        check(
            context,
            "S3 the greeting is a short hello",
            greeting.transcripts.join(" ").split(/\s+/).filter(Boolean).length <= 8,
            greeting.transcripts.join(" ") || "silence",
            "soft",
        );
        const client = happyAgentClientCreate(context.runtime.socketPath, context.runtime.token);
        context.inference.script(ship.agentId, "Ship the cache", [
            {
                content: [{ type: "text", text: BENCHMARK_REPLY }],
                textDeltaChunkSize: 6,
                textDeltaDelayMs: 300,
            },
        ]);
        await context.runtime.client.sendMessage(ship.agentId, "Run the benchmark again, please.");
        const copy = context.harbor.task("Login page copy");
        const current = await client.getTask(copy.taskId as Cuid2);
        await client.renameTask(
            copy.taskId as Cuid2,
            { name: "Sign-in copy", mutationId: randomUUID() },
            { ifMatch: current.task.version },
        );
        const { task } = await client.createTask({ mutationId: randomUUID() });
        await new Promise((resolve) => setTimeout(resolve, 400));
        const created = await client.getTask(task.id);
        await client.renameTask(
            task.id,
            { name: "Benchmark the cache", mutationId: randomUUID() },
            { ifMatch: created.task.version },
        );
        context.inference.script(task.agent.id, "Benchmark the cache", [
            { content: [{ type: "text", text: BENCHMARK_TASK_REPLY }] },
        ]);
        await context.runtime.client.sendMessage(
            task.agent.id,
            "Benchmark the cache with ten thousand keys.",
        );
        const quiet = await call.quiet(12_000);
        check(
            context,
            "S3 12 s of silence while the reply arrives",
            quiet.transcripts.length === 0 && quiet.audioAt === null,
            `transcripts ${JSON.stringify(quiet.transcripts)}, audio ${quiet.audioAt}`,
        );
        const t1 = await call.say("What did the cache task say?", { tier: "context" });
        check(context, "S3 t1 says 93", has(t1.assistant, /93|ninety.three/i), t1.assistant);
        await call.say("Anything else new?", { tier: "context" });
        const t3 = await call.say("Open the new benchmark task.", { tier: "delegated" });
        check(
            context,
            "S3 t3 opens Benchmark the cache, never says New Task",
            t3.actions.some(
                (action) => action.type === "desktopOpen" && action.status === "succeeded",
            ) && !/new task/i.test(t3.assistant),
            `${t3.actions.map((action) => `${action.type}:${action.status}`).join(",")} ${t3.assistant}`,
        );
        const t4 = await call.say("What's in it so far?", { tier: "context" });
        check(
            context,
            "S3 t4 says 91 from the pushed turns",
            has(t4.assistant, /91|ninety.one/i),
            t4.assistant,
        );
        await sidebarClick(context.window, "Release notes");
        const hand = await call.quiet(8_000);
        check(
            context,
            "S3 opening by hand says nothing for 8 s",
            hand.transcripts.length === 0 && hand.audioAt === null,
            JSON.stringify(hand.transcripts),
        );
        const t5 = await call.say("What happened here?", { tier: "context" });
        check(
            context,
            "S3 t5 names the error",
            has(t5.assistant, /fail|error|rate.?limit/i),
            t5.assistant,
        );
        await call.end();
        const capture = await captureRead(context.capturePath);
        check(
            context,
            "S3 the reply was pushed as silent context",
            JSON.stringify(capture).includes("93 percent"),
            `${capture.length} captured pushes`,
        );
    },
    /** S4. Navigation, a stale screen, a new task, and one multi-step request. */
    async S4(context) {
        const call = await callStart(context);
        const t1 = await call.say("What tasks do I have?", { tier: "context" });
        check(
            context,
            "S4 t1 no navigation",
            !t1.actions.some((action) => action.type === "desktopOpen") &&
                t1.focusAfter === "Ship the cache",
            `focus ${t1.focusAfter}`,
        );
        const t2 = await call.say("Open the release notes task.", { tier: "delegated" });
        check(
            context,
            "S4 t2 opens Release notes, at most 8 words",
            t2.actions.filter(
                (action) => action.type === "desktopOpen" && action.status === "succeeded",
            ).length === 1 &&
                t2.focusAfter === "Release notes" &&
                t2.words <= 8,
            `${t2.focusAfter}, ${t2.words} words: ${t2.assistant}`,
        );
        const t3 = await call.say("Go back to the cache task.", {
            tier: "delegated",
            during: () => sidebarClick(context.window, "Harbor task 05"),
        });
        check(
            context,
            "S4 t3 ends on Ship the cache in at most two attempts",
            t3.focusAfter === "Ship the cache" &&
                t3.actions.filter((action) => action.type === "desktopOpen").length <= 2,
            `${t3.focusAfter}: ${t3.actions.map((action) => `${action.type}:${action.status}`).join(",")}`,
        );
        const t4 = await call.say("Open the login one.", { tier: "context" });
        check(
            context,
            "S4 t4 asks which, no action",
            t4.actions.filter((action) => action.type === "desktopOpen").length === 0 &&
                /\?|which/i.test(t4.assistant),
            t4.assistant,
        );
        const t5 = await call.say("The redirect one.", { tier: "delegated" });
        check(
            context,
            "S4 t5 opens Fix login redirect",
            t5.focusAfter === "Fix login redirect",
            `focus ${t5.focusAfter}`,
        );
        const t6 = await call.say("Start a new task: benchmark the cache with ten thousand keys.", {
            tier: "delegated",
        });
        check(
            context,
            "S4 t6 one taskCreate",
            t6.actions.filter((action) => action.type === "taskCreate").length === 1,
            t6.actions.map((action) => `${action.type}:${action.status}`).join(","),
        );
        const t7 = await call.say(
            "Find whichever task mentions rate limits, open it, and draft a reply saying retry tomorrow.",
            { tier: "delegated" },
        );
        const ack = t7.firstAudioMs;
        check(
            context,
            "S4 t7 acknowledges within 3.5 s",
            ack !== null && ack <= 3_500,
            `first audio ${ack} ms`,
            "soft",
        );
        check(
            context,
            "S4 t7 opened Release notes and staged a draft",
            t7.focusAfter === "Release notes" &&
                t7.actions.some(
                    (action) =>
                        action.type === "composerDraftAppend" || action.type === "sessionSend",
                ),
            `${t7.focusAfter}: ${t7.actions.map((action) => action.type).join(",")}`,
        );
        await call.end();
    },
    /** S5. Interruptions and overlapping requests. */
    async S5(context) {
        const call = await callStart(context);
        const { page } = context.window;
        const from = context.window.events.length;
        const first = await call.play("Read me the latest message in Ship the cache, in full.");
        const firstEnd = first.startedAt + Math.round(first.durationSeconds * 1_000);
        const audioAt = await call.audioAwait(firstEnd, 30_000);
        if (audioAt !== null) await page.waitForTimeout(Math.max(0, audioAt + 2_000 - Date.now()));
        const barge = await call.play("Stop. Just tell me when it ships.");
        const bargeEnd = barge.startedAt + Math.round(barge.durationSeconds * 1_000);
        await page.waitForTimeout(Math.max(0, bargeEnd + 1_000 - Date.now()));
        const levels = await page.evaluate(
            (since) =>
                (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.levelsSince(since),
            bargeEnd,
        );
        const loud = levels.filter(
            (sample) => sample.at <= bargeEnd + 1_000 && sample.level > SPEECH_LEVEL,
        );
        check(
            context,
            "S5 t1b the reading stops within 1 s of the barge-in",
            audioAt !== null &&
                loud.length < levels.filter((sample) => sample.at <= bargeEnd + 1_000).length,
            `${loud.length} loud samples in the second after`,
        );
        await call.settled(from, bargeEnd);
        const t1b = await call.turnRecord("Stop. Just tell me when it ships.", from, bargeEnd);
        check(
            context,
            "S5 t1b answers Tuesday in at most 20 words",
            has(t1b.assistant.split(/stop/i).at(-1) ?? "", /tuesday/i),
            t1b.assistant,
        );
        const fromTwo = context.window.events.length;
        await call.play("Open the release notes task.");
        await page.waitForTimeout(1_000);
        const second = await call.play("And then open the cache task.");
        const secondEnd = second.startedAt + Math.round(second.durationSeconds * 1_000);
        await call.settled(fromTwo, secondEnd);
        const t2 = await call.turnRecord(
            "Open release notes, then the cache task",
            fromTwo,
            secondEnd,
        );
        const opens = t2.actions.filter(
            (action) => action.type === "desktopOpen" && action.status === "succeeded",
        );
        check(
            context,
            "S5 t2 two opens in order, ending on Ship the cache",
            opens.length === 2 && t2.focusAfter === "Ship the cache",
            `${opens.length} opens, focus ${t2.focusAfter}`,
        );
        const mute = page.getByRole("button", { name: /^Mute( microphone)?$/ });
        if ((await mute.count()) > 0) {
            await mute.first().click();
            const fromMuted = context.window.events.length;
            const muted = await call.play("Open Harbor task 07.");
            await page.waitForTimeout(Math.round(muted.durationSeconds * 1_000) + 3_000);
            const heard = transcriptOf(context.window.events.slice(fromMuted), "user");
            const acted = actionsOf(context.window.events.slice(fromMuted));
            await page
                .getByRole("button", { name: /^Unmute( microphone)?$/ })
                .first()
                .click();
            check(
                context,
                "S5 t3 nothing heard or done while muted",
                heard.length === 0 && acted.length === 0,
                JSON.stringify(heard),
            );
            const t3 = await call.say("Open Harbor task 09.", { tier: "delegated" });
            check(
                context,
                "S5 t3 task 09 opens after unmuting",
                t3.focusAfter === "Harbor task 09",
                `focus ${t3.focusAfter}`,
            );
        } else check(context, "S5 t3 mute", null, "No mute control in this build yet.", "pending");
        await call.end();
    },
    /** S6. Opening, memory across calls, and a drop. */
    async S6(context) {
        const { page } = context.window;
        const call = await callStart(context);
        const opening = await call.quiet(6_000);
        const greeting = opening.transcripts.join(" ");
        check(
            context,
            "S6 step 1 Happy says hello first, at most 8 words",
            greeting.length > 0 && greeting.split(/\s+/).length <= 8,
            greeting || "silence",
        );
        await call.say("Remember the word pineapple.");
        const bye = await call.say("Thanks, that's all. End the call.");
        await page.waitForTimeout(3_000);
        check(
            context,
            "S6 step 5 the call ends when asked",
            (await phoneStatus(page)) === "idle",
            `${await phoneStatus(page)}: ${bye.assistant}`,
            "pending",
        );
        await call.end();
        const second = await callStart(context);
        await second.say("Say hello in five words or fewer.");
        await context.runtime.stop();
        const status = await callStatusAwait(page, ["ended", "idle"], 60_000);
        const tooltip = await endedMessage(page);
        check(
            context,
            "S6 step 6 the drop ends typed, with a plain message",
            status === "ended" && !/controller/i.test(tooltip),
            `${status}: ${tooltip}`,
        );
        await shot(page, context.paths, "S6-dropped");
        await second.end().catch(() => undefined);
        await context.runtime.start();
        await page.waitForTimeout(15_000);
        await endedDismiss(page);
        const third = await callStart(context).catch(async () => {
            await page.waitForTimeout(10_000);
            return callStart(context);
        });
        const recall = await third.say(
            "What happened on our last call, and what word did I ask you to remember?",
        );
        check(
            context,
            "S6 step 7 remembers pineapple",
            has(recall.assistant, /pineapple/i),
            recall.assistant,
        );
        check(
            context,
            "S6 step 7 knows the call dropped",
            has(recall.assistant, /drop|cut|disconnect|ended unexpectedly|lost/i),
            recall.assistant,
            "soft",
        );
        await third.end();
    },
};

function evalsTable(report: Record<string, unknown>): string {
    const scenarios = report.scenarios as Record<
        string,
        { checks?: Check[]; turns?: Turn[]; error?: string }
    >;
    const lines = [
        `# Voice evals: ${String(report.label)}`,
        "",
        "| Scenario | Hard pass | Hard fail | Soft fail | Pending | Error |",
        "|---|---|---|---|---|---|",
    ];
    for (const [name, value] of Object.entries(scenarios)) {
        const checks = value.checks ?? [];
        const count = (kind: Check["kind"], pass: boolean | null) =>
            checks.filter((item) => item.kind === kind && item.pass === pass).length;
        lines.push(
            `| ${name} | ${count("hard", true)} | ${count("hard", false)} | ${count("soft", false)} | ${checks.filter((item) => item.kind === "pending").length} | ${value.error ?? ""} |`,
        );
    }
    lines.push("", "| Tier | Turns | Speech end → first audio p50 / p90 (ms) |", "|---|---|---|");
    const byTier = new Map<string, number[]>();
    for (const value of Object.values(scenarios))
        for (const turn of value.turns ?? [])
            if (turn.firstAudioMs !== null)
                byTier.set(turn.tier, [...(byTier.get(turn.tier) ?? []), turn.firstAudioMs]);
    for (const [tier, values] of [...byTier.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const sorted = [...values].sort((a, b) => a - b);
        const at = (p: number) =>
            sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
        lines.push(`| ${tier} | ${values.length} | ${at(50)} / ${at(90)} |`);
    }
    lines.push("", "## Checks", "");
    for (const [name, value] of Object.entries(scenarios))
        for (const item of value.checks ?? [])
            lines.push(
                `- ${name} ${item.pass === true ? "PASS" : item.pass === false ? "FAIL" : "PENDING"} (${item.kind}) ${item.id}: ${item.detail.replaceAll("\n", " ").slice(0, 300)}`,
            );
    return `${lines.join("\n")}\n`;
}
