#!/usr/bin/env node
// Writes src/assets/avatar-loops/avatar-loop-NNN.mp4: the moving version of
// each of the 200 avatar placeholders, which a sidebar row plays while what it
// stands for is working. Each is drawn by @craftedstudios/shaders' own avatar
// shader (`avatarShader/shaderSource.mjs`, the phone's port) with the
// parameters happy-ios resolves for its seed (its `AvatarShaderTable.swift`),
// so frame 0 is the placeholder's still and a loop starts without a jump.
//
// Drawn in headless Chromium's WebGL2 (the shader computes its noise to the
// bit, so any GPU or SwiftShader draws the same), at four times the size and
// averaged down, which smooths topography's hard contour lines the way the
// stills' own downscale does. Without the film grain: the shader reseeds it
// every frame, which at 48 pixels reads as static, and the stills' grain is
// averaged away at this size anyway. Rows run the clock at twice the
// package's rate, as the live shader did. Each loop runs forward and then
// back over the same frames (0…n-1, n-2…1), so every step, the turn and the
// wrap included, is one ordinary step between neighbouring frames: there is
// no seam to hide and no blend to ghost.
//
// 15 frames a second, not 12: while only videos change, Chromium drops the
// window's frame rate to the videos' and rounds 12 up to 15, so a 12 fps loop
// shows its frames for one tick or two, unevenly; at 15 every frame is one.
//
// H.264 (yuv420p, faststart, no audio) for hardware decoding everywhere. The
// predicted frames drift from the picture as the loop goes on, and the
// keyframe at the wrap snaps back, which reads as a jump on a slow avatar; the
// first frame and the last second are coded finer, so the loop closes on
// nearly what it opens with.
// Needs ffmpeg with libx264 on PATH.
//
//   node packages/happy-desktop-ui/scripts/generate-avatar-loops.mjs <happy>
//
// @craftedstudios/shaders is MIT, Copyright (c) 2026 Crafted Studios; its
// notice travels with the loops (licenses/Crafted-Studios-Shaders-MIT.txt).
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { avatarShaderTableRead } from "./avatarShader/avatarShaderTable.mjs";
import { AVATAR_SHADER_FRAGMENT, AVATAR_SHADER_VERTEX } from "./avatarShader/shaderSource.mjs";

/** Device pixels across: a sidebar row's 20 CSS pixels at 2x, with room. */
const PIXELS = 48;
/** Drawn at this many times the size, then averaged down. */
const SUPERSAMPLE = 4;
const FPS = 15;
/** Forward; the loop plays them back again, so it lasts twice as long. */
const SECONDS = 5;
/** The last frames' bitrate climbs to this many times the rest. */
const CLOSE_BOOST = 6;
/** The live shader's clock rate for a row-sized avatar. */
const SPEED = 2;
const EFFECTS = { linear: 0, thermal: 1, topography: 2, plasma: 3, radial: 4 };

const happy = process.argv[2];
if (!happy) throw new Error("Pass the path to a checkout of the happy repository");
const { rows } = avatarShaderTableRead(happy);
const out = join(import.meta.dirname, "../src/assets/avatar-loops");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
/** A page with the shader compiled, and `avatarDraw` to draw one avatar's frames. */
async function pageCreate() {
    const page = await browser.newPage();
    await page.evaluate(
        ({ vertex, fragment, side }) => {
            const canvas = new OffscreenCanvas(side, side);
            const gl = canvas.getContext("webgl2", {
                antialias: false,
                preserveDrawingBuffer: true,
            });
            const shader = (type, source) => {
                const made = gl.createShader(type);
                gl.shaderSource(made, source);
                gl.compileShader(made);
                if (!gl.getShaderParameter(made, gl.COMPILE_STATUS))
                    throw new Error(gl.getShaderInfoLog(made));
                return made;
            };
            const program = gl.createProgram();
            gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
            gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
            gl.linkProgram(program);
            gl.useProgram(program);
            gl.bindVertexArray(gl.createVertexArray());
            gl.viewport(0, 0, side, side);
            gl.enable(gl.SCISSOR_TEST);
            const BAND = 16;
            const uniform = (name) => gl.getUniformLocation(program, `u_${name}`);
            // The package's defaults, without the grain.
            gl.uniform1f(uniform("warp"), 1);
            gl.uniform1f(uniform("scale"), 1);
            gl.uniform1f(uniform("grain"), 0);
            gl.uniform1f(uniform("grainCell"), 1);
            gl.uniform1f(uniform("one"), 1);
            gl.uniform1f(uniform("size"), side);
            gl.uniform2f(uniform("origin"), 0, 0);
            window.avatarDraw = (row, effect, times) => {
                const [c1, c2, c3, c4] = row.colors;
                gl.uniform3f(uniform("col1"), ...c1);
                gl.uniform3f(uniform("col2"), ...c2);
                gl.uniform3f(uniform("col3"), ...c3);
                gl.uniform3f(uniform("col4"), ...c4);
                gl.uniform4f(uniform("layout"), ...row.layout);
                gl.uniform1f(uniform("fx"), effect);
                gl.uniform1f(uniform("angle"), row.angle);
                const pixels = new Uint8Array(side * side * 4);
                const frames = [];
                for (const time of times) {
                    gl.uniform1f(uniform("t"), time);
                    // In bands, each finished before the next: one draw of the
                    // whole square can outlast the context's watchdog in software.
                    for (let band = 0; band < side; band += BAND) {
                        gl.scissor(0, band, side, BAND);
                        gl.drawArrays(gl.TRIANGLES, 0, 3);
                        gl.finish();
                    }
                    gl.readPixels(0, 0, side, side, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    frames.push(new Uint8Array(pixels));
                }
                // Software WebGL can lose a context mid-way; a lost one reads back black.
                if (gl.isContextLost()) throw new Error("WebGL context lost");
                return frames;
            };
        },
        {
            vertex: AVATAR_SHADER_VERTEX,
            fragment: AVATAR_SHADER_FRAGMENT,
            side: PIXELS * SUPERSAMPLE,
        },
    );
    return page;
}
let page = await pageCreate();

const count = FPS * SECONDS;
/** Forward 0…count-1, then back count-2…1; the wrap steps from 1 to 0. */
const order = [
    ...Array.from({ length: count }, (_, frame) => frame),
    ...Array.from({ length: count - 2 }, (_, k) => count - 2 - k),
];
// The keyframe nearly exact, and the bitrate climbing towards it over the last second.
const zones = [
    "0,0,q=8",
    ...Array.from({ length: FPS }, (_, k) => {
        const frame = order.length - FPS + k;
        return `${frame},${frame},b=${(1 + ((CLOSE_BOOST - 1) * (k + 1)) / FPS).toFixed(2)}`;
    }),
].join("/");
for (const [index, row] of rows.entries()) {
    // Frames 0…count-1 from the still's phase.
    const times = Array.from({ length: count }, (_, frame) => row.phase + (frame / FPS) * SPEED);
    const draw = () =>
        page.evaluate(
            ({ row, effect, times, pixels, supersample }) => {
                const side = pixels * supersample;
                const frames = window.avatarDraw(row, effect, times);
                // Box-average each supersample square; readPixels is bottom-up.
                const out = new Uint8Array(frames.length * pixels * pixels * 3);
                let o = 0;
                for (const frame of frames)
                    for (let y = pixels - 1; y >= 0; y--)
                        for (let x = 0; x < pixels; x++)
                            for (let c = 0; c < 3; c++) {
                                let sum = 0;
                                for (let dy = 0; dy < supersample; dy++)
                                    for (let dx = 0; dx < supersample; dx++)
                                        sum +=
                                            frame[
                                                ((y * supersample + dy) * side +
                                                    x * supersample +
                                                    dx) *
                                                    4 +
                                                    c
                                            ];
                                out[o++] = Math.round(sum / (supersample * supersample));
                            }
                let text = "";
                for (let i = 0; i < out.length; i += 0x8000)
                    text += String.fromCharCode(...out.subarray(i, i + 0x8000));
                return btoa(text);
            },
            { row, effect: EFFECTS[row.effect], times, pixels: PIXELS, supersample: SUPERSAMPLE },
        );
    let rgb;
    for (let attempt = 1; rgb === undefined; attempt++) {
        try {
            rgb = await draw();
        } catch (error) {
            if (attempt === 3) throw error;
            await page.close();
            page = await pageCreate();
        }
    }
    const frames = Buffer.from(rgb, "base64");
    const size = PIXELS * PIXELS * 3;
    const video = Buffer.concat(
        order.map((frame) => frames.subarray(frame * size, (frame + 1) * size)),
    );
    const name = `avatar-loop-${String(index + 1).padStart(3, "0")}.mp4`;
    const encoded = spawnSync(
        "ffmpeg",
        // prettier-ignore
        [
            "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", `${PIXELS}x${PIXELS}`, "-framerate", String(FPS), "-i", "-",
            "-an", "-vf", "scale=out_color_matrix=bt709:out_range=tv",
            "-c:v", "libx264", "-preset", "veryslow", "-crf", "16",
            "-x264-params", `zones=${zones}`,
            "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709",
            "-color_primaries", "bt709", "-color_trc", "bt709",
            "-movflags", "+faststart", "-map_metadata", "-1", join(out, name),
        ],
        { input: video },
    );
    if (encoded.status !== 0) throw new Error(`ffmpeg failed on ${name}: ${encoded.stderr}`);
    if ((index + 1) % 20 === 0) console.log(`${index + 1}/${rows.length}`);
}
await browser.close();
console.log(`${rows.length} loops, ${order.length} frames at ${FPS} fps, ${PIXELS}px`);
