import type { HappyAgentStoryMedia } from "./storiesStore.js";

/** What a fetch ahead leaves to show the instant a story opens. */
export type HappyAgentStoryMediaFrames = {
    /** A video's first frame, decoded, at most 720 pixels wide. */
    readonly poster?: string;
    /** A dimmed 24-pixel sample of the media, stretched behind it as its ambient fill. */
    readonly ambient?: string;
};

/**
 * Fetches story media through the browser's own HTTP cache, the same path every `<img>` and
 * `<video>` of the app plays from: settles once each image is decoded and each video can play
 * through. Outside a document there is nothing to fetch ahead.
 */
export function storyMediaPreload(
    media: readonly HappyAgentStoryMedia[],
): Promise<readonly HappyAgentStoryMediaFrames[]> {
    if (typeof document === "undefined") return Promise.resolve([]);
    return Promise.all(
        media.map(async ({ kind, url }) => {
            if (kind === "image") {
                const image = new Image();
                image.src = url;
                const decoded = await image.decode().then(
                    () => true,
                    () => false,
                );
                const { naturalWidth: wide, naturalHeight: tall } = image;
                return decoded ? { ambient: sample(image, wide, tall, 24, 0.45) } : {};
            }
            const video = document.createElement("video");
            [video.muted, video.preload, video.src] = [true, "auto", url];
            const event = (type: string) =>
                new Promise<boolean>((resolve) => {
                    video.addEventListener(type, () => resolve(true), { once: true });
                    video.addEventListener("error", () => resolve(false), { once: true });
                });
            const frames: HappyAgentStoryMediaFrames = (await event("loadeddata"))
                ? {
                      poster: sample(video, video.videoWidth, video.videoHeight, 720, 1),
                      ambient: sample(video, video.videoWidth, video.videoHeight, 24, 0.45),
                  }
                : {};
            if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) await event("canplaythrough");
            video.removeAttribute("src");
            video.load();
            return frames;
        }),
    );
}

/** The source drawn at most `width` pixels wide and dimmed to `brightness`, as a JPEG address. */
function sample(
    source: CanvasImageSource,
    wide: number,
    tall: number,
    width: number,
    brightness: number,
) {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, width / Math.max(1, wide));
    [canvas.width, canvas.height] = [Math.max(1, wide * scale), Math.max(1, tall * scale)];
    const context = canvas.getContext("2d")!;
    context.filter = `brightness(${brightness})`;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
}
