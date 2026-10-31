import type { ReactNode } from "react";
import {
    CloudSignInNoticeDialog,
    type CloudSignInNoticeChiefOfStaff,
    type CloudSignInNoticeView,
} from "../../src/CloudSignInNoticeDialog";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-301";

/** Contains the fixed overlay inside its window-sized viewport. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
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

const WINDOW = { height: 760, width: 1100 } as const;
const MINIMUM = { height: 640, width: 720 } as const;

function slug(label: string): string {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

const handlers = {
    onAccountSettingsOpen: () => undefined,
    onChiefOfStaffAsk: () => undefined,
    onClose: () => undefined,
    onConnectionOpen: () => undefined,
    onSignIn: () => undefined,
    onTeamConnect: () => undefined,
    onTeamsCheck: () => undefined,
};

const AVAILABLE: CloudSignInNoticeChiefOfStaff = { status: "available" };
const UNAVAILABLE: CloudSignInNoticeChiefOfStaff = {
    reason: "This Mac's Happy Agent isn't running a Chief of Staff.",
    status: "unavailable",
};
const EMAIL = "ada@example.com";

const SPECIMENS: readonly {
    readonly label: string;
    readonly detail: string;
    readonly view: CloudSignInNoticeView;
    readonly chiefOfStaff?: CloudSignInNoticeChiefOfStaff;
}[] = [
    {
        detail: "a recognized callback is being completed",
        label: "Completing",
        view: { kind: "completing" },
    },
    {
        detail: "one team added and live, one not added · not-added first",
        label: "Your teams",
        view: {
            email: EMAIL,
            kind: "signedIn",
            teams: {
                status: "ready",
                teams: [
                    {
                        connection: { label: "happy-core", status: "connected" },
                        id: "org_01EXAMPLECORE",
                        name: "Happy Core",
                    },
                    { id: "org_01EXAMPLETEAM", name: "Happy Robotics" },
                ],
            },
        },
    },
    {
        detail: "one team, no saved connection · row action hands an unsent draft to Chief of Staff",
        label: "Team not added",
        view: {
            email: EMAIL,
            kind: "signedIn",
            teams: {
                status: "ready",
                teams: [{ id: "org_01EXAMPLETEAM", name: "Happy Robotics" }],
            },
        },
    },
    {
        detail: "draft is in flight",
        label: "Team not added · pending",
        chiefOfStaff: { status: "pending", teamId: "org_01EXAMPLETEAM" },
        view: {
            email: EMAIL,
            kind: "signedIn",
            teams: {
                status: "ready",
                teams: [{ id: "org_01EXAMPLETEAM", name: "Happy Robotics" }],
            },
        },
    },
    {
        detail: "no Chief of Staff · row action disabled, reason and settings in the body",
        label: "Team not added · no Chief of Staff",
        chiefOfStaff: UNAVAILABLE,
        view: {
            email: EMAIL,
            kind: "signedIn",
            teams: {
                status: "ready",
                teams: [{ id: "org_01EXAMPLETEAM", name: "Happy Robotics" }],
            },
        },
    },
    {
        detail: "saved connection that is not reachable · no add prompt",
        label: "Already added · not reachable",
        view: {
            email: EMAIL,
            kind: "signedIn",
            teams: {
                status: "ready",
                teams: [
                    {
                        connection: { label: "Happy Robotics", status: "error" },
                        id: "org_01EXAMPLETEAM",
                        name: "Happy Robotics",
                    },
                ],
            },
        },
    },
    {
        detail: "saved connection, live status connected",
        label: "Already added · connected",
        view: {
            email: EMAIL,
            kind: "signedIn",
            teams: {
                status: "ready",
                teams: [
                    {
                        connection: { label: "Happy Robotics", status: "connected" },
                        id: "org_01EXAMPLETEAM",
                        name: "Happy Robotics",
                    },
                ],
            },
        },
    },
    {
        detail: "long team name truncates (full name on hover); the row action keeps its label",
        label: "Team not added · long name",
        view: {
            email: EMAIL,
            kind: "signedIn",
            teams: {
                status: "ready",
                teams: [
                    { id: "org_01EXAMPLELONG", name: "Happy Robotics Research and Development" },
                ],
            },
        },
    },
    {
        detail: "signed in, no team membership · settings to switch account",
        label: "No teams",
        view: { email: EMAIL, kind: "signedIn", teams: { status: "ready", teams: [] } },
    },
    {
        detail: "teams still loading",
        label: "Checking teams",
        view: { email: EMAIL, kind: "signedIn", teams: { status: "loading" } },
    },
    {
        detail: "teams could not be read",
        label: "Teams unreadable",
        view: {
            email: EMAIL,
            kind: "signedIn",
            teams: { message: "Happy Agent could not reach Happy Cloud.", status: "error" },
        },
    },
    {
        detail: "callback this window did not start · fresh sign-in",
        label: "Unmatched · signed out",
        view: { account: { status: "signedOut" }, kind: "unmatched" },
    },
    {
        detail: "a correlated sign-in is still pending · not cancelled",
        label: "Unmatched · sign-in pending",
        view: { account: { status: "signingIn" }, kind: "unmatched" },
    },
    {
        detail: "already signed in · check teams instead",
        label: "Unmatched · signed in",
        view: { account: { email: EMAIL, status: "signedIn" }, kind: "unmatched" },
    },
    {
        detail: "local Happy Agent not ready",
        label: "Unmatched · unavailable",
        view: { account: { status: "unavailable" }, kind: "unmatched" },
    },
    {
        detail: "fresh sign-in opened in the browser",
        label: "Waiting",
        view: { kind: "waiting" },
    },
    {
        detail: "fresh sign-in could not start",
        label: "Waiting · failed to start",
        view: { error: "Happy Agent is not reachable.", kind: "waiting" },
    },
    {
        detail: "OAuth access_denied",
        label: "Declined",
        view: { kind: "failed", reason: "declined" },
    },
    { detail: "attempt expired", label: "Expired", view: { kind: "failed", reason: "expired" } },
    {
        detail: "no attempt waiting",
        label: "Not waiting",
        view: { kind: "failed", reason: "notWaiting" },
    },
    {
        detail: "credentials rejected",
        label: "Rejected",
        view: { kind: "failed", reason: "rejected" },
    },
    {
        detail: "account service unavailable",
        label: "Unavailable",
        view: { kind: "failed", reason: "unavailable" },
    },
    {
        detail: "Happy Agent did not answer · no Chief of Staff",
        label: "Failed",
        chiefOfStaff: UNAVAILABLE,
        view: { kind: "failed", reason: "failed" },
    },
];

export function CloudSignInNoticeDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The centered notice for a Happy account sign-in that came back to the app: teams to add through Chief of Staff, teams already added, a sign-in this window didn't start, and each failure with its recovery."
            title="CloudSignInNoticeDialog"
        >
            {SPECIMENS.map((specimen, index) => {
                const number = String(index + 1).padStart(2, "0");
                const windows = index === 1 ? [WINDOW, MINIMUM] : [WINDOW];
                return windows.map((size) => (
                    <FullScreenSpecimen
                        detail={`480px card · centered · ${specimen.detail}`}
                        key={`${specimen.label}-${size.width}`}
                        label={`${specimen.label} · ${size.width} × ${size.height}`}
                        number={number}
                        screen={`${number}-${slug(specimen.label)}-${size.width}x${size.height}`}
                        window={size}
                    >
                        {frame(
                            <CloudSignInNoticeDialog
                                {...handlers}
                                chiefOfStaff={specimen.chiefOfStaff ?? AVAILABLE}
                                view={specimen.view}
                            />,
                        )}
                    </FullScreenSpecimen>
                ));
            })}
        </ComponentPage>
    );
}
