/*
 * The team take: Kirill's desktop window is the stage, centred over a
 * narration band, on the README's photographic backdrop. His teammate's
 * phone is not on screen until just before Kirill sends his new task; then it
 * rises from below the frame, whole, with a label above it saying whose phone
 * it is, while the window steps back to the left to make room, and the task
 * arrives in his sidebar. Then the phone tucks aside, smaller and partly past
 * the frame's right edge, and the window comes back while the agent works.
 * When the agent asks him about its first version, the phone comes forward
 * again; once he has answered and gone back to his sidebar, it tucks aside
 * for the rest, and fades out only in the dissolve into the cut's first
 * frame. Nothing covers the window. The window carries macOS's own traffic
 * lights, drawn over the app's lane.
 *
 * Geometry is in output pixels: the homepage player's 1618×1000 golden
 * rectangle. The recorded window is a golden rectangle too, 1133×700 CSS
 * pixels, drawn at 1.15 output pixels per CSS pixel as takes 9 and 10 were;
 * stepped back, it is drawn 1150 wide. Its corner radius is in CSS pixels.
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
        x: 157,
        y: 44,
        width: 1303,
        height: 805,
        cssWidth: 1133,
        cssRadius: 12,
        trafficLights: true,
        // While the phone is forward: 34 px from the frame's left edge,
        // 1150×710, about the same centre height.
        forward: { x: 34, y: 91, width: 1150 },
    },
    phone: {
        frame: "../../demos/core/assets/device/iphone-16-pro-black.png",
        alpha: "../../demos/core/assets/device/screen-alpha.png",
        screen: { x: 102, y: 100, width: 1206, height: 2622 },
        // Forward: 38 px right of the stepped-back window; it hangs 12 px
        // below the window at rest.
        width: 360,
        left: 1222,
        bottom: 861,
        // Tucked: 24 px right of the window at rest, a little under half of
        // it past the frame's edge, its foot where the forward phone's is.
        tucked: { width: 260, left: 1484, bottom: 861 },
        focusScale: 1,
        clearOfDesktop: false,
        label: "Your *teammate’s* phone",
        transition: { seconds: 0.7, easing: [0.22, 0.8, 0.24, 1] },
    },
    // Forward as the task reaches Steve, tucked while the agent works, forward
    // while he answers its question, tucked again to the end.
    phoneStates: [
        { from: "phone-enter", state: "forward" },
        { from: "phone-tuck", state: "tucked" },
        { from: "phone-forward", state: "forward" },
        { from: "phone-tuck#2", state: "tucked" },
    ],
    // Steve's typing plays at 2×: the driver on his phone types a word at a
    // time, and the desktop waits while he types.
    speedUps: [{ from: "phone-typing", to: "phone-sent", rate: 2 }],
    // Carried into the cut's edits, so every delivery says what was staged.
    staging: [
        "Steve's typing: his phone's UI-test driver types his reply a word at a time (the keyboard still presses each key), and the cut plays it at 2× on both screens.",
        "Waveform bars' worktree: the desktop asks Happy Core to watch a new worktree's Git state while it is still initializing, Happy Agent v0.4.111 refuses that whole request, and the desktop asks again only on its two-minute renewal. Once the worktree is ready, the director sends the same watch request the renewal sends (every active project and workspace) early, through Kirill's own client. The subtask's ten edits are real Edit calls, and every count on its row is the daemon's own Git scan.",
        "Kirill's and Steve's feeds, and the new subtask, are marked read as they update, so no unread badge interrupts the take.",
    ],
    cutFreezes: true,
    // Kirill's exports, once they are in the demo's assets, replace the take's
    // placeholders in the cut; the take measured where each one is drawn.
    pictures: {
        "chief-of-staff": "../../demos/team/assets/chief-of-staff.png",
        "disk-sweeper": "../../demos/team/assets/disk-sweeper.png",
    },
    // Steve's part: from just before the task reaches his sidebar until he is
    // back there, having answered. take.json also carries each phone state.
    split: { phonePart: ["phone-enter", "phone-tuck#2"] },
    // The cut and its split tracks loop on the homepage: the last frames,
    // the phone tucked, dissolve into the first, which has no phone.
    loop: { seconds: 0.6 },
    // Plain sentences saying what is happening, each held long enough to read.
    captions: [
        { from: 0, text: "Pick any model from any provider." },
        { from: "typing-started", text: "Describe the work and send." },
        // Held while the agent builds.
        { from: "sent", text: "Your teammate sees the new task right away." },
        // The agent asks Steve by name, and his phone comes forward.
        { from: "phone-forward", text: "A teammate jumps in." },
        { from: "phone-typing", text: "They review the preview and reply." },
        // Gone before the loop's dissolve, which brings in the first line.
        { from: "phone-tuck#2", to: "settled", text: "The agent picks up the feedback." },
    ],
    // The first frame, the new task with its model list open, is the poster.
    poster: { seconds: 0 },
    hints: [],
    encode: { crf: 18, preset: "veryslow", audioBitrate: "96k", maximumBytes: 20_000_000 },
};
