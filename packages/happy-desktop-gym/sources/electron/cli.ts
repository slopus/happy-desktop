import { gymPrepare, gymRun } from "./gym.js";
import { gymProfilesList } from "./manifest.js";
import { gymRunClean, gymRunsRootResolve } from "./paths.js";
import { gymSmokeRun } from "./smoke.js";
import { gymPublicRepositoryAttach } from "./publicRepository.js";
import { gymLiveVoiceRun } from "./liveVoice.js";
import { gymOnboardingRecord } from "./onboardingRecording.js";
import {
    GYM_PERSONA_NEW_USER,
    GYM_PERSONA_RECOVERS,
    GYM_PERSONA_TYPIST,
    GYM_PERSONA_WORKER,
    type GymPersona,
} from "./persona.js";
import { gymTeamOnboardingRecord } from "./teamOnboardingRecording.js";
import type { GymProfile, GymWorkloadName } from "./types.js";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** The people a recording can follow, by the name `--persona` takes. */
const GYM_PERSONAS: Readonly<Record<string, GymPersona>> = {
    "new-user": GYM_PERSONA_NEW_USER,
    worker: GYM_PERSONA_WORKER,
    recovers: GYM_PERSONA_RECOVERS,
    typist: GYM_PERSONA_TYPIST,
};

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
    if (command === "record-onboarding") {
        if (!flags.out) throw new Error("record-onboarding requires --out ABSOLUTE_PATH.mkv.");
        // Named variables move from this process to the Happy Agent alone, so
        // no other child of this run inherits them.
        const daemonSecrets: Record<string, string> = {};
        for (const name of flags.daemonEnv ?? []) {
            const value = process.env[name];
            if (!value) throw new Error(`--daemon-env ${name} is not set in this environment.`);
            daemonSecrets[name] = value;
            delete process.env[name];
        }
        const persona = flags.persona === undefined ? undefined : GYM_PERSONAS[flags.persona];
        if (flags.persona !== undefined && persona === undefined)
            throw new Error(
                `--persona is one of ${Object.keys(GYM_PERSONAS).join(", ")}; got ${flags.persona}.`,
            );
        if (flags.machine !== undefined && flags.machine !== "fresh" && flags.machine !== "worked")
            throw new Error("--machine is fresh or worked.");
        const recording = await gymOnboardingRecord({
            out: resolve(flags.out),
            ...(flags.root ? { root: flags.root } : {}),
            ...(flags.providers ? { providersFile: resolve(flags.providers) } : {}),
            ...(persona ? { persona } : {}),
            ...(flags.machine ? { machine: flags.machine } : {}),
            ...(flags.relaunchAfter !== undefined
                ? { relaunchAfterTurns: flags.relaunchAfter }
                : {}),
            daemonSecrets,
        });
        console.log(JSON.stringify({ command, ...recording }, null, 2));
        return;
    }
    if (command === "record-team-onboarding") {
        if (!flags.out) throw new Error("record-team-onboarding requires --out ABSOLUTE_PATH.mkv.");
        if (!flags.server) throw new Error("record-team-onboarding requires --server URL.");
        const login = process.env.HAPPY_GYM_TEAM_LOGIN;
        const password = process.env.HAPPY_GYM_TEAM_PASSWORD;
        if (!login || !password)
            throw new Error(
                "Set HAPPY_GYM_TEAM_LOGIN and HAPPY_GYM_TEAM_PASSWORD for the server's sign-in.",
            );
        const recording = await gymTeamOnboardingRecord({
            out: resolve(flags.out),
            serverUrl: flags.server,
            serverName: flags.serverName ?? "Acme",
            login,
            password,
            ...(flags.invite ? { invites: flags.invite } : {}),
        });
        // The codes go to a file only this account reads, for a teammate's
        // take to join with; they are not printed.
        const { invites, ...reported } = recording;
        if (flags.invitesOut)
            await writeFile(resolve(flags.invitesOut), `${JSON.stringify(invites)}\n`, {
                mode: 0o600,
            });
        console.log(
            JSON.stringify(
                { command, ...reported, invites: invites.map((invite) => invite.role) },
                null,
                2,
            ),
        );
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
    readonly providers?: string;
    readonly daemonEnv?: readonly string[];
    readonly server?: string;
    readonly serverName?: string;
    readonly invite?: readonly string[];
    readonly invitesOut?: string;
    readonly persona?: string;
    readonly machine?: string;
    readonly relaunchAfter?: number;
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
        providers?: string;
        daemonEnv?: string[];
        server?: string;
        serverName?: string;
        invite?: string[];
        invitesOut?: string;
        persona?: string;
        machine?: string;
        relaunchAfter?: number;
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
        else if (value === "--providers")
            result.providers = requiredValue(value, next, () => index++);
        else if (value === "--server") result.server = requiredValue(value, next, () => index++);
        else if (value === "--server-name")
            result.serverName = requiredValue(value, next, () => index++);
        else if (value === "--daemon-env")
            (result.daemonEnv ??= []).push(requiredValue(value, next, () => index++));
        else if (value === "--invite")
            (result.invite ??= []).push(requiredValue(value, next, () => index++));
        else if (value === "--invites-out")
            result.invitesOut = requiredValue(value, next, () => index++);
        else if (value === "--persona") result.persona = requiredValue(value, next, () => index++);
        else if (value === "--machine") result.machine = requiredValue(value, next, () => index++);
        else if (value === "--relaunch-after") {
            const turns = Number(requiredValue(value, next, () => index++));
            if (!Number.isInteger(turns) || turns < 0)
                throw new Error("--relaunch-after takes a number of turns.");
            result.relaunchAfter = turns;
        } else throw new Error(`Unknown option '${value}'.`);
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
  record-onboarding --out PATH.mkv [--root PATH] [--providers HAPPY_TOML] [--daemon-env NAME]...
                    [--persona new-user|worker|recovers|typist] [--machine fresh|worked]
                    [--relaunch-after TURNS]
  record-team-onboarding --out PATH.mkv --server URL [--server-name NAME]
                         [--invite ROLE]... [--invites-out PATH.json]
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
