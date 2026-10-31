import type { CSSProperties, ReactNode } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import type { IconName } from "./Icon";
import { Modal, type ModalTone } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

/** One Happy team the signed-in account belongs to. */
export type CloudSignInNoticeTeam = {
    /** The WorkOS organization ID. */
    id: string;
    name: string;
    /**
     * This team's saved connection, if there is one, with its live status. A
     * saved connection on its own says nothing about reachability.
     */
    connection?: {
        label: string;
        status: "connected" | "connecting" | "disconnected" | "error";
    };
};

/** Why a sign-in did not finish, as the daemon's typed answer reported it. */
export type CloudSignInNoticeFailure =
    | "declined"
    | "expired"
    | "notWaiting"
    | "rejected"
    | "unavailable"
    | "failed";

/** Where this Mac's Happy account stands, which decides how a fresh sign-in is offered. */
export type CloudSignInNoticeAccount =
    | { status: "signedOut" }
    | { status: "signingIn" }
    | { status: "signedIn"; email: string }
    | { status: "unavailable" };

/** What the notice is telling the reader. Every state renders from props alone. */
export type CloudSignInNoticeView =
    /** Happy Agent is completing a callback this window recognized. */
    | { kind: "completing" }
    /** A fresh sign-in is open in the browser and has not come back yet. */
    | { kind: "waiting"; error?: string }
    | {
          kind: "signedIn";
          email?: string;
          /** Absent when this sign-in's connection does not list teams, such as a team server. */
          teams?:
              | { status: "loading" }
              | { status: "error"; message: string }
              | { status: "ready"; teams: readonly CloudSignInNoticeTeam[] };
      }
    /**
     * The browser returned a sign-in this window did not start. It was not
     * used, and the only way forward is a fresh sign-in started here.
     */
    | { kind: "unmatched"; account: CloudSignInNoticeAccount }
    | { kind: "failed"; reason: CloudSignInNoticeFailure };

export type CloudSignInNoticeChiefOfStaff = (
    | { status: "available" }
    /** A handoff is in flight; `teamId` names the team row that asked, if one did. */
    | { status: "pending"; teamId?: string }
    | { status: "unavailable"; reason: string }
) & {
    /** The Chief of Staff bot's live name, while This Mac's Happy Agent lists one. */
    name?: string;
};

export type CloudSignInNoticeDialogProps = {
    view: CloudSignInNoticeView;
    chiefOfStaff: CloudSignInNoticeChiefOfStaff;
    onClose: () => void;
    /** Hands the failure to the Chief of Staff. */
    onChiefOfStaffAsk: () => void;
    /** Hands one team that isn't added yet to the Chief of Staff to connect. */
    onTeamConnect: (teamId: string) => void;
    /** Starts a fresh sign-in that this window records and can match. */
    onSignIn: () => void;
    /** Shows the teams of an account that is already signed in. */
    onTeamsCheck: () => void;
    onConnectionOpen: (teamId: string) => void;
    onAccountSettingsOpen: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

const FAILURES: Record<
    CloudSignInNoticeFailure,
    { title: string; body: string; retry: string; chiefOfStaff: boolean }
> = {
    declined: {
        body: "Your Happy account wasn’t connected.",
        chiefOfStaff: false,
        retry: "Try again",
        title: "Sign-in was cancelled",
    },
    expired: {
        body: "The sign-in expired before it finished.",
        chiefOfStaff: true,
        retry: "Sign in again",
        title: "Sign-in expired",
    },
    failed: {
        body: "Happy Agent didn’t answer while finishing the sign-in.",
        chiefOfStaff: true,
        retry: "Try again",
        title: "Couldn’t finish signing in",
    },
    notWaiting: {
        body: "Happy Agent wasn’t waiting for this sign-in, so it wasn’t used.",
        chiefOfStaff: true,
        retry: "Sign in again",
        title: "Sign-in wasn’t used",
    },
    rejected: {
        body: "The account service rejected this sign-in.",
        chiefOfStaff: true,
        retry: "Try again",
        title: "Sign-in was rejected",
    },
    unavailable: {
        body: "The account service couldn’t be reached.",
        chiefOfStaff: true,
        retry: "Try again",
        title: "Couldn’t reach your Happy account",
    },
};

/** "Connected" only from the live status; a saved connection alone is "Added". */
function connectionWords(team: CloudSignInNoticeTeam): string {
    if (team.connection === undefined) return "Not added";
    return team.connection.status === "connected" ? "Connected" : "Added";
}

interface Presentation {
    title: string;
    icon: IconName;
    tone: ModalTone;
    body: ReactNode;
    /** Absent for a notice whose actions sit in its body. */
    footer?: ReactNode;
}

/**
 * C-301 CloudSignInNoticeDialog — the centered notice for a Happy account
 * sign-in that came back to the app.
 *
 * It says only what the app knows. A completed sign-in shows "Your teams":
 * the account's teams against the saved connections, joined by organization
 * ID, not-added teams first. Each row carries its own action: a team that
 * isn't added asks the Chief of Staff to connect it, and one already added
 * opens.
 * A sign-in this window didn't start is never used; the only way forward is a
 * fresh sign-in started here. A failure names its reason and offers a direct
 * retry. The notice closes only through Close, Escape, or an action, never
 * through a stray click on the dim.
 */
export function CloudSignInNoticeDialog(props: CloudSignInNoticeDialogProps) {
    const presentation = present(props);
    return (
        <ModalOverlay onEscape={props.onClose}>
            <Modal
                className={props.className}
                data-testid={props["data-testid"]}
                footer={presentation.footer}
                icon={presentation.icon}
                onClose={props.onClose}
                size="medium"
                style={props.style}
                title={presentation.title}
                tone={presentation.tone}
            >
                <div
                    className="cloud-sign-in-notice__body"
                    data-happy-desktop-ui="cloud-sign-in-notice-body"
                >
                    {presentation.body}
                </div>
            </Modal>
        </ModalOverlay>
    );
}

function paragraph(text: string): ReactNode {
    return (
        <p className="cloud-sign-in-notice__text" data-happy-desktop-ui="cloud-sign-in-notice-text">
            {text}
        </p>
    );
}

function chiefOfStaffName(props: CloudSignInNoticeDialogProps): string {
    return props.chiefOfStaff.name ?? "Chief of Staff";
}

function chiefOfStaffBanner(props: CloudSignInNoticeDialogProps): ReactNode {
    return props.chiefOfStaff.status === "unavailable" ? (
        <Banner tone="neutral" title={`${chiefOfStaffName(props)} unavailable`}>
            {props.chiefOfStaff.reason}
        </Banner>
    ) : null;
}

function chiefOfStaffButton(
    props: CloudSignInNoticeDialogProps,
    label: string,
    variant: "primary" | "secondary",
): ReactNode {
    return (
        <Button
            disabled={props.chiefOfStaff.status === "unavailable"}
            loading={props.chiefOfStaff.status === "pending"}
            onClick={props.onChiefOfStaffAsk}
            variant={variant}
        >
            {label}
        </Button>
    );
}

function closeButton(props: CloudSignInNoticeDialogProps, label = "Close"): ReactNode {
    return (
        <Button onClick={props.onClose} variant="ghost">
            {label}
        </Button>
    );
}

function present(props: CloudSignInNoticeDialogProps): Presentation {
    const view = props.view;
    switch (view.kind) {
        case "completing":
            return {
                body: paragraph("Confirming your Happy account…"),
                footer: closeButton(props),
                icon: "users",
                title: "Finishing sign-in",
                tone: "default",
            };
        case "waiting":
            return view.error
                ? {
                      body: <Banner tone="danger">{view.error}</Banner>,
                      footer: (
                          <>
                              {closeButton(props)}
                              <Button onClick={props.onSignIn} variant="primary">
                                  Try again
                              </Button>
                          </>
                      ),
                      icon: "alert",
                      title: "Couldn’t start sign-in",
                      tone: "danger",
                  }
                : {
                      body: paragraph("Finish signing in to your Happy account in your browser."),
                      footer: closeButton(props),
                      icon: "open-external",
                      title: "Continue in your browser",
                      tone: "default",
                  };
        case "signedIn":
            return signedIn(props, view);
        case "unmatched":
            return unmatched(props, view);
        case "failed": {
            const failure = FAILURES[view.reason];
            return {
                body: paragraph(failure.body),
                footer: (
                    <>
                        {failure.chiefOfStaff && props.chiefOfStaff.status !== "unavailable"
                            ? chiefOfStaffButton(
                                  props,
                                  `Ask ${chiefOfStaffName(props)}`,
                                  "secondary",
                              )
                            : closeButton(props)}
                        <Button onClick={props.onSignIn} variant="primary">
                            {failure.retry}
                        </Button>
                    </>
                ),
                icon: "alert",
                title: failure.title,
                tone: "danger",
            };
        }
    }
}

function teamRows(props: CloudSignInNoticeDialogProps, teams: readonly CloudSignInNoticeTeam[]) {
    const ordered = [
        ...teams.filter((team) => team.connection === undefined),
        ...teams.filter((team) => team.connection !== undefined),
    ];
    const chief = props.chiefOfStaff;
    return (
        <ul
            aria-label="Teams"
            className="cloud-sign-in-notice__teams"
            data-happy-desktop-ui="cloud-sign-in-notice-teams"
        >
            {ordered.map((team) => (
                <li
                    className="cloud-sign-in-notice__team"
                    data-happy-desktop-ui="cloud-sign-in-notice-team"
                    key={team.id}
                >
                    <span className="cloud-sign-in-notice__team-text">
                        <span className="cloud-sign-in-notice__team-name" title={team.name}>
                            {team.name}
                        </span>
                        <span
                            className="cloud-sign-in-notice__team-status"
                            data-status={team.connection === undefined ? "missing" : "added"}
                        >
                            {connectionWords(team)}
                        </span>
                    </span>
                    {team.connection ? (
                        <Button
                            aria-label={`Open ${team.connection.label}`}
                            onClick={() => props.onConnectionOpen(team.id)}
                            size="small"
                            variant="secondary"
                        >
                            Open
                        </Button>
                    ) : (
                        <Button
                            aria-label={`Ask ${chiefOfStaffName(props)} to connect ${team.name}`}
                            disabled={chief.status === "unavailable"}
                            loading={chief.status === "pending" && chief.teamId === team.id}
                            onClick={() => props.onTeamConnect(team.id)}
                            size="small"
                            title={chief.status === "unavailable" ? chief.reason : undefined}
                            variant="primary"
                        >
                            Ask {chiefOfStaffName(props)} to connect
                        </Button>
                    )}
                </li>
            ))}
        </ul>
    );
}

function signedIn(
    props: CloudSignInNoticeDialogProps,
    view: Extract<CloudSignInNoticeView, { kind: "signedIn" }>,
): Presentation {
    const account = view.email ? `Signed in as ${view.email}.` : "Signed in.";
    const teams = view.teams;
    if (teams === undefined)
        return {
            body: paragraph(account),
            footer: closeButton(props),
            icon: "check-circle",
            title: "Signed in",
            tone: "default",
        };
    if (teams.status === "loading")
        return {
            body: paragraph(`${account} Checking your teams…`),
            icon: "users",
            title: "Your teams",
            tone: "default",
        };
    if (teams.status === "error")
        return {
            body: (
                <>
                    <Banner tone="danger">{teams.message}</Banner>
                    {chiefOfStaffBanner(props)}
                </>
            ),
            footer: (
                <>
                    {closeButton(props)}
                    {props.chiefOfStaff.status === "unavailable" ? (
                        <Button onClick={props.onAccountSettingsOpen} variant="secondary">
                            Open account settings
                        </Button>
                    ) : (
                        chiefOfStaffButton(props, `Ask ${chiefOfStaffName(props)}`, "secondary")
                    )}
                </>
            ),
            icon: "alert",
            title: "Couldn’t read your teams",
            tone: "danger",
        };
    if (teams.teams.length === 0)
        return {
            body: (
                <>
                    {paragraph(`${account} This account isn’t on a Happy team.`)}
                    {accountSettingsNote(props)}
                </>
            ),
            icon: "users",
            title: "Your teams",
            tone: "default",
        };
    return {
        body: (
            <>
                {paragraph(account)}
                {teamRows(props, teams.teams)}
                {props.chiefOfStaff.status === "unavailable" &&
                teams.teams.some((team) => team.connection === undefined)
                    ? accountSettingsNote(props, props.chiefOfStaff.reason)
                    : null}
            </>
        ),
        icon: "users",
        title: "Your teams",
        tone: "default",
    };
}

/** A small way to account settings, inside the body rather than in a footer. */
function accountSettingsNote(props: CloudSignInNoticeDialogProps, reason?: string): ReactNode {
    return (
        <div
            className="cloud-sign-in-notice__note"
            data-happy-desktop-ui="cloud-sign-in-notice-note"
        >
            {reason ? <span className="cloud-sign-in-notice__note-text">{reason}</span> : null}
            <Button onClick={props.onAccountSettingsOpen} size="small" variant="ghost">
                Open account settings
            </Button>
        </div>
    );
}

function unmatched(
    props: CloudSignInNoticeDialogProps,
    view: Extract<CloudSignInNoticeView, { kind: "unmatched" }>,
): Presentation {
    const account = view.account;
    const state =
        account.status === "signedIn"
            ? `This Mac is signed in as ${account.email}.`
            : account.status === "signingIn"
              ? "A sign-in from Happy is still open in your browser."
              : account.status === "unavailable"
                ? "Happy Agent on this Mac isn’t ready to sign in."
                : undefined;
    return {
        body: (
            <>
                {paragraph("Happy received a sign-in it didn’t start, so it wasn’t used.")}
                {state ? paragraph(state) : null}
            </>
        ),
        footer: (
            <>
                {closeButton(props)}
                {account.status === "signedIn" ? (
                    <Button onClick={props.onTeamsCheck} variant="primary">
                        Check my teams
                    </Button>
                ) : (
                    <Button
                        disabled={account.status === "unavailable"}
                        onClick={props.onSignIn}
                        variant="primary"
                    >
                        Sign in again
                    </Button>
                )}
            </>
        ),
        icon: "shield",
        title: "Sign in from Happy",
        tone: "default",
    };
}
