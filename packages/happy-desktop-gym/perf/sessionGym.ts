/**
 * Session-speed gym: drives the production renderer in Chromium against a perf daemon holding a
 * copy of real data, and measures what a person feels — opening the app, switching sessions cold
 * and warm, and watching while another session (or this one) streams a replayed real run.
 *
 * Every scenario records the headline latency plus the cost underneath it: React commits and
 * component renders (with the busiest components), long tasks and long animation frames, CDP
 * script/layout/style/task time, heap and DOM size, every daemon request by route, and daemon CPU.
 *
 * Env: PERF_URL, PERF_SOCKET, PERF_TOKEN, PERF_SCRATCH, PERF_PROFILE (pristine Chromium profile),
 * PERF_DAEMON_PID, PERF_OUT (results JSON), PERF_LABEL, PERF_STREAM_MS, PERF_DAEMON_START (a command that
 * starts the daemon again over the same data, for the reload window) and PERF_DAEMON_PIDFILE.
 */
import { execFileSync, spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import { chromium, type CDPSession, type Locator, type Page } from "playwright";

const env = (name: string, fallback?: string): string => {
    const value = process.env[name] ?? fallback;
    if (value === undefined) throw new Error(`${name} is required.`);
    return value;
};
const url = env("PERF_URL", "http://127.0.0.1:5199/");
const socketPath = env("PERF_SOCKET");
const token = (await readFile(env("PERF_TOKEN"), "utf8")).trim();
const scratch = env("PERF_SCRATCH");
const label = env("PERF_LABEL", "run");
const streamMs = Number(env("PERF_STREAM_MS", "20000"));
let daemonPid = process.env.PERF_DAEMON_PID;

/** Real sidebar sessions from the copied installation, heaviest first. */
const SWITCH_SESSIONS = (
    process.env.PERF_SESSIONS ??
    "Account Replay Tests|Switch History UI|Intermittent 401s|Codex Account Provenance|users online|Opus Reviewer 2|Analytics review|Claude login recipe"
).split("|");
/** Where a replayed real run streams, and the recorded session it is taken from. */
const STREAM_TARGET = { agentId: "zs9n9aev0nr2ht255ddnnre2", title: "Opus Reviewer 2" };
const STREAM_SOURCE = "s3hbniynlzfstpls7cr0v317";
const IDLE_VIEW = "Switch History UI";
/**
 * Sessions that stream together in the stress and reload windows: four sibling subtasks of one
 * parent, a subtask of another, and a top-level session.
 */
const STRESS_STREAMS = [
    { agentId: "c07cy794s2gqqpb0zg1sdux7", title: "Review diff livelock" },
    { agentId: "gqt1w1bk95s0ux0fyhc8r0tg", title: "Stranded messages, status" },
    { agentId: "f47lqzun9gn2xcoj07dbmj0m", title: "History replay fixes" },
    { agentId: "ue89ojio5l0ujsm5dwclzgwb", title: "Daemon hot paths" },
    { agentId: "g6t8vjozkd3xd9mxw8x568aj", title: "Activation funnel" },
    STREAM_TARGET,
];
const STRESS_DWELL_MS = Number(process.env.PERF_STRESS_DWELL_MS ?? "250");
/** How long the pointer rests on a row before pressing it, and how long the press lasts. */
const HOVER_MS = Number(process.env.PERF_HOVER_MS ?? "150");
const PRESS_MS = Number(process.env.PERF_PRESS_MS ?? "80");
/** Sessions opened only by a click that does not rest on the row first, each for the first time. */
const DIRECT_SESSIONS = (
    process.env.PERF_DIRECT_SESSIONS ??
    "Core Connection Diagnosis|Codex Login Failures|Message percentiles|Product analytics repair|Desktop CLI labels|Recipe Research"
).split("|");
/** Sessions opened only from the command palette, each for the first time. */
const PALETTE_SESSIONS = (
    process.env.PERF_PALETTE_SESSIONS ??
    "Agent Framework Architecture Comparison|Design JEV Settings Search|Onboarding CLI setup instructions|Benchmark Data and Stability Report|Local Code Visualization Tools"
).split("|");
/** How long a reader looks at the highlighted palette result before pressing Enter. */
const PALETTE_DWELL_MS = Number(process.env.PERF_PALETTE_DWELL_MS ?? "150");
const PALETTE_TYPE_DELAY_MS = Number(process.env.PERF_PALETTE_TYPE_DELAY_MS ?? "30");
/** How many times the return window leaves a streaming session and comes back, and how long it stays away. */
const RETURNS = Number(process.env.PERF_RETURNS ?? "6");
const RETURN_AWAY_MS = Number(process.env.PERF_RETURN_AWAY_MS ?? "3000");
/** How many messages the first-response window sends. */
const FIRST_RESPONSES = Number(process.env.PERF_FIRST_RESPONSES ?? "5");
/** What the typing window types, and the pause between keys: a fast typist. */
const TYPED_TEXT =
    "Can you look at why the sidebar flickers when several sessions stream at once, and check whether the composer keeps up while I type this, then summarize what you find in a short list.";
const TYPING_DELAY_MS = Number(process.env.PERF_TYPING_DELAY_MS ?? "30");
/** How many sessions the rapid-sends window sends into, one after another, twice over. */
const RAPID_SESSIONS = Number(process.env.PERF_RAPID_SESSIONS ?? "4");
/** How many wheel notches the scroll window flicks up through the largest session, and how far each goes. */
const SCROLL_STEPS = Number(process.env.PERF_SCROLL_STEPS ?? "400");
const SCROLL_DELTA = Number(process.env.PERF_SCROLL_DELTA ?? "300");
/** A return whose transcript lags the daemon by more than this past the switch counts as stale. */
const STALE_LAG_MS = 100;

// ---------------------------------------------------------------- daemon access

function daemon<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        const req = request(
            {
                headers: {
                    authorization: `Bearer ${token}`,
                    ...(body === undefined ? {} : { "content-type": "application/json" }),
                },
                method,
                path,
                socketPath,
            },
            (res) => {
                let data = "";
                res.setEncoding("utf8");
                res.on("data", (chunk: string) => (data += chunk));
                res.on("end", () => {
                    if ((res.statusCode ?? 500) >= 300)
                        reject(
                            new Error(
                                `${method} ${path} ${String(res.statusCode)} ${data.slice(0, 300)}`,
                            ),
                        );
                    else resolve((data.length === 0 ? undefined : JSON.parse(data)) as T);
                });
            },
        );
        req.on("error", reject);
        if (body !== undefined) req.write(JSON.stringify(body));
        req.end();
    });
}

function daemonCpuMs(): number | undefined {
    if (daemonPid === undefined) return undefined;
    let time: string;
    try {
        time = execFileSync("ps", ["-o", "time=", "-p", daemonPid], { encoding: "utf8" }).trim();
    } catch {
        // The daemon was replaced during the window.
        return undefined;
    }
    const parts = time.split(":").map(Number);
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return Math.round(seconds * 1000);
}

interface ApiBlock {
    type: string;
    text?: string;
    name?: string;
    result?: unknown;
    presentation?: { output?: unknown };
}
interface ApiRun {
    id: string;
    messages: { role: string; content: ApiBlock[] }[];
}

/** Turn the busiest recent recorded run of `sourceAgentId` into a replay plan for `agentId`. */
const recordedRuns = new Map<string, ApiRun>();
async function busiestRun(sourceAgentId: string): Promise<ApiRun> {
    const cached = recordedRuns.get(sourceAgentId);
    if (cached !== undefined) return cached;
    let best: ApiRun | undefined;
    let before: string | undefined;
    for (let page = 0; page < 4; page += 1) {
        const query = `limit=60&omitToolData=false${before === undefined ? "" : `&before=${before}`}`;
        const history = await daemon<{ runs: ApiRun[]; hasMore: boolean }>(
            "GET",
            `/v0/agents/${sourceAgentId}/messages?${query}`,
        );
        for (const run of history.runs) {
            const tools = (r: ApiRun) =>
                r.messages.flatMap((m) => m.content).filter((b) => b.type === "tool_call").length;
            if (best === undefined || tools(run) > tools(best)) best = run;
        }
        if (!history.hasMore || history.runs[0] === undefined) break;
        before = history.runs[0].id;
    }
    if (best === undefined) throw new Error("No recorded run to replay.");
    recordedRuns.set(sourceAgentId, best);
    return best;
}

async function writeReplay(
    agentId: string,
    sourceAgentId: string,
    pace: { readonly chunk?: number; readonly delayMs?: number } = {},
    /** Text the run's final answer ends with, so the run can be found in history afterwards. */
    finalText?: string,
): Promise<number> {
    const best = await busiestRun(sourceAgentId);
    const { agent } = await daemon<{ agent: { workspaceId: string } }>(
        "GET",
        `/v0/agents/${agentId}`,
    );
    const { workspace } = await daemon<{ workspace: { compute: { path?: string } } }>(
        "GET",
        `/v0/workspaces/${agent.workspaceId}`,
    );
    const cwd = workspace.compute.path;
    if (cwd === undefined) throw new Error("The stream target has no workspace path.");
    await mkdir(join(cwd, ".perf-replay"), { recursive: true });
    let outputs = 0;
    const inferences = [];
    for (const message of best.messages) {
        if (message.role === "user") continue;
        const blocks = [];
        for (const block of message.content) {
            if (
                (block.type === "text" || block.type === "reasoning") &&
                typeof block.text === "string" &&
                block.text.length > 0
            ) {
                blocks.push({ text: block.text, type: block.type });
            } else if (block.type === "tool_call") {
                const output = block.presentation?.output ?? block.result ?? "";
                const file = `.perf-replay/${String(outputs++)}.txt`;
                await writeFile(
                    join(cwd, file),
                    typeof output === "string" ? output : JSON.stringify(output, null, 2),
                );
                blocks.push({ command: `cat ${file}`, type: "command" });
            }
        }
        if (blocks.length > 0) inferences.push({ blocks });
    }
    if (finalText !== undefined) {
        // A run ends with the first inference that calls no tool, so every recorded message without
        // one joins the next, and the last inference, the run's answer, ends with the text.
        const joined: typeof inferences = [];
        let pending: (typeof inferences)[number]["blocks"] = [];
        for (const inference of inferences) {
            pending.push(...inference.blocks);
            if (!inference.blocks.some((block) => block.type === "command")) continue;
            joined.push({ blocks: pending });
            pending = [];
        }
        joined.push({ blocks: [...pending, { text: finalText, type: "text" }] });
        inferences.splice(0, inferences.length, ...joined);
    }
    await mkdir(join(scratch, "replay"), { recursive: true });
    await writeFile(
        join(scratch, "replay", `${agentId}.json`),
        JSON.stringify({ inferences, ...pace }),
    );
    return inferences.length;
}

async function sendReplay(agentId: string): Promise<void> {
    await daemon("POST", `/v0/agents/${agentId}/send`, {
        mode: {
            effort: "medium",
            modelId: "anthropic/opus-5-5",
            permissionMode: "full_access",
            providerId: "claude",
            serviceTier: null,
        },
        text: "Replay the recorded run.",
    });
}

async function waitIdle(agentId: string, timeoutMs: number): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const { agent } = await daemon<{ agent: { status: string } }>(
            "GET",
            `/v0/agents/${agentId}`,
        );
        if (agent.status === "idle") return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
}

// ---------------------------------------------------------------- page instrumentation

/** Installed before the app loads: React commit/render counting, long tasks, frames. */
function instrument(): void {
    const perf = {
        commits: 0,
        renders: 0,
        mounts: 0,
        components: new Map<string, number>(),
        origins: new Map<string, number>(),
        longTasks: 0,
        longTaskMs: 0,
        loafs: 0,
        loafBlockingMs: 0,
        frames: 0,
    };
    (window as unknown as { __perf: typeof perf }).__perf = perf;
    const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]);
    type Fiber = {
        tag: number;
        type: unknown;
        flags: number;
        child: Fiber | null;
        sibling: Fiber | null;
        alternate: Fiber | null;
    };
    const nameOf = (fiber: Fiber): string => {
        const type = fiber.type as {
            displayName?: string;
            name?: string;
            type?: { displayName?: string; name?: string };
            render?: { name?: string };
        } | null;
        return (
            type?.displayName ??
            type?.name ??
            type?.type?.displayName ??
            type?.type?.name ??
            type?.render?.name ??
            "Anonymous"
        );
    };
    const rendered = (fiber: Fiber, mount: boolean): void => {
        if (!COMPONENT_TAGS.has(fiber.tag)) return;
        if (mount) perf.mounts += 1;
        perf.renders += 1;
        const name = nameOf(fiber);
        perf.components.set(name, (perf.components.get(name) ?? 0) + 1);
    };
    const mountSubtree = (fiber: Fiber): void => {
        rendered(fiber, true);
        for (let child = fiber.child; child !== null; child = child.sibling) mountSubtree(child);
    };
    // React DevTools' rule: a subtree whose child list was not cloned did not render this commit.
    // An origin is a component that rendered under an ancestor component that did not: where a
    // state or store update entered the tree.
    const update = (fiber: Fiber, ancestorRendered: boolean): void => {
        if (fiber.alternate !== null && fiber.alternate.child === fiber.child) return;
        for (let child = fiber.child; child !== null; child = child.sibling) {
            if (child.alternate === null) mountSubtree(child);
            else {
                const didRender = COMPONENT_TAGS.has(child.tag) && (child.flags & 1) === 1;
                if (didRender) {
                    rendered(child, false);
                    if (!ancestorRendered) {
                        const name = nameOf(child);
                        perf.origins.set(name, (perf.origins.get(name) ?? 0) + 1);
                    }
                }
                update(child, COMPONENT_TAGS.has(child.tag) ? didRender : ancestorRendered);
            }
        }
    };
    let rendererId = 0;
    (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        checkDCE() {},
        inject() {
            rendererId += 1;
            return rendererId;
        },
        isDisabled: false,
        onCommitFiberRoot(_id: number, root: { current: Fiber }) {
            perf.commits += 1;
            update(root.current, false);
        },
        onCommitFiberUnmount() {},
        onPostCommitFiberRoot() {},
        renderers: new Map(),
        supportsFiber: true,
    };
    new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            perf.longTasks += 1;
            perf.longTaskMs += entry.duration;
        }
    }).observe({ type: "longtask", buffered: true });
    try {
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                perf.loafs += 1;
                perf.loafBlockingMs += (
                    entry as unknown as { blockingDuration: number }
                ).blockingDuration;
            }
        }).observe({ type: "long-animation-frame", buffered: true });
    } catch {
        // Older engines have no long-animation-frame entries.
    }
    const frame = (): void => {
        perf.frames += 1;
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

interface PageCounters {
    commits: number;
    renders: number;
    mounts: number;
    components: [string, number][];
    origins: [string, number][];
    longTasks: number;
    longTaskMs: number;
    loafs: number;
    loafBlockingMs: number;
    frames: number;
}

async function pageCounters(page: Page): Promise<PageCounters> {
    return await page.evaluate(() => {
        const perf = (
            window as unknown as {
                __perf: Omit<PageCounters, "components" | "origins"> & {
                    components: Map<string, number>;
                    origins: Map<string, number>;
                };
            }
        ).__perf;
        if (perf === undefined)
            return {
                commits: 0,
                components: [],
                origins: [],
                frames: 0,
                loafBlockingMs: 0,
                loafs: 0,
                longTaskMs: 0,
                longTasks: 0,
                mounts: 0,
                renders: 0,
            };
        return { ...perf, components: [...perf.components], origins: [...perf.origins] };
    });
}

const CDP_METRICS = [
    "TaskDuration",
    "ScriptDuration",
    "LayoutDuration",
    "RecalcStyleDuration",
    "JSHeapUsedSize",
    "Nodes",
    "LayoutCount",
    "RecalcStyleCount",
    "JSEventListeners",
] as const;

async function cdpMetrics(cdp: CDPSession): Promise<Record<string, number>> {
    const { metrics } = await cdp.send("Performance.getMetrics");
    return Object.fromEntries(
        metrics
            .filter((m) => (CDP_METRICS as readonly string[]).includes(m.name))
            .map((m) => [m.name, m.value]),
    );
}

// ---------------------------------------------------------------- measurement windows

interface Requests {
    log: string[];
    count: number;
    bytes: number;
    routes: Map<string, { count: number; bytes: number; ms: number }>;
}
function routeOf(path: string): string {
    return path
        .replace(/^\/__happy_local_happy_agent/, "")
        .replace(/\/[a-z0-9]{24}(?=\/|$)/g, "/:id")
        .replace(/\?.*$/, "");
}

interface Window {
    readonly name: string;
    readonly result: Record<string, unknown>;
}

let profileCount = 0;
async function measure<T>(
    name: string,
    page: Page,
    cdp: CDPSession,
    requests: Requests,
    work: () => Promise<T>,
): Promise<{ value: T; window: Window }> {
    await page.evaluate(() => (window as unknown as { gc?: () => void }).gc?.());
    const beforeCounters = await pageCounters(page);
    const beforeMetrics = await cdpMetrics(cdp);
    const beforeCpu = daemonCpuMs();
    requests.count = 0;
    requests.bytes = 0;
    requests.routes.clear();
    requests.log = [];
    const profile = (process.env.PERF_CPU_PROFILE ?? "").split(",").includes(name);
    if (profile) {
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
        await cdp.send("Profiler.start");
    }
    const daemonProfile =
        daemonPid !== undefined &&
        (process.env.PERF_DAEMON_PROFILE ?? "").split(",").includes(name);
    if (daemonProfile) process.kill(Number(daemonPid), "SIGUSR2");
    // With PERF_SQL_STATS on the daemon, SIGUSR1 dumps and resets its per-statement totals.
    const sqlStats =
        daemonPid !== undefined && (process.env.PERF_SQL_WINDOWS ?? "").split(",").includes(name);
    if (sqlStats) process.kill(Number(daemonPid), "SIGUSR1");
    const started = performance.now();
    const value = await work();
    const wallMs = performance.now() - started;
    if (sqlStats) process.kill(Number(daemonPid), "SIGUSR1");
    if (daemonProfile) {
        process.kill(Number(daemonPid), "SIGUSR2");
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (profile) {
        const { profile: cpu } = await cdp.send("Profiler.stop");
        profileCount += 1;
        await writeFile(
            join(scratch, `renderer-${label}-${name}-${String(profileCount)}.cpuprofile`),
            JSON.stringify(cpu),
        );
    }
    const afterCounters = await pageCounters(page);
    const afterMetrics = await cdpMetrics(cdp);
    // CDP's node count includes detached nodes not yet collected; this is what the document holds,
    // and the largest UI parts in it, so a count that grows says whether it is on the page or leaked.
    const dom = await page.evaluate(() => {
        const parts = [...document.querySelectorAll("[data-happy-desktop-ui]")].map((element) => ({
            name: element.getAttribute("data-happy-desktop-ui"),
            nodes: element.getElementsByTagName("*").length,
            hidden: (element as HTMLElement).offsetParent === null,
        }));
        const named = new Map<string, number>();
        for (const part of parts.filter((p) => p.nodes > 300)) {
            const key = `${String(part.name)}${part.hidden ? " (hidden)" : ""}`;
            named.set(key, Math.max(named.get(key) ?? 0, part.nodes));
        }
        return {
            live: document.getElementsByTagName("*").length,
            top: [...named]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, nodes]) => `${name} ${String(nodes)}`),
        };
    });
    // Detached nodes still alive after a full collection are retained by something: a leak.
    await cdp.send("HeapProfiler.collectGarbage");
    const retainedNodes = (await cdpMetrics(cdp)).Nodes;
    const afterCpu = daemonCpuMs();
    const components = new Map(afterCounters.components);
    for (const [component, count] of beforeCounters.components)
        components.set(component, (components.get(component) ?? 0) - count);
    const origins = new Map(afterCounters.origins);
    for (const [component, count] of beforeCounters.origins)
        origins.set(component, (origins.get(component) ?? 0) - count);
    const delta = (key: keyof Omit<PageCounters, "components" | "origins">) =>
        Math.round((afterCounters[key] - beforeCounters[key]) * 10) / 10;
    const ms = (key: string) =>
        Math.round(((afterMetrics[key] ?? 0) - (beforeMetrics[key] ?? 0)) * 10000) / 10;
    return {
        value,
        window: {
            name,
            result: {
                wallMs: Math.round(wallMs),
                reactCommits: delta("commits"),
                reactRenders: delta("renders"),
                reactMounts: delta("mounts"),
                topComponents: [...components]
                    .filter(([, c]) => c > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12),
                updateOrigins: [...origins]
                    .filter(([, c]) => c > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8),
                longTasks: delta("longTasks"),
                longTaskMs: delta("longTaskMs"),
                longAnimationFrames: delta("loafs"),
                loafBlockingMs: delta("loafBlockingMs"),
                frames: delta("frames"),
                cpuTaskMs: ms("TaskDuration"),
                cpuScriptMs: ms("ScriptDuration"),
                cpuLayoutMs: ms("LayoutDuration"),
                cpuStyleMs: ms("RecalcStyleDuration"),
                layouts: (afterMetrics.LayoutCount ?? 0) - (beforeMetrics.LayoutCount ?? 0),
                heapMB: Math.round((afterMetrics.JSHeapUsedSize ?? 0) / 1e5) / 10,
                heapDeltaMB:
                    Math.round(
                        ((afterMetrics.JSHeapUsedSize ?? 0) - (beforeMetrics.JSHeapUsedSize ?? 0)) /
                            1e5,
                    ) / 10,
                domNodes: afterMetrics.Nodes,
                domLive: dom.live,
                domAfterGc: retainedNodes,
                domTop: dom.top as never,
                listeners: afterMetrics.JSEventListeners,
                requests: requests.count,
                requestKB: Math.round(requests.bytes / 1024),
                requestLog: requests.log.slice(0, 60),
                routes: [...requests.routes]
                    .sort((a, b) => b[1].bytes - a[1].bytes)
                    .slice(0, 10)
                    .map(
                        ([route, r]) =>
                            `${route} x${String(r.count)} ${String(Math.round(r.bytes / 1024))}KB ${String(Math.round(r.ms))}ms`,
                    ),
                daemonCpuMs:
                    beforeCpu === undefined || afterCpu === undefined ? null : afterCpu - beforeCpu,
            },
        },
    };
}

/**
 * The sidebar rows that open the session titled `title`, or, given its `agentId`, only that
 * session's own row: a workspace row can carry the same title, and pressing it starts a new chat.
 */
function sessionRows(page: Page, title: string, agentId?: string): Locator {
    if (agentId !== undefined)
        return page.locator(`[data-happy-desktop-ui="sidebar-item"][data-item-id$="/${agentId}"]`);
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return page.getByRole("button", { name: new RegExp(`(^|\\s)${escaped}$`) });
}

/**
 * Click a sidebar session and time, in page, until its transcript is on screen. With `fresh`, a
 * snippet the daemon already had when the click happened, also time until the transcript shows it:
 * a live cache shows it at once, a stale one only once fresh history lands.
 */
async function switchTo(
    page: Page,
    title: string,
    fresh?: string,
    hoverMs = HOVER_MS,
    agentId?: string,
): Promise<Record<string, unknown>> {
    const row = sessionRows(page, title, agentId).first();
    await row.scrollIntoViewIfNeeded();
    await switchWatch(page, "click", fresh);
    // A reader's pointer rests on a row before pressing it, and a press takes a moment.
    await row.hover();
    await page.waitForTimeout(hoverMs);
    await page.mouse.down();
    await page.waitForTimeout(PRESS_MS);
    await page.mouse.up();
    return await switchResult(page, title, fresh);
}

/**
 * Open a session from the command palette the way a reader does: type its title, glance at the
 * highlighted result for `dwellMs`, press Enter. Timed from the Enter.
 */
async function paletteSwitchTo(
    page: Page,
    title: string,
    dwellMs: number,
): Promise<Record<string, unknown>> {
    await page.keyboard.press("Meta+K");
    await page
        .getByPlaceholder("Search chats, workspaces, and settings…")
        .waitFor({ timeout: 5_000 })
        .catch(async (error: unknown) => {
            await page.screenshot({ path: join(scratch, "palette-failed.png") });
            throw new Error(`The palette did not open for "${title}".`, { cause: error });
        });
    await page.keyboard.type(title, { delay: PALETTE_TYPE_DELAY_MS });
    await page.waitForTimeout(dwellMs);
    await switchWatch(page, "keydown");
    await page.keyboard.press("Enter");
    const result = await switchResult(page, title);
    // A title whose top result is not its chat (a setting, say) leaves the palette open.
    if (await page.getByPlaceholder("Search chats, workspaces, and settings…").isVisible()) {
        throw new Error(`The palette's top result for "${title}" is not its chat.`);
    }
    return result;
}

/** Start timing, in page, from the next `trigger` event until the transcript on screen changes. */
async function switchWatch(
    page: Page,
    trigger: "click" | "keydown",
    fresh?: string,
): Promise<void> {
    await page.evaluate(
        ([fresh, trigger]) => {
            // Every connection keeps its own window mounted; only the one on screen counts.
            const shown = (part: string) =>
                [...document.querySelectorAll(`[data-happy-desktop-ui="${part}"]`)].find(
                    (element) => element.checkVisibility(),
                );
            const content = () => shown("message-list-content")?.textContent ?? "";
            const previous = content();
            const state: {
                clickAt?: number;
                readyAt?: number;
                spinnerAt?: number;
                spinnerEndAt?: number;
                freshAt?: number;
            } = {};
            const normalized = (text: string) => text.replace(/\s+/g, " ");
            (window as unknown as { __switch: Promise<typeof state> }).__switch = new Promise(
                (resolve) => {
                    // Timed from the click, when the row is selected (the press before it is the reader's
                    // own), or from the key that commits a palette row.
                    document.addEventListener(trigger, () => (state.clickAt = performance.now()), {
                        capture: true,
                        once: true,
                    });
                    const poll = (): void => {
                        if (state.clickAt !== undefined) {
                            const loading = shown("conversation-loading");
                            // A spinner counts once a reader can see it, not while its reveal is held back.
                            const spinner =
                                loading
                                    ?.querySelector('[data-happy-desktop-ui="spinner"]')
                                    ?.checkVisibility({ visibilityProperty: true }) === true;
                            if (spinner && state.spinnerAt === undefined)
                                state.spinnerAt = performance.now();
                            if (
                                !spinner &&
                                state.spinnerAt !== undefined &&
                                state.spinnerEndAt === undefined
                            )
                                state.spinnerEndAt = performance.now();
                            const text = content();
                            const empty = shown("conversation-empty") !== undefined;
                            if (
                                state.readyAt === undefined &&
                                loading === undefined &&
                                ((text.length > 0 && text !== previous) || empty)
                            ) {
                                state.readyAt = performance.now();
                            }
                            if (
                                state.readyAt !== undefined &&
                                fresh !== null &&
                                state.freshAt === undefined &&
                                normalized(text).includes(fresh)
                            ) {
                                state.freshAt = performance.now();
                            }
                            if (
                                state.readyAt !== undefined &&
                                (fresh === null ||
                                    state.freshAt !== undefined ||
                                    performance.now() - state.clickAt > 3000)
                            ) {
                                resolve(state);
                                return;
                            }
                            if (performance.now() - state.clickAt > 15_000) {
                                resolve(state);
                                return;
                            }
                        }
                        requestAnimationFrame(poll);
                    };
                    requestAnimationFrame(poll);
                },
            );
        },
        [fresh ?? null, trigger] as const,
    );
}

async function switchResult(
    page: Page,
    title: string,
    fresh?: string,
): Promise<Record<string, unknown>> {
    const state = await page.evaluate(
        () =>
            (window as unknown as { __switch: Promise<Record<string, number | undefined>> })
                .__switch,
    );
    const clickAt = state.clickAt ?? 0;
    return {
        title,
        switchMs: state.readyAt === undefined ? null : Math.round(state.readyAt - clickAt),
        spinner: state.spinnerAt !== undefined,
        spinnerMs:
            state.spinnerAt === undefined
                ? 0
                : Math.round((state.spinnerEndAt ?? state.readyAt ?? clickAt) - state.spinnerAt),
        ...(fresh === undefined
            ? {}
            : {
                  freshMs: state.freshAt === undefined ? null : Math.round(state.freshAt - clickAt),
              }),
    };
}

/** Press Enter in the focused composer and time, in page, until `prompt` and then `marker` are on screen. */
async function timeFirstResponse(
    page: Page,
    prompt: string,
    marker: string,
): Promise<Record<string, number | null>> {
    await page.evaluate(
        ([prompt, marker]) => {
            // Kept conversations stay mounted out of sight; only the one on screen counts.
            const text = () =>
                (
                    [
                        ...document.querySelectorAll(
                            '[data-happy-desktop-ui="message-list-content"]',
                        ),
                    ].find((element) => element.checkVisibility())?.textContent ?? ""
                ).replace(/\s+/g, " ");
            const state: { pressAt?: number; echoAt?: number; markerAt?: number } = {};
            (window as unknown as { __send: Promise<typeof state> }).__send = new Promise(
                (resolve) => {
                    document.addEventListener(
                        "keydown",
                        (event) => {
                            if (event.key === "Enter") state.pressAt = performance.now();
                        },
                        { capture: true, once: true },
                    );
                    const poll = (): void => {
                        if (state.pressAt !== undefined) {
                            const now = text();
                            if (state.echoAt === undefined && now.includes(prompt))
                                state.echoAt = performance.now();
                            if (state.markerAt === undefined && now.includes(marker.slice(0, 16)))
                                state.markerAt = performance.now();
                            if (
                                (state.echoAt !== undefined && state.markerAt !== undefined) ||
                                performance.now() - state.pressAt > 20_000
                            ) {
                                resolve(state);
                                return;
                            }
                        }
                        requestAnimationFrame(poll);
                    };
                    requestAnimationFrame(poll);
                },
            );
        },
        [prompt, marker] as const,
    );
    await page.keyboard.press("Enter");
    const state = await page.evaluate(
        () => (window as unknown as { __send: Promise<Record<string, number | undefined>> }).__send,
    );
    const at = (key: string) =>
        state[key] === undefined || state.pressAt === undefined
            ? null
            : Math.round(state[key]! - state.pressAt);
    return { echoMs: at("echoAt"), firstTokenMs: at("markerAt") };
}

/** The text of the conversation on screen, its queued messages included, as plain words. */
async function visibleConversationText(page: Page): Promise<string> {
    return await page.evaluate(() =>
        [
            ...document.querySelectorAll(
                '[data-happy-desktop-ui="message-list-content"], [data-happy-desktop-ui="conversation-queued"]',
            ),
        ]
            .filter((element) => element.checkVisibility())
            .map((element) => element.textContent ?? "")
            .join(" ")
            .replace(/\s+/g, " "),
    );
}

/** Press Enter in the focused composer and time, in page, until `prompt` is on screen in the conversation. */
async function timeEcho(page: Page, prompt: string): Promise<{ echoMs: number | null }> {
    await page.evaluate((prompt) => {
        const shown = () =>
            [
                ...document.querySelectorAll(
                    '[data-happy-desktop-ui="message-list-content"], [data-happy-desktop-ui="conversation-queued"]',
                ),
            ].some(
                (element) =>
                    element.checkVisibility() &&
                    (element.textContent ?? "").replace(/\s+/g, " ").includes(prompt),
            );
        const state: { pressAt?: number; echoAt?: number } = {};
        (window as unknown as { __echo: Promise<typeof state> }).__echo = new Promise((resolve) => {
            document.addEventListener(
                "keydown",
                (event) => {
                    if (event.key === "Enter") state.pressAt = performance.now();
                },
                { capture: true, once: true },
            );
            const poll = (): void => {
                if (state.pressAt !== undefined) {
                    if (shown()) state.echoAt = performance.now();
                    if (state.echoAt !== undefined || performance.now() - state.pressAt > 5000) {
                        resolve(state);
                        return;
                    }
                }
                requestAnimationFrame(poll);
            };
            requestAnimationFrame(poll);
        });
    }, prompt);
    await page.keyboard.press("Enter");
    const state = await page.evaluate(
        () =>
            (window as unknown as { __echo: Promise<{ pressAt?: number; echoAt?: number }> })
                .__echo,
    );
    return {
        echoMs:
            state.echoAt === undefined || state.pressAt === undefined
                ? null
                : Math.round(state.echoAt - state.pressAt),
    };
}

/**
 * Type `text` into the composer on screen at a fast typist's pace, timing each keystroke from the key
 * event until the frame after it is drawn, and the browser's own count of keystrokes slower than a frame.
 */
async function timeTyping(page: Page, text: string): Promise<Record<string, unknown>> {
    const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]:visible').first();
    await composer.click();
    await composer.fill("");
    await page.evaluate(() => {
        const state = {
            latencies: [] as number[],
            slow: [] as number[],
            stop: new AbortController(),
            observer: undefined as PerformanceObserver | undefined,
        };
        (window as unknown as { __typing: typeof state }).__typing = state;
        document.addEventListener(
            "keydown",
            (event) => {
                const at = event.timeStamp;
                requestAnimationFrame(() => {
                    const channel = new MessageChannel();
                    channel.port1.onmessage = () => state.latencies.push(performance.now() - at);
                    channel.port2.postMessage(0);
                });
            },
            { capture: true, signal: state.stop.signal },
        );
        state.observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
                if (entry.name === "keydown") state.slow.push(entry.duration);
        });
        state.observer.observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
    });
    await page.keyboard.type(text, { delay: TYPING_DELAY_MS });
    await page.waitForTimeout(500);
    const measured = await page.evaluate(() => {
        const state = (
            window as unknown as {
                __typing: {
                    latencies: number[];
                    slow: number[];
                    stop: AbortController;
                    observer?: PerformanceObserver;
                };
            }
        ).__typing;
        state.stop.abort();
        state.observer?.disconnect();
        return { latencies: state.latencies, slow: state.slow };
    });
    const typed = await composer.inputValue();
    await composer.fill("");
    const times = [...measured.latencies].sort((a, b) => a - b);
    const at = (q: number) =>
        Math.round(times[Math.min(times.length - 1, Math.floor(q * times.length))] ?? 0);
    return {
        keys: text.length,
        keyMedianMs: at(0.5),
        keyP95Ms: at(0.95),
        keyMaxMs: Math.round(times.at(-1) ?? 0),
        keysOver50Ms: times.filter((t) => t > 50).length,
        keysOverFrame: measured.slow.length,
        eventMaxMs: Math.round(Math.max(0, ...measured.slow)),
        exact: typed === text,
    };
}

/** Like switchTo, but a session the sidebar does not show right now is skipped. */
async function trySwitch(
    page: Page,
    title: string,
    agentId?: string,
): Promise<Record<string, unknown> | undefined> {
    if ((await sessionRows(page, title, agentId).count()) === 0) return undefined;
    const started = performance.now();
    const fresh = agentId === undefined ? undefined : await latestSnippet(agentId);
    const result = await switchTo(page, title, fresh, HOVER_MS, agentId);
    if (fresh !== undefined && result.freshMs === null) {
        // What the reader saw instead of what the daemon had streamed.
        const shot = join(scratch, `stale-${title.replace(/\W+/g, "-")}.png`);
        await page.screenshot({ path: shot });
        const shown = await page.evaluate(() =>
            [...document.querySelectorAll('[data-happy-desktop-ui="message-list-content"]')]
                .filter((element) => element.checkVisibility())
                .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").slice(-400)),
        );
        console.log(
            `STALE ${title}: wanted "${fresh}"; ${shot}\n  shown: ${JSON.stringify(shown)}`,
        );
    }
    if (agentId !== undefined) {
        // History reads the switch itself caused: a live cache needs none.
        result.historyReads = requestTimeline.filter(
            (e) =>
                e.at >= started &&
                e.phase === "start" &&
                e.path === `/v0/agents/${agentId}/messages`,
        ).length;
    }
    if (
        process.env.PERF_SLOW_SWITCH_MS !== undefined &&
        Number(result.switchMs) > Number(process.env.PERF_SLOW_SWITCH_MS)
    ) {
        const ended = performance.now();
        const seen = requestTimeline.filter((e) => e.at >= started - 2000 && e.at <= ended + 200);
        console.log(
            `SLOW ${title} ${String(result.switchMs)}ms\n` +
                seen
                    .map(
                        (e) =>
                            `  ${String(Math.round(e.at - started))} ${e.phase} ${e.path}${e.timing ?? ""}`,
                    )
                    .join("\n"),
        );
    }
    return result;
}

/**
 * Returns to streaming sessions: how long until each showed what the daemon had at the click, and
 * how many lagged their own switch by more than STALE_LAG_MS (a stale cache waiting on history).
 */
function catchUpStats(returns: readonly Record<string, unknown>[]): Record<string, number> {
    const measured = returns.filter((s) => s.freshMs !== undefined);
    const times = measured
        .map((s) => (s.freshMs === null ? 3000 : Number(s.freshMs)))
        .sort((a, b) => a - b);
    return {
        streamReturns: measured.length,
        staleReturns: measured.filter(
            (s) => s.freshMs === null || Number(s.freshMs) - Number(s.switchMs) > STALE_LAG_MS,
        ).length,
        freshMedianMs: times[Math.floor(times.length / 2)] ?? 0,
        freshP95Ms: times[Math.min(times.length - 1, Math.floor(0.95 * times.length))] ?? 0,
        freshMaxMs: times.at(-1) ?? 0,
    };
}

/** The tail of the newest agent text the daemon holds for a session, as plain words. */
async function latestSnippet(agentId: string): Promise<string | undefined> {
    const page = await daemon<{
        runs: { messages: { role: string; content: { type: string; text?: string }[] }[] }[];
    }>("GET", `/v0/agents/${agentId}/messages?limit=1&omitToolData=true`);
    const texts = page.runs
        .flatMap((run) => run.messages)
        .filter((m) => m.role === "agent")
        .flatMap((m) => m.content)
        .filter((b) => b.type === "text" && b.text !== undefined);
    const text = texts.at(-1)?.text ?? "";
    // Markdown renders differently from its source; a run of plain words renders as itself.
    const words = text.match(/[A-Za-z0-9][A-Za-z0-9 ,]{23,}/g)?.at(-1);
    return words?.trim().replace(/\s+/g, " ").slice(-24);
}

function switchStats(
    switches: readonly Record<string, unknown>[],
): Record<string, number | undefined> {
    const times = switches
        .map((s) => s.switchMs as number | null)
        .filter((t): t is number => t !== null)
        .sort((a, b) => a - b);
    const at = (q: number) => times[Math.min(times.length - 1, Math.floor(q * times.length))];
    return {
        switches: switches.length,
        switchMedianMs: at(0.5),
        switchP95Ms: at(0.95),
        switchMaxMs: times.at(-1),
        spinners: switches.filter((s) => s.spinner).length,
        spinnerTotalMs: switches.reduce((total, s) => total + ((s.spinnerMs as number) ?? 0), 0),
    };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Health {
    readonly ready: boolean;
    readonly drainWaitingFor?: readonly unknown[];
}

/** Drain, shut down, and start the daemon again, timing each phase and the page's reconnect. */
async function reloadDaemon(command: string): Promise<Record<string, number | null>> {
    const started = performance.now();
    await daemon("POST", "/v0/drain");
    for (;;) {
        const health = await daemon<Health>("GET", "/v0/health");
        if ((health.drainWaitingFor ?? []).length === 0) break;
        await sleep(20);
    }
    const drained = performance.now();
    const { pid } = await daemon<{ pid: number }>("POST", "/v0/shutdown");
    const alive = () => {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    };
    while (alive()) await sleep(5);
    const exited = performance.now();
    spawn("zsh", ["-c", command], { detached: true, stdio: "ignore" }).unref();
    let answered: number | undefined;
    for (;;) {
        const health = await daemon<Health>("GET", "/v0/health").catch(() => undefined);
        if (health !== undefined) answered ??= performance.now();
        if (health?.ready === true) break;
        if (performance.now() - exited > 120_000)
            throw new Error("The restarted daemon never became ready.");
        await sleep(10);
    }
    const ready = performance.now();
    const pidFile = process.env.PERF_DAEMON_PIDFILE;
    if (pidFile !== undefined) daemonPid = (await readFile(pidFile, "utf8")).trim();
    // The page is live again once it has a fresh desktop bootstrap and an open event stream, and the
    // session on screen is current again once its history has been read from the new process.
    const after = (predicate: (entry: (typeof requestTimeline)[number]) => boolean) =>
        requestTimeline.find((entry) => entry.at >= exited && predicate(entry))?.at;
    let bootstrapped: number | undefined;
    let streaming: number | undefined;
    let sessionLoaded: number | undefined;
    const messagesPath = `/v0/agents/${STREAM_TARGET.agentId}/messages`;
    while (performance.now() - ready < 60_000) {
        bootstrapped = after((e) => e.phase === "end" && e.path === "/v0/bootstrap/desktop");
        streaming = after(
            (e) =>
                e.phase === "start" &&
                e.path === "/v0/events/stream" &&
                e.at >= (bootstrapped ?? Infinity),
        );
        sessionLoaded = after((e) => e.phase === "end" && e.path === messagesPath);
        if (bootstrapped !== undefined && streaming !== undefined && sessionLoaded !== undefined)
            break;
        await sleep(10);
    }
    const ms = (to: number | undefined, from: number) =>
        to === undefined ? null : Math.round(to - from);
    const live = streaming === undefined ? undefined : Math.max(streaming, bootstrapped ?? 0);
    return {
        drainMs: Math.round(drained - started),
        shutdownMs: Math.round(exited - drained),
        processUpMs: ms(answered, exited),
        startMs: Math.round(ready - exited),
        reconnectMs: ms(live, ready),
        sessionReloadMs: ms(sessionLoaded, ready),
        restartTotalMs: ms(
            live === undefined ? undefined : Math.max(live, sessionLoaded ?? 0),
            drained,
        ),
        // Every daemon request from the old process exiting on, in ms after the new one was ready.
        timeline: requestTimeline
            .filter((e) => e.at >= exited)
            .map((e) => `${String(Math.round(e.at - ready))} ${e.phase} ${e.path}`) as never,
    };
}

// ---------------------------------------------------------------- run

const profileDir = join(scratch, `chromium-${label}`);
await rm(profileDir, { force: true, recursive: true });
await cp(env("PERF_PROFILE"), profileDir, { recursive: true });
const context = await chromium.launchPersistentContext(profileDir, {
    args: ["--js-flags=--expose-gc", "--enable-precise-memory-info"],
    viewport: { height: 1000, width: 1600 },
});
const page = context.pages()[0] ?? (await context.newPage());
// tsx keeps function names with a `__name` helper that serialized page functions also call.
await page.addInitScript({ content: "globalThis.__name = (target) => target;" });
await page.addInitScript(instrument);
// When the first row the gym looks for enters the DOM, in navigation time: Playwright polls with backoff,
// so its own detection lands up to a few hundred milliseconds late.
await page.addInitScript((title: string) => {
    const seen = (): boolean =>
        [...document.querySelectorAll("button")].some(
            (button) => button.textContent?.endsWith(title) === true,
        );
    const observer = new MutationObserver(() => {
        if (!seen()) return;
        (globalThis as { __rowSeenAt?: number }).__rowSeenAt = performance.now();
        observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
}, SWITCH_SESSIONS[0]!);
const cdp = await context.newCDPSession(page);
page.on("console", (message) => {
    if (message.text().startsWith("PERFDBG")) console.log(message.text());
});
await cdp.send("Performance.enable");
const requests: Requests = { bytes: 0, count: 0, log: [], routes: new Map() };
const requestStarts = new WeakMap<object, number>();
/** Every daemon request the page starts and finishes, for timing the reconnect after a reload. */
const requestTimeline: {
    readonly at: number;
    readonly path: string;
    readonly phase: "start" | "end";
    readonly timing?: string;
}[] = [];
const daemonPath = (raw: string): string | undefined => {
    const path = new URL(raw).pathname;
    return path.startsWith("/__happy_local_happy_agent")
        ? path.slice("/__happy_local_happy_agent".length)
        : undefined;
};
page.on("request", (req) => {
    requestStarts.set(req, performance.now());
    const path = daemonPath(req.url());
    if (path !== undefined) requestTimeline.push({ at: performance.now(), path, phase: "start" });
});
page.on("requestfinished", (req) => {
    const path = daemonPath(req.url());
    if (path === undefined) return;
    const t = req.timing();
    requestTimeline.push({
        at: performance.now(),
        path,
        phase: "end",
        timing: ` send@${String(Math.round(t.requestStart))} first@${String(Math.round(t.responseStart))} end@${String(Math.round(t.responseEnd))}`,
    });
});
page.on("requestfinished", (req) => {
    void (async () => {
        const path = new URL(req.url()).pathname + new URL(req.url()).search;
        if (!path.startsWith("/__happy_local_happy_agent")) return;
        const sizes = await req.sizes().catch(() => undefined);
        const bytes = sizes?.responseBodySize ?? 0;
        requests.count += 1;
        requests.log.push(`${req.method()} ${path.replace(/^\/__happy_local_happy_agent/, "")}`);
        requests.bytes += bytes;
        const route = routeOf(path);
        const entry = requests.routes.get(route) ?? { bytes: 0, count: 0, ms: 0 };
        entry.count += 1;
        entry.bytes += bytes;
        entry.ms += performance.now() - (requestStarts.get(req) ?? performance.now());
        requests.routes.set(route, entry);
    })();
});

// PERF_MODE=leak: a long randomized mix of everything below, with memory verdicts; see perf/leakMode.ts.
if (process.env.PERF_MODE === "leak") {
    // Nothing reads the request log in this mode; keep the gym's own memory flat.
    setInterval(() => {
        requestTimeline.splice(0, Math.max(0, requestTimeline.length - 2000));
        requests.log = [];
        requests.routes.clear();
    }, 10_000).unref();
    const { leakRun } = await import("./leakMode.ts");
    const code = await leakRun({
        busiestRun,
        cdp,
        daemon,
        daemonPidSet: (pid) => (daemonPid = pid),
        hoverMs: HOVER_MS,
        label,
        out: env("PERF_OUT"),
        page,
        paletteDwellMs: PALETTE_DWELL_MS,
        paletteSessions: PALETTE_SESSIONS,
        paletteTypeDelayMs: PALETTE_TYPE_DELAY_MS,
        scratch,
        sessionRows,
        sessions: [...SWITCH_SESSIONS, ...DIRECT_SESSIONS, ...PALETTE_SESSIONS],
        streamSource: STREAM_SOURCE,
        streams: STRESS_STREAMS,
        switchTo,
        url,
        visibleConversationText,
        writeReplay,
    });
    await context.close();
    process.exit(code);
}

const windows: Window[] = [];
const switches: Record<string, unknown>[] = [];

// Startup: navigation until the sidebar lists sessions.
const startup = await measure("startup", page, cdp, requests, async () => {
    const started = Date.now();
    const from = performance.now();
    await page.goto(url);
    const row = page.getByRole("button", { name: new RegExp(`${SWITCH_SESSIONS[0]}$`) }).first();
    let rowAttachedMs: number | undefined;
    void row.waitFor({ state: "attached", timeout: 30_000 }).then(() => {
        rowAttachedMs = Date.now() - started;
    });
    await row.waitFor({ timeout: 30_000 });
    const sidebarMs = Date.now() - started;
    const navigation = await page.evaluate(() => {
        const entry = performance.getEntriesByType("navigation")[0] as
            | PerformanceNavigationTiming
            | undefined;
        const scripts = performance
            .getEntriesByType("resource")
            .filter(
                (r) =>
                    r.name.endsWith(".js") || r.name.endsWith(".css") || r.name.endsWith(".woff2"),
            )
            .map(
                (r) =>
                    String(Math.round(r.startTime)) +
                    "-" +
                    String(Math.round(r.responseEnd)) +
                    " " +
                    r.name.split("/").pop(),
            );
        return entry === undefined
            ? { scripts }
            : {
                  domInteractiveMs: Math.round(entry.domInteractive),
                  domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
                  loadMs: Math.round(entry.loadEventEnd),
                  scripts,
              };
    });
    await page.waitForTimeout(1500);
    // Every daemon request from navigation on, in ms after it started, for reading what the sidebar waited on.
    const timeline = requestTimeline
        .filter((e) => e.at >= from)
        .map((e) => String(Math.round(e.at - from)) + " " + e.phase + " " + e.path);
    const rowInDomMs = await page.evaluate(() =>
        Math.round((globalThis as { __rowSeenAt?: number }).__rowSeenAt ?? -1),
    );
    return { sidebarMs, rowAttachedMs, rowInDomMs, ...navigation, timeline: timeline as never };
});
windows.push({ name: "startup", result: { ...startup.window.result, ...startup.value } });

for (const pass of ["cold", "warm"] as const) {
    for (const title of SWITCH_SESSIONS) {
        const measured = await measure(`switch-${pass}`, page, cdp, requests, async () => {
            const result = await switchTo(page, title);
            await page.waitForTimeout(600);
            return result;
        });
        switches.push({ pass, ...measured.value, ...measured.window.result });
    }
}

// A reader who clicks a row the moment the pointer reaches it: only the press itself is warning.
for (const title of DIRECT_SESSIONS) {
    const rows = page.getByRole("button").filter({ hasText: title });
    if ((await rows.count()) === 0) {
        console.log("direct: " + JSON.stringify(title) + " is not in the sidebar; skipped");
        continue;
    }
    const measured = await measure("switch-direct", page, cdp, requests, async () => {
        const result = await switchTo(page, title, undefined, 0);
        await page.waitForTimeout(600);
        return result;
    });
    switches.push({ pass: "direct", ...measured.value, ...measured.window.result });
}

// PERF_REMOTE_ID: the same direct clicks into a remote Happy Agent's sessions, each a network
// round trip away, after switching the rail to it; then back to the local one.
const remoteId = process.env.PERF_REMOTE_ID;
if (remoteId !== undefined) {
    const opened = performance.now();
    await page
        .locator("button[data-connection-id=" + JSON.stringify("connection:" + remoteId) + "]")
        .click();
    await page
        .getByRole("button")
        .filter({ hasText: DIRECT_SESSIONS[0]! })
        .first()
        .waitFor({ timeout: 30_000 });
    console.log("remote sidebar after " + String(Math.round(performance.now() - opened)) + " ms");
    for (const title of DIRECT_SESSIONS) {
        const measured = await measure("switch-remote", page, cdp, requests, async () => {
            const result = await switchTo(page, title, undefined, 0);
            await page.waitForTimeout(600);
            return result;
        });
        switches.push({ pass: "remote", ...measured.value, ...measured.window.result });
    }
    await page.locator("button[data-local]").click();
    await page
        .getByRole("button")
        .filter({ hasText: SWITCH_SESSIONS[0]! })
        .first()
        .waitFor({ timeout: 30_000 });
}

for (const title of PALETTE_SESSIONS) {
    const measured = await measure("switch-palette", page, cdp, requests, async () => {
        const result = await paletteSwitchTo(page, title, PALETTE_DWELL_MS);
        await page.waitForTimeout(600);
        return result;
    });
    switches.push({ pass: "palette", ...measured.value, ...measured.window.result });
}

// Another session streams a replayed real run while an idle heavy session is on screen.
const replayed = await writeReplay(STREAM_TARGET.agentId, STREAM_SOURCE);
await switchTo(page, IDLE_VIEW);
await page.waitForTimeout(1000);
const background = await measure("background-stream", page, cdp, requests, async () => {
    await sendReplay(STREAM_TARGET.agentId);
    await page.waitForTimeout(streamMs);
});
windows.push({
    name: "background-stream",
    result: { ...background.window.result, inferences: replayed },
});
await waitIdle(STREAM_TARGET.agentId, 120_000);

// The same replay streaming in the session on screen.
await writeReplay(STREAM_TARGET.agentId, STREAM_SOURCE);
await switchTo(page, STREAM_TARGET.title);
await page.waitForTimeout(1000);
const foreground = await measure("foreground-stream", page, cdp, requests, async () => {
    await sendReplay(STREAM_TARGET.agentId);
    await page.waitForTimeout(streamMs);
});
windows.push({ name: "foreground-stream", result: foreground.window.result });
await waitIdle(STREAM_TARGET.agentId, 120_000);

// Idle: nothing happens; the app should do nothing.
const idle = await measure(
    "idle",
    page,
    cdp,
    requests,
    async () => await page.waitForTimeout(5000),
);
windows.push({ name: "idle", result: idle.window.result });

// Stress: several real sessions stream at once, sibling subagents of one parent among them, while the
// reader keeps switching between sessions, streaming ones included.
const stressReplays = await Promise.all(
    STRESS_STREAMS.map(async (target) => await writeReplay(target.agentId, STREAM_SOURCE)),
);
await trySwitch(page, IDLE_VIEW);
await page.waitForTimeout(1000);
const stressSwitches: Record<string, unknown>[] = [];
const stress = await measure("stress", page, cdp, requests, async () => {
    await Promise.all(STRESS_STREAMS.map(async (target) => await sendReplay(target.agentId)));
    const titles = [...SWITCH_SESSIONS, ...STRESS_STREAMS.map((target) => target.title)];
    const deadline = performance.now() + streamMs;
    for (let index = 0; performance.now() < deadline; index += 1) {
        const title = titles[index % titles.length]!;
        // Coming back to a session that kept streaming is timed until it shows what it had streamed.
        const streaming = STRESS_STREAMS.find((target) => target.title === title);
        const switched = await trySwitch(page, title, streaming?.agentId);
        if (switched !== undefined)
            stressSwitches.push({ ...switched, streaming: streaming !== undefined });
        await page.waitForTimeout(STRESS_DWELL_MS);
    }
});
windows.push({
    name: "stress",
    result: {
        ...stress.window.result,
        ...switchStats(stressSwitches),
        ...catchUpStats(stressSwitches.filter((s) => s.streaming === true)),
        switchLog: stressSwitches.map(
            (s) =>
                `${String(s.title)} ${String(s.switchMs)}ms spinner ${String(s.spinnerMs)}ms${s.streaming === true ? ` fresh ${String(s.freshMs)}ms` : ""}`,
        ) as never,
        streams: STRESS_STREAMS.length,
        inferences: stressReplays.reduce((a, b) => a + b, 0),
    },
});
await Promise.all(STRESS_STREAMS.map(async (target) => await waitIdle(target.agentId, 120_000)));

// First response: the reader types into the real composer and presses Enter. Timed from the key
// press until their message is on screen, and until the first words of the reply are, repeatedly.
const firstResponses: Record<string, number | null>[] = [];
await trySwitch(page, STREAM_TARGET.title);
await page.waitForTimeout(1000);
const responding = await measure("first-response", page, cdp, requests, async () => {
    for (let index = 0; index < FIRST_RESPONSES; index += 1) {
        const marker = `Reply marker ${String(index)} ${String(Date.now() % 100000)} begins here`;
        await writeFile(
            join(scratch, "replay", `${STREAM_TARGET.agentId}.json`),
            JSON.stringify({
                inferences: [
                    {
                        blocks: [
                            {
                                text: `${marker}. The rest of a short answer follows.`,
                                type: "text",
                            },
                        ],
                    },
                ],
                chunk: 400,
                delayMs: 0,
            }),
        );
        const prompt = `Perf prompt ${String(index)} ${String(Date.now() % 100000)}`;
        const composer = page
            .locator('[data-happy-desktop-ui="composer-textarea"]:visible')
            .first();
        await composer.click();
        await composer.fill(prompt);
        firstResponses.push(await timeFirstResponse(page, prompt, marker));
        await waitIdle(STREAM_TARGET.agentId, 60_000);
        await page.waitForTimeout(500);
    }
});
const timesOf = (key: string) =>
    firstResponses
        .map((r) => r[key])
        .filter((v): v is number => v !== null && v !== undefined)
        .sort((a, b) => a - b);
windows.push({
    name: "first-response",
    result: {
        ...responding.window.result,
        sends: firstResponses.length,
        echoMedianMs: timesOf("echoMs")[Math.floor(timesOf("echoMs").length / 2)],
        echoMaxMs: timesOf("echoMs").at(-1),
        firstTokenMedianMs: timesOf("firstTokenMs")[Math.floor(timesOf("firstTokenMs").length / 2)],
        firstTokenMaxMs: timesOf("firstTokenMs").at(-1),
        sendLog: firstResponses.map(
            (r) => `echo ${String(r.echoMs)}ms first words ${String(r.firstTokenMs)}ms`,
        ) as never,
    },
});

// Typing: the reader writes into the composer while six sessions stream, first with a quiet session on
// screen and then with one of the streaming sessions on screen. Every keystroke is timed until the next
// frame after it, and the composer must end up holding exactly what was typed.
await Promise.all(
    STRESS_STREAMS.map(async (target) => await writeReplay(target.agentId, STREAM_SOURCE)),
);
await trySwitch(page, IDLE_VIEW);
await page.waitForTimeout(1000);
const typings: Record<string, unknown>[] = [];
const typing = await measure("typing-stream", page, cdp, requests, async () => {
    await Promise.all(STRESS_STREAMS.map(async (target) => await sendReplay(target.agentId)));
    await page.waitForTimeout(1500);
    typings.push({ view: "quiet", ...(await timeTyping(page, TYPED_TEXT)) });
    await trySwitch(page, STREAM_TARGET.title, STREAM_TARGET.agentId);
    await page.waitForTimeout(500);
    typings.push({ view: "streaming", ...(await timeTyping(page, TYPED_TEXT)) });
});
windows.push({
    name: "typing-stream",
    result: { ...typing.window.result, typings: typings as never },
});
await Promise.all(STRESS_STREAMS.map(async (target) => await waitIdle(target.agentId, 120_000)));

// Rapid sends: the reader sends a message into one session after another without waiting for any reply,
// then a second round into the same sessions while their replies stream. Each message must show at once,
// land exactly once in its own session, and leave no draft behind in the next composer.
// Only sessions the sidebar shows right now (a collapsed subtask has no row to press): the streaming
// ones, then the heavy top-level ones, each known by the agent its own row opens.
const rapidTargets: { readonly agentId: string; readonly title: string }[] = [];
for (const target of STRESS_STREAMS) {
    if (
        rapidTargets.length < RAPID_SESSIONS &&
        (await sessionRows(page, target.title, target.agentId).count()) > 0
    )
        rapidTargets.push(target);
}
for (const title of SWITCH_SESSIONS) {
    if (rapidTargets.length >= RAPID_SESSIONS) break;
    for (const itemId of await sessionRows(page, title).evaluateAll((rows) =>
        rows.map((row) => row.closest("[data-item-id]")?.getAttribute("data-item-id") ?? ""),
    )) {
        const agentId = itemId.split("/").at(-1) ?? "";
        const found = await daemon<{ agent: { title: string | null } }>(
            "GET",
            `/v0/agents/${agentId}`,
        ).catch(() => undefined);
        if (
            found?.agent.title !== title ||
            rapidTargets.some((target) => target.agentId === agentId)
        )
            continue;
        // The gym serves only the replayed provider; a session set to another is refused.
        const { mode } = await daemon<{ mode: { providerId: string } | null }>(
            "GET",
            `/v0/agents/${agentId}/bootstrap`,
        );
        if (mode !== null && mode.providerId !== "claude") continue;
        rapidTargets.push({ agentId, title });
        break;
    }
}
const rapidRun = Date.now() % 100000;
for (const [index, target] of rapidTargets.entries()) {
    const reply = (round: string) => ({
        blocks: [
            {
                text: `Rapid reply ${round}${String(index)} ${String(rapidRun)} begins. ${"A sentence of the reply streaming in. ".repeat(30)}`,
                type: "text",
            },
        ],
    });
    await writeFile(
        join(scratch, "replay", `${target.agentId}.json`),
        JSON.stringify({ inferences: [reply("A"), reply("B")], chunk: 12, delayMs: 20 }),
    );
}
const rapidSends: Record<string, unknown>[] = [];
const rapid = await measure("rapid-sends", page, cdp, requests, async () => {
    for (const round of ["A", "B"]) {
        for (const [index, target] of rapidTargets.entries()) {
            await switchTo(page, target.title, undefined, 0, target.agentId);
            const composer = page
                .locator('[data-happy-desktop-ui="composer-textarea"]:visible')
                .first();
            const leftover = await composer.inputValue();
            await composer.click();
            const prompt = `Rapid prompt ${round}${String(index)} ${String(rapidRun)}`;
            await page.keyboard.type(prompt, { delay: 15 });
            const sent = await timeEcho(page, prompt);
            rapidSends.push({
                round,
                title: target.title,
                leftover: leftover.length,
                cleared: (await composer.inputValue()).length === 0,
                ...sent,
            });
        }
    }
});
await Promise.all(rapidTargets.map(async (target) => await waitIdle(target.agentId, 120_000)));
await page.waitForTimeout(1000);
const rapidChecks: Record<string, unknown>[] = [];
for (const [index, target] of rapidTargets.entries()) {
    const history = await daemon<{ runs: { messages: { role: string; content: unknown[] }[] }[] }>(
        "GET",
        `/v0/agents/${target.agentId}/messages?limit=6&omitToolData=true`,
    );
    const users = history.runs
        .flatMap((run) => run.messages)
        .filter((message) => message.role === "user")
        .map((message) => JSON.stringify(message.content));
    await switchTo(page, target.title, undefined, 0, target.agentId);
    await page.waitForTimeout(300);
    const shown = await visibleConversationText(page);
    for (const round of ["A", "B"]) {
        const prompt = `Rapid prompt ${round}${String(index)} ${String(rapidRun)}`;
        rapidChecks.push({
            prompt,
            stored: users.filter((text) => text.includes(prompt)).length,
            shown: shown.split(prompt).length - 1,
            replyShown: shown.includes(`Rapid reply ${round}${String(index)} ${String(rapidRun)}`),
        });
    }
}
const echoTimes = rapidSends
    .map((s) => s.echoMs)
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b);
windows.push({
    name: "rapid-sends",
    result: {
        ...rapid.window.result,
        sends: rapidSends.length,
        echoMedianMs: echoTimes[Math.floor(echoTimes.length / 2)],
        echoMaxMs: echoTimes.at(-1),
        echoMissing: rapidSends.filter((s) => s.echoMs === null).length,
        draftLeftovers: rapidSends.filter((s) => Number(s.leftover) > 0).length,
        notCleared: rapidSends.filter((s) => s.cleared !== true).length,
        lost: rapidChecks.filter((c) => c.stored === 0).length,
        duplicated: rapidChecks.filter((c) => Number(c.stored) > 1 || Number(c.shown) > 1).length,
        notShown: rapidChecks.filter((c) => c.shown === 0).length,
        repliesNotShown: rapidChecks.filter((c) => c.replyShown !== true).length,
        sendLog: rapidSends.map(
            (s) => `${String(s.round)} ${String(s.title)} echo ${String(s.echoMs)}ms`,
        ) as never,
        checks: rapidChecks.map(
            (c) =>
                `${String(c.prompt)} stored ${String(c.stored)} shown ${String(c.shown)} reply ${String(c.replyShown)}`,
        ) as never,
    },
});

// Scroll: the reader flicks up through the largest session's history, page after page, then drags the
// scrollbar thumb from the bottom to the top. Timed: how long they sit at the top waiting for the page
// before, frames slower than two refreshes, and how far each scrollbar move lags its pointer.
await trySwitch(page, IDLE_VIEW);
await page.waitForTimeout(1500);
const scrolling = await measure("scroll-large", page, cdp, requests, async () => {
    await page.evaluate(String.raw`(() => {
        const viewport = [...document.querySelectorAll('[data-happy-desktop-ui="message-list"] .happy-message-list__viewport')].find((e) => e.checkVisibility());
        const s = { waits: [], waitAt: undefined, waitHeight: 0, slowFrames: 0, frames: 0, last: performance.now(), lags: [], moveAt: undefined, stop: false };
        window.__scroll = s;
        viewport.addEventListener("scroll", () => {
            if (s.waitAt === undefined && viewport.scrollTop <= 64) { s.waitAt = performance.now(); s.waitHeight = viewport.scrollHeight; }
            if (s.moveAt !== undefined) { const at = s.moveAt; s.moveAt = undefined; requestAnimationFrame(() => s.lags.push(performance.now() - at)); }
        }, { passive: true });
        document.addEventListener("pointermove", (event) => { if (event.buttons === 1) s.moveAt = event.timeStamp; }, { capture: true });
        const frame = () => {
            const now = performance.now();
            s.frames += 1;
            if (now - s.last > 34) s.slowFrames += 1;
            s.last = now;
            if (s.waitAt !== undefined && viewport.scrollHeight > s.waitHeight) { s.waits.push(now - s.waitAt); s.waitAt = undefined; }
            if (!s.stop) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    })()`);
    const list = page.locator('[data-happy-desktop-ui="message-list"]:visible').first();
    const box = (await list.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // A fast reader's flick: a wheel notch every frame for several seconds.
    for (let step = 0; step < SCROLL_STEPS; step += 1) {
        await page.mouse.wheel(0, -SCROLL_DELTA);
        await page.waitForTimeout(16);
    }
    await page.waitForTimeout(1500);
    const flick = (await page.evaluate(
        String.raw`(() => { const s = window.__scroll; const r = { waits: [...s.waits], stuck: s.waitAt === undefined ? 0 : performance.now() - s.waitAt, slowFrames: s.slowFrames, frames: s.frames }; s.slowFrames = 0; s.frames = 0; return r; })()`,
    )) as { waits: number[]; stuck: number; slowFrames: number; frames: number };
    // Drag the thumb from the bottom of the track to the top.
    await page.evaluate(
        String.raw`(() => { const v = [...document.querySelectorAll('[data-happy-desktop-ui="message-list"] .happy-message-list__viewport')].find((e) => e.checkVisibility()); v.scrollTop = v.scrollHeight; })()`,
    );
    await page.waitForTimeout(500);
    await list.hover();
    await page.mouse.wheel(0, -SCROLL_DELTA);
    await page.waitForTimeout(100);
    // The bar is the scrollport's native one: its thumb is where the scroll offset puts it.
    const thumbBox = (await page.evaluate(
        String.raw`(() => { const v = [...document.querySelectorAll('[data-happy-desktop-ui="message-list"] .happy-message-list__viewport')].find((e) => e.checkVisibility()); const r = v.getBoundingClientRect(); const width = v.offsetWidth - v.clientWidth; if (width <= 0 || v.scrollHeight <= v.clientHeight) return null; const height = Math.max(24, (v.clientHeight * v.clientHeight) / v.scrollHeight); return { x: r.left + v.clientWidth, y: r.top + ((v.clientHeight - height) * v.scrollTop) / (v.scrollHeight - v.clientHeight), width, height }; })()`,
    )) as { x: number; y: number; width: number; height: number } | null;
    let drag: { lags: number[]; slowFrames: number; frames: number } | undefined;
    if (thumbBox !== null && thumbBox.height > 0) {
        const x = thumbBox.x + thumbBox.width / 2;
        await page.mouse.move(x, thumbBox.y + thumbBox.height / 2);
        await page.mouse.down();
        for (let y = thumbBox.y + thumbBox.height / 2; y > box.y; y -= 8) {
            await page.mouse.move(x, y);
            await page.waitForTimeout(16);
        }
        await page.mouse.up();
        await page.waitForTimeout(500);
        drag = (await page.evaluate(
            String.raw`(() => { const s = window.__scroll; s.stop = true; return { lags: s.lags, slowFrames: s.slowFrames, frames: s.frames }; })()`,
        )) as typeof drag;
    }
    const pct = (values: number[], q: number) =>
        Math.round(
            [...values].sort((a, b) => a - b)[
                Math.min(values.length - 1, Math.floor(q * values.length))
            ] ?? 0,
        );
    return {
        pageWaits: flick.waits.length,
        pageWaitMedianMs: pct(flick.waits, 0.5),
        pageWaitMaxMs: Math.round(Math.max(0, ...flick.waits)),
        stuckAtTopMs: Math.round(flick.stuck),
        flickSlowFrames: flick.slowFrames,
        flickFrames: flick.frames,
        dragMoves: drag?.lags.length ?? 0,
        dragLagMedianMs: drag === undefined ? null : pct(drag.lags, 0.5),
        dragLagP95Ms: drag === undefined ? null : pct(drag.lags, 0.95),
        dragSlowFrames: drag?.slowFrames ?? null,
    };
});
windows.push({ name: "scroll-large", result: { ...scrolling.window.result, ...scrolling.value } });

// Return: one session streams slowly for a long time while the reader looks elsewhere, then comes
// back mid-stream, again and again. The transcript should be current the moment it is on screen.
const returnSwitches: Record<string, unknown>[] = [];
const returnRun = await writeReplay(STREAM_TARGET.agentId, STREAM_SOURCE, {
    chunk: 1,
    delayMs: 40,
});
await trySwitch(page, STREAM_TARGET.title);
await page.waitForTimeout(1000);
const returning = await measure("return", page, cdp, requests, async () => {
    await sendReplay(STREAM_TARGET.agentId);
    await page.waitForTimeout(1500);
    for (let index = 0; index < RETURNS; index += 1) {
        await trySwitch(page, IDLE_VIEW);
        await page.waitForTimeout(RETURN_AWAY_MS);
        const back = await trySwitch(page, STREAM_TARGET.title, STREAM_TARGET.agentId);
        if (back !== undefined) returnSwitches.push({ ...back, streaming: true });
        await page.waitForTimeout(500);
    }
    // The slow replay outlasts the window; stop it rather than wait it out.
    await daemon("POST", `/v0/agents/${STREAM_TARGET.agentId}/abort`, {});
});
windows.push({
    name: "return",
    result: {
        ...returning.window.result,
        ...switchStats(returnSwitches),
        ...catchUpStats(returnSwitches),
        historyReads: returnSwitches.reduce((total, s) => total + Number(s.historyReads ?? 0), 0),
        switchLog: returnSwitches.map(
            (s) =>
                `${String(s.title)} ${String(s.switchMs)}ms fresh ${String(s.freshMs)}ms reads ${String(s.historyReads)}`,
        ) as never,
        inferences: returnRun,
    },
});
await waitIdle(STREAM_TARGET.agentId, 300_000);

// Reload: under streaming load the daemon drains, shuts down, and a new process starts over the same
// data. Draining waits on agents and is reported apart; every later phase is the product's own cost.
const daemonStart = process.env.PERF_DAEMON_START;
if (daemonStart !== undefined) {
    const reloadStreams = STRESS_STREAMS.slice(0, 4);
    await Promise.all(
        reloadStreams.map(async (target) => await writeReplay(target.agentId, STREAM_SOURCE)),
    );
    await trySwitch(page, STREAM_TARGET.title);
    await page.waitForTimeout(1000);
    await Promise.all(reloadStreams.map(async (target) => await sendReplay(target.agentId)));
    await page.waitForTimeout(3000);
    const reload = await measure(
        "reload",
        page,
        cdp,
        requests,
        async () => await reloadDaemon(daemonStart),
    );
    windows.push({ name: "reload", result: { ...reload.window.result, ...reload.value } });
}

// PERF_HEAP_SNAPSHOT=1 keeps the page's heap after the last window, for perf/detachedRetainers.ts.
if (process.env.PERF_HEAP_SNAPSHOT === "1") {
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    const chunks: string[] = [];
    cdp.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) => chunks.push(chunk));
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
    await writeFile(join(scratch, `${label}.heapsnapshot`), chunks.join(""));
}
await context.close();

const summary = (pass: string) => {
    const rows = switches.filter((s) => s.pass === pass);
    const times = rows
        .map((s) => s.switchMs as number)
        .filter((t) => t !== null)
        .sort((a, b) => a - b);
    const sum = (key: string) => rows.reduce((total, s) => total + ((s[key] as number) ?? 0), 0);
    return {
        switchMedianMs: times[Math.floor(times.length / 2)],
        switchMaxMs: times.at(-1),
        switchTotalMs: times.reduce((a, b) => a + b, 0),
        spinners: rows.filter((s) => s.spinner).length,
        spinnerTotalMs: sum("spinnerMs"),
        reactRenders: sum("reactRenders"),
        cpuScriptMs: Math.round(sum("cpuScriptMs")),
        longTaskMs: Math.round(sum("longTaskMs")),
        requestKB: sum("requestKB"),
        daemonCpuMs: sum("daemonCpuMs"),
    };
};
const results = {
    label,
    at: new Date().toISOString(),
    summary: {
        cold: summary("cold"),
        warm: summary("warm"),
        palette: summary("palette"),
        direct: summary("direct"),
        remote: summary("remote"),
    },
    windows,
    switches,
};
await writeFile(env("PERF_OUT"), JSON.stringify(results, null, 2));

const line = (name: string, r: Record<string, unknown>) =>
    `${name.padEnd(22)} wall ${String(r.wallMs).padStart(6)} | commits ${String(r.reactCommits).padStart(5)} renders ${String(r.reactRenders).padStart(7)} | script ${String(r.cpuScriptMs).padStart(7)}ms layout ${String(r.cpuLayoutMs).padStart(6)}ms style ${String(r.cpuStyleMs).padStart(6)}ms | longtask ${String(r.longTaskMs).padStart(6)}ms | heap ${String(r.heapMB)}MB nodes ${String(r.domNodes)} | req ${String(r.requests)} ${String(r.requestKB)}KB | daemon ${String(r.daemonCpuMs)}ms`;
console.log(`== ${label}`);
console.log("cold", JSON.stringify(results.summary.cold));
console.log("warm", JSON.stringify(results.summary.warm));
console.log("palette", JSON.stringify(results.summary.palette));
console.log("direct", JSON.stringify(results.summary.direct));
for (const s of switches)
    console.log(
        `${String(s.pass).padEnd(5)} ${String(s.title).padEnd(26)} switch ${String(s.switchMs).padStart(5)}ms spinner ${String(s.spinnerMs).padStart(5)}ms | ${line("", s)}`,
    );
for (const w of windows) console.log(line(w.name, w.result));
for (const w of windows)
    console.log(
        `${w.name} top: ${JSON.stringify(w.result.topComponents)}\n${w.name} origins: ${JSON.stringify(w.result.updateOrigins)}`,
    );
