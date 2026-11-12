import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentMemberRow {
    readonly id: string;
    /** Their user, whose profile the name opens; absent before they sign in. */
    readonly userId?: string;
    readonly name: string;
    readonly roleId: string;
    /** When they joined, already worded. */
    readonly joined: string;
    readonly self: boolean;
    readonly saving: boolean;
}

/** Where an invite stands; only a pending one can be resent or revoked. */
export type HappyAgentInviteStatus = "pending" | "accepted" | "expired" | "revoked" | "exhausted";

export interface HappyAgentInviteRow {
    readonly id: string;
    /** The address an email invite went to; absent for a link. */
    readonly email?: string;
    readonly status: HappyAgentInviteStatus;
    /** How its last email went; absent for a link. */
    readonly delivery?: "sending" | "sent" | "failed";
    /** Its role, sends, uses, acceptance and expiry, already worded. */
    readonly detail: string;
    /** A pending email invite sent too recently to send again yet. */
    readonly resendWaiting: boolean;
    readonly saving: boolean;
}

/** An invite just made: its link shown this once, or whether its email went. */
export type HappyAgentInviteCreatedView =
    | {
          readonly type: "link";
          readonly link: string;
          /** Its role and expiry, already worded. */
          readonly detail: string;
      }
    | {
          readonly type: "email";
          readonly id: string;
          readonly email: string;
          readonly delivery: "sent" | "failed";
          /** Its role and expiry, already worded. */
          readonly detail: string;
          /** A resend asked for and not yet answered. */
          readonly saving: boolean;
      };

const INVITE_STATUS_LABELS: Record<HappyAgentInviteStatus, string> = {
    pending: "Pending",
    accepted: "Accepted",
    expired: "Expired",
    revoked: "Revoked",
    exhausted: "Used up",
};

export interface HappyAgentMembersSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    /** Why the last change was refused. */
    readonly saveError?: string;
    /** The server's name, which deleting it asks to be typed. */
    readonly serverName: string;
    readonly members: readonly HappyAgentMemberRow[];
    readonly roles: readonly { readonly id: string; readonly name: string }[];
    readonly invites: readonly HappyAgentInviteRow[];
    /** Whether the reader may invite, remove and change roles. */
    readonly manage: boolean;
    /** Whether the reader is an owner, who alone may delete the server. */
    readonly owner: boolean;
    /** The address typed for the next email invite. */
    readonly inviteEmail: string;
    /** Which kind of invite is being made. */
    readonly inviteCreating?: "link" | "email";
    readonly inviteCreated?: HappyAgentInviteCreatedView;
    /** Whether past invites start unfolded; they start folded otherwise. */
    readonly defaultHistoryOpen?: boolean;
    /** Opens a member's profile; absent where there are no profiles. */
    onProfileOpen?: (userId: string) => void;
    onRoleChange: (memberId: string, roleId: string) => void;
    onRemove: (memberId: string) => void;
    onInviteEmailChange: (value: string) => void;
    /** Emails an invite with the role to the address typed in. */
    onInviteEmailCreate: (roleId: string) => void;
    onInviteLinkCreate: (roleId: string) => void;
    onInviteCreatedDismiss: () => void;
    onInviteResend: (inviteId: string) => void;
    onInviteRevoke: (inviteId: string) => void;
    /** Leaves the server; rejects with the reason to show. */
    onLeave: () => Promise<void>;
    /** Deletes the server; rejects with the reason to show. */
    onDelete: (confirm: string) => Promise<void>;
}

/**
 * Settings › Members on a Happy Cloud server: who is on it and their roles,
 * invites by email or link with their history, and leaving or deleting the
 * server.
 */
export function HappyAgentMembersSettings(props: HappyAgentMembersSettingsProps) {
    const [inviteRole, setInviteRole] = useState("member");
    const [historyOpen, setHistoryOpen] = useState(props.defaultHistoryOpen ?? false);
    const [confirming, setConfirming] = useState<"leave" | "delete" | undefined>();
    if (props.error)
        return (
            <Banner tone="danger" title="Members unavailable">
                {props.error}
            </Banner>
        );
    if (props.loading)
        return (
            <Box className="happy-agent-settings__pending">
                <Spinner size={16} />
                <span>Reading the members…</span>
            </Box>
        );
    const roleOptions = props.roles.map((role) => ({
        value: role.id,
        label: role.name,
        // Only an owner may make another owner.
        disabled: role.id === "owner" && !props.owner,
    }));
    const roleName = (roleId: string): string =>
        props.roles.find((role) => role.id === roleId)?.name ?? roleId;
    const pending = props.invites.filter((invite) => invite.status === "pending");
    const history = props.invites.filter((invite) => invite.status !== "pending");
    return (
        <>
            {props.saveError ? (
                <Banner tone="danger" title="Nothing changed">
                    {props.saveError}
                </Banner>
            ) : null}
            <HappyAgentSettingsSection
                description="Everyone who can use this server, and what their role lets them do."
                title="Members"
            >
                <Box
                    className="happy-agent-members__list"
                    data-happy-desktop-ui="happy-agent-members-list"
                >
                    {props.members.map((member) => (
                        <Box
                            className="happy-agent-members__row"
                            data-happy-desktop-ui="happy-agent-member"
                            key={member.id}
                        >
                            <Box className="happy-agent-members__text">
                                {member.userId !== undefined && props.onProfileOpen ? (
                                    <button
                                        className="happy-agent-members__name happy-agent-members__profile"
                                        data-happy-desktop-ui="happy-agent-member-profile"
                                        onClick={() => props.onProfileOpen?.(member.userId!)}
                                        type="button"
                                    >
                                        {member.self ? `${member.name} (you)` : member.name}
                                    </button>
                                ) : (
                                    <span className="happy-agent-members__name">
                                        {member.self ? `${member.name} (you)` : member.name}
                                    </span>
                                )}
                                <span className="happy-agent-members__meta">{member.joined}</span>
                            </Box>
                            {member.saving ? <Spinner size={16} /> : null}
                            {props.manage && !member.self ? (
                                <>
                                    <Select
                                        aria-label={`${member.name}'s role`}
                                        disabled={member.saving}
                                        onValueChange={(roleId) =>
                                            props.onRoleChange(member.id, roleId)
                                        }
                                        options={roleOptions}
                                        size="small"
                                        value={member.roleId}
                                        width={140}
                                    />
                                    <Button
                                        aria-label={`Remove ${member.name}`}
                                        disabled={member.saving}
                                        icon="trash"
                                        iconOnly
                                        onClick={() => props.onRemove(member.id)}
                                        size="small"
                                        variant="ghost"
                                    />
                                </>
                            ) : (
                                <span className="happy-agent-members__role">
                                    {roleName(member.roleId)}
                                </span>
                            )}
                        </Box>
                    ))}
                </Box>
            </HappyAgentSettingsSection>
            {props.manage ? (
                <HappyAgentSettingsSection
                    description="Invite someone by email, or make a link anyone holding it can join with. A link is shown once, so copy it before you close it."
                    title="Invites"
                >
                    {props.inviteCreated ? (
                        <HappyAgentInviteCreatedNotice
                            created={props.inviteCreated}
                            onDismiss={props.onInviteCreatedDismiss}
                            onResend={props.onInviteResend}
                        />
                    ) : null}
                    <Box className="happy-agent-members__actions happy-agent-members__invite">
                        <Select
                            aria-label="Role for the invite"
                            onValueChange={setInviteRole}
                            options={roleOptions}
                            size="small"
                            value={inviteRole}
                            width={140}
                        />
                        <Box className="happy-agent-members__email">
                            <TextField
                                aria-label="Email address to invite"
                                autoComplete="off"
                                disabled={props.inviteCreating !== undefined}
                                fullWidth
                                inputMode="email"
                                onSubmit={() => {
                                    if (props.inviteEmail.trim() !== "")
                                        props.onInviteEmailCreate(inviteRole);
                                }}
                                onValueChange={props.onInviteEmailChange}
                                placeholder="name@example.com"
                                size="small"
                                type="email"
                                value={props.inviteEmail}
                            />
                        </Box>
                        <Button
                            disabled={
                                props.inviteEmail.trim() === "" || props.inviteCreating === "link"
                            }
                            loading={props.inviteCreating === "email"}
                            onClick={() => props.onInviteEmailCreate(inviteRole)}
                            size="small"
                            variant="secondary"
                        >
                            Invite by email
                        </Button>
                        <Button
                            disabled={props.inviteCreating === "email"}
                            loading={props.inviteCreating === "link"}
                            onClick={() => props.onInviteLinkCreate(inviteRole)}
                            size="small"
                            variant="secondary"
                        >
                            Create link
                        </Button>
                    </Box>
                    {pending.map((invite) => (
                        <HappyAgentInviteRowView
                            invite={invite}
                            key={invite.id}
                            onResend={props.onInviteResend}
                            onRevoke={props.onInviteRevoke}
                        />
                    ))}
                    {history.length > 0 ? (
                        <Box className="happy-agent-members__actions">
                            <Button
                                aria-expanded={historyOpen}
                                icon={historyOpen ? "chevron-down" : "chevron-right"}
                                onClick={() => setHistoryOpen(!historyOpen)}
                                size="small"
                                variant="ghost"
                            >
                                {history.length === 1
                                    ? "1 past invite"
                                    : `${String(history.length)} past invites`}
                            </Button>
                        </Box>
                    ) : null}
                    {historyOpen
                        ? history.map((invite) => (
                              <HappyAgentInviteRowView
                                  invite={invite}
                                  key={invite.id}
                                  onResend={props.onInviteResend}
                                  onRevoke={props.onInviteRevoke}
                              />
                          ))
                        : null}
                </HappyAgentSettingsSection>
            ) : null}
            <HappyAgentSettingsSection title="Leave">
                <Box className="happy-agent-members__actions">
                    <Button onClick={() => setConfirming("leave")} size="small" variant="secondary">
                        Leave this server
                    </Button>
                    {props.owner ? (
                        <Button
                            onClick={() => setConfirming("delete")}
                            size="small"
                            variant="danger"
                        >
                            Delete this server
                        </Button>
                    ) : null}
                </Box>
            </HappyAgentSettingsSection>
            {confirming ? (
                <HappyAgentMembersConfirmDialog
                    kind={confirming}
                    onClose={() => setConfirming(undefined)}
                    onDelete={props.onDelete}
                    onLeave={props.onLeave}
                    serverName={props.serverName}
                />
            ) : null}
        </>
    );
}

/** The invite just made: its link to copy, or where its email went. */
function HappyAgentInviteCreatedNotice(props: {
    readonly created: HappyAgentInviteCreatedView;
    onDismiss: () => void;
    onResend: (inviteId: string) => void;
}) {
    const created = props.created;
    return (
        <Box
            className="happy-agent-members__created"
            data-happy-desktop-ui="happy-agent-invite-created"
        >
            <Box className="happy-agent-members__text">
                {created.type === "link" ? (
                    <code className="happy-agent-members__link">{created.link}</code>
                ) : (
                    <span
                        className="happy-agent-members__name"
                        data-tone={created.delivery === "failed" ? "danger" : undefined}
                    >
                        {created.delivery === "sent"
                            ? `Sent to ${created.email}`
                            : `Couldn't email ${created.email}`}
                    </span>
                )}
                <span className="happy-agent-members__meta">
                    {created.type === "email" && created.delivery === "failed"
                        ? "The invite was made, but its email didn't go out."
                        : created.detail}
                </span>
            </Box>
            {created.type === "link" ? (
                <CopyButton caption="Copy link" label="Copy invite link" text={created.link} />
            ) : created.delivery === "failed" ? (
                <Button
                    loading={created.saving}
                    onClick={() => props.onResend(created.id)}
                    size="small"
                    variant="secondary"
                >
                    Resend
                </Button>
            ) : null}
            <Button onClick={props.onDismiss} size="small" variant="ghost">
                Done
            </Button>
        </Box>
    );
}

/** One invite, pending with its actions or done with how it ended. */
function HappyAgentInviteRowView(props: {
    readonly invite: HappyAgentInviteRow;
    onResend: (inviteId: string) => void;
    onRevoke: (inviteId: string) => void;
}) {
    const invite = props.invite;
    const pending = invite.status === "pending";
    return (
        <Box
            className="happy-agent-members__row"
            data-happy-desktop-ui="happy-agent-invite"
            data-status={invite.status}
        >
            <Box className="happy-agent-members__text">
                <span className="happy-agent-members__name">{invite.email ?? "Link"}</span>
                <span className="happy-agent-members__meta">{invite.detail}</span>
            </Box>
            {pending && invite.delivery === "failed" ? (
                <span className="happy-agent-members__role" data-tone="danger">
                    Email failed
                </span>
            ) : pending && invite.delivery === "sending" ? (
                <span className="happy-agent-members__role">Sending…</span>
            ) : !pending ? (
                <span className="happy-agent-members__role">
                    {INVITE_STATUS_LABELS[invite.status]}
                </span>
            ) : null}
            {pending && invite.email !== undefined ? (
                <Button
                    disabled={invite.saving || invite.resendWaiting}
                    onClick={() => props.onResend(invite.id)}
                    size="small"
                    title={
                        invite.resendWaiting
                            ? "Its email went out less than a minute ago"
                            : undefined
                    }
                    variant="ghost"
                >
                    Resend
                </Button>
            ) : null}
            {pending ? (
                <Button
                    disabled={invite.saving}
                    onClick={() => props.onRevoke(invite.id)}
                    size="small"
                    variant="ghost"
                >
                    Revoke
                </Button>
            ) : null}
        </Box>
    );
}

function HappyAgentMembersConfirmDialog(props: {
    readonly kind: "leave" | "delete";
    readonly serverName: string;
    onClose: () => void;
    onLeave: () => Promise<void>;
    onDelete: (confirm: string) => Promise<void>;
}) {
    const [typed, setTyped] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const deleting = props.kind === "delete";
    const ready = !deleting || typed === props.serverName;
    const submit = (): void => {
        if (!ready || busy) return;
        setBusy(true);
        setError(undefined);
        void (deleting ? props.onDelete(typed) : props.onLeave()).then(
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
                            {deleting ? "Delete server" : "Leave server"}
                        </Button>
                    </>
                }
                onClose={busy ? undefined : props.onClose}
                size="small"
                title={deleting ? `Delete @${props.serverName}?` : `Leave @${props.serverName}?`}
                tone="danger"
            >
                <Box className="happy-agent-members__confirm">
                    <p>
                        {deleting
                            ? "Everyone loses access, and its agents, tasks and files are deleted after a short grace period."
                            : "You lose access until someone invites you again."}
                    </p>
                    {deleting ? (
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
                    ) : null}
                    {error ? (
                        <Banner tone="danger" title={deleting ? "Not deleted" : "Still a member"}>
                            {error}
                        </Banner>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
