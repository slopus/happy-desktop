import { randomBytes } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { gymRunPathsCreate, gymRunPathsRead } from "./paths.js";
import { happyAgentRuntimeCreate, type StartedHappyAgentRuntime } from "./happyAgentRuntime.js";
import { happyAgentClientCreate } from "./happyAgentProtocol.js";
import { completeOnboarding } from "./workloads.js";
import { liveVoiceSpeakersVerify } from "./liveVoiceSilence.js";
import { socketDelayInsert } from "./liveVoiceDelay.js";
import { scriptedInferenceCreate, tailcatAddressRead } from "./liveVoiceRemote.js";
import {
    liveVoiceWindowOpen,
    railSelect,
    settingsBack,
    shot,
    signInFreshAssert,
    voiceAccountChoose,
    voiceCall,
    type LiveVoiceWindow,
} from "./liveVoiceWindow.js";
import type { GymRunPaths } from "./types.js";

const HOST_NODE = "Gym Mac";
const REALISTIC_NODE = "Realistic Mac";
const CONVERSATION_TITLE = "Harbor Beacon Notes";
const BEACON =
    "The harbor beacon code is Indigo Marmot 269, and the north pier stays closed until Friday.";

export type LiveVoiceLatencyLane = "local" | "remote";

/**
 * Real GPT-Live calls hosted by one realistic daemon (the `realistic` gym
 * profile) reached two ways: as the window's own host, and as a remote behind
 * this run's small host over Tailcat with a delay proxy in front of the
 * remote's socket. The same daemon, data and prompts answer both lanes, so the
 * difference is the path. Muted exactly like every live lane.
 */
export async function gymLiveVoiceLatencyRun(options: {
    authFile: string;
    /** A root prepared with `prepare --profile realistic`; reused, never cleaned. */
    remoteRoot: string;
    artifactDirectory?: string;
    calls?: number;
    roundTripMs?: number;
    jitterMs?: number;
    lanes?: readonly LiveVoiceLatencyLane[];
}): Promise<void> {
    if (!isAbsolute(options.authFile))
        throw new Error("--auth-file must reference an existing absolute Codex sign-in path.");
    await access(options.authFile);
    await signInFreshAssert(options.authFile);
    const calls = options.calls ?? 5;
    const roundTripMs = options.roundTripMs ?? 60;
    const jitterMs = options.jitterMs ?? 20;
    const lanes = options.lanes ?? ["local", "remote"];
    const realisticPaths = await gymRunPathsRead(options.remoteRoot);
    const { paths } = await gymRunPathsCreate("smoke", undefined, options.artifactDirectory);
    const prepared = JSON.parse(
        await readFile(join(realisticPaths.root, "prepared.json"), "utf8"),
    ) as { projects: { id: string; name: string }[]; catalog: unknown; durableCounts: unknown };
    const result: Record<string, unknown> = {
        status: "failed",
        root: paths.root,
        realisticRoot: realisticPaths.root,
        realistic: { catalog: prepared.catalog, durableCounts: prepared.durableCounts },
        delay: {
            roundTripMs,
            jitterMs,
            where: "stream proxy in front of the remote daemon's socket, behind its Tailcat serve",
        },
        calls,
        voiceArchived: {},
        lanes: {},
        startedAt: new Date().toISOString(),
    };
    const token = randomBytes(32).toString("base64url");
    const realisticConfiguration = [
        "[settings]",
        "happy_integration = false",
        "menu_bar = false",
        "[node]",
        `name = "${REALISTIC_NODE}"`,
        "[api]",
        `token = "${token}"`,
        "[feature.tailcat]",
        "enabled = true",
        "[feature.mobile_connector]",
        "enabled = false",
        "[providers]",
        "default_enable = false",
        "[providers.voice]",
        'type = "codex"',
        "enabled = true",
        "credential_isolation = true",
        `auth_file = ${JSON.stringify(options.authFile)}`,
        "[defaults]",
        'provider = "voice"',
        'model = "openai/gpt-6-astra"',
        'effort = "medium"',
        "",
    ].join("\n");
    let realistic: StartedHappyAgentRuntime | undefined;
    let host: StartedHappyAgentRuntime | undefined;
    let window: LiveVoiceWindow | undefined;
    let delay: Awaited<ReturnType<typeof socketDelayInsert>> | undefined;
    let failure: unknown;
    const lifetime = setInterval(() => {}, 1_000);
    const laneResults = result.lanes as Record<string, unknown>;
    try {
        result.stage = "fixture";
        await harborSeed(realisticPaths, prepared.projects[0]!.id);
        realistic = await happyAgentRuntimeCreate(
            realisticPaths,
            undefined,
            realisticConfiguration,
        );
        if (realistic.environment.HAPPY_GYM_INFERENCE_URL)
            throw new Error("The realistic host unexpectedly inherited deterministic inference.");
        const realisticClient = happyAgentClientCreate(realistic.socketPath, realistic.token);
        await realisticClient.completeOnboarding();
        // A node keeps the name its first start gave it; the rail names it by this.
        await realisticClient.patchConfig({ node: { name: REALISTIC_NODE } });
        const turnsFor = (index: number) => [
            { say: `Open gym project ${String(((index + 2) % 16) + 1).padStart(2, "0")}.` },
            { say: `Read me the latest message in ${CONVERSATION_TITLE}.` },
        ];
        const lane = async (
            name: LiveVoiceLatencyLane,
            laneWindow: LiveVoiceWindow,
            lanePaths: GymRunPaths,
            node: string,
        ) => {
            const { page } = laneWindow;
            // Each lane starts with a fresh Voice: one carried over from the
            // other lane remembers this daemon under the other connection ID.
            (result.voiceArchived as Record<string, number>)[name] =
                await voiceArchive(realisticClient);
            await completeOnboarding(page);
            await railSelect(page, node);
            await page
                .getByText("gym-project-01", { exact: true })
                .first()
                .waitFor({ timeout: 90_000 });
            await voiceAccountChoose(page, "voice");
            await shot(page, lanePaths, `${name}/voice-settings`);
            await settingsBack(page);
            const outcomes: Record<string, unknown>[] = [];
            const startedAt = Date.now();
            for (let index = 0; index < calls; index++) {
                await page.getByText("gym-project-01", { exact: true }).first().click();
                await page.waitForTimeout(1_500);
                outcomes.push(
                    await voiceCall({
                        window: laneWindow,
                        paths: lanePaths,
                        name: `${name}/call-${index + 1}`,
                        turns: turnsFor(index),
                    }),
                );
            }
            const silence = await liveVoiceSpeakersVerify(laneWindow.app, page);
            return {
                startedAt,
                finishedAt: Date.now(),
                silence,
                outcomes,
            };
        };
        if (lanes.includes("local")) {
            result.stage = "local-lane";
            const localPaths = { ...realisticPaths, artifacts: join(paths.artifacts, "lanes") };
            window = await liveVoiceWindowOpen({
                paths: localPaths,
                environment: realistic.environment,
            });
            const outcome = await lane("local", window, localPaths, REALISTIC_NODE);
            laneResults.local = {
                ...outcome,
                daemon: await liveLogRead(realisticPaths, outcome.startedAt, outcome.finishedAt),
            };
            await window.app.close().catch(() => undefined);
            window = undefined;
        }
        if (lanes.includes("remote")) {
            result.stage = "remote-lane";
            const address = await tailcatAddressRead(realisticPaths);
            const hostConfiguration = [
                "[settings]",
                "happy_integration = false",
                "menu_bar = false",
                "[profile]",
                'name = "Voice Gym"',
                'email = "voice-gym@example.invalid"',
                "[node]",
                `name = "${HOST_NODE}"`,
                "[feature.mobile_connector]",
                "enabled = false",
                "[providers]",
                "default_enable = false",
                "[providers.voice]",
                'type = "codex"',
                "enabled = true",
                "credential_isolation = true",
                `auth_file = ${JSON.stringify(options.authFile)}`,
                "[defaults]",
                'provider = "voice"',
                'model = "openai/gpt-6-astra"',
                'effort = "medium"',
                "[connections.remote]",
                'name = "Realistic"',
                `address = "${address}"`,
                `token = "${token}"`,
                "",
            ].join("\n");
            const roundTrips = async (runtime: StartedHappyAgentRuntime) => {
                const through = happyAgentClientCreate(
                    runtime.socketPath,
                    runtime.token,
                ).connection("remote");
                await through.getHealth();
                const samples: number[] = [];
                for (let index = 0; index < 10; index++) {
                    const started = performance.now();
                    await through.getHealth();
                    samples.push(Math.round(performance.now() - started));
                }
                return samples;
            };
            // Tailcat-only baseline, then a fresh host: its carrier streams kept
            // warm from before would still reach the moved socket directly.
            host = await happyAgentRuntimeCreate(paths, undefined, hostConfiguration);
            const tailcatOnly = await roundTrips(host);
            await host.stop();
            host = undefined;
            delay = await socketDelayInsert(realistic.socketPath, { roundTripMs, jitterMs });
            host = await happyAgentRuntimeCreate(paths, undefined, hostConfiguration);
            const withDelay = await roundTrips(host);
            result.healthThroughHostMs = { tailcatOnly, withDelay };
            const median = [...withDelay].sort((a, b) => a - b)[5]!;
            if (median < roundTripMs * 0.7)
                throw new Error(
                    `The remote path is not delayed: median health round trip ${median} ms.`,
                );
            window = await liveVoiceWindowOpen({ paths, environment: host.environment });
            const lanePaths = { ...paths, artifacts: join(paths.artifacts, "lanes") };
            const outcome = await lane("remote", window, lanePaths, REALISTIC_NODE);
            laneResults.remote = {
                ...outcome,
                delayedChunks: delay.chunks(),
                daemon: await liveLogRead(realisticPaths, outcome.startedAt, outcome.finishedAt),
            };
        }
        result.summary = latencySummary(laneResults);
        result.status = "passed";
        result.stage = "complete";
    } catch (error) {
        failure = error;
        result.error = error instanceof Error ? error.message : String(error);
        if (window) await shot(window.page, paths, "failure").catch(() => undefined);
    } finally {
        clearInterval(lifetime);
        await window?.app.close().catch(() => undefined);
        await delay?.stop().catch(() => undefined);
        await host?.stop().catch(() => undefined);
        await realistic?.stop().catch(() => undefined);
        result.finishedAt = new Date().toISOString();
        await writeFile(join(paths.artifacts, "result.json"), JSON.stringify(result, null, 2));
        if (result.summary)
            await writeFile(
                join(paths.artifacts, "latency.md"),
                latencyTable(result.summary as Summary),
            );
        console.log(
            JSON.stringify(
                {
                    status: result.status,
                    stage: result.stage,
                    artifactDirectory: paths.artifacts,
                    error: result.error,
                },
                null,
                2,
            ),
        );
    }
    if (failure) throw failure;
}

/**
 * Adds one distinctly named conversation to the realistic daemon once, with
 * a scripted reply, so a spoken read has an unambiguous target.
 */
async function harborSeed(paths: GymRunPaths, projectId: string) {
    const marker = join(paths.root, "harbor.json");
    if (
        await access(marker).then(
            () => true,
            () => false,
        )
    )
        return;
    const inference = scriptedInferenceCreate(CONVERSATION_TITLE, `Noted. ${BEACON}`);
    await inference.start();
    const runtime = await happyAgentRuntimeCreate(paths, inference);
    try {
        const { agent } = await runtime.client.createAgent(projectId);
        const { runId } = await runtime.client.sendMessage(
            agent.id,
            `Remember this for later: ${BEACON}`,
        );
        await runtime.client.waitForAgentIdle(agent.id, runId, 60_000);
        await writeFile(marker, JSON.stringify({ sessionId: agent.id, title: CONVERSATION_TITLE }));
    } finally {
        await runtime.stop();
    }
}

/**
 * Archives the daemon's Voice (the unreported "Voice" subtask under its bots),
 * so the next call makes a new one with no memory of earlier calls.
 */
async function voiceArchive(client: ReturnType<typeof happyAgentClientCreate>): Promise<number> {
    const found: string[] = [];
    const walk = (value: unknown) => {
        if (Array.isArray(value)) for (const item of value) walk(item);
        else if (typeof value === "object" && value !== null) {
            const record = value as Record<string, unknown>;
            if (
                record.title === "Voice" &&
                record.subtask === true &&
                typeof record.id === "string"
            )
                found.push(record.id);
            for (const item of Object.values(record)) walk(item);
        }
    };
    walk(await client.listBots());
    for (const id of new Set(found))
        await client.archiveAgent(id as Parameters<typeof client.archiveAgent>[0], {
            mutationId: randomBytes(12).toString("hex"),
        });
    return new Set(found).size;
}

/** The hosting daemon's own live diagnostics in a time window: actions and delegations. */
async function liveLogRead(paths: GymRunPaths, from: number, to: number) {
    const text = await readFile(join(paths.agentHome, "observation", "agent.log"), "utf8").catch(
        () => "",
    );
    const records: Record<string, unknown>[] = [];
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
            const record = JSON.parse(entry.msg) as Record<string, unknown>;
            if (
                typeof record.event === "string" &&
                (record.event.startsWith("action.") ||
                    record.event.startsWith("delegation.") ||
                    record.event === "controller.finished" ||
                    record.event === "provider.ready" ||
                    record.event === "session.created" ||
                    record.event === "control.attached" ||
                    record.event === "context.accepted" ||
                    record.event === "context.pushed")
            )
                records.push({
                    at,
                    event: record.event,
                    actionType: record.actionType,
                    durationMs: record.durationMs,
                    elapsedMs: record.elapsedMs,
                    resultStatus: record.resultStatus,
                    kind: record.kind,
                    bytes: record.bytes,
                });
        } catch {
            /* Not a JSON diagnostic line. */
        }
    }
    return records;
}

type Summary = Record<
    string,
    Record<string, { n: number; p50: number | null; p90: number | null }>
>;

function percentile(values: readonly number[], p: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

/** p50/p90 of each measured hop, per lane. */
function latencySummary(lanes: Record<string, unknown>): Summary {
    const summary: Summary = {};
    for (const [name, value] of Object.entries(lanes)) {
        const lane = value as {
            outcomes: {
                opening?: Record<string, number | null>;
                turns: {
                    firstAudioMs: number | null;
                    firstTranscriptMs: number | null;
                    actions: {
                        type?: string;
                        windowMs: number | null;
                        resultBytes: number | null;
                    }[];
                }[];
                desktopContexts?: { bytes: number }[];
            }[];
            daemon: {
                at: number;
                event: string;
                actionType?: string;
                durationMs?: number;
                kind?: string;
                bytes?: number;
            }[];
        };
        const metrics: Record<string, number[]> = {};
        const add = (key: string, sample: number | null | undefined) => {
            if (typeof sample !== "number") return;
            (metrics[key] ??= []).push(sample);
        };
        for (const outcome of lane.outcomes) {
            const opening = outcome.opening ?? {};
            // The first context the hosting daemon gave voice for this call, by its own diagnostics.
            const pressedAt = opening.pressedAt;
            const first =
                typeof pressedAt === "number"
                    ? lane.daemon.find(
                          (record) =>
                              record.event === "context.pushed" &&
                              // "outline" was the opening push before the mobile-model context.
                              (record.kind === "context" || record.kind === "outline") &&
                              record.at >= pressedAt &&
                              record.at <= pressedAt + 60_000,
                      )
                    : undefined;
            add("first push to voice, bytes", first?.bytes);
            add(
                "create sent → first push to voice",
                first && typeof pressedAt === "number" && typeof opening.createStartMs === "number"
                    ? first.at - (pressedAt + opening.createStartMs)
                    : undefined,
            );
            add("press → active (total)", opening.totalMs);
            add("press → availability read", opening.availabilityDoneMs);
            add(
                "availability → create sent (mic + offer)",
                diff(opening.createStartMs, opening.availabilityDoneMs),
            );
            add("create request (reserve + provider + sideband)", opening.createMs);
            add(
                "create done → control socket open (SDP answer)",
                diff(opening.socketOpenMs, sum(opening.createStartMs, opening.createMs)),
            );
            add("socket open → hello", diff(opening.helloMs, opening.socketOpenMs));
            add("hello → provider active", diff(opening.providerActiveMs, opening.helloMs));
            add("create request bytes (context + AppState)", opening.createRequestBytes);
            add("first desktopContext frame bytes", opening.firstContextBytes);
            for (const turn of outcome.turns) {
                add("speech end → first assistant audio", turn.firstAudioMs);
                add("speech end → first assistant transcript", turn.firstTranscriptMs);
                for (const action of turn.actions) {
                    add(`${action.type} handled in window`, action.windowMs);
                    add(`${action.type} result bytes`, action.resultBytes);
                }
            }
        }
        for (const record of lane.daemon) {
            if (record.event === "action.result")
                add(`${record.actionType} round trip at host daemon`, record.durationMs);
            if (record.event === "delegation.delivered")
                add("Voice controller delegation (request → outcome)", record.durationMs);
        }
        summary[name] = Object.fromEntries(
            Object.entries(metrics).map(([key, values]) => [
                key,
                { n: values.length, p50: percentile(values, 50), p90: percentile(values, 90) },
            ]),
        );
    }
    return summary;
}

function diff(a: number | null | undefined, b: number | null | undefined) {
    return typeof a === "number" && typeof b === "number" ? a - b : null;
}
function sum(a: number | null | undefined, b: number | null | undefined) {
    return typeof a === "number" && typeof b === "number" ? a + b : null;
}

function latencyTable(summary: Summary): string {
    const lanes = Object.keys(summary);
    const keys = [...new Set(lanes.flatMap((lane) => Object.keys(summary[lane]!)))];
    const cell = (lane: string, key: string) => {
        const value = summary[lane]![key];
        return value ? `${value.p50} / ${value.p90} (n=${value.n})` : "—";
    };
    return [
        `| Measure | ${lanes.map((lane) => `${lane} p50 / p90`).join(" | ")} |`,
        `|---|${lanes.map(() => "---").join("|")}|`,
        ...keys.map((key) => `| ${key} | ${lanes.map((lane) => cell(lane, key)).join(" | ")} |`),
        "",
    ].join("\n");
}
