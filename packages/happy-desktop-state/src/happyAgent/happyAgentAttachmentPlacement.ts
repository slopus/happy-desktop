import { UserError } from "../types.js";
import type { HappyAgentHostServices } from "./happyAgentHostServices.js";

/** The host's attachment routes, as one connection may use them. */
export type HappyAgentAttachmentPlacement = Pick<
    HappyAgentHostServices,
    "attachmentSourceReachable" | "attachmentWrite"
>;

/**
 * The attachment routes for one connection.
 *
 * A Happy Cloud server has no checkout on this computer to copy a file into,
 * and its sign-in is not one the host's Happy Agent holds: asking the host to
 * place a file there would hand the host a connection it does not know, and
 * the host answers that by ending the server's sign-in. So a Happy Cloud
 * connection never reaches these routes, and refuses the copy in words.
 */
export function happyAgentAttachmentPlacementCreate(
    hostServices: HappyAgentAttachmentPlacement,
    happyCloud: boolean,
): HappyAgentAttachmentPlacement {
    if (!happyCloud)
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
                    "Files can't be attached to a Happy Cloud chat yet.",
                    "attachment_unsupported",
                ),
            ),
    };
}
