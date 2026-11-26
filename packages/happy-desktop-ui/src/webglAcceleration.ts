/**
 * Whether WebGL is being rasterized on the CPU. Chromium answers most of this
 * by refusing a context with a major performance caveat; the renderer string
 * covers the software drivers it does not flag. Both are the GPU stack's own
 * report, which Happy does not own and cannot ask any other way.
 */
function softwareRendered(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
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
 * The one rule for whether onboarding art may move: only on a GPU. A context
 * Chromium flags with a major performance caveat, or one a software driver
 * draws, still draws the first frame and holds it, because a CPU rasterizer
 * spends the whole main thread on every later frame and still stutters.
 * `create` is the canvas's own `getContext` for the kind it draws with.
 */
export function webglContextGet<Context extends WebGLRenderingContext | WebGL2RenderingContext>(
    create: (attributes: WebGLContextAttributes) => Context | null,
    attributes: WebGLContextAttributes,
): { readonly gl: Context; readonly accelerated: boolean } | null {
    const accelerated = create({ ...attributes, failIfMajorPerformanceCaveat: true });
    const gl = accelerated ?? create(attributes);
    if (gl === null) return null;
    return { gl, accelerated: accelerated !== null && !softwareRendered(gl) };
}
