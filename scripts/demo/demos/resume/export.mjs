import { execFile as execFileCallback } from "node:child_process";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const sourceDirectory = resolve(process.argv[2]);
const targetDirectory = resolve(process.argv[3] ?? ".context/demo-out");
const source = resolve(sourceDirectory, "resume.mp4");
const target = resolve(targetDirectory, "seamless-update-x.mp4");
const poster = resolve(targetDirectory, "seamless-update-poster.png");
const recordingEvidence = resolve(sourceDirectory, "resume.evidence.json");
const evidence = JSON.parse(await readFile(recordingEvidence, "utf8"));
const typing = evidence.downTyping
    .filter((entry) => ["stopping", "starting", "reconnecting"].includes(entry.installerPhase))
    .at(-1);
if (!typing) throw new Error("Missing actual restart typing evidence for the poster");
await mkdir(targetDirectory, { recursive: true });
await execFile("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    source,
    "-map",
    "0:v:0",
    "-c:v",
    "copy",
    "-an",
    "-movflags",
    "+faststart",
    target,
]);
const { stdout } = await execFile("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    target,
]);
const probe = JSON.parse(stdout);
const [video] = probe.streams;
if (
    probe.streams.length !== 1 ||
    video.codec_name !== "h264" ||
    video.width !== 1080 ||
    video.height !== 1350 ||
    video.pix_fmt !== "yuv420p"
)
    throw new Error("Export must be silent 1080×1350 H.264 yuv420p");
if (Math.abs(Number(probe.format.duration) - evidence.timing.frames / evidence.timing.fps) > 0.03)
    throw new Error("Export duration differs from the continuous take");
// Let the compositor publish the last typed character before selecting the frame.
const posterSeconds = typing.frames / evidence.timing.fps + 0.25;
await execFile("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(posterSeconds),
    "-i",
    target,
    "-frames:v",
    "1",
    poster,
]);
await copyFile(
    resolve(sourceDirectory, "resume.srt"),
    resolve(targetDirectory, "seamless-update.srt"),
);
await writeFile(
    resolve(targetDirectory, "export.json"),
    JSON.stringify(
        {
            source,
            target,
            poster,
            posterSeconds,
            bytes: (await stat(target)).size,
            probe,
            recordingEvidence,
        },
        null,
        2,
    ),
);
process.stdout.write(`${target}\n${poster}\n`);
