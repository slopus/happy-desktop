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
    readonly name: string;
    readonly roleId: string;
    /** When they joined, already worded. */
    readonly joined: string;
    readonly self: boolean;
    readonly saving: boolean;
}

export interface HappyAgentInviteRow {
    readonly id: string;
    readonly roleName: string;
    /** When it expires, already worded. */
    readonly expires: string;
    readonly saving: boolean;
}

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
    readonly inviteCreating: boolean;
    /** An invite just made, whose code is shown this once. */
    readonly inviteCreated?: {
        readonly code: string;
        readonly roleName: string;
        readonly expires: string;
    };
    onRoleChange: (memberId: string, roleId: string) => void;
    onRemove: (memberId: string) => void;
    onInviteCreate: (roleId: string) => void;
    onInviteCreatedDismiss: () => void;
    onInviteRevoke: (inviteId: string) => void;
    /** Leaves the server; rejects with the reason to show. */
    onLeave: () => Promise<void>;
    /** Deletes the server; rejects with the reason to show. */
    onDelete: (confirm: string) => Promise<void>;
}

/**
 * Settings › Members on a Happy Cloud server: who is on it and their roles,
 * invite codes, and leaving or deleting the server.
 */
export function HappyAgentMembersSettings(props: HappyAgentMembersSettingsProps) {
    const [inviteRole, setInviteRole] = useState("member");
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
                                <span className="happy-agent-members__name">
                                    {member.self ? `${member.name} (you)` : member.name}
                                </span>
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
                    description="Anyone with an invite code can join with its role until it expires or you revoke it. The code is shown once, so copy it before you close it."
                    title="Invites"
                >
                    {props.inviteCreated ? (
                        <Box
                            className="happy-agent-members__code"
                            data-happy-desktop-ui="happy-agent-invite-code"
                        >
                            <Box className="happy-agent-members__text">
                                <code className="happy-agent-members__code-value">
                                    {props.inviteCreated.code}
                                </code>
                                <span className="happy-agent-members__meta">
                                    {`${props.inviteCreated.roleName} · ${props.inviteCreated.expires}`}
                                </span>
                            </Box>
                            <CopyButton label="Copy invite code" text={props.inviteCreated.code} />
                            <Button
                                onClick={props.onInviteCreatedDismiss}
                                size="small"
                                variant="ghost"
                            >
                                Done
                            </Button>
                        </Box>
                    ) : null}
                    <Box className="happy-agent-members__actions">
                        <Select
                            aria-label="Role for the invite"
                            onValueChange={setInviteRole}
                            options={roleOptions}
                            size="small"
                            value={inviteRole}
                            width={140}
                        />
                        <Button
                            loading={props.inviteCreating}
                            onClick={() => props.onInviteCreate(inviteRole)}
                            size="small"
                            variant="secondary"
                        >
                            Create invite code
                        </Button>
                    </Box>
                    {props.invites.map((invite) => (
                        <Box
                            className="happy-agent-members__row"
                            data-happy-desktop-ui="happy-agent-invite"
                            key={invite.id}
                        >
                            <Box className="happy-agent-members__text">
                                <span className="happy-agent-members__name">
                                    {`Invite · ${invite.roleName}`}
                                </span>
                                <span className="happy-agent-members__meta">{invite.expires}</span>
                            </Box>
                            <Button
                                disabled={invite.saving}
                                onClick={() => props.onInviteRevoke(invite.id)}
                                size="small"
                                variant="ghost"
                            >
                                Revoke
                            </Button>
                        </Box>
                    ))}
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
