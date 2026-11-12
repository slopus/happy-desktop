import { onboardingGrainFieldShader, onboardingGrainFragmentShader } from "./onboardingGrainShader";

const vertexSource = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0., 1.); }
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (shader === null) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
}

/** Both programs read the one triangle buffer from attribute 0. */
function link(gl: WebGLRenderingContext, vertex: WebGLShader, fragment: WebGLShader) {
    const program = gl.createProgram();
    if (program === null) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "a_position");
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
    gl.deleteProgram(program);
    return null;
}

/** A third of native's speed: at native speed a desktop window reads as lagging. */
const SPEED = 1 / 3;

const contextAttributes: WebGLContextAttributes = {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
};

/**
 * Whether WebGL is being rasterized on the CPU. Chromium answers most of this
 * by refusing a context with a major performance caveat; the renderer string
 * covers the software drivers it does not flag. Both are the GPU stack's own
 * report, which Happy does not own and cannot ask any other way.
 */
function softwareRendered(gl: WebGLRenderingContext): boolean {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer: unknown = gl.getParameter(
        info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL,
    );
    return (
        typeof renderer === "string" &&
        /swiftshader|llvmpipe|softpipe|software|basic render/iu.test(renderer)
    );
}

/**
 * One canvas owns all GPU resources and observers; disposing it releases all of
 * them. Without GPU acceleration the gradient is drawn once and holds still: a
 * software rasterizer spends the whole main thread on it and still stutters.
 */
export function onboardingGrainRenderer(
    canvas: HTMLCanvasElement,
    moving: boolean,
    clock: { seconds: number },
) {
    const document = canvas.ownerDocument;
    const view = document.defaultView;
    if (view === null) return;
    const accelerated = canvas.getContext("webgl", {
        ...contextAttributes,
        failIfMajorPerformanceCaveat: true,
    });
    const gl = accelerated ?? canvas.getContext("webgl", contextAttributes);
    if (gl === null) return;
    const animated = moving && accelerated !== null && !softwareRendered(gl);

    let releaseProgram: (() => void) | undefined;
    let render: (() => void) | undefined;
    let frame: number | undefined;
    let visible = false;
    if (!animated) clock.seconds = 0;
    let last: number | undefined;

    const initialize = () => {
        const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
        const fieldFragment = compile(gl, gl.FRAGMENT_SHADER, onboardingGrainFieldShader);
        const fragment = compile(gl, gl.FRAGMENT_SHADER, onboardingGrainFragmentShader);
        const fieldProgram =
            vertex === null || fieldFragment === null ? null : link(gl, vertex, fieldFragment);
        const program = vertex === null || fragment === null ? null : link(gl, vertex, fragment);
        const buffer = gl.createBuffer();
        const field = gl.createTexture();
        const fieldTarget = gl.createFramebuffer();
        const release = () => {
            if (vertex !== null) gl.deleteShader(vertex);
            if (fieldFragment !== null) gl.deleteShader(fieldFragment);
            if (fragment !== null) gl.deleteShader(fragment);
            if (fieldProgram !== null) gl.deleteProgram(fieldProgram);
            if (program !== null) gl.deleteProgram(program);
            if (buffer !== null) gl.deleteBuffer(buffer);
            if (field !== null) gl.deleteTexture(field);
            if (fieldTarget !== null) gl.deleteFramebuffer(fieldTarget);
        };
        if (
            fieldProgram === null ||
            program === null ||
            buffer === null ||
            field === null ||
            fieldTarget === null
        ) {
            release();
            return;
        }
        const fieldResolution = gl.getUniformLocation(fieldProgram, "u_resolution");
        const resolution = gl.getUniformLocation(program, "u_resolution");
        const time = gl.getUniformLocation(program, "u_time");
        const colors = ["Back", "0", "1", "2", "3"].map((suffix) => ({
            location: gl.getUniformLocation(program, `u_color${suffix}`),
            token: `--onboarding-grain-${suffix.toLowerCase()}`,
        }));
        gl.useProgram(program);
        gl.uniform1i(gl.getUniformLocation(program, "u_field"), 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        // Read pixel for pixel: nearest texels, and the only wrap mode WebGL 1
        // allows on a texture whose sides are not powers of two.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, field);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        releaseProgram = release;
        const paletteUpdate = () => {
            const style = view.getComputedStyle(canvas);
            for (const { location, token } of colors) {
                // The native artwork palette is declared as six-digit hex tokens in theme.css.
                const color = style.getPropertyValue(token).trim();
                if (!/^#[0-9a-f]{6}$/iu.test(color)) return false;
                const rgb = Number.parseInt(color.slice(1), 16);
                gl.uniform3f(
                    location,
                    ((rgb >> 16) & 255) / 255,
                    ((rgb >> 8) & 255) / 255,
                    (rgb & 255) / 255,
                );
            }
            return true;
        };
        if (!paletteUpdate()) {
            releaseProgram();
            releaseProgram = undefined;
            return;
        }
        // The grain is drawn once per drawing-buffer size; a new context starts empty.
        let fieldWidth = 0;
        let fieldHeight = 0;
        render = () => {
            if (gl.isContextLost()) return;
            const { width, height } = canvas;
            if (fieldWidth !== width || fieldHeight !== height) {
                // An RGBA, UNSIGNED_BYTE texture is always a complete WebGL 1 attachment.
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    width,
                    height,
                    0,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    null,
                );
                gl.bindFramebuffer(gl.FRAMEBUFFER, fieldTarget);
                gl.framebufferTexture2D(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    gl.TEXTURE_2D,
                    field,
                    0,
                );
                gl.useProgram(fieldProgram);
                gl.uniform2f(fieldResolution, width, height);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.useProgram(program);
                fieldWidth = width;
                fieldHeight = height;
            }
            gl.uniform2f(resolution, width, height);
            gl.uniform1f(time, clock.seconds);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
    };

    const stop = () => {
        if (frame !== undefined) view.cancelAnimationFrame(frame);
        frame = undefined;
        last = undefined;
    };
    const loop = (now: number) => {
        frame = undefined;
        if (last === undefined) last = now;
        // Match the native 33ms cadence and pause the clock while out of view.
        if (now - last >= 33) {
            clock.seconds += ((now - last) / 1000) * SPEED;
            last = now;
            render?.();
        }
        frame = view.requestAnimationFrame(loop);
    };
    const settle = () => {
        if (!animated || !visible || document.hidden || render === undefined) stop();
        else if (frame === undefined) frame = view.requestAnimationFrame(loop);
    };
    const resize = () => {
        const bounds = canvas.getBoundingClientRect();
        const ratio = Math.min(2, Math.max(1, view.devicePixelRatio));
        const width = Math.max(1, Math.round(bounds.width * ratio));
        const height = Math.max(1, Math.round(bounds.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
        }
        render?.();
    };
    const lost = (event: Event) => {
        event.preventDefault();
        stop();
        render = undefined;
        releaseProgram = undefined;
    };
    const restored = () => {
        initialize();
        resize();
        settle();
    };
    initialize();
    resize();
    const sizing = new view.ResizeObserver(resize);
    sizing.observe(canvas);
    const intersection = new view.IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        settle();
    });
    intersection.observe(canvas);
    view.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", settle);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
        stop();
        sizing.disconnect();
        intersection.disconnect();
        view.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", settle);
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
        releaseProgram?.();
    };
}
