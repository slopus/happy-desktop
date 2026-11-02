/** Intrinsic pixel size of an image, after any orientation it declares. */
export interface InlineImageSize {
    readonly width: number;
    readonly height: number;
}

/**
 * Base64 characters decoded on the first pass, and on the second one for a JPEG
 * whose frame header sits behind a large EXIF block. Every other format states
 * its size in the first few bytes, so the short pass is what nearly every
 * attachment costs.
 */
const HEAD_CHARS = 4_096;
const DEEP_CHARS = 65_536;

/**
 * The pixel size of an inline attachment, read from the image's own header.
 *
 * An inline image has no upload step and therefore no server-side analysis: the
 * bytes travel with the message, and both the composer that just attached it and
 * a transcript reloaded from the daemon hold nothing but base64. Without this the
 * renderer knows no dimensions at all and every photo is drawn at one invented
 * fallback box. Parsing the header — rather than decoding the image or waiting
 * for `<img>` to load — keeps the size available synchronously, which is what
 * both the reserved layout box and the virtualizer's row estimate need.
 *
 * Returns `undefined` for a format this parser does not cover or a truncated
 * header, which leaves the caller on its existing fallback rather than a guess
 * dressed as a measurement.
 */
export function inlineImageSize(data: string): InlineImageSize | undefined {
    const head = base64HeadBytes(data, HEAD_CHARS);
    if (!head) return undefined;
    const size = inlineImageSizeOfBytes(head);
    if (size) return size;
    // Only JPEG carries its frame header at an unbounded offset; re-reading a
    // wider window for anything else would parse the same bytes twice.
    if (!isJpeg(head) || data.length <= HEAD_CHARS) return undefined;
    const deep = base64HeadBytes(data, DEEP_CHARS);
    return deep ? inlineImageSizeOfBytes(deep) : undefined;
}

/**
 * The pixel size an image's leading bytes declare, for a caller that holds the
 * bytes themselves rather than their base64.
 */
export function inlineImageSizeOfBytes(bytes: Uint8Array): InlineImageSize | undefined {
    return (
        pngSize(bytes) ??
        gifSize(bytes) ??
        webpSize(bytes) ??
        bmpSize(bytes) ??
        jpegSize(bytes) ??
        undefined
    );
}

/**
 * Decodes the leading `chars` base64 characters. The slice is cut to a multiple
 * of four so it decodes on its own, and a payload shorter than the window
 * decodes whole.
 */
function base64HeadBytes(data: string, chars: number): Uint8Array | undefined {
    const length = Math.min(data.length, chars);
    const head = data.length <= length ? data : data.slice(0, length - (length % 4));
    if (head.length === 0) return undefined;
    try {
        const binary = atob(head);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1)
            bytes[index] = binary.charCodeAt(index);
        return bytes;
    } catch {
        return undefined;
    }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
    let value = "";
    for (let index = 0; index < length; index += 1)
        value += String.fromCharCode(bytes[offset + index] ?? 0);
    return value;
}

function uint32BE(bytes: Uint8Array, offset: number): number {
    return (
        ((bytes[offset]! << 24) |
            (bytes[offset + 1]! << 16) |
            (bytes[offset + 2]! << 8) |
            bytes[offset + 3]!) >>>
        0
    );
}

function uint16LE(bytes: Uint8Array, offset: number): number {
    return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function uint16BE(bytes: Uint8Array, offset: number): number {
    return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function uint24LE(bytes: Uint8Array, offset: number): number {
    return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16);
}

function uint32LE(bytes: Uint8Array, offset: number): number {
    return (
        (bytes[offset]! |
            (bytes[offset + 1]! << 8) |
            (bytes[offset + 2]! << 16) |
            (bytes[offset + 3]! << 24)) >>>
        0
    );
}

function sized(width: number, height: number): InlineImageSize | undefined {
    return width > 0 && height > 0 ? { width, height } : undefined;
}

/** PNG: an 8-byte signature, then IHDR's width and height as the first fields. */
function pngSize(bytes: Uint8Array): InlineImageSize | undefined {
    if (bytes.length < 24) return undefined;
    if (ascii(bytes, 1, 3) !== "PNG" || bytes[0] !== 0x89) return undefined;
    return sized(uint32BE(bytes, 16), uint32BE(bytes, 20));
}

/** GIF: the logical screen descriptor follows the 6-byte version signature. */
function gifSize(bytes: Uint8Array): InlineImageSize | undefined {
    if (bytes.length < 10) return undefined;
    const signature = ascii(bytes, 0, 6);
    if (signature !== "GIF87a" && signature !== "GIF89a") return undefined;
    return sized(uint16LE(bytes, 6), uint16LE(bytes, 8));
}

/**
 * WebP: a RIFF container whose first chunk states the size three different ways
 * — an extended-format canvas, a lossless bit-packed pair, or a lossy VP8 frame
 * header behind its start code.
 */
function webpSize(bytes: Uint8Array): InlineImageSize | undefined {
    if (bytes.length < 30) return undefined;
    if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return undefined;
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X") return sized(uint24LE(bytes, 24) + 1, uint24LE(bytes, 27) + 1);
    if (chunk === "VP8L") {
        if (bytes[20] !== 0x2f) return undefined;
        const packed = uint32LE(bytes, 21);
        return sized((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
    }
    if (chunk === "VP8 ") {
        if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return undefined;
        return sized(uint16LE(bytes, 26) & 0x3fff, uint16LE(bytes, 28) & 0x3fff);
    }
    return undefined;
}

/** BMP: the DIB header's dimensions, whose height is negative when top-down. */
function bmpSize(bytes: Uint8Array): InlineImageSize | undefined {
    if (bytes.length < 26 || ascii(bytes, 0, 2) !== "BM") return undefined;
    const height = uint32LE(bytes, 22) | 0;
    return sized(uint32LE(bytes, 18) | 0, Math.abs(height));
}

function isJpeg(bytes: Uint8Array): boolean {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * JPEG: walks the marker segments to the start-of-frame that states the size,
 * and applies the EXIF orientation found on the way, because the browser rotates
 * the painted image and an unswapped box would reserve the wrong shape for it.
 */
function jpegSize(bytes: Uint8Array): InlineImageSize | undefined {
    if (!isJpeg(bytes)) return undefined;
    let orientation = 1;
    let offset = 2;
    while (offset + 4 <= bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1;
            continue;
        }
        const marker = bytes[offset + 1]!;
        // Padding fill bytes and the standalone markers carry no length field.
        if (marker === 0xff) {
            offset += 1;
            continue;
        }
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
            offset += 2;
            continue;
        }
        const length = uint16BE(bytes, offset + 2);
        if (length < 2) return undefined;
        const payload = offset + 4;
        if (marker === 0xe1)
            orientation = exifOrientation(bytes, payload, length - 2) ?? orientation;
        if (SOF_MARKERS.has(marker)) {
            if (payload + 5 > bytes.length) return undefined;
            const height = uint16BE(bytes, payload + 1);
            const width = uint16BE(bytes, payload + 3);
            // 5–8 are the transposed orientations, where the stored frame is the
            // rotated one and the displayed image swaps its axes.
            return orientation >= 5 && orientation <= 8
                ? sized(height, width)
                : sized(width, height);
        }
        // Entropy-coded scan data begins here; no frame header follows it.
        if (marker === 0xda) return undefined;
        offset = payload + (length - 2);
    }
    return undefined;
}

/** The frame headers that state a size: baseline, progressive, and lossless. */
const SOF_MARKERS = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/** Reads IFD0's orientation tag out of an APP1 EXIF segment, if it has one. */
function exifOrientation(bytes: Uint8Array, offset: number, length: number): number | undefined {
    if (length < 14 || offset + length > bytes.length) return undefined;
    if (ascii(bytes, offset, 4) !== "Exif") return undefined;
    const tiff = offset + 6;
    const byteOrder = ascii(bytes, tiff, 2);
    const little = byteOrder === "II";
    if (!little && byteOrder !== "MM") return undefined;
    const short = (at: number) => (little ? uint16LE(bytes, at) : uint16BE(bytes, at));
    const long = (at: number) => (little ? uint32LE(bytes, at) : uint32BE(bytes, at));
    const directory = tiff + long(tiff + 4);
    if (directory + 2 > offset + length) return undefined;
    const entries = short(directory);
    for (let index = 0; index < entries; index += 1) {
        const entry = directory + 2 + index * 12;
        if (entry + 12 > offset + length) return undefined;
        if (short(entry) !== 0x0112) continue;
        const value = short(entry + 8);
        return value >= 1 && value <= 8 ? value : undefined;
    }
    return undefined;
}
