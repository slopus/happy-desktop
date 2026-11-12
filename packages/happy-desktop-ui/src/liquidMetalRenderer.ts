import { liquidMetalFragmentShader, liquidMetalVertexShader } from "./liquidMetalShader";

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (shader === null) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
}

const contextAttributes: WebGLContextAttributes = {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: "low-power",
};

/**
 * Draws a Liquid Metal mark into `canvas`, filling its square. `field` is the
 * mark's baked field (red the edge, green the alpha); until it has loaded,
 * and where WebGL 2 is missing or lost, nothing is drawn and the caller's
 * still mark underneath shows. It moves at the display's rate while
 * `moving`, on screen and the document visible; otherwise it holds the frame
 * it was on (frame 0 when it never moved). Returns the release of everything
 * it made, and `onReady` hears when the first frame is up.
 */
export function liquidMetalRenderer(
    canvas: HTMLCanvasElement,
    field: string,
    moving: boolean,
    clock: { seconds: number },
    onReady: (ready: boolean) => void,
) {
    const document = canvas.ownerDocument;
    const view = document.defaultView;
    if (view === null) return;
    const gl = canvas.getContext("webgl2", contextAttributes);
    if (gl === null) return;

    let release: (() => void) | undefined;
    let render: (() => void) | undefined;
    let frame: number | undefined;
    let last: number | undefined;
    let visible = false;
    let disposed = false;
    const image = new view.Image();
    image.decoding = "async";

    const initialize = () => {
        if (!image.complete || image.naturalWidth === 0) return;
        const vertex = compile(gl, gl.VERTEX_SHADER, liquidMetalVertexShader);
        const fragment = compile(gl, gl.FRAGMENT_SHADER, liquidMetalFragmentShader);
        const program = gl.createProgram();
        const buffer = gl.createBuffer();
        const texture = gl.createTexture();
        const drop = () => {
            if (vertex !== null) gl.deleteShader(vertex);
            if (fragment !== null) gl.deleteShader(fragment);
            if (program !== null) gl.deleteProgram(program);
            if (buffer !== null) gl.deleteBuffer(buffer);
            if (texture !== null) gl.deleteTexture(texture);
        };
        if (
            vertex === null ||
            fragment === null ||
            program === null ||
            buffer === null ||
            texture === null
        ) {
            drop();
            return;
        }
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        const position = gl.getAttribLocation(program, "a_position");
        if (!gl.getProgramParameter(program, gl.LINK_STATUS) || position < 0) {
            drop();
            return;
        }
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        // The field is data, not a picture: no premultiplying, no colour management.
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
        const resolution = gl.getUniformLocation(program, "u_resolution");
        const time = gl.getUniformLocation(program, "u_time");
        release = drop;
        render = () => {
            if (gl.isContextLost()) return;
            gl.uniform2f(resolution, canvas.width, canvas.height);
            gl.uniform1f(time, clock.seconds);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };
        resize();
        onReady(true);
    };

    const stop = () => {
        if (frame !== undefined) view.cancelAnimationFrame(frame);
        frame = undefined;
        last = undefined;
    };
    const loop = (now: number) => {
        frame = undefined;
        // Time stands still while paused; it picks up where it stopped.
        if (last !== undefined) clock.seconds += (now - last) / 1000;
        last = now;
        render?.();
        frame = view.requestAnimationFrame(loop);
    };
    const settle = () => {
        if (!moving || !visible || document.hidden || render === undefined) stop();
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
        release = undefined;
        onReady(false);
    };
    const restored = () => {
        initialize();
        settle();
    };
    const loaded = () => {
        if (disposed) return;
        initialize();
        settle();
    };
    image.addEventListener("load", loaded);
    image.src = field;
    const sizing = new view.ResizeObserver(resize);
    sizing.observe(canvas);
    const intersection = new view.IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        settle();
    });
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", settle);
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    return () => {
        disposed = true;
        stop();
        image.removeEventListener("load", loaded);
        sizing.disconnect();
        intersection.disconnect();
        document.removeEventListener("visibilitychange", settle);
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
        release?.();
    };
}
