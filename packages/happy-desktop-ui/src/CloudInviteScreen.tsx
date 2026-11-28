import { useState } from "react";
import type {
    HappyCloudInviteClosedCode,
    HappyCloudInvitePreview,
    HappyCloudInviteSnapshot,
} from "happy-desktop-state";
import { Avatar } from "./Avatar";
import { SetupPage, type SetupPageProps } from "./SetupPage";
import type { ThemeMode } from "./ThemeScope";

export interface CloudInviteScreenProps {
    readonly appearance: ThemeMode;
    /** Where the invitation stands; the screen draws nothing of its own accord. */
    readonly view: HappyCloudInviteSnapshot;
    /** Join, for a signed-in account. */
    onJoin(): void;
    /** Sign in to join: the account's sign-in, then the join without another press. */
    onSignIn(): void;
    /** Cancel while the sign-in is open. */
    onSignInCancel(): void;
    /** Sign in with another email, after the invitation turned out to be for one. */
    onAccountSwitch(): void;
    /** Try again, after Happy Cloud could not be reached. */
    onRetry(): void;
    /** Open the server an already accepted invitation was for. */
    onServerOpen(): void;
    /** Not now, Done and Esc: back to the app. */
    onClose(): void;
}

/** What a refused invitation is called, by Happy Cloud's reason. */
const CLOSED_TITLES: Record<HappyCloudInviteClosedCode, string> = {
    invalid: "Invalid invitation",
    expired: "Invitation expired",
    revoked: "Invitation revoked",
    exhausted: "Invitation used up",
    accepted: "Invitation already accepted",
};

/** The day an invitation stops working, the way the person's own calendar writes it. */
function expiryFormat(expiresAt: string): string | undefined {
    const at = new Date(expiresAt);
    if (Number.isNaN(at.getTime())) return undefined;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(at);
}

/** The server an invitation is to, in the square a setup page keeps for its picture. */
function CloudInviteServerArt(props: { readonly server: HappyCloudInvitePreview["server"] }) {
    const { server } = props;
    return (
        <Avatar
            className="happy-cloud-invite__server"
            data-happy-desktop-ui="cloud-invite-server"
            {...(server.image === undefined ? {} : { imageUrl: server.image })}
            initials={(server.displayName ?? server.name).slice(0, 1).toUpperCase()}
            // Without a picture, the placeholder the server wears in the rail.
            placeholderSeed={server.name}
            size="lg"
            style={{ width: 72, height: 72, borderRadius: 18 }}
            type="agent"
        />
    );
}

/**
 * Who invited, until when, and a last line for how signing in is going: three
 * lines under the invitation's words, each kept whether or not it is written.
 */
function CloudInviteFacts(props: {
    readonly invite: HappyCloudInvitePreview;
    readonly note?: { readonly label: string; readonly attention?: true };
}) {
    const { inviter } = props.invite;
    const expires = expiryFormat(props.invite.expiresAt);
    return (
        <div className="happy-cloud-invite__facts" data-happy-desktop-ui="cloud-invite-facts">
            <span
                className="happy-cloud-invite__inviter"
                data-happy-desktop-ui="cloud-invite-inviter"
            >
                {inviter?.name === undefined ? null : (
                    <>
                        <Avatar
                            {...(inviter.image === undefined ? {} : { imageUrl: inviter.image })}
                            initials={inviter.name.slice(0, 1).toUpperCase()}
                            size="xs"
                        />
                        <span className="happy-cloud-invite__inviter-name">
                            <span>{inviter.name}</span>
                            <span>invited you</span>
                        </span>
                    </>
                )}
            </span>
            <span className="happy-cloud-invite__expiry">
                {expires === undefined ? null : `Expires ${expires}.`}
            </span>
            <p
                className="happy-cloud-invite__note"
                data-tone={props.note?.attention ? "attention" : undefined}
                role="status"
            >
                {props.note?.label}
            </p>
        </div>
    );
}

/**
 * C-358 CloudInviteScreen — an invitation to a Happy Cloud server, opened
 * from its link, full window on the onboarding sky like the screen that adds
 * a server. It shows what the invitation is to before anything is asked of
 * the person: the server, the role, who invited them and until when. One
 * press joins, or signs in and then joins; nothing is accepted without it.
 *
 * Every state is one `SetupPage` on the scene line, so the title holds one
 * height from the invitation through signing in, joining, and whatever Happy
 * Cloud answers. A state that is still this invitation keeps the server's
 * picture and words and only runs its button; a refusal or a failure says so
 * in the same place with one way out.
 *
 * Esc returns to the app from every state but joining. The screen rises when
 * it opens and sinks back before `onClose` is called.
 */
export function CloudInviteScreen(props: CloudInviteScreenProps) {
    const { view, onClose } = props;
    // Leaving plays the sheet back down first; the caller hears once it is gone.
    const [dismissed, dismissedSet] = useState(false);
    const dismiss = () => dismissedSet(true);
    const closable = view.kind !== "joining";
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-cloud-connect happy-cloud-invite",
        "data-testid": "cloud-invite",
    } as const satisfies Partial<SetupPageProps>;
    const leave = { label: "Not now", onSelect: dismiss } as const;
    /** The invitation itself: its words stay while its button changes or runs. */
    const invitation = (
        invite: HappyCloudInvitePreview,
        rest: Pick<SetupPageProps, "action" | "secondary"> & {
            readonly note?: { readonly label: string; readonly attention?: true };
        },
    ) => (
        <SetupPage
            {...frame}
            {...(rest.action ? { action: rest.action } : {})}
            {...(rest.secondary ? { secondary: rest.secondary } : {})}
            art={<CloudInviteServerArt server={invite.server} />}
            copy={`@${invite.server.name} · You’ll join as ${invite.roleName}.`}
            title={`Join ${invite.server.displayName ?? invite.server.name}`}
            transitionKey="invitation"
        >
            <CloudInviteFacts invite={invite} {...(rest.note ? { note: rest.note } : {})} />
        </SetupPage>
    );
    return (
        <div
            className="happy-cloud-connect__window happy-cloud-invite__window"
            data-appearance={props.appearance}
            data-backdrop="sky"
            data-closing={dismissed ? "" : undefined}
            data-happy-desktop-ui="cloud-invite-screen"
            onAnimationEnd={(event) => {
                // Only the sheet's own motion; the pages inside dissolve too.
                if (dismissed && event.target === event.currentTarget) onClose();
            }}
            // Esc leaves wherever focus is: a waiting state has nothing
            // focused inside the screen to hear the key.
            ref={(element) => {
                if (!element) return;
                const document = element.ownerDocument;
                const keyDown = (event: KeyboardEvent) => {
                    if (event.key !== "Escape" || event.defaultPrevented) return;
                    // Above the screen that adds a server: the key is this one's.
                    event.preventDefault();
                    if (closable) dismiss();
                };
                document.addEventListener("keydown", keyDown, true);
                return () => document.removeEventListener("keydown", keyDown, true);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Invitation to Happy Cloud"
        >
            {(() => {
                switch (view.kind) {
                    case "loading":
                        return (
                            <SetupPage
                                {...frame}
                                scene="tickets"
                                secondary={{ label: "Cancel", onSelect: dismiss }}
                                status={{ busy: true, label: "Asking Happy Cloud…" }}
                                title="Opening your invitation"
                                transitionKey="loading"
                            />
                        );
                    case "offered":
                        return invitation(view.invite, {
                            action: view.signedIn
                                ? { autoFocus: true, label: "Join", onSelect: props.onJoin }
                                : {
                                      autoFocus: true,
                                      label: "Sign in to join",
                                      onSelect: props.onSignIn,
                                  },
                            secondary: leave,
                            ...(view.error
                                ? { note: { label: view.error, attention: true as const } }
                                : {}),
                        });
                    case "signingIn":
                        return invitation(view.invite, {
                            action: {
                                busy: true,
                                label: "Sign in to join",
                                onSelect: props.onSignIn,
                            },
                            secondary: { label: "Cancel", onSelect: props.onSignInCancel },
                            note: {
                                label: "Sign in or create an account in your browser, then come back here.",
                            },
                        });
                    case "joining":
                        return invitation(view.invite, {
                            action: { busy: true, label: "Join", onSelect: props.onJoin },
                        });
                    case "mismatch":
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    autoFocus: true,
                                    label: "Sign in with another email",
                                    onSelect: props.onAccountSwitch,
                                }}
                                art={<CloudInviteServerArt server={view.invite.server} />}
                                copy={
                                    <>
                                        This invitation was sent to{" "}
                                        <strong className="happy-cloud-connect__email">
                                            {view.emailHint}
                                        </strong>
                                        . Sign in with that email to join.
                                    </>
                                }
                                secondary={leave}
                                title="Use your invited email"
                                transitionKey="mismatch"
                            />
                        );
                    case "closed":
                        return (
                            <SetupPage
                                {...frame}
                                action={
                                    view.server
                                        ? {
                                              autoFocus: true,
                                              label: `Open ${view.server.displayName}`,
                                              onSelect: props.onServerOpen,
                                          }
                                        : { autoFocus: true, label: "Done", onSelect: dismiss }
                                }
                                copy={view.detail}
                                scene="tickets"
                                title={CLOSED_TITLES[view.code]}
                                transitionKey={`closed-${view.code}`}
                            />
                        );
                    case "failed":
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    autoFocus: true,
                                    label: "Try again",
                                    onSelect: props.onRetry,
                                }}
                                copy={view.message}
                                scene="snail"
                                secondary={leave}
                                title="Couldn’t connect"
                                transitionKey="failed"
                            />
                        );
                    case "unavailable":
                        return (
                            <SetupPage
                                {...frame}
                                action={{ autoFocus: true, label: "Done", onSelect: dismiss }}
                                copy="This version of Happy can’t open invitations yet. Update Happy, then open the link again."
                                scene="tickets"
                                title="Update Happy to join"
                                transitionKey="unavailable"
                            />
                        );
                }
            })()}
        </div>
    );
}
