import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import type { ElectronApplication, Page } from "playwright";
import { gymElectronLaunch } from "./launch.js";
import { gymRunPathsCreate, electronEntrypointResolve } from "./paths.js";
import { happyAgentRuntimeCreate, type StartedHappyAgentRuntime } from "./happyAgentRuntime.js";
import { completeOnboarding } from "./workloads.js";
import { liveVoiceMediaInstall, type LiveVoiceMedia } from "./liveVoiceMedia.js";
import { happyAgentClientCreate } from "./happyAgentProtocol.js";
import {
    LIVE_VOICE_MUTE_SWITCH,
    liveVoiceSpeakersMute,
    liveVoiceSpeakersVerify,
} from "./liveVoiceSilence.js";
import type { Cuid2 } from "@slopus/happy-agent-client";

const exec = promisify(execFile);
export const LIVE_VOICE_PROMPT =
    "Hello. Say hi and tell me what you are capable of and what you see.";

/** Explicit live lane: no gym inference server, mock media negotiation or paid API fallback. */
export async function gymLiveVoiceRun(options: {
    authFile: string;
    artifactDirectory?: string;
    poolDefault?: boolean;
}): Promise<void> {
    if (!isAbsolute(options.authFile))
        throw new Error("--auth-file must reference an existing absolute Codex sign-in path.");
    await access(options.authFile);
    const { paths, marker } = await gymRunPathsCreate(
        "smoke",
        undefined,
        options.artifactDirectory,
    );
    const colors = [
        "Amber",
        "Azure",
        "Coral",
        "Crimson",
        "Emerald",
        "Golden",
        "Indigo",
        "Ivory",
        "Jade",
        "Lilac",
        "Pearl",
        "Ruby",
        "Sapphire",
        "Silver",
        "Teal",
        "Violet",
    ];
    const plants = [
        "Acacia",
        "Birch",
        "Cedar",
        "Clover",
        "Dahlia",
        "Fern",
        "Hazel",
        "Iris",
        "Juniper",
        "Laurel",
        "Lotus",
        "Maple",
        "Orchid",
        "Pine",
        "Rose",
        "Willow",
    ];
    const projectName = `Voice Observatory ${colors[parseInt(marker.runId[0]!, 16)]} ${plants[parseInt(marker.runId[1]!, 16)]}`;
    const repository = join(paths.projects, projectName);
    const speech = join(paths.artifacts, "microphone-prompt.wav");
    const events: {
        direction: "received" | "sent";
        receivedAt: string;
        frame: Record<string, unknown>;
    }[] = [];
    const result: Record<string, unknown> = {
        status: "failed",
        root: paths.root,
        prompt: LIVE_VOICE_PROMPT,
        projectName,
        mockInference: false,
        mockVoiceTransport: false,
        credentialProvider: "voice",
        controllerProvider: options.poolDefault ? "voice_pool" : "voice",
        startedAt: new Date().toISOString(),
    };
    const network: { method: string; path: string; status?: number; error?: string }[] = [];
    let runtime: StartedHappyAgentRuntime | undefined;
    let app: ElectronApplication | undefined;
    let page: Page | undefined;
    let failure: unknown;
    let finishedRecordings: Awaited<ReturnType<LiveVoiceMedia["recordingsFinish"]>> | undefined;
    // Existing daemon polling uses unref timers. Deterministic runs have an
    // inference listener keeping Node alive; a live run deliberately has none.
    const lifetime = setInterval(() => {}, 1_000);
    try {
        result.stage = "preparing";
        if (process.platform !== "darwin")
            throw new Error("The speech fixture currently requires macOS say/afconvert.");
        await exec("/usr/bin/say", [
            "-o",
            join(paths.artifacts, "microphone-prompt.aiff"),
            LIVE_VOICE_PROMPT,
        ]);
        await exec("/usr/bin/afconvert", [
            "-f",
            "WAVE",
            "-d",
            "LEI16@48000",
            join(paths.artifacts, "microphone-prompt.aiff"),
            speech,
        ]);
        await mkdir(repository, { recursive: true });
        await writeFile(
            join(repository, "README.md"),
            `# ${projectName}\n\nAn isolated desktop workspace for the real GPT-Live microphone and screen-context check.\n`,
        );
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
        const configuration = `[settings]\nhappy_integration = false\nmenu_bar = false\n[profile]\nname = "Voice Gym"\nemail = "voice-gym@example.invalid"\n[providers]\ndefault_enable = false\n[providers.voice]\ntype = "codex"\nenabled = true\nhidden = ${options.poolDefault === true}\ncredential_isolation = true\nauth_file = ${JSON.stringify(options.authFile)}\n${options.poolDefault ? '[providers.voice_pool]\ntype = "smart"\nstrategy = "round_robin"\nproviders = ["voice"]\nenabled = true\n' : ""}[defaults]\nprovider = "${options.poolDefault ? "voice_pool" : "voice"}"\nmodel = "openai/gpt-6-astra"\neffort = "medium"\n`;
        runtime = await happyAgentRuntimeCreate(paths, undefined, configuration);
        const { config } = await happyAgentClientCreate(
            runtime.socketPath,
            runtime.token,
        ).getConfig();
        result.serverControllerDefault = config.defaults;
        if (config.defaults.providerId !== result.controllerProvider)
            throw new Error("The daemon did not select the intended controller default.");
        result.onboardingBeforeApp = await happyAgentClientCreate(
            runtime.socketPath,
            runtime.token,
        ).getOnboarding();
        console.log(
            JSON.stringify({
                stage: "daemon-ready",
                root: paths.root,
                onboarding: result.onboardingBeforeApp,
            }),
        );
        if (runtime.environment.HAPPY_GYM_INFERENCE_URL)
            throw new Error("Live run unexpectedly inherited deterministic inference.");
        const { project } = await runtime.client.registerProject(repository);
        await runtime.client.waitForWorkspace(project.id, "ready", 90_000);
        const { workspace } = await runtime.client.createWorkspace(project.id, "voice-context");
        await runtime.client.waitForWorkspace(workspace.id, "ready", 90_000);
        result.fixture = {
            projectId: project.id,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
        };
        result.stage = "launching";
        const entrypoint = electronEntrypointResolve(paths.workspaceRoot);
        app = await gymElectronLaunch({
            executablePath: entrypoint.executable,
            args: [
                `--user-data-dir=${paths.electronUserData}`,
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
                "--autoplay-policy=no-user-gesture-required",
                LIVE_VOICE_MUTE_SWITCH,
                entrypoint.main,
            ],
            cwd: paths.workspaceRoot,
            env: {
                ...runtime.environment,
                HAPPY_ALLOW_SOURCE_AGENT: "1",
                HAPPY_DESKTOP_GYM_PROFILE: "smoke",
                HAPPY_DESKTOP_GYM_ELECTRON_USER_DATA: paths.electronUserData,
            },
            timeout: 60_000,
        });
        await liveVoiceSpeakersMute(app);
        page = await app.firstWindow();
        page.on("response", (response) => {
            const url = new URL(response.url());
            if (url.pathname.includes("/v0/"))
                network.push({
                    method: response.request().method(),
                    path: url.pathname,
                    status: response.status(),
                });
        });
        page.on("requestfailed", (request) => {
            const url = new URL(request.url());
            if (url.pathname.includes("/v0/"))
                network.push({
                    method: request.method(),
                    path: url.pathname,
                    error: request.failure()?.errorText,
                });
        });
        page.on("websocket", (socket) => {
            if (!socket.url().includes("/live/")) return;
            const capture = (direction: "received" | "sent", payload: string | Buffer) => {
                try {
                    const frame = JSON.parse(payload.toString()) as Record<string, unknown>;
                    if (
                        [
                            "hello",
                            "status",
                            "transcript",
                            "desktopContext",
                            "sessionUpdate",
                            "actionRequested",
                            "actionResult",
                            "close",
                        ].includes(String(frame.type))
                    )
                        events.push({ direction, receivedAt: new Date().toISOString(), frame });
                    if (frame.type === "transcript")
                        console.log(
                            JSON.stringify({
                                stage: "transcript",
                                role: frame.role,
                                text: frame.text,
                            }),
                        );
                } catch {
                    /* Ignore non-control frames, never record socket URLs or credentials. */
                }
            };
            socket.on("framereceived", ({ payload }) => capture("received", payload));
            socket.on("framesent", ({ payload }) => capture("sent", payload));
        });
        await page.waitForLoadState("domcontentloaded");
        // tsx preserves function names through this helper. Keep it local to
        // the serialized instrumentation, without touching application state.
        await page.evaluate(
            `(() => { const __name = (value) => value; (${liveVoiceMediaInstall.toString()})(); })()`,
        );
        result.silenceBeforeCall = await liveVoiceSpeakersVerify(app, page);
        result.stage = "onboarding";
        await completeOnboarding(page);
        await page.screenshot({ path: join(paths.artifacts, "desktop-after-onboarding.png") });
        console.log(JSON.stringify({ stage: "onboarding-complete", projectName }));
        await page.getByText(projectName, { exact: true }).first().waitFor({ timeout: 45_000 });
        result.stage = "settings";
        await page.getByRole("button", { name: "Settings", exact: true }).click();
        // The Voice page's one switch enables both the experiment and calls.
        await page.getByRole("button", { name: "Voice", exact: true }).click();
        await page.getByRole("switch", { name: "Enable GPT-Live voice" }).click();
        await page.getByRole("combobox", { name: "Voice account" }).waitFor({ timeout: 30_000 });
        await page.getByRole("combobox", { name: "Voice account" }).selectOption("voice");
        await page.screenshot({ path: join(paths.artifacts, "voice-settings.png") });
        await page.getByRole("button", { name: "Back", exact: true }).click();
        // Click the actual sidebar target, leaving a unique visible context for the call.
        await page.getByText("voice-context", { exact: true }).first().click();
        await page.screenshot({ path: join(paths.artifacts, "desktop-before-call.png") });
        result.visibleDesktop = await page.locator("body").innerText();
        result.stage = "starting-call";
        console.log(JSON.stringify({ stage: "starting-call", projectName }));
        await page.getByRole("button", { name: "Start voice call", exact: true }).click();
        await page.waitForFunction(
            () => {
                const phone = document.querySelector(".happy-gpt-live-phone");
                return (
                    phone?.getAttribute("data-status") === "active" ||
                    phone?.getAttribute("data-status") === "error"
                );
            },
            undefined,
            { timeout: 90_000 },
        );
        const status = await page.locator(".happy-gpt-live-phone").getAttribute("data-status");
        if (status !== "active")
            throw new Error(
                `Call did not become active: ${await page.locator("body").innerText()}; phone=${await page.locator(".happy-gpt-live-phone").evaluate((node) => node.outerHTML)}`,
            );
        result.silenceDuringCall = await liveVoiceSpeakersVerify(app, page);
        result.activeAt = new Date().toISOString();
        result.stage = "active";
        console.log(JSON.stringify({ stage: "active", projectName }));
        await page.screenshot({ path: join(paths.artifacts, "call-active.png") });
        const promptBase64 = (await readFile(speech)).toString("base64");
        result.microphonePlayback = await page.evaluate(
            (base64) =>
                (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.microphonePlay(base64),
            promptBase64,
        );
        result.stage = "response";
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
            const assistant = events.filter(
                (event) => event.frame.type === "transcript" && event.frame.role === "assistant",
            );
            if (
                assistant
                    .map((event) => String(event.frame.text))
                    .join("")
                    .toLowerCase()
                    .includes(projectName.toLowerCase())
            )
                break;
            if (
                events.some(
                    (event) => event.frame.type === "status" && event.frame.status === "failed",
                )
            )
                throw new Error("Provider reported live call failure; see control-events.json.");
            await page.waitForTimeout(500);
        }
        // Let the received speaker audio finish before ending a successful call.
        // Transcript deltas can lead playback; the received track's measured
        // energy is the external-media barrier, not an assumed model completion
        // delay. Inbound RTP energy reads zero while playout is muted.
        const audioDeadline = Date.now() + 20_000;
        let previousEnergy = -1;
        let lastAudioAt = Date.now();
        while (Date.now() < audioDeadline && Date.now() - lastAudioAt < 2_000) {
            const stats = await page.evaluate(() =>
                (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.stats(),
            );
            const energy = stats.receivedEnergy;
            // Comfort noise moves the level a little; speech moves it by orders more.
            if (energy - previousEnergy > 1e-6) lastAudioAt = Date.now();
            previousEnergy = energy;
            await page.waitForTimeout(250);
        }
        result.media = await page.evaluate(() =>
            (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.stats(),
        );
        await page.screenshot({ path: join(paths.artifacts, "call-response.png") });
        const transcripts = events
            .filter((event) => event.frame.type === "transcript")
            .map((event) => event.frame);
        result.transcripts = transcripts;
        const userText = transcripts
            .filter((frame) => frame.role === "user")
            .map((frame) => String(frame.text))
            .join("");
        const assistantText = transcripts
            .filter((frame) => frame.role === "assistant")
            .map((frame) => String(frame.text))
            .join("");
        if (!/hello/i.test(userText) || !/capable/i.test(userText) || !/see/i.test(userText))
            throw new Error("Real provider did not transcribe the spoken microphone prompt.");
        if (!assistantText.toLowerCase().includes(projectName.toLowerCase()))
            throw new Error("Spoken response did not identify the unique visible desktop project.");
        if (
            !/\b(hi|hello|hey)\b/i.test(assistantText) ||
            !/\b(can|able|help|capabilit)/i.test(assistantText)
        )
            throw new Error("Spoken response did not greet and describe its capabilities.");
        const stats = result.media as Awaited<ReturnType<LiveVoiceMedia["stats"]>>;
        if (
            !stats.reports.some((entry) => entry.type === "inbound-rtp" && entry.bytes > 0) ||
            stats.receivedEnergy <= 0
        )
            throw new Error("No real inbound speaker audio was measured.");
        finishedRecordings = await page.evaluate(() =>
            (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.recordingsFinish(),
        );
        await page.getByRole("button", { name: "End voice call", exact: true }).click();
        result.stage = "ending-call";
        await page
            .getByRole("button", { name: "Start voice call", exact: true })
            .waitFor({ timeout: 15_000 });
        const hello = events.find((event) => event.frame.type === "hello");
        if (!hello || typeof hello.frame.sessionId !== "string")
            throw new Error("The provider call did not report its durable session identity.");
        const client = happyAgentClientCreate(runtime.socketPath, runtime.token);
        let closed = await client.getLiveSession(hello.frame.sessionId as Cuid2);
        const closeDeadline = Date.now() + 45_000;
        while (closed.session.status === "closing" && Date.now() < closeDeadline) {
            await page.waitForTimeout(250);
            closed = await client.getLiveSession(hello.frame.sessionId as Cuid2);
        }
        result.closedSession = { status: closed.session.status, usage: closed.session.usage };
        if (closed.session.status !== "closed")
            throw new Error("The live session did not close durably after End.");
        result.status = "passed";
        result.stage = "complete";
    } catch (error) {
        failure = error;
        result.error = error instanceof Error ? error.message : String(error);
        if (page)
            await page
                .screenshot({ path: join(paths.artifacts, "failure.png") })
                .catch(() => undefined);
    } finally {
        clearInterval(lifetime);
        if (page) {
            if (result.media === undefined)
                result.media = await page
                    .evaluate(() =>
                        (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym?.stats(),
                    )
                    .catch(() => undefined);
            if (result.transcripts === undefined)
                result.transcripts = events
                    .filter((event) => event.frame.type === "transcript")
                    .map((event) => event.frame);
            const recordings =
                finishedRecordings ??
                (await page
                    .evaluate(() =>
                        (
                            window as Window & { voiceGym?: LiveVoiceMedia }
                        ).voiceGym?.recordingsFinish(),
                    )
                    .catch(() => undefined));
            result.recordings = [];
            for (const recording of recordings ?? []) {
                const path = join(paths.artifacts, `${recording.name}.webm`);
                await writeFile(path, Buffer.from(recording.base64, "base64"));
                (result.recordings as unknown[]).push({
                    name: recording.name,
                    path,
                    bytes: recording.bytes,
                });
            }
            await page
                .evaluate(() =>
                    (
                        window as Window & { voiceGym?: LiveVoiceMedia }
                    ).voiceGym?.microphoneRelease(),
                )
                .catch(() => undefined);
        }
        await app?.close().catch(() => undefined);
        await runtime?.stop().catch(() => undefined);
        result.finishedAt = new Date().toISOString();
        await writeFile(
            join(paths.artifacts, "control-events.json"),
            JSON.stringify(events, null, 2),
        );
        await writeFile(join(paths.artifacts, "result.json"), JSON.stringify(result, null, 2));
        await writeFile(join(paths.artifacts, "network.json"), JSON.stringify(network, null, 2));
        const transcript = (role: "user" | "assistant") =>
            events
                .filter((event) => event.frame.type === "transcript" && event.frame.role === role)
                .map((event) => String(event.frame.text))
                .join("");
        await writeFile(
            join(paths.artifacts, "transcript.txt"),
            `User:${transcript("user")}\n\nAssistant:${transcript("assistant")}\n`,
        );
        console.log(
            JSON.stringify(
                { status: result.status, artifactDirectory: paths.artifacts, error: result.error },
                null,
                2,
            ),
        );
    }
    if (failure) throw failure;
}
