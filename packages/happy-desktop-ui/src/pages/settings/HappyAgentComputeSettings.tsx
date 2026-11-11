import { Badge } from "../../Badge";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CopyButton } from "../../CopyButton";
import { EmptyState } from "../../EmptyState";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** Sandboxes in use against what the machines hold; `total` is null until all have said. */
export interface HappyAgentComputeCapacityRow {
    readonly used: number;
    readonly total: number | null;
}

/** A pool of machines, as the list shows it. */
export interface HappyAgentComputePoolRow {
    readonly id: string;
    readonly name: string;
    /** The pool work goes to when it names none. */
    readonly default: boolean;
    readonly machines: { readonly total: number; readonly online: number };
    readonly sandboxes: HappyAgentComputeCapacityRow;
}

export type HappyAgentComputeMachineRowStatus = "online" | "offline" | "draining" | "enrolling";

/** One machine work runs on, as the list shows it. */
export interface HappyAgentComputeMachineRow {
    readonly id: string;
    readonly name: string;
    readonly status: HappyAgentComputeMachineRowStatus;
    readonly os: "macos" | "linux" | "windows" | "other";
    /** Already worded, for example "mac-mini.local · macOS arm64 · Default". */
    readonly detail: string;
    readonly sandboxes: HappyAgentComputeCapacityRow;
    /** How many agents are working on it now. */
    readonly agents: number;
    /** Why its sandbox failed its self-test, while it does. */
    readonly sandboxError?: string;
}

export interface HappyAgentComputeSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    /** Whether the reader may see the pools and add machines. */
    readonly manage: boolean;
    /** Empty for a reader who may not manage pools. */
    readonly pools: readonly HappyAgentComputePoolRow[];
    readonly machines: readonly HappyAgentComputeMachineRow[];
    /** Adds a machine to `poolId`, or to the default pool. */
    onMachineAdd: (poolId?: string) => void;
}

const STATUS_TEXT = {
    online: "Online",
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

function capacityText(capacity: HappyAgentComputeCapacityRow): string {
    return capacity.total === null
        ? `${String(capacity.used)} sandboxes in use`
        : `${String(capacity.used)} of ${String(capacity.total)} sandboxes in use`;
}

function poolSummary(pool: HappyAgentComputePoolRow): string {
    const machines =
        pool.machines.total === 0
            ? "No machines"
            : `${String(pool.machines.online)} of ${String(pool.machines.total)} ${
                  pool.machines.total === 1 ? "machine" : "machines"
              } online`;
    return pool.machines.total === 0 ? machines : `${machines} · ${capacityText(pool.sandboxes)}`;
}

function machineLoad(machine: HappyAgentComputeMachineRow): string | undefined {
    if (machine.sandboxes.total === null && machine.sandboxes.used === 0 && machine.agents === 0)
        return undefined;
    const sandboxes =
        machine.sandboxes.total === null
            ? `${String(machine.sandboxes.used)} sandboxes`
            : `${String(machine.sandboxes.used)}/${String(machine.sandboxes.total)} sandboxes`;
    return machine.agents === 0
        ? sandboxes
        : `${sandboxes} · ${String(machine.agents)} ${machine.agents === 1 ? "agent" : "agents"}`;
}

/**
 * Settings › Compute on a Happy Cloud server: the pools agents run in and the
 * machines that joined them. Someone who manages pools adds a machine with a
 * one-time install command; everyone else sees the machines as runners.
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
    if (props.machines.length === 0 && props.pools.length === 0)
        return (
            <Box className="happy-agent-compute__empty">
                <EmptyState
                    description={
                        props.manage
                            ? "Add a machine so agents have somewhere to run."
                            : "No machine has joined this server yet, and your role can't add one."
                    }
                    icon="terminal"
                    title="No compute yet"
                />
            </Box>
        );
    return (
        <>
            {props.manage ? (
                <HappyAgentSettingsSection
                    description="Agents run in a pool's machines. Work that names no pool goes to the default one."
                    title="Pools"
                >
                    <Box
                        className="happy-agent-compute__list"
                        data-happy-desktop-ui="compute-pools"
                    >
                        {props.pools.map((pool) => (
                            <Box
                                className="happy-agent-compute__row"
                                data-happy-desktop-ui="compute-pool"
                                key={pool.id}
                            >
                                <span className="happy-agent-compute__icon">
                                    <Ionicon name="layers-outline" size={16} />
                                </span>
                                <span className="happy-agent-compute__text">
                                    <span className="happy-agent-compute__title">
                                        <span className="happy-agent-compute__name">
                                            {pool.name}
                                        </span>
                                        {pool.default ? <Badge label="Default" /> : null}
                                    </span>
                                    <span className="happy-agent-compute__meta">
                                        {poolSummary(pool)}
                                    </span>
                                </span>
                                <Button
                                    icon="plus"
                                    onClick={() => props.onMachineAdd(pool.id)}
                                    size="small"
                                    variant="ghost"
                                >
                                    Add machine
                                </Button>
                            </Box>
                        ))}
                    </Box>
                </HappyAgentSettingsSection>
            ) : null}
            <HappyAgentSettingsSection
                description={
                    props.manage
                        ? "Every machine that joined a pool, and what it is running now."
                        : "The machines agents on this server run on. Your role can see them but not add or change them."
                }
                title={props.manage ? "Machines" : "Runners"}
            >
                <Box className="happy-agent-compute__list" data-happy-desktop-ui="compute-machines">
                    {props.machines.length === 0 ? (
                        <Box className="happy-agent-compute__none">
                            No machine has joined yet. Add one to a pool to give agents somewhere to
                            run.
                        </Box>
                    ) : (
                        props.machines.map((machine) => {
                            const load = machineLoad(machine);
                            return (
                                <Box
                                    className="happy-agent-compute__row"
                                    data-happy-desktop-ui="compute-machine"
                                    key={machine.id}
                                >
                                    <span className="happy-agent-compute__icon">
                                        <Ionicon name={OS_GLYPH[machine.os]} size={16} />
                                    </span>
                                    <span className="happy-agent-compute__text">
                                        <span className="happy-agent-compute__name">
                                            {machine.name}
                                        </span>
                                        <span className="happy-agent-compute__meta">
                                            {machine.detail}
                                        </span>
                                        {machine.sandboxError ? (
                                            <span className="happy-agent-compute__fault">
                                                {`Sandbox check failed: ${machine.sandboxError}`}
                                            </span>
                                        ) : null}
                                    </span>
                                    {load ? (
                                        <span className="happy-agent-compute__load">{load}</span>
                                    ) : null}
                                    <span
                                        className="happy-agent-compute__status"
                                        data-status={machine.status}
                                    >
                                        <span className="happy-agent-compute__dot" />
                                        {STATUS_TEXT[machine.status]}
                                    </span>
                                </Box>
                            );
                        })
                    )}
                </Box>
                {props.manage && props.pools.length > 0 ? (
                    <Box className="happy-agent-compute__actions">
                        <Button
                            icon="plus"
                            onClick={() => props.onMachineAdd()}
                            size="small"
                            variant="secondary"
                        >
                            Add machine
                        </Button>
                    </Box>
                ) : null}
            </HappyAgentSettingsSection>
        </>
    );
}

export interface HappyAgentComputeMachineAddDialogProps {
    readonly poolId: string;
    readonly pools: readonly { readonly id: string; readonly name: string }[];
    readonly creating: boolean;
    /** The install command, shown once; closing the dialog forgets it. */
    readonly install?: {
        readonly commands: { readonly unix: string; readonly windows: string } | null;
        readonly token: string;
        readonly clusterUrl: string;
        /** Already worded, for example "Expires in 1 hour". */
        readonly expires: string;
    };
    readonly error?: string;
    onPoolChange: (poolId: string) => void;
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

/** Adds a machine: the pool it joins, then the one-time command that installs it there. */
export function HappyAgentComputeMachineAddDialog(props: HappyAgentComputeMachineAddDialogProps) {
    const install = props.install;
    const poolName = props.pools.find((pool) => pool.id === props.poolId)?.name ?? props.poolId;
    return (
        <ModalOverlay
            onDismiss={() => {
                if (!props.creating) props.onClose();
            }}
        >
            <Modal
                footer={
                    install ? (
                        <Button onClick={props.onClose}>Done</Button>
                    ) : (
                        <>
                            <Button
                                disabled={props.creating}
                                onClick={props.onClose}
                                variant="ghost"
                            >
                                Cancel
                            </Button>
                            <Button loading={props.creating} onClick={props.onCreate}>
                                Create install command
                            </Button>
                        </>
                    )
                }
                icon="terminal"
                onClose={props.creating ? undefined : props.onClose}
                size="large"
                title="Add a machine"
            >
                <Box
                    className="happy-agent-compute__form"
                    data-happy-desktop-ui="compute-machine-add"
                >
                    {props.error ? (
                        <Banner tone="danger" title="No install command">
                            {props.error}
                        </Banner>
                    ) : null}
                    {props.pools.length > 1 ? (
                        <Select
                            disabled={props.creating}
                            fullWidth
                            label="Pool"
                            onValueChange={props.onPoolChange}
                            options={props.pools.map((pool) => ({
                                value: pool.id,
                                label: pool.name,
                            }))}
                            value={props.poolId}
                        />
                    ) : null}
                    {install ? (
                        <>
                            <p className="happy-agent-compute__note">
                                {`Run this on the machine. It installs the Happy runner, joins ${poolName}, and starts taking work. The command works once — ${install.expires.toLowerCase()}.`}
                            </p>
                            {install.commands ? (
                                <>
                                    <HappyAgentComputeCommand
                                        copyLabel="Copy macOS and Linux command"
                                        label="macOS and Linux"
                                        text={install.commands.unix}
                                    />
                                    <HappyAgentComputeCommand
                                        copyLabel="Copy Windows command"
                                        label="Windows (PowerShell)"
                                        text={install.commands.windows}
                                    />
                                </>
                            ) : (
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
                            )}
                        </>
                    ) : (
                        <p className="happy-agent-compute__note">
                            {`Creates a one-time command that installs the Happy runner on a Mac, Linux or Windows machine and joins it to ${poolName}. Agents start running there as soon as it is online.`}
                        </p>
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
