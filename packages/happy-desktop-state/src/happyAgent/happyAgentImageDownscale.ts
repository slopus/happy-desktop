import { inlineImageSizeOfBytes } from "../conversation/inlineImageSize.js";

/**
 * The longest side an inline image keeps. A model looks at a picture at about
 * this size anyway, and a Retina screenshot scaled to it still has crisp text.
 */
export const HAPPY_AGENT_IMAGE_LONG_SIDE_MAX = 2000;

/**
 * The most an inline image may weigh after preparation. Its base64 is a third
 * larger, and that has to stay clear of the 5 MB a model accepts per image.
 */
export const HAPPY_AGENT_IMAGE_BYTES_MAX = 3 * 1024 * 1024;

/** Quality used whenever an image is written as JPEG. */
export const HAPPY_AGENT_IMAGE_JPEG_QUALITY = 0.85;

/** How much of a file is read to find its pixel size without decoding it. */
const HEAD_BYTES = 65_536;

export interface HappyAgentImageEncoding {
    readonly mediaType: "image/png" | "image/jpeg";
    readonly quality?: number;
}

export type HappyAgentImageDownscalePlan =
    | { readonly kind: "keep" }
    | {
          readonly kind: "downscale";
          readonly width: number;
          readonly height: number;
          /**
           * Tried in order; the first that fits `HAPPY_AGENT_IMAGE_BYTES_MAX`
           * is kept, and the last is kept whatever it weighs.
           */
          readonly encodings: readonly HappyAgentImageEncoding[];
      };

/**
 * Lossless sources try PNG first: a screenshot's text stays sharp and its
 * transparency survives. Photographs are JPEG already and stay JPEG. GIF is
 * absent on purpose, because redrawing one would drop its animation.
 */
const ENCODINGS: ReadonlyMap<string, readonly HappyAgentImageEncoding[]> = new Map([
    [
        "image/png",
        [
            { mediaType: "image/png" },
            { mediaType: "image/jpeg", quality: HAPPY_AGENT_IMAGE_JPEG_QUALITY },
        ],
    ],
    [
        "image/bmp",
        [
            { mediaType: "image/png" },
            { mediaType: "image/jpeg", quality: HAPPY_AGENT_IMAGE_JPEG_QUALITY },
        ],
    ],
    ["image/jpeg", [{ mediaType: "image/jpeg", quality: HAPPY_AGENT_IMAGE_JPEG_QUALITY }]],
    ["image/webp", [{ mediaType: "image/jpeg", quality: HAPPY_AGENT_IMAGE_JPEG_QUALITY }]],
]);

/**
 * Decides whether an attached image is redrawn before it travels, and into
 * what. An image within both limits is left exactly as it is, byte for byte.
 * `width` and `height` are the displayed size, after any EXIF orientation.
 */
export function happyAgentImageDownscalePlan(image: {
    readonly mediaType: string;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
}): HappyAgentImageDownscalePlan {
    const encodings = ENCODINGS.get(image.mediaType);
    if (!encodings || image.width <= 0 || image.height <= 0) return { kind: "keep" };
    const longSide = Math.max(image.width, image.height);
    if (longSide <= HAPPY_AGENT_IMAGE_LONG_SIDE_MAX && image.bytes <= HAPPY_AGENT_IMAGE_BYTES_MAX)
        return { kind: "keep" };
    const scale = Math.min(1, HAPPY_AGENT_IMAGE_LONG_SIDE_MAX / longSide);
    return {
        kind: "downscale",
        width: Math.max(1, Math.round(image.width * scale)),
        height: Math.max(1, Math.round(image.height * scale)),
        encodings,
    };
}

/**
 * Whether a redrawn image replaces its source. Shrinking the pixels is the
 * point, so a smaller picture always wins; at the same pixel size, only fewer
 * bytes are worth having.
 */
export function happyAgentImageDownscaleAccepted(input: {
    readonly sourceBytes: number;
    readonly encodedBytes: number;
    readonly resized: boolean;
}): boolean {
    return input.resized || input.encodedBytes < input.sourceBytes;
}

/** The source's name with the extension of the format it was rewritten as. */
export function happyAgentImageDownscaleName(name: string, mediaType: string): string {
    const extension = mediaType === "image/jpeg" ? "jpg" : "png";
    const stem = name.replace(/\.[^./]*$/, "") || "image";
    return `${stem}.${extension}`;
}

/**
 * The same preparation is shared by everything that asks about one file: the
 * draft swapping its thumbnail in and a send that started before that finished.
 */
const prepared = new WeakMap<File, Promise<File>>();

/**
 * The file an attached image should travel as: the source itself when it is
 * small enough, otherwise a copy redrawn to `HAPPY_AGENT_IMAGE_LONG_SIDE_MAX`.
 * Never rejects; anything this browser cannot decode or encode stays as it was.
 */
export function happyAgentImageDownscale(file: File): Promise<File> {
    const cached = prepared.get(file);
    if (cached) return cached;
    const result = imageDownscale(file).catch(() => file);
    prepared.set(file, result);
    return result;
}

async function imageDownscale(file: File): Promise<File> {
    if (!ENCODINGS.has(file.type)) return file;
    // The header answers for nearly every image without decoding it, which is
    // all a small screenshot should cost.
    const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
    const declared = inlineImageSizeOfBytes(head);
    if (declared) {
        if (
            happyAgentImageDownscalePlan({ ...declared, mediaType: file.type, bytes: file.size })
                .kind === "keep"
        )
            return file;
    } else if (file.size <= HAPPY_AGENT_IMAGE_BYTES_MAX) return file;
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function")
        return file;
    const bitmap = await createImageBitmap(file);
    try {
        const plan = happyAgentImageDownscalePlan({
            mediaType: file.type,
            bytes: file.size,
            width: bitmap.width,
            height: bitmap.height,
        });
        if (plan.kind === "keep") return file;
        const resized = plan.width !== bitmap.width || plan.height !== bitmap.height;
        let encoded: Blob | undefined;
        for (const [index, encoding] of plan.encodings.entries()) {
            encoded = await imageEncode(bitmap, plan.width, plan.height, encoding);
            if (encoded.size <= HAPPY_AGENT_IMAGE_BYTES_MAX || index === plan.encodings.length - 1)
                break;
        }
        if (
            !encoded ||
            !happyAgentImageDownscaleAccepted({
                sourceBytes: file.size,
                encodedBytes: encoded.size,
                resized,
            })
        )
            return file;
        const result = new File([encoded], happyAgentImageDownscaleName(file.name, encoded.type), {
            type: encoded.type,
            lastModified: file.lastModified,
        });
        prepared.set(result, Promise.resolve(result));
        return result;
    } finally {
        bitmap.close();
    }
}

async function imageEncode(
    bitmap: ImageBitmap,
    width: number,
    height: number,
    encoding: HappyAgentImageEncoding,
): Promise<Blob> {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot draw images.");
    // JPEG has no transparency; without a backdrop clear pixels turn black.
    if (encoding.mediaType === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({
        type: encoding.mediaType,
        ...(encoding.quality === undefined ? {} : { quality: encoding.quality }),
    });
    // A browser that cannot write the format falls back to PNG silently; a
    // mislabelled file would be worse than the original.
    if (blob.type !== encoding.mediaType) throw new Error("This browser cannot write the image.");
    return blob;
}
