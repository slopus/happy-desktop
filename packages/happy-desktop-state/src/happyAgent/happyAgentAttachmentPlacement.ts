import { UserError } from "../types.js";
import type { HappyAgentHostServices } from "./happyAgentHostServices.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import type { HappyCloudFileBlock } from "./happyAgentTypes.js";

/** The largest file a Happy Cloud conversation takes. */
export const HAPPY_CLOUD_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** One file the reader attached, as a Happy Cloud upload needs it. */
export interface HappyCloudAttachmentFile {
    readonly name: string;
    readonly mediaType: string;
    readonly size: number;
    readonly file: Blob;
}

/** The host's attachment routes, as one connection may use them. */
export interface HappyAgentAttachmentPlacement extends Pick<
    HappyAgentHostServices,
    "attachmentSourceReachable" | "attachmentWrite"
> {
    /**
     * Uploads one file to an agent's Happy Cloud conversation, answering the
     * block its message names it with. Present exactly on a Happy Cloud
     * connection, where nothing is ever copied into a checkout.
     */
    readonly attachmentUpload?: (
        agentId: string,
        attachment: HappyCloudAttachmentFile,
    ) => Promise<HappyCloudFileBlock>;
    /** One file a Happy Cloud message names, by its conversation and attachment ID. */
    readonly attachmentDownload?: (agentId: string, attachment: string) => Promise<Blob>;
}

/**
 * The attachment routes for one connection.
 *
 * A Happy Cloud server has no checkout on this computer to copy a file into,
 * and its sign-in is not one the host's Happy Agent holds: asking the host to
 * place a file there would hand the host a connection it does not know, and
 * the host answers that by ending the server's sign-in. So a Happy Cloud
 * connection never reaches the host's routes; its files go to the server
 * itself, which keeps them for the conversation they were sent to.
 */
export function happyAgentAttachmentPlacementCreate(
    hostServices: Pick<HappyAgentHostServices, "attachmentSourceReachable" | "attachmentWrite">,
    cloudRequest: HappyCloudRequest | undefined,
): HappyAgentAttachmentPlacement {
    if (cloudRequest === undefined)
        return {
            attachmentSourceReachable: (groupId, sourcePath) =>
                hostServices.attachmentSourceReachable(groupId, sourcePath),
            attachmentWrite: (groupId, name, content) =>
                hostServices.attachmentWrite(groupId, name, content),
        };
    return {
        attachmentSourceReachable: () => Promise.resolve(false),
        attachmentWrite: () =>
            Promise.reject(
                new UserError(
                    "Files can be attached only in a Happy Cloud chat that already exists.",
                    "attachment_unsupported",
                ),
            ),
        attachmentUpload: async (agentId, attachment) => {
            if (attachment.size > HAPPY_CLOUD_ATTACHMENT_MAX_BYTES)
                throw new UserError(
                    `${attachment.name} is too large to attach. Happy Cloud takes files up to 25 MiB.`,
                    "attachment_too_large",
                );
            const answer = (await cloudRequest(
                "PUT",
                `v0/agents/${encodeURIComponent(agentId)}/attachments?name=${encodeURIComponent(attachment.name)}`,
                attachment.file,
                { "content-type": attachment.mediaType },
            )) as { readonly attachment?: { readonly id?: unknown; readonly name?: unknown } };
            const id = answer?.attachment?.id;
            if (typeof id !== "string" || id.length === 0)
                throw new UserError("The server didn't accept the file.", "attachment_failed");
            const name = answer.attachment?.name;
            return {
                type: "file",
                attachment: id,
                name: typeof name === "string" && name.length > 0 ? name : attachment.name,
            };
        },
        attachmentDownload: async (agentId, attachment) => {
            const bytes = await cloudRequest(
                "GET",
                `v0/agents/${encodeURIComponent(agentId)}/attachments/${encodeURIComponent(attachment)}`,
                undefined,
                { accept: "*/*" },
            );
            if (!(bytes instanceof Blob))
                throw new UserError("The server didn't send the file.", "attachment_failed");
            return bytes;
        },
    };
}
