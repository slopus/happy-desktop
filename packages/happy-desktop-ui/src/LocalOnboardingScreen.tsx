import { type AssistantMarkName } from "./AssistantMark";
import { CopyButton } from "./CopyButton";
import {
    DesktopMobileSetup,
    MobileAppCopy,
    type DesktopMobileSetupStep,
} from "./DesktopMobileSetup";
import { OnboardingHelp } from "./OnboardingHelp";
import { OnboardingSteps, type OnboardingStage } from "./OnboardingSteps";
import { QRCode } from "./QRCode";
import {
    SetupAssistants,
    type SetupAssistantAction,
    type SetupAssistantEntry,
} from "./SetupAssistants";
import { SetupPage, type SetupPageProgress, type SetupPageStatus } from "./SetupPage";
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
 * Model access configured some other way than the three CLIs: an API key,
 * Bedrock, a gateway, or more accounts. `invalid` means none is configured.
 */
export interface LocalOnboardingCustom {
    readonly authentication: "checking" | "valid" | "invalid" | "error";
    /** What is configured, named by kind, for example "Bedrock". */
    readonly providers: readonly string[];
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
          readonly custom: LocalOnboardingCustom;
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
          /**
           * Mobile setup is answered and the app is opening. The host shows its
           * workspace for this; there is no further setup page.
           */
          readonly kind: "finishing";
          readonly busy: boolean;
          readonly message?: string;
      };

export interface LocalOnboardingScreenProps {
    readonly showSteps?: boolean;
    /** Opens the custom column's prompts with the page, for the Blueprint. */
    readonly agentPromptsOpen?: boolean;
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
        /** What the vendor's own install page says to run, when the machine has not got it. */
        install: string;
        /** What signs you in, taken from each vendor's own documentation. */
        signIn: string;
    }
> = {
    claude: {
        command: "claude",
        install: "curl -fsSL https://claude.ai/install.sh | bash",
        mark: "claude",
        name: "Claude Code",
        signIn: "claude auth login",
    },
    codex: {
        command: "codex",
        install: "npm i -g @openai/codex",
        mark: "openai",
        name: "Codex",
        signIn: "codex login",
    },
    grok: {
        command: "grok",
        install: "curl -fsSL https://x.ai/cli/install.sh | bash",
        mark: "grok",
        name: "Grok",
        // Grok has no login subcommand: running it is the sign-in.
        signIn: "grok",
    },
};

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
                return "Ready ✓";
            case "invalid":
                return "Sign in by running:";
            case "error":
                return "Couldn't check — retrying";
            case "unavailable":
                return "Install by running:";
        }
    })();
    // What to do about it: get the thing, or sign in to the thing that is
    // already here. A working assistant is asked for nothing.
    const action: SetupAssistantAction | undefined = (() => {
        switch (assistant.authentication) {
            case "unavailable":
                return {
                    command: vendor.install,
                    kind: "command",
                    label: `${vendor.name} install command`,
                };
            case "invalid":
                return {
                    command: vendor.signIn,
                    kind: "command",
                    label: `${vendor.name} sign-in command`,
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

const HAPPY_DOCS = "~/.happy/docs";

/** What the custom column hands to the coding agent somebody already uses. */
const AGENT_PROMPTS = [
    {
        id: "sign-in",
        label: "Sign me in",
        text: `Sign me in to Claude Code, Codex, or Grok on this computer so Happy can use it. Guide: ${HAPPY_DOCS}/configuration.md (Providers).`,
    },
    {
        id: "custom",
        label: "My setup is custom",
        text: `Set up Happy Agent on this computer with my custom model access (enterprise, Bedrock, API key, or a gateway). Guide: ${HAPPY_DOCS}/recipe/accounts-and-models.md`,
    },
] as const;

const CUSTOM_NAME = "Custom configuration";

/**
 * The fourth card: model access set up some other way. It reads like the three
 * beside it — a mark, a name, one line of state — and its remedy is the prompts
 * for the coding agent already on the machine rather than a command.
 */
function customAuthenticationEntry(
    custom: LocalOnboardingCustom,
    promptsOpen = false,
): SetupAssistantEntry {
    switch (custom.authentication) {
        case "valid":
            return {
                detail: "Ready ✓",
                id: "custom",
                mark: "custom",
                name: CUSTOM_NAME,
                status: "found",
            };
        case "checking":
            return {
                detail: "Checking…",
                id: "custom",
                mark: "custom",
                name: CUSTOM_NAME,
                status: "checking",
            };
        case "error":
            return {
                detail: "Couldn't check — retrying",
                id: "custom",
                mark: "custom",
                name: CUSTOM_NAME,
                status: "checking",
            };
        case "invalid":
            return {
                action: {
                    ...(promptsOpen ? { defaultOpen: true } : {}),
                    kind: "prompts",
                    label: "Set up with your agent",
                    prompts: AGENT_PROMPTS,
                    title: "Paste one into the coding agent you already use",
                },
                detail: "API key, Bedrock, other",
                id: "custom",
                mark: "custom",
                name: CUSTOM_NAME,
                status: "signed-out",
            };
    }
}

/** The stable, dimmed row shown before authentication resolves. */
const CHECKING_ASSISTANTS: readonly SetupAssistantEntry[] = [
    ...Object.entries(ASSISTANTS).map(
        ([id, assistant]): SetupAssistantEntry => ({
            detail: "Checking…",
            id,
            mark: assistant.mark,
            name: assistant.name,
            status: "checking",
        }),
    ),
    customAuthenticationEntry({ authentication: "checking", providers: [] }),
];

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

function machineSetupProject(
    view: LocalOnboardingView,
    promptsOpen: boolean,
): MachineSetupProjection | undefined {
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
        const states = [
            ...view.assistants.map((assistant) => assistant.authentication),
            view.custom.authentication,
        ];
        const assistants = [
            ...view.assistants.map(assistantAuthenticationEntry),
            customAuthenticationEntry(view.custom, promptsOpen),
        ];
        if (states.includes("valid"))
            return {
                assistants,
                hasValidAuthentication: true,
                status: { label: "" },
                title: "You're set",
            };
        const failed = states.includes("error");
        if (states.includes("checking") || failed)
            return {
                assistants,
                copy: SUBSCRIPTIONS_COPY,
                hasValidAuthentication: false,
                status: { busy: true, label: failed ? "Couldn't check · retrying…" : "Checking…" },
                title: "Checking subscriptions",
            };
        return {
            assistants,
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
 * the optional mobile app. Link Mobile App is the last page: answering it, or
 * skipping mobile setup, opens the app.
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
    // surface. Mobile setup begins its own pages after that machine work.
    const transitionKey = (() => {
        switch (view.kind) {
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
                stage={localOnboardingStage(view)}
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
    const machineSetup = machineSetupProject(view, props.agentPromptsOpen === true);

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
                secondary={skipMobile}
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
                    label: "Link Mobile App",
                    onSelect: props.onHappyMobileConnect,
                }}
                className="happy-local-onboarding__mobile"
                copy={<MobileAppCopy onExternalOpen={props.onExternalOpen} />}
                data-testid="local-onboarding-screen"
                scene="alien-monster"
                secondary={skipMobile}
                {...(view.message ? { status: { label: view.message } } : {})}
                title="Get Mobile App"
            />
        );

    if (view.kind === "happy-mobile-pairing")
        return (
            <SetupPage
                {...frame}
                className="happy-local-onboarding__mobile happy-local-onboarding__mobile-pairing"
                copy="Open Happy mobile app and scan."
                data-testid="local-onboarding-screen"
                secondary={skipMobile}
                status={{
                    busy: true,
                    label: `Waiting for phone · expires ${pairingExpiration(view.expiresAt)}`,
                }}
                title="Link Mobile App"
            >
                <div className="happy-local-onboarding__mobile-pairing-body">
                    <QRCode
                        data={view.data}
                        data-testid="happy-mobile-pairing-qr"
                        label="QR code to link your devices"
                        mark="link"
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
                title="Mobile App Didn't Link"
            />
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

    return null;
}

/** Which step of the bar a view belongs to. */
export function localOnboardingStage(view: LocalOnboardingView): OnboardingStage {
    switch (view.kind) {
        case "examining":
        case "provider-authentication":
            return "subscriptions";
        case "happy-mobile-desktop":
            return view.step.kind === "intro" ? "get-app" : "connect-phone";
        case "happy-mobile-checking":
        case "happy-mobile-offer":
            return "get-app";
        case "happy-mobile-pairing":
        case "happy-mobile-failed":
        case "finishing":
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
