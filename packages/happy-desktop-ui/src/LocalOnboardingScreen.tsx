import { useState } from "react";
import { type AssistantMarkName } from "./AssistantMark";
import {
    desktopMobileSetupPage,
    MobileAppCopy,
    desktopMobilePairingOptionsCopy,
    type DesktopMobilePairingOptions,
    type DesktopMobileSetupStep,
} from "./DesktopMobileSetup";
import { ClaudeSetupTokenDialog } from "./ClaudeSetupTokenDialog";
import { OnboardingHelp } from "./OnboardingHelp";
import { OnboardingNode, type OnboardingNodeIdentity } from "./OnboardingNode";
import { OnboardingSteps, type OnboardingStage } from "./OnboardingSteps";
import {
    SetupAssistants,
    type SetupAssistantAction,
    type SetupAssistantEntry,
    type SetupAssistantsAside,
} from "./SetupAssistants";
import { SetupPage, type SetupPageProgress, type SetupPageStatus } from "./SetupPage";
import type { ThemeMode } from "./ThemeScope";
import { windowsSandboxSetupPage, type WindowsSandboxSetupState } from "./WindowsSandboxSetup";

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
    /** What Happy Agent can do about it itself: every card is one button. */
    readonly connect: LocalOnboardingAssistantConnect;
}

/** Happy Agent's own install and sign-in for one assistant. */
export interface LocalOnboardingAssistantConnect {
    /** Whether Happy Agent found the program, wherever it lives. */
    readonly installed: boolean;
    /** Whether Happy Agent can install it from the vendor's own installer. */
    readonly installable: boolean;
    /** The install or sign-in going on now, or the one that just failed. */
    readonly operation?: LocalOnboardingAssistantOperation;
}

export type LocalOnboardingAssistantOperation =
    | { readonly kind: "install" | "sign-in"; readonly status: "running" }
    | {
          readonly kind: "sign-in";
          readonly status: "waiting";
          /** The vendor's page that finishes it. */
          readonly url: string;
          /** The code to confirm on that page, for a sign-in on another device. */
          readonly userCode?: string;
      }
    | { readonly kind: "install" | "sign-in"; readonly status: "failed"; readonly message: string };

/** Saving a Claude setup token: idle, on its way, refused, or saved. */
export interface LocalOnboardingClaudeToken {
    readonly phase: "idle" | "saving" | "failed" | "saved";
    readonly error?: string;
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
          /** Saving a Claude setup token, on a Happy Agent that takes one. */
          readonly claudeToken?: LocalOnboardingClaudeToken;
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
    /** Opens the Claude setup token dialog with the page, for the Blueprint. */
    readonly claudeDialogOpen?: boolean;
    readonly appearance: ThemeMode;
    readonly view: LocalOnboardingView;
    /** The Happy Agent being set up, once it has said who it is. */
    readonly node?: OnboardingNodeIdentity;
    /**
     * The steps the bar may send someone to from here, behind or ahead.
     * Absent, every finished step before the current one.
     */
    readonly selectableStages?: readonly OnboardingStage[];
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
    /** Both pairing methods, shown side by side while linking. */
    readonly happyMobilePairingOptions: DesktopMobilePairingOptions;
    /** Asks Happy Agent to run Codex's or Grok's own sign-in. */
    onAssistantSignIn?(assistant: LocalOnboardingAssistantId): void;
    /** Asks Happy Agent to install a missing assistant from its vendor. */
    onAssistantInstall?(assistant: LocalOnboardingAssistantId): void;
    /** Stops the install or sign-in going on for one assistant. */
    onAssistantConnectCancel?(assistant: LocalOnboardingAssistantId): void;
    /** A pasted Claude setup token, for Happy Agent to keep. */
    onClaudeTokenSubmit?(token: string): void;
    /** The Claude dialog opened again: forget how the last save went. */
    onClaudeTokenReset?(): void;
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
        // learn.chatgpt.com/docs/codex/cli: the standalone installers come
        // first; npm and Homebrew are offered as alternatives.
        install: {
            posix: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
            powershell:
                'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"',
        },
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

/** What a Subscriptions card can ask the host to do. */
interface AssistantCardHandlers {
    readonly onCommandCopy?: (copy: LocalOnboardingCommandCopy) => void;
    readonly onSignIn?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onInstall?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onCancel?: (assistant: LocalOnboardingAssistantId) => void;
    readonly onExternalOpen?: (url: string) => void;
    /** Opens the Claude setup token dialog. */
    readonly onClaudeConnect?: () => void;
}

/**
 * Connected, or still being checked: the card asks for nothing. A card being
 * checked holds its button's place empty, and the answer fades in there.
 */
function assistantSettledAction(
    assistant: LocalOnboardingAssistant,
): SetupAssistantAction | undefined {
    if (assistant.authentication === "valid") return { kind: "done", label: "Connected" };
    if (assistant.authentication === "checking") return { kind: "pending" };
    return undefined;
}

/**
 * Every card is one button: Claude opens the dialog that explains its setup
 * token, and Codex and Grok install and sign in through Happy Agent with the
 * vendor's own page. The button is the card's status as well as its action:
 * what it says is where the assistant stands, and a connected one keeps its
 * place, so the row never loses a member. A card never sends anyone to a
 * terminal: there are no commands to copy.
 */
function assistantConnectProject(
    assistant: LocalOnboardingAssistant,
    handlers: AssistantCardHandlers,
): SetupAssistantAction {
    const { onSignIn, onInstall, onCancel, onClaudeConnect } = handlers;
    const retry = assistant.authentication === "error";
    const settled = assistantSettledAction(assistant);
    if (settled) return settled;
    if (assistant.id === "claude")
        return {
            kind: "button",
            label: retry ? "Connect again" : "Connect",
            ...(onClaudeConnect ? { onSelect: onClaudeConnect } : {}),
        };
    const id = assistant.id;
    const connect = assistant.connect;
    const operation = connect.operation;
    if (operation?.status === "running")
        return {
            busy: true,
            kind: "button",
            label: operation.kind === "install" ? "Installing" : "Opening",
        };
    if (operation?.status === "waiting")
        return {
            kind: "waiting",
            label: "In your browser",
            onCancel: () => onCancel?.(id),
            onOpen: () => handlers.onExternalOpen?.(operation.url),
            ...(operation.userCode === undefined ? {} : { userCode: operation.userCode }),
        };
    if (!connect.installed)
        return {
            kind: "button",
            label: operation?.status === "failed" ? "Try again" : "Install",
            // One Happy Agent cannot install keeps its button, not offered.
            ...(onInstall && connect.installable ? { onSelect: () => onInstall(id) } : {}),
        };
    return {
        kind: "button",
        label: operation?.status === "failed" ? "Try again" : retry ? "Sign in again" : "Sign in",
        ...(onSignIn ? { onSelect: () => onSignIn(id) } : {}),
    };
}

function assistantAuthenticationEntry(
    assistant: LocalOnboardingAssistant,
    handlers: AssistantCardHandlers,
): SetupAssistantEntry {
    const vendor = ASSISTANTS[assistant.id];
    return {
        action: assistantConnectProject(assistant, handlers),
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

/**
 * Model access set up some other way, as one quiet line under the three
 * cards rather than a card of its own: what is configured when something is,
 * and the prompts for the coding agent already on the machine. Access that is
 * configured but failed its check gets the same prompts: a base URL or proxy
 * the daemon could not reach is fixed the same way it is set up. While it is
 * still being checked the line is held empty.
 */
function customAside(
    custom: LocalOnboardingCustom,
    promptsOpen = false,
    onCommandCopy?: (copy: LocalOnboardingCommandCopy) => void,
): SetupAssistantsAside {
    const prompts = (label: string): Extract<SetupAssistantAction, { kind: "prompts" }> => ({
        ...(promptsOpen ? { defaultOpen: true } : {}),
        kind: "prompts",
        label,
        ...(onCommandCopy
            ? { onCopy: () => onCommandCopy({ assistant: "custom", kind: "agent-prompt" }) }
            : {}),
        prompts: AGENT_PROMPTS,
        title: "Paste one into the coding agent you already use",
    });
    const named = custom.providers.join(", ");
    switch (custom.authentication) {
        case "valid":
            return { detail: `${named || "Custom setup"} ready ✓` };
        case "checking":
            // The line is held, empty, so the cards above it never move.
            return {};
        case "error":
            return {
                action: prompts("Fix with your agent"),
                detail: `Couldn't verify ${named || "your custom setup"}.`,
            };
        case "invalid":
            return { action: prompts("Use an API key or another provider") };
    }
}

/** The row shown before authentication resolves: the cards, their buttons held. */
const CHECKING_ASSISTANTS: readonly SetupAssistantEntry[] = Object.entries(ASSISTANTS).map(
    ([id, assistant]): SetupAssistantEntry => ({
        action: { kind: "pending" },
        id,
        mark: assistant.mark,
        name: assistant.name,
        status: "checking",
    }),
);

interface MachineSetupProjection {
    readonly assistants?: readonly SetupAssistantEntry[];
    readonly aside?: SetupAssistantsAside;
    readonly copy?: string;
    /** Whether anything found on this machine can actually be used to work. */
    readonly hasValidAuthentication: boolean;
    readonly status?: SetupPageStatus;
    readonly title: string;
}

const SETUP_COPY = "One-time download for this machine.";
/**
 * Subscriptions says one thing from the moment it opens: the cards are where
 * it stands, so the words above them never change while checks come back.
 */
const SUBSCRIPTIONS_TITLE = "Connect your AI";
const SUBSCRIPTIONS_COPY = "Sign in to one you already use to get started. You can add more later.";

function machineSetupProject(
    view: LocalOnboardingView,
    promptsOpen: boolean,
    handlers: AssistantCardHandlers,
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
    // While anything is checked its card holds its button's place empty; there
    // is no status line to appear and go again under the subtitle.
    if (view.kind === "examining")
        return {
            assistants: CHECKING_ASSISTANTS,
            aside: {},
            copy: SUBSCRIPTIONS_COPY,
            hasValidAuthentication: false,
            title: SUBSCRIPTIONS_TITLE,
        };
    if (view.kind === "provider-authentication")
        return {
            assistants: view.assistants.map((assistant) =>
                assistantAuthenticationEntry(assistant, handlers),
            ),
            aside: customAside(view.custom, promptsOpen, handlers.onCommandCopy),
            copy: SUBSCRIPTIONS_COPY,
            hasValidAuthentication:
                view.custom.authentication === "valid" ||
                view.assistants.some((assistant) => assistant.authentication === "valid"),
            title: SUBSCRIPTIONS_TITLE,
        };
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
    // Whether the Claude dialog is open is this screen's own passing state;
    // what saving the token does belongs to setup.
    const [claudeOpen, claudeOpenSet] = useState(props.claudeDialogOpen === true);
    const identity = props.node ? <OnboardingNode node={props.node} /> : undefined;
    // Every step is drawn by this one `SetupPage`, never by a component of its
    // own: a different component here would remount the sky and the step bar,
    // and only the page's content is meant to change between steps.
    if (view.kind === "happy-mobile-desktop")
        return (
            <SetupPage
                {...desktopMobileSetupPage({
                    appearance: props.appearance,
                    help: <OnboardingHelp onExternalOpen={props.onExternalOpen} />,
                    ...(identity ? { identity } : {}),
                    step: view.step,
                    ...(props.showSteps === undefined ? {} : { onboarding: props.showSteps }),
                    ...(props.sandboxStep ? { sandboxStep: true } : {}),
                    ...(props.onStageSelect ? { onStageSelect: props.onStageSelect } : {}),
                    ...(props.selectableStages ? { selectableStages: props.selectableStages } : {}),
                    onContinue: props.onHappyMobileConnect,
                    onSkip: props.onHappyMobileSkip,
                    ...(props.onExternalOpen ? { onExternalOpen: props.onExternalOpen } : {}),
                    pairingOptions: props.happyMobilePairingOptions,
                })}
            />
        );
    // Download and start are one machine-setup surface, and discovery and
    // verification another: Subscriptions is laid out differently, so it
    // dissolves in rather than rearranging the setup page in place. Mobile
    // setup begins its own pages after that machine work.
    const transitionKey = (() => {
        switch (view.kind) {
            case "finishing":
            case "happy-mobile-checking":
            case "happy-mobile-offer":
            case "happy-mobile-pairing":
                return view.kind;
            case "examining":
            case "provider-authentication":
                return "local-subscriptions";
            default:
                return "local-agent-setup";
        }
    })();
    const frame = {
        backdrop: { appearance: props.appearance, kind: "sky" },
        transitionKey,
        help: <OnboardingHelp onExternalOpen={props.onExternalOpen} />,
        ...(identity ? { identity } : {}),
        steps: props.showSteps ? (
            <OnboardingSteps
                scope="desktop"
                stage={localOnboardingStage(view)}
                {...(props.selectableStages ? { selectable: props.selectableStages } : {})}
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
    const claudeToken = view.kind === "provider-authentication" ? view.claudeToken : undefined;
    const machineSetup = machineSetupProject(view, props.agentPromptsOpen === true, {
        ...(props.onCommandCopy ? { onCommandCopy: props.onCommandCopy } : {}),
        ...(props.onAssistantSignIn ? { onSignIn: props.onAssistantSignIn } : {}),
        ...(props.onAssistantInstall ? { onInstall: props.onAssistantInstall } : {}),
        ...(props.onAssistantConnectCancel ? { onCancel: props.onAssistantConnectCancel } : {}),
        ...(props.onExternalOpen ? { onExternalOpen: props.onExternalOpen } : {}),
        ...(props.onClaudeTokenSubmit
            ? {
                  onClaudeConnect: () => {
                      props.onClaudeTokenReset?.();
                      claudeOpenSet(true);
                  },
              }
            : {}),
    });
    const claude =
        view.kind === "provider-authentication"
            ? view.assistants.find((assistant) => assistant.id === "claude")
            : undefined;
    // Saved, or Claude already works: the dialog has nothing left to ask.
    const claudeDialog =
        claudeOpen &&
        claude !== undefined &&
        claude.authentication !== "valid" &&
        claudeToken?.phase !== "saved" &&
        props.onClaudeTokenSubmit !== undefined &&
        view.kind === "provider-authentication" ? (
            <ClaudeSetupTokenDialog
                {...((claude.connect?.installed ?? claude.status === "found")
                    ? {}
                    : { installCommand: ASSISTANTS.claude.install[view.installShell] })}
                phase={
                    claudeToken?.phase === "saving" || claudeToken?.phase === "failed"
                        ? claudeToken.phase
                        : "idle"
                }
                {...(claudeToken?.error ? { error: claudeToken.error } : {})}
                onClose={() => claudeOpenSet(false)}
                onTokenSubmit={props.onClaudeTokenSubmit}
            />
        ) : null;

    if (machineSetup)
        return (
            <>
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
                    // Subscriptions is a choice, not a report: no picture, and the
                    // choices centred in the window. Setup keeps its owl on the line.
                    {...(machineSetup.assistants
                        ? { placement: "centered" as const }
                        : { scene: "owl" as const })}
                    {...(machineSetup.status ? { status: machineSetup.status } : {})}
                    title={machineSetup.title}
                >
                    {machineSetup.assistants ? (
                        <SetupAssistants
                            assistants={machineSetup.assistants}
                            {...(machineSetup.aside ? { aside: machineSetup.aside } : {})}
                            data-testid="local-onboarding-assistants"
                            onExternalOpen={props.onExternalOpen}
                        />
                    ) : undefined}
                </SetupPage>
                {/* Beside the page, not inside its scroll area: in there the dim would
                paint under the page's pinned corners, the node and Ask a question. */}
                {claudeDialog}
            </>
        );

    if (view.kind === "windows-sandbox")
        return (
            <SetupPage
                {...windowsSandboxSetupPage({
                    appearance: props.appearance,
                    help: frame.help,
                    ...(identity ? { identity } : {}),
                    state: view.state,
                    ...(frame.steps ? { steps: frame.steps } : {}),
                    onContinue: () => props.onSandboxSetup?.(),
                })}
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
                placement="centered"
                {...(props.happyMobilePairingOptions.completed
                    ? { action: { label: "Continue", onSelect: props.onHappyMobileConnect } }
                    : { secondary: skipMobile })}
                title={
                    props.happyMobilePairingOptions.completed
                        ? "Mobile App Linked"
                        : "Scan This Code"
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
