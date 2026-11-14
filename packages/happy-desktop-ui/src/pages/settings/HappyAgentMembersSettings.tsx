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
import { useGlide } from "../../useGlide";
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
    /** Why the last role change or removal of this member was refused. */
    readonly refusal?: string;
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

/**
 * What the invite area says about the last invite change: a link just made,
 * shown this once; an email just made and whether it went; or why a create,
 * resend or revoke was refused.
 */
export type HappyAgentInviteNoticeView =
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
      }
    | { readonly type: "refused"; readonly message: string };

/*
 * Wide enough for each label with the spinner beside it, so a button keeps its
 * box while it works and nothing next to it moves.
 */
const INVITE_EMAIL_BUTTON_WIDTH = 132;
const INVITE_LINK_BUTTON_WIDTH = 108;
const RESEND_BUTTON_WIDTH = 92;

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
    /** The server's name, which leaving it names. */
    readonly serverName: string;
    readonly members: readonly HappyAgentMemberRow[];
    readonly roles: readonly { readonly id: string; readonly name: string }[];
    readonly invites: readonly HappyAgentInviteRow[];
    /** Whether the reader may invite, remove and change roles. */
    readonly manage: boolean;
    /** Whether the reader is an owner, who alone may make another owner. */
    readonly owner: boolean;
    /** The address typed for the next email invite. */
    readonly inviteEmail: string;
    /** Which kind of invite is being made. */
    readonly inviteCreating?: "link" | "email";
    readonly inviteNotice?: HappyAgentInviteNoticeView;
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
    onInviteNoticeDismiss: () => void;
    onInviteResend: (inviteId: string) => void;
    onInviteRevoke: (inviteId: string) => void;
    /** Leaves the server; rejects with the reason to show. */
    onLeave: () => Promise<void>;
}

/**
 * Settings › Members on a Happy Cloud server: who is on it and their roles,
 * invites by email or link with their history, and leaving the server.
 * Deleting it lives on Settings › Danger.
 */
export function HappyAgentMembersSettings(props: HappyAgentMembersSettingsProps) {
    const [inviteRole, setInviteRole] = useState("member");
    const [historyOpen, setHistoryOpen] = useState(props.defaultHistoryOpen ?? false);
    const [leaving, setLeaving] = useState(false);
    // Oldest first, so a new invite lands at the end and no pending row moves.
    const pending = props.invites.filter((invite) => invite.status === "pending").reverse();
    const history = props.invites.filter((invite) => invite.status !== "pending");
    // What rows are on the page; when it changes, everything that moved glides.
    const rootRef = useGlide(
        [
            props.members.map((member) => member.id).join(),
            pending.map((invite) => invite.id).join(),
            history.length > 0 ? "history" : "",
            historyOpen ? history.map((invite) => invite.id).join() : "",
        ].join("|"),
    );
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
    return (
        <div className="happy-agent-members" ref={rootRef}>
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
                            data-glide-key={`member:${member.id}`}
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
                                {/* A refusal takes the line under the name, so nothing moves to make room. */}
                                {member.refusal === undefined ? (
                                    <span className="happy-agent-members__meta">
                                        {member.joined}
                                    </span>
                                ) : (
                                    <span
                                        className="happy-agent-members__meta"
                                        data-tone="danger"
                                        title={member.refusal}
                                    >
                                        {member.refusal}
                                    </span>
                                )}
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
                <Box data-glide-key="invites">
                    <HappyAgentSettingsSection
                        description="Invite someone by email, or make a link anyone holding it can join with. A link is shown once, so copy it before you close it."
                        title="Invites"
                    >
                        <HappyAgentInviteNotice
                            {...(props.inviteNotice ? { notice: props.inviteNotice } : {})}
                            onDismiss={props.onInviteNoticeDismiss}
                            onResend={props.onInviteResend}
                        />
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
                                    props.inviteEmail.trim() === "" ||
                                    props.inviteCreating === "link"
                                }
                                loading={props.inviteCreating === "email"}
                                onClick={() => props.onInviteEmailCreate(inviteRole)}
                                size="small"
                                variant="secondary"
                                width={INVITE_EMAIL_BUTTON_WIDTH}
                            >
                                Invite by email
                            </Button>
                            <Button
                                disabled={props.inviteCreating === "email"}
                                loading={props.inviteCreating === "link"}
                                onClick={() => props.onInviteLinkCreate(inviteRole)}
                                size="small"
                                variant="secondary"
                                width={INVITE_LINK_BUTTON_WIDTH}
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
                            <Box className="happy-agent-members__actions" data-glide-key="history">
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
                </Box>
            ) : null}
            <Box data-glide-key="leave">
                <HappyAgentSettingsSection title="Leave">
                    <Box className="happy-agent-members__actions">
                        <Button onClick={() => setLeaving(true)} size="small" variant="secondary">
                            Leave this server
                        </Button>
                    </Box>
                </HappyAgentSettingsSection>
            </Box>
            {leaving ? (
                <HappyAgentMembersLeaveDialog
                    onClose={() => setLeaving(false)}
                    onLeave={props.onLeave}
                    serverName={props.serverName}
                />
            ) : null}
        </div>
    );
}

/**
 * The invite area's one line of news, always in place at one height: a hint
 * while nothing has happened, then the link to copy, where an email went, or
 * why a change was refused. Whatever it says, nothing below it moves.
 */
function HappyAgentInviteNotice(props: {
    readonly notice?: HappyAgentInviteNoticeView;
    onDismiss: () => void;
    onResend: (inviteId: string) => void;
}) {
    const notice = props.notice;
    return (
        <Box
            className="happy-agent-members__notice"
            data-happy-desktop-ui="happy-agent-invite-notice"
            data-kind={notice?.type ?? "idle"}
        >
            {notice === undefined ? (
                <span className="happy-agent-members__meta">
                    Pick a role, then invite someone by email or create a link.
                </span>
            ) : notice.type === "link" ? (
                <Box className="happy-agent-members__email">
                    <TextField
                        aria-label="Invite link"
                        fullWidth
                        readOnly
                        size="small"
                        value={notice.link}
                    />
                </Box>
            ) : notice.type === "refused" ? (
                <Box className="happy-agent-members__text">
                    {/* Up to two lines, so the notice keeps its height in a narrow window. */}
                    <span
                        className="happy-agent-members__refused"
                        data-tone="danger"
                        title={notice.message}
                    >
                        {notice.message}
                    </span>
                </Box>
            ) : (
                <Box className="happy-agent-members__text">
                    <span
                        className="happy-agent-members__name"
                        data-tone={notice.delivery === "failed" ? "danger" : undefined}
                    >
                        {notice.delivery === "sent"
                            ? `Sent to ${notice.email}`
                            : `Couldn't email ${notice.email}`}
                    </span>
                    <span className="happy-agent-members__meta">
                        {notice.delivery === "failed"
                            ? "The invite was made, but its email didn't go out."
                            : notice.detail}
                    </span>
                </Box>
            )}
            {notice?.type === "link" ? (
                <CopyButton caption="Copy link" label="Copy invite link" text={notice.link} />
            ) : notice?.type === "email" && notice.delivery === "failed" ? (
                <Button
                    loading={notice.saving}
                    onClick={() => props.onResend(notice.id)}
                    size="small"
                    variant="secondary"
                    width={RESEND_BUTTON_WIDTH}
                >
                    Resend
                </Button>
            ) : null}
            {notice === undefined ? null : (
                <Button onClick={props.onDismiss} size="small" variant="ghost">
                    Done
                </Button>
            )}
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
            data-glide-key={`invite:${invite.id}`}
            data-happy-desktop-ui="happy-agent-invite"
            data-status={invite.status}
        >
            <Box className="happy-agent-members__text">
                <span className="happy-agent-members__name">{invite.email ?? "Link"}</span>
                <span className="happy-agent-members__meta" title={invite.detail}>
                    {invite.detail}
                </span>
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

function HappyAgentMembersLeaveDialog(props: {
    readonly serverName: string;
    onClose: () => void;
    onLeave: () => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const submit = (): void => {
        if (busy) return;
        setBusy(true);
        setError(undefined);
        void props.onLeave().then(
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
                        <Button loading={busy} onClick={submit} variant="danger">
                            Leave server
                        </Button>
                    </>
                }
                onClose={busy ? undefined : props.onClose}
                size="small"
                title={`Leave @${props.serverName}?`}
                tone="danger"
            >
                <Box className="happy-agent-members__confirm">
                    <p>You lose access until someone invites you again.</p>
                    {error ? (
                        <Banner tone="danger" title="Still a member">
                            {error}
                        </Banner>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
