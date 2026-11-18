import {
    CloudConnectPages,
    type CloudConnectScreenProps,
    type CloudConnectView,
} from "./CloudConnectScreen";
import { ConnectSheet } from "./ConnectSheet";
import { SetupPage } from "./SetupPage";
import { TextField } from "./TextField";
import type { ThemeMode } from "./ThemeScope";

/** A deployment of one server, as its sign-in steps name it. */
export interface ServerConnectServer {
    /** What the server is listed as: its host, unless it was given a name. */
    readonly name: string;
    /**
     * How signing in works there, from the server's own discovery: the
     * method's name and the host the person signs in at. Absent where the
     * shell can't read it before the browser opens.
     */
    readonly signIn?: { readonly method: string; readonly host: string };
}

export type ServerConnectView =
    /** The deployment's address, typed in. */
    | {
          readonly kind: "address";
          readonly address: string;
          /** What is at the address is being read. */
          readonly busy?: boolean;
          readonly error?: string;
      }
    /** A deployment of one server: how signing in works there, before the browser opens. */
    | {
          readonly kind: "signIn";
          readonly server: ServerConnectServer;
          /** How signing in works is still being read. */
          readonly busy?: boolean;
          /** Why the last sign-in did not finish, including being cancelled. */
          readonly error?: string;
      }
    /** The sign-in is open in the browser. */
    | {
          readonly kind: "signingIn";
          readonly server: ServerConnectServer;
          /** The host the browser opened at, once the shell says. */
          readonly host?: string;
      }
    /** A cloud of servers: its own steps, from signing in to its account on. */
    | { readonly kind: "cloud"; readonly cloud: CloudConnectView };

export interface ServerConnectPagesProps {
    readonly appearance: ThemeMode;
    readonly view: ServerConnectView;
    onAddressChange(address: string): void;
    /** Continue on the address: reads what is there. */
    onAddressSubmit(): void;
    /** Continue on the sign-in step: opens the browser. */
    onSignIn(): void;
    /** From the sign-in step to the address; Cancel while the browser is open. */
    onBack(): void;
}

/**
 * Enterprise login's own steps, as pages of its sheet: the address, then for
 * a deployment of one server how signing in works there and the browser.
 * Once signed in the sheet is gone and the server is open.
 */
export function ServerConnectPages(
    props: ServerConnectPagesProps & {
        readonly view: Exclude<ServerConnectView, { kind: "cloud" }>;
    },
) {
    const { view } = props;
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-cloud-connect",
        "data-testid": "server-connect",
        transitionKey: `server-${view.kind}`,
    } as const;
    switch (view.kind) {
        case "address":
            return (
                <SetupPage
                    {...frame}
                    action={{
                        busy: view.busy,
                        disabled: view.address.trim() === "",
                        label: "Continue",
                        onSelect: props.onAddressSubmit,
                    }}
                    copy="Enter your company’s Happy address. You’ll sign in with your company’s account."
                    placement="centered"
                    title="Enterprise login"
                >
                    <div className="happy-cloud-connect__column">
                        <TextField
                            aria-label="Address"
                            autoComplete="url"
                            autoFocus
                            className="happy-cloud-connect__handle"
                            disabled={view.busy}
                            fullWidth
                            inputMode="url"
                            onSubmit={props.onAddressSubmit}
                            onValueChange={props.onAddressChange}
                            placeholder="acme.example"
                            size="large"
                            value={view.address}
                        />
                        {/* Kept whether or not it says anything, so an error never moves the page. */}
                        <p
                            className="happy-cloud-connect__hint"
                            data-tone={view.error ? "attention" : undefined}
                            role="status"
                        >
                            {view.error}
                        </p>
                    </div>
                </SetupPage>
            );
        case "signIn": {
            const signIn = view.server.signIn;
            return (
                <SetupPage
                    {...frame}
                    action={{
                        autoFocus: true,
                        disabled: view.busy,
                        label: "Continue",
                        onSelect: props.onSignIn,
                    }}
                    copy={
                        signIn ? (
                            <>
                                Sign in with{" "}
                                <strong className="happy-cloud-connect__email">
                                    {signIn.method}
                                </strong>{" "}
                                at{" "}
                                <strong className="happy-cloud-connect__email">
                                    {signIn.host}
                                </strong>{" "}
                                in your browser.
                            </>
                        ) : (
                            "You’ll sign in with your organization’s account in your browser, then come back here."
                        )
                    }
                    scene="closed-lock"
                    secondary={{ label: "Back", onSelect: props.onBack }}
                    {...(view.busy
                        ? { status: { busy: true, label: "Reading how this server signs in…" } }
                        : view.error
                          ? { status: { label: view.error } }
                          : {})}
                    title={`Sign in to ${view.server.name}`}
                />
            );
        }
        case "signingIn":
            return (
                <SetupPage
                    {...frame}
                    copy={
                        view.host
                            ? `Finish signing in at ${view.host} in your browser, then come back here.`
                            : "Finish signing in in your browser, then come back here."
                    }
                    scene="closed-lock"
                    secondary={{ label: "Cancel", onSelect: props.onBack }}
                    status={{ busy: true, label: "Waiting for your browser…" }}
                    title={`Signing in to ${view.server.name}`}
                />
            );
    }
}

export interface ServerConnectScreenProps extends ServerConnectPagesProps {
    /** The close button and Esc: back to the app. */
    onClose(): void;
    /** A cloud's steps' handlers, while `view` is a cloud's. */
    readonly cloud?: Omit<CloudConnectScreenProps, "appearance" | "view" | "onClose">;
}

/**
 * C-352 ServerConnectScreen — Enterprise login, full window on the onboarding
 * sky: the company's address, then either one server's sign-in or a cloud's
 * own steps, the same ones Happy Cloud has, in one sheet.
 */
export function ServerConnectScreen(props: ServerConnectScreenProps) {
    const { onClose, cloud, ...pages } = props;
    const { view } = props;
    return (
        <ConnectSheet appearance={props.appearance} label="Enterprise login" onClose={onClose}>
            {(dismiss) =>
                view.kind === "cloud" ? (
                    cloud ? (
                        <CloudConnectPages
                            {...cloud}
                            appearance={props.appearance}
                            dismiss={dismiss}
                            onClose={onClose}
                            view={view.cloud}
                        />
                    ) : null
                ) : (
                    <ServerConnectPages {...pages} view={view} />
                )
            }
        </ConnectSheet>
    );
}
