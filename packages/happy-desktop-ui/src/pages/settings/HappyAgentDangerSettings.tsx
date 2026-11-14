import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentDangerSettingsProps {
    /** The server's name, which deleting it asks to be typed. */
    readonly serverName: string;
    /** Deletes the server; rejects with the reason to show. */
    onDelete: (confirm: string) => Promise<void>;
}

/**
 * C-349 HappyAgentDangerSettings — Settings › Danger on a Happy Cloud server,
 * shown to its owners: deleting the server for everyone, after its name is
 * typed to confirm.
 */
export function HappyAgentDangerSettings(props: HappyAgentDangerSettingsProps) {
    const [confirming, setConfirming] = useState(false);
    return (
        <>
            <HappyAgentSettingsSection
                description="Everyone loses access, and its agents, tasks and files are deleted after a short grace period."
                title="Delete this server"
            >
                <Box className="happy-agent-members__actions">
                    <Button onClick={() => setConfirming(true)} size="small" variant="danger">
                        Delete this server
                    </Button>
                </Box>
            </HappyAgentSettingsSection>
            {confirming ? (
                <HappyAgentDeleteServerDialog
                    onClose={() => setConfirming(false)}
                    onDelete={props.onDelete}
                    serverName={props.serverName}
                />
            ) : null}
        </>
    );
}

function HappyAgentDeleteServerDialog(props: {
    readonly serverName: string;
    onClose: () => void;
    onDelete: (confirm: string) => Promise<void>;
}) {
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const ready = typed === props.serverName;
    const submit = (): void => {
        if (!ready || busy) return;
        setBusy(true);
        setError(undefined);
        void props.onDelete(typed).then(
            () => props.onClose(),
            (reason: unknown) => {
                setBusy(false);
                setError(reason instanceof Error ? reason.message : String(reason));
            },
        );
    };
    return (
        <ModalOverlay
            onDismiss={() => {
                if (!busy) props.onClose();
            }}
        >
            <Modal
                footer={
                    <>
                        <Button disabled={busy} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button disabled={!ready} loading={busy} onClick={submit} variant="danger">
                            Delete server
                        </Button>
                    </>
                }
                onClose={busy ? undefined : props.onClose}
                size="small"
                title={`Delete @${props.serverName}?`}
                tone="danger"
            >
                <Box className="happy-agent-members__confirm">
                    <p>
                        Everyone loses access, and its agents, tasks and files are deleted after a
                        short grace period.
                    </p>
                    <TextField
                        autoFocus
                        disabled={busy}
                        fullWidth
                        label="Type the server's name to confirm"
                        onSubmit={submit}
                        onValueChange={setTyped}
                        placeholder={props.serverName}
                        value={typed}
                    />
                    {error ? (
                        <Banner tone="danger" title="Not deleted">
                            {error}
                        </Banner>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
