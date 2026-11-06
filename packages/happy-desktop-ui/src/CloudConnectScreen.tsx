import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { SetupPage, type SetupPageProps } from "./SetupPage";
import { TextField } from "./TextField";
import type { ThemeMode } from "./ThemeScope";
import { thumbhashDataUrl } from "./thumbhashDataUrl";

/** One Happy Cloud server the person belongs to. */
export interface CloudConnectServer {
    readonly id: string;
    /** The server's own name for itself: the row's title. */
    readonly displayName: string;
    /** The server's handle, shown under its title as `@name`. */
    readonly name: string;
    readonly role: "owner" | "member";
    /**
     * The server's picture. The ThumbHash is painted at once and the bytes
     * over it once `url` is known. Absent: the generated initials tile.
     */
    readonly image?: { readonly thumbhash: string; readonly url?: string };
}

/** What the accounts service said about a new server's name. */
export type CloudConnectAvailability =
    | "idle"
    | "checking"
    | "available"
    | "taken"
    | "reserved"
    | "invalid";

export type CloudConnectView =
    | { readonly kind: "welcome" }
    /** The account sign-in is open in the browser. */
    | { readonly kind: "signingIn" }
    | {
          readonly kind: "servers";
          readonly servers:
              | { readonly status: "loading" }
              | { readonly status: "ready"; readonly servers: readonly CloudConnectServer[] }
              | { readonly status: "error"; readonly message: string };
          /** A picked server is being added. */
          readonly busy?: boolean;
          readonly error?: string;
      }
    | {
          readonly kind: "create";
          readonly name: string;
          readonly availability: CloudConnectAvailability;
          /** The account already has servers to go back to; otherwise create leads. */
          readonly back: boolean;
          readonly busy?: boolean;
          readonly error?: string;
      }
    | {
          readonly kind: "join";
          readonly name: string;
          readonly code: string;
          readonly busy?: boolean;
          readonly error?: string;
      }
    /** Signing in to the chosen server. */
    | { readonly kind: "connecting"; readonly server: CloudConnectServer }
    | { readonly kind: "connected"; readonly server: CloudConnectServer }
    | { readonly kind: "failed"; readonly message: string };

export interface CloudConnectScreenProps {
    readonly appearance: ThemeMode;
    readonly view: CloudConnectView;
    /** Not now, Esc, and Cancel: back to the app. */
    onClose(): void;
    /** Welcome's Continue, and Try again after a failure. */
    onContinue(): void;
    onServerPick(id: string): void;
    onCreateOpen(): void;
    onJoinOpen(): void;
    /** From create or join back to the servers. */
    onBack(): void;
    onCreateNameChange(name: string): void;
    onCreate(): void;
    onJoinNameChange(name: string): void;
    onJoinCodeChange(code: string): void;
    onJoin(): void;
    /** Success's Open: into the new cloud team. */
    onOpen(): void;
}

function availabilityHint(
    availability: CloudConnectAvailability,
    name: string,
): string | undefined {
    switch (availability) {
        case "idle":
            return undefined;
        case "checking":
            return "Checking…";
        case "available":
            return `@${name} is available`;
        case "taken":
            return `@${name} is taken.`;
        case "reserved":
            return `@${name} is reserved.`;
        case "invalid":
            return "3–32 lowercase letters, digits or dashes, not starting or ending with a dash.";
    }
}

function CloudConnectServerImage(props: {
    readonly server: CloudConnectServer;
    readonly size: 44 | 72;
}) {
    const { image } = props.server;
    if (!image)
        return (
            <Avatar
                initials={props.server.displayName.slice(0, 1).toUpperCase()}
                size="lg"
                style={{
                    width: props.size,
                    height: props.size,
                    borderRadius: props.size === 72 ? 18 : 10,
                }}
                type="agent"
            />
        );
    const placeholder = thumbhashDataUrl(image.thumbhash);
    return (
        <img
            alt=""
            className="happy-cloud-connect__image"
            data-size={props.size}
            draggable={false}
            src={image.url}
            style={placeholder ? { backgroundImage: `url(${placeholder})` } : undefined}
        />
    );
}

/**
 * C-336 CloudConnectScreen — the sidebar's "+" to Happy Cloud, full window on
 * the onboarding sky: welcome, account sign-in in the browser, the account's
 * servers, create or join one, then signing in to it. Each state is one
 * `SetupPage`, so titles, content and actions keep their places as it moves.
 * Esc returns to the app from every state. Props only.
 */
export function CloudConnectScreen(props: CloudConnectScreenProps) {
    const { view } = props;
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-cloud-connect",
        "data-testid": "cloud-connect",
        transitionKey: view.kind,
    } as const satisfies Partial<SetupPageProps>;
    const notNow = { label: "Not now", onSelect: props.onClose };
    const back = (disabled?: boolean) => ({
        label: "Back",
        onSelect: props.onBack,
        ...(disabled ? { disabled } : {}),
    });
    return (
        <div
            className="happy-cloud-connect__window"
            data-happy-desktop-ui="cloud-connect-screen"
            onKeyDown={(event) => {
                if (event.key !== "Escape" || event.defaultPrevented) return;
                event.preventDefault();
                props.onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Happy Cloud"
        >
            {(() => {
                switch (view.kind) {
                    case "welcome":
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    autoFocus: true,
                                    label: "Continue",
                                    onSelect: props.onContinue,
                                }}
                                copy="Add a cloud team. Its agents run in the cloud, so no computer needs to stay on."
                                scene="cloud-variation"
                                secondary={notNow}
                                title="Happy Cloud"
                            />
                        );
                    case "signingIn":
                        return (
                            <SetupPage
                                {...frame}
                                copy="Sign in or create an account in your browser, then come back here."
                                scene="closed-lock"
                                secondary={{ label: "Cancel", onSelect: props.onClose }}
                                status={{ busy: true, label: "Waiting for your browser…" }}
                                title="Signing in"
                            />
                        );
                    case "servers":
                        return (
                            <SetupPage
                                {...frame}
                                copy="Pick a server to add it to Happy."
                                scene="cloud-variation"
                                secondary={notNow}
                                {...(view.servers.status === "loading"
                                    ? { status: { busy: true, label: "Loading your servers…" } }
                                    : view.servers.status === "error"
                                      ? { status: { label: view.servers.message } }
                                      : view.error
                                        ? { status: { label: view.error } }
                                        : {})}
                                title="Your servers"
                            >
                                <div className="happy-cloud-connect__column">
                                    {view.servers.status === "ready" ? (
                                        <div className="happy-cloud-connect__servers">
                                            {view.servers.servers.map((server, index) => (
                                                <button
                                                    // eslint-disable-next-line jsx-a11y/no-autofocus -- the first server is where a keyboard starts on this screen
                                                    autoFocus={index === 0}
                                                    className="happy-cloud-connect__server"
                                                    disabled={view.busy}
                                                    key={server.id}
                                                    onClick={() => props.onServerPick(server.id)}
                                                    type="button"
                                                >
                                                    <CloudConnectServerImage
                                                        server={server}
                                                        size={44}
                                                    />
                                                    <span className="happy-cloud-connect__server-text">
                                                        <span className="happy-cloud-connect__server-name">
                                                            {server.displayName}
                                                        </span>
                                                        <span className="happy-cloud-connect__server-detail">
                                                            @{server.name}
                                                            {server.role === "owner"
                                                                ? " · Owner"
                                                                : ""}
                                                        </span>
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                    <div className="happy-cloud-connect__links">
                                        <Button
                                            disabled={view.busy}
                                            icon="plus"
                                            onClick={props.onCreateOpen}
                                            variant="ghost"
                                        >
                                            Create a server
                                        </Button>
                                        <Button
                                            disabled={view.busy}
                                            onClick={props.onJoinOpen}
                                            variant="ghost"
                                        >
                                            Join with an invite
                                        </Button>
                                    </div>
                                </div>
                            </SetupPage>
                        );
                    case "create": {
                        const hint = view.error ?? availabilityHint(view.availability, view.name);
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    busy: view.busy,
                                    disabled: view.availability !== "available",
                                    label: "Create server",
                                    onSelect: props.onCreate,
                                }}
                                copy="Pick a name for your team’s server. You can change it later."
                                scene="hatching-chick"
                                secondary={view.back ? back(view.busy) : notNow}
                                title="Create a server"
                            >
                                <div className="happy-cloud-connect__column">
                                    <TextField
                                        aria-label="Server name"
                                        autoFocus
                                        className="happy-cloud-connect__handle"
                                        disabled={view.busy}
                                        fullWidth
                                        leadingText="@"
                                        onSubmit={props.onCreate}
                                        onValueChange={props.onCreateNameChange}
                                        placeholder="acme"
                                        size="large"
                                        value={view.name}
                                    />
                                    {/* Under the field, in a line kept whether or not it
                                        says anything, so typing never moves the page. */}
                                    <p
                                        className="happy-cloud-connect__hint"
                                        data-tone={
                                            view.error !== undefined ||
                                            view.availability === "taken" ||
                                            view.availability === "reserved" ||
                                            view.availability === "invalid"
                                                ? "attention"
                                                : undefined
                                        }
                                        role="status"
                                    >
                                        {hint}
                                    </p>
                                    {view.back ? null : (
                                        <div className="happy-cloud-connect__links">
                                            <Button
                                                disabled={view.busy}
                                                onClick={props.onJoinOpen}
                                                variant="ghost"
                                            >
                                                Have an invite? Join a server
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </SetupPage>
                        );
                    }
                    case "join":
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    busy: view.busy,
                                    disabled: view.name === "" || view.code === "",
                                    label: "Join server",
                                    onSelect: props.onJoin,
                                }}
                                copy="Enter the server’s name and the invite code you were sent."
                                scene="open-hands"
                                secondary={back(view.busy)}
                                title="Join a server"
                            >
                                <div className="happy-cloud-connect__column">
                                    <TextField
                                        aria-label="Server name"
                                        autoFocus
                                        className="happy-cloud-connect__handle"
                                        disabled={view.busy}
                                        fullWidth
                                        leadingText="@"
                                        onSubmit={props.onJoin}
                                        onValueChange={props.onJoinNameChange}
                                        placeholder="acme"
                                        size="large"
                                        value={view.name}
                                    />
                                    <TextField
                                        aria-label="Invite code"
                                        className="happy-cloud-connect__handle"
                                        disabled={view.busy}
                                        fullWidth
                                        onSubmit={props.onJoin}
                                        onValueChange={props.onJoinCodeChange}
                                        placeholder="Invite code"
                                        size="large"
                                        value={view.code}
                                    />
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
                    case "connecting":
                        return (
                            <SetupPage
                                {...frame}
                                copy={`@${view.server.name}`}
                                secondary={{ label: "Cancel", onSelect: props.onClose }}
                                status={{ busy: true, label: "Signing in to the server…" }}
                                title={`Connecting to ${view.server.displayName}`}
                            >
                                <div className="happy-cloud-connect__hero">
                                    <CloudConnectServerImage server={view.server} size={72} />
                                </div>
                            </SetupPage>
                        );
                    case "connected":
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    autoFocus: true,
                                    label: `Open ${view.server.displayName}`,
                                    onSelect: props.onOpen,
                                }}
                                copy={`@${view.server.name} is now in your sidebar.`}
                                title="You’re in"
                            >
                                <div className="happy-cloud-connect__hero">
                                    <CloudConnectServerImage server={view.server} size={72} />
                                </div>
                            </SetupPage>
                        );
                    case "failed":
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    autoFocus: true,
                                    label: "Try again",
                                    onSelect: props.onContinue,
                                }}
                                copy={view.message}
                                scene="snail"
                                secondary={notNow}
                                title="Couldn’t connect"
                            />
                        );
                }
            })()}
        </div>
    );
}
