import type {
    PipelineLogEntry,
    PipelineNodeLogSnapshot,
    PipelineNodeRun,
    PipelineRun,
    PipelineRunEntry,
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
    pipeline: (id) => (id === "pl_notify" ? "Notify team" : id === "pl_ci" ? "Desktop CI" : id),
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

const runSnapshot = (
    run: PipelineRun,
    nodeSelected: string | null = null,
): PipelineRunSnapshot => ({
    loading: false,
    missing: false,
    run,
    definition: { state: "loaded", definition: ci },
    nodeSelected,
    abort: { state: "idle" },
});

const list: PipelinesSnapshot = {
    loading: false,
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
                detail="Each pipeline with its latest version and how its last run went; a disabled one says so."
                label="List"
                number="01"
                screen="01-list-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinesPage labels={labels} onPipelineOpen={noop} pipelines={list} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="No pipelines yet. Agents make them, so the page says to ask one."
                label="List, empty"
                number="02"
                screen="02-list-empty-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelinesPage
                    labels={labels}
                    onPipelineOpen={noop}
                    pipelines={{ loading: false, pipelines: [] }}
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
                detail="A run in progress: checkout succeeded; unit and e2e run in parallel on one computer, each row with its status line, unit's with progress; release and notify wait. With no node picked, the log of the node working now is shown: a finished install, closed, and the test command still running, open."
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
                detail="A finished run whose unit tests failed. With no node picked, the failed node's log is shown: the failing command in red with its output cut to the last 64 KiB, and the failure beside it. Release was skipped and notify ran as a child run; Abort is off."
                label="Run, failed"
                number="10"
                screen="10-run-failed-1100x760"
                window={WINDOW}
            >
                <HappyAgentPipelineRunPage
                    {...runPage}
                    log={{ nodeId: "unit", snapshot: unitFailedLog }}
                    run={runSnapshot(failedRun)}
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
                    run={runSnapshot(failedRun, "notify")}
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
        </ComponentPage>
    );
}
