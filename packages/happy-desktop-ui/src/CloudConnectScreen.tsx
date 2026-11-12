import { useState } from "react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { SetupDrift } from "./SetupDrift";
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

/** Where joining one of the account's servers stands: on its row's button. */
export type CloudConnectJoin = "joining" | "joined";

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
           * Opened straight from the start page: Back returns to it, and
           * there is no close button.
           */
          readonly start?: true;
          /** The shell can sign in by a code sent to the person's email: offered under the deck. */
          readonly emailSignIn?: true;
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
    /** Signing in without the browser: the email a code goes to. */
    | {
          readonly kind: "email";
          readonly email: string;
          readonly busy?: boolean;
          readonly error?: string;
          /** Seconds until Happy Cloud takes another try, after too many. */
          readonly wait?: number;
      }
    /** The code Happy Cloud emailed, typed in to finish signing in. */
    | {
          readonly kind: "emailCode";
          readonly email: string;
          readonly code: string;
          readonly busy?: boolean;
          /** A fresh code is being asked for. */
          readonly resending?: boolean;
          /** A fresh code was just sent. */
          readonly resent?: true;
          /** Seconds until Resend is offered again; 0 once it is. */
          readonly resendIn: number;
          readonly error?: string;
          /** Seconds until Happy Cloud takes another try, after too many. */
          readonly wait?: number;
      }
    | {
          readonly kind: "servers";
          readonly servers:
              | { readonly status: "loading" }
              | { readonly status: "ready"; readonly servers: readonly CloudConnectServer[] }
              | { readonly status: "error"; readonly message: string };
          /**
           * Servers joined from here, or being joined, by ID. Several can be
           * joined at once; Continue appears once one is in.
           */
          readonly joins: ReadonlyMap<string, CloudConnectJoin>;
          readonly error?: string;
      }
    | {
          readonly kind: "create";
          readonly name: string;
          readonly availability: CloudConnectAvailability;
          /**
           * The account already has servers to go back to; otherwise create
           * leads, and Back leaves the account for the welcome.
           */
          readonly back: boolean;
          readonly busy?: boolean;
          readonly error?: string;
      }
    /** Signing in to the chosen server; once in, the screen is gone. */
    | { readonly kind: "connecting"; readonly server: CloudConnectServer }
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
    /** A server row's Join. */
    onServerPick(id: string): void;
    /** Continue, once a server is joined: into the app. */
    onServersContinue(): void;
    onCreateOpen(): void;
    /**
     * From create back to the servers; from the servers or a first
     * server back to the welcome, signed out so Continue can use another
     * account; and from signing in or a failure back to the welcome.
     */
    onBack(): void;
    onCreateNameChange(name: string): void;
    onCreate(): void;
    onLogoPress(): void;
    onTestLoginChange(login: string): void;
    onTestPasswordChange(password: string): void;
    onTestSignIn(): void;
    /** The welcome's Continue with email. */
    onEmailOpen(): void;
    onEmailChange(email: string): void;
    /** Sends a code to the email typed in. */
    onEmailCodeSend(): void;
    onEmailCodeChange(code: string): void;
    /** Signs in with the code typed in. */
    onEmailCodeVerify(): void;
    onEmailCodeResend(): void;
    /** From the code back to the email, to send the code somewhere else. */
    onEmailChangeOpen(): void;
}

/** `m:ss`, the way a countdown reads. */
function countdown(seconds: number): string {
    return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

/** A refusal, with how long is left to wait when Happy Cloud asked for that. */
function emailHint(error: string | undefined, wait: number | undefined): string | undefined {
    if (error === undefined) return undefined;
    return wait ? `${error} Try again in ${countdown(wait)}.` : error;
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
                // The same placeholder the server wears in the rail.
                placeholderSeed={props.server.name}
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
        art: { kind: "cloud" },
        copy: "A hardened, high-performance control plane for your agents, hosted by Happy.",
        id: "cloud",
        title: "Happy Cloud",
    },
    {
        art: { kind: "scene", name: "robot" },
        copy: "Happy Cloud helps you unlock running any number of agents, unattended.",
        id: "scale",
        title: "Built for lots of agents",
    },
    {
        art: { kind: "scene", name: "closed-lock" },
        copy: "Decide what every agent can see and do, and keep each one isolated.",
        id: "permissions",
        title: "Programmable permissions",
    },
    {
        art: { kind: "scene", name: "sparkles" },
        copy: "Never locked into someone else's compute. Use ours or yours, and source tokens and RAM from anywhere.",
        id: "yours",
        title: "No lock-in",
    },
    {
        art: { kind: "scene", name: "open-hands" },
        copy: "We share every line of Happy Cloud with select customers and security companies to review.",
        id: "source",
        title: "Private open source",
    },
];

/** What drifts beside the Cloud's slides, the way it does beside the phone's. */
const CLOUD_DRIFT = [
    "cloud-variation",
    "robot",
    "sparkles",
    "llama",
    "closed-lock",
    "tree",
] as const;

/**
 * C-336 CloudConnectScreen — the sidebar's "+", full window on the onboarding
 * sky. It opens on what to add: a personal remote agent or a shared team agent,
 * which it hands to the Chief of Staff to set up, or Happy Cloud: welcome, account sign-in in the browser, the account's
 * servers, join or create one, then signing in to it, after which the app is
 * simply there with the new server open. Each state is one
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
                                decoration={<SetupDrift scenes={CLOUD_DRIFT} />}
                                className="happy-cloud-connect happy-cloud-connect--welcome"
                                data-testid="cloud-connect"
                                onAction={props.onContinue}
                                onArtPress={props.onLogoPress}
                                secondaryAction={{
                                    label: "Back",
                                    // The welcome is the first step: Back sinks the
                                    // sheet onto the start page or the app.
                                    onAction: dismiss,
                                    ...(test?.busy ? { disabled: true } : {}),
                                }}
                                slides={CLOUD_SLIDES}
                            >
                                {view.emailSignIn && !test ? (
                                    <div className="happy-cloud-connect__links">
                                        <Button onClick={props.onEmailOpen} variant="ghost">
                                            Continue with email
                                        </Button>
                                    </div>
                                ) : null}
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
                                secondary={{ label: "Cancel", onSelect: props.onBack }}
                                status={{ busy: true, label: "Waiting for your browser…" }}
                                title="Signing in"
                            />
                        );
                    case "email":
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    busy: view.busy,
                                    disabled: view.email.trim() === "" || Boolean(view.wait),
                                    label: "Send code",
                                    onSelect: props.onEmailCodeSend,
                                }}
                                copy="Enter your email and we’ll send you a code to sign in."
                                placement="centered"
                                secondary={back(view.busy)}
                                title="Continue with email"
                            >
                                <div className="happy-cloud-connect__column">
                                    <TextField
                                        aria-label="Email"
                                        autoComplete="email"
                                        autoFocus
                                        className="happy-cloud-connect__handle"
                                        disabled={view.busy}
                                        fullWidth
                                        inputMode="email"
                                        onSubmit={props.onEmailCodeSend}
                                        onValueChange={props.onEmailChange}
                                        placeholder="you@example.com"
                                        size="large"
                                        type="email"
                                        value={view.email}
                                    />
                                    <p
                                        className="happy-cloud-connect__hint"
                                        data-tone={view.error ? "attention" : undefined}
                                        role="status"
                                    >
                                        {emailHint(view.error, view.wait)}
                                    </p>
                                </div>
                            </SetupPage>
                        );
                    case "emailCode": {
                        const waiting = Boolean(view.wait);
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    busy: view.busy,
                                    disabled: view.code.trim() === "" || waiting,
                                    label: "Sign in",
                                    onSelect: props.onEmailCodeVerify,
                                }}
                                copy={
                                    <>
                                        Enter the code we sent to{" "}
                                        <strong className="happy-cloud-connect__email">
                                            {view.email}
                                        </strong>
                                        .
                                    </>
                                }
                                placement="centered"
                                secondary={back(view.busy)}
                                title="Check your email"
                            >
                                <div className="happy-cloud-connect__column">
                                    <TextField
                                        aria-label="Code"
                                        autoComplete="one-time-code"
                                        autoFocus
                                        className="happy-cloud-connect__handle happy-cloud-connect__code"
                                        disabled={view.busy}
                                        fullWidth
                                        inputMode="numeric"
                                        name="one-time-code"
                                        onSubmit={props.onEmailCodeVerify}
                                        onValueChange={props.onEmailCodeChange}
                                        placeholder="Code"
                                        size="large"
                                        value={view.code}
                                    />
                                    <p
                                        className="happy-cloud-connect__hint"
                                        data-tone={view.error ? "attention" : undefined}
                                        role="status"
                                    >
                                        {emailHint(view.error, view.wait) ??
                                            (view.resent ? "We sent you a new code." : undefined)}
                                    </p>
                                    <div className="happy-cloud-connect__links">
                                        <Button
                                            disabled={view.busy || view.resendIn > 0 || waiting}
                                            loading={view.resending}
                                            onClick={props.onEmailCodeResend}
                                            variant="ghost"
                                        >
                                            {view.resendIn > 0
                                                ? `Resend code in ${countdown(view.resendIn)}`
                                                : "Resend code"}
                                        </Button>
                                        <Button
                                            disabled={view.busy}
                                            onClick={props.onEmailChangeOpen}
                                            variant="ghost"
                                        >
                                            Change email
                                        </Button>
                                    </div>
                                </div>
                            </SetupPage>
                        );
                    }
                    case "servers": {
                        const joins = [...view.joins.values()];
                        return (
                            <SetupPage
                                {...frame}
                                {...(joins.includes("joined")
                                    ? {
                                          action: {
                                              label: "Continue",
                                              onSelect: props.onServersContinue,
                                          },
                                      }
                                    : {})}
                                copy="Your account is already on these servers. Join as many as you like. Got an invite? Open its link, and its server appears here."
                                placement="centered"
                                secondary={back(joins.includes("joining"))}
                                {...(view.servers.status === "loading"
                                    ? { status: { busy: true, label: "Loading your servers…" } }
                                    : view.servers.status === "error"
                                      ? { status: { label: view.servers.message } }
                                      : view.error
                                        ? { status: { label: view.error } }
                                        : {})}
                                title="Join a server"
                            >
                                <div className="happy-cloud-connect__column">
                                    {view.servers.status === "ready" ? (
                                        <div className="happy-cloud-connect__servers">
                                            {view.servers.servers.map((server, index) => {
                                                const join = view.joins.get(server.id);
                                                return (
                                                    <div
                                                        className="happy-cloud-connect__server"
                                                        data-happy-desktop-ui="cloud-connect-server"
                                                        key={server.id}
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
                                                        <Button
                                                            aria-label={`Join ${server.displayName}`}
                                                            // eslint-disable-next-line jsx-a11y/no-autofocus -- the first server is where a keyboard starts on this screen
                                                            autoFocus={index === 0}
                                                            disabled={join === "joined"}
                                                            {...(join === "joined"
                                                                ? { icon: "check" as const }
                                                                : {})}
                                                            loading={join === "joining"}
                                                            onClick={() =>
                                                                props.onServerPick(server.id)
                                                            }
                                                            variant={
                                                                join === "joined"
                                                                    ? "ghost"
                                                                    : "secondary"
                                                            }
                                                            width={104}
                                                        >
                                                            {join === "joined" ? "Joined" : "Join"}
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                    <div className="happy-cloud-connect__links">
                                        <Button
                                            icon="plus"
                                            onClick={props.onCreateOpen}
                                            variant="ghost"
                                        >
                                            Bootstrap a new one
                                        </Button>
                                    </div>
                                </div>
                            </SetupPage>
                        );
                    }
                    case "create": {
                        const hint = view.error ?? availabilityHint(view.availability, view.name);
                        return (
                            <SetupPage
                                {...frame}
                                action={{
                                    busy: view.busy,
                                    disabled: view.availability !== "available",
                                    label: "Bootstrap",
                                    onSelect: props.onCreate,
                                }}
                                copy={
                                    view.back
                                        ? "Name your team’s new server. You can change it later."
                                        : "Your account has no servers yet. Name your team’s first one, or open an invite link you were sent."
                                }
                                placement="centered"
                                secondary={back(view.busy)}
                                title="Bootstrap a server"
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
                                </div>
                            </SetupPage>
                        );
                    }
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
                                secondary={back()}
                                title="Couldn’t connect"
                            />
                        );
                }
            })()}
            {view.kind === "welcome" && view.start ? null : (
                <Button
                    aria-label="Close"
                    className="happy-cloud-connect__close"
                    icon="close"
                    iconOnly
                    onClick={dismiss}
                    variant="ghost"
                />
            )}
        </div>
    );
}
