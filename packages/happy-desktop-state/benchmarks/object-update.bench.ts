import { appearanceStoreCreate } from "../src/appearance/appearanceStore.js";
import { experimentsStoreCreate } from "../src/experiments/experimentsStore.js";
import { ChatStore } from "../src/happyAgentConnection/ChatStore.js";
import { composerStoreCreate } from "../src/modules/composer/composerState.js";
import { welcomeStoreCreate } from "../src/onboarding/welcomeStore.js";
import { happyAgentGlobalDocumentStoreCreate } from "../src/happyAgent/happyAgentInstructionsStore.js";
import { happyAgentInboxStoreCreate } from "../src/happyAgent/happyAgentInboxStore.js";
import { happyAgentMenusStoreCreate } from "../src/happyAgent/happyAgentMenusStore.js";
import { happyAgentNavigationOrderStoreCreate } from "../src/happyAgent/happyAgentNavigationOrderStore.js";
import { happyAgentPanelStoreCreate } from "../src/happyAgent/happyAgentPanelStore.js";
import { happyAgentProfileStoreCreate } from "../src/happyAgent/happyAgentProfileStore.js";
import { happyAgentProviderUsageStoreCreate } from "../src/happyAgent/happyAgentProviderUsageStore.js";
import { happyAgentSessionDraftStoreCreate } from "../src/happyAgent/happyAgentSessionDraftStore.js";
import { happyAgentSettingsStoreCreate } from "../src/happyAgent/happyAgentSettingsStore.js";
import { happyAgentSidebarCollapseStoreCreate } from "../src/happyAgent/happyAgentSidebarCollapseStore.js";
import type {
    HappyAgentGroupId,
    HappyAgentInboxItemId,
    HappyAgentModelCatalog,
    HappyAgentSelection,
} from "../src/happyAgent/happyAgentTypes.js";
import { happyAgentWorkspaceMemoryStoreCreate } from "../src/happyAgent/happyAgentWorkspaceMemory.js";
import { titleShimmerStoreCreate } from "../src/titleShimmer/titleShimmerStore.js";

interface BenchmarkSubject {
    readonly snapshot: () => unknown;
    readonly change: () => void;
    readonly noChange: () => void;
    readonly noChangePrepare?: () => void;
    readonly dispose?: () => void;
}

interface BenchmarkCase {
    readonly module: string;
    readonly operation: string;
    readonly minimumChangedReferences: number;
    readonly iterations?: number;
    readonly create: () => BenchmarkSubject;
}

interface BenchmarkResult {
    readonly module: string;
    readonly operation: string;
    readonly nanosecondsPerChange: number;
    readonly changedReferences: readonly string[];
    readonly minimumChangedReferences: number;
    readonly noOpChangedReferences: readonly string[];
}

const modelCatalog: HappyAgentModelCatalog = {
    defaultModelId: "luna",
    defaultProviderId: "happy",
    models: [
        {
            id: "luna",
            name: "Luna",
            thinkingLevels: ["medium", "high"],
            defaultThinkingLevel: "medium",
            serviceTiers: ["fast"],
        },
    ],
    providers: [
        {
            enabled: true,
            id: "happy",
            type: "claude",
            models: [
                {
                    id: "luna",
                    name: "Luna",
                    thinkingLevels: ["medium", "high"],
                    defaultThinkingLevel: "medium",
                    serviceTiers: ["fast"],
                },
            ],
        },
    ],
};

const automaticSelection: HappyAgentSelection = {
    providerId: "happy",
    modelId: "luna",
    effort: "medium",
    permissionMode: "auto",
};

const readOnlySelection: HappyAgentSelection = {
    ...automaticSelection,
    permissionMode: "read_only",
};

const cases: readonly BenchmarkCase[] = [
    {
        module: "appearance/appearanceStore",
        operation: "appearanceSelect",
        minimumChangedReferences: 1,
        create: () => {
            const store = appearanceStoreCreate({ mode: "light" });
            return {
                snapshot: store.get,
                change: () => store.appearanceSelect("dark"),
                noChange: () => store.appearanceSelect("light"),
                dispose: () => store[Symbol.dispose](),
            };
        },
    },
    {
        module: "experiments/experimentsStore",
        operation: "experimentalFeaturesUpdate",
        minimumChangedReferences: 1,
        create: () => {
            const store = experimentsStoreCreate();
            return {
                snapshot: store.get,
                change: () => store.experimentalFeaturesUpdate(true),
                noChange: () => store.experimentalFeaturesUpdate(false),
            };
        },
    },
    {
        module: "onboarding/welcomeStore",
        operation: "welcomeAcknowledge",
        minimumChangedReferences: 1,
        create: () => {
            const store = welcomeStoreCreate();
            return {
                snapshot: store.get,
                change: store.welcomeAcknowledge,
                noChangePrepare: store.welcomeAcknowledge,
                noChange: store.welcomeAcknowledge,
            };
        },
    },
    {
        module: "titleShimmer/titleShimmerStore",
        operation: "titleShimmerUpdate",
        minimumChangedReferences: 1,
        create: () => {
            const store = titleShimmerStoreCreate();
            return {
                snapshot: store.get,
                change: () => store.titleShimmerUpdate(true),
                noChange: () => store.titleShimmerUpdate(false),
            };
        },
    },
    {
        module: "modules/composer/composerState",
        operation: "focusUpdate",
        minimumChangedReferences: 1,
        create: () => {
            const store = composerStoreCreate("benchmark");
            return {
                snapshot: store.getState,
                change: () => store.getState().focusUpdate(true),
                noChange: () => store.getState().focusUpdate(false),
            };
        },
    },
    {
        module: "happyAgentConnection/ChatStore",
        operation: "applyHello(connection)",
        minimumChangedReferences: 1,
        create: () => {
            const store = new ChatStore("benchmark");
            return {
                snapshot: () => store.session(),
                change: () => void store.applyHello({ connection: "live" }),
                noChange: () => void store.applyHello({ connection: "connecting" }),
            };
        },
    },
    {
        module: "happyAgent/happyAgentInstructionsStore",
        operation: "draftUpdate",
        minimumChangedReferences: 1,
        create: () => {
            const store = happyAgentGlobalDocumentStoreCreate({
                read: async () => "",
                write: async (value) => value,
            });
            return {
                snapshot: store.get,
                change: () => store.draftUpdate("policy"),
                noChange: () => store.draftUpdate(""),
                dispose: () => store[Symbol.dispose](),
            };
        },
    },
    {
        module: "happyAgent/happyAgentInboxStore",
        operation: "itemMessageUpdate",
        minimumChangedReferences: 2,
        create: () => {
            const store = happyAgentInboxStoreCreate({
                source: { subscribe: () => () => undefined },
            });
            const itemId = "question" as HappyAgentInboxItemId;
            store.itemMessageUpdate(itemId, "Alpha");
            return {
                snapshot: store.get,
                change: () => store.itemMessageUpdate(itemId, "Beta"),
                noChange: () => store.itemMessageUpdate(itemId, "Alpha"),
                dispose: () => store[Symbol.dispose](),
            };
        },
    },
    {
        module: "happyAgent/happyAgentMenusStore",
        operation: "menusSelectionUpdate(permissionMode)",
        minimumChangedReferences: 4,
        iterations: 1_000,
        create: () => {
            const store = happyAgentMenusStoreCreate({
                catalog: modelCatalog,
                selection: automaticSelection,
            });
            return {
                snapshot: store.get,
                change: () => store.menusSelectionUpdate(readOnlySelection),
                noChange: () => store.menusSelectionUpdate(automaticSelection),
            };
        },
    },
    {
        module: "happyAgent/happyAgentNavigationOrderStore",
        operation: "itemReorder",
        minimumChangedReferences: 2,
        create: () => {
            const store = happyAgentNavigationOrderStoreCreate({
                read: () => ({ order: ["alpha", "beta"] }),
                write: () => undefined,
            });
            const ids = ["alpha", "beta"] as const;
            return {
                snapshot: store.get,
                change: () => store.itemReorder("beta", null, ids),
                noChange: () => store.itemReorder("alpha", null, ids),
            };
        },
    },
    {
        module: "happyAgent/happyAgentPanelStore",
        operation: "panelToggle",
        minimumChangedReferences: 1,
        iterations: 1_000,
        create: () => {
            const store = happyAgentPanelStoreCreate({
                terminalOpen: () => {
                    throw new Error("The object-update benchmark never opens a terminal.");
                },
            });
            return {
                snapshot: store.get,
                change: store.panelToggle,
                noChange: () => store.scopeApply(undefined, undefined),
                dispose: () => store[Symbol.dispose](),
            };
        },
    },
    {
        module: "happyAgent/happyAgentProfileStore",
        operation: "displayNameUpdate",
        minimumChangedReferences: 1,
        create: () => {
            const store = happyAgentProfileStoreCreate({
                source: { subscribe: () => () => undefined },
                actions: {
                    profileSave: async ({ email, name }) => ({
                        email,
                        name,
                        updatedAt: 0,
                    }),
                },
            });
            return {
                snapshot: store.get,
                change: () => store.displayNameUpdate("Ada"),
                noChange: () => store.displayNameUpdate(""),
                dispose: () => store[Symbol.dispose](),
            };
        },
    },
    {
        module: "happyAgent/happyAgentProviderUsageStore",
        operation: "source reading",
        minimumChangedReferences: 1,
        create: () => {
            let emit: ((reading: { providers: readonly []; loading: boolean }) => void) | undefined;
            const store = happyAgentProviderUsageStoreCreate({
                source: {
                    subscribe: (listener) => {
                        emit = listener;
                        return () => undefined;
                    },
                },
            });
            const release = store.subscribe(() => undefined);
            const providers = store.get().providers as readonly [];
            return {
                snapshot: store.get,
                change: () => emit?.({ providers, loading: false }),
                noChange: () => emit?.({ providers, loading: true }),
                dispose: () => {
                    release();
                    store[Symbol.dispose]();
                },
            };
        },
    },
    {
        module: "happyAgent/happyAgentSessionDraftStore",
        operation: "permissionModeUpdate",
        minimumChangedReferences: 6,
        iterations: 1_000,
        create: () => {
            const store = happyAgentSessionDraftStoreCreate({
                catalog: modelCatalog,
                selection: automaticSelection,
            });
            return {
                snapshot: store.get,
                change: () => store.permissionModeUpdate("read_only"),
                noChange: () => store.permissionModeUpdate("auto"),
            };
        },
    },
    {
        module: "happyAgent/happyAgentSettingsStore",
        operation: "defaultEffortUpdate",
        minimumChangedReferences: 1,
        create: () => {
            const store = happyAgentSettingsStoreCreate({ defaultEffort: "medium" });
            return {
                snapshot: store.get,
                change: () => store.defaultEffortUpdate("high"),
                noChange: () => store.defaultEffortUpdate("medium"),
            };
        },
    },
    {
        module: "happyAgent/happyAgentSidebarCollapseStore",
        operation: "rowCollapseToggle",
        minimumChangedReferences: 2,
        create: () => {
            const store = happyAgentSidebarCollapseStoreCreate();
            return {
                snapshot: store.get,
                change: () => store.rowCollapseToggle("project"),
                noChange: () => store.rowCollapseToggle(""),
            };
        },
    },
    {
        module: "happyAgent/happyAgentWorkspaceMemory",
        operation: "groupDraftWrite",
        minimumChangedReferences: 1,
        create: () => {
            const groupId = "project" as HappyAgentGroupId;
            const store = happyAgentWorkspaceMemoryStoreCreate({
                read: () => ({
                    groups: {
                        [groupId]: { history: [], files: [], draft: "Alpha" },
                    },
                }),
                write: () => undefined,
            });
            return {
                snapshot: () => store.groupRead(groupId),
                change: () => store.groupDraftWrite(groupId, "Beta"),
                noChange: () => store.groupDraftWrite(groupId, "Alpha"),
            };
        },
    },
];

const quick = process.argv.includes("--quick");
const samples = quick ? 3 : 7;
const defaultIterations = quick ? 100 : 4_000;

const results = cases.map(runCase);
printResults(results);

const failures = results.filter(
    (result) =>
        result.changedReferences.length !== result.minimumChangedReferences ||
        result.noOpChangedReferences.length !== 0,
);
if (failures.length > 0) {
    console.error("\nReference contract failures:");
    for (const failure of failures) {
        if (failure.changedReferences.length !== failure.minimumChangedReferences)
            console.error(
                `- ${failure.module}: change expected ${failure.minimumChangedReferences}, got ${failure.changedReferences.length} (${failure.changedReferences.join(", ")})`,
            );
        if (failure.noOpChangedReferences.length !== 0)
            console.error(
                `- ${failure.module}: no-op expected 0, got ${failure.noOpChangedReferences.length} (${failure.noOpChangedReferences.join(", ")})`,
            );
    }
    process.exitCode = 1;
}

function runCase(benchmarkCase: BenchmarkCase): BenchmarkResult {
    const changedReferences = referenceSample(benchmarkCase, false);
    const noOpChangedReferences = referenceSample(benchmarkCase, true);
    const requestedIterations = benchmarkCase.iterations ?? defaultIterations;
    const iterations = quick ? Math.min(100, requestedIterations) : requestedIterations;

    const warmSubjects = Array.from({ length: Math.min(iterations, 100) }, benchmarkCase.create);
    for (const subject of warmSubjects) subject.change();
    for (const subject of warmSubjects) subject.dispose?.();

    const readings: number[] = [];
    for (let sample = 0; sample < samples; sample += 1) {
        const subjects = Array.from({ length: iterations }, benchmarkCase.create);
        const started = process.hrtime.bigint();
        for (const subject of subjects) subject.change();
        const elapsed = process.hrtime.bigint() - started;
        readings.push(Number(elapsed) / iterations);
        for (const subject of subjects) subject.dispose?.();
    }

    readings.sort((left, right) => left - right);
    return {
        module: benchmarkCase.module,
        operation: benchmarkCase.operation,
        nanosecondsPerChange: readings[Math.floor(readings.length / 2)]!,
        changedReferences,
        minimumChangedReferences: benchmarkCase.minimumChangedReferences,
        noOpChangedReferences,
    };
}

function referenceSample(benchmarkCase: BenchmarkCase, noChange: boolean): readonly string[] {
    const subject = benchmarkCase.create();
    if (noChange) subject.noChangePrepare?.();
    const before = subject.snapshot();
    if (noChange) subject.noChange();
    else subject.change();
    const after = subject.snapshot();
    subject.dispose?.();
    return changedReferencePaths(before, after);
}

function changedReferencePaths(before: unknown, after: unknown): readonly string[] {
    const paths: string[] = [];
    const seen = new WeakMap<object, WeakSet<object>>();

    const visit = (left: unknown, right: unknown, path: string): void => {
        const leftReference = reference(left);
        const rightReference = reference(right);
        if (leftReference === undefined && rightReference === undefined) return;
        if (leftReference === undefined || rightReference === undefined) {
            paths.push(path);
            return;
        }
        if (leftReference === rightReference) return;
        paths.push(path);

        const paired = seen.get(leftReference);
        if (paired?.has(rightReference)) return;
        if (paired) paired.add(rightReference);
        else seen.set(leftReference, new WeakSet([rightReference]));

        if (Array.isArray(leftReference) && Array.isArray(rightReference)) {
            const length = Math.max(leftReference.length, rightReference.length);
            for (let index = 0; index < length; index += 1)
                visit(leftReference[index], rightReference[index], `${path}[${index}]`);
            return;
        }
        if (leftReference instanceof Map && rightReference instanceof Map) {
            const keys = new Set([...leftReference.keys(), ...rightReference.keys()]);
            for (const key of keys)
                visit(
                    leftReference.get(key),
                    rightReference.get(key),
                    `${path}.get(${String(key)})`,
                );
            return;
        }
        if (
            leftReference instanceof Set ||
            rightReference instanceof Set ||
            typeof leftReference === "function" ||
            typeof rightReference === "function"
        )
            return;

        const keys = new Set([...Object.keys(leftReference), ...Object.keys(rightReference)]);
        for (const key of keys)
            visit(
                (leftReference as Record<string, unknown>)[key],
                (rightReference as Record<string, unknown>)[key],
                `${path}.${key}`,
            );
    };

    visit(before, after, "$snapshot");
    return paths;
}

function reference(value: unknown): object | ((...args: never[]) => unknown) | undefined {
    return (typeof value === "object" && value !== null) || typeof value === "function"
        ? (value as object | ((...args: never[]) => unknown))
        : undefined;
}

function printResults(rows: readonly BenchmarkResult[]): void {
    const headings = ["module", "operation", "ns/change", "changed refs", "minimum", "no-op refs"];
    const values = rows.map((row) => [
        row.module,
        row.operation,
        row.nanosecondsPerChange.toFixed(1),
        String(row.changedReferences.length),
        String(row.minimumChangedReferences),
        String(row.noOpChangedReferences.length),
    ]);
    const widths = headings.map((heading, index) =>
        Math.max(heading.length, ...values.map((row) => row[index]!.length)),
    );
    const line = (row: readonly string[]): string =>
        row.map((value, index) => value.padEnd(widths[index]!)).join("  ");
    console.log(line(headings));
    console.log(widths.map((width) => "-".repeat(width)).join("  "));
    for (const row of values) console.log(line(row));
}
