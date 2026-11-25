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

/** Past the hundred rows a call's context carries: the realistic daemon's last project. */
const DEEP_TITLE = "Lighthouse Ledger";
/** Conversations given a newer turn than the deep one, past the directory's hundred. */
const DEEP_NEWER = 110;
const DEEP_FACT =
    "The lighthouse ledger code is Cobalt Heron 418, and the east jetty reopens Monday.";

export type LiveVoiceLatencyLane = "local" | "remote";
/**
 * `latency` opens a project and reads a conversation in the first hundred;
 * `deep` asks by name about one past them, then opens it.
 */
export type LiveVoiceLatencyScenario = "latency" | "deep";

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
    scenario?: LiveVoiceLatencyScenario;
}): Promise<void> {
    if (!isAbsolute(options.authFile))
        throw new Error("--auth-file must reference an existing absolute Codex sign-in path.");
    await access(options.authFile);
    await signInFreshAssert(options.authFile);
    const calls = options.calls ?? 5;
    const roundTripMs = options.roundTripMs ?? 60;
    const jitterMs = options.jitterMs ?? 20;
    const scenario = options.scenario ?? "latency";
    const lanes = options.lanes ?? (scenario === "deep" ? ["remote"] : ["local", "remote"]);
    const realisticPaths = await gymRunPathsRead(options.remoteRoot);
    const { paths } = await gymRunPathsCreate("smoke", undefined, options.artifactDirectory);
    const prepared = JSON.parse(
        await readFile(join(realisticPaths.root, "prepared.json"), "utf8"),
    ) as {
        projects: { id: string; name: string }[];
        sessionIds: string[];
        catalog: unknown;
        durableCounts: unknown;
    };
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
        scenario,
        voiceArchived: {},
        lanes: {},
        startedAt: new Date().toISOString(),
    };
    const token = randomBytes(32).toString("base64url");
    const capturePath = join(paths.artifacts, "live-capture.ndjson");
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
        const deepSessionId =
            scenario === "deep"
                ? await deepSeed(realisticPaths, prepared.projects.at(-1)!.id, prepared.sessionIds)
                : undefined;
        result.deepSessionId = deepSessionId;
        realistic = await happyAgentRuntimeCreate(
            realisticPaths,
            undefined,
            realisticConfiguration,
            // Builds that write it record each push to voice as {at, kind, text, speakable}.
            { HAPPY_LIVE_CONTEXT_CAPTURE_FILE: capturePath },
        );
        if (realistic.environment.HAPPY_GYM_INFERENCE_URL)
            throw new Error("The realistic host unexpectedly inherited deterministic inference.");
        const realisticClient = happyAgentClientCreate(realistic.socketPath, realistic.token);
        await realisticClient.completeOnboarding();
        // A node keeps the name its first start gave it; the rail names it by this.
        await realisticClient.patchConfig({ node: { name: REALISTIC_NODE } });
        const turnsFor = (index: number) =>
            scenario === "deep"
                ? [{ say: `What's the latest in ${DEEP_TITLE}?` }, { say: "Open it." }]
                : [
                      {
                          say: `Open gym project ${String(((index + 2) % 16) + 1).padStart(2, "0")}.`,
                      },
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
                // Deep calls stand alone: a Voice from the last one would remember the answer.
                if (deepSessionId && index > 0)
                    (result.voiceArchived as Record<string, number>)[`${name}-${index + 1}`] =
                        await voiceArchive(realisticClient);
                await page.getByText("gym-project-01", { exact: true }).first().click();
                await page.waitForTimeout(1_500);
                const call = await voiceCall({
                    window: laneWindow,
                    paths: lanePaths,
                    name: `${name}/call-${index + 1}`,
                    turns: turnsFor(index),
                });
                if (deepSessionId) {
                    const pressedAt =
                        (call.opening as { pressedAt?: number } | undefined)?.pressedAt ?? 0;
                    call.deep = await deepChecks(
                        join(lanePaths.artifacts, `${name}/call-${index + 1}`),
                        deepSessionId,
                        call,
                        capturePath,
                        await voiceToolCalls(realisticClient, pressedAt, Date.now()).catch(
                            () => [],
                        ),
                    );
                }
                outcomes.push(call);
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
        if (deepSessionId) result.deep = deepSummary(laneResults);
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
                latencyTable(result.summary as Summary) +
                    (result.deep ? `\n${result.deep as string}` : ""),
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
 * Adds one conversation past the directory voice starts with, once: in the
 * realistic daemon's last project, with a scripted reply holding a fact only
 * it knows. Voice's directory keeps the conversation on screen, the followed
 * ones, then the most recently active, so 110 others are given a newer turn,
 * leaving this one past the hundred. Returns its agent ID.
 */
async function deepSeed(
    paths: GymRunPaths,
    projectId: string,
    sessionIds: readonly string[],
): Promise<string> {
    const marker = join(paths.root, "deep.json");
    const seeded = await readFile(marker, "utf8").then(
        (text) => JSON.parse(text) as { sessionId: string; newer?: string[] },
        () => undefined,
    );
    if ((seeded?.newer?.length ?? 0) >= DEEP_NEWER) return seeded!.sessionId;
    let sessionId = seeded?.sessionId;
    if (!sessionId) {
        const inference = scriptedInferenceCreate(DEEP_TITLE, `Logged. ${DEEP_FACT}`);
        await inference.start();
        const runtime = await happyAgentRuntimeCreate(paths, inference);
        try {
            const { agent } = await runtime.client.createAgent(projectId);
            const { runId } = await runtime.client.sendMessage(agent.id, `Log this: ${DEEP_FACT}`);
            await runtime.client.waitForAgentIdle(agent.id, runId, 60_000);
            sessionId = agent.id;
            await writeFile(marker, JSON.stringify({ sessionId, title: DEEP_TITLE }));
        } finally {
            await runtime.stop();
            await inference.stop();
        }
    }
    // Their titles stay as they were: a title request answers with the one they have.
    const inference = scriptedInferenceCreate("Gym performance session", "Noted.");
    await inference.start();
    const runtime = await happyAgentRuntimeCreate(paths, inference);
    try {
        const client = happyAgentClientCreate(runtime.socketPath, runtime.token);
        type AgentId = Parameters<typeof client.getAgent>[0];
        const others = [...(seeded?.newer ?? [])];
        for (const id of sessionIds) {
            if (others.length === DEEP_NEWER) break;
            if (id === sessionId || others.includes(id)) continue;
            const { agent } = await client.getAgent(id as AgentId).catch(() => ({ agent: null }));
            if (agent?.title === "Gym performance session") others.push(id);
        }
        for (const id of others) {
            const { runId } = await runtime.client.sendMessage(id, "Gym note: nothing to do.");
            await runtime.client.waitForAgentIdle(id, runId, 60_000);
        }
        await writeFile(marker, JSON.stringify({ sessionId, title: DEEP_TITLE, newer: others }));
        return sessionId;
    } finally {
        await runtime.stop();
        await inference.stop();
    }
}

type DeepEvent = {
    direction?: string;
    at: number;
    frame: Record<string, unknown> & { type: string };
};

/** One tool call Voice made, as its own conversation records it. */
type VoiceToolCall = { at: number; name: string; arguments: unknown; result: string };

/** Voice's tool calls in a time window, from the hosting daemon's record of its conversation. */
async function voiceToolCalls(
    client: ReturnType<typeof happyAgentClientCreate>,
    from: number,
    to: number,
): Promise<VoiceToolCall[]> {
    const ids: string[] = [];
    const walk = (value: unknown) => {
        if (Array.isArray(value)) for (const item of value) walk(item);
        else if (typeof value === "object" && value !== null) {
            const record = value as Record<string, unknown>;
            if (
                record.title === "Voice" &&
                record.subtask === true &&
                typeof record.id === "string"
            )
                ids.push(record.id);
            for (const item of Object.values(record)) walk(item);
        }
    };
    walk(await client.listBots());
    const calls: VoiceToolCall[] = [];
    for (const id of new Set(ids)) {
        const history = (await client.getMessages(
            id as Parameters<typeof client.getMessages>[0],
        )) as unknown as {
            runs: { messages: { createdAt: number; content?: unknown }[] }[];
        };
        for (const run of history.runs)
            for (const message of run.messages) {
                if (message.createdAt < from || message.createdAt > to) continue;
                for (const block of (Array.isArray(message.content) ? message.content : []) as {
                    type?: string;
                    name?: string;
                    arguments?: unknown;
                    result?: unknown;
                }[])
                    if (block.type === "tool_call")
                        calls.push({
                            at: message.createdAt,
                            name: block.name ?? "",
                            arguments: block.arguments,
                            result: JSON.stringify(block.result ?? null).slice(0, 2_000),
                        });
            }
    }
    return calls.sort((a, b) => a.at - b.at);
}

/**
 * One deep call: the conversation was left out of the directory voice started
 * with, Voice read it by its ID, the window was asked to open it by agent ID
 * and did, and it landed there.
 */
async function deepChecks(
    directory: string,
    sessionId: string,
    call: Record<string, unknown>,
    capturePath: string,
    tools: readonly VoiceToolCall[],
) {
    const events = JSON.parse(
        await readFile(join(directory, "control-events.json"), "utf8").catch(() => "[]"),
    ) as DeepEvent[];
    // The first context voice got for this call, as the daemon captured it.
    const pressedAt = (call.opening as { pressedAt?: number } | undefined)?.pressedAt ?? 0;
    const pushes = (await readFile(capturePath, "utf8").catch(() => ""))
        .split("\n")
        .flatMap((line) => {
            try {
                return [JSON.parse(line) as { at: number; kind: string; text: string }];
            } catch {
                return [];
            }
        });
    const firstContext = pushes.find((push) => push.kind === "context" && push.at >= pressedAt);
    const contexts = events.filter((event) => event.frame.type === "desktopContext");
    const opens = events.filter(
        (event) =>
            event.frame.type === "actionRequested" &&
            (event.frame.action as { type?: string }).type === "desktopOpen",
    );
    const resultOf = (actionId: unknown) =>
        events.find(
            (event) => event.frame.type === "actionResult" && event.frame.actionId === actionId,
        )?.frame.result as { status?: string } | undefined;
    const byAgent = opens.find((event) => {
        const target = (event.frame.action as { target?: { kind?: string; agentId?: string } })
            .target;
        return target?.kind === "agent" && target.agentId === sessionId;
    });
    const turns = (call.turns ?? []) as { assistant?: string; firstAudioMs?: number | null }[];
    const landed = (
        contexts.at(-1)?.frame.context as { activeTarget?: { sessionId?: string } } | undefined
    )?.activeTarget?.sessionId;
    return {
        // The directory is what voice starts with; the window's AppState lists everything.
        outsideFirstContext: firstContext
            ? !(firstContext.text.split("Conversations in the app")[1] ?? "").includes(DEEP_TITLE)
            : null,
        // A read tool on its ID; opening it is counted separately.
        read: tools.some(
            (tool) =>
                tool.name.startsWith("read") && JSON.stringify(tool.arguments).includes(sessionId),
        ),
        // Its fact; voice may decline to read the code itself aloud.
        answered: /cobalt heron|\b418\b|east jetty/iu.test(turns[0]?.assistant ?? ""),
        tools,
        openedByAgentId: byAgent ? resultOf(byAgent.frame.actionId)?.status === "succeeded" : false,
        opens: opens.map((event) => ({
            target: (event.frame.action as { target?: unknown }).target,
            result: resultOf(event.frame.actionId),
        })),
        landed: landed === sessionId,
        firstContextBytes: firstContext ? Buffer.byteLength(firstContext.text) : null,
        firstContextPartial: firstContext
            ? (/… and \d+ more not listed|and \d+ more not listed/u.exec(firstContext.text)?.[0] ??
              null)
            : null,
        firstContextMentionsDeep: firstContext ? firstContext.text.includes(DEEP_TITLE) : null,
        firstAudioMs: turns.map((turn) => turn.firstAudioMs ?? null),
        assistant: turns.map((turn) => turn.assistant ?? ""),
    };
}

/** k/n per deep check, and first audio per turn, per lane. */
function deepSummary(lanes: Record<string, unknown>): string {
    const rows: string[] = [
        "| Lane | Outside first context | Read by ID | Answered | Opened by agent ID | Landed | First audio t1 / t2 (ms) | First context bytes |",
        "|---|---|---|---|---|---|---|---|",
    ];
    for (const [name, value] of Object.entries(lanes)) {
        const deep = (
            value as { outcomes: { deep?: Awaited<ReturnType<typeof deepChecks>> }[] }
        ).outcomes.flatMap((outcome) => (outcome.deep ? [outcome.deep] : []));
        const count = (
            key: "outsideFirstContext" | "read" | "answered" | "openedByAgentId" | "landed",
        ) => `${deep.filter((item) => item[key]).length}/${deep.length}`;
        rows.push(
            `| ${name} | ${count("outsideFirstContext")} | ${count("read")} | ${count("answered")} | ${count("openedByAgentId")} | ${count("landed")} | ${deep.map((item) => item.firstAudioMs.join(" / ")).join("; ")} | ${deep.map((item) => item.firstContextBytes ?? "—").join("; ")} |`,
        );
    }
    return rows.join("\n") + "\n";
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
