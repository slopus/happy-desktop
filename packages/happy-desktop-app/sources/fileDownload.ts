/**
 * Saves one workspace file to the reader's machine under its own name.
 *
 * The bytes are handed to the anchor as a same-document object URL rather than
 * as the address they are served from: a `download` attribute is ignored for a
 * cross-origin address, and the browser would then navigate the whole app to
 * the file instead of saving it. A text source is the copy already in hand; an
 * address is read once, the same way the preview itself reads it.
 */
export async function fileDownload(
    path: string,
    source:
        | { readonly type: "text"; readonly text: string }
        | { readonly type: "url"; readonly url: string }
        | { readonly type: "blob"; readonly blob: Blob },
): Promise<void> {
    let blob: Blob;
    if (source.type === "text") blob = new Blob([source.text], { type: "text/plain" });
    else if (source.type === "blob") blob = source.blob;
    else {
        const response = await fetch(source.url);
        if (!response.ok)
            throw new Error(`The file could not be downloaded (${String(response.status)}).`);
        // A preview may stream ranges, but a save must contain the whole file.
        // `ok` includes 206, which would silently save a truncated recording.
        if (response.status === 206)
            throw new Error("Only part of the file arrived. Please try downloading it again.");
        blob = await response.blob();
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = path.slice(path.lastIndexOf("/") + 1);
    anchor.click();
    // The save may read the blob after the click returns, so the URL outlives
    // the call by a margin instead of being revoked the moment it is used.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
