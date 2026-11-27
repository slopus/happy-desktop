import { useState } from "react";
import { type AssistantMarkName } from "./AssistantMark";
import {
    desktopMobileSetupPage,
    MobileAppCopy,
    desktopMobilePairingOptionsCopy,
    type DesktopMobilePairingOptions,
    type DesktopMobileSetupStep,
} from "./DesktopMobileSetup";
import {
    LocalOnboardingProviderDialog,
    type LocalOnboardingApiKey,
    type LocalOnboardingProviderWay,
} from "./LocalOnboardingProviderDialog";
import { OnboardingHelp } from "./OnboardingHelp";
import { OnboardingNode, type OnboardingNodeIdentity } from "./OnboardingNode";
import { OnboardingSteps, type OnboardingStage } from "./OnboardingSteps";
import {
    SetupProviderRows,
    type SetupProviderMark,
    type SetupProviderRow,
} from "./SetupProviderRows";
import { SetupPage, type SetupPageProgress, type SetupPageStatus } from "./SetupPage";
import type { ThemeMode } from "./ThemeScope";
import { windowsSandboxSetupPage, type WindowsSandboxSetupState } from "./WindowsSandboxSetup";

/** The coding assistants Happy looks for, and nothing beyond them. */
export type LocalOnboardingAssistantId = "claude" | "codex" | "grok" | "antigravity";

/**
 * One row on Connect your AI: an assistant Happy Agent signs in, Amazon
 * Bedrock, or a custom endpoint. API keys belong to the assistant they are for.
 */
export type LocalOnboardingProviderRowId = LocalOnboardingAssistantId | "bedrock" | "custom";

/** The shell the official install commands are written for on this machine. */
export type LocalOnboardingInstallShell = "powershell" | "posix";

/**
 * One Connect your AI command the person copied: whose row, and whether it
 * installs, signs in, or is a prompt for their own coding agent. Never the
 * text itself.
 */
export interface LocalOnboardingCommandCopy {
    readonly assistant: LocalOnboardingProviderRowId;
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
    /** Why it could not be verified, while that is its answer. */
    readonly message?: string;
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
          /** The page may show a code to paste back here instead. */
          readonly acceptsCode?: boolean;
          /** When Happy Agent stops waiting, in epoch milliseconds. */
          readonly expiresAt?: number;
      }
    | { readonly kind: "install" | "sign-in"; readonly status: "failed"; readonly message: string };

/** The rows whose dialog takes a key: three assistants' API keys, and AWS keys for Bedrock. */
export type LocalOnboardingKeyRowId = "claude" | "codex" | "grok" | "bedrock";

/** A key to add as a new account, as the dialog collected it. */
export type LocalOnboardingKeyCredential =
    | {
          readonly kind: "api-key";
          readonly type: "claude" | "codex" | "grok";
          readonly apiKey: string;
      }
    | {
          readonly kind: "aws";
          readonly accessKeyId: string;
          readonly secretAccessKey: string;
          readonly region: string;
      };

/** Adding an account from a key: whether this Happy Agent can, and how the last one went. */
export interface LocalOnboardingKeyAdd {
    /** Whether Happy Agent takes keys at all. Absent while it is still being asked. */
    readonly supported?: boolean;
    readonly phase: "idle" | "saving" | "failed" | "saved";
    /** The row the last save was for. */
    readonly row?: LocalOnboardingKeyRowId;
    /** Why it was refused, when it was. */
    readonly error?: string;
}

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
    /** The column as a whole: one provider that works is enough to go on. */
    readonly authentication: "checking" | "valid" | "invalid" | "error";
    /** Every provider configured, each with its own check. */
    readonly providers: readonly LocalOnboardingCustomProvider[];
    /** Why nothing could be checked, when the configuration could not be read. */
    readonly message?: string;
}

/** One configured provider and how its check went. */
export interface LocalOnboardingCustomProvider {
    readonly id: string;
    /** Its display name, or its kind and ID, for example "Bedrock · corp-sso". */
    readonly name: string;
    /** What kind it is, as a person names it, for example "Bedrock". */
    readonly kind: string;
    /** The row that counts it as one of its accounts, by its type in `happy.toml`. */
    readonly row: LocalOnboardingProviderRowId;
    readonly authentication: "checking" | "valid" | "error";
    /** Why it failed, when it did. */
    readonly message?: string;
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
          /** Adding an account from an API key or AWS keys. */
          readonly keyAdd?: LocalOnboardingKeyAdd;
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
    /** Opens one row's dialog with the page, for the Blueprint. */
    readonly providerDialogOpen?: LocalOnboardingProviderRowId;
    /** The way that dialog opens on, for the Blueprint. Absent, the plan. */
    readonly providerDialogWay?: LocalOnboardingProviderWay;
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
    /** A Connect your AI command or prompt was copied. */
    onCommandCopy?(copy: LocalOnboardingCommandCopy): void;
    onHappyMobileConnect(): void;
    onHappyMobileSkip(): void;
    /** Both pairing methods, shown side by side while linking. */
    readonly happyMobilePairingOptions: DesktopMobilePairingOptions;
    /** Asks Happy Agent to run Codex's, Grok's or Antigravity's own sign-in. */
    onAssistantSignIn?(assistant: LocalOnboardingAssistantId): void;
    /** Hands the code a vendor's page showed to the sign-in waiting for it. */
    onAssistantSignInCode?(assistant: LocalOnboardingAssistantId, code: string): void;
    /** Asks Happy Agent to install a missing assistant from its vendor. */
    onAssistantInstall?(assistant: LocalOnboardingAssistantId): void;
    /** Stops the install or sign-in going on for one assistant. */
    onAssistantConnectCancel?(assistant: LocalOnboardingAssistantId): void;
    /** A pasted Claude setup token, for Happy Agent to keep. */
    onClaudeTokenSubmit?(token: string): void;
    /** The Claude dialog opened again: forget how the last save went. */
    onClaudeTokenReset?(): void;
    /** An API key or AWS keys, for Happy Agent to add as a new account. */
    onKeyAdd?(credential: LocalOnboardingKeyCredential): void;
    /** A dialog opened again: forget how the last key save went. */
    onKeyAddReset?(): void;
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
const HAPPY_DOCS = "~/.happy/docs";

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
        /** Whose page the sign-in opens, for example "Google". */
        vendor: string;
        /** The row's line while nothing is connected: what it signs in with. */
        offer: string;
        /** The vendor's sign-in page shows a code to paste back into Happy. */
        pastesCode: boolean;
        /** Signing in with that plan, as the dialog's choice names it. */
        plan: string;
        planNote: string;
        /** An API key instead, where the assistant takes one. */
        key?: LocalOnboardingApiKey;
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
        vendor: "Claude",
        offer: "Your Claude plan, or an Anthropic API key",
        pastesCode: false,
        plan: "Claude plan",
        planNote: "Uses the Claude plan you already pay for, through a token from Claude Code.",
        key: {
            keysUrl: "https://console.anthropic.com/settings/keys",
            label: "Anthropic API key",
            placeholder: "sk-ant-api03-…",
            type: "claude",
            vendor: "Anthropic",
        },
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
        vendor: "OpenAI",
        offer: "Your ChatGPT plan, or an OpenAI API key",
        pastesCode: false,
        plan: "ChatGPT plan",
        planNote: "Uses the ChatGPT plan you already pay for. No key needed.",
        key: {
            keysUrl: "https://platform.openai.com/api-keys",
            label: "OpenAI API key",
            placeholder: "sk-…",
            type: "codex",
            vendor: "OpenAI",
        },
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
        vendor: "xAI",
        offer: "Your Grok plan, or an xAI API key",
        pastesCode: false,
        plan: "Grok plan",
        planNote: "Uses the Grok plan you already pay for. No key needed.",
        key: {
            keysUrl: "https://console.x.ai",
            label: "xAI API key",
            placeholder: "xai-…",
            type: "grok",
            vendor: "xAI",
        },
    },
    antigravity: {
        command: "agy",
        install: {
            posix: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
            powershell: "irm https://antigravity.google/cli/install.ps1 | iex",
        },
        // Antigravity signs in with a Google account to Gemini, whose mark it carries.
        mark: "gemini",
        name: "Antigravity",
        // agy has no sign-in command: its first prompt while signed out signs in.
        signIn: "agy",
        vendor: "Google",
        offer: "Your Google AI plan",
        pastesCode: true,
        plan: "Google AI plan",
        planNote: "Uses the Google AI plan you already pay for. No key needed.",
    },
};

/**
 * The rows after the assistants: model access no assistant signs in to.
 * Bedrock takes AWS keys here; a custom endpoint is found and set up by the
 * person's own coding agent from one prompt.
 */
const OTHERS = {
    bedrock: {
        mark: { kind: "ionicon", name: "cloud-outline" },
        name: "Amazon Bedrock",
        offer: "AWS keys, billed to your AWS account",
    },
    custom: {
        mark: { kind: "ionicon", name: "code-slash-outline" },
        name: "Custom endpoint",
        offer: "Any server that speaks OpenAI’s API",
    },
} as const satisfies Record<
    "bedrock" | "custom",
    { readonly name: string; readonly mark: SetupProviderMark; readonly offer: string }
>;

/**
 * Everything the person's coding agent needs to set a custom endpoint up on
 * its own: where to look, where it goes, and how to apply it. Nothing in it
 * asks the person for anything.
 */
const CUSTOM_ENDPOINT_PROMPT = `Set up Happy Agent on this computer to use my custom model endpoint, and do all of it yourself without asking me to paste a key or anything else. Find the endpoint's base URL, its API key and the models it serves: look in my environment variables, the env block of ~/.claude/settings.json, ~/.codex/config.toml, and any gateway or proxy configuration on this machine. Add it to Happy Agent's user happy.toml as the matching provider (an OpenAI-compatible endpoint, or a base URL for Claude Code or Codex), using api_key_env when the key is already in an environment variable. Then reload Happy Agent as the guide's "Applying configuration changes" says, and check that the provider works. If something can't be found, tell me exactly what is missing. Guide: ${HAPPY_DOCS}/configuration.md (OpenAI-compatible endpoints, Providers).`;

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

/** What a Connect your AI row can ask the screen to do. */
interface ProviderRowHandlers {
    /** Opens the row's dialog, on the way given or the plan. */
    readonly onOpen: (row: LocalOnboardingProviderRowId, way?: LocalOnboardingProviderWay) => void;
}

/** The accounts configured in `happy.toml` that one row counts, and how their checks went. */
function rowAccounts(custom: LocalOnboardingCustom, row: LocalOnboardingProviderRowId) {
    const providers = custom.providers.filter((provider) => provider.row === row);
    const failed = providers.find((provider) => provider.authentication === "error");
    return {
        checking: providers.some((provider) => provider.authentication === "checking"),
        // One line has no room for code, so a command it quotes reads as words.
        ...(failed
            ? {
                  failed: `${failed.name}: ${(failed.message ?? "Couldn't verify").replaceAll("`", "")}`,
              }
            : {}),
        valid: providers.filter((provider) => provider.authentication === "valid").length,
    };
}

/**
 * One assistant as its row says it. Every row opens its dialog, connected or
 * not. A sign-in already on this computer is one account, and each provider
 * of its type in `happy.toml` that works is another. "Add another" opens the
 * dialog on the API key, the one way this window offers to a second account;
 * an assistant without a key way keeps it unpressable.
 */
function assistantRowProject(
    assistant: LocalOnboardingAssistant,
    custom: LocalOnboardingCustom,
    handlers: ProviderRowHandlers,
): SetupProviderRow {
    const vendor = ASSISTANTS[assistant.id];
    const operation = assistant.connect.operation;
    const accounts = rowAccounts(custom, assistant.id);
    const row = {
        id: assistant.id,
        mark: { kind: "assistant", name: vendor.mark } as const,
        name: vendor.name,
        onOpen: () => handlers.onOpen(assistant.id),
    };
    const count = accounts.valid + (assistant.authentication === "valid" ? 1 : 0);
    if (count > 0)
        return {
            ...row,
            accounts: count,
            detail: vendor.offer,
            ...(vendor.key ? { onAddAnother: () => handlers.onOpen(assistant.id, "key") } : {}),
            status: "connected",
        };
    if (assistant.authentication === "checking" || accounts.checking)
        return { ...row, detail: vendor.offer, status: "checking" };
    switch (operation?.status) {
        case "running":
            return {
                ...row,
                detail: operation.kind === "install" ? "Installing…" : "Signing in…",
                status: "working",
            };
        case "waiting":
            return { ...row, detail: `Waiting for you at ${vendor.vendor}`, status: "waiting" };
        case "failed":
            return { ...row, detail: operation.message, status: "failed" };
    }
    if (assistant.authentication === "error")
        return { ...row, detail: assistant.message ?? "Couldn't verify", status: "failed" };
    if (accounts.failed) return { ...row, detail: accounts.failed, status: "failed" };
    return { ...row, detail: vendor.offer, status: "idle" };
}

/**
 * Bedrock or a custom endpoint as its row says it: how many of its kind in
 * `happy.toml` work, or why the one that does not failed. A configuration
 * that could not be read at all is said on the custom endpoint's row.
 */
function otherRowProject(
    id: "bedrock" | "custom",
    custom: LocalOnboardingCustom,
    handlers: ProviderRowHandlers,
): SetupProviderRow {
    const other = OTHERS[id];
    const accounts = rowAccounts(custom, id);
    const row = {
        id,
        mark: other.mark,
        name: other.name,
        onOpen: () => handlers.onOpen(id),
    };
    if (accounts.valid > 0)
        return {
            ...row,
            accounts: accounts.valid,
            detail: other.offer,
            onAddAnother: () => handlers.onOpen(id),
            status: "connected",
        };
    if (
        accounts.checking ||
        (custom.authentication === "checking" && custom.providers.length === 0)
    )
        return { ...row, detail: other.offer, status: "checking" };
    if (accounts.failed) return { ...row, detail: accounts.failed, status: "failed" };
    if (id === "custom" && custom.authentication === "error" && custom.providers.length === 0)
        return {
            ...row,
            detail: custom.message ?? "Couldn't verify your custom setup.",
            status: "failed",
        };
    return { ...row, detail: other.offer, status: "idle" };
}

/** The rows shown before authentication resolves, each still being checked. */
const CHECKING_ROWS: readonly SetupProviderRow[] = [
    ...Object.entries(ASSISTANTS).map(
        ([id, assistant]): SetupProviderRow => ({
            detail: assistant.offer,
            id,
            mark: { kind: "assistant", name: assistant.mark },
            name: assistant.name,
            status: "checking",
        }),
    ),
    ...Object.entries(OTHERS).map(
        ([id, other]): SetupProviderRow => ({
            detail: other.offer,
            id,
            mark: other.mark,
            name: other.name,
            status: "checking",
        }),
    ),
];

interface MachineSetupProjection {
    readonly rows?: readonly SetupProviderRow[];
    readonly copy?: string;
    /** Whether anything found on this machine can actually be used to work. */
    readonly hasValidAuthentication: boolean;
    readonly status?: SetupPageStatus;
    readonly title: string;
}

const SETUP_COPY = "One-time download for this machine.";
/**
 * Connect your AI says one thing from the moment it opens: the rows are where
 * it stands, so the words above them never change while checks come back.
 */
const SUBSCRIPTIONS_TITLE = "Connect your AI";
const SUBSCRIPTIONS_COPY = "Sign in to one you already use to get started. You can add more later.";

function machineSetupProject(
    view: LocalOnboardingView,
    handlers: ProviderRowHandlers,
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
    // While anything is checked its row holds a spinner; there is no status
    // line to appear and go again under the subtitle.
    if (view.kind === "examining")
        return {
            rows: CHECKING_ROWS,
            copy: SUBSCRIPTIONS_COPY,
            hasValidAuthentication: false,
            title: SUBSCRIPTIONS_TITLE,
        };
    if (view.kind === "provider-authentication")
        return {
            rows: [
                ...view.assistants.map((assistant) =>
                    assistantRowProject(assistant, view.custom, handlers),
                ),
                otherRowProject("bedrock", view.custom, handlers),
                otherRowProject("custom", view.custom, handlers),
            ],
            copy: SUBSCRIPTIONS_COPY,
            hasValidAuthentication:
                view.custom.authentication === "valid" ||
                view.assistants.some((assistant) => assistant.authentication === "valid"),
            title: SUBSCRIPTIONS_TITLE,
        };
    return undefined;
}

/** Which row's dialog is open, on which way, and whether that row was connected then. */
interface ProviderDialogOpen {
    readonly row: LocalOnboardingProviderRowId;
    readonly way?: LocalOnboardingProviderWay;
    /** A sign-in finishing closes the dialog it was started from, not one opened on it. */
    readonly connected: boolean;
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
    // Which row's dialog is open is this screen's own passing state; what
    // installing, signing in and saving a token do belongs to setup.
    const connectedNow = (row: LocalOnboardingProviderRowId) =>
        view.kind === "provider-authentication" &&
        view.assistants.some(
            (assistant) => assistant.id === row && assistant.authentication === "valid",
        );
    const [dialogOpen, dialogOpenSet] = useState<ProviderDialogOpen | undefined>(() =>
        props.providerDialogOpen
            ? {
                  connected: connectedNow(props.providerDialogOpen),
                  row: props.providerDialogOpen,
                  ...(props.providerDialogWay ? { way: props.providerDialogWay } : {}),
              }
            : undefined,
    );
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
    const machineSetup = machineSetupProject(view, {
        onOpen: (row, way) => {
            if (row === "claude") props.onClaudeTokenReset?.();
            props.onKeyAddReset?.();
            dialogOpenSet({ connected: connectedNow(row), row, ...(way ? { way } : {}) });
        },
    });
    const providerDialog = (() => {
        if (!dialogOpen || view.kind !== "provider-authentication") return null;
        const common = {
            installShell: view.installShell,
            ...(view.keyAdd ? { keyAdd: view.keyAdd } : {}),
            ...(props.onKeyAdd ? { onKeyAdd: props.onKeyAdd } : {}),
            ...(props.onExternalOpen ? { onExternalOpen: props.onExternalOpen } : {}),
            onClose: () => dialogOpenSet(undefined),
            ...(dialogOpen.way ? { way: dialogOpen.way } : {}),
            ...(props.onCommandCopy
                ? {
                      onPromptCopy: () =>
                          props.onCommandCopy?.({
                              assistant: dialogOpen.row,
                              kind: "agent-prompt",
                          }),
                  }
                : {}),
        };
        // Keys saved are the end of what a key form asked.
        if (view.keyAdd?.phase === "saved" && view.keyAdd.row === dialogOpen.row) return null;
        if (dialogOpen.row === "custom")
            return (
                <LocalOnboardingProviderDialog
                    {...common}
                    target={{
                        kind: "custom",
                        mark: OTHERS.custom.mark,
                        name: OTHERS.custom.name,
                        prompt: CUSTOM_ENDPOINT_PROMPT,
                    }}
                />
            );
        if (dialogOpen.row === "bedrock")
            return (
                <LocalOnboardingProviderDialog
                    {...common}
                    target={{
                        kind: "bedrock",
                        mark: OTHERS.bedrock.mark,
                        name: OTHERS.bedrock.name,
                    }}
                />
            );
        const opened = view.assistants.find((assistant) => assistant.id === dialogOpen.row);
        // A sign-in or a saved token finishing is the end of what the dialog
        // asked; one opened on a connected row stays until it is closed.
        if (
            !opened ||
            (!dialogOpen.connected &&
                (opened.authentication === "valid" ||
                    (opened.id === "claude" && claudeToken?.phase === "saved")))
        )
            return null;
        return (
            <LocalOnboardingProviderDialog
                {...common}
                {...(claudeToken ? { claudeToken } : {})}
                {...(props.onAssistantConnectCancel
                    ? { onCancel: props.onAssistantConnectCancel }
                    : {})}
                {...(props.onClaudeTokenSubmit
                    ? { onClaudeTokenSubmit: props.onClaudeTokenSubmit }
                    : {})}
                {...(props.onAssistantInstall ? { onInstall: props.onAssistantInstall } : {})}
                {...(props.onAssistantSignIn ? { onSignIn: props.onAssistantSignIn } : {})}
                {...(props.onAssistantSignInCode
                    ? { onSignInCode: props.onAssistantSignInCode }
                    : {})}
                target={{ assistant: opened, kind: "assistant", vendor: ASSISTANTS[opened.id] }}
            />
        );
    })();

    if (machineSetup)
        return (
            <>
                <SetupPage
                    {...frame}
                    {...(machineSetup.rows
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
                    {...(machineSetup.rows
                        ? { placement: "centered" as const }
                        : { scene: "owl" as const })}
                    {...(machineSetup.status ? { status: machineSetup.status } : {})}
                    title={machineSetup.title}
                >
                    {machineSetup.rows ? (
                        <div className="happy-local-onboarding__providers">
                            <SetupProviderRows
                                data-testid="local-onboarding-assistants"
                                rows={machineSetup.rows}
                            />
                        </div>
                    ) : undefined}
                </SetupPage>
                {/* Beside the page, not inside its scroll area: in there the dim would
                paint under the page's pinned corners, the node and Ask a question. */}
                {providerDialog}
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
