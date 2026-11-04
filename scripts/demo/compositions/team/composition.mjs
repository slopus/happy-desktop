/*
 * The team take: Kirill's desktop window is the stage, centred over a
 * narration band, on the README's photographic backdrop. His teammate's
 * phone is not on screen until just before Kirill sends his new task; then it
 * rises from below the frame, whole, beside the window as the window slides
 * left to make room, with a label above it saying whose phone it is, and the
 * task arrives in his sidebar. Once he has answered from the phone and gone
 * back to his sidebar, the phone steps down and the window slides back while
 * the agent takes his note, and the cut dissolves into its own first frame.
 * Nothing covers the window. The window carries macOS's own traffic lights,
 * drawn over the app's lane.
 *
 * Geometry is in output pixels: the homepage player's 1618×1000 golden
 * rectangle. The recorded window is 1000×700 CSS pixels; its corner radius is
 * in those pixels.
 *
 * The cut drops the moments the desktop capture stalled mid-motion (the
 * take's freezes.json), and is also exported split: the window and the phone
 * screen alone, frame for frame on the cut's clock, for the homepage hero.
 * The narration stays out of the split tracks; it travels in captions.vtt
 * and take.json.
 */
export default {
    id: "team",
    title: "Team: Kirill's desktop, and Steve's phone once the task reaches it",
    output: { width: 1618, height: 1000, fps: 60 },
    backdrop: { source: "../readme/backdrop.jpg", blur: 1.2 },
    // Narration, as subtitles, in the band under the window.
    captionBand: { centerY: 928 },
    desktop: {
        x: 234,
        y: 44,
        width: 1150,
        height: 805,
        cssWidth: 1000,
        cssRadius: 12,
        trafficLights: true,
        // Left, to 34 px from the frame's edge, while the phone is up.
        focusShift: -200,
    },
    phone: {
        frame: "../../demos/core/assets/device/iphone-16-pro-black.png",
        alpha: "../../demos/core/assets/device/screen-alpha.png",
        screen: { x: 102, y: 100, width: 1206, height: 2622 },
        width: 360,
        // 38 px right of the slid window; it hangs 12 px below the window.
        left: 1222,
        bottom: 861,
        focusScale: 1,
        clearOfDesktop: false,
        enter: "bottom",
        label: "Your *teammate’s* phone",
        transition: { seconds: 0.7, easing: [0.22, 0.8, 0.24, 1] },
    },
    // Steve's typing plays at 2×: the driver on his phone presses one key at
    // a time, and the desktop waits, unchanged, while he types.
    speedUps: [{ from: "phone-typing", to: "phone-sent", rate: 2 }],
    cutFreezes: true,
    // Kirill's exports, once they are in the demo's assets, replace the take's
    // placeholders in the cut; the take measured where each one is drawn.
    pictures: {
        "chief-of-staff": "../../demos/team/assets/chief-of-staff.png",
        "disk-sweeper": "../../demos/team/assets/disk-sweeper.png",
    },
    // Steve's part, for the hero to bring his phone forward: from just before
    // the task reaches his sidebar until he is back there, having answered.
    split: { phonePart: ["phone-enter", "phone-exit"] },
    // The cut and its split tracks loop on the homepage: after the phone has
    // stepped away, the last frames dissolve into the first.
    loop: { seconds: 0.6 },
    // Plain sentences saying what is happening, each held long enough to read.
    captions: [
        { from: 0, text: "Pick any model from any provider." },
        { from: "typing-started", text: "Describe the work and send." },
        { from: "sent", text: "Your teammate sees the new task right away." },
        // Held while the agent builds and while Steve opens the task.
        { from: "preview", text: "When the first version is ready, they jump in." },
        { from: "phone-typing", text: "They review the preview and reply." },
        // Gone before the loop's dissolve, which brings in the first line.
        { from: "phone-exit", to: "settled", text: "The agent picks up the feedback." },
    ],
    // The first frame, the new task with its model list open, is the poster.
    poster: { seconds: 0 },
    hints: [],
    encode: { crf: 18, preset: "veryslow", audioBitrate: "96k", maximumBytes: 20_000_000 },
};
