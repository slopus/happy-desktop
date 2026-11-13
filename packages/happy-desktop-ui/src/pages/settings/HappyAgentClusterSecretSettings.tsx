import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { IconTile } from "../../IconTile";
import { Spinner } from "../../Spinner";
import {
    HappyAgentClusterSecretCreateDialog,
    HappyAgentClusterSecretDeleteDialog,
    HappyAgentClusterSecretEditDialog,
} from "./HappyAgentClusterSecretDialogs";
import {
    HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT,
    happyAgentClusterSecretSummary,
    type HappyAgentClusterSecretCreateDraft,
    type HappyAgentClusterSecretCreateInput,
    type HappyAgentClusterSecretDetails,
    type HappyAgentClusterSecretOwner,
    type HappyAgentClusterSecretUpdateInput,
    type HappyAgentClusterSecretUse,
} from "./happyAgentClusterSecretDraft";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** One catalog secret as the list shows it. Its value is never part of it. */
export type HappyAgentClusterSecretRow = HappyAgentClusterSecretDetails & {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly owner: HappyAgentClusterSecretOwner;
    readonly access: { readonly use: boolean; readonly manage: boolean; readonly attach: boolean };
    readonly uses: readonly HappyAgentClusterSecretUse[];
    /** Every change is made against this version, the one its form was opened at. */
    readonly version: string;
    /** Already localized by the application boundary. */
    readonly updatedAt: string;
};

/** Which dialog is open; a fixture may open one on first render. */
export type HappyAgentClusterSecretDialog =
    | {
          readonly kind: "create";
          readonly draft?: HappyAgentClusterSecretCreateDraft;
          readonly attempted?: boolean;
      }
    | { readonly kind: "edit"; readonly secretId: string; readonly replacing?: boolean }
    | { readonly kind: "delete"; readonly secretId: string; readonly version: string };

export interface HappyAgentClusterSecretSettingsProps {
    readonly loading?: boolean;
    readonly error?: string;
    readonly unavailable?: string;
    readonly secrets: readonly HappyAgentClusterSecretRow[];
    /** The owners the reader's role may create a secret for; empty hides creating. */
    readonly owners: readonly HappyAgentClusterSecretOwner[];
    readonly initialDialog?: HappyAgentClusterSecretDialog;
    onSecretCreate(input: HappyAgentClusterSecretCreateInput): Promise<void>;
    onSecretUpdate(
        secretId: string,
        version: string,
        input: HappyAgentClusterSecretUpdateInput,
    ): Promise<void>;
    onSecretDelete(secretId: string, version: string): Promise<void>;
}

/**
 * Settings › Secrets on Happy Cloud: the organization's typed catalog of
 * endpoints, git credentials, SSH keys and environment bundles, each the
 * team's or the reader's own.
 */
export function HappyAgentClusterSecretSettings(props: HappyAgentClusterSecretSettingsProps) {
    const [dialog, setDialog] = useState(props.initialDialog);
    const close = () => setDialog(undefined);
    const open = dialog?.kind === "create" ? undefined : dialog;
    const opened = open ? props.secrets.find((secret) => secret.id === open.secretId) : undefined;
    const canCreate = props.owners.length > 0;
    const createButton = (
        <Button
            disabled={props.unavailable !== undefined}
            icon="plus"
            onClick={() => setDialog({ kind: "create" })}
            size="small"
            title={props.unavailable}
            variant="secondary"
        >
            New secret
        </Button>
    );
    return (
        <>
            {props.unavailable ? (
                <Banner tone="neutral" title="Happy Cloud reconnecting">
                    {props.unavailable}
                </Banner>
            ) : null}
            {props.error ? (
                <Banner tone="danger" title="Secrets unavailable">
                    {props.error}
                </Banner>
            ) : props.loading ? (
                <Box className="happy-agent-settings__pending">
                    <Spinner size={16} />
                    <span>Reading secrets…</span>
                </Box>
            ) : props.secrets.length === 0 ? (
                <Box className="happy-agent-cluster-secrets__empty">
                    <EmptyState
                        description={
                            canCreate
                                ? "Store an API key, git credential, SSH key, or environment variables for agents. Values are write-only."
                                : "Nobody has shared a secret with you yet, and your role can’t create one."
                        }
                        icon="lock"
                        title="No secrets yet"
                        {...(canCreate
                            ? {
                                  action: {
                                      label: "New secret",
                                      icon: "plus",
                                      onClick: () => setDialog({ kind: "create" }),
                                  },
                              }
                            : {})}
                    />
                </Box>
            ) : (
                <HappyAgentSettingsSection
                    description="Credentials agents use without seeing them. Values are write-only."
                    title="Secrets"
                >
                    <Box
                        className="happy-agent-cluster-secrets__list"
                        data-happy-desktop-ui="happy-agent-cluster-secrets-list"
                    >
                        {props.secrets.map((secret) => (
                            <button
                                className="happy-agent-cluster-secrets__row"
                                data-happy-desktop-ui="happy-agent-cluster-secret"
                                key={secret.id}
                                onClick={() => setDialog({ kind: "edit", secretId: secret.id })}
                                type="button"
                            >
                                <IconTile
                                    icon={HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[secret.type].icon}
                                    tone={TYPE_TONE[secret.type]}
                                />
                                <span className="happy-agent-cluster-secrets__text">
                                    <span className="happy-agent-cluster-secrets__name">
                                        {secret.name}
                                    </span>
                                    <span className="happy-agent-cluster-secrets__meta">
                                        {[
                                            HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[secret.type].label,
                                            happyAgentClusterSecretSummary(secret),
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                </span>
                                <span className="happy-agent-cluster-secrets__access">
                                    <span className="happy-agent-cluster-secrets__owner">
                                        {secret.owner === "me" ? "Only you" : "Team"}
                                    </span>
                                    <span className="happy-agent-cluster-secrets__can">
                                        {secret.access.manage
                                            ? "You manage"
                                            : secret.access.use
                                              ? "You can use"
                                              : "View only"}
                                    </span>
                                </span>
                                <Icon name="chevron-right" size={14} />
                            </button>
                        ))}
                    </Box>
                    {canCreate ? (
                        <Box className="happy-agent-cluster-secrets__actions">{createButton}</Box>
                    ) : null}
                </HappyAgentSettingsSection>
            )}
            {dialog?.kind === "create" ? (
                <HappyAgentClusterSecretCreateDialog
                    {...(dialog.draft ? { initialDraft: dialog.draft } : {})}
                    {...(dialog.attempted ? { initialAttempted: true } : {})}
                    onClose={close}
                    onSubmit={props.onSecretCreate}
                    owners={props.owners}
                    {...(props.unavailable ? { unavailable: props.unavailable } : {})}
                />
            ) : null}
            {open?.kind === "edit" && opened ? (
                <HappyAgentClusterSecretEditDialog
                    {...(open.replacing ? { initialReplacing: true } : {})}
                    key={opened.id}
                    onClose={close}
                    onDeleteOpen={(version) =>
                        setDialog({ kind: "delete", secretId: opened.id, version })
                    }
                    onSave={(version, input) => props.onSecretUpdate(opened.id, version, input)}
                    secret={opened}
                    {...(props.unavailable ? { unavailable: props.unavailable } : {})}
                />
            ) : null}
            {open?.kind === "delete" && opened ? (
                <HappyAgentClusterSecretDeleteDialog
                    name={opened.name}
                    onClose={() => setDialog({ kind: "edit", secretId: opened.id })}
                    onDelete={() => props.onSecretDelete(opened.id, open.version)}
                />
            ) : null}
        </>
    );
}

const TYPE_TONE = {
    endpoint: "blue",
    git_credential: "orange",
    ssh_key: "gray",
    environment: "green",
} as const;
