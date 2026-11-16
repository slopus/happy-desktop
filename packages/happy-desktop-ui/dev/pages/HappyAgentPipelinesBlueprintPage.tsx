import type {
    PipelineLogEntry,
    PipelineNodeLogSnapshot,
    PipelineNodeRun,
    PipelineRun,
    PipelineRunEntry,
    PipelineRunRelative,
    PipelineRunListEntry,
    PipelineRunSnapshot,
    PipelineDefinition,
    PipelineNode,
    PipelinePermissions,
    PipelineSnapshot,
    PipelinesSnapshot,
    PipelineVersion,
} from "happy-desktop-state";
import { HappyAgentPipelinePage } from "../../src/pages/pipelines/HappyAgentPipelinePage";
import { HappyAgentPipelineRunPage } from "../../src/pages/pipelines/HappyAgentPipelineRunPage";
import { HappyAgentPipelinesPage } from "../../src/pages/pipelines/HappyAgentPipelinesPage";
import type { PipelineLabels } from "../../src/pages/pipelines/pipelinePresentation";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-047";

const WINDOW = { width: 1100, height: 760 } as const;

const MINUTE = 60_000;
const NOW = Date.UTC(2026, 10, 14, 15, 0);

/** Fixed, so the specimens never depend on the clock. */
const labels: PipelineLabels = {
    time: (at) => {
        const minutes = Math.round((NOW - at) / MINUTE);
        if (minutes < 60) return `${String(minutes)} min ago`;
        if (minutes < 60 * 24) return `${String(Math.round(minutes / 60))} h ago`;
        return `${String(Math.round(minutes / 60 / 24))} d ago`;
    },
    author: (author) =>
        author === null ? "Unknown" : author.kind === "agent" ? "Release bot" : "Steve",
    pipeline: (id) =>
        ({
            pl_notify: "Notify team",
            pl_ci: "Desktop CI",
            pl_ship: "Ship",
            pl_deploy: "Deploy",
            pl_index: "Search index",
        })[id] ?? id,
    agent: () => "Release bot",
};

const none: PipelinePermissions = {
    tools: [],
    vaults: [],
    secrets: [],
    repositories: [],
    agents: [],
    pipelines: [],
    egressHosts: [],
    compute: null,
};

const shared = {
    input: null,
    output: null,
    permissions: null,
    compute: null,
    timeoutSeconds: 3600,
    join: "all" as const,
};

const checkout: PipelineNode = {
    ...shared,
    id: "checkout",
    kind: "code",
    input: {
        type: "object",
        nullable: false,
        properties: [
            {
                name: "sha",
                schema: { type: "string", nullable: false, values: null },
                required: true,
            },
        ],
    },
    output: {
        type: "object",
        nullable: false,
        properties: [
            {
                name: "dir",
                schema: { type: "string", nullable: false, values: null },
                required: true,
            },
        ],
    },
    permissions: { ...none, repositories: [{ id: "repo_happy", access: "read" }] },
    compute: { acquire: [{ name: "box", pool: "pool_ci" }], use: [], pass: ["box"] },
    timeoutSeconds: 600,
    source: "def main(input):\n    status('cloning', 0.1)\n    git.clone('repo_happy', sha=input['sha'], into='src')\n    status('installing', 0.6)\n    sh('pnpm install --frozen-lockfile', cwd='src')\n    return {'dir': 'src'}\n",
};

const unit: PipelineNode = {
    ...shared,
    id: "unit",
    kind: "code",
    compute: { acquire: [], use: ["box"], pass: ["box"] },
    timeoutSeconds: 1800,
    source: "def main(input):\n    status('running unit tests')\n    sh('pnpm test', cwd=input['dir'])\n    return {'passed': True}\n",
};

const e2e: PipelineNode = {
    ...shared,
    id: "e2e",
    kind: "agent",
    compute: { acquire: [], use: ["box"], pass: ["box"] },
    permissions: { ...none, tools: ["web_fetch"], egressHosts: ["staging.happy.engineering"] },
    model: "anthropic/opus-5-5",
    effort: "medium",
    instructions:
        "Run the end-to-end suite against staging. If a test fails, read its trace, decide whether it is flaky or a real regression, and report which with the failing test names.",
};

const release: PipelineNode = {
    ...shared,
    id: "release",
    kind: "code",
    compute: { acquire: [], use: ["box"], pass: [] },
    permissions: {
        ...none,
        secrets: ["sec_npm_token"],
        repositories: [{ id: "repo_happy", access: "write" }],
    },
    source: "def main(input):\n    status('publishing')\n    sh('pnpm release', cwd='src')\n    return {'version': read('src/VERSION')}\n",
};

const notify: PipelineNode = {
    ...shared,
    id: "notify",
    kind: "pipeline",
    join: "any",
    input: {
        type: "object",
        nullable: false,
        properties: [
            {
                name: "node",
                schema: { type: "string", nullable: false, values: null },
                required: true,
            },
            {
                name: "code",
                schema: { type: "string", nullable: false, values: null },
                required: true,
            },
            {
                name: "message",
                schema: { type: "string", nullable: false, values: null },
                required: true,
            },
        ],
    },
    pipelineId: "pl_notify",
};

const ci: PipelineDefinition = {
    input: {
        type: "object",
        nullable: false,
        properties: [
            {
                name: "sha",
                schema: { type: "string", nullable: false, values: null },
                required: true,
            },
            {
                name: "branch",
                schema: { type: "string", nullable: false, values: null },
                required: true,
            },
            {
                name: "channel",
                schema: { type: "string", nullable: true, values: ["preview", "stable"] },
                required: false,
            },
        ],
    },
    concurrency: { group: "{{input.branch}}", mode: "supersede", batch: false },
    triggerAgents: ["Release bot"],
    permissions: {
        ...none,
        tools: ["web_fetch"],
        secrets: ["sec_npm_token"],
        repositories: [{ id: "repo_happy", access: "write" }],
        pipelines: ["pl_notify"],
        egressHosts: ["staging.happy.engineering"],
        compute: { pools: ["pool_ci"], computers: [], maxLeases: 1 },
    },
    root: "checkout",
    nodes: [checkout, unit, e2e, release, notify],
    edges: [
        { from: "checkout", on: "success", to: "unit" },
        { from: "checkout", on: "success", to: "e2e" },
        { from: "unit", on: "success", to: "release" },
        { from: "e2e", on: "success", to: "release" },
        { from: "unit", on: "failure", to: "notify" },
        { from: "e2e", on: "failure", to: "notify" },
        { from: "checkout", on: "failure", to: "notify" },
    ],
};

/** Version 2: before end-to-end tests joined the graph. */
const ciV2: PipelineDefinition = {
    ...ci,
    nodes: [checkout, unit, release, notify],
    edges: [
        { from: "checkout", on: "success", to: "unit" },
        { from: "unit", on: "success", to: "release" },
        { from: "unit", on: "failure", to: "notify" },
    ],
};

const versions: PipelineVersion[] = [
    {
        number: 4,
        digest: "d4",
        parent: 3,
        message: "Fail over to notify when checkout fails",
        author: { kind: "agent", agentId: "a1", userId: null },
        createdAt: NOW - 40 * MINUTE,
    },
    {
        number: 3,
        digest: "d3",
        parent: 2,
        message: "Run the end-to-end suite beside unit tests and release only when both pass",
        author: { kind: "agent", agentId: "a1", userId: null },
        createdAt: NOW - 26 * 60 * MINUTE,
    },
    {
        number: 2,
        digest: "d2",
        parent: 1,
        message: "Notify the team when unit tests fail",
        author: { kind: "user", userId: "u1" },
        createdAt: NOW - 3 * 24 * 60 * MINUTE,
    },
    {
        number: 1,
        digest: "d1",
        parent: null,
        message: "Checkout, test, release",
        author: { kind: "user", userId: "u1" },
        createdAt: NOW - 5 * 24 * 60 * MINUTE,
    },
];

const runEntry = (
    id: string,
    state: PipelineRunEntry["state"],
    ago: number,
    took: number | null,
    version = 4,
): PipelineRunEntry => ({
    id,
    version,
    state,
    trigger: { kind: "agent", agentId: "a1" },
    parentRunId: null,
    createdAt: NOW - ago * MINUTE,
    startedAt: NOW - ago * MINUTE,
    endedAt: took === null ? null : NOW - (ago - took) * MINUTE,
});

const runEntries: PipelineRunEntry[] = [
    runEntry("run_7", "running", 3, null),
    runEntry("run_6", "failed", 52, 9),
    runEntry("run_5", "superseded", 70, 4),
    runEntry("run_4", "succeeded", 26 * 60, 14, 3),
    runEntry("run_3", "aborted", 28 * 60, 2, 3),
    runEntry("run_2", "succeeded", 3 * 24 * 60, 11, 2),
];

const pipelineSnapshot: PipelineSnapshot = {
    loading: false,
    missing: false,
    pipeline: {
        id: "pl_ci",
        name: "Desktop CI",
        description:
            "Builds, tests and releases Happy for desktop on every push to main or a release branch.",
        enabled: true,
        head: versions[0]!,
    },
    versions,
    versionSelected: null,
    definitions: new Map([
        [4, { state: "loaded", definition: ci }],
        [2, { state: "loaded", definition: ciV2 }],
    ]),
    nodeSelected: null,
    runs: { loading: false, entries: runEntries, nextCursor: "c1", loadingMore: false },
};

const nodeRun = (
    nodeId: string,
    kind: PipelineNodeRun["kind"],
    state: PipelineNodeRun["state"],
    extra: Partial<PipelineNodeRun> = {},
): PipelineNodeRun => ({
    nodeId,
    kind,
    state,
    status: null,
    statuses: [],
    input: null,
    output: null,
    failure: null,
    agentId: null,
    childRunId: null,
    startedAt: null,
    endedAt: null,
    usage: null,
    ...extra,
});

const statuses = (texts: readonly (readonly [string, number | null, number])[]) =>
    texts.map(([text, progress, ago]) => ({ text, progress, at: NOW - ago * MINUTE }));

const liveRun: PipelineRun = {
    ...runEntries[0]!,
    pipelineId: "pl_ci",
    rootRunId: "run_7",
    group: "main",
    input: { sha: "9f2c1e7", branch: "main", channel: "preview" },
    result: null,
    nodes: [
        nodeRun("checkout", "code", "succeeded", {
            status: statuses([["installed dependencies", 1, 1]])[0]!,
            statuses: statuses([
                ["cloning", 0.1, 3],
                ["installing", 0.6, 2],
                ["installed dependencies", 1, 1],
            ]),
            input: { sha: "9f2c1e7", branch: "main", channel: "preview" },
            output: { dir: "src" },
            startedAt: NOW - 3 * MINUTE,
            endedAt: NOW - 1 * MINUTE,
        }),
        nodeRun("unit", "code", "running", {
            status: statuses([["412 of 980 tests", 0.42, 0]])[0]!,
            statuses: statuses([
                ["starting vitest", null, 1],
                ["412 of 980 tests", 0.42, 0],
            ]),
            input: { dir: "src" },
            startedAt: NOW - 1 * MINUTE,
        }),
        nodeRun("e2e", "agent", "running", {
            status: statuses([["reading the trace of settings.spec.ts", null, 0]])[0]!,
            statuses: statuses([
                ["booting the browser", null, 1],
                ["reading the trace of settings.spec.ts", null, 0],
            ]),
            input: { dir: "src" },
            agentId: "agent_e2e",
            startedAt: NOW - 1 * MINUTE,
            usage: [
                {
                    provider: "anthropic",
                    model: "anthropic/opus-5-5",
                    input: 48_210,
                    output: 3_904,
                    cacheRead: 212_480,
                    cacheWrite: 18_032,
                    reasoning: 0,
                    costUsd: 0.4187,
                },
            ],
        }),
        nodeRun("release", "code", "pending"),
        nodeRun("notify", "pipeline", "pending"),
    ],
    leases: [
        { name: "box", computerId: "ci-runner-04", holders: ["unit", "e2e"], releasedAt: null },
    ],
    childRunIds: [],
};

const failedRun: PipelineRun = {
    ...liveRun,
    ...runEntries[1]!,
    rootRunId: "run_6",
    result: { outputs: { notify: { delivered: true } } },
    nodes: [
        { ...liveRun.nodes[0]!, startedAt: NOW - 52 * MINUTE, endedAt: NOW - 50 * MINUTE },
        nodeRun("unit", "code", "failed", {
            failure: {
                code: "command_failed",
                message: "pnpm vitest run exited with 1: 3 tests failed in settings.spec.ts.",
            },
            statuses: statuses([
                ["starting vitest", null, 50],
                ["977 of 980 tests passed", 1, 46],
            ]),
            input: { dir: "src" },
            startedAt: NOW - 50 * MINUTE,
            endedAt: NOW - 46 * MINUTE,
        }),
        nodeRun("e2e", "agent", "succeeded", {
            status: statuses([["41 specs passed", 1, 45]])[0]!,
            statuses: statuses([
                ["booting the browser", null, 50],
                ["41 specs passed", 1, 45],
            ]),
            input: { dir: "src" },
            output: { flaky: [] },
            agentId: "agent_e2e",
            startedAt: NOW - 50 * MINUTE,
            endedAt: NOW - 45 * MINUTE,
        }),
        nodeRun("release", "code", "skipped"),
        nodeRun("notify", "pipeline", "succeeded", {
            childRunId: "run_notify_12",
            input: {
                node: "unit",
                code: "command_failed",
                message: "pnpm vitest run exited with 1",
            },
            output: { delivered: true },
            startedAt: NOW - 45 * MINUTE,
            endedAt: NOW - 44 * MINUTE,
        }),
    ],
    leases: [
        { name: "box", computerId: "ci-runner-04", holders: [], releasedAt: NOW - 44 * MINUTE },
    ],
    childRunIds: ["run_notify_12"],
};

const SECOND = 1_000;

/**
 * A wide release pipeline of 30 nodes, live: eight test shards and two
 * end-to-end suites fan out of the build, three platforms package, sign and
 * smoke-test, and release waits for all of it.
 */
const wideNode = (id: string, kind: PipelineNode["kind"] = "code", join: "all" | "any" = "all") =>
    kind === "agent"
        ? ({ ...e2e, id, join } as PipelineNode)
        : kind === "pipeline"
          ? ({ ...notify, id, join } as PipelineNode)
          : ({ ...unit, id, join } as PipelineNode);
const shards = Array.from({ length: 8 }, (_, index) => `test-${String(index + 1)}`);
const platforms = ["mac", "win", "linux"];
const wide: PipelineDefinition = {
    ...ci,
    root: "checkout",
    nodes: [
        wideNode("checkout"),
        wideNode("install"),
        wideNode("lint"),
        wideNode("typecheck"),
        wideNode("build"),
        ...shards.map((id) => wideNode(id)),
        wideNode("e2e-web", "agent"),
        wideNode("e2e-desktop", "agent"),
        wideNode("coverage"),
        ...platforms.flatMap((platform) => [
            wideNode(`package-${platform}`),
            wideNode(`sign-${platform}`),
            wideNode(`smoke-${platform}`),
        ]),
        wideNode("release"),
        wideNode("docs"),
        wideNode("changelog"),
        wideNode("announce", "agent"),
        wideNode("notify", "pipeline", "any"),
    ],
    edges: [
        { from: "checkout", on: "success", to: "install" },
        { from: "install", on: "success", to: "lint" },
        { from: "install", on: "success", to: "typecheck" },
        { from: "install", on: "success", to: "build" },
        ...shards.flatMap((id) => [
            { from: "build", on: "success", to: id } as const,
            { from: id, on: "success", to: "coverage" } as const,
        ]),
        { from: "build", on: "success", to: "e2e-web" },
        { from: "build", on: "success", to: "e2e-desktop" },
        ...platforms.flatMap((platform) => [
            { from: "build", on: "success", to: `package-${platform}` } as const,
            { from: `package-${platform}`, on: "success", to: `sign-${platform}` } as const,
            { from: `sign-${platform}`, on: "success", to: `smoke-${platform}` } as const,
            { from: `smoke-${platform}`, on: "success", to: "release" } as const,
        ]),
        { from: "lint", on: "success", to: "release" },
        { from: "typecheck", on: "success", to: "release" },
        { from: "coverage", on: "success", to: "release" },
        { from: "e2e-web", on: "success", to: "release" },
        { from: "e2e-desktop", on: "success", to: "release" },
        { from: "release", on: "success", to: "docs" },
        { from: "release", on: "success", to: "changelog" },
        { from: "changelog", on: "success", to: "announce" },
        { from: "build", on: "failure", to: "notify" },
        { from: "coverage", on: "failure", to: "notify" },
        { from: "e2e-web", on: "failure", to: "notify" },
        { from: "e2e-desktop", on: "failure", to: "notify" },
        { from: "release", on: "failure", to: "notify" },
    ],
};

/** Seconds before NOW each node started and, when it has, ended. */
const wideTimes: Record<string, readonly [number, number | null, string?]> = {
    checkout: [760, 742],
    install: [742, 700],
    lint: [700, 692],
    typecheck: [700, 676],
    build: [700, 560],
    "test-1": [560, 470],
    "test-2": [560, 455],
    "test-3": [560, 430],
    "test-4": [560, 402],
    "test-5": [560, 380],
    "test-6": [560, null, "shard 6 · 212 of 260"],
    "test-7": [560, null, "shard 7 · 190 of 248"],
    "test-8": [560, null, "shard 8 · 231 of 251"],
    "e2e-web": [560, 300],
    "e2e-desktop": [560, null, "replaying the settings flow"],
    "package-mac": [560, 330],
    "sign-mac": [330, null, "waiting for notarization"],
    "package-win": [560, null, "building the installer"],
    "package-linux": [560, 410],
    "sign-linux": [410, 395],
    "smoke-linux": [395, null, "launching on ubuntu-24.04"],
};
const wideRun: PipelineRun = {
    ...liveRun,
    id: "run_9",
    rootRunId: "run_9",
    createdAt: NOW - 760 * SECOND,
    startedAt: NOW - 760 * SECOND,
    leases: [],
    nodes: wide.nodes.map((node) => {
        const times = wideTimes[node.id];
        if (!times) return nodeRun(node.id, node.kind, "pending");
        const [start, end, status] = times;
        return nodeRun(node.id, node.kind, end === null ? "running" : "succeeded", {
            startedAt: NOW - start * SECOND,
            endedAt: end === null ? null : NOW - end * SECOND,
            status: status
                ? {
                      text: status,
                      progress: node.id.startsWith("test-") ? 0.8 : null,
                      at: NOW - 5 * SECOND,
                  }
                : null,
        });
    }),
};

/**
 * The cluster's own example: strict failed with no failure edge, so the run
 * failed and publish was skipped, while fallback, started by flaky's failure,
 * is still finishing.
 */
const checks: PipelineDefinition = {
    ...ci,
    root: "split",
    nodes: [
        { ...unit, id: "split" } as PipelineNode,
        { ...unit, id: "flaky" } as PipelineNode,
        { ...unit, id: "strict" } as PipelineNode,
        { ...unit, id: "fallback" } as PipelineNode,
        { ...unit, id: "publish" } as PipelineNode,
    ],
    edges: [
        { from: "split", on: "success", to: "flaky" },
        { from: "split", on: "success", to: "strict" },
        { from: "flaky", on: "failure", to: "fallback" },
        { from: "strict", on: "success", to: "publish" },
    ],
};
const traceback = (line: number, inMain: number, error: string) =>
    `Traceback (most recent call last):\n  File "<python-input-0>", line ${String(line)}, in <module>\n    _hc_result(_hc_json.dumps(main(_hc_json.loads("5"))))\n                              ~~~~~~~~~~~~~~~~~~~~~~~~~\n  File "<python-input-0>", line ${String(inMain)}, in main\n    ${error}`;
const finishingRun: PipelineRun = {
    ...liveRun,
    id: "run_11",
    rootRunId: "run_11",
    state: "failed",
    createdAt: NOW - 50 * SECOND,
    startedAt: NOW - 48 * SECOND,
    endedAt: null,
    leases: [],
    nodes: [
        nodeRun("fallback", "code", "running", {
            status: { text: "falling back", progress: null, at: NOW - 4 * SECOND },
            startedAt: NOW - 14 * SECOND,
        }),
        nodeRun("flaky", "code", "failed", {
            failure: {
                code: "exception",
                message: traceback(
                    6,
                    3,
                    "raise ValueError('flaky upstream')\nValueError: flaky upstream",
                ),
            },
            startedAt: NOW - 40 * SECOND,
            endedAt: NOW - 14 * SECOND,
        }),
        nodeRun("publish", "code", "skipped", { endedAt: NOW - 9 * SECOND }),
        nodeRun("split", "code", "succeeded", {
            startedAt: NOW - 48 * SECOND,
            endedAt: NOW - 40 * SECOND,
        }),
        nodeRun("strict", "code", "failed", {
            failure: {
                code: "exception",
                message: traceback(9, 5, "raise RuntimeError('too big')\nRuntimeError: too big"),
            },
            startedAt: NOW - 40 * SECOND,
            endedAt: NOW - 9 * SECOND,
        }),
    ],
};

/** A run whose Windows build lost its computer, and whose agent ended without an answer. */
const lostRun: PipelineRun = {
    ...wideRun,
    id: "run_12",
    rootRunId: "run_12",
    state: "failed",
    endedAt: NOW - MINUTE,
    nodes: ci.nodes.map((node) => {
        if (node.id === "checkout")
            return nodeRun("checkout", "code", "succeeded", {
                startedAt: NOW - 9 * MINUTE,
                endedAt: NOW - 6 * MINUTE,
            });
        if (node.id === "unit")
            return nodeRun("unit", "code", "failed", {
                failure: {
                    code: "compute_unavailable",
                    message:
                        "The computer ci-runner-07 (lease box) went offline for over 60 seconds while a command waited on it; it was not revoked.",
                },
                input: { dir: "src" },
                status: { text: "building the installer", progress: 0.2, at: NOW - 6 * MINUTE },
                statuses: [{ text: "building the installer", progress: 0.2, at: NOW - 6 * MINUTE }],
                startedAt: NOW - 6 * MINUTE,
                endedAt: NOW - MINUTE,
            });
        if (node.id === "e2e")
            return nodeRun("e2e", "agent", "failed", {
                failure: {
                    code: "no_output",
                    message: "The agent ended its turn twice without finish_node or fail_node.",
                },
                input: { dir: "src" },
                agentId: "agent_e2e",
                startedAt: NOW - 6 * MINUTE,
                endedAt: NOW - 2 * MINUTE,
                usage: [
                    {
                        provider: "anthropic",
                        model: "anthropic/opus-5-5",
                        input: 131_877,
                        output: 9_214,
                        cacheRead: 1_402_118,
                        cacheWrite: 61_550,
                        reasoning: 0,
                        costUsd: 1.9342,
                    },
                    {
                        provider: "openai",
                        model: "openai/gpt-5.2-mini",
                        input: 22_410,
                        output: 1_806,
                        cacheRead: 0,
                        cacheWrite: 0,
                        reasoning: 640,
                        costUsd: null,
                    },
                ],
            });
        if (node.id === "notify")
            return nodeRun("notify", "pipeline", "skipped", { endedAt: NOW - MINUTE });
        return nodeRun(node.id, node.kind, "skipped", { endedAt: NOW - MINUTE });
    }),
    leases: [{ name: "box", computerId: "ci-runner-07", holders: [], releasedAt: NOW - MINUTE }],
};

/** Triggers that arrived while the group was busy, gathered into one batch run. */
const batched: PipelineDefinition = {
    ...ci,
    concurrency: { group: "{{input.branch}}", mode: "queue", batch: true },
};
const batchRun: PipelineRun = {
    ...liveRun,
    id: "run_13",
    rootRunId: "run_13",
    input: [
        { sha: "9f2c1e7", branch: "main", channel: "preview" },
        { sha: "41b0d2a", branch: "main", channel: "preview" },
        { sha: "c07e9f3", branch: "main", channel: null },
    ],
};

/** One node, working. */
const single: PipelineDefinition = {
    ...ci,
    root: "checkout",
    nodes: [checkout],
    edges: [],
};
const singleRun: PipelineRun = {
    ...liveRun,
    id: "run_10",
    rootRunId: "run_10",
    createdAt: NOW - 40 * SECOND,
    startedAt: NOW - 40 * SECOND,
    leases: [],
    nodes: [
        nodeRun("checkout", "code", "running", {
            status: { text: "installing", progress: 0.6, at: NOW - 2 * SECOND },
            startedAt: NOW - 40 * SECOND,
        }),
    ],
};

/** Log entries numbered in order, each `at` seconds after `start`. */
function logOf(
    start: number,
    entries: readonly (
        | readonly [number, Omit<Extract<PipelineLogEntry, { kind: "output" }>, "seq" | "at">]
        | readonly [number, Omit<Extract<PipelineLogEntry, { kind: "command" }>, "seq" | "at">]
        | readonly [number, Omit<Extract<PipelineLogEntry, { kind: "tool" }>, "seq" | "at">]
        | readonly [number, Omit<Extract<PipelineLogEntry, { kind: "message" }>, "seq" | "at">]
        | readonly [number, Omit<Extract<PipelineLogEntry, { kind: "status" }>, "seq" | "at">]
    )[],
    watched: readonly number[] = [],
): PipelineNodeLogSnapshot {
    return {
        loading: false,
        dropped: 0,
        watched: new Set(watched),
        entries: entries.map(([after, entry], index) => ({
            ...entry,
            seq: index + 1,
            at: start + after * SECOND,
        })) as PipelineLogEntry[],
    };
}

const install = {
    kind: "command",
    id: "c1",
    command: "pnpm install --frozen-lockfile",
    cwd: "src",
    lease: "box",
    state: "exited",
    exitCode: 0,
    durationMs: 4_120,
    output: "Lockfile is up to date, resolution step is skipped\nPackages: +1184\nDone in 4.1s\n",
    outputTruncated: false,
} as const;

const dots = (count: number) =>
    Array.from(
        { length: count },
        (_, row) => `${String(row * 48 + 1).padStart(4)} ${"·".repeat(48)}`,
    ).join("\n");

/** A code node at work: a command that finished, and one still running. */
const unitLiveLog = logOf(NOW - MINUTE, [
    [0, { kind: "status", text: "starting vitest", progress: null }],
    [1, install],
    [6, { kind: "output", stream: "stdout", text: "Running 980 tests across 64 files\n" }],
    [
        7,
        {
            kind: "command",
            id: "c2",
            command: "pnpm vitest run --reporter=dot",
            cwd: "src",
            lease: "box",
            state: "running",
            exitCode: null,
            durationMs: null,
            output: `${dots(8)}\n 385 ···························`,
            outputTruncated: false,
        },
    ],
    [52, { kind: "status", text: "412 of 980 tests", progress: 0.42 }],
]);

/** A code node that failed: its tests' command exited 1, its output cut to the last 64 KiB. */
const unitFailedLog = logOf(NOW - 50 * MINUTE, [
    [0, { kind: "status", text: "starting vitest", progress: null }],
    [1, install],
    [6, { kind: "output", stream: "stdout", text: "Running 980 tests across 64 files\n" }],
    [
        7,
        {
            kind: "command",
            id: "c2",
            command: "pnpm vitest run --reporter=verbose",
            cwd: "src",
            lease: "box",
            state: "exited",
            exitCode: 1,
            durationMs: 231_400,
            output: [
                " ✓ src/sidebar/Sidebar.test.tsx (48 tests) 2104ms",
                " ✓ src/composer/Composer.test.tsx (112 tests) 3880ms",
                " ✗ src/settings/settings.spec.ts (14 tests | 3 failed) 912ms",
                "   ✗ theme switch persists across reloads",
                "     AssertionError: expected 'light' to be 'dark'",
                "      ❯ src/settings/settings.spec.ts:88:31",
                "   ✗ theme follows the system when set to auto",
                "   ✗ high contrast survives a theme change",
                "",
                " Test Files  1 failed | 63 passed (64)",
                "      Tests  3 failed | 977 passed (980)",
            ].join("\n"),
            outputTruncated: true,
        },
    ],
    [238, { kind: "output", stream: "stderr", text: "Error: 3 tests failed\n" }],
    [238, { kind: "status", text: "977 of 980 tests passed", progress: 1 }],
]);

/** An agent node at work: what it said, its tool calls, and a command it ran. */
const e2eLiveLog = logOf(
    NOW - MINUTE,
    [
        [
            0,
            {
                kind: "message",
                text: "I'll run the end-to-end suite against **staging**, then read the trace of anything that fails to tell a flaky test from a regression.",
            },
        ],
        [
            2,
            {
                kind: "tool",
                id: "t1",
                name: "web_fetch",
                summary: "GET https://staging.happy.engineering/health",
                state: "ok",
                durationMs: 312,
                error: null,
            },
        ],
        [
            3,
            {
                kind: "tool",
                id: "t2",
                name: "web_fetch",
                summary: "GET https://staging.happy.engineering/api/version",
                state: "error",
                durationMs: 5_002,
                error: "The connection was reset after 5s.",
            },
        ],
        [
            9,
            {
                kind: "command",
                id: "c1",
                command: "pnpm playwright test --project=chromium",
                cwd: "src",
                lease: "box",
                state: "exited",
                exitCode: 1,
                durationMs: 38_900,
                output: "Running 41 tests using 4 workers\n  38 passed (36.2s)\n  3 failed\n    settings.spec.ts:88 › theme switch persists across reloads",
                outputTruncated: false,
            },
        ],
        [
            49,
            {
                kind: "message",
                text: "Three specs failed in `settings.spec.ts`. Reading the first trace to see whether the theme switch is flaky or broke.",
            },
        ],
        [
            51,
            {
                kind: "tool",
                id: "t3",
                name: "read_file",
                summary: "test-results/settings-theme/trace.zip",
                state: "running",
                durationMs: null,
                error: null,
            },
        ],
    ],
    [4],
);

const emptyLog = logOf(NOW, []);

/**
 * A code node whose worker restarted mid-command: the same `sh` call logged
 * twice, then its computer went offline and the node failed.
 */
const offlineLog = logOf(NOW - 6 * MINUTE, [
    [0, { kind: "status", text: "building the installer", progress: 0.2 }],
    [
        2,
        {
            kind: "command",
            id: "sh-1",
            command: "pnpm electron-builder --win",
            cwd: "src",
            lease: "box",
            state: "aborted",
            exitCode: null,
            durationMs: 94_000,
            output: "  • electron-builder  version=25.1.8 os=10.0.22631\n  • loaded configuration  file=electron-builder.yml\n  • packaging       platform=win32 arch=x64\n",
            outputTruncated: false,
        },
    ],
    [
        110,
        {
            kind: "command",
            id: "sh-1",
            command: "pnpm electron-builder --win",
            cwd: "src",
            lease: "box",
            state: "aborted",
            exitCode: null,
            durationMs: 182_000,
            output: "  • electron-builder  version=25.1.8 os=10.0.22631\n  • loaded configuration  file=electron-builder.yml\n  • packaging       platform=win32 arch=x64\n  • building        target=nsis file=dist/Happy Setup.exe\n",
            outputTruncated: false,
        },
    ],
]);

const runSnapshot = (
    run: PipelineRun,
    nodeSelected: string | null = null,
    definition: PipelineDefinition = ci,
    relatives: readonly PipelineRunRelative[] = [],
): PipelineRunSnapshot => ({
    loading: false,
    missing: false,
    run,
    definition: { state: "loaded", definition },
    relatives: new Map(relatives.map((relative) => [relative.id, relative])),
    nodeSelected,
    abort: { state: "idle" },
});

/** The notify run the failed run's pipeline node started. */
const notifyChild: PipelineRunRelative = {
    id: "run_notify_12",
    pipelineId: "pl_notify",
    version: 2,
    state: "succeeded",
    startedAt: NOW - 45 * MINUTE,
    endedAt: NOW - 44 * MINUTE,
    nodesEnded: 2,
    nodesRunning: 0,
    nodesTotal: 2,
    status: null,
};

/**
 * A release made of other pipelines: after the build, Deploy runs once for the
 * web and once for desktop, and both search-index nodes joined one batch run
 * of Search index. The desktop deploy waits behind another run of its group.
 */
const shipNode = (id: string, pipelineId: string): PipelineNode => ({
    ...shared,
    id,
    kind: "pipeline",
    pipelineId,
});
const ship: PipelineDefinition = {
    ...ci,
    concurrency: { group: null, mode: "independent", batch: false },
    permissions: { ...none, pipelines: ["pl_deploy", "pl_index"] },
    root: "build",
    nodes: [
        { ...unit, id: "build" },
        shipNode("deploy-web", "pl_deploy"),
        shipNode("deploy-desktop", "pl_deploy"),
        shipNode("index-docs", "pl_index"),
        shipNode("index-api", "pl_index"),
        { ...release, id: "announce" },
    ],
    edges: [
        { from: "build", on: "success", to: "deploy-web" },
        { from: "build", on: "success", to: "deploy-desktop" },
        { from: "build", on: "success", to: "index-docs" },
        { from: "build", on: "success", to: "index-api" },
        { from: "deploy-web", on: "success", to: "announce" },
        { from: "deploy-desktop", on: "success", to: "announce" },
    ],
};
const shipRun: PipelineRun = {
    ...liveRun,
    id: "run_ship_21",
    pipelineId: "pl_ship",
    rootRunId: "run_ship_21",
    version: 3,
    createdAt: NOW - 9 * MINUTE,
    startedAt: NOW - 9 * MINUTE,
    group: null,
    input: { sha: "9f2c1e7" },
    leases: [],
    nodes: [
        nodeRun("build", "code", "succeeded", {
            input: { sha: "9f2c1e7" },
            output: { artifact: "happy-9f2c1e7.tar.zst" },
            startedAt: NOW - 9 * MINUTE,
            endedAt: NOW - 6 * MINUTE,
        }),
        nodeRun("deploy-web", "pipeline", "running", {
            childRunId: "run_deploy_31",
            input: { artifact: "happy-9f2c1e7.tar.zst", target: "web" },
            startedAt: NOW - 6 * MINUTE,
        }),
        nodeRun("deploy-desktop", "pipeline", "running", {
            childRunId: "run_deploy_32",
            input: { artifact: "happy-9f2c1e7.tar.zst", target: "desktop" },
            startedAt: NOW - 6 * MINUTE,
        }),
        nodeRun("index-docs", "pipeline", "succeeded", {
            childRunId: "run_index_7",
            input: { source: "docs" },
            output: { indexed: 412 },
            startedAt: NOW - 6 * MINUTE,
            endedAt: NOW - 4 * MINUTE,
        }),
        nodeRun("index-api", "pipeline", "succeeded", {
            childRunId: "run_index_7",
            input: { source: "api" },
            output: { indexed: 412 },
            startedAt: NOW - 6 * MINUTE,
            endedAt: NOW - 4 * MINUTE,
        }),
        nodeRun("announce", "code", "pending"),
    ],
    // Oldest first; the shared batch run once.
    childRunIds: ["run_deploy_31", "run_deploy_32", "run_index_7"],
};
const shipChildren: PipelineRunRelative[] = [
    {
        id: "run_deploy_31",
        pipelineId: "pl_deploy",
        version: 6,
        state: "running",
        startedAt: NOW - 6 * MINUTE,
        endedAt: null,
        nodesEnded: 2,
        nodesRunning: 1,
        nodesTotal: 5,
        status: { text: "migrating the database", progress: 0.4, at: NOW - 20 * SECOND },
    },
    {
        id: "run_deploy_32",
        pipelineId: "pl_deploy",
        version: 6,
        state: "queued",
        startedAt: null,
        endedAt: null,
        nodesEnded: 0,
        nodesRunning: 0,
        nodesTotal: 5,
        status: null,
    },
    {
        id: "run_index_7",
        pipelineId: "pl_index",
        version: 2,
        state: "succeeded",
        startedAt: NOW - 6 * MINUTE,
        endedAt: NOW - 4 * MINUTE,
        nodesEnded: 3,
        nodesRunning: 0,
        nodesTotal: 3,
        status: null,
    },
];

/** The web deploy, seen from its own page: Ship's deploy-web node made it. */
const deploy: PipelineDefinition = {
    ...ci,
    concurrency: { group: "{{input.target}}", mode: "queue", batch: false },
    root: "upload",
    nodes: ["upload", "verify-upload", "migrate", "switch", "smoke"].map(
        (id) => ({ ...unit, id }) as PipelineNode,
    ),
    edges: [
        { from: "upload", on: "success", to: "verify-upload" },
        { from: "verify-upload", on: "success", to: "migrate" },
        { from: "migrate", on: "success", to: "switch" },
        { from: "switch", on: "success", to: "smoke" },
    ],
};
const deployRun: PipelineRun = {
    ...liveRun,
    id: "run_deploy_31",
    pipelineId: "pl_deploy",
    rootRunId: "run_ship_21",
    parentRunId: "run_ship_21",
    trigger: { kind: "pipeline", runId: "run_ship_21", nodeId: "deploy-web" },
    version: 6,
    createdAt: NOW - 6 * MINUTE,
    startedAt: NOW - 6 * MINUTE,
    group: "web",
    input: { artifact: "happy-9f2c1e7.tar.zst", target: "web" },
    leases: [],
    nodes: [
        nodeRun("upload", "code", "succeeded", {
            startedAt: NOW - 6 * MINUTE,
            endedAt: NOW - 4 * MINUTE,
        }),
        nodeRun("verify-upload", "code", "succeeded", {
            startedAt: NOW - 4 * MINUTE,
            endedAt: NOW - 3 * MINUTE,
        }),
        nodeRun("migrate", "code", "running", {
            status: { text: "migrating the database", progress: 0.4, at: NOW - 20 * SECOND },
            statuses: statuses([["migrating the database", 0.4, 0]]),
            startedAt: NOW - 3 * MINUTE,
        }),
    ],
    childRunIds: [],
};
const deployParent: PipelineRunRelative = {
    id: "run_ship_21",
    pipelineId: "pl_ship",
    version: 3,
    state: "running",
    startedAt: NOW - 9 * MINUTE,
    endedAt: null,
    nodesEnded: 3,
    nodesRunning: 2,
    nodesTotal: 6,
    status: null,
};

/** One run among every pipeline's runs. */
const acrossRun = (
    id: string,
    pipelineId: string,
    pipelineName: string,
    state: PipelineRunEntry["state"],
    ago: number,
    took: number | null,
    extra: Partial<PipelineRunListEntry> = {},
): PipelineRunListEntry => ({
    ...runEntry(id, state, ago, took),
    pipelineId,
    pipelineName,
    pipelineArchived: false,
    ...extra,
});

/** Newest first: two running, one queued behind its group, a child run, and an archived pipeline's run. */
const acrossRuns: PipelineRunListEntry[] = [
    acrossRun("run_7", "pl_ci", "Desktop CI", "running", 3, null),
    acrossRun("run_d41", "pl_deploy", "Deploy cluster", "queued", 2, null, { startedAt: null }),
    acrossRun("run_n13", "pl_notify", "Notify team", "succeeded", 8, 0.5, {
        version: 1,
        trigger: { kind: "pipeline", runId: "run_i88", nodeId: "escalate" },
        parentRunId: "run_i88",
    }),
    acrossRun("run_i88", "pl_inbox", "Inbox triage", "failed", 9, 1, { version: 7 }),
    acrossRun("run_6", "pl_ci", "Desktop CI", "failed", 52, 9),
    acrossRun("run_d40", "pl_deploy", "Deploy cluster", "succeeded", 140, 18, { version: 12 }),
    acrossRun("run_s3", "pl_sync", "Calendar sync", "succeeded", 300, 2, {
        version: 2,
        pipelineArchived: true,
    }),
    acrossRun("run_5", "pl_ci", "Desktop CI", "superseded", 70 * 6, 4),
    acrossRun("run_b9", "pl_nightly", "Nightly benchmarks", "aborted", 30 * 60, 60, {
        version: 3,
    }),
];

const listRuns = (entries: readonly PipelineRunListEntry[], listed = true) => ({
    loading: false,
    listed,
    entries,
    nextCursor: entries.length > 0 ? "run_b9" : null,
    loadingMore: false,
});

const list: PipelinesSnapshot = {
    loading: false,
    runs: listRuns(acrossRuns),
    pipelines: [
        {
            id: "pl_ci",
            name: "Desktop CI",
            description: "Builds, tests and releases Happy for desktop.",
            headVersion: 4,
            enabled: true,
            lastRun: { id: "r1", state: "running", createdAt: NOW - 3 * MINUTE, endedAt: null },
        },
        {
            id: "pl_deploy",
            name: "Deploy cluster",
            description: "Rolls a new cluster build out to production.",
            headVersion: 12,
            enabled: true,
            lastRun: {
                id: "r2",
                state: "succeeded",
                createdAt: NOW - 140 * MINUTE,
                endedAt: NOW - 122 * MINUTE,
            },
        },
        {
            id: "pl_inbox",
            name: "Inbox triage",
            description: "Sorts incoming support email and drafts replies.",
            headVersion: 7,
            enabled: true,
            lastRun: {
                id: "r3",
                state: "failed",
                createdAt: NOW - 9 * MINUTE,
                endedAt: NOW - 8 * MINUTE,
            },
        },
        {
            id: "pl_notify",
            name: "Notify team",
            description: null,
            headVersion: 1,
            enabled: true,
            lastRun: null,
        },
        {
            id: "pl_nightly",
            name: "Nightly benchmarks",
            description: "Runs the performance suite on a dedicated box.",
            headVersion: 3,
            enabled: false,
            lastRun: {
                id: "r4",
                state: "aborted",
                createdAt: NOW - 30 * 60 * MINUTE,
                endedAt: NOW - 29 * 60 * MINUTE,
            },
        },
    ],
};

const noop = (): void => undefined;
const page = {
    labels,
    now: NOW,
    onBack: noop,
    onNodeSelect: noop,
    onRunOpen: noop,
    onRunsMore: noop,
    onVersionSelect: noop,
};
const listPage = {
    labels,
    now: NOW,
    onPipelineOpen: noop,
    onRunOpen: noop,
    onRunsMore: noop,
};
const runPage = {
    labels,
    now: NOW,
    onAbort: noop,
    onBack: noop,
    onNodeSelect: noop,
    onPipelineOpen: noop,
    onRunOpen: noop,
};

export function HappyAgentPipelinesBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A server's pipelines, and one pipeline's page: its graph, history, and one node at a time. Read only; agents create and run pipelines."
            title="Pipelines"
            width={WINDOW.width + 64}
        >
            <FullScreenSpecimen
                detail="The pipelines on top, one compact row each with its latest version and how its last run went; a disabled one says so. Beneath, every run of them, newest first: running ones count their time, a child run says which run it came from, and an archived pipeline's run is muted, its name no longer a link."
                label="List"
                number="01"
                screen="01-list-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinesPage {...listPage} pipelines={list} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Pipelines that have not run yet."
                label="List, no runs"
                number="01b"
                screen="01b-list-no-runs-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinesPage
                    {...listPage}
                    pipelines={{
                        ...list,
                        pipelines: list.pipelines.map((pipeline) => ({
                            ...pipeline,
                            lastRun: null,
                        })),
                        runs: listRuns([]),
                    }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A server that does not list runs across pipelines yet: the pipelines, and where their runs are."
                label="List, runs not listed"
                number="01c"
                screen="01c-list-unlisted-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinesPage
                    {...listPage}
                    pipelines={{ ...list, runs: listRuns([], false) }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="No pipelines yet. Agents make them, so the page says to ask one."
                label="List, empty"
                number="02"
                screen="02-list-empty-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinesPage
                    {...listPage}
                    pipelines={{ loading: false, pipelines: [], runs: listRuns([]) }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The latest version's graph in a strip as tall as it, success edges solid and failure edges dashed. Below, the pipeline's runs, one dense row each, beside its overview and history."
                label="Pipeline"
                number="03"
                screen="03-pipeline-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinePage {...page} pipeline={pipelineSnapshot} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A code node picked in the graph: its source in the main column; its types, permissions, and the computer it acquires and hands on beside it."
                label="Pipeline, code node"
                number="04"
                screen="04-code-node-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinePage
                    {...page}
                    pipeline={{ ...pipelineSnapshot, nodeSelected: "checkout" }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An agent node: its instructions in the main column, its model beside them."
                label="Pipeline, agent node"
                number="05"
                screen="05-agent-node-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinePage
                    {...page}
                    pipeline={{ ...pipelineSnapshot, nodeSelected: "e2e" }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An older version picked in the history draws its graph, with the way back to the latest."
                label="Pipeline, older version"
                number="06"
                screen="06-older-version-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinePage
                    {...page}
                    pipeline={{ ...pipelineSnapshot, versionSelected: 2 }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A pipeline the server no longer has."
                label="Pipeline, missing"
                number="07"
                screen="07-missing-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinePage
                    {...page}
                    pipeline={{
                        ...pipelineSnapshot,
                        pipeline: null,
                        missing: true,
                        versions: [],
                        definitions: new Map(),
                    }}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A run in progress on its timeline, following now at the centre: checkout finished to the left; unit and e2e work on the now line, each card with its status line and running time, unit's with progress; release and notify wait to the right, fading toward the edge. With no node picked, the log of the node working now is shown: a finished install, closed, and the test command still running, open."
                label="Run, live"
                number="08"
                screen="08-run-live-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "unit", snapshot: unitLiveLog }}
                    run={runSnapshot(liveRun)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An agent node picked: its messages as prose, its tool calls with one that failed, and the command it ran, which exited 1 and so stays open."
                label="Run, agent node log"
                number="09"
                screen="09-run-agent-log-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "e2e", snapshot: e2eLiveLog }}
                    run={runSnapshot(liveRun, "e2e")}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A finished run whose unit tests failed, resting on its end with no now line; names stay in view on bars that run off the left edge. With no node picked, the failed node's log is shown: the failing command in red with its output cut to the last 64 KiB, and the failure beside it. Release was skipped and notify ran as a child run; Abort is off."
                label="Run, failed"
                number="10"
                screen="10-run-failed-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "unit", snapshot: unitFailedLog }}
                    run={runSnapshot(failedRun, null, ci, [notifyChild])}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A node that ran and logged nothing: a pipeline node, whose work is its child run."
                label="Run, empty log"
                number="11"
                screen="11-run-empty-log-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "notify", snapshot: emptyLog }}
                    run={runSnapshot(failedRun, "notify", ci, [notifyChild])}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A node that has not started yet has no log."
                label="Run, waiting node"
                number="12"
                screen="12-run-waiting-node-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage {...runPage} run={runSnapshot(liveRun, "release")} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A wide run of 30 nodes, following now: seven working on the now line and what comes next ahead. Rows that finished well out of view fold away, and open again as the reader scrolls back to them; edges into one node share one vertical run."
                label="Run, 30 nodes"
                number="13"
                screen="13-run-wide-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "test-6", snapshot: unitLiveLog }}
                    run={runSnapshot(wideRun, null, wide)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A run of a single node, working."
                label="Run, one node"
                number="14"
                screen="14-run-single-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "checkout", snapshot: emptyLog }}
                    run={runSnapshot(singleRun, null, single)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A run that failed while a node it had already started is still finishing: strict failed with no failure edge and publish was skipped, so nothing more is promised ahead, but fallback works on the now line and its log is shown."
                label="Run, failed with a node finishing"
                number="15"
                screen="15-run-failed-finishing-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "fallback", snapshot: emptyLog }}
                    run={runSnapshot(finishingRun, null, checks)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A code node that lost its computer. A worker restart logged the same command twice, both shown; the failure reads as words, its code beside them, and the message names the computer."
                label="Run, computer unavailable"
                number="16"
                screen="16-run-computer-unavailable-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "unit", snapshot: offlineLog }}
                    run={runSnapshot(lostRun, "unit")}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An agent node that ended without an output, with what its agent spent: the total, then each model it used; one model's provider did not price it."
                label="Run, agent usage"
                number="17"
                screen="17-run-agent-usage-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "e2e", snapshot: emptyLog }}
                    run={runSnapshot(lostRun, "e2e")}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A batch run: three triggers joined it while its group was busy, so its input is their three inputs, numbered oldest first."
                label="Run, batch"
                number="18"
                screen="18-run-batch-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "unit", snapshot: unitLiveLog }}
                    run={runSnapshot(batchRun, null, batched)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A run made of other pipelines. Each pipeline node on the timeline says where its child run is: three of five nodes through, or queued behind its group while the node waits. Beside it, every child run, the batch run two nodes share listed once."
                label="Run, child runs"
                number="19"
                screen="19-run-children-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "build", snapshot: emptyLog }}
                    run={runSnapshot(shipRun, "build", ship, shipChildren)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A pipeline node picked: its child run, with how far through it is, opens from the node's facts."
                label="Run, pipeline node"
                number="20"
                screen="20-run-pipeline-node-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "deploy-web", snapshot: emptyLog }}
                    run={runSnapshot(shipRun, "deploy-web", ship, shipChildren)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A child run's own page: the parent run that started it, and from which node, opens from beside its facts."
                label="Run, child"
                number="21"
                screen="21-run-child-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "migrate", snapshot: unitLiveLog }}
                    run={runSnapshot(deployRun, null, deploy, [deployParent])}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
