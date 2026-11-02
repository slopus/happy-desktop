import { describe, expect, it } from "vitest";
import {
    HAPPY_AGENT_IMAGE_BYTES_MAX,
    HAPPY_AGENT_IMAGE_JPEG_QUALITY,
    happyAgentImageDownscale,
    happyAgentImageDownscaleAccepted,
    happyAgentImageDownscaleName,
    happyAgentImageDownscalePlan,
} from "./happyAgentImageDownscale.js";

const MB = 1024 * 1024;

/** A PNG that is nothing but a signature and an IHDR declaring its size. */
function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
}

describe("happyAgentImageDownscalePlan", () => {
    it("leaves an image within both limits untouched", () => {
        expect(
            happyAgentImageDownscalePlan({
                mediaType: "image/png",
                bytes: 800_000,
                width: 1440,
                height: 900,
            }),
        ).toEqual({ kind: "keep" });
        expect(
            happyAgentImageDownscalePlan({
                mediaType: "image/jpeg",
                bytes: HAPPY_AGENT_IMAGE_BYTES_MAX,
                width: 2000,
                height: 2000,
            }),
        ).toEqual({ kind: "keep" });
    });

    it("scales a Retina screenshot to 2000 px on its long side, trying PNG before JPEG", () => {
        expect(
            happyAgentImageDownscalePlan({
                mediaType: "image/png",
                bytes: 4 * MB,
                width: 3024,
                height: 1964,
            }),
        ).toEqual({
            kind: "downscale",
            width: 2000,
            height: 1299,
            encodings: [
                { mediaType: "image/png" },
                { mediaType: "image/jpeg", quality: HAPPY_AGENT_IMAGE_JPEG_QUALITY },
            ],
        });
    });

    it("scales by the long side whichever way the image is oriented", () => {
        const plan = happyAgentImageDownscalePlan({
            mediaType: "image/jpeg",
            bytes: 2 * MB,
            width: 3000,
            height: 4000,
        });
        expect(plan).toMatchObject({ kind: "downscale", width: 1500, height: 2000 });
    });

    it("downscales a small-pixel image that is too heavy without enlarging it", () => {
        expect(
            happyAgentImageDownscalePlan({
                mediaType: "image/jpeg",
                bytes: 4 * MB,
                width: 1800,
                height: 1200,
            }),
        ).toEqual({
            kind: "downscale",
            width: 1800,
            height: 1200,
            encodings: [{ mediaType: "image/jpeg", quality: HAPPY_AGENT_IMAGE_JPEG_QUALITY }],
        });
    });

    it("writes photographs and WebP as JPEG and lossless BMP as PNG first", () => {
        const large = { bytes: 10 * MB, width: 4000, height: 3000 };
        expect(happyAgentImageDownscalePlan({ ...large, mediaType: "image/webp" })).toMatchObject({
            encodings: [{ mediaType: "image/jpeg" }],
        });
        expect(happyAgentImageDownscalePlan({ ...large, mediaType: "image/bmp" })).toMatchObject({
            encodings: [{ mediaType: "image/png" }, { mediaType: "image/jpeg" }],
        });
    });

    it("never touches a GIF, an SVG, or a format it cannot redraw", () => {
        const large = { bytes: 10 * MB, width: 4000, height: 3000 };
        for (const mediaType of ["image/gif", "image/svg+xml", "image/heic", ""])
            expect(happyAgentImageDownscalePlan({ ...large, mediaType })).toEqual({
                kind: "keep",
            });
    });

    it("never produces an empty side for an extreme aspect ratio", () => {
        expect(
            happyAgentImageDownscalePlan({
                mediaType: "image/png",
                bytes: 100_000,
                width: 100_000,
                height: 10,
            }),
        ).toMatchObject({ kind: "downscale", width: 2000, height: 1 });
    });
});

describe("happyAgentImageDownscaleAccepted", () => {
    it("takes a resized image even when it is not lighter", () => {
        expect(
            happyAgentImageDownscaleAccepted({
                sourceBytes: 1 * MB,
                encodedBytes: 2 * MB,
                resized: true,
            }),
        ).toBe(true);
    });

    it("takes a same-size re-encode only when it saves bytes", () => {
        expect(
            happyAgentImageDownscaleAccepted({
                sourceBytes: 4 * MB,
                encodedBytes: 1 * MB,
                resized: false,
            }),
        ).toBe(true);
        expect(
            happyAgentImageDownscaleAccepted({
                sourceBytes: 4 * MB,
                encodedBytes: 5 * MB,
                resized: false,
            }),
        ).toBe(false);
    });
});

describe("happyAgentImageDownscaleName", () => {
    it("names the copy after the format it was written as", () => {
        expect(happyAgentImageDownscaleName("Screenshot 2026.png", "image/jpeg")).toBe(
            "Screenshot 2026.jpg",
        );
        expect(happyAgentImageDownscaleName("scan.bmp", "image/png")).toBe("scan.png");
        expect(happyAgentImageDownscaleName("photo", "image/jpeg")).toBe("photo.jpg");
        expect(happyAgentImageDownscaleName("", "image/png")).toBe("image.png");
    });
});

describe("happyAgentImageDownscale", () => {
    it("returns the very same file for an image within the limits", async () => {
        const file = new File([pngHeader(1440, 900)], "small.png", { type: "image/png" });
        expect(await happyAgentImageDownscale(file)).toBe(file);
    });

    it("returns the very same file for a GIF of any size", async () => {
        const file = new File([new Uint8Array(4 * MB)], "loop.gif", { type: "image/gif" });
        expect(await happyAgentImageDownscale(file)).toBe(file);
    });

    it("keeps the source when the image cannot be decoded here", async () => {
        const file = new File([pngHeader(5000, 3000)], "large.png", { type: "image/png" });
        expect(await happyAgentImageDownscale(file)).toBe(file);
    });

    it("shares one preparation between everything that asks about a file", () => {
        const file = new File([pngHeader(5000, 3000)], "large.png", { type: "image/png" });
        expect(happyAgentImageDownscale(file)).toBe(happyAgentImageDownscale(file));
    });
});
