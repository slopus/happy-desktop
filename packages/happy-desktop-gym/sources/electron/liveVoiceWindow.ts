import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ElectronApplication, Page } from "playwright";
import { gymElectronLaunch } from "./launch.js";
import { electronEntrypointResolve } from "./paths.js";
import { liveVoiceMediaInstall, type LiveVoiceMedia } from "./liveVoiceMedia.js";
import {
    LIVE_VOICE_MUTE_SWITCH,
    liveVoiceSpeakersMute,
    liveVoiceSpeakersVerify,
} from "./liveVoiceSilence.js";
import type { GymRunPaths } from "./types.js";

const exec = promisify(execFile);

/** The visible phone: every mounted connection surface draws its own. */
export const PHONE = ".happy-gpt-live-phone:visible";

/** A control frame as the window sent or received it, stamped in epoch ms. */
export type ControlEvent = {
    direction: "received" | "sent";
    receivedAt: string;
    at: number;
    bytes: number;
    frame: Record<string, unknown>;
};

/** One request the window made to a Happy Agent, timed from its start to its end. */
export type RequestTiming = {
    method: string;
    path: string;
    startedAt: number;
    finishedAt?: number;
    status?: number;
    requestBytes: number;
    failed?: string;
};

export type LiveVoiceWindow = {
    readonly app: ElectronApplication;
    readonly page: Page;
    readonly events: ControlEvent[];
    readonly requests: RequestTiming[];
    /** When each control socket opened, in epoch ms. */
    readonly sockets: number[];
};

/**
 * The hidden desktop window for a live lane: speakers silenced and verified,
 * media instrumented, every control frame and Happy Agent request recorded.
 */
export async function liveVoiceWindowOpen(input: {
    readonly paths: GymRunPaths;
    readonly environment: Record<string, string>;
}): Promise<LiveVoiceWindow> {
    const { paths } = input;
    const entrypoint = electronEntrypointResolve(paths.workspaceRoot);
    const app = await gymElectronLaunch({
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
            ...input.environment,
            HAPPY_ALLOW_SOURCE_AGENT: "1",
            HAPPY_DESKTOP_GYM_PROFILE: "smoke",
            HAPPY_DESKTOP_GYM_ELECTRON_USER_DATA: paths.electronUserData,
        },
        timeout: 60_000,
    });
    await liveVoiceSpeakersMute(app);
    const page = await app.firstWindow();
    const events: ControlEvent[] = [];
    const requests: RequestTiming[] = [];
    const sockets: number[] = [];
    const pending = new Map<object, RequestTiming>();
    page.on("request", (request) => {
        const url = new URL(request.url());
        if (!url.pathname.includes("/v0/")) return;
        const timing: RequestTiming = {
            method: request.method(),
            path: url.pathname,
            startedAt: Date.now(),
            requestBytes: request.postDataBuffer()?.byteLength ?? 0,
        };
        pending.set(request, timing);
        requests.push(timing);
    });
    page.on("requestfinished", (request) => {
        const timing = pending.get(request);
        if (!timing) return;
        timing.finishedAt = Date.now();
        pending.delete(request);
        void request.response().then((response) => {
            if (response) timing.status = response.status();
        });
    });
    page.on("requestfailed", (request) => {
        const timing = pending.get(request);
        if (!timing) return;
        timing.finishedAt = Date.now();
        timing.failed = request.failure()?.errorText ?? "failed";
        pending.delete(request);
    });
    page.on("websocket", (socket) => {
        if (!socket.url().includes("/live/")) return;
        sockets.push(Date.now());
        const capture = (direction: "received" | "sent", payload: string | Buffer) => {
            try {
                const text = payload.toString();
                const frame = JSON.parse(text) as Record<string, unknown>;
                events.push({
                    direction,
                    receivedAt: new Date().toISOString(),
                    at: Date.now(),
                    bytes: Buffer.byteLength(text),
                    frame,
                });
                if (frame.type === "actionRequested" || frame.type === "actionResult")
                    console.log(
                        JSON.stringify({
                            stage: "frame",
                            direction,
                            type: frame.type,
                            action: (frame.action as { type?: string } | undefined)?.type,
                            result: (frame.result as { status?: string } | undefined)?.status,
                        }),
                    );
            } catch {
                /* Non-JSON frames are not control frames. */
            }
        };
        socket.on("framereceived", ({ payload }) => capture("received", payload));
        socket.on("framesent", ({ payload }) => capture("sent", payload));
    });
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(
        `(() => { const __name = (value) => value; (${liveVoiceMediaInstall.toString()})(); })()`,
    );
    await liveVoiceSpeakersVerify(app, page);
    return { app, page, events, requests, sockets };
}

/** Selects a connection on the rail by the node name its daemon published. */
export async function railSelect(page: Page, node: string) {
    await page
        .getByRole("button", { name: new RegExp(`^${node},`) })
        .first()
        .click();
    await page.waitForTimeout(1_500);
}

/** Opens Settings → Voice on the surface on screen. */
export async function voiceSettingsOpen(page: Page) {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Voice", exact: true }).click();
}

/**
 * Turns calls on (once per window) and chooses this agent's voice account in
 * its own Settings → Voice, then goes back.
 */
export async function voiceAccountChoose(page: Page, account: string) {
    await voiceSettingsOpen(page);
    const calls = page.getByRole("switch", { name: "Enable GPT-Live voice" });
    if ((await calls.getAttribute("aria-checked")) !== "true") await calls.click();
    const select = page.getByRole("combobox", { name: "Voice account" });
    await select.waitFor({ timeout: 30_000 });
    await page.waitForFunction(
        (value) =>
            [...document.querySelectorAll<HTMLSelectElement>('[aria-label="Voice account"]')].some(
                (item) => [...item.options].some((option) => option.value === value),
            ),
        account,
        { timeout: 30_000 },
    );
    await select.selectOption(account);
    await page.waitForTimeout(500);
}

export async function settingsBack(page: Page) {
    await page.getByRole("button", { name: "Back", exact: true }).click();
}

export async function shot(page: Page, paths: GymRunPaths, name: string) {
    const path = join(paths.artifacts, `${name}.png`);
    await mkdir(join(path, ".."), { recursive: true });
    await page.screenshot({ path });
}

/** Writes speech to a file with macOS `say`; nothing is played. */
export async function speechWrite(directory: string, name: string, text: string): Promise<string> {
    const aiff = join(directory, `${name}.aiff`);
    const wav = join(directory, `${name}.wav`);
    await exec("/usr/bin/say", ["-o", aiff, text]);
    await exec("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@48000", aiff, wav]);
    return wav;
}

/**
 * A voice call reloads the selected sign-in but never refreshes it, so an
 * expired ChatGPT access token fails only after the whole fixture is built.
 * Reads the token's expiry claim alone; nothing is printed or written.
 */
export async function signInFreshAssert(authFile: string) {
    const document = JSON.parse(await readFile(authFile, "utf8")) as {
        tokens?: { access_token?: string };
    };
    const payload = document.tokens?.access_token?.split(".")[1];
    if (!payload) return;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
        exp?: number;
    };
    if (typeof exp === "number" && exp * 1_000 < Date.now() + 30 * 60_000)
        throw new Error(
            `The Codex sign-in at --auth-file expires at ${new Date(exp * 1_000).toISOString()}; voice will refuse it. Sign in to Codex again or choose a current sign-in.`,
        );
}

/** Each utterance in order: consecutive fragments of one role, whatever their delta IDs. */
export function transcriptOf(
    events: readonly ControlEvent[],
    role: "user" | "assistant",
): string[] {
    const utterances: string[] = [];
    let speaking = false;
    for (const event of events) {
        if (event.frame.type !== "transcript") continue;
        if (event.frame.role !== role) {
            speaking = false;
            continue;
        }
        if (speaking) utterances[utterances.length - 1] += String(event.frame.text);
        else utterances.push(String(event.frame.text));
        speaking = true;
    }
    return utterances.map((utterance) => utterance.trim());
}

/** Each desktop action the call asked for, with how long the window took to answer it. */
export function actionsOf(events: readonly ControlEvent[]) {
    const answered = new Map(
        events
            .filter((event) => event.frame.type === "actionResult")
            .map((event) => [String(event.frame.actionId), event]),
    );
    return events
        .filter((event) => event.frame.type === "actionRequested")
        .map((event) => {
            const result = answered.get(String(event.frame.actionId));
            const outcome = result?.frame.result as
                | { status?: string; code?: string; message?: string }
                | undefined;
            return {
                type: (event.frame.action as { type?: string } | undefined)?.type,
                requestedAt: event.at,
                windowMs: result ? result.at - event.at : null,
                resultBytes: result?.bytes ?? null,
                status: outcome?.status ?? null,
                ...(outcome?.code ? { code: outcome.code } : {}),
                ...(outcome?.message ? { message: outcome.message } : {}),
            };
        });
}

export type Turn = {
    readonly say: string;
    /** Runs while the call stays open, before this turn is spoken. */
    readonly before?: () => Promise<void>;
};

/**
 * The window's call as the person sees it: the call bar's state while a call
 * is connecting, active or ended, otherwise the visible phone's status. Runs in
 * the page; null when neither is on screen.
 */
export function callStatusRead(): string | null {
    const shown = (element: HTMLElement) => element.getClientRects().length > 0;
    const bar = [...document.querySelectorAll<HTMLElement>(".happy-gpt-live-call")].find(shown);
    if (bar) return bar.getAttribute("data-state");
    return (
        [...document.querySelectorAll<HTMLElement>(".happy-gpt-live-phone")]
            .find(shown)
            ?.getAttribute("data-status") ?? null
    );
}

export async function phoneStatus(page: Page): Promise<string | null> {
    // tsx names nested functions through a helper the page doesn't have.
    return page.evaluate<string | null>(
        `(() => { const __name = (value) => value; return (${callStatusRead.toString()})(); })()`,
    );
}

/** Waits until the call shows one of `statuses`; resolves to the status seen last. */
export async function callStatusAwait(
    page: Page,
    statuses: readonly string[],
    timeoutMs: number,
): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    let status = await phoneStatus(page);
    while (Date.now() < deadline && !statuses.includes(status ?? "")) {
        await page.waitForTimeout(25);
        status = await phoneStatus(page);
    }
    return status;
}

/** Why the call ended, as its tooltip says it: the call bar's reason, else the phone's. */
export async function endedMessage(page: Page): Promise<string> {
    const reason = page.locator(".happy-gpt-live-call__reason:visible");
    await ((await reason.count()) > 0 ? reason.first() : page.locator(PHONE).first()).hover();
    await page.waitForTimeout(700);
    return (
        await page
            .locator('[role="tooltip"]')
            .allInnerTexts()
            .catch(() => [])
    ).join(" | ");
}

/** Puts an ended call away: the call bar's Close, where the build has one. */
export async function endedDismiss(page: Page) {
    if ((await phoneStatus(page)) !== "ended") return;
    const close = page.getByRole("button", { name: "Close", exact: true });
    if ((await close.count()) > 0) await close.first().click();
}

/** A received level above this is speech, far above Opus comfort noise. */
const SPEECH_LEVEL = 1e-4;

/**
 * Presses the visible phone, speaks each turn into the virtual microphone and
 * waits out its answer, then ends the call. Times the opening, and for each
 * turn the end of speech to the first received audio and first transcript.
 */
export async function voiceCall(input: {
    window: LiveVoiceWindow;
    paths: GymRunPaths;
    name: string;
    turns: readonly Turn[];
}): Promise<Record<string, unknown>> {
    const { paths, name } = input;
    const { app, page, events, requests, sockets } = input.window;
    const directory = join(paths.artifacts, name);
    await mkdir(directory, { recursive: true });
    const firstEvent = events.length;
    const firstRequest = requests.length;
    const firstSocket = sockets.length;
    const outcome: Record<string, unknown> = { status: "failed", turns: [] };
    await page.evaluate(() =>
        (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.peersReset(),
    );
    console.log(JSON.stringify({ stage: "call-starting", name }));
    try {
        const pressedAt = Date.now();
        await page.getByRole("button", { name: "Start voice call", exact: true }).click();
        let status: string | null = null;
        let settledAt = pressedAt;
        while (Date.now() - pressedAt < 90_000) {
            status = await phoneStatus(page);
            if (status === "active" || status === "ended") {
                settledAt = Date.now();
                break;
            }
            await page.waitForTimeout(25);
        }
        outcome.phoneStatus = status;
        outcome.opening = openingOf({
            pressedAt,
            settledAt,
            requests: requests.slice(firstRequest),
            events: events.slice(firstEvent),
            socketAt: sockets[firstSocket] ?? null,
        });
        if (status !== "active") {
            outcome.tooltip = await endedMessage(page);
            await shot(page, paths, `${name}/not-active`);
            return outcome;
        }
        outcome.silenceDuringCall = await liveVoiceSpeakersVerify(app, page);
        await shot(page, paths, `${name}/active`);
        for (const [index, turn] of input.turns.entries()) {
            if (turn.before) await turn.before();
            const turnStart = events.length;
            const wav = await speechWrite(directory, `turn-${index + 1}`, turn.say);
            const playback = await page.evaluate(
                (base64) =>
                    (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.microphonePlay(
                        base64,
                    ),
                (await readFile(wav)).toString("base64"),
            );
            const speechEnd = playback.startedAt + Math.round(playback.durationSeconds * 1_000);
            console.log(JSON.stringify({ stage: "turn", name, index, say: turn.say }));
            await responseSettled(page, events, turnStart, playback.durationSeconds);
            const turnEvents = events.slice(turnStart);
            const firstAudioAt = await page.evaluate(
                ([since, threshold]) =>
                    (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.audioAfter(
                        since!,
                        threshold!,
                    ),
                [speechEnd, SPEECH_LEVEL] as const,
            );
            const firstTranscriptAt =
                turnEvents.find(
                    (event) =>
                        event.frame.type === "transcript" &&
                        event.frame.role === "assistant" &&
                        event.at >= speechEnd,
                )?.at ?? null;
            (outcome.turns as unknown[]).push({
                said: turn.say,
                heardUser: transcriptOf(turnEvents, "user"),
                assistant: transcriptOf(turnEvents, "assistant"),
                actions: actionsOf(turnEvents),
                speechEnd,
                firstAudioMs: firstAudioAt === null ? null : firstAudioAt - speechEnd,
                firstTranscriptMs:
                    firstTranscriptAt === null ? null : firstTranscriptAt - speechEnd,
                phoneStatus: await phoneStatus(page),
            });
            await shot(page, paths, `${name}/turn-${index + 1}`);
            if ((await phoneStatus(page)) !== "active") break;
        }
        outcome.media = await page.evaluate(() =>
            (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.stats(),
        );
        const hello = events.slice(firstEvent).find((event) => event.frame.type === "hello");
        outcome.sessionId = hello?.frame.sessionId;
        if ((await phoneStatus(page)) === "active") {
            await page.getByRole("button", { name: "End voice call", exact: true }).click();
            await page
                .getByRole("button", { name: "Start voice call", exact: true })
                .waitFor({ timeout: 30_000 });
        }
        outcome.status = "ended";
    } catch (error) {
        outcome.error = error instanceof Error ? error.message : String(error);
        await shot(page, paths, `${name}/failure`).catch(() => undefined);
    } finally {
        const recordings = await page
            .evaluate(() =>
                (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.recordingsFinish(),
            )
            .catch(() => []);
        outcome.recordings = [];
        for (const recording of recordings) {
            const path = join(directory, `${recording.name}.webm`);
            await writeFile(path, Buffer.from(recording.base64, "base64"));
            (outcome.recordings as unknown[]).push({
                name: recording.name,
                path,
                bytes: recording.bytes,
            });
        }
        await page
            .evaluate(() =>
                (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.microphoneRelease(),
            )
            .catch(() => undefined);
        const callEvents = events.slice(firstEvent);
        outcome.desktopContexts = callEvents
            .filter((event) => event.frame.type === "desktopContext")
            .map((event) => ({ ...contextSummary(event.frame), bytes: event.bytes }));
        outcome.assistant = transcriptOf(callEvents, "assistant");
        outcome.user = transcriptOf(callEvents, "user");
        outcome.statusFrames = callEvents
            .filter((event) => event.frame.type === "status")
            .map((event) => event.frame);
        await writeFile(
            join(directory, "control-events.json"),
            JSON.stringify(callEvents, null, 2),
        );
        await writeFile(
            join(directory, "requests.json"),
            JSON.stringify(requests.slice(firstRequest), null, 2),
        );
        await writeFile(join(directory, "outcome.json"), JSON.stringify(outcome, null, 2));
        console.log(
            JSON.stringify({
                stage: "call-finished",
                name,
                assistant: outcome.assistant,
                error: outcome.error,
            }),
        );
    }
    return outcome;
}

/**
 * Where an opening's time went, from the window's own requests and frames:
 * availability (health and config), microphone and offer, the create request
 * (reservation, provider allocation and sideband), SDP answer and control
 * socket, the hello, provider readiness, then the phone going active.
 */
function openingOf(input: {
    pressedAt: number;
    settledAt: number;
    requests: readonly RequestTiming[];
    events: readonly ControlEvent[];
    socketAt: number | null;
}) {
    const ending = (suffix: string, method = "GET") =>
        input.requests.filter((item) => item.method === method && item.path.endsWith(suffix));
    const health = ending("/v0/health");
    const config = ending("/v0/config");
    const create = ending("/v0/live/sessions", "POST")[0];
    const hello = input.events.find((event) => event.frame.type === "hello");
    const active = input.events.find(
        (event) => event.frame.type === "status" && event.frame.status === "active",
    );
    const context = input.events.find((event) => event.frame.type === "desktopContext");
    const since = (at: number | null | undefined) =>
        at === null || at === undefined ? null : at - input.pressedAt;
    const availabilityEnd = config.at(-1)?.finishedAt;
    return {
        pressedAt: input.pressedAt,
        totalMs: input.settledAt - input.pressedAt,
        availabilityDoneMs: since(availabilityEnd),
        createStartMs: since(create?.startedAt),
        createMs: create?.finishedAt !== undefined ? create.finishedAt - create.startedAt : null,
        createRequestBytes: create?.requestBytes ?? null,
        createStatus: create?.status ?? null,
        socketOpenMs: since(input.socketAt),
        helloMs: since(hello?.at),
        providerActiveMs: since(active?.at),
        firstContextBytes: context?.bytes ?? null,
        healthRequests: health.length,
        configRequests: config.length,
    };
}

/** The provider has answered once no transcript or action has moved for a while. */
async function responseSettled(
    page: Page,
    events: ControlEvent[],
    from: number,
    speechSeconds: number,
) {
    await page.waitForTimeout(Math.ceil(speechSeconds * 1_000) + 1_000);
    const deadline = Date.now() + 150_000;
    let seen = events.length;
    let movedAt = Date.now();
    while (Date.now() < deadline) {
        if (events.length !== seen) {
            seen = events.length;
            movedAt = Date.now();
        }
        const recent = events.slice(from);
        const answered = recent.some(
            (event) => event.frame.type === "transcript" && event.frame.role === "assistant",
        );
        const requested = recent.filter((event) => event.frame.type === "actionRequested").length;
        const finished = recent.filter((event) => event.frame.type === "actionResult").length;
        const quietMs = Date.now() - movedAt;
        if (answered && requested === finished && quietMs > 10_000) return;
        if (
            recent.some(
                (event) =>
                    event.frame.type === "status" &&
                    (event.frame.status === "failed" || event.frame.status === "closed"),
            )
        )
            return;
        if ((await phoneStatus(page)) !== "active") return;
        await page.waitForTimeout(500);
    }
}

/** Rows per connection, without message text, so the catalog's shape is visible. */
export function contextSummary(frame: Record<string, unknown>) {
    const context = frame.context as {
        activeConnectionId: string | null;
        activeTarget: unknown;
        connections: { connectionId: string; online: boolean }[];
        projects: { target: { connectionId: string }; name: string }[];
        sessions: { target: { connectionId: string }; title: string }[];
        activeSession: {
            target: unknown;
            messages: unknown[];
            writeRefusal: string | null;
        } | null;
        truncated: boolean;
    };
    const per = (rows: { target: { connectionId: string } }[]) =>
        Object.fromEntries(
            context.connections.map((connection) => [
                connection.connectionId,
                rows.filter((row) => row.target.connectionId === connection.connectionId).length,
            ]),
        );
    return {
        revision: frame.revision,
        activeConnectionId: context.activeConnectionId,
        activeTarget: context.activeTarget,
        connections: context.connections,
        projects: per(context.projects),
        sessions: per(context.sessions),
        activeSession: context.activeSession
            ? {
                  target: context.activeSession.target,
                  messages: context.activeSession.messages.length,
                  writeRefusal: context.activeSession.writeRefusal,
              }
            : null,
        truncated: context.truncated,
    };
}
