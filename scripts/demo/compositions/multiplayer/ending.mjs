import { join } from "node:path";

/** The homepage's platform beat and phone/wordmark close, using this film's own desktop take. */
export function ending(square = false) {
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
            entrance: "window-slide",
            move: 0.9,
            desktop: {
                left: square ? 430 : 1020,
                top: square ? 340 : 62,
                width: square ? 780 : 1340,
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
