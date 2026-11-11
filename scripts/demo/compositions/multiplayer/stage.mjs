/*
 * What the cuts of the multiplayer video share: the frame, where the recorded
 * window rests in it, the camera's frame of reference, and the words.
 *
 * Takes are recorded at 2.5 device pixels per CSS pixel, so the camera can
 * push in to `push` output pixels per CSS pixel (13–14 px app text drawn
 * about 30 px tall) and still only scale the take down.
 */
const type = {
    // A chapter card's words, the closing wordmark, and its two lines.
    card: 76,
    wordmark: 132,
    line: 46,
    small: 34,
    gap: 22,
    // How far a card's words rise as they fade in.
    rise: 18,
};

/** The landscape cut: 1920×1080 at 60 fps, from 1133×700 takes. */
export const stage = {
    output: { width: 1920, height: 1080, fps: 60 },
    window: {
        cssWidth: 1133,
        cssHeight: 700,
        cssRadius: 12,
        // Where the sidebar ends and the session pane begins.
        sidebarEdge: 344,
        x: 243,
        y: 42,
        width: 1434,
    },
    // The camera's frame of reference: a key's CSS corner lands at this
    // rectangle's corner. It clips nothing; the window runs past it.
    stage: { x: 70, y: 30, width: 1780, height: 912 },
    push: 2.2,
    title: { centerY: 1006, size: 50, lineHeight: 60 },
    type: { ...type, cardWidth: 1400 },
    /** Seconds one segment dissolves into the next. */
    dissolve: 0.2,
    encode: { crf: 16 },
};

/** The square cut: 1080×1080 at 60 fps, from 764×700 takes. */
export const square = {
    output: { width: 1080, height: 1080, fps: 60 },
    window: {
        cssWidth: 764,
        cssHeight: 700,
        cssRadius: 12,
        sidebarEdge: 344,
        x: 74,
        y: 40,
        width: 932,
    },
    stage: { x: 28, y: 26, width: 1024, height: 886 },
    push: 2.2,
    title: { centerY: 990, size: 44, lineHeight: 54 },
    type: { ...type, card: 68, wordmark: 116, line: 40, small: 30, cardWidth: 900 },
    dissolve: 0.2,
    encode: { crf: 16 },
};
