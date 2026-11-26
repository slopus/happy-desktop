import { expect, it } from "vitest";
import type { DesktopClipboardImage } from "../shared/desktopContract";
import { clipboardPasteMissing } from "./clipboardPaste";

const image = (mediaType: DesktopClipboardImage["mediaType"], byte: number) => ({
    mediaType,
    bytes: new Uint8Array([byte]),
});
const pasted = (count: number) =>
    Array.from({ length: count }, () => new File([new Uint8Array([0])], "image.png"));

it("adds the clipboard images after the ones the paste carried", async () => {
    const missing = clipboardPasteMissing(pasted(1), [
        image("image/png", 1),
        image("image/gif", 2),
        image("image/jpeg", 3),
    ]);

    expect(missing.map((file) => [file.name, file.type])).toEqual([
        ["image-2.gif", "image/gif"],
        ["image-3.jpg", "image/jpeg"],
    ]);
    expect(
        await Promise.all(missing.map(async (file) => [...new Uint8Array(await file.bytes())])),
    ).toEqual([[2], [3]]);
});

it("adds nothing when the paste already carried as many files", () => {
    expect(clipboardPasteMissing(pasted(1), [image("image/png", 1)])).toEqual([]);
    expect(clipboardPasteMissing(pasted(3), [image("image/png", 1)])).toEqual([]);
    // Files copied in Finder: the host reports no images at all.
    expect(clipboardPasteMissing(pasted(3), [])).toEqual([]);
});
