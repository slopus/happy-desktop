/*
 * The team take: Kirill's desktop window is the stage, centred under a
 * caption band, on the README's photographic backdrop. Steve's phone is not
 * on screen until Kirill's new task reaches it; then it rises from below the
 * frame, whole, beside the window as the window slides left to make room,
 * with a label naming whose phone it is. When the five-bar page has rested
 * on both screens the phone steps down and the window slides back, and the
 * cut dissolves into its own first frame. Nothing covers the window. The
 * window carries macOS's own traffic lights, drawn over the app's lane.
 *
 * Geometry is in output pixels: the homepage player's 1618×1000 golden
 * rectangle. The recorded window is 1000×700 CSS pixels; its corner radius is
 * in those pixels.
 *
 * The cut drops the moments the desktop capture stalled mid-motion (the
 * take's freezes.json), and is also exported split: the window and the phone
 * screen alone, frame for frame on the cut's clock, for the homepage hero.
 */
export default {
    id: "team",
    title: "Team: Kirill's desktop, and Steve's phone once the task reaches it",
    output: { width: 1618, height: 1000, fps: 60 },
    backdrop: { source: "../readme/backdrop.jpg", blur: 1.2 },
    captionBand: { centerY: 64 },
    desktop: {
        x: 234,
        y: 128,
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
        bottom: 945,
        focusScale: 1,
        clearOfDesktop: false,
        enter: "bottom",
        label: "*Steve’s* phone",
        transition: { seconds: 0.7, easing: [0.22, 0.8, 0.24, 1] },
    },
    // Steve's typing plays at 2×: the driver on his phone presses one key at
    // a time, and the desktop waits, unchanged, while he types.
    speedUps: [{ from: "phone-typing", to: "phone-sent", rate: 2 }],
    cutFreezes: true,
    // Kirill's exports, once they are in the demo's assets, replace the take's
    // placeholders in the cut; the take measured where each one is drawn.
    pictures: {
        "happy-core": "../../demos/team/assets/happy-core.png",
        "chief-of-staff": "../../demos/team/assets/chief-of-staff.png",
        "disk-sweeper": "../../demos/team/assets/disk-sweeper.png",
    },
    // Steve's part, for the hero to bring his phone forward: from the moment
    // the task reaches him until the five-bar page has rested on both screens.
    split: { phonePart: ["phone-enter", "phone-exit"] },
    // The cut and its split tracks loop on the homepage: after the phone has
    // stepped away, the last frames dissolve into the first.
    loop: { seconds: 0.6 },
    captions: [
        // The list, every provider's models, then the hand going up it.
        { from: 0, text: "*Any provider*" },
        { from: "model-scan", text: "*any model*" },
        { from: "typing-started", text: "Just say what you want done" },
        { from: "phone-enter", text: "*Steve* sees it the moment it starts" },
        // Held while the task reaches Steve's phone and he opens it.
        { from: "phone-open", text: "Opus gets to work" },
        { from: "preview", text: "and shows a *live preview*" },
        { from: "phone-typing", text: "Steve checks the design *from his phone*" },
        { from: "steve-feedback", text: "and answers *in the same task*" },
        // Gone before the loop's dissolve, which brings in the first caption.
        { from: "outro", to: "settled", text: "*Happy.* Work together." },
    ],
    // The first frame, the new task with its model list open, is the poster.
    poster: { seconds: 0 },
    hints: [],
    encode: { crf: 18, preset: "veryslow", audioBitrate: "96k", maximumBytes: 20_000_000 },
};
