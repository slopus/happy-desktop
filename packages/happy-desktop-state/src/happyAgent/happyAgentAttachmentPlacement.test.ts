import { describe, expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import { happyAgentAttachmentPlacementCreate } from "./happyAgentAttachmentPlacement.js";
import type { HappyAgentGroupId } from "./happyAgentTypes.js";

const group = "workspace" as HappyAgentGroupId;

function hostServices() {
    return {
        attachmentSourceReachable: vi.fn(async () => true),
        attachmentWrite: vi.fn(async (_group: HappyAgentGroupId, name: string) => ({ path: name })),
    };
}

describe("happyAgentAttachmentPlacementCreate", () => {
    it("never hands a Happy Cloud attachment to the host, and refuses it in words", async () => {
        const host = hostServices();
        const placement = happyAgentAttachmentPlacementCreate(host, true);

        await expect(placement.attachmentSourceReachable(group, "/tmp/notes.txt")).resolves.toBe(
            false,
        );
        const written = placement.attachmentWrite(group, "notes.txt", "bm90ZXM=");
        await expect(written).rejects.toBeInstanceOf(UserError);
        await expect(written).rejects.toMatchObject({
            code: "attachment_unsupported",
            message: "Files can't be attached to a Happy Cloud chat yet.",
        });
        expect(host.attachmentSourceReachable).not.toHaveBeenCalled();
        expect(host.attachmentWrite).not.toHaveBeenCalled();
    });

    it("places other connections' attachments through the host", async () => {
        const host = hostServices();
        const placement = happyAgentAttachmentPlacementCreate(host, false);

        await expect(placement.attachmentSourceReachable(group, "/tmp/notes.txt")).resolves.toBe(
            true,
        );
        await expect(placement.attachmentWrite(group, "notes.txt", "bm90ZXM=")).resolves.toEqual({
            path: "notes.txt",
        });
        expect(host.attachmentSourceReachable).toHaveBeenCalledWith(group, "/tmp/notes.txt");
        expect(host.attachmentWrite).toHaveBeenCalledWith(group, "notes.txt", "bm90ZXM=");
    });
});
