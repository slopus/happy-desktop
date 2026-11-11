/*
 * What every cut of the multiplayer video shares: a 1920×1080 frame at 60 fps
 * on the site's dark palette, and where the recorded window stands in it.
 *
 * The window is the take's whole 1133×700, drawn 886 pixels tall (82% of the
 * frame's height) with the chapter's title in the band under it. That is
 * 0.63 of the pixels the take captured, so nothing on screen is enlarged.
 */
export const stage = {
    output: { width: 1920, height: 1080, fps: 60 },
    // happy-home.css, dark: --grain-back, --grain-3, --grain-0 mixed into the
    // back, --grain-1, and --home-accent.
    palette: {
        back: "#06050f",
        glow: "#2a00ff",
        patch: "#272080",
        violet: "#7c3aed",
        accent: "#c4b5fd",
    },
    window: {
        cssWidth: 1133,
        cssHeight: 700,
        cssRadius: 12,
        // Where the sidebar ends and the session pane begins: the 56 px rail and the 288 px sidebar.
        sidebarEdge: 344,
        x: 243,
        y: 42,
        width: 1434,
    },
    /** How much darker the session pane is drawn where a segment asks for `dim: "session"`. */
    dim: 0.13,
    title: { centerY: 1003, size: 50, lineHeight: 60 },
    /** Seconds one segment dissolves into the next. */
    dissolve: 0.12,
    encode: { crf: 16 },
};
