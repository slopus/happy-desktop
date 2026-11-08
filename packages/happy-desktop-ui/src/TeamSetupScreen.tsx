import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { SetupPage, type SetupPageProps } from "./SetupPage";
import { TextField } from "./TextField";
import type { ThemeMode } from "./ThemeScope";
import { thumbhashDataUrl } from "./thumbhashDataUrl";

/** One Happy Cloud team the person belongs to. */
export interface TeamSetupTeam {
    readonly id: string;
    /** The team's own name for itself: the row's title. */
    readonly displayName: string;
    /** The team's handle, shown under its title as `@name`. */
    readonly name: string;
    /**
     * The team's picture. The ThumbHash is painted at once and the bytes
     * over it once `url` is known. Absent: the generated initials tile.
     */
    readonly image?: { readonly thumbhash: string; readonly url?: string };
}

/** What the accounts service said about a new team's name. */
export type TeamSetupAvailability =
    | "idle"
    | "checking"
    | "available"
    | "taken"
    | "reserved"
    | "invalid";

/** What the accounts service said about the team an invite is for. */
export type TeamSetupTeamCheck = "idle" | "checking" | "found" | "unknown" | "invalid";

/** The way in the person chose: a team of their own, or one they were invited to. */
export type TeamSetupPath = "create" | "join";

/**
 * Where the frame stands. Creating, joining and opening are said on the page
 * that started them, so a step never swaps itself for a waiting screen.
 */
export type TeamSetupView =
    | {
          /** Happy Cloud's sign-in is open in the browser. */
          readonly kind: "signingIn";
          readonly path: TeamSetupPath;
          /**
           * The last sign-in didn't land: the browser never came back with it,
           * or Happy Cloud couldn't be reached to start it.
           */
          readonly setback?: "unfinished" | "unreachable";
          /**
           * Test-account sign-in, revealed by pressing the picture ten times
           * in a row. Absent, nothing of it is drawn or announced.
           */
          readonly testSignIn?: {
              readonly login: string;
              readonly password: string;
              readonly busy?: boolean;
              readonly error?: string;
          };
      }
    | {
          /** D3c: the new team's name, checked as it is typed. */
          readonly kind: "create";
          readonly name: string;
          readonly availability: TeamSetupAvailability;
          /** The teams this account is already on. */
          readonly teams: readonly TeamSetupTeam[];
          /** Creating the team, then opening it. */
          readonly stage?: "creating" | "opening";
          /** Why the last press didn't create it, under the field. */
          readonly setback?: "taken" | "unreachable" | { readonly message: string };
      }
    | {
          /** D3j, or D3t while the account is already on teams. */
          readonly kind: "join";
          readonly name: string;
          readonly team: TeamSetupTeamCheck;
          readonly code: string;
          /** The teams this account is already on; with any, the page is "Your teams". */
          readonly teams: readonly TeamSetupTeam[];
          /** Joining the team, then opening it. */
          readonly stage?: "joining" | "opening";
          /** A listed team being opened, by ID. */
          readonly opening?: string;
          /** Why the last press didn't join, under the field it is about. */
          readonly setback?: "code" | "unreachable" | { readonly message: string };
      }
    | {
          /** D5's setback: the team exists, and this window couldn't open it. */
          readonly kind: "openFailed";
          readonly path: TeamSetupPath;
          readonly team: TeamSetupTeam;
      };

export interface TeamSetupScreenProps {
    readonly appearance: ThemeMode;
    readonly view: TeamSetupView;
    /**
     * `window` fills the window during first-run onboarding: nothing is under
     * it to go back to, so Esc does nothing. `dialog` opens over the app from
     * the rail's "+", and Esc closes it.
     */
    readonly presentation: "window" | "dialog";
    /** Back, and Esc over the app: the frame closes. */
    onClose(): void;
    /** Try again after a sign-in setback, and "Open the page again". */
    onSignInAgain(): void;
    onPathChange(path: TeamSetupPath): void;
    onCreateNameChange(name: string): void;
    onCreate(): void;
    onJoinNameChange(name: string): void;
    onJoinCodeChange(code: string): void;
    onJoin(): void;
    /** A team the account is already on, by ID. */
    onTeamOpen(id: string): void;
    /** Try again after a team couldn't be opened. */
    onOpenRetry(): void;
    /** Back from a team that couldn't be opened, to the page that opened it. */
    onOpenBack(): void;
    onPicturePress(): void;
    onTestLoginChange(login: string): void;
    onTestPasswordChange(password: string): void;
    onTestSignIn(): void;
}

function availabilityHint(availability: TeamSetupAvailability, name: string): string | undefined {
    switch (availability) {
        case "idle":
            return undefined;
        case "checking":
            return "Checking…";
        case "available":
            return `@${name} is available.`;
        case "taken":
            return `@${name} is taken. Try another.`;
        case "reserved":
            return `@${name} is reserved. Try another.`;
        case "invalid":
            return "Use 3 to 32 lowercase letters, numbers, or hyphens.";
    }
}

function teamHint(team: TeamSetupTeamCheck, name: string): string | undefined {
    switch (team) {
        case "idle":
            return undefined;
        case "checking":
            return "Checking…";
        case "found":
            return `Found @${name}.`;
        case "unknown":
            return `No team is called @${name}. Check the spelling.`;
        case "invalid":
            return "Team names use 3 to 32 lowercase letters, numbers, or hyphens.";
    }
}

function TeamSetupTeamImage(props: { readonly team: TeamSetupTeam }) {
    const { image } = props.team;
    if (!image)
        return (
            <Avatar
                initials={props.team.displayName.slice(0, 1).toUpperCase()}
                size="lg"
                style={{ width: 44, height: 44, borderRadius: 10 }}
                type="agent"
            />
        );
    const placeholder = thumbhashDataUrl(image.thumbhash);
    return (
        <img
            alt=""
            className="happy-team-setup__image"
            data-size={44}
            draggable={false}
            src={image.url}
            style={placeholder ? { backgroundImage: `url(${placeholder})` } : undefined}
        />
    );
}

/** The line kept under a field whether or not it says anything, so typing never moves the page. */
function Hint(props: { readonly text: string | undefined; readonly attention: boolean }) {
    return (
        <p
            className="happy-team-setup__hint"
            data-tone={props.attention ? "attention" : undefined}
            role="status"
        >
            {props.text}
        </p>
    );
}

/**
 * C-341 TeamSetupScreen — creating or joining a Happy Cloud team, on the
 * onboarding sky: Happy Cloud's sign-in in the browser (D2), naming a new team
 * (D3c), entering an invite (D3j), or the teams the account is already on
 * (D3t). Creating, joining and opening are statuses on the page that started
 * them, and a team that can't be opened says so (D5). Each state is one
 * `SetupPage`, so titles, content and actions keep their places as it moves.
 *
 * During first-run onboarding it fills the window; from the rail's "+" it is
 * a dialog over the app that Esc closes. Props only.
 */
export function TeamSetupScreen(props: TeamSetupScreenProps) {
    const { view, onClose } = props;
    const dialog = props.presentation === "dialog";
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-team-setup",
        "data-testid": "team-setup",
        transitionKey: `${view.kind}${view.kind === "signingIn" && view.setback ? "-setback" : ""}`,
    } as const satisfies Partial<SetupPageProps>;
    const back = (disabled?: boolean) => ({
        label: "Back",
        onSelect: onClose,
        ...(disabled ? { disabled } : {}),
    });
    const page = (() => {
        switch (view.kind) {
            case "signingIn": {
                const test = view.testSignIn;
                const testFields = test ? (
                    <div className="happy-team-setup__column">
                        <TextField
                            aria-label="Login"
                            autoFocus
                            className="happy-team-setup__handle"
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
                            className="happy-team-setup__handle"
                            disabled={test.busy}
                            fullWidth
                            onSubmit={props.onTestSignIn}
                            onValueChange={props.onTestPasswordChange}
                            placeholder="Password"
                            size="large"
                            type="password"
                            value={test.password}
                        />
                        <Hint attention={test.error !== undefined} text={test.error} />
                        <div className="happy-team-setup__links">
                            <Button
                                disabled={test.login.trim() === "" || test.password === ""}
                                loading={test.busy}
                                onClick={props.onTestSignIn}
                                variant="secondary"
                            >
                                Sign in with a test account
                            </Button>
                        </div>
                    </div>
                ) : undefined;
                if (view.setback)
                    return (
                        <SetupPage
                            {...frame}
                            action={{
                                autoFocus: !test,
                                label: "Try again",
                                onSelect: props.onSignInAgain,
                            }}
                            copy={
                                view.setback === "unfinished"
                                    ? "We didn’t hear back from your browser. Try again, and finish signing in there."
                                    : "Check your connection and try again."
                            }
                            onScenePress={props.onPicturePress}
                            scene="closed-lock"
                            secondary={back()}
                            title={
                                view.setback === "unfinished"
                                    ? "Sign-in didn’t finish"
                                    : "Couldn’t reach Happy Cloud"
                            }
                        >
                            {testFields}
                        </SetupPage>
                    );
                return (
                    <SetupPage
                        {...frame}
                        copy="Happy Cloud’s sign-in is open in your browser. Sign in or create an account there, then come back here. If you use email, we’ll send you a 6-digit code to confirm it."
                        onScenePress={props.onPicturePress}
                        scene="closed-lock"
                        secondary={back()}
                        status={{ busy: true, label: "Waiting for your browser…" }}
                        title={
                            view.path === "create"
                                ? "Sign in to create your team"
                                : "Sign in to join your team"
                        }
                    >
                        {testFields ?? (
                            <div className="happy-team-setup__links">
                                <Button onClick={props.onSignInAgain} variant="ghost">
                                    Open the page again
                                </Button>
                            </div>
                        )}
                    </SetupPage>
                );
            }
            case "create": {
                const busy = view.stage !== undefined;
                const setback = view.setback;
                const hint =
                    setback === "taken"
                        ? `@${view.name} was just taken. Try another.`
                        : setback === "unreachable"
                          ? `Couldn’t create @${view.name}. Check your connection and try again.`
                          : setback !== undefined
                            ? setback.message
                            : availabilityHint(view.availability, view.name);
                const [first, ...others] = view.teams;
                return (
                    <SetupPage
                        {...frame}
                        action={{
                            busy,
                            disabled: view.availability !== "available" || setback === "taken",
                            label:
                                view.stage === "creating"
                                    ? `Creating @${view.name}…`
                                    : view.stage === "opening"
                                      ? `Opening @${view.name}…`
                                      : setback === "unreachable"
                                        ? "Try again"
                                        : "Create team",
                            onSelect: props.onCreate,
                        }}
                        copy="This is your team’s address in Happy Cloud. Teammates join with it, so pick a name they’ll recognize."
                        scene="hatching-chick"
                        secondary={back(busy)}
                        title="Name your team"
                    >
                        <div className="happy-team-setup__column">
                            <TextField
                                aria-label="Team name"
                                autoFocus
                                className="happy-team-setup__handle"
                                disabled={busy}
                                fullWidth
                                leadingText="@"
                                onSubmit={props.onCreate}
                                onValueChange={props.onCreateNameChange}
                                placeholder="acme"
                                size="large"
                                value={view.name}
                            />
                            <Hint
                                attention={
                                    setback !== undefined ||
                                    view.availability === "taken" ||
                                    view.availability === "reserved" ||
                                    view.availability === "invalid"
                                }
                                text={hint}
                            />
                            {first ? (
                                <div className="happy-team-setup__aside">
                                    <span className="happy-team-setup__aside-text">
                                        {others.length === 0
                                            ? `You’re already on @${first.name}.`
                                            : `You’re already on ${String(view.teams.length)} teams.`}
                                    </span>
                                    <Button
                                        disabled={busy}
                                        onClick={() =>
                                            others.length === 0
                                                ? props.onTeamOpen(first.id)
                                                : props.onPathChange("join")
                                        }
                                        size="small"
                                        variant="secondary"
                                    >
                                        {others.length === 0 ? `Open @${first.name}` : "Your teams"}
                                    </Button>
                                </div>
                            ) : null}
                            <div className="happy-team-setup__links">
                                <Button
                                    disabled={busy}
                                    onClick={() => props.onPathChange("join")}
                                    variant="ghost"
                                >
                                    Have an invite? Join a team instead
                                </Button>
                            </div>
                        </div>
                    </SetupPage>
                );
            }
            case "join": {
                const busy = view.stage !== undefined || view.opening !== undefined;
                const setback = view.setback;
                const listed = view.teams.length > 0;
                const codeHint =
                    setback === "code"
                        ? `That code doesn’t match an invite for @${view.name}. Check it, or ask whoever invited you for a new one.`
                        : setback === "unreachable"
                          ? `Couldn’t join @${view.name}. Check your connection and try again.`
                          : setback !== undefined
                            ? setback.message
                            : undefined;
                const opening = view.teams.find((team) => team.id === view.opening);
                return (
                    <SetupPage
                        {...frame}
                        action={{
                            busy: view.stage !== undefined,
                            // A check that couldn't be made leaves the join to say.
                            disabled:
                                view.opening !== undefined ||
                                view.name === "" ||
                                view.code === "" ||
                                view.team === "unknown" ||
                                view.team === "invalid" ||
                                setback === "code",
                            label:
                                view.stage === "joining"
                                    ? `Joining @${view.name}…`
                                    : view.stage === "opening"
                                      ? `Opening @${view.name}…`
                                      : setback === "unreachable"
                                        ? "Try again"
                                        : "Join team",
                            onSelect: props.onJoin,
                        }}
                        copy={
                            listed
                                ? "You’re already on these teams. Open one, or join another with an invite."
                                : "Your teammate sent you the team’s name and an invite code."
                        }
                        scene="open-hands"
                        secondary={back(busy)}
                        {...(opening
                            ? { status: { busy: true, label: `Opening @${opening.name}…` } }
                            : {})}
                        title={listed ? "Your teams" : "Enter your invite"}
                    >
                        <div className="happy-team-setup__column">
                            {listed ? (
                                <div className="happy-team-setup__teams">
                                    {view.teams.map((team) => (
                                        <button
                                            className="happy-team-setup__team"
                                            disabled={busy}
                                            key={team.id}
                                            onClick={() => props.onTeamOpen(team.id)}
                                            type="button"
                                        >
                                            <TeamSetupTeamImage team={team} />
                                            <span className="happy-team-setup__team-text">
                                                <span className="happy-team-setup__team-name">
                                                    {team.displayName}
                                                </span>
                                                <span className="happy-team-setup__team-detail">
                                                    @{team.name}
                                                </span>
                                            </span>
                                            <span className="happy-team-setup__team-open">
                                                Open
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                            {listed ? (
                                <h2 className="happy-team-setup__heading">Join another team</h2>
                            ) : null}
                            <TextField
                                aria-label="Team"
                                autoFocus={!listed}
                                className="happy-team-setup__handle"
                                disabled={busy}
                                fullWidth
                                leadingText="@"
                                onSubmit={props.onJoin}
                                onValueChange={props.onJoinNameChange}
                                placeholder="acme"
                                size="large"
                                value={view.name}
                            />
                            <Hint
                                attention={view.team === "unknown" || view.team === "invalid"}
                                text={teamHint(view.team, view.name)}
                            />
                            <TextField
                                aria-label="Invite code"
                                autoComplete="off"
                                className="happy-team-setup__handle"
                                disabled={busy}
                                fullWidth
                                onSubmit={props.onJoin}
                                onValueChange={props.onJoinCodeChange}
                                placeholder="Invite code"
                                size="large"
                                value={view.code}
                            />
                            <Hint
                                attention={codeHint !== undefined}
                                text={
                                    codeHint ??
                                    "Invite codes work for 7 days. If yours doesn’t, ask for a new one."
                                }
                            />
                            <div className="happy-team-setup__links">
                                <Button
                                    disabled={busy}
                                    onClick={() => props.onPathChange("create")}
                                    variant="ghost"
                                >
                                    Want your own team? Create one instead
                                </Button>
                            </div>
                        </div>
                    </SetupPage>
                );
            }
            case "openFailed":
                return (
                    <SetupPage
                        {...frame}
                        action={{
                            autoFocus: true,
                            label: "Try again",
                            onSelect: props.onOpenRetry,
                        }}
                        copy={`We couldn’t reach @${view.team.name} just now. Check your connection and try again.`}
                        scene="snail"
                        secondary={{ label: "Back", onSelect: props.onOpenBack }}
                        title={`Couldn’t open @${view.team.name}`}
                    />
                );
        }
    })();
    return (
        <div
            className="happy-team-setup__window"
            data-happy-desktop-ui="team-setup-screen"
            data-presentation={props.presentation}
            // Over the app, Esc leaves from every state, wherever focus is: a
            // waiting step has nothing focused inside the screen to hear the key.
            ref={(element) => {
                if (!element || !dialog) return;
                const document = element.ownerDocument;
                const keyDown = (event: KeyboardEvent) => {
                    if (event.key !== "Escape" || event.defaultPrevented) return;
                    event.preventDefault();
                    onClose();
                };
                document.addEventListener("keydown", keyDown);
                return () => document.removeEventListener("keydown", keyDown);
            }}
            {...(dialog
                ? { role: "dialog", "aria-modal": true, "aria-label": "Happy Cloud" }
                : { role: "main", "aria-label": "Set up your team" })}
        >
            {page}
        </div>
    );
}
