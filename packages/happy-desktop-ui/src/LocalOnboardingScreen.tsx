import { type AssistantMarkName } from "./AssistantMark";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";
import {
    DesktopMobileSetup,
    MobileAppCopy,
    type DesktopMobileSetupStep,
} from "./DesktopMobileSetup";
import { MenuButton } from "./MenuButton";
import { OnboardingSteps, type OnboardingStage } from "./OnboardingSteps";
import { QRCode } from "./QRCode";
import {
    SetupAssistants,
    type SetupAssistantAction,
    type SetupAssistantEntry,
} from "./SetupAssistants";
import { SetupPage, type SetupPageProgress, type SetupPageStatus } from "./SetupPage";
import { TextField } from "./TextField";
import type { ThemeMode } from "./ThemeScope";

/** The coding assistants Happy looks for, and nothing beyond them. */
export type LocalOnboardingAssistantId = "claude" | "codex" | "grok";

/**
 * One of them as the machine answered for it: the command is here, or it is
 * not. Whether a command that is here can actually run is the connected Happy Agent's
 * answer rather than the shell's, and the screen showing this carries it.
 */
export interface LocalOnboardingAssistant {
    readonly id: LocalOnboardingAssistantId;
    /** What the daemon proved about the currently configured local credential. */
    readonly authentication: "checking" | "valid" | "invalid" | "error" | "unavailable";
    readonly status: "found" | "missing";
    /** Where the machine keeps it, when it has it. */
    readonly command?: string;
}

/**
 * The Happy Agent archive arriving, while it is arriving. Counted by the
 * process fetching it; absent before the first byte and after the last.
 */
export interface LocalOnboardingDownload {
    readonly receivedBytes: number;
    readonly totalBytes: number;
}

export type LocalOnboardingAgentSetupPhase =
    | { readonly kind: "preparing" }
    | { readonly download?: LocalOnboardingDownload; readonly kind: "downloading" }
    | { readonly kind: "retrying"; readonly message: string }
    | { readonly kind: "ready"; readonly version: string }
    | { readonly kind: "starting" };

export type LocalOnboardingView =
    | { readonly kind: "happy-mobile-desktop"; readonly step: DesktopMobileSetupStep }
    | { readonly kind: "checking"; readonly message?: string }
    | { readonly kind: "node-missing" }
    | {
          readonly kind: "agent-setup";
          readonly message?: string;
          readonly phase: LocalOnboardingAgentSetupPhase;
      }
    | { readonly kind: "connecting" }
    | { readonly kind: "connect-failed"; readonly message: string; readonly retrying: boolean }
    | {
          /**
           * Binary discovery followed by daemon-owned inference verification.
           *
           * Each assistant carries its own answer, and one of them proving out
           * is the whole condition for going on, so there is nothing here about
           * a pass being finished: a second assistant still being checked does
           * not make a subscription that already works any less usable.
           */
          readonly kind: "provider-authentication";
          readonly assistants: readonly LocalOnboardingAssistant[];
      }
    | {
          /**
           * Setup, revisited. Nothing is owed here — it exists so the first
           * step of the sequence is somewhere a person can go back to and see
           * what Happy put on their machine.
           */
          readonly kind: "agent-ready";
          readonly version?: string;
          readonly nodeVersion?: string;
      }
    | { readonly kind: "examining" }
    | {
          readonly busy: boolean;
          readonly email: string;
          readonly kind: "profile-required";
          readonly message?: string;
          readonly name: string;
      }
    | { readonly kind: "happy-mobile-checking" }
    | {
          readonly busy: boolean;
          readonly kind: "happy-mobile-offer";
          readonly message?: string;
      }
    | {
          readonly data: string;
          readonly expiresAt: number;
          readonly kind: "happy-mobile-pairing";
      }
    | {
          readonly busy: boolean;
          readonly kind: "happy-mobile-failed";
          readonly message: string;
      }
    | {
          readonly kind: "finishing";
          readonly busy: boolean;
          readonly message?: string;
      }
    | { readonly kind: "project"; readonly busy: boolean; readonly message?: string };

export interface LocalOnboardingScreenProps {
    readonly showSteps?: boolean;
    readonly appearance: ThemeMode;
    readonly view: LocalOnboardingView;
    /** The furthest step setup has reached, for the bar's own drawing. */
    readonly reachedStage?: OnboardingStage;
    onAssistantsContinue(): void;
    onConnectRetry(): void;
    /** Returns to an earlier step. Absent where stepping back is not offered. */
    onStageSelect?(stage: OnboardingStage): void;
    /** Opens an external page: the host owns how a link leaves the app. */
    onExternalOpen?(url: string): void;
    onHappyMobileConnect(): void;
    onHappyMobileSkip(): void;
    onHappyMobilePlatformSelect?(platform: "ios" | "android"): void;
    onProjectChoose(): void;
    onProjectSetupBack?(): void;
    onProfileNameChange(value: string): void;
    onProfileEmailChange(value: string): void;
    onProfileCreate(): void;
}

/** What a reader is told to run when Happy cannot start their Happy Agent itself. */
const DAEMON_START_COMMAND = "happy-agent start";

/**
 * The download as the button reports it: the counted share and both sizes while
 * an archive is on the way, and an unmeasured wait otherwise.
 *
 * The two ends of a download are genuinely unmeasured rather than zero and one
 * hundred — the release is being looked up, then what arrived is being checked
 * and unpacked — so neither is dressed up as a fraction.
 */
function downloadProgress(download: LocalOnboardingDownload | undefined): SetupPageProgress {
    if (!download || download.totalBytes <= 0) return { kind: "waiting" };
    return {
        detail: `${byteSize(download.receivedBytes)} of ${byteSize(download.totalBytes)}`,
        fraction: download.receivedBytes / download.totalBytes,
        kind: "measured",
    };
}

function agentSetupProgress(phase: LocalOnboardingAgentSetupPhase): SetupPageProgress {
    if (phase.kind === "ready") return { detail: phase.version, fraction: 1, kind: "measured" };
    return phase.kind === "downloading" ? downloadProgress(phase.download) : { kind: "waiting" };
}

/** The whole of setup's status line: what it is doing, as briefly as it can be said. */
function agentSetupStatus(phase: LocalOnboardingAgentSetupPhase): SetupPageStatus {
    switch (phase.kind) {
        case "preparing":
            return { label: "Preparing…", progress: { kind: "waiting" } };
        case "downloading":
            return { label: "Downloading…", progress: downloadProgress(phase.download) };
        case "retrying":
            return { busy: true, label: `${phase.message} Retrying…` };
        case "ready":
        case "starting":
            return { label: "Starting…", progress: agentSetupProgress(phase) };
    }
}

/** A size as someone would say it, at the one decimal a release is worth. */
function byteSize(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pairingExpiration(expiresAt: number): string {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
        expiresAt,
    );
}

/**
 * Each assistant as its column says it: whose mark it carries, the product's
 * name, and the command that name is on this machine.
 *
 * The id is the command, which is why nothing here is looked up twice — but all
 * three are written out separately anyway. What a person is told to install and
 * what they are told to type are not always the same word, and the mark belongs
 * to the company rather than to the command: Codex is OpenAI's, so that is what
 * its mark is called here. Putting the wrong name on somebody else's trademark
 * is not a shortcut worth taking.
 */
const ASSISTANTS: Record<
    LocalOnboardingAssistantId,
    {
        command: string;
        mark: AssistantMarkName;
        name: string;
        /** Where the vendor tells you to get it, when the machine has not. */
        install: string;
        /** What signs you in, taken from each vendor's own documentation. */
        signIn: string;
    }
> = {
    claude: {
        command: "claude",
        install: "https://code.claude.com/docs/en/setup",
        mark: "claude",
        name: "Claude Code",
        signIn: "claude auth login",
    },
    codex: {
        command: "codex",
        install: "https://developers.openai.com/codex/cli",
        mark: "openai",
        name: "Codex",
        signIn: "codex login",
    },
    grok: {
        command: "grok",
        install: "https://docs.x.ai/build/overview",
        mark: "grok",
        name: "Grok",
        // Grok has no login subcommand: running it is the sign-in.
        signIn: "grok",
    },
};

/** Where somebody stuck during first-run setup can go, and to whom. */
const HELP_LINKS = [
    { id: "discord", label: "Ask on Discord", url: "https://discord.gg/fX9WBAhyfD" },
    { id: "bra1n_dump", label: "DM @bra1n_dump on X", url: "https://x.com/bra1n_dump" },
    { id: "ex3ndr", label: "DM @Ex3NDR on X", url: "https://x.com/Ex3NDR" },
    {
        id: "issues",
        label: "Browse known issues",
        url: "https://github.com/slopus/happy/issues",
    },
] as const;

/**
 * One card on the report that follows an install: what is on the machine, and
 * where.
 *
 * A found assistant shows the path the shell gave, because the one question
 * somebody has about a machine that "has" a command is which one it found —
 * two versions on a PATH is the ordinary case, not the exotic one.
 */
function assistantAuthenticationEntry(assistant: LocalOnboardingAssistant): SetupAssistantEntry {
    const vendor = ASSISTANTS[assistant.id];
    const detail = (() => {
        switch (assistant.authentication) {
            case "checking":
                return "Checking…";
            case "valid":
                return "Signed in";
            case "invalid":
                return "Not signed in";
            case "error":
                return "Couldn't check — retrying";
            case "unavailable":
                return "Not installed";
        }
    })();
    // What to do about it: get the thing, or sign in to the thing that is
    // already here. A working assistant is asked for nothing.
    const action: SetupAssistantAction | undefined = (() => {
        switch (assistant.authentication) {
            case "unavailable":
                return {
                    href: vendor.install,
                    kind: "link",
                    label: `Install ${vendor.name} CLI`,
                };
            case "invalid":
                return {
                    command: vendor.signIn,
                    kind: "command",
                };
            case "error":
            case "checking":
            case "valid":
                return undefined;
        }
    })();
    return {
        ...(action ? { action } : {}),
        detail,
        id: assistant.id,
        mark: vendor.mark,
        name: vendor.name,
        status:
            assistant.authentication === "valid"
                ? "found"
                : assistant.authentication === "invalid"
                  ? "signed-out"
                  : assistant.authentication === "unavailable"
                    ? "missing"
                    : "checking",
    };
}

/** The stable, dimmed three-vendor row shown before authentication resolves. */
const CHECKING_ASSISTANTS: readonly SetupAssistantEntry[] = Object.entries(ASSISTANTS).map(
    ([id, assistant]) => ({
        detail: "Checking…",
        id,
        mark: assistant.mark,
        name: assistant.name,
        status: "checking",
    }),
);

interface MachineSetupProjection {
    readonly assistants?: readonly SetupAssistantEntry[];
    readonly copy?: string;
    /** Whether anything found on this machine can actually be used to work. */
    readonly hasValidAuthentication: boolean;
    readonly status?: SetupPageStatus;
    readonly title: string;
}

const SETUP_COPY = "One-time download for this machine.";
const SUBSCRIPTIONS_COPY = "Looking for Claude, Codex, and Grok.";

function machineSetupProject(view: LocalOnboardingView): MachineSetupProjection | undefined {
    if (view.kind === "agent-setup")
        return {
            copy: SETUP_COPY,
            hasValidAuthentication: false,
            status: agentSetupStatus(view.phase),
            title: "Setting up",
        };
    if (view.kind === "connecting")
        return {
            copy: SETUP_COPY,
            hasValidAuthentication: false,
            status: { label: "Starting…", progress: { kind: "waiting" } },
            title: "Setting up",
        };
    if (view.kind === "examining")
        return {
            assistants: CHECKING_ASSISTANTS,
            copy: SUBSCRIPTIONS_COPY,
            hasValidAuthentication: false,
            status: { busy: true, label: "Checking…" },
            title: "Checking subscriptions",
        };
    if (view.kind === "provider-authentication") {
        const valid = view.assistants.some((assistant) => assistant.authentication === "valid");
        const checking = view.assistants.some(
            (assistant) => assistant.authentication === "checking",
        );
        const failed = view.assistants.some((assistant) => assistant.authentication === "error");
        if (valid)
            return {
                assistants: view.assistants.map(assistantAuthenticationEntry),
                hasValidAuthentication: true,
                title: "You're set",
            };
        if (checking || failed)
            return {
                assistants: view.assistants.map(assistantAuthenticationEntry),
                copy: SUBSCRIPTIONS_COPY,
                hasValidAuthentication: false,
                status: { busy: true, label: failed ? "Couldn't check · retrying…" : "Checking…" },
                title: "Checking subscriptions",
            };
        return {
            assistants: view.assistants.map(assistantAuthenticationEntry),
            copy: "One signed-in CLI is required.",
            hasValidAuthentication: false,
            status: { busy: true, label: "Waiting for sign-in…" },
            title: "Sign in to a CLI",
        };
    }
    return undefined;
}

/**
 * First-run setup for this machine, as one machine-setup surface followed by
 * the profile, optional mobile connection, and project decisions it discovers
 * are still owed.
 *
 * Every state is one `SetupPage`: a picture of what is happening, a sentence
 * naming it, a line explaining it, and at most one thing to do. Download,
 * launch, subscription discovery, and automatic verification retain one transition
 * identity so their live progress changes in place instead of becoming a tour
 * of setup pages.
 *
 * Which stage is showing is entirely the caller's, derived from what is true of
 * the machine rather than from a position someone remembered, so an interrupted
 * install or a restart resumes at the truthful stage. This component only draws
 * it.
 */
export function LocalOnboardingScreen(props: LocalOnboardingScreenProps) {
    const { view } = props;
    if (view.kind === "happy-mobile-desktop")
        return (
            <DesktopMobileSetup
                appearance={props.appearance}
                help={<OnboardingHelp onExternalOpen={props.onExternalOpen} />}
                step={view.step}
                onboarding={props.showSteps}
                {...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {})}
                onContinue={props.onHappyMobileConnect}
                onSkip={props.onHappyMobileSkip}
                onPlatformSelect={props.onHappyMobilePlatformSelect}
                onExternalOpen={props.onExternalOpen}
            />
        );
    // Download, start, discovery, and verification are one machine-setup
    // surface. Profile, mobile pairing, and project decisions begin their own
    // pages after that machine work.
    const transitionKey = (() => {
        switch (view.kind) {
            case "profile-required":
            case "project":
            case "finishing":
            case "happy-mobile-checking":
            case "happy-mobile-offer":
            case "happy-mobile-pairing":
            case "happy-mobile-failed":
                return view.kind;
            default:
                return "local-agent-setup";
        }
    })();
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        transitionKey,
        help: <OnboardingHelp onExternalOpen={props.onExternalOpen} />,
        steps: props.showSteps ? (
            <OnboardingSteps
                scope="desktop"
                stage={onboardingStage(view)}
                {...(props.reachedStage ? { reached: props.reachedStage } : {})}
                {...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {})}
                failed={
                    view.kind === "node-missing" ||
                    view.kind === "connect-failed" ||
                    view.kind === "happy-mobile-failed"
                }
            />
        ) : undefined,
    } as const;
    const machineSetup = machineSetupProject(view);

    if (machineSetup)
        return (
            <SetupPage
                {...frame}
                {...(machineSetup.assistants
                    ? {
                          action: {
                              disabled: !machineSetup.hasValidAuthentication,
                              label: "Continue",
                              onSelect: props.onAssistantsContinue,
                          },
                      }
                    : {})}
                className="happy-local-onboarding__machine-setup"
                {...(machineSetup.copy ? { copy: machineSetup.copy } : {})}
                data-testid="local-onboarding-screen"
                scene="owl"
                {...(machineSetup.status ? { status: machineSetup.status } : {})}
                title={machineSetup.title}
            >
                {machineSetup.assistants ? (
                    <SetupAssistants
                        assistants={machineSetup.assistants}
                        data-testid="local-onboarding-assistants"
                        onExternalOpen={props.onExternalOpen}
                    />
                ) : undefined}
            </SetupPage>
        );

    if (view.kind === "agent-ready")
        return (
            <SetupPage
                {...frame}
                action={{ label: "Continue", onSelect: props.onAssistantsContinue }}
                copy="Installed and connected."
                data-testid="local-onboarding-screen"
                scene="owl"
                title="Happy Agent is running"
            >
                <div className="happy-local-onboarding__facts">
                    {view.version ? <span>Happy Agent {view.version}</span> : null}
                    {view.nodeVersion ? <span>Node {view.nodeVersion}</span> : null}
                </div>
            </SetupPage>
        );

    if (view.kind === "checking")
        return (
            <SetupPage
                {...frame}
                data-testid="local-onboarding-screen"
                scene="snail"
                status={{ busy: true, label: view.message ?? "Checking…" }}
                title="Checking this machine"
            />
        );

    if (view.kind === "node-missing")
        return (
            <SetupPage
                {...frame}
                copy="Install Node.js to continue."
                data-testid="local-onboarding-screen"
                scene="wand"
                status={{ busy: true, label: "Waiting for Node.js…" }}
                title="Node.js is required"
            />
        );

    const skipMobile = { label: "Skip mobile setup", onSelect: props.onHappyMobileSkip };

    if (view.kind === "happy-mobile-checking")
        return (
            <SetupPage
                {...frame}
                data-testid="local-onboarding-screen"
                scene="snail"
                status={{ busy: true, label: "Checking…" }}
                title="Checking Happy Mobile"
            />
        );

    if (view.kind === "happy-mobile-offer")
        return (
            <SetupPage
                {...frame}
                action={{
                    busy: view.busy,
                    label: "Connect phone",
                    onSelect: props.onHappyMobileConnect,
                }}
                className="happy-local-onboarding__mobile"
                copy={<MobileAppCopy onExternalOpen={props.onExternalOpen} />}
                data-testid="local-onboarding-screen"
                scene="alien-monster"
                secondary={skipMobile}
                {...(view.message ? { status: { label: view.message } } : {})}
                title="Take Happy with you"
            />
        );

    if (view.kind === "happy-mobile-pairing")
        return (
            <SetupPage
                {...frame}
                className="happy-local-onboarding__mobile happy-local-onboarding__mobile-pairing"
                copy="Open Happy Coder and scan."
                data-testid="local-onboarding-screen"
                secondary={skipMobile}
                status={{
                    busy: true,
                    label: `Waiting for phone · expires ${pairingExpiration(view.expiresAt)}`,
                }}
                title="Scan this code"
            >
                <div className="happy-local-onboarding__mobile-pairing-body">
                    <QRCode
                        data={view.data}
                        data-testid="happy-mobile-pairing-qr"
                        label="QR code to pair Happy Mobile"
                        size={136}
                    />
                    <PairingLinkCopy data={view.data} />
                </div>
            </SetupPage>
        );

    if (view.kind === "happy-mobile-failed")
        return (
            <SetupPage
                {...frame}
                action={{
                    busy: view.busy,
                    label: "Try again",
                    onSelect: props.onHappyMobileConnect,
                }}
                className="happy-local-onboarding__mobile"
                data-testid="local-onboarding-screen"
                scene="owl"
                secondary={skipMobile}
                status={{ label: view.message }}
                title="Phone didn't connect"
            />
        );

    if (view.kind === "profile-required")
        return (
            <SetupPage
                {...frame}
                action={{
                    busy: view.busy,
                    disabled: !view.name.trim() || !view.email.trim(),
                    label: "Create profile",
                    onSelect: props.onProfileCreate,
                }}
                copy="Shown on your commits and messages."
                data-testid="local-onboarding-screen"
                scene="disguised-face"
                {...(view.message ? { status: { label: view.message } } : {})}
                title="Create your profile"
            >
                <div className="happy-local-onboarding__profile-form">
                    <TextField
                        autoFocus
                        fullWidth
                        label="Name"
                        onSubmit={props.onProfileCreate}
                        onValueChange={props.onProfileNameChange}
                        placeholder="Your name"
                        required
                        value={view.name}
                    />
                    <TextField
                        fullWidth
                        label="Git email"
                        onSubmit={props.onProfileCreate}
                        onValueChange={props.onProfileEmailChange}
                        placeholder="you@example.com"
                        required
                        type="email"
                        value={view.email}
                    />
                </div>
            </SetupPage>
        );

    if (view.kind === "connect-failed")
        return (
            <SetupPage
                {...frame}
                action={{
                    busy: view.retrying,
                    label: "Try again",
                    onSelect: props.onConnectRetry,
                }}
                command={DAEMON_START_COMMAND}
                copy="Run the command below, then retry."
                data-testid="local-onboarding-screen"
                scene="owl"
                // Whatever actually refused, verbatim, so a daemon failing for a
                // nameable reason does not look like a button that does nothing.
                status={{ label: view.message }}
                title="Can't reach Happy Agent"
            />
        );

    if (view.kind === "project")
        return (
            <SetupPage
                {...frame}
                action={{
                    disabled: view.busy,
                    label: view.busy ? "Opening…" : "Choose a folder…",
                    onSelect: props.onProjectChoose,
                }}
                copy="Pick a folder you work in."
                data-testid="local-onboarding-screen"
                scene="wand"
                {...(props.onProjectSetupBack
                    ? {
                          secondary: {
                              disabled: view.busy,
                              label: "Back to setup options",
                              onSelect: props.onProjectSetupBack,
                          },
                      }
                    : {})}
                {...(view.message ? { status: { label: view.message } } : {})}
                title="Open your first project"
            />
        );

    return null;
}

function onboardingStage(view: LocalOnboardingView): OnboardingStage {
    switch (view.kind) {
        case "examining":
        case "provider-authentication":
            return "subscriptions";
        case "profile-required":
            return "profile";
        case "happy-mobile-desktop":
            return view.step.kind === "intro" ? "get-app" : "connect-phone";
        case "happy-mobile-checking":
        case "happy-mobile-offer":
            return "get-app";
        case "happy-mobile-pairing":
        case "happy-mobile-failed":
        case "finishing":
        case "project":
            return "connect-phone";
        default:
            return "setup";
    }
}

/**
 * The pairing payload, offered as a link for a phone that cannot see the
 * screen. The daemon's contract says this string is either encoded as a QR
 * code or handed over as a copyable deep link, and that it is opaque — so it
 * is copied exactly as it arrived and nothing here reads it.
 */
function PairingLinkCopy(props: { readonly data: string }) {
    return (
        <CopyButton
            caption="Copy auth link"
            className="happy-local-onboarding__pairing-link"
            copiedCaption="Link copied"
            data-testid="happy-mobile-pairing-copy"
            label="Copy auth link"
            text={props.data}
        />
    );
}

/** Somewhere to turn on every screen, without leaving the step you are on. */
function OnboardingHelp(props: { onExternalOpen?(url: string): void }) {
    return (
        <MenuButton
            align="end"
            icon="users"
            items={HELP_LINKS.map((link) => ({ id: link.id, kind: "item", label: link.label }))}
            label="Get help"
            menuLabel="Get help"
            placement="above"
            onSelect={(id) => {
                const link = HELP_LINKS.find((candidate) => candidate.id === id);
                if (link) props.onExternalOpen?.(link.url);
            }}
            size="medium"
            text="Get help"
            variant="ghost"
        />
    );
}
