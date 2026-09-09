import { thumbHashToDataURL } from "thumbhash";

/**
 * Decodes a daemon-issued ThumbHash placeholder, base64 in either alphabet,
 * into a data URL. Undefined for a hash that does not decode, so a caller shows
 * nothing rather than a broken image.
 */
export function thumbhashDataUrl(hash: string): string | undefined {
    try {
        const normalized = hash.replace(/-/gu, "+").replace(/_/gu, "/");
        const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
        return thumbHashToDataURL(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
    } catch {
        return undefined;
    }
}
