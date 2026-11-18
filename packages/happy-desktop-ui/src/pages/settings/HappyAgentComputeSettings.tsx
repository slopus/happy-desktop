import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { EmptyState } from "../../EmptyState";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Spinner } from "../../Spinner";
import { IconTile } from "../../IconTile";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** Who a computer is for: the whole team, or one member's own agents. */
export type HappyAgentComputeAccessName = "shared" | "private";

export type HappyAgentComputeMachineRowStatus =
    | "online"
    /** Online, with as many agents on it as it takes at once. */
    | "full"
    | "offline"
    | "draining"
    | "enrolling";

/** One machine agents can join, as the list shows it. */
export interface HappyAgentComputeMachineRow {
    readonly id: string;
    readonly name: string;
    readonly status: HappyAgentComputeMachineRowStatus;
    readonly os: "macos" | "linux" | "windows" | "other";
    readonly access: HappyAgentComputeAccessName;
    /** Already worded, for example "build-01.acme.internal · Linux x86_64". */
    readonly detail: string;
    /** What agents read about it. */
    readonly description?: string;
    /** Whose private machine it is: the reader's, or a member's by name where they saved one. */
    readonly owner?:
        | { readonly kind: "reader" }
        | { readonly kind: "member"; readonly name: string | null };
    /** How many agents are on it now. */
    readonly agentCount: number;
    /** How many agents it takes at once; 0 means no limit. */
    readonly concurrency: number;
    /**
     * Present when it can't keep a restricted command inside its boundary, with
     * the machine's reason where it gave one.
     */
    readonly boundary?: { readonly reason: string | null };
    /** Whether the reader may edit it and remove agents from it. */
    readonly manageable: boolean;
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

/** Which machines the reader may add: shared or private, only a private one of their own, or none. */
export type HappyAgentComputeAddAccess = "any" | "private" | "none";

export interface HappyAgentComputeSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    readonly add: HappyAgentComputeAddAccess;
    readonly machines: readonly HappyAgentComputeMachineRow[];
    readonly requests: readonly HappyAgentComputeJoinRequestRow[];
    /** Why the last answer or removal did not go through. */
    readonly actionError?: string;
    onMachineAdd: () => void;
    onMachineOpen: (machineId: string) => void;
    onRequestAnswer: (key: string, approve: boolean) => void;
}

/** Each access's name and the sentence that says what it means. */
const ACCESSES: Readonly<
    Record<HappyAgentComputeAccessName, { readonly label: string; readonly description: string }>
> = {
    shared: {
        label: "Shared",
        description:
            "For the whole team. Any member's agents can work on it, each in its own workspace.",
    },
    private: {
        label: "Private",
        description: "Just for you. Only your agents can work on it, and you approve each one.",
    },
};

const ACCESS_ORDER: readonly HappyAgentComputeAccessName[] = ["shared", "private"];

const STATUS_TEXT = {
    online: "Online",
    full: "Full",
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

function ownerText(owner: NonNullable<HappyAgentComputeMachineRow["owner"]>): string {
    if (owner.kind === "reader") return "Yours";
    return owner.name ? `${owner.name}'s` : "A member's";
}

function agentsText(machine: HappyAgentComputeMachineRow): string {
    if (machine.concurrency === 0)
        return `${String(machine.agentCount)} ${machine.agentCount === 1 ? "agent" : "agents"} · Unlimited`;
    return `${String(machine.agentCount)} of ${String(machine.concurrency)} ${
        machine.concurrency === 1 ? "agent" : "agents"
    }`;
}

/** What the "Agents at once" field takes, with or without the operator's ceiling. */
function concurrencyHint(max: number | null): string {
    return max === null
        ? "How many agents can work on it at the same time; 0 means no limit."
        : `How many agents can work on it at the same time, from 1 to ${String(max)}.`;
}

/** What a machine's access means, said of its owner where it is someone else's. */
function accessText(machine: HappyAgentComputeMachineRow): string {
    if (machine.access === "shared" || machine.owner?.kind !== "member")
        return ACCESSES[machine.access].description;
    const owner = machine.owner.name ?? "one member";
    return `Just for ${owner}. Only their agents can work on it, and they approve each one.`;
}

function boundaryText(boundary: { readonly reason: string | null }): string {
    const reason = boundary.reason ? `${boundary.reason.replace(/\.$/, "")}. ` : "";
    return `${reason}Only commands with full access run on this computer.`;
}

function HappyAgentComputeTags(props: { readonly machine: HappyAgentComputeMachineRow }) {
    const machine = props.machine;
    return (
        <>
            <span className="happy-agent-compute__tag" data-access={machine.access}>
                {ACCESSES[machine.access].label}
            </span>
            {machine.owner ? (
                <span className="happy-agent-compute__tag" data-owner={machine.owner.kind}>
                    {ownerText(machine.owner)}
                </span>
            ) : null}
        </>
    );
}

function HappyAgentComputeMachineItem(props: {
    readonly machine: HappyAgentComputeMachineRow;
    onOpen: (machineId: string) => void;
}) {
    const machine = props.machine;
    return (
        <Box className="happy-agent-compute__row" data-happy-desktop-ui="compute-machine">
            <IconTile ionicon={OS_GLYPH[machine.os]} tone={OS_TONE[machine.os]} />
            <span className="happy-agent-compute__text">
                <span className="happy-agent-compute__title">
                    <span className="happy-agent-compute__name">{machine.name}</span>
                    <HappyAgentComputeTags machine={machine} />
                </span>
                <span className="happy-agent-compute__meta">
                    {`${machine.detail} · ${agentsText(machine)}`}
                </span>
                {machine.description ? (
                    <span className="happy-agent-compute__description" title={machine.description}>
                        {machine.description}
                    </span>
                ) : null}
                {machine.boundary ? (
                    <span
                        className="happy-agent-compute__warning"
                        title={boundaryText(machine.boundary)}
                    >
                        {`Only full-access commands run here.${
                            machine.boundary.reason ? ` ${machine.boundary.reason}` : ""
                        }`}
                    </span>
                ) : null}
            </span>
            <span className="happy-agent-compute__row-actions">
                <Button onClick={() => props.onOpen(machine.id)} size="small" variant="ghost">
                    {machine.manageable ? "Manage" : "Details"}
                </Button>
            </span>
            <span className="happy-agent-compute__status" data-status={machine.status}>
                <span className="happy-agent-compute__dot" />
                {STATUS_TEXT[machine.status]}
            </span>
        </Box>
    );
}

/**
 * Settings › Compute on a Happy Cloud server: the requests to join the
 * reader's private machines, then every machine agents can join with who it is
 * for and how many agents are on it. A manager adds a shared or private
 * machine; a member adds a private machine of their own.
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
                        ? "Agents choose a computer and join it. A shared computer is for the whole team, a private one only for its owner's agents."
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
                                onOpen={props.onMachineOpen}
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

/** An agent on a machine, as its dialog lists it. */
export interface HappyAgentComputeMachineAgentRow {
    readonly id: string;
    /** The agent's title, already worded where the reader may not see it. */
    readonly title: string;
    /** True while it is being taken off the machine. */
    readonly removing: boolean;
}

/** A machine's editable fields, as typed. */
export interface HappyAgentComputeMachineEditDraft {
    readonly name: string;
    readonly description: string;
    readonly concurrency: string;
}

export interface HappyAgentComputeMachineDialogProps {
    readonly machine: HappyAgentComputeMachineRow;
    readonly agents: readonly HappyAgentComputeMachineAgentRow[];
    /** The most agents it may take at once; null when its operator set no ceiling. */
    readonly maxConcurrency: number | null;
    /** Shown only where `machine.manageable`. */
    readonly draft: HappyAgentComputeMachineEditDraft;
    readonly saving: boolean;
    /** Why the last save did not go through. */
    readonly error?: string;
    /** Why the last removal did not go through. */
    readonly actionError?: string;
    onNameChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
    onConcurrencyChange: (value: string) => void;
    onSave: () => void;
    onAgentRemove: (agentId: string) => void;
    onClose: () => void;
}

/**
 * One machine: who it is for, the agents on it, and, for a reader who may
 * manage it, its name, description and how many agents it takes at once.
 */
export function HappyAgentComputeMachineDialog(props: HappyAgentComputeMachineDialogProps) {
    const machine = props.machine;
    const close = (): void => {
        if (!props.saving) props.onClose();
    };
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                footer={
                    machine.manageable ? (
                        <>
                            <Button disabled={props.saving} onClick={close} variant="ghost">
                                Cancel
                            </Button>
                            <Button loading={props.saving} onClick={props.onSave}>
                                Save
                            </Button>
                        </>
                    ) : (
                        <Button onClick={close}>Done</Button>
                    )
                }
                icon="terminal"
                onClose={props.saving ? undefined : close}
                size="large"
                title={machine.name}
            >
                <Box
                    className="happy-agent-compute__form"
                    data-happy-desktop-ui="compute-machine-detail"
                >
                    {props.error ? (
                        <Banner tone="danger" title="Not saved">
                            {props.error}
                        </Banner>
                    ) : props.actionError ? (
                        <Banner tone="danger" title="That didn't go through">
                            {props.actionError}
                        </Banner>
                    ) : null}
                    <Box className="happy-agent-compute__summary">
                        <span className="happy-agent-compute__title">
                            <HappyAgentComputeTags machine={machine} />
                            <span
                                className="happy-agent-compute__status"
                                data-status={machine.status}
                            >
                                <span className="happy-agent-compute__dot" />
                                {STATUS_TEXT[machine.status]}
                            </span>
                        </span>
                        <span className="happy-agent-compute__meta" data-wrap="">
                            {accessText(machine)}
                        </span>
                        <span className="happy-agent-compute__meta" data-wrap="">
                            {machine.detail}
                        </span>
                    </Box>
                    {machine.boundary ? (
                        <Banner tone="warning" title="Restricted commands can't run here">
                            {boundaryText(machine.boundary)}
                        </Banner>
                    ) : null}
                    <Box className="happy-agent-compute__agents">
                        <span className="happy-agent-compute__heading">
                            {machine.concurrency === 0
                                ? `Agents · ${String(machine.agentCount)} · Unlimited`
                                : `Agents · ${String(machine.agentCount)} of ${String(machine.concurrency)}`}
                        </span>
                        <Box
                            className="happy-agent-compute__list"
                            data-happy-desktop-ui="compute-machine-agents"
                        >
                            {props.agents.length === 0 ? (
                                <Box className="happy-agent-compute__none">
                                    No agent is on this computer.
                                </Box>
                            ) : (
                                props.agents.map((agent) => (
                                    <Box
                                        className="happy-agent-compute__agent"
                                        data-happy-desktop-ui="compute-machine-agent"
                                        key={agent.id}
                                    >
                                        <span className="happy-agent-compute__name">
                                            {agent.title}
                                        </span>
                                        {machine.manageable ? (
                                            <Button
                                                loading={agent.removing}
                                                onClick={() => props.onAgentRemove(agent.id)}
                                                size="small"
                                                variant="ghost"
                                            >
                                                Remove
                                            </Button>
                                        ) : null}
                                    </Box>
                                ))
                            )}
                        </Box>
                    </Box>
                    {machine.manageable ? (
                        <>
                            <TextField
                                disabled={props.saving}
                                fullWidth
                                label="Name"
                                onSubmit={props.onSave}
                                onValueChange={props.onNameChange}
                                value={props.draft.name}
                            />
                            <TextField
                                disabled={props.saving}
                                fullWidth
                                hint="What agents read about this computer when they choose one."
                                label="Description"
                                multiline
                                onValueChange={props.onDescriptionChange}
                                rows={3}
                                value={props.draft.description}
                            />
                            <TextField
                                disabled={props.saving}
                                fullWidth
                                hint={concurrencyHint(props.maxConcurrency)}
                                inputMode="numeric"
                                label="Agents at once"
                                onSubmit={props.onSave}
                                onValueChange={props.onConcurrencyChange}
                                value={props.draft.concurrency}
                            />
                        </>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

/** What a new machine will be, as the form holds it. */
export interface HappyAgentComputeMachineAddDraft {
    readonly access: HappyAgentComputeAccessName;
    /** As typed. */
    readonly concurrency: string;
}

/** A system the server publishes an installer for. */
export type HappyAgentComputeSystemName = "linux" | "macos" | "windows";

/** The one-time install, as the dialog shows it. */
export interface HappyAgentComputeInstallView {
    readonly access: HappyAgentComputeAccessName;
    /** 0 means no limit. */
    readonly concurrency: number;
    /** Exactly as the server sent them; null where it publishes no installer. */
    readonly commands: { readonly unix: string; readonly windows: string } | null;
    /** The systems an installer is published for; empty when the server did not say. */
    readonly systems: readonly HappyAgentComputeSystemName[];
    /** What the server says is not available yet. */
    readonly notice?: string;
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
    /** `private` offers only a private machine; a shared one needs admin permission. */
    readonly accesses: "any" | "private";
    readonly stage: HappyAgentComputeMachineAddStage;
    onAccessChange: (access: HappyAgentComputeAccessName) => void;
    onConcurrencyChange: (value: string) => void;
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

/** The unix command's systems by name, as published; both when the server did not say. */
function unixSystemsText(systems: readonly HappyAgentComputeSystemName[]): string {
    const linux = systems.includes("linux");
    const macos = systems.includes("macos");
    if (linux && !macos) return "Linux";
    if (macos && !linux) return "macOS";
    return "macOS and Linux";
}

function HappyAgentComputeInstall(props: { readonly install: HappyAgentComputeInstallView }) {
    const { install } = props;
    const commands = install.commands;
    const unix = unixSystemsText(install.systems);
    const windows = install.systems.length === 0 || install.systems.includes("windows");
    const taking =
        install.concurrency === 0
            ? "taking any number of agents at once"
            : `taking up to ${String(install.concurrency)} ${install.concurrency === 1 ? "agent" : "agents"} at once`;
    const joins =
        install.access === "shared"
            ? `joins the computer for the whole team, ${taking}`
            : `joins the computer as yours, ${taking}`;
    // Without a published installer, the supervisor is set up by hand with the address and token.
    const what =
        commands === null
            ? `This server publishes no install command. Set up the Happy supervisor on the computer${install.access === "private" ? " under your own account" : ""} and give it this server address and join token; it ${joins}. The token works once. ${install.expires}.`
            : install.access === "shared"
              ? `Run this on the computer. It installs the Happy supervisor with sudo and ${joins}. The command works once. ${install.expires}.`
              : `Run this on your own computer, signed in as yourself. It needs no sudo: the Happy supervisor runs on your own account and ${joins}. The command works once. ${install.expires}.`;
    return (
        <>
            <p className="happy-agent-compute__note">{what}</p>
            {install.notice ? (
                <Banner tone="info" title="Not every system yet">
                    {install.notice}
                </Banner>
            ) : null}
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
                        copyLabel={`Copy ${unix} command`}
                        label={unix}
                        text={commands.unix}
                    />
                    {windows ? (
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

/** Adds a machine: who it is for and how many agents it takes, then the one-time command that installs it. */
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
                                aria-label="Who it is for"
                                className="happy-agent-compute__options"
                                role="radiogroup"
                            >
                                {ACCESS_ORDER.map((access) => {
                                    const locked =
                                        props.accesses === "private" && access !== "private";
                                    return (
                                        <button
                                            aria-checked={stage.draft.access === access}
                                            className="happy-agent-compute__option"
                                            data-happy-desktop-ui="compute-access"
                                            disabled={busy || locked}
                                            key={access}
                                            onClick={() => props.onAccessChange(access)}
                                            role="radio"
                                            type="button"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="happy-agent-compute__radio"
                                            />
                                            <span className="happy-agent-compute__option-text">
                                                <span className="happy-agent-compute__option-line">
                                                    <span className="happy-agent-compute__option-label">
                                                        {ACCESSES[access].label}
                                                    </span>
                                                    {locked ? (
                                                        <span className="happy-agent-compute__option-lock">
                                                            Needs admin permission
                                                        </span>
                                                    ) : null}
                                                </span>
                                                <span className="happy-agent-compute__option-description">
                                                    {ACCESSES[access].description}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </Box>
                            <TextField
                                disabled={busy}
                                fullWidth
                                hint={concurrencyHint(null)}
                                inputMode="numeric"
                                label="Agents at once"
                                onSubmit={props.onCreate}
                                onValueChange={props.onConcurrencyChange}
                                value={stage.draft.concurrency}
                            />
                        </>
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
