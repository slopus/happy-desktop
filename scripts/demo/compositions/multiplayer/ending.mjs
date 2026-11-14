import { join } from "node:path";

/** Continuous native phone playback, alone first and beside the homepage close. */
export function ending({ square = false, x = false } = {}) {
    const phone = {
        screen: join(import.meta.dirname, "phone/native-home.jpg"),
        frame: join(import.meta.dirname, "phone/device.png"),
        mask: join(import.meta.dirname, "phone/screen-alpha.png"),
        video: join(import.meta.dirname, "phone/native-running.mp4"),
    };
    return [
        {
            kind: "card",
            layout: "platforms",
            text: "On all platforms",
            phone,
            seconds: square ? 3.7 : 4.5,
            phoneFrom: square ? 0.5 : 0.6,
            phoneFade: square ? 1 : 1.1,
            textFrom: square ? 1 : 1.5,
            textFade: 0.5,
        },
        {
            kind: "card",
            layout: "brand",
            entrance: "continuous-phone",
            phone,
            wordmark: "Happy",
            line: "One place for you,\nyour team,\nand your agents.",
            small: "Free and open source",
            stars: "24k",
            seconds: x ? 5.25 : square ? 5.2 : 6.1,
            glideFrom: square ? 0.2 : 0.1,
            glideSeconds: square ? 0.8 : 1,
            platformsOut: square ? 0.4 : 0.5,
            textTimes: square ? [0.8, 1.05, 1.3] : [0.9, 1.2, 1.5],
            textFade: square ? 0.5 : 0.6,
        },
    ];
}
