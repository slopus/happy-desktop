import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const [takeArgument, outputArgument] = process.argv.slice(2);
if (!takeArgument || !outputArgument)
    throw new Error(
        "Usage: node scripts/demo/demos/seamless-update/export.mjs <take-directory> <output-directory>",
    );
const take = resolve(takeArgument);
const output = resolve(outputArgument);
await mkdir(output, { recursive: true });
const source = join(take, "seamless-update.mp4");
const target = join(output, "seamless-update-x.mp4");
const poster = join(output, "seamless-update-poster.png");
await execFile("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    source,
    "-vf",
    "scale=1600:1000:force_original_aspect_ratio=decrease:flags=lanczos,pad=1600:1000:(ow-iw)/2:(oh-ih)/2:color=0x111318,setsar=1",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-an",
    "-movflags",
    "+faststart",
    target,
]);
const evidence = JSON.parse(await readFile(join(take, "seamless-update.evidence.json"), "utf8"));
const phase = evidence.phases.find((phase) => phase.phase === "Typing during drain");
if (!phase) throw new Error("The take has no verified typing-during-update poster moment.");
const posterSeconds = phase.frames / evidence.timing.fps;
await execFile("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(posterSeconds),
    "-i",
    target,
    "-frames:v",
    "1",
    poster,
]);
const { stdout } = await execFile("ffprobe", [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    target,
]);
const probe = JSON.parse(stdout);
const bytes = (await stat(target)).size;
const video = probe.streams.find((stream) => stream.codec_type === "video");
if (
    Number(probe.format.duration) < 20 ||
    Number(probe.format.duration) > 40 ||
    bytes >= 512_000_000 ||
    video.width !== 1600 ||
    video.height !== 1000 ||
    video.codec_name !== "h264" ||
    probe.streams.some((stream) => stream.codec_type === "audio")
)
    throw new Error("The export does not meet the X delivery contract.");
await writeFile(
    join(output, "export.json"),
    JSON.stringify(
        {
            source,
            target,
            poster,
            posterSeconds,
            bytes,
            probe,
            recordingEvidence: join(take, "seamless-update.evidence.json"),
        },
        null,
        2,
    ) + "\n",
);
process.stdout.write(`${target}\n${poster}\n`);
