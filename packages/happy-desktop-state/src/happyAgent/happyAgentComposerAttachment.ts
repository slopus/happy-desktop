import type { ComposerAttachment } from "../modules/composer/composerState.js";
import type { HappyAgentImageInput } from "./happyAgentTypes.js";

/**
 * Bytes per base64 chunk. Divisibility by three means each chunk can be encoded
 * independently without padding in the middle of the joined result.
 */
const CHUNK = 0x6000;

/**
 * How large an image may be before it stops travelling inside the turn. Inline
 * bytes are base64 in a JSON body every hop holds in memory at once, and a
 * screenshot is comfortably under this; anything larger is better served as a
 * file the agent opens when it wants it.
 */
const INLINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function base64Encode(bytes: Uint8Array): string {
    const encoded: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        const binary = String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
        encoded.push(btoa(binary));
    }
    return encoded.join("");
}

/**
 * The shared local/remote attachment ceiling. A Remote Happy Agent carries the daemon's
 * JSON request through a 40 MiB P2P envelope; 29 MiB of source bytes expands to
 * about 38.7 MiB in base64, leaving room for JSON keys and the destination path.
 */
export const HAPPY_AGENT_COMPOSER_FILE_MAX_BYTES = 29 * 1024 * 1024;

function mediaPreviewUrl(file: File): string | undefined {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return undefined;
    if (typeof URL.createObjectURL !== "function") return undefined;
    try {
        return URL.createObjectURL(file);
    } catch {
        return undefined;
    }
}

/**
 * Creates one picked, dropped, or pasted draft attachment without reading its
 * bytes. Selection is synchronous, so an immediate Enter cannot overtake an
 * attachment that is still being prepared. A small image is marked to travel
 * inline with the turn; everything else becomes a copy written into the
 * session's working directory when the draft is submitted.
 */
export function happyAgentComposerAttachmentCreate(
    id: string,
    file: File,
    sourcePath?: string,
): ComposerAttachment {
    const previewUrl = mediaPreviewUrl(file);
    if (file.type.startsWith("image/") && file.size <= INLINE_IMAGE_MAX_BYTES) {
        return {
            kind: "inlineImage",
            id,
            name: file.name || "image",
            size: file.size,
            mediaType: file.type,
            file,
            ...(previewUrl ? { previewUrl } : {}),
        };
    }
    return {
        kind: "workspaceFile",
        id,
        name: file.name || "attachment",
        size: file.size,
        mediaType: file.type || "application/octet-stream",
        file,
        ...(sourcePath ? { sourcePath } : {}),
        ...(previewUrl ? { previewUrl } : {}),
    };
}

function attachmentSizeAssert(name: string, size: number): void {
    if (size > HAPPY_AGENT_COMPOSER_FILE_MAX_BYTES)
        throw new Error(
            `${name} is too large to attach. Happy Agent currently accepts files up to 29 MB.`,
        );
}

/**
 * Validates a whole draft before it creates a session or writes its first file.
 *
 * The ceiling is a fact about carrying bytes through here, not about the file,
 * so it is asked only of the attachments that will be carried. One the host can
 * copy where it stands never becomes base64, never becomes a JSON body, and has
 * no reason to be measured against the size of one.
 */
export function happyAgentComposerAttachmentsValidate(
    attachments: readonly ComposerAttachment[],
): void {
    for (const attachment of attachments)
        if (attachment.kind === "workspaceFile" && attachment.sourcePath === undefined)
            attachmentSizeAssert(attachment.name, attachment.size);
    const inlineBytes = attachments
        .filter((attachment) => attachment.kind === "inlineImage")
        .reduce((total, attachment) => total + attachment.size, 0);
    if (inlineBytes > HAPPY_AGENT_COMPOSER_FILE_MAX_BYTES)
        throw new Error(
            "These images are too large to attach together. Happy Agent currently accepts up to 29 MB per message.",
        );
}

/**
 * Encodes one non-inline attachment only when a send actually needs it. The
 * explicit shared ceiling makes local and Remote Happy Agent sends behave alike.
 */
export async function happyAgentWorkspaceAttachmentData(
    attachment: Extract<ComposerAttachment, { kind: "workspaceFile" }>,
): Promise<string> {
    attachmentSizeAssert(attachment.name, attachment.size);
    return base64Encode(new Uint8Array(await attachment.file.arrayBuffer()));
}

/** Releases the browser resource held by one media preview, when it has one. */
export function happyAgentComposerAttachmentPreviewRelease(attachment: ComposerAttachment): void {
    if (attachment.kind === "reviewComments") return;
    if (attachment.previewUrl && typeof URL.revokeObjectURL === "function")
        URL.revokeObjectURL(attachment.previewUrl);
}

/**
 * Names a turn's files so the agent learns about one it was never shown. The
 * paths are appended rather than woven into what was typed: the sentence someone
 * wrote is theirs, and a bare list under it reads the same whether they wrote
 * "look at this" or nothing at all.
 *
 * Each path arrives ready to be read as written — `./name` for a copy placed in
 * the working directory, an absolute path for a file named where it already
 * lies — so this decides how the list reads and never where anything is.
 */
export function happyAgentAttachmentTextAppend(text: string, paths: readonly string[]): string {
    if (paths.length === 0) return text;
    const lines = paths.map((path) => `- ${path}`).join("\n");
    const heading = paths.length === 1 ? "Attached file:" : "Attached files:";
    return text.trim().length === 0 ? `${heading}\n${lines}` : `${text}\n\n${heading}\n${lines}`;
}

/**
 * Writes a draft's review notes out as one request the agent can act on, under
 * whatever the reader said about them.
 *
 * Each note names the file and the line it was left on, because that address is
 * the whole reason a note beats a sentence in the composer: "this is wrong"
 * about a named line is actionable, and the same words about a changed file are
 * a guess. A note whose file moved underneath it says so rather than quietly
 * offering a line number that no longer means anything.
 *
 * The request is written here, at send, rather than when the notes were
 * attached: until then they are a chip the reader can drop whole, not text
 * they have to edit around.
 */
export function happyAgentCommentsTextAppend(
    text: string,
    attachments: readonly ComposerAttachment[],
): string {
    const comments = attachments.flatMap((attachment) =>
        attachment.kind === "reviewComments" ? attachment.comments : [],
    );
    if (comments.length === 0) return text;
    const lines = comments.map((comment) => {
        const place =
            comment.lineNumber === 0
                ? comment.path
                : `${comment.path}:${String(comment.lineNumber)}${
                      comment.side === "deletions" ? " (removed line)" : ""
                  }`;
        const caveat = comment.stale ? " — written before the file changed again" : "";
        return `- ${place}${caveat}\n  ${comment.text.split("\n").join("\n  ")}`;
    });
    const request = `Please address these review comments:\n\n${lines.join("\n")}`;
    return text.trim().length === 0 ? request : `${text}\n\n${request}`;
}

/** Encodes the inline images of a draft, in draft order, only during submission. */
export async function happyAgentImageInputsOf(
    attachments: readonly ComposerAttachment[],
): Promise<readonly HappyAgentImageInput[]> {
    happyAgentComposerAttachmentsValidate(attachments);
    const inline = attachments.filter((attachment) => attachment.kind === "inlineImage");
    const images: HappyAgentImageInput[] = [];
    for (const attachment of inline)
        images.push({
            mediaType: attachment.mediaType,
            data: base64Encode(new Uint8Array(await attachment.file.arrayBuffer())),
        });
    return images;
}
