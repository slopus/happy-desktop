import type { ReactNode } from "react";
import { CloudConnectDialog, type CloudConnectView } from "../../src/CloudConnectDialog";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-336";

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
const noop = () => undefined;

const SERVERS = [
    {
        id: "s1",
        displayName: "Acme Corp",
        host: "acme.happy.computer",
        role: "owner" as const,
        image: { thumbhash: "HAgGXxBVauaQSKZWmNmKFmhmhjAoCYMC" },
    },
    {
        id: "s2",
        displayName: "Design Guild",
        host: "design-guild.happy.computer",
        role: "member" as const,
    },
];

const SPECIMENS: readonly {
    readonly label: string;
    readonly detail: string;
    readonly view: CloudConnectView;
}[] = [
    { label: "Confirm", detail: "Cancel or Connect", view: { kind: "confirm" } },
    {
        label: "Signing in",
        detail: "the account sign-in is open in the browser",
        view: { kind: "signingIn", host: "accounts.happy.computer" },
    },
    {
        label: "Picker",
        detail: "the account's servers, create, join",
        view: {
            kind: "picker",
            servers: { status: "ready", servers: SERVERS },
            suffix: "happy.computer",
            create: { name: "", availability: "idle" },
            join: { name: "", code: "" },
        },
    },
    {
        label: "Picker name available",
        detail: "a new server name the accounts service said is free",
        view: {
            kind: "picker",
            servers: { status: "ready", servers: [] },
            suffix: "happy.computer",
            create: { name: "acme-labs", availability: "available" },
            join: { name: "", code: "" },
        },
    },
    {
        label: "Picker name taken",
        detail: "the name belongs to another server",
        view: {
            kind: "picker",
            servers: { status: "ready", servers: SERVERS },
            suffix: "happy.computer",
            create: { name: "acme", availability: "taken" },
            join: { name: "design-guild", code: "WRONG123" },
            error: "No server has that name and invite code.",
        },
    },
    {
        label: "Failed",
        detail: "the account sign-in did not finish",
        view: { kind: "failed", message: "Signing in didn't finish. Try again." },
    },
];

export function CloudConnectDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The sidebar's + to Happy Cloud: confirm, account sign-in in the browser, then pick, create or join a server."
            title="CloudConnectDialog"
        >
            {SPECIMENS.map((specimen, index) => {
                const number = String(index + 1).padStart(2, "0");
                return (
                    <FullScreenSpecimen
                        detail={`480px card · centered · ${specimen.detail}`}
                        key={specimen.label}
                        label={specimen.label}
                        number={number}
                        screen={`${number}-${specimen.label.toLowerCase().replace(/ /gu, "-")}`}
                        window={WINDOW}
                    >
                        {frame(
                            <CloudConnectDialog
                                onCancel={noop}
                                onConnect={noop}
                                onCreate={noop}
                                onCreateNameChange={noop}
                                onJoin={noop}
                                onJoinCodeChange={noop}
                                onJoinNameChange={noop}
                                onServerPick={noop}
                                view={specimen.view}
                            />,
                        )}
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
