import { type AssistantMarkName } from "./AssistantMark";
import {
    DesktopMobileSetup,
    MobileAppCopy,
    desktopMobilePairingOptionsCopy,
    type DesktopMobilePairingOptions,
    type DesktopMobileSetupStep,
} from "./DesktopMobileSetup";
import { OnboardingHelp } from "./OnboardingHelp";
import { OnboardingSteps, type OnboardingStage } from "./OnboardingSteps";
import {
    SetupAssistants,
    type SetupAssistantAction,
    type SetupAssistantEntry,
} from "./SetupAssistants";
import { SetupPage, type SetupPageProgress, type SetupPageStatus } from "./SetupPage";
import type { ThemeMode } from "./ThemeScope";
import { WindowsSandboxSetup, type WindowsSandboxSetupState } from "./WindowsSandboxSetup";

/** The coding assistants Happy looks for, and nothing beyond them. */
export type LocalOnboardingAssistantId = "claude" | "codex" | "grok";

/**
 * One Subscriptions card's command the person copied: whose card, and whether
 * it installs, signs in, or is a prompt for their own coding agent. Never the
 * text itself.
 */
/** The shell the official install commands are written for on this machine. */
export type LocalOnboardingInstallShell = "powershell" | "posix";

export interface LocalOnboardingCommandCopy {
    readonly assistant: LocalOnboardingAssistantId | "custom";
    readonly kind: "install" | "sign-in" | "agent-prompt";
}

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
           * This machine's data was written by a newer Happy Agent than the one
           * Happy can run here. Trying again refuses the same way every time,
           * so the only way on is an update.
           */
          readonly kind: "data-newer";
          /** What refused, verbatim. */
          readonly message: string;
          /** The update that would continue, when one is on offer. */
          readonly update?: { readonly version?: string; readonly busy: boolean };
          /** Why the last attempt at that update failed, until the next one. */
          readonly updateError?: string;
      }
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
          /** Which of each vendor's install commands this machine can run. */
          readonly installShell: LocalOnboardingInstallShell;
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
    /** Windows' sandbox, which only the person's press may set up. */
    | { readonly kind: "windows-sandbox"; readonly state: WindowsSandboxSetupState }
    | { readonly kind: "happy-mobile-checking" }
    | {
          readonly busy: boolean;
          readonly kind: "happy-mobile-offer";
          readonly message?: string;
      }
    /** Both pairing codes; each method's state is in `happyMobilePairingOptions`. */
    | { readonly kind: "happy-mobile-pairing" }
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
    /** The Windows sandbox step is part of this machine's sequence. */
    readonly sandboxStep?: boolean;
    onAssistantsContinue(): void;
    /** Starts Windows sandbox setup, or retries it after an unfinished attempt. */
    onSandboxSetup?(): void;
    onConnectRetry(): void;
    /** Installs the update a newer-data refusal is waiting for. */
    onAgentUpdate?(): void;
    /** Returns to an earlier step. Absent where stepping back is not offered. */
    onStageSelect?(stage: OnboardingStage): void;
    /** Opens an external page: the host owns how a link leaves the app. */
    onExternalOpen?(url: string): void;
    /** A Subscriptions card's command or prompt was copied. */
    onCommandCopy?(copy: LocalOnboardingCommandCopy): void;
    onHappyMobileConnect(): void;
    onHappyMobileSkip(): void;
    onHappyMobilePlatformSelect?(platform: "ios" | "android"): void;
    /** Both pairing methods, shown side by side while linking. */
    readonly happyMobilePairingOptions: DesktopMobilePairingOptions;
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
        install: Record<LocalOnboardingInstallShell, string>;
        /** What signs you in, taken from each vendor's own documentation. */
        signIn: string;
    }
> = {
    claude: {
        command: "claude",
        install: {
            posix: "curl -fsSL https://claude.ai/install.sh | bash",
            // code.claude.com/docs/en/setup, for Windows PowerShell.
            powershell: "irm https://claude.ai/install.ps1 | iex",
        },
        mark: "claude",
        name: "Claude Code",
        signIn: "claude auth login",
    },
    codex: {
        command: "codex",
        install: { posix: "npm i -g @openai/codex", powershell: "npm i -g @openai/codex" },
        mark: "openai",
        name: "Codex",
        signIn: "codex login",
    },
    grok: {
        command: "grok",
        install: {
            posix: "curl -fsSL https://x.ai/cli/install.sh | bash",
            // The header of x.ai/cli/install.ps1.
            powershell: "irm https://x.ai/cli/install.ps1 | iex",
        },
        mark: "grok",
        name: "Grok",
        signIn: "grok login",
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
/**
 * The command that installs one assistant here. Windows gets the vendors'
 * PowerShell installers: their POSIX one-liners fail there, in PowerShell
 * because `curl` is not curl and in either shell because there is no `bash`.
 */
export function localOnboardingInstallCommand(
    assistant: LocalOnboardingAssistantId,
    shell: LocalOnboardingInstallShell,
): string {
    return ASSISTANTS[assistant].install[shell];
}

function assistantAuthenticationEntry(
    assistant: LocalOnboardingAssistant,
    installShell: LocalOnboardingInstallShell,
    onCommandCopy?: (copy: LocalOnboardingCommandCopy) => void,
): SetupAssistantEntry {
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
                return "Couldn't verify. Sign in:";
            case "unavailable":
                return "Install by running:";
        }
    })();
    // What to do about it: get the thing, or sign in to the thing that is
    // already here. A credential that failed its check gets the same sign-in,
    // the main way into Happy, so a settled failure always has a way forward;
    // a custom endpoint or proxy is the custom column's to offer. A working
    // assistant is asked for nothing.
    const action: SetupAssistantAction | undefined = (() => {
        switch (assistant.authentication) {
            case "unavailable":
                return {
                    command: vendor.install[installShell],
                    kind: "command",
                    label: `${vendor.name} install command`,
                    ...(onCommandCopy
                        ? {
                              onCopy: () =>
                                  onCommandCopy({ assistant: assistant.id, kind: "install" }),
                          }
                        : {}),
                };
            case "invalid":
            case "error":
                return {
                    command: vendor.signIn,
                    kind: "command",
                    label: `${vendor.name} sign-in command`,
                    ...(onCommandCopy
                        ? {
                              onCopy: () =>
                                  onCommandCopy({ assistant: assistant.id, kind: "sign-in" }),
                          }
                        : {}),
                };
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
                : assistant.authentication === "invalid" || assistant.authentication === "error"
                  ? "signed-out"
                  : assistant.authentication === "unavailable"
                    ? "missing"
                    : "checking",
    };
}

const HAPPY_DOCS = "~/.happy/docs";

/**
 * What the custom column hands to the coding agent somebody already uses. The
 * custom setup comes first: this column is the only place that route lives.
 */
const AGENT_PROMPTS = [
    {
        id: "custom",
        label: "My setup is custom",
        text: `Set up Happy Agent on this computer with my custom model access: an API key, Bedrock, a gateway, or a custom base URL or proxy for Claude Code or Codex. Read the env block in ~/.claude/settings.json and ~/.codex/config.toml, then add the matching provider to Happy's happy.toml. Guide: ${HAPPY_DOCS}/configuration.md (Providers).`,
    },
    {
        id: "sign-in",
        label: "Sign me in",
        text: `Sign me in to Claude Code, Codex, or Grok on this computer so Happy can use it. Guide: ${HAPPY_DOCS}/configuration.md (Providers).`,
    },
] as const;

const CUSTOM_NAME = "Custom configuration";

/**
 * The fourth card: model access set up some other way. It reads like the three
 * beside it — a mark, a name, one line of state — and its remedy is the prompts
 * for the coding agent already on the machine rather than a command. Access
 * that is configured but failed its check gets the same prompts: a base URL or
 * proxy the daemon could not reach is fixed the same way it is set up.
 */
function customAuthenticationEntry(
    custom: LocalOnboardingCustom,
    promptsOpen = false,
    onCommandCopy?: (copy: LocalOnboardingCommandCopy) => void,
): SetupAssistantEntry {
    const prompts: SetupAssistantAction = {
        ...(promptsOpen ? { defaultOpen: true } : {}),
        kind: "prompts",
        label: "Set up with your agent",
        ...(onCommandCopy
            ? { onCopy: () => onCommandCopy({ assistant: "custom", kind: "agent-prompt" }) }
            : {}),
        prompts: AGENT_PROMPTS,
        title: "Paste one into the coding agent you already use",
    };
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
                action: prompts,
                detail:
                    custom.providers.length > 0
                        ? `Couldn't verify ${custom.providers.join(", ")}`
                        : "Couldn't verify",
                id: "custom",
                mark: "custom",
                name: CUSTOM_NAME,
                status: "signed-out",
            };
        case "invalid":
            return {
                action: prompts,
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
    onCommandCopy?: (copy: LocalOnboardingCommandCopy) => void,
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
            ...view.assistants.map((assistant) =>
                assistantAuthenticationEntry(assistant, view.installShell, onCommandCopy),
            ),
            customAuthenticationEntry(view.custom, promptsOpen, onCommandCopy),
        ];
        if (states.includes("valid"))
            return {
                assistants,
                hasValidAuthentication: true,
                status: { label: "" },
                title: "You're set",
            };
        if (states.includes("checking"))
            return {
                assistants,
                copy: SUBSCRIPTIONS_COPY,
                hasValidAuthentication: false,
                status: { busy: true, label: "Checking…" },
                title: "Checking subscriptions",
            };
        // A failed check is a settled answer, not one still coming: each failed
        // card carries its remedy, and Happy keeps checking in the background
        // without presenting the screen as busy.
        if (states.includes("error"))
            return {
                assistants,
                copy: "Sign in again, or set up a custom endpoint with your agent.",
                hasValidAuthentication: false,
                status: { label: "Happy notices as soon as one works." },
                title: "Couldn't verify a subscription",
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
                {...(props.sandboxStep ? { sandboxStep: true } : {})}
                {...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {})}
                onContinue={props.onHappyMobileConnect}
                onSkip={props.onHappyMobileSkip}
                onPlatformSelect={props.onHappyMobilePlatformSelect}
                onExternalOpen={props.onExternalOpen}
                pairingOptions={props.happyMobilePairingOptions}
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
                {...(props.sandboxStep ? { sandbox: true } : {})}
                {...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {})}
                failed={
                    view.kind === "node-missing" ||
                    view.kind === "connect-failed" ||
                    view.kind === "data-newer"
                }
            />
        ) : undefined,
    } as const;
    const machineSetup = machineSetupProject(
        view,
        props.agentPromptsOpen === true,
        props.onCommandCopy,
    );

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

    if (view.kind === "windows-sandbox")
        return (
            <WindowsSandboxSetup
                appearance={props.appearance}
                help={frame.help}
                state={view.state}
                steps={frame.steps}
                onContinue={() => props.onSandboxSetup?.()}
            />
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
                className="happy-local-onboarding__mobile happy-local-onboarding__mobile-options"
                copy={desktopMobilePairingOptionsCopy(props.happyMobilePairingOptions)}
                data-testid="local-onboarding-screen"
                {...(props.happyMobilePairingOptions.completed
                    ? { action: { label: "Continue", onSelect: props.onHappyMobileConnect } }
                    : { secondary: skipMobile })}
                title={
                    props.happyMobilePairingOptions.completed
                        ? "Mobile App Linked"
                        : "Link Mobile App"
                }
            >
                {props.happyMobilePairingOptions.view}
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

    if (view.kind === "data-newer")
        return (
            <SetupPage
                {...frame}
                {...(view.update && props.onAgentUpdate
                    ? {
                          action: {
                              busy: view.update.busy,
                              label: view.update.version
                                  ? `Update to ${view.update.version}`
                                  : "Update Happy Agent",
                              onSelect: props.onAgentUpdate,
                              width: 280,
                          },
                          ...(view.updateError ? { status: { label: view.updateError } } : {}),
                      }
                    : {
                          // Nothing to press: Happy checks for the update by
                          // itself and offers it here as soon as there is one.
                          status: { busy: true, label: "Waiting for a newer Happy Agent…" },
                      })}
                // What refused, verbatim: it names the version the data needs.
                copy={view.message}
                data-testid="local-onboarding-screen"
                scene="owl"
                title="Update Happy Agent to continue"
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
        case "windows-sandbox":
            return "sandbox";
        case "happy-mobile-desktop":
            return view.step.kind === "intro" ? "get-app" : "connect-phone";
        case "happy-mobile-checking":
        case "happy-mobile-offer":
            return "get-app";
        case "happy-mobile-pairing":
        case "finishing":
            return "connect-phone";
        default:
            return "setup";
    }
}
