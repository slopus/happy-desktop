import { spawn } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/*
 * The cut taken apart, for a page that stages the two devices itself: the
 * desktop window alone, with its traffic lights baked in and the cut's
 * soundtrack, and the phone's screen alone, without its frame. Both keep
 * exactly the cut's frames — the same `select` rule the composition applied
 * — so frame i of each track is frame i of the composed movie, and a page
 * can play them side by side on one clock.
 *
 * Each track is encoded straight from its take: AV1 at the recorded size and
 * 60fps, H.264 High at level 5.1 at 60fps (within every Mac's hardware
 * decoder), and an 80% 30fps cut of each for phones and older browsers.
 * Colour follows encode.mjs: limited-range BT.709, tagged.
 */

const colourTags = [
    "-color_range",
    "tv",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "iec61966-2-1",
];

function run(argv) {
    return new Promise((settle, fail) => {
        const child = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...argv], {
            // SVT-AV1 prints its configuration unless asked for errors only.
            env: { ...process.env, SVT_LOG: "1" },
            stdio: ["ignore", "inherit", "inherit"],
        });
        child.once("error", fail);
        child.once("exit", (code) =>
            code === 0 ? settle() : fail(new Error(`ffmpeg exited with ${code}.`)),
        );
    });
}

/** The overlay in the track's own colour space, so the lights keep their sRGB colours. */
const lightsFormat =
    "format=rgba,scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuva420p";

/** The 80% size, kept even for 4:2:0. */
const reduced = (size) => Math.round((size * 0.8) / 2) * 2;

const codecs = {
    av1: ["-c:v", "libsvtav1", "-preset", "5", "-crf", "30", "-g", "240"],
    // Preset slow keeps x264 to 5 reference frames, inside level 5.1 at these sizes.
    h264: [
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "16",
        "-profile:v",
        "high",
        "-level:v",
        "5.1",
        "-movflags",
        "+faststart",
    ],
};

/**
 * Encodes one track in every web variant. `picture` is the filter chain that
 * turns the take's selected frames into the track's picture; `overlay`, if
 * any, is an image laid over it first.
 */
async function trackEncode({ name, source, overlay, select, size, frames, fps, soundtrack, out }) {
    const variants = [
        { file: `${name}.webm`, codec: "av1", rate: fps, size },
        { file: `${name}.mp4`, codec: "h264", rate: fps, size },
        {
            file: `${name}-30.webm`,
            codec: "av1",
            rate: fps / 2,
            size: { width: reduced(size.width), height: reduced(size.height) },
        },
        {
            file: `${name}-30.mp4`,
            codec: "h264",
            rate: fps / 2,
            size: { width: reduced(size.width), height: reduced(size.height) },
        },
    ];
    const results = [];
    for (const variant of variants) {
        const target = join(out, variant.file);
        const scale =
            variant.size.width === size.width
                ? ""
                : `,scale=${variant.size.width}:${variant.size.height}:flags=lanczos`;
        const graph = [
            `[0:v]select='${select}',setpts=N/(${fps}*TB)[cut]`,
            overlay
                ? `[1:v]${lightsFormat}[lights];[cut][lights]overlay=0:0[lit]`
                : `[cut]null[lit]`,
            `[lit]fps=${variant.rate}${scale},format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709[v]`,
        ].join(";");
        const audio = soundtrack
            ? variant.codec === "av1"
                ? ["-map", `${overlay ? 2 : 1}:a`, "-c:a", "libopus", "-b:a", "96k"]
                : ["-map", `${overlay ? 2 : 1}:a`, "-c:a", "aac", "-b:a", "128k"]
            : [];
        await run([
            "-i",
            source,
            ...(overlay ? ["-i", overlay] : []),
            ...(soundtrack ? ["-i", soundtrack] : []),
            "-filter_complex",
            graph,
            "-map",
            "[v]",
            ...audio,
            ...codecs[variant.codec],
            ...colourTags,
            "-frames:v",
            // Whole frames only, so a 30fps desktop and phone pair end together.
            String(Math.floor((frames * variant.rate) / fps)),
            ...(soundtrack ? ["-shortest"] : []),
            target,
        ]);
        results.push({ ...variant, bytes: (await stat(target)).size });
        process.stdout.write(`    ${target}\n`);
    }
    // Frame 0 of the cut, for the page to show before it plays.
    const poster = join(out, `${name}-poster.webp`);
    await run([
        "-i",
        source,
        ...(overlay ? ["-i", overlay] : []),
        "-filter_complex",
        `[0:v]select='${select}',setpts=N/(${fps}*TB)[cut];${overlay ? `[1:v]${lightsFormat}[lights];[cut][lights]overlay=0:0[v]` : "[cut]null[v]"}`,
        "-map",
        "[v]",
        "-frames:v",
        "1",
        "-c:v",
        "libwebp",
        "-quality",
        "94",
        poster,
    ]);
    results.push({ file: `${name}-poster.webp`, bytes: (await stat(poster)).size });
    return results;
}

/** `*word*` accents are the composition's markup, not the caption's text. */
const captionText = (text) => text.replaceAll("*", "");

function vttStamp(seconds) {
    const milliseconds = Math.round(seconds * 1000);
    const pad = (value, width = 2) => String(value).padStart(width, "0");
    return `${pad(Math.floor(milliseconds / 3_600_000))}:${pad(Math.floor(milliseconds / 60_000) % 60)}:${pad(Math.floor(milliseconds / 1000) % 60)}.${pad(milliseconds % 1000, 3)}`;
}

/** The composition's captions on the cut's clock, for a page that sets them itself. */
function captionsVtt(composition, cues, seconds) {
    const at = (reference) => {
        if (typeof reference === "number") return reference;
        const [name, occurrence = "1"] = reference.split("#");
        const found = cues.filter((cue) => cue.name === name)[Number(occurrence) - 1];
        if (!found) throw new Error(`The cues have no "${reference}" cue.`);
        return found.seconds;
    };
    const captions = composition.captions ?? [];
    const lines = captions.map((caption, index) => {
        const from = at(caption.from);
        const to =
            caption.to !== undefined
                ? at(caption.to)
                : index + 1 < captions.length
                  ? at(captions[index + 1].from)
                  : seconds;
        return `${vttStamp(from)} --> ${vttStamp(to)}\n${captionText(caption.text)}\n`;
    });
    return `WEBVTT\n\n${lines.join("\n")}`;
}

/**
 * Writes the split tracks, their posters, the captions, and `take.json`: the
 * cut's length, each track's size, every cue on the cut's clock, and the
 * stretch the composition names as the phone's part. `windowOverlay` is a
 * PNG at the window's recorded size laid over every desktop frame: its
 * traffic lights, and any pictures swapped in for the take's placeholders.
 */
export async function splitEncode({
    composition,
    desktop,
    desktopSize,
    windowOverlay,
    phone,
    select,
    frames,
    cues,
    soundtrack,
    out,
    work,
}) {
    const { fps } = composition.output;
    await rm(out, { force: true, recursive: true });
    await mkdir(out, { recursive: true });
    const lights = join(work, "window-overlay.png");
    await writeFile(lights, windowOverlay);
    process.stdout.write(`\n  split tracks\n`);
    const desktopFiles = await trackEncode({
        name: "desktop",
        source: desktop,
        overlay: lights,
        select,
        size: desktopSize,
        frames,
        fps,
        soundtrack,
        out,
    });
    const phoneFiles = await trackEncode({
        name: "phone",
        source: phone,
        select,
        size: { width: composition.phone.screen.width, height: composition.phone.screen.height },
        frames,
        fps,
        out,
    });
    const seconds = frames / fps;
    await writeFile(join(out, "captions.vtt"), captionsVtt(composition, cues, seconds));
    const cueAt = (name) => cues.find((cue) => cue.name === name)?.seconds;
    const [focusFrom, focusTo] = composition.split.phonePart ?? [];
    await writeFile(
        join(out, "take.json"),
        JSON.stringify(
            {
                fps,
                frames,
                seconds,
                desktop: desktopSize,
                phone: {
                    width: composition.phone.screen.width,
                    height: composition.phone.screen.height,
                },
                phonePart: focusFrom && focusTo ? [cueAt(focusFrom), cueAt(focusTo)] : undefined,
                cues,
                files: [...desktopFiles, ...phoneFiles],
            },
            null,
            2,
        ) + "\n",
    );
}
