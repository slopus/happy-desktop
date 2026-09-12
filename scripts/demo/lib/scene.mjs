/*
 * The fixed geometry every stage of the pipeline agrees on.
 *
 * One rule decides all of it: the camera must never magnify past the detail
 * that was actually captured. The scene is composed at `scene` and delivered at
 * `output`, so the ratio between them is the zoom the pipeline can spend before
 * a frame starts being invented rather than resampled.
 */

/** Delivered video. 16:9 because that is what every timeline expects. */
export const output = { width: 1920, height: 1080 };

/** Working canvas. 1.667x the output, which is the zoom budget. */
export const scene = { width: 3200, height: 1800 };

/** Space between the app window and the edge of the scene. */
export const margin = 70;

/** The app window inside the scene, in scene pixels. */
export const window = {
    x: margin,
    y: margin,
    width: scene.width - margin * 2,
    height: scene.height - margin * 2,
};

/** Corner radius of that window, in scene pixels. */
export const windowRadius = 28;

/**
 * Retina capture, so the scene is filled with real pixels rather than upscaled
 * ones. A compact desktop window at 2.5× keeps controls legible in the delivered
 * video while preserving enough physical pixels for the camera's close-ups.
 */
export const deviceScaleFactor = 2.5;

/** Browser viewport, in CSS pixels. A compact laptop layout. */
export const viewport = {
    width: window.width / deviceScaleFactor,
    height: window.height / deviceScaleFactor,
};

/** The largest zoom that is still drawn entirely from captured detail. */
export const maximumZoom = scene.width / output.width;

/** Turns a CSS-pixel rectangle from the page into its place in the scene. */
export function sceneRectangle(cssRectangle) {
    return {
        x: window.x + cssRectangle.x * deviceScaleFactor,
        y: window.y + cssRectangle.y * deviceScaleFactor,
        width: cssRectangle.width * deviceScaleFactor,
        height: cssRectangle.height * deviceScaleFactor,
    };
}

/**
 * The crop the camera is looking through, clamped so it never leaves the scene.
 *
 * `level` is how much closer the camera is than the full scene, and the centre
 * is pulled back inside the edges rather than the crop being allowed to shrink,
 * so a zoom onto something near a corner keeps the magnification it asked for.
 */
export function cameraCrop(camera) {
    const level = Math.min(Math.max(camera.level, 1), maximumZoom);
    const width = Math.round(scene.width / level);
    const height = Math.round(scene.height / level);
    const x = Math.round(Math.min(Math.max(camera.x - width / 2, 0), scene.width - width));
    const y = Math.round(Math.min(Math.max(camera.y - height / 2, 0), scene.height - height));
    return { left: x, top: y, width, height };
}

/** The camera resting position: the whole scene, dead centre. */
export function cameraRest() {
    return { level: 1, x: scene.width / 2, y: scene.height / 2 };
}
