import type { HappyAgentStoryMedia } from "./storiesStore.js";

/** What a fetch ahead leaves to show the instant a story opens. */
export type HappyAgentStoryMediaFrames = {
    /**
     * The media itself, decoded and kept warm: a viewer moves it into place rather than loading
     * it again, so its picture or first frame paints with the click.
     */
    readonly element?: HTMLImageElement | HTMLVideoElement;
    /** A dimmed 24-pixel sample of the media, stretched behind it as its ambient fill. */
    readonly ambient?: string;
};

/** Videos kept warm at once, newest last; an older one not on screen lets its stream go. */
const warm: HTMLVideoElement[] = [];
const WARM_VIDEOS = 8;

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
                const ambient = decoded ? await sample(image, image.naturalWidth) : undefined;
                return decoded ? { element: image, ...(ambient ? { ambient } : {}) } : {};
            }
            const video = document.createElement("video");
            [video.muted, video.preload, video.src] = [true, "auto", url];
            const event = (type: string) =>
                new Promise<boolean>((resolve) => {
                    video.addEventListener(type, () => resolve(true), { once: true });
                    video.addEventListener("error", () => resolve(false), { once: true });
                });
            if (!(await event("loadeddata"))) return {};
            const ambient = await sample(video, video.videoWidth);
            if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) await event("canplaythrough");
            warm.push(video);
            for (const old of warm.splice(0, Math.max(0, warm.length - WARM_VIDEOS))) {
                if (old.isConnected) continue;
                old.removeAttribute("src");
                old.load();
            }
            return { element: video, ...(ambient ? { ambient } : {}) };
        }),
    );
}

/**
 * The source drawn 24 pixels wide and dimmed, as a JPEG address, once the page is idle so it never
 * lands on an open or a step; none for media from another origin that did not allow reading it.
 * Drawing the decoded source costs less than `createImageBitmap`, which copies a video's whole
 * frame on the main thread.
 */
async function sample(source: HTMLImageElement | HTMLVideoElement, wide: number) {
    await new Promise((resolve) => (window.requestIdleCallback ?? setTimeout)(resolve));
    const tall = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = [24, Math.max(1, Math.round((tall * 24) / Math.max(1, wide)))];
    const context = canvas.getContext("2d")!;
    context.filter = "brightness(0.45)";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    try {
        return canvas.toDataURL("image/jpeg", 0.85);
    } catch {
        return undefined;
    }
}
