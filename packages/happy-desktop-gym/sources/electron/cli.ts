import { gymPrepare, gymRun } from "./gym.js";
import { gymProfilesList } from "./manifest.js";
import { gymRunClean, gymRunsRootResolve } from "./paths.js";
import { gymSmokeRun } from "./smoke.js";
import { gymPublicRepositoryAttach } from "./publicRepository.js";
import { gymLiveVoiceRun } from "./liveVoice.js";
import { gymOnboardingRun } from "./onboarding.js";
import type { GymProfile, GymWorkloadName } from "./types.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const workloads: readonly GymWorkloadName[] = [
    "hidden-window",
    "background-drafts",
    "public-repository",
    "boot",
    "catalog-switch",
    "long-transcript",
    "long-chat-scroll",
    "session-switch-load",
    "file-switch-warm",
    "highlight-warm",
    "changed-files-warm",
    "panel-file-edit",
    "streaming",
    "mixed-replay",
    "memory-idle",
    "window-edge-resize",
    "archive-reconcile",
    "sidebar-drag",
    "stop-shimmer",
    "nested-row-menus",
    "section-create",
    "mobile-direct-experiment",
    "jump-shimmer",
    "new-work-reuse",
    "row-removal",
    "sidebar-read-ahead",
    "window-zoom",
    "all",
];

export async function main(argv = process.argv.slice(2)): Promise<void> {
    const command = argv[0] ?? "help";
    const flags = parseFlags(argv.slice(1));
    if (command === "help" || command === "--help" || command === "-h") {
        printHelp();
        return;
    }
    if (command === "clean") {
        const root = required(flags, "root");
        await gymRunClean(root);
        console.log(JSON.stringify({ cleaned: root }));
        return;
    }
    if (command === "smoke") {
        const result = await gymSmokeRun();
        console.log(JSON.stringify({ command, ...result }, null, 2));
        return;
    }
    if (command === "live-voice") {
        if (!flags.authFile)
            throw new Error("live-voice requires --auth-file ABSOLUTE_CODEX_AUTH_PATH.");
        await gymLiveVoiceRun({
            authFile: flags.authFile,
            artifactDirectory: flags.artifactDir,
            poolDefault: flags.poolDefault,
        });
        return;
    }
    if (command === "onboarding") {
        if (!flags.out) throw new Error(`${command} requires --out ABSOLUTE_DIRECTORY.`);
        await gymOnboardingRun({
            out: flags.out,
            record: flags.record,
            video: flags.video,
            stable: flags.stable,
        });
        return;
    }
    if (command === "attach-repository") {
        if (!flags.repository) throw new Error("--repository is required.");
        await gymPublicRepositoryAttach(required(flags, "root"), flags.repository);
        return;
    }
    if (command === "prepare") {
        const profile = profileRead(flags.profile);
        const prepared = await gymPrepare({
            profile,
            root: flags.root,
            artifactDirectory: flags.artifactDir,
        });
        console.log(
            JSON.stringify(
                {
                    command,
                    root: prepared.paths.root,
                    profile,
                    catalog: prepared.catalog,
                    seededSessions: prepared.sessionIds.length,
                    seededTurns: prepared.seededTurns,
                    durableCounts: prepared.durableCounts,
                    fixture: prepared.fixture,
                    persistedAfterRestart: prepared.persistedAfterRestart,
                    limitation: prepared.manifest.seed.limitation,
                },
                null,
                2,
            ),
        );
        return;
    }
    if (command === "run") {
        const workload = workloadRead(flags.workload);
        let root = flags.root;
        if (root === undefined) {
            const prepared = await gymPrepare({
                profile: profileRead(flags.profile),
                artifactDirectory: flags.artifactDir,
            });
            root = prepared.paths.root;
        }
        const result = await gymRun({ root, workload, uiTrace: flags.uiTrace });
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    throw new Error(`Unknown Gym command '${command}'. Use 'help' for usage.`);
}

function parseFlags(args: readonly string[]): {
    readonly profile?: string;
    readonly root?: string;
    readonly artifactDir?: string;
    readonly workload?: string;
    readonly uiTrace?: boolean;
    readonly repository?: string;
    readonly authFile?: string;
    readonly poolDefault?: boolean;
    readonly out?: string;
    readonly record?: boolean;
    readonly video?: string;
    readonly stable?: boolean;
} {
    const result: {
        profile?: string;
        root?: string;
        artifactDir?: string;
        workload?: string;
        uiTrace?: boolean;
        repository?: string;
        authFile?: string;
        poolDefault?: boolean;
        out?: string;
        record?: boolean;
        video?: string;
        stable?: boolean;
    } = {};
    for (let index = 0; index < args.length; index += 1) {
        const value = args[index];
        const next = args[index + 1];
        if (value === "--profile") result.profile = requiredValue(value, next, () => index++);
        else if (value === "--root") result.root = requiredValue(value, next, () => index++);
        else if (value === "--artifact-dir")
            result.artifactDir = requiredValue(value, next, () => index++);
        else if (value === "--workload")
            result.workload = requiredValue(value, next, () => index++);
        else if (value === "--ui-trace") result.uiTrace = true;
        else if (value === "--repository")
            result.repository = requiredValue(value, next, () => index++);
        else if (value === "--auth-file")
            result.authFile = requiredValue(value, next, () => index++);
        else if (value === "--pool-default") result.poolDefault = true;
        else if (value === "--out") result.out = requiredValue(value, next, () => index++);
        else if (value === "--record") result.record = true;
        else if (value === "--video") result.video = requiredValue(value, next, () => index++);
        else if (value === "--stable") result.stable = true;
        else throw new Error(`Unknown option '${value}'.`);
    }
    return result;
}

function requiredValue(option: string, value: string | undefined, advance: () => void): string {
    if (value === undefined || value.startsWith("--")) {
        throw new Error(`${option} requires a value.`);
    }
    advance();
    return value;
}

function profileRead(value: string | undefined): GymProfile {
    const profile = value ?? "smoke";
    if (!gymProfilesList().includes(profile as GymProfile)) {
        throw new Error(`Unknown profile '${profile}'. Choose smoke, realistic, or stress.`);
    }
    return profile as GymProfile;
}

function workloadRead(value: string | undefined): GymWorkloadName {
    const workload = value ?? "all";
    if (!workloads.includes(workload as GymWorkloadName)) {
        throw new Error(`Unknown workload '${workload}'.`);
    }
    return workload as GymWorkloadName;
}

function required(flags: { readonly root?: string }, name: "root"): string {
    const value = flags[name];
    if (value === undefined) throw new Error(`--${name} is required.`);
    return value;
}

function printHelp(): void {
    console.log(`happy-desktop-gym/electron

Commands:
  prepare --profile smoke|realistic|stress [--root PATH] [--artifact-dir PATH]
  attach-repository --root PATH --repository ABSOLUTE_LOCAL_CHECKOUT
  run [--profile PROFILE] [--root PATH] [--workload WORKLOAD] [--ui-trace]
  smoke
  live-voice --auth-file ABSOLUTE_CODEX_AUTH_PATH [--artifact-dir PATH] [--pool-default]
  onboarding --out ABSOLUTE_DIRECTORY [--record [--video FILE.mp4]] [--stable]   (gym scenario: first conversation on a fresh install, run by Happy Agent on stand-in providers; the mp4 is labelled "Gym data". The build decides the flavor: a preview build (RELEASE_VERSION=X.Y.Z-preview.N) runs the chat; --stable expects a stable build's welcome and setup instead)
  clean --root PATH

Workloads:
  hidden-window, boot, catalog-switch, long-transcript, file-switch-warm,
  long-chat-scroll, session-switch-load, highlight-warm, changed-files-warm,
  streaming, mixed-replay, memory-idle, window-edge-resize, archive-reconcile, sidebar-drag, stop-shimmer, nested-row-menus, section-create, mobile-direct-experiment, jump-shimmer, new-work-reuse, row-removal, sidebar-read-ahead, window-zoom, public-repository,
  background-drafts, all

The default root is ${gymRunsRootResolve()}/g-<run-id>.
Only roots carrying the Gym ownership marker can be cleaned.`);
}

if (
    process.argv[1] !== undefined &&
    resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
        process.exitCode = 1;
    });
}
