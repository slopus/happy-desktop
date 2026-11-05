import type { HappyAgentVaultUpload } from "happy-desktop-state";
import { Button } from "../../../Button";
import { FileTreeFamilyIcon, fileTreeFamily } from "../../../FileTree";
import { ScrollArea } from "../../../Scrollbar";
import { vaultSizeText } from "./vaultPresentation";

/** Where one upload stands, in words. */
function phaseText(upload: HappyAgentVaultUpload): string {
    switch (upload.phase) {
        case "waiting":
            return "Waiting";
        case "sending":
            return `${vaultSizeText(upload.sent)} of ${vaultSizeText(upload.size)}`;
        case "placing":
            return upload.kind === "artifact" ? "Reading the artifact" : "Finishing";
        case "done":
            return "Done";
        case "failed":
            return upload.error.message;
    }
}

/**
 * The files this window is sending, newest first, at the foot of the listing.
 * Each says how far it has gone; a failed one can be sent again, and any one
 * can be taken off the list, which cancels it while it is still going.
 */
export function VaultUploads(props: {
    uploads: readonly HappyAgentVaultUpload[];
    onRetry: (uploadId: string) => void;
    onDismiss: (uploadId: string) => void;
}) {
    if (props.uploads.length === 0) return null;
    const going = props.uploads.filter(
        (upload) => upload.phase !== "done" && upload.phase !== "failed",
    ).length;
    return (
        <section
            aria-label="Uploads"
            className="happy-vault-uploads"
            data-happy-desktop-ui="vault-uploads"
        >
            <h2 className="happy-vault-uploads__heading">
                {going === 0
                    ? "Uploads"
                    : `Uploading ${String(going)} ${going === 1 ? "file" : "files"}`}
            </h2>
            <ScrollArea
                className="happy-vault-uploads__scroll"
                viewportClassName="happy-vault-uploads__viewport"
            >
                <ul className="happy-vault-uploads__list">
                    {props.uploads.map((upload) => {
                        const active = upload.phase !== "done" && upload.phase !== "failed";
                        const progress =
                            upload.phase === "done" || upload.phase === "placing"
                                ? 1
                                : upload.size === 0
                                  ? 0
                                  : Math.min(1, upload.sent / upload.size);
                        // An artifact shows as the page it becomes, not as the zip it is.
                        const family = fileTreeFamily({
                            kind: "file",
                            name: upload.kind === "artifact" ? "index.html" : upload.name,
                        });
                        return (
                            <li
                                className="happy-vault-upload"
                                data-happy-desktop-ui="vault-upload"
                                data-phase={upload.phase}
                                key={upload.id}
                            >
                                <span
                                    aria-hidden="true"
                                    className="happy-file-family happy-vault-upload__glyph"
                                    data-family={family}
                                >
                                    <FileTreeFamilyIcon family={family} size={16} />
                                </span>
                                <span className="happy-vault-upload__text">
                                    <span className="happy-vault-upload__line">
                                        <span
                                            className="happy-vault-upload__name"
                                            title={upload.name}
                                        >
                                            {upload.name}
                                        </span>
                                        <span
                                            className="happy-vault-upload__phase"
                                            title={phaseText(upload)}
                                        >
                                            {phaseText(upload)}
                                        </span>
                                    </span>
                                    <span
                                        aria-label={`${upload.name}: ${phaseText(upload)}`}
                                        aria-valuemax={100}
                                        aria-valuemin={0}
                                        aria-valuenow={Math.round(progress * 100)}
                                        className="happy-vault-upload__bar"
                                        role="progressbar"
                                    >
                                        <span
                                            className="happy-vault-upload__fill"
                                            style={{ transform: `scaleX(${String(progress)})` }}
                                        />
                                    </span>
                                </span>
                                <span className="happy-vault-upload__actions">
                                    {upload.phase === "failed" ? (
                                        <Button
                                            onClick={() => props.onRetry(upload.id)}
                                            size="small"
                                            variant="ghost"
                                        >
                                            Retry
                                        </Button>
                                    ) : null}
                                    <Button
                                        aria-label={
                                            active
                                                ? `Cancel ${upload.name}`
                                                : `Take ${upload.name} off the list`
                                        }
                                        icon="close"
                                        iconOnly
                                        onClick={() => props.onDismiss(upload.id)}
                                        size="small"
                                        title={active ? "Cancel" : "Dismiss"}
                                        variant="ghost"
                                    />
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </ScrollArea>
        </section>
    );
}
