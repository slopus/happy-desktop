import { useState, useSyncExternalStore } from "react";
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
    happyAgentClusterSecretExpirySoon,
    happyAgentClusterSecretExpiryText,
    type HappyAgentClusterSecretClock,
} from "./happyAgentClusterSecretExpiry";
import {
    HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT,
    happyAgentClusterSecretSummary,
    type HappyAgentClusterSecretCreateDraft,
    type HappyAgentClusterSecretCreateInput,
    type HappyAgentClusterSecretDetails,
    type HappyAgentClusterSecretOwner,
    type HappyAgentClusterSecretScope,
    type HappyAgentClusterSecretUpdateInput,
    type HappyAgentClusterSecretUse,
} from "./happyAgentClusterSecretDraft";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** An agent or workspace a secret names, by its title where the reader may see it. */
export interface HappyAgentClusterSecretAgent {
    readonly id: string;
    readonly name?: string;
}

/** Which agents and workspaces a secret is given to, as the reader may see them. */
export interface HappyAgentClusterSecretReach {
    /**
     * An agent secret's owner first, then the subagents it shares it with; a
     * global secret's agent grants.
     */
    readonly agents: readonly (HappyAgentClusterSecretAgent & {
        readonly via: "grant" | "owner" | "share";
    })[];
    /** Workspace grants, recorded apart from agents', each named by its root agent. */
    readonly workspaces: readonly HappyAgentClusterSecretAgent[];
    /** Grants in Surfaces the reader may not see: counted, never named. */
    readonly hidden: number;
}

/** One catalog secret as the list shows it. Its value is never part of it. */
export type HappyAgentClusterSecretRow = HappyAgentClusterSecretDetails & {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly scope: HappyAgentClusterSecretScope;
    /** `agent` exactly when the scope is `agent`. */
    readonly owner: HappyAgentClusterSecretOwner | "agent";
    readonly reach: HappyAgentClusterSecretReach;
    /** When the cluster deletes it, in epoch milliseconds on the reader's clock. */
    readonly expiresAt?: number;
    readonly access: {
        readonly use: boolean;
        readonly manage: boolean;
        readonly attach: boolean;
        /** All a person may do with an agent's secret is delete it. */
        readonly delete: boolean;
    };
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
          readonly valuesShown?: boolean;
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
    /** What expiry countdowns read; one clock ticks every row, and only while one expires. */
    readonly clock: HappyAgentClusterSecretClock;
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
 * endpoints, git credentials, SSH keys and environment bundles, grouped by
 * who may see each, the whole cluster or one agent, with the agents each is
 * given to.
 */
export function HappyAgentClusterSecretSettings(props: HappyAgentClusterSecretSettingsProps) {
    const [dialog, setDialog] = useState(props.initialDialog);
    const expiring = props.secrets.some((secret) => secret.expiresAt !== undefined);
    // One subscription for the whole list, and none while nothing expires.
    const now = useSyncExternalStore(
        expiring ? props.clock.subscribe : clockStill,
        props.clock.get,
        props.clock.get,
    );
    const groups = SCOPE_GROUPS.map((group) => ({
        ...group,
        secrets: props.secrets.filter((secret) => secret.scope === group.scope),
    })).filter((group) => group.secrets.length > 0);
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
                groups.map((group, index) => (
                    <HappyAgentSettingsSection
                        description={group.description}
                        key={group.scope}
                        title={group.title}
                    >
                        <Box
                            className="happy-agent-cluster-secrets__list"
                            data-happy-desktop-ui="happy-agent-cluster-secrets-list"
                            data-scope={group.scope}
                        >
                            {group.secrets.map((secret) => (
                                <SecretRow
                                    key={secret.id}
                                    now={now}
                                    onOpen={() => setDialog({ kind: "edit", secretId: secret.id })}
                                    secret={secret}
                                />
                            ))}
                        </Box>
                        {canCreate && index === groups.length - 1 ? (
                            <Box className="happy-agent-cluster-secrets__actions">
                                {createButton}
                            </Box>
                        ) : null}
                    </HappyAgentSettingsSection>
                ))
            )}
            {dialog?.kind === "create" ? (
                <HappyAgentClusterSecretCreateDialog
                    {...(dialog.draft ? { initialDraft: dialog.draft } : {})}
                    {...(dialog.attempted ? { initialAttempted: true } : {})}
                    {...(dialog.valuesShown ? { initialValuesShown: true } : {})}
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
                    now={now}
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
                    agent={opened.scope === "agent"}
                    name={opened.name}
                    onClose={() => setDialog({ kind: "edit", secretId: opened.id })}
                    onDelete={() => props.onSecretDelete(opened.id, open.version)}
                />
            ) : null}
        </>
    );
}

const clockStill = () => () => undefined;

/** The list's groups, in the order they are shown; an empty group is left out. */
const SCOPE_GROUPS: readonly {
    readonly scope: HappyAgentClusterSecretScope;
    readonly title: string;
    readonly description: string;
}[] = [
    {
        scope: "global",
        title: "Everyone",
        description:
            "Everyone in the cluster can see these, by each role’s rule. Agents get one only through a grant. Values are write-only.",
    },
    {
        scope: "agent",
        title: "Agents’ own",
        description:
            "Secrets agents keep for themselves. Only the owning agent and the subagents it shares one with can use it.",
    },
];

/** Whose a secret is; the group it is listed in says who may see it. */
export function happyAgentClusterSecretOwnerText(secret: HappyAgentClusterSecretRow): string {
    if (secret.owner === "agent") {
        const owner = secret.reach.agents.find((agent) => agent.via === "owner");
        return owner ? agentName(owner) : "An agent";
    }
    return secret.owner === "me" ? "Only you" : "Team";
}

export function agentName(agent: HappyAgentClusterSecretAgent): string {
    return agent.name ?? `Agent ${agent.id.slice(0, 8)}`;
}

/** How many names a row shows before it counts the rest. */
const REACH_NAMES_SHOWN = 3;

/**
 * Who has a secret, on one line: a global secret's agents and workspaces, an
 * agent secret's subagents. A grant in a Surface the reader can't see is
 * counted with the rest, never named.
 */
export function happyAgentClusterSecretReachText(secret: HappyAgentClusterSecretRow): string {
    const { reach } = secret;
    const agents = reach.agents.filter((agent) =>
        secret.scope === "agent" ? agent.via === "share" : agent.via === "grant",
    );
    const shown = agents.slice(0, REACH_NAMES_SHOWN).map(agentName);
    const more = agents.length - shown.length + reach.hidden;
    const names = [shown.join(", "), more > 0 ? `+${String(more)}` : ""].filter(Boolean).join(" ");
    if (secret.scope === "agent")
        return names ? `Shared with ${names}` : "Not shared with subagents";
    const workspaces =
        reach.workspaces.length === 1
            ? `workspace ${agentName(reach.workspaces[0]!)}`
            : reach.workspaces.length > 1
              ? `${String(reach.workspaces.length)} workspaces`
              : "";
    if (!names && !workspaces) return "Not given to any agent yet";
    return `Given to ${[names, workspaces].filter(Boolean).join(" · ")}`;
}

function SecretRow(props: {
    readonly secret: HappyAgentClusterSecretRow;
    readonly now: number;
    onOpen(): void;
}) {
    const { secret, now } = props;
    const expired = secret.expiresAt !== undefined && secret.expiresAt <= now;
    return (
        <button
            className="happy-agent-cluster-secrets__row"
            data-expired={expired ? "" : undefined}
            data-happy-desktop-ui="happy-agent-cluster-secret"
            onClick={props.onOpen}
            type="button"
        >
            <IconTile
                icon={HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[secret.type].icon}
                tone={TYPE_TONE[secret.type]}
            />
            <span className="happy-agent-cluster-secrets__text">
                <span className="happy-agent-cluster-secrets__name">{secret.name}</span>
                <span className="happy-agent-cluster-secrets__meta">
                    {[
                        HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[secret.type].label,
                        happyAgentClusterSecretSummary(secret),
                    ]
                        .filter(Boolean)
                        .join(" · ")}
                </span>
                <span
                    className="happy-agent-cluster-secrets__reach"
                    data-happy-desktop-ui="happy-agent-cluster-secret-reach"
                >
                    {happyAgentClusterSecretReachText(secret)}
                </span>
            </span>
            <span className="happy-agent-cluster-secrets__access">
                <span className="happy-agent-cluster-secrets__owner">
                    {happyAgentClusterSecretOwnerText(secret)}
                </span>
                {secret.expiresAt === undefined ? (
                    <span className="happy-agent-cluster-secrets__can">
                        {secret.access.manage
                            ? "You manage"
                            : secret.access.use
                              ? "You can use"
                              : secret.access.delete
                                ? "You can delete"
                                : "View only"}
                    </span>
                ) : (
                    <span
                        className="happy-agent-cluster-secrets__expiry"
                        data-happy-desktop-ui="happy-agent-cluster-secret-expiry"
                        data-soon={
                            happyAgentClusterSecretExpirySoon(secret.expiresAt, now)
                                ? ""
                                : undefined
                        }
                    >
                        {happyAgentClusterSecretExpiryText(secret.expiresAt, now)}
                    </span>
                )}
            </span>
            <Icon name="chevron-right" size={14} />
        </button>
    );
}

const TYPE_TONE = {
    endpoint: "blue",
    git_credential: "orange",
    ssh_key: "gray",
    environment: "green",
} as const;
