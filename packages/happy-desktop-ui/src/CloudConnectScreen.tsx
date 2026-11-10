import { useState } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { SetupPage, type SetupPageProps } from "./SetupPage";
import { TextField } from "./TextField";
import type { ThemeMode } from "./ThemeScope";
import { thumbhashDataUrl } from "./thumbhashDataUrl";
import { LottieScene, type LottieSceneName } from "./LottieScene";
import { Ionicon } from "./vectorIcons/VectorIcon";
import type { WelcomeSlide } from "./WelcomeDeck";
import { WelcomeScreen } from "./WelcomeScreen";

/** One Happy Cloud server the person belongs to. */
export interface CloudConnectServer {
    readonly id: string;
    /** The server's own name for itself: the row's title. */
    readonly displayName: string;
    /** The server's handle, shown under its title as `@name`. */
    readonly name: string;
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

/** Another Happy Agent of the reader's own, which the Chief of Staff sets up. */
export type CloudConnectAgentAudience = "personal" | "team";

export type CloudConnectView =
    /**
     * What to add: a Happy Agent of their own, one their small team shares,
     * or Happy Cloud. The first two are drafted to the Chief of Staff.
     */
    | {
          readonly kind: "choose";
          /** Whose request is being written into the Chief of Staff's draft. */
          readonly asking?: CloudConnectAgentAudience;
          /** It is in the draft: the sheet leaves, onto that conversation. */
          readonly asked?: true;
          readonly error?: string;
      }
    | {
          readonly kind: "welcome";
          /**
           * Test-account sign-in, revealed by pressing the logo ten times
           * in a row. Absent, nothing of it is drawn or announced.
           */
          readonly testSignIn?: {
              readonly login: string;
              readonly password: string;
              readonly busy?: boolean;
              readonly error?: string;
          };
      }
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
    | {
          readonly kind: "connected";
          readonly server: CloudConnectServer;
          /** This computer can't keep the sign-in, so a restart asks for it again. */
          readonly notKept?: true;
      }
    | { readonly kind: "failed"; readonly message: string };

export interface CloudConnectScreenProps {
    readonly appearance: ThemeMode;
    readonly view: CloudConnectView;
    /** The close button, Esc, and Cancel: back to the app. */
    onClose(): void;
    /** A Happy Agent of the reader's own, or their team's: drafted to the Chief of Staff. */
    onAgentAdd(audience: CloudConnectAgentAudience): void;
    /** Happy Cloud's own steps, from its welcome. */
    onCloudOpen(): void;
    /** Welcome's Continue, and Try again after a failure. */
    onContinue(): void;
    onServerPick(id: string): void;
    onCreateOpen(): void;
    onJoinOpen(): void;
    /** From create or join back to the servers, and from the welcome to the choices. */
    onBack(): void;
    onCreateNameChange(name: string): void;
    onCreate(): void;
    onJoinNameChange(name: string): void;
    onJoinCodeChange(code: string): void;
    onJoin(): void;
    /** Success's Open: into the new cloud team. */
    onOpen(): void;
    onLogoPress(): void;
    onTestLoginChange(login: string): void;
    onTestPasswordChange(password: string): void;
    onTestSignIn(): void;
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
 * The three ways to add to Happy, side by side like plans: who each is for,
 * what it is, what it comes with, and the one button that starts it, in the
 * order they grow: just you, a small team, an organization.
 */
const PLANS: readonly {
    readonly id: CloudConnectAgentAudience | "cloud";
    /** Grows from card to card: a seedling, a sprig, a tree. */
    readonly scene: LottieSceneName;
    /**
     * Each drawing sits differently in its square, so this moves it sideways
     * until its ink, not its box, starts on the card's text edge.
     */
    readonly sceneInset: number;
    /** The plan the row recommends: its button is the one filled in. */
    readonly recommended?: true;
    readonly audience: string;
    readonly title: string;
    readonly detail: string;
    readonly features: readonly string[];
    readonly action: string;
}[] = [
    {
        id: "personal",
        scene: "seedling",
        sceneInset: 0,
        audience: "For you",
        title: "Solo",
        detail: "Your own Happy Agent on a machine you run.",
        features: [
            "Self-hosted on a server or an always-on computer",
            "Keeps working while this computer is off",
            "Just you, nobody else",
        ],
        action: "Set up via Chief of Staff",
    },
    {
        id: "team",
        scene: "sprig",
        sceneInset: 10,
        audience: "For people you trust",
        title: "Shared",
        detail: "Like Solo, shared with your team.",
        features: [
            "Everyone gets full access, so there's nothing to configure",
            "You host it and you manage it",
            "Sign in with your own auth, or with WorkOS",
        ],
        action: "Set up via Chief of Staff",
    },
    {
        id: "cloud",
        scene: "tree",
        sceneInset: -3,
        audience: "For lots of agents",
        title: "Cloud",
        detail: "A hardened, high-performance control plane, hosted by Happy.",
        features: [
            "Built for many agents at once, and the people running them",
            "Run on our compute, or bring your own",
            "Use our models, or your own inference",
            "Programmable permissions for every agent",
        ],
        action: "Continue",
        recommended: true,
    },
];

/**
 * Happy Cloud introducing itself, the way the first launch introduces Happy:
 * one slide for what it is, then one for each thing the Cloud plan promises.
 */
const CLOUD_SLIDES: readonly WelcomeSlide[] = [
    {
        art: { kind: "scene", name: "cloud-variation" },
        copy: "A hardened, high-performance control plane for your agents, hosted by Happy.",
        id: "cloud",
        title: "Happy Cloud",
    },
    {
        art: { kind: "scene", name: "robot" },
        copy: "Run many agents at once for your whole team, and no computer has to stay on.",
        id: "scale",
        title: "Built for lots of agents",
    },
    {
        art: { kind: "scene", name: "sparkles" },
        copy: "Run on our compute or bring your own. Use our models or your own inference.",
        id: "yours",
        title: "Ours or yours",
    },
    {
        art: { kind: "scene", name: "closed-lock" },
        copy: "Decide what every agent can see and do, and keep each one isolated.",
        id: "permissions",
        title: "Programmable permissions",
    },
];

/**
 * C-336 CloudConnectScreen — the sidebar's "+", full window on the onboarding
 * sky. It opens on what to add: a personal remote agent or a shared team agent,
 * which it hands to the Chief of Staff to set up, or Happy Cloud: welcome, account sign-in in the browser, the account's
 * servers, create or join one, then signing in to it. Each state is one
 * `SetupPage`, so titles, content and actions keep their places as it moves,
 * except the welcome: that is a `WelcomeScreen` deck, like the first launch.
 * Esc and the close button in the top-right corner return to the app from
 * every state. The screen rises from the bottom when it opens and
 * sinks back before `onClose` is called; that passing motion is its only state.
 */
export function CloudConnectScreen(props: CloudConnectScreenProps) {
    const { view, onClose } = props;
    // Leaving plays the sheet back down first; the caller hears once it is gone.
    const [dismissed, dismissedSet] = useState(false);
    // A choice drafted to the Chief of Staff leaves the same way, onto it.
    const closing = dismissed || (view.kind === "choose" && view.asked === true);
    const dismiss = () => dismissedSet(true);
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-cloud-connect",
        "data-testid": "cloud-connect",
        transitionKey: view.kind,
    } as const satisfies Partial<SetupPageProps>;
    const back = (disabled?: boolean) => ({
        label: "Back",
        onSelect: props.onBack,
        ...(disabled ? { disabled } : {}),
    });
    return (
        <div
            className="happy-cloud-connect__window"
            // The close button sits on the sky too, outside any one page.
            data-appearance={props.appearance}
            data-backdrop="sky"
            data-closing={closing ? "" : undefined}
            data-happy-desktop-ui="cloud-connect-screen"
            onAnimationEnd={(event) => {
                // Only the sheet's own motion; the pages inside dissolve too.
                if (closing && event.target === event.currentTarget) onClose();
            }}
            // Esc leaves from every state, wherever focus is: a waiting step
            // has nothing focused inside the screen to hear the key.
            ref={(element) => {
                if (!element) return;
                const document = element.ownerDocument;
                const keyDown = (event: KeyboardEvent) => {
                    if (event.key !== "Escape" || event.defaultPrevented) return;
                    event.preventDefault();
                    dismiss();
                };
                document.addEventListener("keydown", keyDown);
                return () => document.removeEventListener("keydown", keyDown);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Happy Cloud"
        >
            {(() => {
                switch (view.kind) {
                    case "choose":
                        return (
                            <SetupPage
                                {...frame}
                                className="happy-cloud-connect happy-cloud-connect--plans"
                                copy="Run agents somewhere other than this computer."
                                placement="centered"
                                {...(view.error ? { status: { label: view.error } } : {})}
                                title="Add to Happy"
                            >
                                <div className="happy-cloud-connect__plans">
                                    {PLANS.map((plan) => (
                                        <article
                                            className="happy-cloud-connect__plan"
                                            data-happy-desktop-ui="cloud-connect-plan"
                                            key={plan.id}
                                        >
                                            <LottieScene
                                                className="happy-cloud-connect__plan-scene"
                                                name={plan.scene}
                                                replayLabel={plan.title}
                                                size={64}
                                                style={{ marginInlineStart: plan.sceneInset - 4 }}
                                            />
                                            <span className="happy-cloud-connect__plan-audience">
                                                {plan.audience}
                                            </span>
                                            <h2 className="happy-cloud-connect__plan-title">
                                                {plan.title}
                                            </h2>
                                            <p className="happy-cloud-connect__plan-detail">
                                                {plan.detail}
                                            </p>
                                            <ul className="happy-cloud-connect__plan-features">
                                                {plan.features.map((feature) => (
                                                    <li key={feature}>
                                                        <Ionicon name="checkmark" size={14} />
                                                        <span>{feature}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <Button
                                                className="happy-cloud-connect__plan-action"
                                                disabled={
                                                    view.asking !== undefined &&
                                                    view.asking !== plan.id
                                                }
                                                loading={view.asking === plan.id}
                                                variant={plan.recommended ? "primary" : "secondary"}
                                                onClick={() =>
                                                    plan.id === "cloud"
                                                        ? props.onCloudOpen()
                                                        : props.onAgentAdd(plan.id)
                                                }
                                            >
                                                {plan.action}
                                            </Button>
                                        </article>
                                    ))}
                                </div>
                            </SetupPage>
                        );
                    case "welcome": {
                        const test = view.testSignIn;
                        return (
                            <WelcomeScreen
                                actionAutoFocus={!test}
                                actionDisabled={test?.busy}
                                actionLabel="Continue"
                                appearance={props.appearance}
                                backdrop={{ kind: "sky" }}
                                className="happy-cloud-connect happy-cloud-connect--welcome"
                                data-testid="cloud-connect"
                                onAction={props.onContinue}
                                onArtPress={props.onLogoPress}
                                secondaryAction={{
                                    label: "Back",
                                    onAction: props.onBack,
                                    ...(test?.busy ? { disabled: true } : {}),
                                }}
                                slides={CLOUD_SLIDES}
                            >
                                {test ? (
                                    <div className="happy-cloud-connect__column">
                                        <TextField
                                            aria-label="Login"
                                            autoFocus
                                            className="happy-cloud-connect__handle"
                                            disabled={test.busy}
                                            fullWidth
                                            onSubmit={props.onTestSignIn}
                                            onValueChange={props.onTestLoginChange}
                                            placeholder="Login"
                                            size="large"
                                            value={test.login}
                                        />
                                        <TextField
                                            aria-label="Password"
                                            autoComplete="off"
                                            className="happy-cloud-connect__handle"
                                            disabled={test.busy}
                                            fullWidth
                                            onSubmit={props.onTestSignIn}
                                            onValueChange={props.onTestPasswordChange}
                                            placeholder="Password"
                                            size="large"
                                            type="password"
                                            value={test.password}
                                        />
                                        <p
                                            className="happy-cloud-connect__hint"
                                            data-tone={test.error ? "attention" : undefined}
                                            role="status"
                                        >
                                            {test.error}
                                        </p>
                                        <div className="happy-cloud-connect__links">
                                            <Button
                                                disabled={
                                                    test.login.trim() === "" || test.password === ""
                                                }
                                                loading={test.busy}
                                                onClick={props.onTestSignIn}
                                                variant="secondary"
                                            >
                                                Sign in with a test account
                                            </Button>
                                        </div>
                                    </div>
                                ) : undefined}
                            </WelcomeScreen>
                        );
                    }
                    case "signingIn":
                        return (
                            <SetupPage
                                {...frame}
                                copy="Sign in or create an account in your browser, then come back here."
                                scene="closed-lock"
                                secondary={{ label: "Cancel", onSelect: dismiss }}
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
                                {...(view.back ? { secondary: back(view.busy) } : {})}
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
                                secondary={{ label: "Cancel", onSelect: dismiss }}
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
                                {...(view.notKept
                                    ? {
                                          status: {
                                              label: "This computer can’t keep sign-ins, so you’ll sign in again after a restart.",
                                          },
                                      }
                                    : {})}
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
                                title="Couldn’t connect"
                            />
                        );
                }
            })()}
            <Button
                aria-label="Close"
                className="happy-cloud-connect__close"
                icon="close"
                iconOnly
                onClick={dismiss}
                variant="ghost"
            />
        </div>
    );
}
