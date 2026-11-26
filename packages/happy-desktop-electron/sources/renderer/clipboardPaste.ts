import type { DesktopClipboardImage } from "../shared/desktopContract";

const EXTENSIONS: Record<DesktopClipboardImage["mediaType"], string> = {
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
};

/**
 * The clipboard images a paste did not carry, as files to attach after it.
 *
 * Chromium's paste holds the first image item on the clipboard, so when the
 * clipboard holds more images than the paste held files, the paste's files
 * are its first items and the rest are missing. When it holds no more, the
 * paste already has everything and nothing is added.
 */
export function clipboardPasteMissing(
    pasted: readonly File[],
    images: readonly DesktopClipboardImage[],
): File[] {
    if (images.length <= pasted.length) return [];
    return images
        .slice(pasted.length)
        .map(
            (image, index) =>
                new File(
                    [image.bytes as Uint8Array<ArrayBuffer>],
                    `image-${String(pasted.length + index + 1)}.${EXTENSIONS[image.mediaType]}`,
                    { type: image.mediaType },
                ),
        );
}

/** What a paste left out, read from the host; nothing when this host cannot read it. */
export async function clipboardPasteMissingRead(pasted: readonly File[]): Promise<File[]> {
    const read = window.happyDesktop?.clipboardImagesRead;
    if (!read) return [];
    return clipboardPasteMissing(pasted, await read());
}
