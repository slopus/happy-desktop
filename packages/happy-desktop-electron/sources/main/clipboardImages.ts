import type { DesktopClipboardImage } from "../shared/desktopContract";
import { execFileHiddenAsync } from "./childProcess";

/**
 * Reads every image on the macOS pasteboard, one per pasteboard item.
 *
 * Chromium's paste reads the pasteboard as a whole, and asking a whole
 * pasteboard for an image answers with the first item's alone: three images
 * copied together in Telegram paste as one. Electron's `clipboard` is built on
 * the same single-item reads, so the items are walked through AppKit itself,
 * from JavaScript for Automation, which every Mac has and which needs no
 * native module of ours.
 *
 * An item carrying a file URL makes the whole answer empty: Chromium already
 * hands every copied file to the paste (and ignores the icon Finder puts beside
 * them), so there is nothing it left out. A GIF keeps its own bytes so it stays
 * animated; a TIFF, which a page cannot show, becomes a PNG.
 */
const SCRIPT = `
ObjC.import("AppKit");
function run() {
    const items = $.NSPasteboard.generalPasteboard.pasteboardItems;
    const images = [];
    for (let index = 0; index < items.count; index++) {
        const item = items.objectAtIndex(index);
        const types = ObjC.deepUnwrap(item.types) || [];
        if (types.indexOf("public.file-url") !== -1) return "[]";
        let mediaType = null;
        let data = null;
        if (types.indexOf("com.compuserve.gif") !== -1) {
            mediaType = "image/gif";
            data = item.dataForType("com.compuserve.gif");
        } else if (types.indexOf("public.png") !== -1) {
            mediaType = "image/png";
            data = item.dataForType("public.png");
        } else if (types.indexOf("public.jpeg") !== -1) {
            mediaType = "image/jpeg";
            data = item.dataForType("public.jpeg");
        } else if (types.indexOf("public.tiff") !== -1) {
            const image = $.NSBitmapImageRep.imageRepWithData(item.dataForType("public.tiff"));
            if (!image.isNil()) {
                mediaType = "image/png";
                // 4 is NSBitmapImageFileTypePNG.
                data = image.representationUsingTypeProperties(4, $({}));
            }
        }
        if (mediaType && data && !data.isNil())
            images.push({ mediaType: mediaType, data: data.base64EncodedStringWithOptions(0).js });
    }
    return JSON.stringify(images);
}
`;

/** Base64 of a clipboard's worth of images; far past anything a draft can carry. */
const OUTPUT_MAX_BYTES = 512 * 1024 * 1024;

const MEDIA_TYPES: ReadonlySet<string> = new Set(["image/gif", "image/jpeg", "image/png"]);

/** Turns the script's output into images, refusing anything it would not have printed. */
export function clipboardImagesParse(stdout: string): DesktopClipboardImage[] {
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed)) throw new Error("The clipboard reader printed no list.");
    return parsed.map((entry: unknown) => {
        if (typeof entry !== "object" || entry === null)
            throw new Error("The clipboard reader printed an invalid image.");
        const { mediaType, data } = entry as { mediaType?: unknown; data?: unknown };
        if (
            typeof mediaType !== "string" ||
            !MEDIA_TYPES.has(mediaType) ||
            typeof data !== "string"
        )
            throw new Error("The clipboard reader printed an invalid image.");
        return {
            mediaType: mediaType as DesktopClipboardImage["mediaType"],
            bytes: new Uint8Array(Buffer.from(data, "base64")),
        };
    });
}

/** Every image item on the clipboard, in order; none outside macOS or when unreadable. */
export async function clipboardImagesRead(): Promise<DesktopClipboardImage[]> {
    if (process.platform !== "darwin") return [];
    try {
        const { stdout } = await execFileHiddenAsync(
            "/usr/bin/osascript",
            ["-l", "JavaScript", "-e", SCRIPT],
            { timeout: 10_000, maxBuffer: OUTPUT_MAX_BYTES },
        );
        return clipboardImagesParse(stdout);
    } catch {
        return [];
    }
}
