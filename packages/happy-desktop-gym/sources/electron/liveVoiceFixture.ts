import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { Cuid2 } from "@slopus/happy-agent-client";
import { happyAgentClientCreate } from "./happyAgentProtocol.js";
import type { StartedHappyAgentRuntime } from "./happyAgentRuntime.js";
import type { GymInferenceResponse, GymInferenceServer, GymRunPaths } from "./types.js";

/**
 * Scripted inference for fixture conversations only: each conversation, by
 * its agent ID, answers from its own queue of replies, in order, and any other
 * with `fallback`. Voice and its controller run on a live account beside it.
 */
export type FixtureInference = GymInferenceServer & {
    /** Queues the next replies for one conversation, and the title it is given. */
    script(agentId: string, title: string, replies: readonly GymInferenceResponse[]): void;
};

export function fixtureInferenceCreate(fallback?: {
    title: string;
    reply: string;
}): FixtureInference {
    const token = randomBytes(24).toString("hex");
    const queues = new Map<string, GymInferenceResponse[]>();
    const titles = new Map<string, string>();
    let server: Server | undefined;
    let url: string | undefined;
    const body = async (request: IncomingMessage) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk as Buffer);
        return JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
            options?: { intent?: string; sessionId?: string };
        };
    };
    const reply = (sessionId: string, intent: string | undefined): GymInferenceResponse => {
        if (intent === "compaction") return { content: [{ type: "text", text: "Compacted." }] };
        if (sessionId.endsWith(":title")) {
            const title =
                titles.get(sessionId.slice(0, -":title".length)) ??
                fallback?.title ??
                "Harbor work";
            return {
                content: [
                    { type: "text", text: `<title>${title}</title>\n<recap>${title}.</recap>` },
                ],
            };
        }
        const next = queues.get(sessionId)?.shift();
        return next ?? { content: [{ type: "text", text: fallback?.reply ?? "Done." }] };
    };
    return {
        get url() {
            if (!url) throw new Error("The fixture inference server has not started.");
            return url;
        },
        token,
        script(agentId, title, replies) {
            titles.set(agentId, title);
            queues.set(agentId, [...(queues.get(agentId) ?? []), ...replies]);
        },
        async start() {
            if (server) return;
            const created = createServer((request, response) => {
                void (async () => {
                    if (request.headers.authorization !== `Bearer ${token}`) {
                        response.writeHead(401).end();
                        return;
                    }
                    const payload = await body(request);
                    const text = reply(
                        String(payload.options?.sessionId ?? ""),
                        payload.options?.intent,
                    );
                    response.writeHead(200, { "content-type": "application/json" });
                    response.end(JSON.stringify(text));
                })().catch(() => response.writeHead(500).end());
            });
            await new Promise<void>((resolve) => created.listen(0, "127.0.0.1", resolve));
            server = created;
            url = `http://127.0.0.1:${(created.address() as AddressInfo).port}/inference`;
        },
        async stop() {
            const current = server;
            server = undefined;
            await new Promise<void>((resolve) =>
                current ? current.close(() => resolve()) : resolve(),
            );
        },
    };
}

/** The finished task's last reply: a point first, then detail voice must not read out. */
export const SHIP_REPLY = [
    "Merged. It ships Tuesday with three fixes: the cache race between the two writers, the stale eviction timer, and the double-free on shutdown.",
    "",
    "The race was two writers sharing one lock around `CacheStore.put`; I split it into a per-shard mutex in `packages/cache/src/store/shardLock.ts` and added a regression test that hammers it with 64 writers.",
    "",
    "```ts",
    "const lock = shardLocks[hash(key) % SHARDS];",
    "await lock.runExclusive(() => table.set(key, value));",
    "```",
    "",
    "The eviction timer now reads the clock once per sweep instead of per entry, which removes the drift that kept stale entries alive past their TTL. The shutdown double-free came from closing the file handle twice when a flush failed; the second close is now a no-op.",
    "",
    "Commit 3f9c2ab7e41d on main, CI is green on all three platforms, and the release branch picks it up Tuesday morning. Nothing needs you right now; if you want, I can run the benchmark again after the release build to confirm the hit rate.",
].join("\n");

export const BENCHMARK_REPLY = "Benchmark done. Hit rate is 93 percent, up from 81.";
export const BENCHMARK_TASK_REPLY =
    "Started benchmarking with ten thousand keys. The first pass shows a 91 percent hit rate.";

export type HarborTask = { name: string; taskId: string; agentId: string; seededAt: number };

export type HarborFixture = {
    readonly tasks: ReadonlyMap<string, HarborTask>;
    task(name: string): HarborTask;
};

/**
 * The shared "Harbor" fixture: Happy, four named tasks in known states and
 * twenty fillers, each answered by the scripted provider.
 */
export async function harborSeed(
    runtime: StartedHappyAgentRuntime,
    inference: FixtureInference,
): Promise<HarborFixture> {
    const client = happyAgentClientCreate(runtime.socketPath, runtime.token);
    const tasks = new Map<string, HarborTask>();
    const create = async (
        name: string,
        replies: readonly GymInferenceResponse[],
        text: string,
        wait = true,
    ) => {
        const { task } = await client.createTask({ name, mutationId: randomUUID() });
        const agentId = task.agent.id as string;
        inference.script(agentId, name, replies);
        const { runId } = await runtime.client.sendMessage(agentId, text);
        if (wait)
            await runtime.client.waitForAgentIdle(agentId, runId, 60_000).catch(() => undefined);
        const seeded: HarborTask = { name, taskId: task.id, agentId, seededAt: Date.now() };
        tasks.set(name, seeded);
        return seeded;
    };
    for (let index = 20; index >= 1; index--) {
        const name = `Harbor task ${String(index).padStart(2, "0")}`;
        await create(
            name,
            [{ content: [{ type: "text", text: `Done with ${name}.` }] }],
            `Tidy up ${name}.`,
        );
    }
    await create(
        "Login page copy",
        [
            {
                content: [
                    { type: "text", text: "Updated the login page copy to the shorter headline." },
                ],
            },
        ],
        "Shorten the login page headline.",
    );
    await create(
        "Fix login redirect",
        [
            {
                content: [
                    {
                        type: "toolCall",
                        name: "request_user_input",
                        arguments: {
                            context: "The login redirect loops back to the sign-in page.",
                            questions: [
                                {
                                    question:
                                        "After login, should the redirect go to the dashboard or back to the page the person came from?",
                                },
                            ],
                        },
                    },
                ],
            },
        ],
        "Fix the login redirect loop.",
        false,
    );
    await create(
        "Release notes",
        // The daemon retries a failed inference; every attempt fails the same way.
        Array.from({ length: 8 }, () => ({
            content: [],
            errorMessage: "rate limited",
            stopReason: "error",
            providerError: { kind: "unknown" },
        })),
        "Draft the release notes for Tuesday.",
    );
    await create(
        "Ship the cache",
        [{ content: [{ type: "text", text: SHIP_REPLY }] }],
        "Ship the cache fixes.",
    );
    return {
        tasks,
        task(name) {
            const found = tasks.get(name);
            if (!found) throw new Error(`No Harbor task named ${name}.`);
            return found;
        },
    };
}

/** The newest person's message text and the saved draft the daemon holds for one conversation. */
export async function conversationTail(
    runtime: StartedHappyAgentRuntime,
    agentId: string,
): Promise<{ userText: string | null; draft: string | null }> {
    const client = happyAgentClientCreate(runtime.socketPath, runtime.token);
    const history = await client.getMessages(agentId as Cuid2);
    const users: string[] = [];
    // Message shapes vary by kind; a person's text is any `role: "user"` record's text.
    const walk = (value: unknown) => {
        if (Array.isArray(value)) for (const item of value) walk(item);
        else if (typeof value === "object" && value !== null) {
            const record = value as Record<string, unknown>;
            if (record.role === "user") {
                const text =
                    typeof record.text === "string"
                        ? record.text
                        : Array.isArray(record.content)
                          ? record.content
                                .map((block) =>
                                    typeof block === "object" && block !== null && "text" in block
                                        ? String((block as { text: unknown }).text)
                                        : "",
                                )
                                .join("")
                          : "";
                if (text) users.push(text);
            }
            for (const item of Object.values(record)) walk(item);
        }
    };
    walk(history);
    const draft = (await client.getAgentDraft(agentId as Cuid2).catch(() => undefined))?.draft
        ?.value as { text?: string } | null | undefined;
    return { userText: users.at(-1) ?? null, draft: draft?.text ?? null };
}

/**
 * A daemon's configuration for a live lane: one Codex account, `voice`, as its
 * default. `serve` publishes its API over Tailcat with that token; `beside`
 * keeps the scripted fixture provider answering next to the live account; a
 * `connection` reaches another daemon through this one.
 */
export function liveConfiguration(options: {
    authFile: string;
    node: string;
    profile?: boolean;
    serve?: string;
    beside?: boolean;
    connection?: { id: string; name: string; address: string; token: string };
}): string {
    const { connection } = options;
    return [
        "[settings]",
        "happy_integration = false",
        "menu_bar = false",
        ...(options.profile
            ? ["[profile]", 'name = "Voice Gym"', 'email = "voice-gym@example.invalid"']
            : []),
        "[node]",
        `name = "${options.node}"`,
        ...(options.serve
            ? ["[api]", `token = "${options.serve}"`, "[feature.tailcat]", "enabled = true"]
            : []),
        "[feature.mobile_connector]",
        "enabled = false",
        ...(options.beside ? [] : ["[providers]", "default_enable = false"]),
        "[providers.voice]",
        'type = "codex"',
        "enabled = true",
        "credential_isolation = true",
        `auth_file = ${JSON.stringify(options.authFile)}`,
        // An explicit endpoint keeps this account live beside the scripted fixture.
        ...(options.beside ? ['base_url = "https://chatgpt.com/backend-api"'] : []),
        "[defaults]",
        'provider = "voice"',
        'model = "openai/gpt-6-astra"',
        'effort = "medium"',
        ...(connection
            ? [
                  `[connections.${connection.id}]`,
                  `name = "${connection.name}"`,
                  `address = "${connection.address}"`,
                  `token = "${connection.token}"`,
              ]
            : []),
        "",
    ].join("\n");
}

export type LiveRecord = { at: number; event: string; [key: string]: unknown };

/** The daemon's `module: "live"` diagnostics between `from` and `to`, in epoch ms. */
export async function liveRecordsRead(
    paths: GymRunPaths,
    from = 0,
    to = Number.MAX_SAFE_INTEGER,
): Promise<LiveRecord[]> {
    const text = await readFile(join(paths.agentHome, "observation", "agent.log"), "utf8").catch(
        () => "",
    );
    const records: LiveRecord[] = [];
    for (const line of text.split("\n")) {
        try {
            const entry = JSON.parse(line) as { module?: string; time?: string; msg?: string };
            const at = new Date(entry.time ?? 0).getTime();
            if (entry.module !== "live" || !entry.msg?.startsWith("{") || at < from || at > to)
                continue;
            records.push({ ...(JSON.parse(entry.msg) as { event: string }), at });
        } catch {
            /* Not a JSON diagnostic line. */
        }
    }
    return records;
}

/** What the daemon pushed to the voice model, as `HAPPY_LIVE_CONTEXT_CAPTURE_FILE` builds write it. */
export async function captureRead(
    path: string,
): Promise<{ at: number; kind: string; text: string; speakable: boolean }[]> {
    const text = await readFile(path, "utf8").catch(() => "");
    return text.split("\n").flatMap((line) => {
        try {
            return [
                JSON.parse(line) as { at: number; kind: string; text: string; speakable: boolean },
            ];
        } catch {
            return [];
        }
    });
}

/** The daemon's Voice subtasks: the conversation voice hands requests to. */
export async function voiceSubtaskIds(
    client: ReturnType<typeof happyAgentClientCreate>,
): Promise<Cuid2[]> {
    const ids = new Set<Cuid2>();
    const walk = (value: unknown) => {
        if (Array.isArray(value)) for (const item of value) walk(item);
        else if (typeof value === "object" && value !== null) {
            const record = value as Record<string, unknown>;
            if (
                record.title === "Voice" &&
                record.subtask === true &&
                typeof record.id === "string"
            )
                ids.add(record.id as Cuid2);
            for (const item of Object.values(record)) walk(item);
        }
    };
    walk(await client.listBots());
    return [...ids];
}
