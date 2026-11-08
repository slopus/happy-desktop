import type { ReactNode } from "react";
import { TeamSetupScreen, type TeamSetupView } from "../../src/TeamSetupScreen";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-341";

const WINDOW = { height: 760, width: 1100 } as const;
const SMALL_WINDOW = { height: 560, width: 720 } as const;
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

const ACME = {
    id: "s1",
    displayName: "Acme Corp",
    name: "acme",
    image: { thumbhash: "HAgGXxBVauaQSKZWmNmKFmhmhjAoCYMC" },
};
const GUILD = {
    id: "s2",
    displayName: "Design Guild",
    name: "design-guild",
};

const SPECIMENS: readonly {
    readonly label: string;
    readonly detail: string;
    readonly view: TeamSetupView;
    readonly presentation?: "window" | "dialog";
    readonly window?: { readonly width: number; readonly height: number };
}[] = [
    {
        label: "Sign in to create",
        detail: "D2 · the browser opened on the welcome's Create a team",
        view: { kind: "signingIn", path: "create" },
    },
    {
        label: "Sign in to join",
        detail: "D2 · the browser opened on the welcome's Join a team",
        view: { kind: "signingIn", path: "join" },
    },
    {
        label: "Sign-in unfinished",
        detail: "the browser never came back with the sign-in",
        view: { kind: "signingIn", path: "create", setback: "unfinished" },
    },
    {
        label: "Sign-in unreachable",
        detail: "Happy Cloud couldn't be reached to start it",
        view: { kind: "signingIn", path: "join", setback: "unreachable" },
    },
    {
        label: "Test sign-in",
        detail: "revealed by pressing the picture ten times",
        view: {
            kind: "signingIn",
            path: "create",
            testSignIn: {
                login: "qa-desktop",
                password: "",
                error: "That login or password is wrong.",
            },
        },
    },
    {
        label: "Name your team",
        detail: "D3c · nothing typed yet",
        view: { kind: "create", name: "", availability: "idle", teams: [] },
    },
    {
        label: "Name available",
        detail: "D3c · the accounts service said the name is free",
        view: { kind: "create", name: "acme-labs", availability: "available", teams: [] },
    },
    {
        label: "Name taken",
        detail: "D3c · the name belongs to another team",
        view: { kind: "create", name: "acme", availability: "taken", teams: [] },
    },
    {
        label: "Name invalid",
        detail: "D3c · not a team name",
        view: { kind: "create", name: "A", availability: "invalid", teams: [] },
    },
    {
        label: "Creating",
        detail: "D3c · the status stays on the page",
        view: {
            kind: "create",
            name: "acme-labs",
            availability: "available",
            teams: [],
            stage: "creating",
        },
    },
    {
        label: "Create, already on one",
        detail: "D3c · an account already on a team is offered it",
        view: { kind: "create", name: "", availability: "idle", teams: [GUILD] },
    },
    {
        label: "Enter your invite",
        detail: "D3j · a team's name and its invite code",
        view: { kind: "join", name: "", team: "idle", code: "", teams: [] },
    },
    {
        label: "Invite team found",
        detail: "D3j · the team is there",
        view: { kind: "join", name: "acme", team: "found", code: "", teams: [] },
    },
    {
        label: "Invite code refused",
        detail: "D3j · the code doesn't match an invite for the team",
        view: {
            kind: "join",
            name: "acme",
            team: "found",
            code: "WRONG123",
            teams: [],
            setback: "code",
        },
    },
    {
        label: "Joining",
        detail: "D3j · the status stays on the page",
        view: {
            kind: "join",
            name: "acme",
            team: "found",
            code: "K7Q2M9XD",
            teams: [],
            stage: "joining",
        },
    },
    {
        label: "Your teams",
        detail: "D3t · the account is already on teams",
        view: { kind: "join", name: "", team: "idle", code: "", teams: [ACME, GUILD] },
    },
    {
        label: "Opening a team",
        detail: "D3t · one of the listed teams is being opened",
        view: {
            kind: "join",
            name: "",
            team: "idle",
            code: "",
            teams: [ACME, GUILD],
            opening: "s1",
        },
    },
    {
        label: "Couldn't open",
        detail: "D5's setback · the team exists and this window couldn't open it",
        view: { kind: "openFailed", path: "join", team: ACME },
    },
    {
        label: "From the rail",
        detail: "the rail's + · the same page over the app, Esc closes it",
        view: { kind: "create", name: "", availability: "idle", teams: [ACME] },
        presentation: "dialog",
    },
    {
        label: "Small window",
        detail: "720×560 · the page scrolls rather than clipping",
        view: { kind: "join", name: "", team: "idle", code: "", teams: [ACME, GUILD] },
        window: SMALL_WINDOW,
    },
];

export function TeamSetupScreenPage() {
    const specimens = (["light", "dark"] as const).flatMap((mode) =>
        SPECIMENS.map((specimen) => ({ ...specimen, mode })),
    );
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Creating or joining a Happy Cloud team: full window on the onboarding sky during first run, over the app from the rail's +. Sign in, name your team, enter your invite or open one of your teams, with every status on the page that started it."
            title="TeamSetupScreen"
        >
            {specimens.map((specimen, index) => {
                const number = String(index + 1).padStart(2, "0");
                const slug = specimen.label
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/gu, "-")
                    .replace(/-$/u, "");
                return (
                    <FullScreenSpecimen
                        detail={`${specimen.mode} · ${specimen.detail}`}
                        key={`${specimen.mode}-${specimen.label}`}
                        label={`${specimen.label} · ${specimen.mode}`}
                        number={number}
                        screen={`${number}-${slug}-${specimen.mode}`}
                        window={specimen.window ?? WINDOW}
                    >
                        {frame(
                            <ThemeScope mode={specimen.mode}>
                                <TeamSetupScreen
                                    appearance={specimen.mode}
                                    onClose={noop}
                                    onCreate={noop}
                                    onCreateNameChange={noop}
                                    onJoin={noop}
                                    onJoinCodeChange={noop}
                                    onJoinNameChange={noop}
                                    onOpenBack={noop}
                                    onOpenRetry={noop}
                                    onPathChange={noop}
                                    onPicturePress={noop}
                                    onSignInAgain={noop}
                                    onTeamOpen={noop}
                                    onTestLoginChange={noop}
                                    onTestPasswordChange={noop}
                                    onTestSignIn={noop}
                                    presentation={specimen.presentation ?? "window"}
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
