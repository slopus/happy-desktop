import {
    HappyAgentApiError,
    type HappyAgentClient,
    type VaultUpload,
} from "@slopus/happy-agent-client";

/** How many bytes one `PUT` carries: small enough to show progress and to resend cheaply. */
const CHUNK_BYTES = 8 * 1024 * 1024;
/** How often a chunk that never arrived is sent again before the upload fails. */
const ATTEMPTS = 5;

export interface HappyAgentVaultUploadSendDeps {
    readonly client: Pick<
        HappyAgentClient,
        "createVaultUpload" | "uploadVaultChunk" | "getVaultUpload"
    >;
}

function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const done = (): void => {
            clearTimeout(timer);
            signal.removeEventListener("abort", done);
            resolve();
        };
        const timer = setTimeout(done, milliseconds);
        signal.addEventListener("abort", done, { once: true });
    });
}

function uploadOf(error: unknown): VaultUpload | undefined {
    if (!(error instanceof HappyAgentApiError) || error.status !== 409) return undefined;
    const upload = error.body?.["upload"];
    return typeof upload === "object" && upload !== null ? (upload as VaultUpload) : undefined;
}

/**
 * Sends a file's bytes as a resumable upload and answers its ID once every
 * byte has arrived. `uploadId` resumes one begun earlier from wherever the
 * Happy Agent says it stands; one that is gone is begun again. A chunk whose
 * answer was lost is not sent twice: the conflict names where to resume.
 */
export async function happyAgentVaultUploadSend(
    deps: HappyAgentVaultUploadSendDeps,
    file: Blob,
    uploadId: string | undefined,
    progress: (uploadId: string, received: number) => void,
    signal: AbortSignal,
): Promise<string> {
    const size = file.size;
    let upload: VaultUpload | undefined;
    if (uploadId !== undefined)
        upload = await deps.client
            .getVaultUpload(uploadId, { signal })
            .then((response) => response.upload)
            .catch((error: unknown) => {
                if (error instanceof HappyAgentApiError && error.status === 404) return undefined;
                throw error;
            });
    upload ??= (await deps.client.createVaultUpload({ size }, { signal })).upload;
    progress(upload.id, upload.received);
    let failures = 0;
    while (upload.status === "receiving") {
        const start: number = upload.received;
        const end = Math.min(size, start + CHUNK_BYTES);
        try {
            const data = await file.slice(start, end).arrayBuffer();
            upload = (
                await deps.client.uploadVaultChunk(upload.id, { data, start, size }, { signal })
            ).upload;
            failures = 0;
        } catch (error) {
            if (signal.aborted) throw error;
            const current = uploadOf(error);
            if (current !== undefined) upload = current;
            else if (error instanceof HappyAgentApiError && error.status < 500) throw error;
            else {
                failures += 1;
                if (failures >= ATTEMPTS) throw error;
                await waitFor(1_000 * 2 ** failures, signal);
                upload = (await deps.client.getVaultUpload(upload.id, { signal })).upload;
            }
        }
        progress(upload.id, upload.received);
    }
    return upload.id;
}
