import { join } from "node:path";

/** Continuous native phone playback, alone first and beside the homepage close. */
export function ending() {
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
            seconds: 3.6,
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
            seconds: 3.8,
        },
    ];
}
