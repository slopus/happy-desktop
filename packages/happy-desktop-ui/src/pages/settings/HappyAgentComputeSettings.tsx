import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { EmptyState } from "../../EmptyState";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Spinner } from "../../Spinner";
import { IconTile } from "../../IconTile";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** How a machine takes agents; the machine's own config decides it. */
export type HappyAgentComputeModeName = "sandbox" | "shared" | "exclusive" | "private";

export type HappyAgentComputeMachineRowStatus =
    | "online"
    /** Online, and an exclusive machine another agent holds. */
    | "busy"
    | "offline"
    | "draining"
    | "enrolling";

/** One machine agents can join, as the list shows it. */
export interface HappyAgentComputeMachineRow {
    readonly id: string;
    readonly name: string;
    readonly status: HappyAgentComputeMachineRowStatus;
    readonly os: "macos" | "linux" | "windows" | "other";
    readonly mode: HappyAgentComputeModeName;
    /** Already worded, for example "build-01.acme.internal · Linux x86_64". */
    readonly detail: string;
    /** What agents read about it. */
    readonly description?: string;
    /** Whose private machine it is: the reader's, or a member's by name where they saved one. */
    readonly owner?:
        | { readonly kind: "reader" }
        | { readonly kind: "member"; readonly name: string | null };
    /** The agent holding an exclusive machine, already worded. */
    readonly heldBy?: string;
    /** Why its sandbox failed its self-test, while it does. */
    readonly sandboxError?: string;
    /** Freeing a held exclusive machine: not for this reader or machine, offered, or under way. */
    readonly release: "none" | "offered" | "releasing";
}

/** An agent asking to join one of the reader's private machines. */
export interface HappyAgentComputeJoinRequestRow {
    readonly key: string;
    /** The agent's title, already worded where the reader may not see it. */
    readonly agent: string;
    readonly machine: string;
    /** Already worded, for example "2 min ago". */
    readonly when: string;
    /** The answer sent and not yet settled. */
    readonly answering?: "approve" | "deny";
}

/** Which machines the reader may add: any mode, only a private one of their own, or none. */
export type HappyAgentComputeAddAccess = "any" | "private" | "none";

export interface HappyAgentComputeSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    readonly add: HappyAgentComputeAddAccess;
    readonly machines: readonly HappyAgentComputeMachineRow[];
    readonly requests: readonly HappyAgentComputeJoinRequestRow[];
    /** Why the last answer or release did not go through. */
    readonly actionError?: string;
    onMachineAdd: () => void;
    onMachineRelease: (machineId: string) => void;
    onRequestAnswer: (key: string, approve: boolean) => void;
}

/**
 * Each mode's name, the sentence that says what it means, and the systems its
 * installer accepts (happy-cluster deploy/README.md). Only private installs
 * without sudo, and only private installs on Windows.
 */
const MODES: Readonly<
    Record<
        HappyAgentComputeModeName,
        {
            readonly label: string;
            readonly description: string;
            /** What running the install command does. */
            readonly install: string;
            readonly systems: "linux" | "unix" | "any";
        }
    >
> = {
    sandbox: {
        label: "Sandbox",
        description:
            "Each agent works in its own isolated sandbox, with optional CPU and memory limits. Linux only.",
        install:
            "Run this on a Linux computer. Sandbox mode is Linux only. It installs the Happy supervisor as root, joins the computer, and gives each agent its own sandbox.",
        systems: "linux",
    },
    shared: {
        label: "Shared",
        description:
            "Every agent works directly on the host. Only other agents' workspaces are hidden. Linux only.",
        install:
            "Run this on a Linux computer. Shared mode is Linux only. It installs the Happy supervisor with sudo and joins the computer in shared mode.",
        systems: "linux",
    },
    exclusive: {
        label: "Exclusive",
        description:
            "One agent at a time works on the host. The rest see it as busy. Linux or macOS.",
        install:
            "Run this on a Linux or macOS computer. It installs the Happy supervisor with sudo and joins the computer in exclusive mode.",
        systems: "unix",
    },
    private: {
        label: "Private",
        description:
            "Your own computer. Only your agents can join, and you approve each one. Linux, macOS or Windows.",
        install:
            "Run this on your own Linux, macOS or Windows computer, signed in as yourself. It needs no sudo: the Happy supervisor runs on your own account, and the computer joins as yours.",
        systems: "any",
    },
};

const MODE_ORDER: readonly HappyAgentComputeModeName[] = [
    "sandbox",
    "shared",
    "exclusive",
    "private",
];

const STATUS_TEXT = {
    online: "Online",
    busy: "In use",
    offline: "Offline",
    draining: "Draining",
    enrolling: "Joining",
} as const;

const OS_GLYPH = {
    macos: "logo-apple",
    linux: "logo-tux",
    windows: "logo-windows",
    other: "server-outline",
} as const;

/** A machine's tile hue, by its operating system. */
const OS_TONE = {
    macos: "gray",
    linux: "orange",
    windows: "blue",
    other: "indigo",
} as const;

function HappyAgentComputeMachineItem(props: {
    readonly machine: HappyAgentComputeMachineRow;
    onRelease: (machineId: string) => void;
}) {
    const machine = props.machine;
    return (
        <Box className="happy-agent-compute__row" data-happy-desktop-ui="compute-machine">
            <IconTile ionicon={OS_GLYPH[machine.os]} tone={OS_TONE[machine.os]} />
            <span className="happy-agent-compute__text">
                <span className="happy-agent-compute__title">
                    <span className="happy-agent-compute__name">{machine.name}</span>
                    <span className="happy-agent-compute__tag" data-mode={machine.mode}>
                        {MODES[machine.mode].label}
                    </span>
                    {machine.owner ? (
                        <span className="happy-agent-compute__tag" data-owner={machine.owner.kind}>
                            {machine.owner.kind === "reader"
                                ? "Yours"
                                : machine.owner.name
                                  ? `${machine.owner.name}'s`
                                  : "A member's"}
                        </span>
                    ) : null}
                </span>
                <span className="happy-agent-compute__meta">{machine.detail}</span>
                {machine.description ? (
                    <span className="happy-agent-compute__description" title={machine.description}>
                        {machine.description}
                    </span>
                ) : null}
                {machine.heldBy ? (
                    <span className="happy-agent-compute__held">{`Held by ${machine.heldBy}`}</span>
                ) : null}
                {machine.sandboxError ? (
                    <span className="happy-agent-compute__fault">
                        {`Sandbox check failed: ${machine.sandboxError}`}
                    </span>
                ) : null}
            </span>
            {machine.release === "none" ? null : (
                <span className="happy-agent-compute__row-actions">
                    <Button
                        loading={machine.release === "releasing"}
                        onClick={() => props.onRelease(machine.id)}
                        size="small"
                        variant="ghost"
                    >
                        Release
                    </Button>
                </span>
            )}
            <span className="happy-agent-compute__status" data-status={machine.status}>
                <span className="happy-agent-compute__dot" />
                {STATUS_TEXT[machine.status]}
            </span>
        </Box>
    );
}

/**
 * Settings › Compute on a Happy Cloud server: the requests to join the
 * reader's private machines, then every machine agents can join with its mode.
 * A manager adds a machine in any mode and frees a held one; a member adds a
 * private machine of their own.
 */
export function HappyAgentComputeSettings(props: HappyAgentComputeSettingsProps) {
    if (props.error)
        return (
            <Banner tone="danger" title="Compute unavailable">
                {props.error}
            </Banner>
        );
    if (props.loading)
        return (
            <Box className="happy-agent-settings__pending">
                <Spinner size={16} />
                <span>Reading the compute…</span>
            </Box>
        );
    if (props.machines.length === 0 && props.requests.length === 0)
        return (
            <Box className="happy-agent-compute__empty">
                <EmptyState
                    {...(props.add === "none"
                        ? {}
                        : {
                              action: {
                                  icon: "plus",
                                  label: "Add computer",
                                  onClick: props.onMachineAdd,
                              },
                          })}
                    description={
                        props.add === "any"
                            ? "Add a computer so agents have somewhere to run."
                            : props.add === "private"
                              ? "No computer has joined this server yet. You can add a private one of your own."
                              : "No computer has joined this server yet, and your role can't add one."
                    }
                    icon="terminal"
                    title="No compute yet"
                />
            </Box>
        );
    return (
        <>
            {props.actionError ? (
                <Banner tone="danger" title="That didn't go through">
                    {props.actionError}
                </Banner>
            ) : null}
            {props.requests.length > 0 ? (
                <HappyAgentSettingsSection
                    description="Your agents are asking to join your private computers. An approved agent can use the computer until it leaves."
                    title="Join requests"
                >
                    <Box
                        className="happy-agent-compute__list"
                        data-happy-desktop-ui="compute-join-requests"
                    >
                        {props.requests.map((request) => (
                            <Box
                                className="happy-agent-compute__row"
                                data-happy-desktop-ui="compute-join-request"
                                key={request.key}
                            >
                                <IconTile ionicon="hand-left-outline" tone="purple" />
                                <span className="happy-agent-compute__text">
                                    <span className="happy-agent-compute__name">
                                        {request.agent}
                                    </span>
                                    <span className="happy-agent-compute__meta" data-wrap="">
                                        {`Wants to join ${request.machine} · ${request.when}`}
                                    </span>
                                </span>
                                <span className="happy-agent-compute__row-actions">
                                    <Button
                                        disabled={request.answering === "approve"}
                                        loading={request.answering === "deny"}
                                        onClick={() => props.onRequestAnswer(request.key, false)}
                                        size="small"
                                        variant="ghost"
                                    >
                                        Deny
                                    </Button>
                                    <Button
                                        disabled={request.answering === "deny"}
                                        loading={request.answering === "approve"}
                                        onClick={() => props.onRequestAnswer(request.key, true)}
                                        size="small"
                                    >
                                        Approve
                                    </Button>
                                </span>
                            </Box>
                        ))}
                    </Box>
                </HappyAgentSettingsSection>
            ) : null}
            <HappyAgentSettingsSection
                description={
                    props.add === "any"
                        ? "Agents choose a computer and join it. Its mode decides who can join and how agents share it."
                        : props.add === "private"
                          ? "Agents choose a computer and join it. You can add a private computer of your own."
                          : "Agents choose a computer and join it. Your role can see them but not add one."
                }
                title="Computers"
            >
                <Box className="happy-agent-compute__list" data-happy-desktop-ui="compute-machines">
                    {props.machines.length === 0 ? (
                        <Box className="happy-agent-compute__none">No computer has joined yet.</Box>
                    ) : (
                        props.machines.map((machine) => (
                            <HappyAgentComputeMachineItem
                                key={machine.id}
                                machine={machine}
                                onRelease={props.onMachineRelease}
                            />
                        ))
                    )}
                </Box>
                {props.add === "none" ? null : (
                    <Box className="happy-agent-compute__actions">
                        <Button
                            icon="plus"
                            onClick={props.onMachineAdd}
                            size="small"
                            variant="secondary"
                        >
                            Add computer
                        </Button>
                    </Box>
                )}
            </HappyAgentSettingsSection>
        </>
    );
}

/** What a new machine will be, as the form holds it. */
export interface HappyAgentComputeMachineAddDraft {
    readonly mode: HappyAgentComputeModeName;
}

/** The one-time install, as the dialog shows it. */
export interface HappyAgentComputeInstallView {
    readonly mode: HappyAgentComputeModeName;
    /** Exactly as the server sent them; null where it publishes no installer. */
    readonly commands: { readonly unix: string; readonly windows: string } | null;
    readonly token: string;
    readonly clusterUrl: string;
    /** Already worded, for example "Expires in 1 hour". */
    readonly expires: string;
}

/** The dialog's two steps: the form, while it is being filled or sent, then the install. */
export type HappyAgentComputeMachineAddStage =
    | {
          readonly step: "form";
          readonly draft: HappyAgentComputeMachineAddDraft;
          readonly creating: boolean;
          readonly error?: string;
      }
    | { readonly step: "install"; readonly install: HappyAgentComputeInstallView };

export interface HappyAgentComputeMachineAddDialogProps {
    /** `private` offers only a private machine; the other modes need admin permission. */
    readonly modes: "any" | "private";
    readonly stage: HappyAgentComputeMachineAddStage;
    onModeChange: (mode: HappyAgentComputeModeName) => void;
    onCreate: () => void;
    onClose: () => void;
}

function HappyAgentComputeCommand(props: {
    readonly label: string;
    readonly text: string;
    readonly copyLabel: string;
}) {
    return (
        <Box className="happy-agent-compute__command" data-happy-desktop-ui="compute-command">
            <Box className="happy-agent-compute__command-head">
                <span>{props.label}</span>
                <CopyButton
                    caption="Copy"
                    className="happy-agent-compute__copy"
                    copiedCaption="Copied"
                    label={props.copyLabel}
                    text={props.text}
                />
            </Box>
            <code className="happy-agent-compute__command-text">{props.text}</code>
        </Box>
    );
}

function HappyAgentComputeInstall(props: { readonly install: HappyAgentComputeInstallView }) {
    const { install } = props;
    const commands = install.commands;
    const systems = MODES[install.mode].systems;
    return (
        <>
            <p className="happy-agent-compute__note">
                {`${MODES[install.mode].install} The command works once. ${install.expires}.`}
            </p>
            {commands === null ? (
                <>
                    <HappyAgentComputeCommand
                        copyLabel="Copy server address"
                        label="Server"
                        text={install.clusterUrl}
                    />
                    <HappyAgentComputeCommand
                        copyLabel="Copy join token"
                        label="Join token"
                        text={install.token}
                    />
                </>
            ) : (
                <>
                    <HappyAgentComputeCommand
                        copyLabel={
                            systems === "linux"
                                ? "Copy Linux command"
                                : "Copy macOS and Linux command"
                        }
                        label={systems === "linux" ? "Linux" : "macOS and Linux"}
                        text={commands.unix}
                    />
                    {systems === "any" ? (
                        <HappyAgentComputeCommand
                            copyLabel="Copy Windows command"
                            label="Windows (PowerShell)"
                            text={commands.windows}
                        />
                    ) : null}
                </>
            )}
        </>
    );
}

/** Adds a machine: its mode, then the one-time command that installs it. */
export function HappyAgentComputeMachineAddDialog(props: HappyAgentComputeMachineAddDialogProps) {
    const stage = props.stage;
    const busy = stage.step === "form" && stage.creating;
    return (
        <ModalOverlay
            onDismiss={() => {
                if (!busy) props.onClose();
            }}
        >
            <Modal
                footer={
                    stage.step === "install" ? (
                        <Button onClick={props.onClose}>Done</Button>
                    ) : (
                        <>
                            <Button disabled={busy} onClick={props.onClose} variant="ghost">
                                Cancel
                            </Button>
                            <Button loading={busy} onClick={props.onCreate}>
                                Create install command
                            </Button>
                        </>
                    )
                }
                icon="terminal"
                onClose={busy ? undefined : props.onClose}
                size="large"
                title="Add a computer"
            >
                <Box
                    className="happy-agent-compute__form"
                    data-happy-desktop-ui="compute-machine-add"
                >
                    {stage.step === "install" ? (
                        <HappyAgentComputeInstall install={stage.install} />
                    ) : (
                        <>
                            {stage.error ? (
                                <Banner tone="danger" title="No install command">
                                    {stage.error}
                                </Banner>
                            ) : null}
                            <Box
                                aria-label="Mode"
                                className="happy-agent-compute__modes"
                                role="radiogroup"
                            >
                                {MODE_ORDER.map((mode) => {
                                    const locked = props.modes === "private" && mode !== "private";
                                    return (
                                        <button
                                            aria-checked={stage.draft.mode === mode}
                                            className="happy-agent-compute__mode"
                                            data-happy-desktop-ui="compute-mode"
                                            disabled={busy || locked}
                                            key={mode}
                                            onClick={() => props.onModeChange(mode)}
                                            role="radio"
                                            type="button"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="happy-agent-compute__radio"
                                            />
                                            <span className="happy-agent-compute__mode-text">
                                                <span className="happy-agent-compute__mode-line">
                                                    <span className="happy-agent-compute__mode-label">
                                                        {MODES[mode].label}
                                                    </span>
                                                    {locked ? (
                                                        <span className="happy-agent-compute__mode-lock">
                                                            Needs admin permission
                                                        </span>
                                                    ) : null}
                                                </span>
                                                <span className="happy-agent-compute__mode-description">
                                                    {MODES[mode].description}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </Box>
                        </>
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
