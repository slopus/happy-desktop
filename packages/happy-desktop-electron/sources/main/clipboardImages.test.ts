import { expect, it } from "vitest";
import { clipboardImagesParse } from "./clipboardImages";

it("reads the clipboard reader's images in order", () => {
    const images = clipboardImagesParse(
        `${JSON.stringify([
            { mediaType: "image/png", data: Buffer.from([1, 2]).toString("base64") },
            { mediaType: "image/gif", data: Buffer.from([3]).toString("base64") },
        ])}\n`,
    );

    expect(images.map((entry) => [entry.mediaType, [...entry.bytes]])).toEqual([
        ["image/png", [1, 2]],
        ["image/gif", [3]],
    ]);
});

it("refuses output the reader would not print", () => {
    expect(() => clipboardImagesParse("{}")).toThrow();
    expect(() => clipboardImagesParse(`[{"mediaType":"image/tiff","data":""}]`)).toThrow();
    expect(() => clipboardImagesParse(`[{"mediaType":"image/png"}]`)).toThrow();
});
