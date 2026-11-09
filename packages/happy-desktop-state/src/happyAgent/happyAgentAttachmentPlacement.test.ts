import { describe, expect, it, vi } from "vitest";
import { UserError } from "../types.js";
import {
    HAPPY_CLOUD_ATTACHMENT_MAX_BYTES,
    happyAgentAttachmentPlacementCreate,
} from "./happyAgentAttachmentPlacement.js";
import {
    happyCloudRequestCreate,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
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
        const placement = happyAgentAttachmentPlacementCreate(host, vi.fn<HappyCloudRequest>());

        await expect(placement.attachmentSourceReachable(group, "/tmp/notes.txt")).resolves.toBe(
            false,
        );
        const written = placement.attachmentWrite(group, "notes.txt", "bm90ZXM=");
        await expect(written).rejects.toBeInstanceOf(UserError);
        await expect(written).rejects.toMatchObject({
            code: "attachment_unsupported",
            message: "Files can be attached only in a Happy Cloud chat that already exists.",
        });
        expect(host.attachmentSourceReachable).not.toHaveBeenCalled();
        expect(host.attachmentWrite).not.toHaveBeenCalled();
    });

    it("places other connections' attachments through the host", async () => {
        const host = hostServices();
        const placement = happyAgentAttachmentPlacementCreate(host, undefined);

        await expect(placement.attachmentSourceReachable(group, "/tmp/notes.txt")).resolves.toBe(
            true,
        );
        await expect(placement.attachmentWrite(group, "notes.txt", "bm90ZXM=")).resolves.toEqual({
            path: "notes.txt",
        });
        expect(host.attachmentSourceReachable).toHaveBeenCalledWith(group, "/tmp/notes.txt");
        expect(host.attachmentWrite).toHaveBeenCalledWith(group, "notes.txt", "bm90ZXM=");
        expect(placement.attachmentUpload).toBeUndefined();
    });

    it("uploads a Happy Cloud attachment's bytes to its conversation and names it by the server's ID", async () => {
        const request = vi.fn<HappyCloudRequest>(async () => ({
            attachment: { id: "digest-notes", name: "notes.txt", mimeType: "text/plain", size: 5 },
        }));
        const placement = happyAgentAttachmentPlacementCreate(hostServices(), request);
        const file = new Blob(["notes"], { type: "text/plain" });

        await expect(
            placement.attachmentUpload!("agent one", {
                name: "my notes.txt",
                mediaType: "text/plain",
                size: file.size,
                file,
            }),
        ).resolves.toEqual({ type: "file", attachment: "digest-notes", name: "notes.txt" });
        expect(request).toHaveBeenCalledWith(
            "PUT",
            "v0/agents/agent%20one/attachments?name=my%20notes.txt",
            file,
            { "content-type": "text/plain" },
        );
    });

    it("refuses a file over Happy Cloud's 25 MiB before sending any of it", async () => {
        const request = vi.fn<HappyCloudRequest>();
        const placement = happyAgentAttachmentPlacementCreate(hostServices(), request);

        await expect(
            placement.attachmentUpload!("agent", {
                name: "video.mov",
                mediaType: "video/quicktime",
                size: HAPPY_CLOUD_ATTACHMENT_MAX_BYTES + 1,
                file: new Blob([]),
            }),
        ).rejects.toMatchObject({
            code: "attachment_too_large",
            message: "video.mov is too large to attach. Happy Cloud takes files up to 25 MiB.",
        });
        expect(request).not.toHaveBeenCalled();
    });

    it("sends the file itself over the connection's transport, not as JSON", async () => {
        const fetch = vi.fn(
            async (_url: string | URL | Request, _init?: RequestInit) =>
                new Response(JSON.stringify({ attachment: { id: "digest", name: "a.pdf" } }), {
                    status: 201,
                }),
        );
        const placement = happyAgentAttachmentPlacementCreate(
            hostServices(),
            happyCloudRequestCreate({
                endpoint: "http://cloud.test/api/",
                token: "capability",
                fetch,
            }),
        );
        const file = new Blob(["%PDF"], { type: "application/pdf" });

        await placement.attachmentUpload!("agent", {
            name: "a.pdf",
            mediaType: "application/pdf",
            size: file.size,
            file,
        });
        const [url, init] = fetch.mock.calls[0]!;
        expect(url).toBe("http://cloud.test/api/v0/agents/agent/attachments?name=a.pdf");
        expect(init).toMatchObject({
            method: "PUT",
            body: file,
            headers: { authorization: "Bearer capability", "content-type": "application/pdf" },
        });
    });
});

it("downloads a Happy Cloud file's bytes with the reader's sign-in", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
        Promise.resolve(
            new Response("remember the milk\n", {
                status: 200,
                headers: { "content-type": "text/plain" },
            }),
        ),
    );
    const placement = happyAgentAttachmentPlacementCreate(
        { attachmentSourceReachable: vi.fn(), attachmentWrite: vi.fn() },
        happyCloudRequestCreate({ endpoint: "http://cloud.test/api", token: "access", fetch }),
    );

    const blob = await placement.attachmentDownload!("agent one", "digest");

    expect(await blob.text()).toBe("remember the milk\n");
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://cloud.test/api/v0/agents/agent%20one/attachments/digest");
    expect(init?.method).toBe("GET");
    expect(init?.headers).toMatchObject({ authorization: "Bearer access", accept: "*/*" });
});

it("still reads a JSON answer as JSON when no other type is asked for", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
        Promise.resolve(Response.json({ ok: true })),
    );
    const request = happyCloudRequestCreate({ endpoint: "http://cloud.test", token: "t", fetch });
    expect(await request("GET", "v0/thing")).toEqual({ ok: true });
});
