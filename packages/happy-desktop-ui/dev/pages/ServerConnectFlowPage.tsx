import type { ReactNode } from "react";
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

/** The enterprise test server, as its discovery describes it. */
const ACME = {
    name: "164-90-149-4.sslip.io",
    signIn: { method: "Acme SSO (demo)", host: "auth.164-90-149-4.sslip.io" },
} as const;

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
        detail: "once local setup hands over, or Settings › Account › Connect to a server",
        view: { kind: "address", address: "" },
    },
    {
        id: "address-checking",
        label: "Address checking",
        detail: "the host Happy Agent reads the server's discovery and adds it",
        view: { kind: "address", address: "164-90-149-4.sslip.io", busy: true },
    },
    {
        id: "sign-in",
        label: "Sign in",
        detail: "how signing in works there, from the server's discovery",
        view: { kind: "signIn", server: ACME },
    },
    {
        id: "signing-in",
        label: "Signing in",
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
            error: "That isn’t a web address. Enter one like https://happy.example.com.",
        },
    },
    {
        id: "blocked",
        label: "Blocked by the edge",
        detail: "a load balancer answered /v0/authentication with its sign-in page",
        view: {
            kind: "address",
            address: "https://164-90-149-4.sslip.io",
            error: "This address is not a Happy server, or something in front of it, such as a sign-in page, answered instead.",
        },
    },
    {
        id: "unreachable",
        label: "Unreachable",
        detail: "discovery couldn't be reached",
        view: {
            kind: "address",
            address: "https://164-90-149-4.sslip.io",
            error: "Happy couldn’t reach 164-90-149-4.sslip.io. Check the address and your network.",
        },
    },
    {
        id: "sign-in-reading",
        label: "Reading the sign-in",
        detail: "the server is added; its sign-in method is still being read",
        view: { kind: "signIn", server: { name: ACME.name }, busy: true },
    },
    {
        id: "sign-in-older-shell",
        label: "Sign in, older shell",
        detail: "a shell that can't read discovery before the browser opens",
        view: { kind: "signIn", server: { name: ACME.name } },
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
 * P-048 Server connect flow — connecting to a team server by its address,
 * step by step, at the window Happy opens at and its minimum.
 */
export function ServerConnectFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Enterprise login: from the first screen, local setup, then the server’s address, how signing in works there, the browser, and each way it can go wrong."
            title="Server connect flow"
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
