import { gymPrepare, gymRun } from "./gym.js";
import { gymProfilesList } from "./manifest.js";
import { gymRunClean, gymRunsRootResolve } from "./paths.js";
import { gymSmokeRun } from "./smoke.js";
import { gymPublicRepositoryAttach } from "./publicRepository.js";
import { gymLiveVoiceRun } from "./liveVoice.js";
import { gymBrowserPreviewRun, type GymBrowserRoute } from "./browserPreview.js";
import { gymCloudBrowserRun } from "./cloudBrowser.js";
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
    "stop-shimmer",
    "mobile-pairing-method",
    "jump-shimmer",
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
    if (command === "browser-preview") {
        const result = await gymBrowserPreviewRun({
            expectedRoute: routeRead(flags.expect),
            artifactDirectory: flags.artifactDir,
        });
        console.log(JSON.stringify({ command, ...result }, null, 2));
        if (result.status !== "passed") process.exitCode = 1;
        return;
    }
    if (command === "cloud-browser") {
        const result = await gymCloudBrowserRun({
            fake: flags.fake === true,
            ...(flags.serverUrl ? { serverUrl: flags.serverUrl } : {}),
            ...(flags.workspace ? { workspaceId: flags.workspace } : {}),
            ...(flags.agent ? { agentId: flags.agent } : {}),
            ...(flags.pageUrl ? { pageUrl: flags.pageUrl } : {}),
            ...(flags.tokenCommand ? { tokenCommand: flags.tokenCommand } : {}),
            ...(flags.identityUrl ? { identityUrl: flags.identityUrl } : {}),
            ...(flags.apiUrl ? { apiUrl: flags.apiUrl } : {}),
            ...(flags.serverName ? { serverName: flags.serverName } : {}),
            ...(flags.computeOffline ? { computeOffline: flags.computeOffline } : {}),
            ...(flags.computeOnline ? { computeOnline: flags.computeOnline } : {}),
            ...(flags.computeRelease ? { computeRelease: flags.computeRelease } : {}),
            ...(flags.computeAttach ? { computeAttach: flags.computeAttach } : {}),
            ...(flags.navigate === undefined ? {} : { navigate: flags.navigate.split(",") }),
            ...(flags.artifactDir ? { artifactDirectory: flags.artifactDir } : {}),
        });
        console.log(JSON.stringify({ command, ...result }, null, 2));
        if (result.status !== "passed") process.exitCode = 1;
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
    readonly expect?: string;
    readonly fake?: boolean;
    readonly serverUrl?: string;
    readonly workspace?: string;
    readonly agent?: string;
    readonly pageUrl?: string;
    readonly tokenCommand?: string;
    readonly identityUrl?: string;
    readonly apiUrl?: string;
    readonly serverName?: string;
    readonly computeOffline?: string;
    readonly computeOnline?: string;
    readonly computeRelease?: string;
    readonly computeAttach?: string;
    readonly navigate?: string;
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
        expect?: string;
        fake?: boolean;
        serverUrl?: string;
        workspace?: string;
        agent?: string;
        pageUrl?: string;
        tokenCommand?: string;
        identityUrl?: string;
        apiUrl?: string;
        serverName?: string;
        computeOffline?: string;
        computeOnline?: string;
        computeRelease?: string;
        computeAttach?: string;
        navigate?: string;
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
        else if (value === "--expect") result.expect = requiredValue(value, next, () => index++);
        else if (value === "--fake") result.fake = true;
        else if (value === "--server-url")
            result.serverUrl = requiredValue(value, next, () => index++);
        else if (value === "--workspace")
            result.workspace = requiredValue(value, next, () => index++);
        else if (value === "--agent") result.agent = requiredValue(value, next, () => index++);
        else if (value === "--page-url") result.pageUrl = requiredValue(value, next, () => index++);
        else if (value === "--token-command")
            result.tokenCommand = requiredValue(value, next, () => index++);
        else if (value === "--identity-url")
            result.identityUrl = requiredValue(value, next, () => index++);
        else if (value === "--api-url") result.apiUrl = requiredValue(value, next, () => index++);
        else if (value === "--server-name")
            result.serverName = requiredValue(value, next, () => index++);
        else if (value === "--compute-offline")
            result.computeOffline = requiredValue(value, next, () => index++);
        else if (value === "--compute-online")
            result.computeOnline = requiredValue(value, next, () => index++);
        else if (value === "--compute-release")
            result.computeRelease = requiredValue(value, next, () => index++);
        else if (value === "--compute-attach")
            result.computeAttach = requiredValue(value, next, () => index++);
        else if (value === "--navigate")
            result.navigate = requiredValue(value, next, () => index++);
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

function routeRead(value: string | undefined): GymBrowserRoute {
    const route = value ?? "proxy";
    if (route !== "direct" && route !== "proxy")
        throw new Error(`Unknown route '${route}'. Choose direct or proxy.`);
    return route;
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
  browser-preview [--expect proxy|direct] [--artifact-dir PATH]
  cloud-browser --fake | --server-url URL --workspace ID --agent ID --page-url URL
      [--token-command CMD | --identity-url URL --api-url URL --server-name NAME]
      [--compute-offline CMD --compute-online CMD] [--compute-release CMD --compute-attach CMD]
      [--navigate PATH,PATH,...] [--artifact-dir PATH]   (bearer: HAPPY_GYM_CLOUD_TOKEN, or the options above)
  live-voice --auth-file ABSOLUTE_CODEX_AUTH_PATH [--artifact-dir PATH] [--pool-default]
  clean --root PATH

Workloads:
  hidden-window, boot, catalog-switch, long-transcript, file-switch-warm,
  long-chat-scroll, session-switch-load, highlight-warm, changed-files-warm,
  streaming, mixed-replay, memory-idle, window-edge-resize, archive-reconcile, stop-shimmer, mobile-pairing-method, jump-shimmer, window-zoom, public-repository,
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
