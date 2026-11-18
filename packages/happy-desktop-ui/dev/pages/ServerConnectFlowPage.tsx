import type { ReactNode } from "react";
import type { CloudConnectScreenProps } from "../../src/CloudConnectScreen";
import { ServerConnectScreen, type ServerConnectView } from "../../src/ServerConnectScreen";
import { ThemeScope } from "../../src/ThemeScope";
import type { WelcomeSlide } from "../../src/WelcomeDeck";
import { WelcomeScreen } from "../../src/WelcomeScreen";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-048";

const noop = () => undefined;

/** The window Happy opens at, and the smallest one it allows. */
const windows = [
    { id: "default", width: 1100, height: 760 },
    { id: "minimum", width: 720, height: 640 },
] as const;

/** Contains the fixed sheet inside its window-sized viewport. */
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

/** The enterprise test server, a deployment of one server, as its discovery describes it. */
const ACME = {
    name: "164-90-149-4.sslip.io",
    signIn: { method: "Acme SSO (demo)", host: "auth.164-90-149-4.sslip.io" },
} as const;

/** An enterprise cloud, as its happy-cloud.json describes it. */
const ACME_CLOUD = {
    kind: "enterpriseSignIn",
    name: "Acme Cloud",
    signIn: { name: "Acme SSO", host: "sso.acme.example" },
} as const;

const SERVERS = [
    { id: "s1", displayName: "Acme Research", name: "research" },
    { id: "s2", displayName: "Platform", name: "platform" },
] as const;

/** A cloud's steps take Happy Cloud's handlers; here none of them does anything. */
const CLOUD_HANDLERS: Omit<CloudConnectScreenProps, "appearance" | "view" | "onClose"> = {
    onAgentAdd: noop,
    onBack: noop,
    onCloudOpen: noop,
    onContinue: noop,
    onCreate: noop,
    onCreateNameChange: noop,
    onCreateOpen: noop,
    onLogoPress: noop,
    onTestLoginChange: noop,
    onTestPasswordChange: noop,
    onTestSignIn: noop,
    onEmailOpen: noop,
    onEmailChange: noop,
    onEmailCodeSend: noop,
    onEmailCodeChange: noop,
    onEmailCodeVerify: noop,
    onEmailCodeResend: noop,
    onEmailChangeOpen: noop,
    onServerPick: noop,
    onServersContinue: noop,
    onInviteOpen: noop,
    onInviteChange: noop,
    onInviteAccept: noop,
};

/* The app's first slide, word for word, so the welcome reads as it ships. */
const PITCH: readonly WelcomeSlide[] = [
    {
        art: { kind: "logo" },
        copy: "Happy is open source, so anyone can check what it does. Run it on hardware you trust, and reach it from your phone with end-to-end encryption.",
        id: "happy",
        title: "Work with AI as a team. Safely.",
    },
];

/** Each step in the order a person meets it, then the ways it goes wrong. */
const STEPS: readonly {
    readonly id: string;
    readonly label: string;
    readonly detail: string;
    /**
     * Absent: the first screen, with Enterprise login under Go Happy; `cloud`
     * where Happy Cloud is offered beside it.
     */
    readonly view?: ServerConnectView;
    readonly cloud?: true;
}[] = [
    {
        id: "welcome",
        label: "Welcome",
        detail: "the first screen in production · Enterprise login, a ghost button under Go Happy",
    },
    {
        id: "welcome-cloud",
        label: "Welcome, Happy Cloud offered",
        detail: "the first screen in development and preview builds",
        cloud: true,
    },
    {
        id: "address",
        label: "Address",
        detail: "Enterprise login from the first screen, or Settings › Account › Enterprise login",
        view: { kind: "address", address: "" },
    },
    {
        id: "address-checking",
        label: "Address checking",
        detail: "the shell reads /.well-known/happy-cloud.json, then /v0/authentication",
        view: { kind: "address", address: "acme.example", busy: true },
    },
    {
        id: "cloud-sign-in",
        label: "Cloud: sign in",
        detail: "a cloud of servers: its account signs in at the company's identity provider",
        view: { kind: "cloud", cloud: ACME_CLOUD },
    },
    {
        id: "cloud-signing-in",
        label: "Cloud: signing in",
        detail: "the browser is open at the identity provider",
        view: { kind: "cloud", cloud: { kind: "signingIn", host: "sso.acme.example" } },
    },
    {
        id: "cloud-servers",
        label: "Cloud: servers",
        detail: "Happy Cloud's own list, with invites pasted in",
        view: {
            kind: "cloud",
            cloud: {
                kind: "servers",
                servers: { status: "ready", servers: SERVERS },
                joins: new Map([["s1", "joined"]]),
                invite: true,
            },
        },
    },
    {
        id: "cloud-first",
        label: "Cloud: first server",
        detail: "an account with no servers yet: bootstrap one, or join with an invite",
        view: {
            kind: "cloud",
            cloud: {
                kind: "create",
                name: "research",
                availability: "available",
                back: false,
                invite: true,
            },
        },
    },
    {
        id: "cloud-invite",
        label: "Cloud: join with an invite",
        detail: "the invite's link, or its code, pasted in",
        view: {
            kind: "cloud",
            cloud: { kind: "invite", link: "https://join.acme.example/#k3Jx9qPz" },
        },
    },
    {
        id: "cloud-invite-refused",
        label: "Cloud: invite refused",
        detail: "the account API's own sentence",
        view: {
            kind: "cloud",
            cloud: {
                kind: "invite",
                link: "https://join.acme.example/#k3Jx9qPz",
                error: "This invitation has expired. Ask for a new invitation.",
            },
        },
    },
    {
        id: "sign-in",
        label: "One server: sign in",
        detail: "no happy-cloud.json: one server, from its own discovery",
        view: { kind: "signIn", server: ACME },
    },
    {
        id: "signing-in",
        label: "One server: signing in",
        detail: "the browser is open at the organization's sign-in",
        view: { kind: "signingIn", server: ACME, host: "auth.164-90-149-4.sslip.io" },
    },
    {
        id: "invalid",
        label: "Invalid address",
        detail: "not a web address, checked before anything is asked",
        view: {
            kind: "address",
            address: "happy acme",
            error: "That isn’t a web address. Enter one like acme.example.",
        },
    },
    {
        id: "discovery-invalid",
        label: "Discovery refused",
        detail: "happy-cloud.json isn't version 1, or isn't bound to this address",
        view: {
            kind: "address",
            address: "acme.example",
            error: "This address doesn't describe a Happy deployment this app can use.",
        },
    },
    {
        id: "unreachable",
        label: "Unreachable",
        detail: "discovery couldn't be reached",
        view: {
            kind: "address",
            address: "acme.example",
            error: "Happy couldn't reach this address. Check it and your network.",
        },
    },
    {
        id: "not-happy",
        label: "One server: not a Happy server",
        detail: "no happy-cloud.json, and /v0/authentication answered something else",
        view: {
            kind: "signIn",
            server: { name: ACME.name },
            error: "This address doesn't answer like a Happy server.",
        },
    },
    {
        id: "sign-in-reading",
        label: "One server: reading the sign-in",
        detail: "its sign-in method is still being read",
        view: { kind: "signIn", server: { name: ACME.name }, busy: true },
    },
    {
        id: "cancelled",
        label: "Cancelled",
        detail: "the person stopped waiting for the browser",
        view: { kind: "signIn", server: ACME, error: "Signing in was cancelled." },
    },
    {
        id: "denied",
        label: "Denied",
        detail: "the organization's sign-in refused",
        view: {
            kind: "signIn",
            server: ACME,
            error: "The sign-in server refused this sign-in.",
        },
    },
];

/**
 * P-048 Enterprise login — a company's deployment by its address, step by
 * step, at the window Happy opens at and its minimum.
 */
export function ServerConnectFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Enterprise login: from the first screen, the company’s address, then a cloud’s own steps or one server’s sign-in, and each way it can go wrong."
            title="Enterprise login"
        >
            {windows.flatMap((window) =>
                STEPS.map((step, index) => {
                    const number = String(index + 1).padStart(2, "0");
                    const screen = `${number}-${step.id}-${String(window.width)}x${String(window.height)}`;
                    return (
                        <FullScreenSpecimen
                            detail={step.detail}
                            key={screen}
                            label={`${step.label} · ${String(window.width)}×${String(window.height)}`}
                            number={number}
                            screen={screen}
                            window={window}
                        >
                            {frame(
                                <ThemeScope mode="light">
                                    {step.view ? (
                                        <ServerConnectScreen
                                            appearance="light"
                                            cloud={CLOUD_HANDLERS}
                                            onAddressChange={noop}
                                            onAddressSubmit={noop}
                                            onBack={noop}
                                            onClose={noop}
                                            onSignIn={noop}
                                            view={step.view}
                                        />
                                    ) : (
                                        <WelcomeScreen
                                            appearance="light"
                                            backdrop={{ kind: "sky" }}
                                            onAction={noop}
                                            onAppearanceChange={noop}
                                            {...(step.cloud
                                                ? {
                                                      secondaryAction: {
                                                          label: "Connect to Happy Cloud",
                                                          onAction: noop,
                                                      },
                                                  }
                                                : {})}
                                            slides={PITCH}
                                            tertiaryAction={{
                                                label: "Enterprise login",
                                                onAction: noop,
                                            }}
                                        />
                                    )}
                                </ThemeScope>,
                            )}
                        </FullScreenSpecimen>
                    );
                }),
            )}
        </ComponentPage>
    );
}
