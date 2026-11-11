import { stage } from "./stage.mjs";

/** Chapter 1 alone: Kirill's window, whole, while Steve and then Leo start tasks. */
export default {
    ...stage,
    id: "chapter-aware",
    segments: [
        {
            kind: "window",
            take: "aware",
            from: 0,
            seconds: 4.7,
            title: "See who’s working on what",
            dim: "session",
        },
    ],
};
