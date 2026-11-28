import type { ReactNode } from "react";
import type { HappyCloudInvitePreview, HappyCloudInviteSnapshot } from "happy-desktop-state";
import { CloudInviteScreen } from "../../src/CloudInviteScreen";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-358";

/** The window Happy opens at, and the smallest it gets. */
const WINDOW = { height: 792, width: 1280 } as const;
const SMALL_WINDOW = { height: 670, width: 760 } as const;
const noop = () => undefined;

/** Contains the fixed window inside its window-sized viewport. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                height: "100%",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}

const ACME: HappyCloudInvitePreview = {
    server: { name: "acme", displayName: "Acme Corp" },
    inviter: { name: "Steve Korshakov" },
    roleName: "Member",
    expiresAt: "2026-12-05T18:00:00Z",
};
/** A link anyone on the server hands out: nobody in particular invited. */
const GUILD: HappyCloudInvitePreview = {
    server: { name: "design-guild" },
    roleName: "Admin",
    expiresAt: "2027-01-15T09:30:00Z",
};

const SPECIMENS: readonly {
    readonly label: string;
    readonly detail: string;
    readonly view: HappyCloudInviteSnapshot;
    readonly window?: { readonly width: number; readonly height: number };
}[] = [
    {
        label: "Loading",
        detail: "the link just arrived · Happy Cloud is being asked what it is",
        view: { kind: "loading" },
    },
    {
        label: "Offered signed out",
        detail: "the server, the role, who invited and until when, before any sign-in",
        view: { kind: "offered", invite: ACME, signedIn: false },
    },
    {
        label: "Offered signed in",
        detail: "the account is signed in · one press joins",
        view: { kind: "offered", invite: ACME, signedIn: true },
    },
    {
        label: "Offered open link",
        detail: "no inviter and no display name · the server's handle is its name",
        view: { kind: "offered", invite: GUILD, signedIn: true },
    },
    {
        label: "Offered sign-in failed",
        detail: "the browser sign-in did not finish · back on the invitation, saying why",
        view: {
            kind: "offered",
            invite: ACME,
            signedIn: false,
            error: "Signing in didn’t finish. Try again.",
        },
    },
    {
        label: "Signing in",
        detail: "the account sign-in is open in the browser · the join follows by itself",
        view: { kind: "signingIn", invite: ACME },
    },
    {
        label: "Joining",
        detail: "Happy Cloud is accepting · no way out until it answers",
        view: { kind: "joining", invite: ACME },
    },
    {
        label: "Mismatch",
        detail: "the invitation was sent to another address than the one signed in",
        view: { kind: "mismatch", invite: ACME, emailHint: "s•••@acme.com" },
    },
    {
        label: "Closed expired",
        detail: "Happy Cloud refuses it · its own sentence, and one way out",
        view: {
            kind: "closed",
            code: "expired",
            detail: "This invitation has expired. Ask for a new one.",
        },
    },
    {
        label: "Closed invalid",
        detail: "the link's token is misshapen · said without asking Happy Cloud",
        view: {
            kind: "closed",
            code: "invalid",
            detail: "This invitation link is invalid. Check the link or ask for a new invitation.",
        },
    },
    {
        label: "Closed revoked",
        detail: "whoever sent it took it back",
        view: {
            kind: "closed",
            code: "revoked",
            detail: "This invitation was revoked.",
        },
    },
    {
        label: "Closed used up",
        detail: "a link for so many people, all of them already in",
        view: {
            kind: "closed",
            code: "exhausted",
            detail: "This invitation has been used as many times as it allows.",
        },
    },
    {
        label: "Closed accepted",
        detail: "already accepted, and its server is in this app · the way out opens it",
        view: {
            kind: "closed",
            code: "accepted",
            detail: "This invitation has already been accepted.",
            server: { name: "acme", displayName: "Acme Corp" },
        },
    },
    {
        label: "Failed",
        detail: "Happy Cloud could not be reached · Try again resumes the step that failed",
        view: { kind: "failed", message: "Happy Cloud isn’t reachable right now." },
    },
    {
        label: "Unavailable",
        detail: "a shell from before invitations opened in the app",
        view: { kind: "unavailable" },
    },
    {
        label: "Small offered",
        detail: "the smallest window · the invitation, signed out",
        view: { kind: "offered", invite: ACME, signedIn: false },
        window: SMALL_WINDOW,
    },
    {
        label: "Small mismatch",
        detail: "the smallest window · the longest words the screen says",
        view: { kind: "mismatch", invite: ACME, emailHint: "s•••@acme.com" },
        window: SMALL_WINDOW,
    },
];

export function CloudInviteScreenPage() {
    const specimens = (["light", "dark"] as const).flatMap((mode) =>
        SPECIMENS.map((specimen) => ({ ...specimen, mode })),
    );
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="An invitation to a Happy Cloud server, opened from its link, full window on the onboarding sky: what it is to, sign in, join, and what Happy Cloud answers."
            title="CloudInviteScreen"
            width={WINDOW.width + 96}
        >
            {specimens.map((specimen, index) => {
                const number = String(index + 1).padStart(2, "0");
                const slug = specimen.label.toLowerCase().replace(/ /gu, "-");
                const window = specimen.window ?? WINDOW;
                return (
                    <FullScreenSpecimen
                        detail={`${specimen.mode} · ${specimen.detail}`}
                        key={`${specimen.mode}-${specimen.label}`}
                        label={`${specimen.label} · ${specimen.mode}`}
                        number={number}
                        screen={`${number}-${slug}-${specimen.mode}-${String(window.width)}x${String(window.height)}`}
                        window={window}
                    >
                        {frame(
                            <ThemeScope mode={specimen.mode}>
                                <CloudInviteScreen
                                    appearance={specimen.mode}
                                    onAccountSwitch={noop}
                                    onClose={noop}
                                    onJoin={noop}
                                    onRetry={noop}
                                    onServerOpen={noop}
                                    onSignIn={noop}
                                    onSignInCancel={noop}
                                    view={specimen.view}
                                />
                            </ThemeScope>,
                        )}
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
