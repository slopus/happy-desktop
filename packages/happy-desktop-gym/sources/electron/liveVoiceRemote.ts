import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type { Page } from "playwright";
import { gymRunPathsCreate } from "./paths.js";
import { happyAgentRuntimeCreate, type StartedHappyAgentRuntime } from "./happyAgentRuntime.js";
import { happyAgentClientCreate } from "./happyAgentProtocol.js";
import { completeOnboarding } from "./workloads.js";
import { liveVoiceSpeakersVerify } from "./liveVoiceSilence.js";
import { fixtureInferenceCreate, liveConfiguration } from "./liveVoiceFixture.js";
import {
    callStatusAwait,
    endedDismiss,
    endedMessage,
    laneFinish,
    liveVoiceWindowOpen,
    phoneStatus,
    railSelect,
    settingsBack,
    shot,
    signInFreshAssert,
    voiceAccountChoose,
    voiceCall,
    type LiveVoiceWindow,
    type Turn,
} from "./liveVoiceWindow.js";
import type { GymRunPaths } from "./types.js";

const exec = promisify(execFile);

/** Names a project or conversation with two random words, so only context can reveal it. */
const WORDS = {
    color: ["Amber", "Azure", "Coral", "Crimson", "Emerald", "Golden", "Indigo", "Ivory"],
    plant: ["Acacia", "Birch", "Cedar", "Clover", "Dahlia", "Fern", "Hazel", "Juniper"],
    animal: ["Badger", "Falcon", "Heron", "Lynx", "Marmot", "Otter", "Puffin", "Walrus"],
};
const pick = (list: readonly string[]) => list[randomBytes(1)[0]! % list.length]!;

export const LIVE_VOICE_REMOTE_SCENARIOS = [
    "remote-call",
    "local-call",
    "remote-disconnect",
    "remote-offline",
] as const;
export type LiveVoiceRemoteScenario = (typeof LIVE_VOICE_REMOTE_SCENARIOS)[number];

const REMOTE_CONNECTION = "remote";
const REMOTE_NAME = "Remote Lab";
/** What each daemon calls itself; the rail names a connection by it. */
const REMOTE_NODE = "Remote Lab Mac";
const LOCAL_NODE = "Gym Mac";
const CONVERSATION_TITLE = "Harbor Beacon Notes";
/** Appended to the remote's own voice prompt: Settings and calls on it show whose settings they use. */
const REMOTE_PROMPT_MARKER =
    "REMOTE DAEMON VOICE PROMPT: when asked which machine hosts this call, say Remote Lab.";

/**
 * Explicit live lane with a second owned daemon reached through the local
 * daemon's `[connections.*]` Tailcat route, the way the host publishes a
 * peer. A call belongs to the agent whose phone was pressed and is hosted by
 * it, with its own voice settings and account; only the remote daemon's
 * seeded conversation reply is scripted, never a voice call.
 */
export async function gymLiveVoiceRemoteRun(options: {
    authFile: string;
    artifactDirectory?: string;
    scenarios?: readonly LiveVoiceRemoteScenario[];
    /** No call: each agent's Settings → Voice, and the phone of an offline remote. */
    dry?: boolean;
}): Promise<void> {
    if (!isAbsolute(options.authFile))
        throw new Error("--auth-file must reference an existing absolute Codex sign-in path.");
    await access(options.authFile);
    await signInFreshAssert(options.authFile);
    if (process.platform !== "darwin")
        throw new Error("The speech fixture currently requires macOS say/afconvert.");
    const scenarios = options.dry
        ? ["remote-offline"]
        : (options.scenarios ?? LIVE_VOICE_REMOTE_SCENARIOS);
    const { paths } = await gymRunPathsCreate("smoke", undefined, options.artifactDirectory);
    const remotePaths = (await gymRunPathsCreate("smoke")).paths;
    const localProject = `Voice Observatory ${pick(WORDS.color)} ${pick(WORDS.plant)}`;
    let remoteProject = `Lighthouse ${pick(WORDS.color)} ${pick(WORDS.plant)}`;
    while (remoteProject.split(" ")[1] === localProject.split(" ")[2])
        remoteProject = `Lighthouse ${pick(WORDS.color)} ${pick(WORDS.plant)}`;
    const beaconCode = `${pick(WORDS.color)} ${pick(WORDS.animal)} ${100 + (randomBytes(1)[0]! % 900)}`;
    const remoteMessage = `Remember this for later: the harbor beacon code is ${beaconCode}.`;
    const remoteReply = `Noted. The harbor beacon code is ${beaconCode}, and the north pier stays closed until Friday.`;
    const result: Record<string, unknown> = {
        status: "failed",
        root: paths.root,
        remoteRoot: remotePaths.root,
        mockInference: false,
        mockVoiceTransport: false,
        remoteConversationInference: "scripted while seeding the remote only",
        fixture: {
            localProject,
            remoteProject,
            conversationTitle: CONVERSATION_TITLE,
            beaconCode,
            remoteMessage,
            remoteReply,
            remoteConnection: REMOTE_NAME,
        },
        scenarios: {},
        startedAt: new Date().toISOString(),
    };
    const scenarioResults = result.scenarios as Record<string, unknown>;
    let local: StartedHappyAgentRuntime | undefined;
    let remote: StartedHappyAgentRuntime | undefined;
    let window: LiveVoiceWindow | undefined;
    let failure: unknown;
    const lifetime = setInterval(() => {}, 1_000);
    // Seed its conversation with a scripted reply, then restart it with a
    // real voice account: a call hosted there runs on that daemon alone.
    const remoteInference = fixtureInferenceCreate({
        title: CONVERSATION_TITLE,
        reply: remoteReply,
    });
    try {
        result.stage = "remote-daemon";
        const remoteToken = randomBytes(32).toString("base64url");
        await remoteInference.start();
        remote = await happyAgentRuntimeCreate(remotePaths, remoteInference);
        await happyAgentClientCreate(remote.socketPath, remote.token).completeOnboarding();
        const remoteRepository = join(remotePaths.projects, remoteProject);
        await gitRepositoryCreate(
            remoteRepository,
            remoteProject,
            "A remote machine's project for the GPT-Live remote check.",
        );
        const { project: remoteProjectRecord } =
            await remote.client.registerProject(remoteRepository);
        await remote.client.waitForWorkspace(remoteProjectRecord.id, "ready", 90_000);
        const { agent: remoteAgent } = await remote.client.createAgent(remoteProjectRecord.id);
        const { runId } = await remote.client.sendMessage(remoteAgent.id, remoteMessage);
        await remote.client.waitForAgentIdle(remoteAgent.id, runId, 60_000);
        await remote.stop();
        await remoteInference.stop();
        remote = await happyAgentRuntimeCreate(
            remotePaths,
            undefined,
            liveConfiguration({
                authFile: options.authFile,
                node: REMOTE_NODE,
                serve: remoteToken,
            }),
        );
        if (remote.environment.HAPPY_GYM_INFERENCE_URL)
            throw new Error("The remote unexpectedly kept deterministic inference.");
        const remoteClient = happyAgentClientCreate(remote.socketPath, remote.token);
        const voice = (await remoteClient.getConfig()).config.voice;
        if (!voice) throw new Error("The remote daemon reports no voice settings.");
        await remoteClient.patchConfig({
            // A node keeps the name its first start gave it; the rail names it by this.
            node: { name: REMOTE_NODE },
            voice: { systemPrompt: `${voice.defaultSystemPrompt}\n\n${REMOTE_PROMPT_MARKER}` },
        });
        const address = await tailcatAddressRead(remotePaths);
        (result.fixture as Record<string, unknown>).remoteProjectId = remoteProjectRecord.id;
        (result.fixture as Record<string, unknown>).remoteSessionId = remoteAgent.id;

        result.stage = "local-daemon";
        local = await happyAgentRuntimeCreate(
            paths,
            undefined,
            liveConfiguration({
                authFile: options.authFile,
                node: LOCAL_NODE,
                profile: true,
                connection: {
                    id: REMOTE_CONNECTION,
                    name: REMOTE_NAME,
                    address,
                    token: remoteToken,
                },
            }),
        );
        if (local.environment.HAPPY_GYM_INFERENCE_URL)
            throw new Error("Live run unexpectedly inherited deterministic inference.");
        const remoteHealth = await happyAgentClientCreate(local.socketPath, local.token)
            .connection(REMOTE_CONNECTION)
            .getHealth();
        result.remoteThroughHost = {
            ready: remoteHealth.ready,
            desktopLiveControl: remoteHealth.capabilities?.desktopLiveControl ?? false,
        };
        const localRepository = join(paths.projects, localProject);
        await gitRepositoryCreate(
            localRepository,
            localProject,
            "The local machine's project for the GPT-Live remote check.",
        );
        const { project } = await local.client.registerProject(localRepository);
        await local.client.waitForWorkspace(project.id, "ready", 90_000);
        const { workspace } = await local.client.createWorkspace(project.id, "voice-context");
        await local.client.waitForWorkspace(workspace.id, "ready", 90_000);

        result.stage = "launching";
        window = await liveVoiceWindowOpen({ paths, environment: local.environment });
        const { page } = window;
        result.stage = "onboarding";
        await completeOnboarding(page);
        await page.getByText(localProject, { exact: true }).first().waitFor({ timeout: 45_000 });
        await shot(page, paths, "desktop-after-onboarding");

        // Each agent's own Settings → Voice: its account, controller and prompt.
        result.stage = "settings";
        await voiceAccountChoose(page, "voice");
        await shot(page, paths, "voice-settings-local");
        result.voiceSettingsLocal = await settingsPromptRead(page);
        await settingsBack(page);
        await railSelect(page, REMOTE_NODE);
        await page.getByText(remoteProject, { exact: true }).first().waitFor({ timeout: 60_000 });
        await voiceAccountChoose(page, "voice");
        await page.waitForTimeout(1_500);
        await shot(page, paths, "voice-settings-remote");
        result.voiceSettingsRemote = await settingsPromptRead(page);
        await settingsBack(page);

        const call = (name: string, turns: readonly Turn[]) =>
            voiceCall({ window: window!, paths, name, turns });

        if (scenarios.includes("remote-call")) {
            await railSelect(page, REMOTE_NODE);
            await sidebarOpen(page, remoteProject);
            await page.getByText(beaconCode, { exact: false }).first().waitFor({ timeout: 30_000 });
            await shot(page, paths, "remote-call-before");
            scenarioResults["remote-call"] = await call("remote-call", [
                { say: "Which machine is hosting this call?" },
                { say: "What does the conversation on my screen say?" },
                { say: "Add a draft to this conversation saying: thanks, I will check the pier." },
            ]);
            await shot(page, paths, "remote-call-after");
            const draft = await remote.client.draftRead(remoteAgent.id).catch(() => null);
            (scenarioResults["remote-call"] as Record<string, unknown>).remoteDraft = draft;
        }
        if (scenarios.includes("local-call")) {
            await railSelect(page, LOCAL_NODE);
            await page.getByText("voice-context", { exact: true }).first().click();
            scenarioResults["local-call"] = await call("local-call", [
                { say: "Which machine is hosting this call?" },
                { say: "What is on my Remote Lab server?" },
            ]);
        }
        if (scenarios.includes("remote-disconnect")) {
            await railSelect(page, REMOTE_NODE);
            await sidebarOpen(page, remoteProject);
            const stoppedRemote = remote;
            let stoppedAt = 0;
            let disconnectMessage = "";
            scenarioResults["remote-disconnect"] = await call("remote-disconnect", [
                { say: "Say hello in five words or fewer." },
                {
                    before: async () => {
                        stoppedAt = Date.now();
                        await stoppedRemote.stop();
                        await callStatusAwait(page, ["ended"], 90_000);
                        disconnectMessage = await endedMessage(page);
                        await shot(page, paths, "remote-disconnect-ended");
                    },
                    say: "Are you still there?",
                },
            ]);
            const disconnect = scenarioResults["remote-disconnect"] as Record<string, unknown>;
            disconnect.stoppedAt = stoppedAt;
            disconnect.phoneAfterStop = await phoneStatus(page);
            disconnect.messageAfterStop = disconnectMessage;
        }
        if (scenarios.includes("remote-offline")) {
            await railSelect(page, REMOTE_NODE);
            await endedDismiss(page);
            await remote.stop().catch(() => undefined);
            await railSelect(page, REMOTE_NODE);
            await page.waitForTimeout(50_000);
            await shot(page, paths, "remote-offline-before");
            const before = await phoneStatus(page);
            await page.getByRole("button", { name: "Start voice call", exact: true }).click();
            const after = await callStatusAwait(page, ["ended"], 15_000);
            const message = await endedMessage(page);
            await shot(page, paths, "remote-offline-after-start");
            scenarioResults["remote-offline"] = { phoneBefore: before, phoneAfter: after, message };
        }
        result.silenceAfterCalls = await liveVoiceSpeakersVerify(window.app, page);
        result.status = "passed";
        result.stage = options.dry ? "dry" : "complete";
    } catch (error) {
        failure = error;
        result.error = error instanceof Error ? error.message : String(error);
        if (window) await shot(window.page, paths, "failure").catch(() => undefined);
    } finally {
        clearInterval(lifetime);
        await remoteInference.stop();
        await laneFinish({ paths, result, window, runtimes: [local, remote] });
    }
    if (failure) throw failure;
}

async function settingsPromptRead(
    page: Page,
): Promise<{ remoteMarkerShown: boolean; text: string }> {
    const text = await page.locator("body").innerText();
    const fields = await page
        .locator("textarea")
        .evaluateAll((items) => items.map((item) => (item as HTMLTextAreaElement).value));
    const all = [text, ...fields].join("\n");
    return {
        remoteMarkerShown: all.includes("REMOTE DAEMON VOICE PROMPT"),
        text: all.slice(0, 3_000),
    };
}

async function sidebarOpen(page: Page, title: string) {
    await page.getByText(title, { exact: true }).first().click();
    await page.waitForTimeout(2_000);
}

export async function gitRepositoryCreate(repository: string, name: string, description: string) {
    await mkdir(repository, { recursive: true });
    await writeFile(join(repository, "README.md"), `# ${name}\n\n${description}\n`);
    for (const args of [
        ["init", "-b", "main"],
        ["add", "README.md"],
        [
            "-c",
            "user.name=Voice Gym",
            "-c",
            "user.email=voice-gym@example.invalid",
            "commit",
            "-m",
            "Create isolated voice context",
        ],
    ])
        await exec("/usr/bin/git", args, {
            cwd: repository,
            env: {
                PATH: "/usr/bin:/bin",
                GIT_CONFIG_NOSYSTEM: "1",
                GIT_CONFIG_GLOBAL: "/dev/null",
            },
        });
}

/** The remote's published Tailcat address, present while its tunnel is open. */
export async function tailcatAddressRead(paths: GymRunPaths): Promise<string> {
    const home = join(paths.agentHome, "tailcat");
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const files = await readdir(home).catch(() => [] as string[]);
        if (files.includes("address")) {
            const address = (await readFile(join(home, "address"), "utf8")).trim();
            if (address) return address;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("The remote daemon did not publish a Tailcat address.");
}
