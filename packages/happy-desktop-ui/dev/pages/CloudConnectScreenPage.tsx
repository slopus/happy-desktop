import type { ReactNode } from "react";
import { CloudConnectScreen, type CloudConnectView } from "../../src/CloudConnectScreen";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-336";

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
    role: "owner" as const,
    image: { thumbhash: "HAgGXxBVauaQSKZWmNmKFmhmhjAoCYMC" },
};
const GUILD = {
    id: "s2",
    displayName: "Design Guild",
    name: "design-guild",
    role: "member" as const,
};

const SPECIMENS: readonly {
    readonly label: string;
    readonly detail: string;
    readonly view: CloudConnectView;
    readonly window?: { readonly width: number; readonly height: number };
}[] = [
    {
        label: "Welcome",
        detail: "the sidebar's + · Continue or Not now",
        view: { kind: "welcome" },
    },
    {
        label: "Signing in",
        detail: "the account sign-in is open in the browser",
        view: { kind: "signingIn" },
    },
    {
        label: "Servers loading",
        detail: "the account is signed in; its servers are on the way",
        view: { kind: "servers", servers: { status: "loading" } },
    },
    {
        label: "Servers",
        detail: "the account's servers, then create or join",
        view: { kind: "servers", servers: { status: "ready", servers: [ACME, GUILD] } },
    },
    {
        label: "Create first",
        detail: "no servers yet, so create leads",
        view: { kind: "create", name: "", availability: "idle", back: false },
    },
    {
        label: "Create available",
        detail: "the accounts service said the name is free",
        view: { kind: "create", name: "acme-labs", availability: "available", back: true },
    },
    {
        label: "Create taken",
        detail: "the name belongs to another server",
        view: { kind: "create", name: "acme", availability: "taken", back: true },
    },
    {
        label: "Create busy",
        detail: "the server is being created",
        view: {
            kind: "create",
            name: "acme-labs",
            availability: "available",
            back: true,
            busy: true,
        },
    },
    {
        label: "Join",
        detail: "a server's name and the invite code",
        view: { kind: "join", name: "", code: "" },
    },
    {
        label: "Join failed",
        detail: "the accounts service refused the code",
        view: {
            kind: "join",
            name: "design-guild",
            code: "WRONG123",
            error: "No server has that name and invite code.",
        },
    },
    {
        label: "Connecting",
        detail: "signing in to the picked server",
        view: { kind: "connecting", server: ACME },
    },
    {
        label: "Connected",
        detail: "Open drops the person into the new team",
        view: { kind: "connected", server: GUILD },
    },
    {
        label: "Failed",
        detail: "the account sign-in did not finish",
        view: { kind: "failed", message: "Signing in didn’t finish. Try again." },
    },
    {
        label: "Small window",
        detail: "720×560 · the page scrolls rather than clipping",
        view: { kind: "servers", servers: { status: "ready", servers: [ACME, GUILD] } },
        window: SMALL_WINDOW,
    },
];

export function CloudConnectScreenPage() {
    const specimens = (["light", "dark"] as const).flatMap((mode) =>
        SPECIMENS.map((specimen) => ({ ...specimen, mode })),
    );
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The sidebar's + to Happy Cloud, full window on the onboarding sky: welcome, account sign-in, servers, create, join, connecting, connected."
            title="CloudConnectScreen"
        >
            {specimens.map((specimen, index) => {
                const number = String(index + 1).padStart(2, "0");
                const slug = specimen.label.toLowerCase().replace(/ /gu, "-");
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
                                <CloudConnectScreen
                                    appearance={specimen.mode}
                                    onBack={noop}
                                    onClose={noop}
                                    onContinue={noop}
                                    onCreate={noop}
                                    onCreateNameChange={noop}
                                    onCreateOpen={noop}
                                    onJoin={noop}
                                    onJoinCodeChange={noop}
                                    onJoinNameChange={noop}
                                    onJoinOpen={noop}
                                    onOpen={noop}
                                    onServerPick={noop}
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
