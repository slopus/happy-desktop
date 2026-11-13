import { join } from "node:path";

/** The homepage's platform beat and phone/wordmark close, using this film's own desktop take. */
export function ending(cues, square = false) {
    const phone = {
        screen: join(import.meta.dirname, "phone/native-home.jpg"),
        frame: join(import.meta.dirname, "phone/device.png"),
        mask: join(import.meta.dirname, "phone/screen-alpha.png"),
    };
    return [
        {
            kind: "card",
            layout: "platforms",
            text: "All platforms",
            phone,
            desktop: {
                take: "activity",
                at: cues.activity[square ? "step1-rest" : "step3-rest"] + 0.7,
            },
            seconds: square ? 3 : 3.2,
        },
        {
            kind: "card",
            layout: "brand",
            phone,
            wordmark: "Happy",
            line: "One place for you,\nyour team,\nand your agents.",
            small: "Free and open source",
            stars: "24k",
            seconds: 3.6,
        },
    ];
}
