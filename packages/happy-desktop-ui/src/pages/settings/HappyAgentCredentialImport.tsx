import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Checkbox } from "../../Checkbox";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { SegmentedControl } from "../../SegmentedControl";
import { Spinner } from "../../Spinner";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";
import { HappyAgentSettingsStatus } from "./HappyAgentSettingsStatus";

/** Whose credential an import becomes. */
export type HappyAgentCredentialImportScope = "team" | "private";

interface HappyAgentCredentialImportRowBase {
    readonly id: string;
    /** The vendor's name, such as "OpenAI". */
    readonly vendorName: string;
    readonly label: string;
    /** Where it was found, such as `$OPENAI_API_KEY`. */
    readonly source: string;
    /** The account it signs in as, when known. */
    readonly account?: string;
}

/** One credential found on this computer. Never its secret. */
export type HappyAgentCredentialImportRow =
    | (HappyAgentCredentialImportRowBase & {
          readonly use: "import";
          /**
           * A sign-in the server takes over; the copy on this computer may
           * stop working once it is imported.
           */
          readonly subscription: boolean;
          /** The last four characters behind dots. */
          readonly masked?: string;
          /** Where it goes when picked; absent when not picked. */
          readonly picked?: HappyAgentCredentialImportScope;
          readonly result?:
              | { readonly ok: true; readonly duplicate: boolean }
              | { readonly ok: false; readonly message: string };
      })
    | (HappyAgentCredentialImportRowBase & {
          readonly use: "signIn";
          /** Whether this server can sign the subscription in itself. */
          readonly signInAvailable: boolean;
      })
    | (HappyAgentCredentialImportRowBase & {
          readonly use: "unsupported";
          readonly reason: string;
      });

export interface HappyAgentCredentialImportProps {
    /** Whether the import dialog is on screen. */
    readonly open: boolean;
    readonly phase: "idle" | "scanning" | "ready" | "importing";
    readonly rows: readonly HappyAgentCredentialImportRow[];
    /** Whether the last look also read the login shell's environment. */
    readonly shellScanned: boolean;
    /** Whether the member may add credentials for the whole team. */
    readonly teamAllowed: boolean;
    readonly error?: string;
    onOpen: () => void;
    onClose: () => void;
    onScan: (options: { readonly shell: boolean }) => void;
    onPickToggle: (id: string) => void;
    onPickScopeChange: (id: string, scope: HappyAgentCredentialImportScope) => void;
    onImport: () => void;
    /** Starts the server's own sign-in for the subscription a row found. */
    onSignIn?: (id: string) => void;
}

/**
 * Settings › Providers › Import: a row that opens a dialog listing the model
 * provider keys and sign-ins already on this computer, and which of them to
 * copy to the account. A sign-in is never picked for the person: the server
 * takes it over, so signing in from Happy is the better way.
 */
export function HappyAgentCredentialImport(props: HappyAgentCredentialImportProps) {
    return (
        <HappyAgentSettingsSection
            description="Copies API keys and sign-ins already on this computer to your account. Nothing is sent until you pick what to import."
            title="Import from this computer"
        >
            <Box className="happy-agent-credential-import__actions">
                <Button onClick={props.onOpen} size="small" variant="secondary">
                    Import…
                </Button>
            </Box>
            {props.open ? <HappyAgentCredentialImportDialog {...props} /> : null}
        </HappyAgentSettingsSection>
    );
}

function HappyAgentCredentialImportDialog(props: HappyAgentCredentialImportProps) {
    const busy = props.phase === "scanning" || props.phase === "importing";
    const pickedCount = props.rows.filter((row) => row.use === "import" && row.picked).length;
    const takeoverPicked = props.rows.some(
        (row) => row.use === "import" && row.subscription && row.picked !== undefined,
    );
    return (
        <ModalOverlay
            onDismiss={() => {
                if (props.phase !== "importing") props.onClose();
            }}
        >
            <Modal
                footer={
                    <>
                        <Button
                            disabled={props.phase === "importing"}
                            onClick={props.onClose}
                            variant="ghost"
                        >
                            Close
                        </Button>
                        <Button
                            disabled={pickedCount === 0 && props.phase !== "importing"}
                            loading={props.phase === "importing"}
                            onClick={props.onImport}
                        >
                            {pickedCount <= 1 ? "Import" : `Import ${String(pickedCount)}`}
                        </Button>
                    </>
                }
                icon="lock"
                onClose={props.phase === "importing" ? undefined : props.onClose}
                size="large"
                title="Import from this computer"
            >
                <Box
                    className="happy-agent-credential-import"
                    data-happy-desktop-ui="happy-agent-credential-import"
                >
                    {props.error ? (
                        <Banner tone="danger" title="Nothing imported">
                            {props.error}
                        </Banner>
                    ) : null}
                    {takeoverPicked ? (
                        <Banner tone="warning" title="Signing in from Happy is better">
                            Happy Cloud will take over this sign-in. The copy on this computer may
                            stop working, and you may need to sign in to Codex or Claude Code here
                            again.
                        </Banner>
                    ) : null}
                    {props.phase === "scanning" && props.rows.length === 0 ? (
                        <Box className="happy-agent-credential-import__pending">
                            <Spinner size={16} />
                            <span>Looking on this computer…</span>
                        </Box>
                    ) : (
                        <Box
                            className="happy-agent-credential-import__list"
                            data-happy-desktop-ui="happy-agent-credential-import-list"
                        >
                            {props.rows.map((row) => (
                                <HappyAgentCredentialImportRowView
                                    busy={busy}
                                    key={row.id}
                                    row={row}
                                    teamAllowed={props.teamAllowed}
                                    onPickScopeChange={props.onPickScopeChange}
                                    onPickToggle={props.onPickToggle}
                                    {...(props.onSignIn ? { onSignIn: props.onSignIn } : {})}
                                />
                            ))}
                            {props.rows.length === 0 ? (
                                <span className="happy-agent-credential-import__empty">
                                    No API keys or sign-ins on this computer.
                                </span>
                            ) : null}
                        </Box>
                    )}
                    <Box className="happy-agent-credential-import__actions">
                        <Checkbox
                            checked={props.shellScanned}
                            disabled={busy}
                            label="Also check my shell environment"
                            onChange={(shell) => props.onScan({ shell })}
                        />
                        <Button
                            disabled={busy}
                            loading={props.phase === "scanning" && props.rows.length > 0}
                            onClick={() => props.onScan({ shell: props.shellScanned })}
                            size="small"
                            variant="ghost"
                        >
                            Look again
                        </Button>
                    </Box>
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

function HappyAgentCredentialImportRowView(props: {
    readonly row: HappyAgentCredentialImportRow;
    readonly busy: boolean;
    readonly teamAllowed: boolean;
    onPickToggle: (id: string) => void;
    onPickScopeChange: (id: string, scope: HappyAgentCredentialImportScope) => void;
    onSignIn?: (id: string) => void;
}) {
    const row = props.row;
    const imported = row.use === "import" && row.result?.ok === true;
    const meta =
        row.use === "unsupported"
            ? row.reason
            : [row.source, row.use === "import" ? row.masked : undefined, row.account]
                  .filter(Boolean)
                  .join(" · ");
    return (
        <Box
            className="happy-agent-credential-import__row"
            data-happy-desktop-ui="happy-agent-credential-import-row"
            data-use={row.use}
        >
            {row.use === "import" ? (
                <Checkbox
                    aria-label={`Import ${row.vendorName} · ${row.label}`}
                    checked={imported || row.picked !== undefined}
                    disabled={props.busy || imported}
                    onChange={() => props.onPickToggle(row.id)}
                />
            ) : (
                <span aria-hidden="true" className="happy-agent-credential-import__spacer" />
            )}
            <Box className="happy-agent-credential-import__text">
                <span className="happy-agent-credential-import__name">{row.label}</span>
                <span className="happy-agent-credential-import__meta">{meta}</span>
                {row.use === "import" && row.result?.ok === false ? (
                    <span className="happy-agent-credential-import__error">
                        {row.result.message}
                    </span>
                ) : null}
            </Box>
            {row.use === "import" && row.result?.ok === true ? (
                <HappyAgentSettingsStatus
                    label={row.result.duplicate ? "Already here" : "Imported"}
                    variant="success"
                />
            ) : row.use === "import" && row.picked !== undefined && props.teamAllowed ? (
                <SegmentedControl
                    aria-label={`Who can use ${row.vendorName} · ${row.label}`}
                    className="happy-agent-credential-import__scope"
                    disabled={props.busy}
                    onChange={(scope) =>
                        props.onPickScopeChange(row.id, scope === "team" ? "team" : "private")
                    }
                    segments={[
                        { value: "private", label: "My account" },
                        { value: "team", label: "Team" },
                    ]}
                    size="compact"
                    value={row.picked}
                />
            ) : row.use === "signIn" ? (
                props.onSignIn && row.signInAvailable ? (
                    <Button
                        disabled={props.busy}
                        onClick={() => props.onSignIn?.(row.id)}
                        size="small"
                        variant="secondary"
                    >
                        Sign in on server
                    </Button>
                ) : (
                    <HappyAgentSettingsStatus label="Sign-in can't be copied" variant="neutral" />
                )
            ) : row.use === "unsupported" ? (
                <HappyAgentSettingsStatus label="Not supported" variant="neutral" />
            ) : null}
        </Box>
    );
}
