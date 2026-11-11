import { stage } from "./stage.mjs";

/*
 * The whole video: three chapters on the desktop, a short phone beat, and the
 * closing card. Chapter 1 opens on the app with no card before it; the next
 * chapters are each named by a short card, then by the same words under the
 * window. Takes, by `--take` name:
 *
 *   aware   the multiplayer demo, MULTIPLAYER_SHOT=aware
 *   bots    the multiplayer demo, MULTIPLAYER_SHOT=bots
 *   step    the multiplayer demo, MULTIPLAYER_SHOT=step-in
 *   phone   the team demo's take 11 phone track (Steve's phone)
 */
const cardSeconds = 0.7;

export default {
    ...stage,
    id: "multiplayer",
    phone: {
        frame: "../../demos/core/assets/device/iphone-16-pro-black.png",
        alpha: "../../demos/core/assets/device/screen-alpha.png",
        screen: { x: 102, y: 100, width: 1206, height: 2622 },
        height: 1000,
        top: 40,
        left: 1150,
        title: { left: 250, top: 470, width: 820, size: 76, lineHeight: 88 },
    },
    segments: [
        {
            kind: "window",
            take: "aware",
            from: 0,
            seconds: 4.0,
            title: "See who’s working on what",
            dim: "session",
        },
        { kind: "card", text: "Shared bots for the standing jobs", seconds: cardSeconds },
        {
            kind: "window",
            take: "bots",
            from: 0.3,
            seconds: 4.1,
            title: "Shared bots for the standing jobs",
        },
        { kind: "card", text: "Step in when it’s your call", seconds: cardSeconds },
        {
            kind: "window",
            take: "step",
            from: 0.45,
            seconds: 4.4,
            title: "Step in when it’s your call",
            // Once the agent has asked, a slow move in on the conversation:
            // 1.14× the whole window: the rail, the sidebar's divider and the
            // composer stay in frame, and only the tab bar goes past the top.
            camera: [{ at: 0 }, { at: 1.55, move: 0.85, x: 240, y: -60, width: 1640 }],
        },
        {
            kind: "phone",
            take: "phone",
            from: 10.3,
            seconds: 2.5,
            title: "And the same team on your phone.",
        },
        {
            kind: "card",
            wordmark: "Happy",
            line: "One place for you, your team, and your agents.",
            small: "Free and open source · Runs on your own server",
            seconds: 1.8,
        },
    ],
};
