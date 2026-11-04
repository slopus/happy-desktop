/// <reference lib="webworker" />
/*
 * The worker every live placeholder on a page is drawn in (`avatarShaderRenderer.ts`).
 *
 * It owns the page's one WebGL2 context, on an OffscreenCanvas, and compiles
 * the shader once, here rather than on the page's thread. A pass draws every
 * avatar it is asked for side by side into that one canvas and hands the
 * canvas back as one ImageBitmap, with where each avatar sits in it; the page
 * copies each square out (`avatarShaderRenderer.ts`). One bitmap per pass,
 * not one per avatar: every bitmap is a new texture the GPU process makes and
 * frees, which at a few dozen pixels an avatar cost far more than drawing it.
 */
import {
    AVATAR_SHADER_SCALE,
    AVATAR_SHADER_WARP,
    avatarShaderEffectIndex,
    avatarShaderGrain,
    avatarShaderGrainCell,
    avatarShaderParameters,
} from "./avatarShader";
import type {
    AvatarShaderRequest,
    AvatarShaderResponse,
    AvatarShaderTile,
} from "./avatarShaderProtocol";
import { AVATAR_SHADER_FRAGMENT, AVATAR_SHADER_VERTEX } from "./shaderSource";

declare const self: DedicatedWorkerGlobalScope;

/** The widest the shared canvas is laid out; tiles past it start a new shelf. */
const ATLAS_WIDTH = 2048;

const UNIFORMS = [
    "col1",
    "col2",
    "col3",
    "col4",
    "layout",
    "fx",
    "t",
    "angle",
    "warp",
    "scale",
    "grain",
    "grainCell",
    "grainT",
    "size",
    "origin",
    "one",
] as const;

interface Program {
    readonly gl: WebGL2RenderingContext;
    /** False for a context the browser draws in software, where only stills are drawn. */
    readonly animates: boolean;
    readonly canvas: OffscreenCanvas;
    readonly uniforms: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
}

/** A context on a canvas of its own, or null; a refused request leaves a canvas unusable. */
function contextCreate(failIfMajorPerformanceCaveat: boolean) {
    const canvas = new OffscreenCanvas(1, 1);
    const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        failIfMajorPerformanceCaveat,
        powerPreference: "low-power",
        preserveDrawingBuffer: false,
        stencil: false,
    });
    return gl === null ? null : { canvas, gl };
}

function programCreate(): Program | undefined {
    if (typeof OffscreenCanvas !== "function") return undefined;
    // A browser without a usable GPU still draws WebGL, in software, at a cost
    // a column of moving avatars would make the whole machine pay; there the
    // context is refused with the caveat and taken without it for stills only.
    const fast = contextCreate(true);
    const made = fast ?? contextCreate(false);
    if (made === null) return undefined;
    const { canvas, gl } = made;
    const shader = (type: number, source: string) => {
        const made = gl.createShader(type);
        if (made === null) return undefined;
        gl.shaderSource(made, source);
        gl.compileShader(made);
        return made;
    };
    const vertex = shader(gl.VERTEX_SHADER, AVATAR_SHADER_VERTEX);
    const fragment = shader(gl.FRAGMENT_SHADER, AVATAR_SHADER_FRAGMENT);
    const program = gl.createProgram();
    if (vertex === undefined || fragment === undefined || program === null) return undefined;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) return undefined;
    gl.useProgram(program);
    // The triangle is made from gl_VertexID, but WebGL2 still wants an array bound.
    gl.bindVertexArray(gl.createVertexArray());
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    const uniforms = Object.fromEntries(
        UNIFORMS.map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]),
    ) as Program["uniforms"];
    // The same for every avatar: the package's defaults, and the shader's own 1.
    gl.uniform1f(uniforms.warp, AVATAR_SHADER_WARP);
    gl.uniform1f(uniforms.scale, AVATAR_SHADER_SCALE);
    gl.uniform1f(uniforms.one, 1);
    return { gl, canvas, uniforms, animates: fast !== null };
}

/** Undefined until first asked; null once it could not be made. */
let program: Program | null | undefined;

/** Where each tile sits in the shared canvas, top-left origin: shelves of equal-sized tiles. */
function layout(tiles: readonly AvatarShaderTile[]) {
    const placed: { tile: AvatarShaderTile; x: number; y: number }[] = [];
    let x = 0;
    let y = 0;
    let shelf = 0;
    let width = 0;
    for (const tile of [...tiles].sort((a, b) => b.pixels - a.pixels)) {
        if (x + tile.pixels > ATLAS_WIDTH && x > 0) {
            y += shelf;
            x = 0;
            shelf = 0;
        }
        placed.push({ tile, x, y });
        x += tile.pixels;
        shelf = Math.max(shelf, tile.pixels);
        width = Math.max(width, x);
    }
    return { placed, width, height: y + shelf };
}

function draw(tiles: readonly AvatarShaderTile[]): AvatarShaderResponse {
    const began = performance.now();
    if (program === undefined || program?.gl.isContextLost()) program = programCreate() ?? null;
    if (program === null) return { kind: "unavailable" };
    const { gl, canvas, uniforms, animates } = program;
    const { placed, width, height } = layout(tiles);
    // Grown when a pass needs more room, and kept, so the buffer is not made again every pass.
    if (canvas.width < width || canvas.height < height) {
        canvas.width = Math.max(canvas.width, width);
        canvas.height = Math.max(canvas.height, height);
    }
    for (const { tile, x, y } of placed) {
        const parameters = avatarShaderParameters(tile.index);
        const bottom = canvas.height - y - tile.pixels;
        gl.viewport(x, bottom, tile.pixels, tile.pixels);
        const [c1, c2, c3, c4] = parameters.colors;
        gl.uniform3f(uniforms.col1, c1![0], c1![1], c1![2]);
        gl.uniform3f(uniforms.col2, c2![0], c2![1], c2![2]);
        gl.uniform3f(uniforms.col3, c3![0], c3![1], c3![2]);
        gl.uniform3f(uniforms.col4, c4![0], c4![1], c4![2]);
        gl.uniform4f(uniforms.layout, ...parameters.layout);
        gl.uniform1f(uniforms.fx, avatarShaderEffectIndex[parameters.effect]);
        gl.uniform1f(uniforms.t, parameters.phase + tile.time);
        gl.uniform1f(uniforms.angle, parameters.angle);
        gl.uniform1f(uniforms.grain, avatarShaderGrain(tile.pixels));
        gl.uniform1f(uniforms.grainCell, avatarShaderGrainCell(tile.pixels));
        gl.uniform1f(uniforms.grainT, parameters.phase);
        gl.uniform1f(uniforms.size, tile.pixels);
        gl.uniform2f(uniforms.origin, x, bottom);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    return {
        kind: "drawn",
        bitmap: canvas.transferToImageBitmap(),
        placements: placed.map(({ tile, x, y }) => ({ id: tile.id, x, y })),
        ms: performance.now() - began,
        animates,
    };
}

self.addEventListener("message", (event: MessageEvent<AvatarShaderRequest>) => {
    const response = draw(event.data.tiles);
    if (response.kind === "drawn") self.postMessage(response, [response.bitmap]);
    else self.postMessage(response);
});
