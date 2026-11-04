import { execFile as execFileCallback, spawn } from "node:child_process";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

/*
 * Steve's phone: an iPhone 17 Pro Simulator on the Mac mini, running the
 * native happy-ios built from happy's main by phone/build.sh. Steve's thumb
 * is TeamDemoUITests, started here through xcodebuild; the picture is the
 * Simulator's own screen recording, which keeps every frame the device
 * renders. The Simulator window stays open and unobscured on the Mac's
 * display, so the device renders at the display's 60 Hz.
 *
 * The recording and the desktop take share the Mac's wall clock: every
 * moment the driver acts on is printed as `TEAM_PHONE <mark> <epoch seconds>`,
 * and the phone's movie is placed on the take's timeline by time. The
 * recording's own clock starts at its first frame, which a busy or just
 * booted Simulator may write many seconds after it says it started; so once
 * Steve's sidebar is up, just before the take, the status bar reads 9:42 for
 * a moment at a noted time, and the movie's clock is read from where that
 * moment falls in it.
 */

const testId = (name) => `HappyDirectUITests/TeamDemoUITests/${name}`;
const bundleId = "com.slopus.happy.teamdemo";

async function run(command, args) {
    return (await execFile(command, args, { maxBuffer: 64 * 1024 * 1024 })).stdout;
}

const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms));

/** Where the status bar's clock is drawn on the Simulator's 1206×2622 screen. */
const clockCrop = { x: 120, y: 40, width: 220, height: 100 };

/**
 * The movie seconds at which the status bar's clock changed, from its first
 * frames: a frame whose clock differs from the frame before it in more than
 * a few dozen pixels.
 */
async function clockChanges(source, times, within) {
    const count = times.filter((time) => time < within).length;
    const width = clockCrop.width / 2;
    const height = clockCrop.height / 2;
    const { stdout } = await execFile(
        "ffmpeg",
        [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            source,
            "-frames:v",
            String(count),
            "-vf",
            `crop=${clockCrop.width}:${clockCrop.height}:${clockCrop.x}:${clockCrop.y},scale=${width}:${height},format=gray`,
            "-fps_mode",
            "passthrough",
            "-f",
            "rawvideo",
            "-",
        ],
        { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 },
    );
    const size = width * height;
    const changes = [];
    for (let index = 1; index < Math.min(count, stdout.length / size); index += 1) {
        let changed = 0;
        for (let pixel = 0; pixel < size; pixel += 1)
            if (Math.abs(stdout[index * size + pixel] - stdout[(index - 1) * size + pixel]) > 60)
                changed += 1;
        if (changed > 25) changes.push(times[index]);
    }
    return changes;
}

export async function phoneOpen({ output, work }) {
    const root = join(homedir(), "team-demo-ios");
    const udid =
        process.env.TEAM_PHONE_UDID ?? (await readFile(join(root, "sim-udid"), "utf8")).trim();
    const products = join(
        process.env.TEAM_PHONE_DERIVED ?? join(root, "dd-sim"),
        "Build",
        "Products",
    );
    const runFile = (await readdir(products)).find((name) => name.endsWith(".xctestrun"));
    if (!runFile) throw new Error(`No built phone driver in ${products}; run phone/build.sh.`);
    const directory = join(work, "phone");
    await mkdir(directory, { recursive: true });
    // Where the recorder tells Steve's driver a moment has come: a file the
    // driver, on the same Mac, waits to see. A take starts with none.
    const signals = join(directory, "signals");
    await rm(signals, { force: true, recursive: true });
    await mkdir(signals, { recursive: true });
    const marks = [];
    let take;
    let recording;

    /** Runs one driver test; resolves with its exit and streams its marks as they print. */
    function test(name, environment = {}) {
        const log = [];
        const waiting = new Map();
        const child = spawn(
            "xcodebuild",
            [
                "test-without-building",
                "-xctestrun",
                join(products, runFile),
                "-destination",
                `id=${udid}`,
                "-only-testing",
                testId(name),
                "-resultBundlePath",
                join(directory, `${name}-${Date.now()}.xcresult`),
            ],
            {
                env: {
                    ...process.env,
                    ...Object.fromEntries(
                        Object.entries(environment).map(([key, value]) => [
                            `TEST_RUNNER_${key}`,
                            value,
                        ]),
                    ),
                },
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        let pending = "";
        const read = (chunk) => {
            pending += chunk;
            const lines = pending.split("\n");
            pending = lines.pop();
            for (const line of lines) {
                log.push(line);
                const found = /TEAM_PHONE (\S+) ([0-9.]+)/u.exec(line);
                if (!found) continue;
                const mark = { test: name, name: found[1], epochMs: Number(found[2]) * 1000 };
                marks.push(mark);
                waiting.get(mark.name)?.(mark);
            }
        };
        child.stdout.on("data", read);
        child.stderr.on("data", read);
        let stopped = false;
        const exit = new Promise((settle) => child.once("exit", (code) => settle(code))).then(
            async (code) => {
                await writeFile(join(output, `phone-${name}.log`), log.join("\n"));
                if (code !== 0 && !stopped)
                    throw new Error(
                        `The phone driver's ${name} failed (${code}):\n${log.slice(-30).join("\n")}`,
                    );
            },
        );
        return {
            exit,
            mark(markName, timeout) {
                const seen = marks.find((mark) => mark.test === name && mark.name === markName);
                if (seen) return Promise.resolve(seen);
                return new Promise((settle, fail) => {
                    const timer = setTimeout(
                        () => fail(new Error(`The phone never reached ${markName}.`)),
                        timeout,
                    );
                    waiting.set(markName, (mark) => {
                        clearTimeout(timer);
                        settle(mark);
                    });
                });
            },
            async stop() {
                stopped = true;
                child.kill("SIGINT");
                await exit;
            },
        };
    }

    /** Apple's recording status bar: 9:41, full Wi-Fi and cellular, charged. */
    const statusBar = (time) =>
        run("xcrun", [
            "simctl",
            "status_bar",
            udid,
            "override",
            "--time",
            time,
            "--dataNetwork",
            "wifi",
            "--wifiMode",
            "active",
            "--wifiBars",
            "3",
            "--cellularMode",
            "active",
            "--cellularBars",
            "4",
            "--batteryState",
            "charged",
            "--batteryLevel",
            "100",
        ]);

    return {
        udid,
        /**
         * Boots the device in the Simulator window, on the iOS keyboard rather
         * than the Mac's, with the recording status bar.
         */
        async prepare() {
            await run("defaults", [
                "write",
                "com.apple.iphonesimulator",
                "DevicePreferences",
                "-dict-add",
                udid,
                "<dict><key>ConnectHardwareKeyboard</key><false/></dict>",
            ]);
            await run("xcrun", ["simctl", "boot", udid]).catch((error) => {
                if (!String(error.stderr).includes("current state: Booted")) throw error;
            });
            await run("xcrun", ["simctl", "bootstatus", udid, "-b"]);
            // The device's window, open on the Mac's display: Simulator, which
            // Xcode 27 ships as DeviceHub.
            const developer = (await run("xcode-select", ["-p"])).trim();
            const viewers = ["Simulator.app", "DeviceHub.app"].map((name) =>
                join(developer, "..", "Applications", name),
            );
            const viewer = (
                await Promise.all(
                    viewers.map((path) =>
                        access(path).then(
                            () => path,
                            () => undefined,
                        ),
                    ),
                )
            ).find(Boolean);
            if (!viewer)
                throw new Error("This Xcode has no Simulator window to show the phone in.");
            await run("open", ["-a", viewer, "--args", "-CurrentDeviceUDID", udid]);
            await run("xcrun", ["simctl", "ui", udid, "appearance", "dark"]);
            await statusBar("9:41");
        },
        /**
         * Pairs the phone with Happy Core as Steve once; a paired phone keeps
         * its pairing for every later take on the same world. A new world
         * starts the app over, so the phone knows only this world's server.
         */
        async pair(steve) {
            const { mobileConnector } = await steve.getMobileConnector();
            if (mobileConnector.devices.length > 0) return { paired: "earlier" };
            await run("xcrun", ["simctl", "uninstall", udid, bundleId]).catch(() => undefined);
            await run("xcrun", ["simctl", "keychain", udid, "reset"]);
            const started = (await steve.startMobilePairing()).mobileConnector;
            if (!started.pairing?.qr)
                throw new Error(`Happy Core gave no pairing code: ${started.error ?? ""}`);
            const driver = test("testPair", { TEAM_PAIRING_URL: started.pairing.qr });
            const failed = driver.exit.then(() => undefined);
            const deadline = Date.now() + 240_000;
            for (;;) {
                const { pairing } = (await steve.getMobileConnector()).mobileConnector;
                if (pairing?.status === "completed") break;
                if (["rejected", "expired", "cancelled", "failed"].includes(pairing?.status))
                    throw new Error(
                        `The phone's pairing ${pairing.status}: ${pairing.error ?? ""}`,
                    );
                if (pairing?.status === "verifying" && !pairing.desktopConfirmed)
                    await steve.confirmMobilePairing(pairing.id);
                if (Date.now() > deadline) throw new Error("The phone never finished pairing.");
                await Promise.race([new Promise((settle) => setTimeout(settle, 500)), failed]);
            }
            await driver.exit;
            return { paired: "now" };
        },
        /** Starts the recording, then Steve's take; resolves once his sidebar is up. */
        async start(environment) {
            const source = join(directory, "phone-source.mov");
            const requestedAtEpochMs = Date.now();
            const child = spawn(
                "xcrun",
                ["simctl", "io", udid, "recordVideo", "--codec=h264", "--force", source],
                { stdio: ["ignore", "pipe", "pipe"] },
            );
            let diagnostics = "";
            const exit = new Promise((settle, fail) => {
                child.once("error", fail);
                child.once("exit", (code) =>
                    code === 0
                        ? settle()
                        : fail(new Error(`Phone recording exited ${code}: ${diagnostics}`)),
                );
            });
            exit.catch(() => undefined);
            const startedAtEpochMs = await new Promise((settle, fail) => {
                const timeout = setTimeout(
                    () => fail(new Error(`Phone recording did not start: ${diagnostics}`)),
                    15000,
                );
                const receive = (chunk) => {
                    diagnostics += chunk;
                    if (diagnostics.includes("Recording started")) {
                        clearTimeout(timeout);
                        settle(Date.now());
                    }
                };
                child.stdout.on("data", receive);
                child.stderr.on("data", receive);
            });
            recording = { child, exit, source, requestedAtEpochMs, startedAtEpochMs };
            take = test("testTake", { ...environment, TEAM_SIGNALS: signals });
            take.exit.catch(() => undefined);
            await Promise.race([take.mark("ready", 180_000), take.exit]);
            // The clock mark: 9:42 for a moment, at a noted time. Steve's
            // sidebar is up, so the recording has been writing frames for a
            // while, however late its first one came, and from here nothing
            // else touches the clock until the take ends.
            await statusBar("9:42");
            recording.clockMarkEpochMs = Date.now();
            await sleep(800);
            await statusBar("9:41");
            recording.clockRestoreEpochMs = Date.now();
        },
        /** Tells Steve's driver that the moment `name` has come. */
        async signal(name) {
            await writeFile(join(signals, name), String(Date.now()));
        },
        /** Resolves when the phone has reached a mark of the running take. */
        reached(name, timeout = 600_000) {
            return take.mark(name, timeout);
        },
        get marks() {
            return marks;
        },
        /**
         * Ends Steve's take after the desktop's, then the recording. The
         * Simulator writes a frame only when the screen changes, so a status
         * bar change after the desktop's end flushes the idle tail first.
         */
        async finish() {
            if (!recording) return undefined;
            await take.stop();
            await statusBar("9:42");
            await new Promise((settle) => setTimeout(settle, 500));
            recording.child.kill("SIGINT");
            await recording.exit;
            await statusBar("9:41");
            return recording;
        },
        /**
         * The phone's movie on the take's clock: constant 60 fps from the
         * desktop's first frame, exactly as many frames as the desktop has.
         * Also measures how many distinct frames the Simulator delivered per
         * second while the phone was moving.
         */
        async export({ desktopStartedAtEpochMs, fps, frames, windows }) {
            const probe = JSON.parse(
                await run("ffprobe", [
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "frame=best_effort_timestamp_time:stream=width,height",
                    "-of",
                    "json",
                    recording.source,
                ]),
            );
            const times = probe.frames.map((frame) => Number(frame.best_effort_timestamp_time));
            // The movie's clock: where the 9:42 moment and its end fall in it,
            // the last two changes the right time apart (the app's launch
            // before them may also change the clock's corner).
            const markSeconds = (recording.clockRestoreEpochMs - recording.clockMarkEpochMs) / 1000;
            const changes = await clockChanges(
                recording.source,
                times,
                (recording.clockRestoreEpochMs - recording.startedAtEpochMs) / 1000 + 2,
            );
            const markAt = changes.findLast((change) =>
                changes.some((later) => Math.abs(later - change - markSeconds) < 0.25),
            );
            if (markAt === undefined)
                throw new Error(
                    `The phone recording never shows the status bar's 9:42 moment (changes at ${changes.map((change) => change.toFixed(2)).join(", ") || "none"}).`,
                );
            const zeroEpochMs = recording.clockMarkEpochMs - markAt * 1000;
            const trim = (desktopStartedAtEpochMs - zeroEpochMs) / 1000;
            const duration = times.at(-1) ?? 0;
            if (trim < 0 || duration < trim + frames / fps)
                throw new Error(
                    `The phone recording (${duration.toFixed(2)} s from ${trim.toFixed(2)} s) does not cover the take.`,
                );
            const cadence = windows.map(({ name, from, to }) => {
                const count = times.filter(
                    (time) => time >= trim + from && time < trim + to,
                ).length;
                return { name, from, to, frames: count, fps: count / Math.max(0.001, to - from) };
            });
            const screen = join(output, "phone-screen.mp4");
            await run("ffmpeg", [
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                recording.source,
                // The Simulator writes only changed frames: converting to a
                // constant rate first keeps an idle frame on screen through
                // the trim, where an input seek would skip to the next change.
                "-vf",
                `fps=${fps},trim=start=${trim},setpts=PTS-STARTPTS`,
                "-frames:v",
                String(frames),
                "-an",
                "-c:v",
                "libx264",
                "-crf",
                "14",
                "-preset",
                "slow",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                screen,
            ]);
            const report = {
                source: "iPhone 17 Pro Simulator (iOS 26.5) on the Mac mini, native happy-ios from happy main, recorded with simctl io recordVideo",
                bundleId,
                udid,
                size: probe.streams?.[0],
                trimSeconds: trim,
                // How long after the Simulator said it was recording its first frame came.
                firstFrameLateSeconds: (zeroEpochMs - recording.startedAtEpochMs) / 1000,
                recordedFrames: times.length,
                cadence,
            };
            await writeFile(join(output, "phone-capture.json"), JSON.stringify(report, null, 2));
            return { screen, report };
        },
    };
}
