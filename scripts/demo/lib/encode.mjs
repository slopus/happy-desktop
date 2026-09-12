import { spawn } from "node:child_process";

/*
 * The last pass: composed frames into a file anyone can post.
 *
 * H.264 in yuv420p with faststart, because that is the one combination every
 * browser, every timeline, and every social upload accepts without
 * re-encoding it themselves and undoing the work above. The fades live in the
 * composed frames (in linear light); the encoder adds nothing but the codec.
 */
export async function encode(options) {
    const seconds = options.frames / options.fps;
    const argv = [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        options.listing,
        ...(options.soundtrack ? ["-i", options.soundtrack] : []),
        "-vf",
        `fps=${options.fps},format=yuv420p`,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        ...(options.soundtrack ? ["-c:a", "aac", "-b:a", "160k", "-shortest"] : []),
        "-movflags",
        "+faststart",
        options.target,
    ];
    await new Promise((settle, fail) => {
        const child = spawn("ffmpeg", argv, { stdio: ["ignore", "inherit", "inherit"] });
        child.once("error", fail);
        child.once("exit", (code) =>
            code === 0 ? settle() : fail(new Error(`ffmpeg exited with ${code}.`)),
        );
    });
    return { seconds };
}
