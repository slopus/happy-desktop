import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/**
 * Who a computer is for, chosen when it is added and never changed: the whole
 * team, or one member's own agents, each with that member's approval.
 */
export type HappyAgentComputeMachineAccess = "shared" | "private";

export const HAPPY_AGENT_COMPUTE_MACHINE_ACCESSES: readonly HappyAgentComputeMachineAccess[] = [
    "shared",
    "private",
];

/**
 * How many agents a new computer takes at once unless the person says
 * otherwise; 0 means no limit.
 */
export const HAPPY_AGENT_COMPUTE_CONCURRENCY_DEFAULT: Readonly<
    Record<HappyAgentComputeMachineAccess, number>
> = { shared: 0, private: 1 };

/**
 * What the reader may do with compute: add a shared computer and manage every
 * one (`pools.manage`), use computers and add a private one of their own
 * (`compute.use`), or nothing at all.
 */
export type HappyAgentComputeAccess = "manage" | "use" | "none";

/** Where a machine stands; a revoked machine is no longer listed. */
export type HappyAgentComputeMachineStatus = "online" | "offline" | "draining" | "enrolling";

/** An agent placed on a computer; its title is null when the reader may not see it. */
export interface HappyAgentComputeAgent {
    readonly agentId: string;
    readonly title: string | null;
}

/** Who owns a private machine, as the reader sees them. */
export type HappyAgentComputeOwner =
    | { readonly kind: "reader" }
    | { readonly kind: "member"; readonly userId: string; readonly name: string | null };

/** A machine's access, with the owner only a private machine has. */
export type HappyAgentComputeMachineAccessView =
    | { readonly kind: "shared" }
    /** `owner` is null when the server names none. */
    | { readonly kind: "private"; readonly owner: HappyAgentComputeOwner | null };

/**
 * Whether the computer can keep a restricted command inside its boundary. When
 * it cannot, only full-access commands run there.
 */
export type HappyAgentComputeBoundary =
    | { readonly available: true }
    | { readonly available: false; readonly reason: string | null };

/** What a computer's supervisor reported of itself; a field is null where it did not say. */
export interface HappyAgentComputeMachineSystem {
    readonly osVersion: string | null;
    readonly cpuCores: number | null;
    readonly memoryBytes: number | null;
    readonly diskBytes: number | null;
    /** The supervisor's version. */
    readonly version: string | null;
}

/**
 * How much one command may use on a computer: its own setting, null where it
 * follows the server's default, and that default.
 */
export interface HappyAgentComputeCommandLimits {
    readonly memoryBytes: number | null;
    readonly processes: number | null;
    readonly defaultMemoryBytes: number;
    readonly defaultProcesses: number;
}

/** One machine agents can join. */
export interface HappyAgentComputeMachine {
    readonly id: string;
    /** Its hostname unless someone renamed it. */
    readonly name: string;
    readonly status: HappyAgentComputeMachineStatus;
    readonly hostname: string | null;
    /** `macos`, `linux` or `windows`, as the machine reported it. */
    readonly os: string | null;
    readonly arch: string | null;
    readonly access: HappyAgentComputeMachineAccessView;
    /**
     * How many agents it takes at once; it is full once that many are on it.
     * 0 means no limit, and it is never full.
     */
    readonly concurrency: number;
    /** The most `concurrency` may be raised to, when the machine's operator set a ceiling. */
    readonly maxConcurrency: number | null;
    /** The agents on it now. */
    readonly agents: readonly HappyAgentComputeAgent[];
    readonly boundary: HappyAgentComputeBoundary;
    /** What agents read about it in `list_compute`. */
    readonly description: string | null;
    /** Whether the reader may edit it and remove agents from it. */
    readonly manageable: boolean;
    /** When the status last changed, in milliseconds. */
    readonly since: number;
    readonly system: HappyAgentComputeMachineSystem;
    /** Null where the server does not say, as an older one does not. */
    readonly commandLimits: HappyAgentComputeCommandLimits | null;
}

/** An agent waiting for the reader to let it join one of their private machines. */
export interface HappyAgentComputeApproval {
    /** `computerId/agentId`, the one request it is. */
    readonly key: string;
    readonly computerId: string;
    readonly computerName: string | null;
    readonly agentId: string;
    /** Null when the reader may not read that agent's conversation. */
    readonly agentTitle: string | null;
    /** In milliseconds. */
    readonly createdAt: number;
}

/** A system the server publishes an installer for. */
export type HappyAgentComputeSystem = "linux" | "macos" | "windows";

/** The one-time install command a new machine joins with. */
export interface HappyAgentComputeInstall {
    readonly access: HappyAgentComputeMachineAccess;
    /** 0 means no limit. */
    readonly concurrency: number;
    /** Unix and Windows install commands; null where the server publishes no installer. */
    readonly commands: { readonly unix: string; readonly windows: string } | null;
    /** The systems an installer is published for; empty when the server did not say. */
    readonly systems: readonly HappyAgentComputeSystem[];
    /** What the server says is not available yet, in words for a person. */
    readonly notice: string | null;
    /** The join token itself, for an install without the commands. */
    readonly token: string;
    readonly clusterUrl: string;
    /** When the token stops working, in milliseconds. */
    readonly expiresAt: number;
}

/**
 * How many agents a machine takes at once, as chosen: no limit, or the limit
 * as typed, which is kept while no limit is chosen so switching back finds it.
 */
export interface HappyAgentComputeConcurrencyDraft {
    readonly limited: boolean;
    /** As typed; sent while `limited` once it is a whole number in range. */
    readonly concurrency: string;
}

/** What a new machine will be. It joins under its hostname. */
export interface HappyAgentComputeMachineDraft extends HappyAgentComputeConcurrencyDraft {
    readonly access: HappyAgentComputeMachineAccess;
}

/** Adding a machine, while its dialog is open. */
export type HappyAgentComputeMachineAdd =
    | { readonly step: "choosing"; readonly draft: HappyAgentComputeMachineDraft }
    | { readonly step: "creating"; readonly draft: HappyAgentComputeMachineDraft }
    | {
          readonly step: "failed";
          readonly draft: HappyAgentComputeMachineDraft;
          readonly error: UserError;
      }
    /** Shown once; closing the dialog forgets it. */
    | { readonly step: "shown"; readonly install: HappyAgentComputeInstall };

/** A machine's editable fields, as typed. */
export interface HappyAgentComputeMachineEditDraft extends HappyAgentComputeConcurrencyDraft {
    readonly name: string;
    readonly description: string;
    /** Memory per command in GiB, as typed; empty follows the server's default. */
    readonly commandMemory: string;
    /** Processes per command, as typed; empty follows the server's default. */
    readonly commandProcesses: string;
}

/** One machine's dialog, while it is open: its agents, and its fields for a reader who may edit them. */
export type HappyAgentComputeMachineDetail =
    | {
          readonly step: "editing" | "saving";
          readonly machineId: string;
          readonly draft: HappyAgentComputeMachineEditDraft;
      }
    | {
          readonly step: "failed";
          readonly machineId: string;
          readonly draft: HappyAgentComputeMachineEditDraft;
          readonly error: UserError;
      };

/**
 * Deleting a machine, from its confirmation until the server answers. It keeps
 * the machine's name, since the machine may leave the list while the request runs.
 */
export type HappyAgentComputeMachineDeletion =
    | {
          readonly step: "confirming" | "deleting";
          readonly machineId: string;
          readonly name: string;
      }
    | {
          readonly step: "failed";
          readonly machineId: string;
          readonly name: string;
          readonly error: UserError;
      };

export type HappyAgentComputeApprovalAnswer = "approve" | "deny";

export interface HappyAgentComputeSnapshot {
    /** True until the first answer, so "no machines" is never claimed early. */
    readonly loading: boolean;
    readonly access: HappyAgentComputeAccess;
    readonly machines: readonly HappyAgentComputeMachine[];
    /** Requests waiting for the reader's answer, oldest first. */
    readonly approvals: readonly HappyAgentComputeApproval[];
    /** Answers sent and not yet settled, by approval key. */
    readonly approvalAnswers: ReadonlyMap<string, HappyAgentComputeApprovalAnswer>;
    /** Agents being removed from a machine, by `computerId/agentId`. */
    readonly agentRemovals: ReadonlySet<string>;
    readonly machineAdd?: HappyAgentComputeMachineAdd;
    readonly machineDetail?: HappyAgentComputeMachineDetail;
    readonly machineDeletion?: HappyAgentComputeMachineDeletion;
    /** What the reader should know about the last action that went through. */
    readonly actionNotice?: string;
    /** Why the last answer or removal did not go through. */
    readonly actionError?: UserError;
    readonly error?: UserError;
}

/**
 * Settings › Compute on Happy Cloud: the computers agents join, the requests to
 * join the reader's private computers, and adding a computer. The lists are
 * read again on `runners.updated`, `compute.nodes.updated` and
 * `compute.approvals.updated`, and every few seconds while on screen, since a
 * computer going offline is announced by nothing.
 */
export interface HappyAgentComputeStore {
    get(): HappyAgentComputeSnapshot;
    subscribe(listener: () => void): () => void;
    machineAddOpen(): void;
    machineAddClose(): void;
    machineAddAccessUpdate(access: HappyAgentComputeMachineAccess): void;
    /** Chooses no limit, or a limit, keeping the number typed. */
    machineAddLimitedUpdate(limited: boolean): void;
    machineAddConcurrencyUpdate(value: string): void;
    /** Mints the machine's one-time join token and its install commands. */
    machineAddCreate(): void;
    machineDetailOpen(machineId: string): void;
    machineDetailClose(): void;
    machineNameUpdate(value: string): void;
    machineDescriptionUpdate(value: string): void;
    /** Chooses no limit, or a limit, keeping the number typed. */
    machineLimitedUpdate(limited: boolean): void;
    machineConcurrencyUpdate(value: string): void;
    machineCommandMemoryUpdate(value: string): void;
    machineCommandProcessesUpdate(value: string): void;
    /** Saves the open machine's changed fields. */
    machineSave(): void;
    /** Takes an agent off a machine, freeing its place. */
    machineAgentRemove(machineId: string, agentId: string): void;
    /** Asks to confirm deleting a machine the reader may manage. */
    machineDeleteOpen(machineId: string): void;
    machineDeleteClose(): void;
    /**
     * Deletes a machine, which disconnects it at once. It leaves the list, and
     * its dialog closes, only once the server says it is gone.
     */
    machineDelete(machineId: string): void;
    approvalAnswer(key: string, answer: HappyAgentComputeApprovalAnswer): void;
    [Symbol.dispose](): void;
}

const POLL_INTERVAL_MS = 4_000;

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function countOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function sizeOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function systemRead(computer: Record<string, unknown>): HappyAgentComputeMachineSystem {
    const host = recordOf(computer.host);
    return {
        osVersion: textOrNull(computer.osVersion),
        cpuCores: countOrNull(host?.cpuCores),
        memoryBytes: sizeOrNull(host?.totalMemoryBytes),
        diskBytes: sizeOrNull(host?.totalDiskBytes),
        version: textOrNull(computer.version),
    };
}

function commandLimitsRead(
    computer: Record<string, unknown>,
): HappyAgentComputeCommandLimits | null {
    const defaultMemoryBytes = sizeOrNull(computer.defaultCommandMemoryBytes);
    const defaultProcesses = countOrNull(computer.defaultCommandProcesses);
    if (defaultMemoryBytes === null || defaultProcesses === null) return null;
    return {
        memoryBytes: sizeOrNull(computer.commandMemoryBytes),
        processes: countOrNull(computer.commandProcesses),
        defaultMemoryBytes,
        defaultProcesses,
    };
}

const GIB = 1024 ** 3;

/** Memory in GiB as a person types it: whole where it is whole, else to the MiB. */
function commandMemoryText(bytes: number | null): string {
    if (bytes === null) return "";
    const gib = bytes / GIB;
    return Number.isInteger(gib) ? String(gib) : String(Math.round(gib * 1024) / 1024);
}

/**
 * The command limits to send, or why they can't be sent: only what changed,
 * with `null` for a field emptied back to the server's default. The server
 * checks the bounds, which depend on the computer.
 */
function commandLimitsParse(
    draft: HappyAgentComputeMachineEditDraft,
    limits: HappyAgentComputeCommandLimits | null,
): { commandMemoryBytes?: number | null; commandProcesses?: number | null } | UserError {
    if (!limits) return {};
    const memoryText = draft.commandMemory.trim();
    const processesText = draft.commandProcesses.trim();
    const gib = /^\d+(\.\d+)?$/.test(memoryText) ? Number(memoryText) : Number.NaN;
    const memory = memoryText === "" ? null : Math.round(gib * GIB);
    if (memory !== null && !(Number.isSafeInteger(memory) && memory > 0))
        return new UserError("Memory per command is a number of GiB, such as 4 or 0.5.");
    const processes = processesText === "" ? null : Number(processesText);
    if (processes !== null && !(/^\d+$/.test(processesText) && Number.isSafeInteger(processes)))
        return new UserError("Processes per command is a whole number.");
    return {
        ...(memoryText === commandMemoryText(limits.memoryBytes)
            ? {}
            : { commandMemoryBytes: memory }),
        ...(processes === limits.processes ? {} : { commandProcesses: processes }),
    };
}

/** A concurrency limit, where 0 means no limit. */
function limitOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function computerStatusOf(value: unknown): HappyAgentComputeMachineStatus | undefined {
    return (["online", "offline", "draining", "enrolling"] as const).find(
        (status) => status === value,
    );
}

function machineAccessOf(value: unknown): HappyAgentComputeMachineAccess | undefined {
    return HAPPY_AGENT_COMPUTE_MACHINE_ACCESSES.find((access) => access === value);
}

function systemsRead(value: unknown): HappyAgentComputeSystem[] {
    if (!Array.isArray(value)) return [];
    // Published builds are named `os-arch`, such as `linux-x86_64`.
    return (["linux", "macos", "windows"] as const).filter((system) =>
        value.some((entry: unknown) => typeof entry === "string" && entry.startsWith(`${system}-`)),
    );
}

/** The limit a person is offered first when they choose one. */
const CONCURRENCY_LIMIT_SUGGESTED = 8;

/** A typed limit, when it is a whole number of at least 1 and within the ceiling. */
function concurrencyLimitOf(text: string, max: number | null): number | undefined {
    const value = /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
    return Number.isSafeInteger(value) && value >= 1 && (max === null || value <= max)
        ? value
        : undefined;
}

/** The limit suggested when none was typed yet, kept within the ceiling. */
function concurrencyLimitSuggested(max: number | null): string {
    return String(Math.min(CONCURRENCY_LIMIT_SUGGESTED, max ?? CONCURRENCY_LIMIT_SUGGESTED));
}

/**
 * The choice a concurrency opens as: no limit for 0 unless the machine's
 * operator set a ceiling, which no limit would go past.
 */
function concurrencyDraftOf(
    concurrency: number,
    max: number | null,
): HappyAgentComputeConcurrencyDraft {
    if (concurrency > 0) return { limited: true, concurrency: String(concurrency) };
    return { limited: max !== null, concurrency: concurrencyLimitSuggested(max) };
}

/** Choosing a limit keeps the number last typed while it is valid, or suggests one. */
function concurrencyLimitedDraft(
    draft: HappyAgentComputeConcurrencyDraft,
    limited: boolean,
    max: number | null,
): HappyAgentComputeConcurrencyDraft {
    if (!limited || concurrencyLimitOf(draft.concurrency, max) !== undefined)
        return { limited, concurrency: draft.concurrency };
    return { limited, concurrency: concurrencyLimitSuggested(max) };
}

/**
 * The concurrency to send, or why it can't be sent: 0 for no limit, or a whole
 * number from 1 to the ceiling the machine's operator set.
 */
function concurrencyParse(
    draft: HappyAgentComputeConcurrencyDraft,
    max: number | null,
): number | UserError {
    if (!draft.limited) {
        return max === null
            ? 0
            : new UserError(
                  `This computer's operator set a ceiling of ${String(max)} agents at once, so it needs a limit.`,
              );
    }
    const value = concurrencyLimitOf(draft.concurrency, max);
    if (value !== undefined) return value;
    return new UserError(
        max === null
            ? "The limit is a whole number of agents, 1 or more."
            : `The limit is a whole number of agents from 1 to ${String(max)}.`,
    );
}

/** Who the reader is, for reading the machines they see. */
interface Reader {
    readonly userId: string | undefined;
    readonly access: HappyAgentComputeAccess;
    readonly names: ReadonlyMap<string, string | null>;
}

function computerAccessRead(
    computer: Record<string, unknown>,
    reader: Reader,
): HappyAgentComputeMachineAccessView | undefined {
    const access = machineAccessOf(computer.access);
    if (access !== "private") return access === undefined ? undefined : { kind: access };
    const owner = textOrNull(computer.owner);
    return {
        kind: access,
        owner:
            owner === null
                ? null
                : owner === reader.userId
                  ? { kind: "reader" }
                  : { kind: "member", userId: owner, name: reader.names.get(owner) ?? null },
    };
}

function agentRead(value: unknown): HappyAgentComputeAgent | undefined {
    const agent = recordOf(value);
    return agent && typeof agent.id === "string"
        ? { agentId: agent.id, title: textOrNull(agent.title) }
        : undefined;
}

function boundaryRead(value: unknown): HappyAgentComputeBoundary {
    const boundary = recordOf(value);
    return boundary?.available === false
        ? { available: false, reason: textOrNull(boundary.reason) }
        : { available: true };
}

/** A computer from `/v0/computers`; a revoked one is left out. */
function computerRead(value: unknown, reader: Reader): HappyAgentComputeMachine | undefined {
    const computer = recordOf(value);
    const status = computerStatusOf(computer?.status);
    if (!computer || typeof computer.id !== "string" || !status) return undefined;
    const access = computerAccessRead(computer, reader);
    if (!access) return undefined;
    return {
        id: computer.id,
        name: textOrNull(computer.name) ?? textOrNull(computer.hostname) ?? computer.id.slice(0, 8),
        status,
        hostname: textOrNull(computer.hostname),
        os: textOrNull(computer.os),
        arch: textOrNull(computer.arch),
        access,
        concurrency: limitOrNull(computer.concurrency) ?? 1,
        maxConcurrency: countOrNull(computer.maxConcurrency),
        agents: listRead(computer, "agents", agentRead),
        boundary: boundaryRead(computer.boundary),
        description: textOrNull(computer.description),
        manageable:
            reader.access === "manage" ||
            (access.kind === "private" && access.owner?.kind === "reader"),
        since: numberOr(computer.since, 0),
        system: systemRead(computer),
        commandLimits: commandLimitsRead(computer),
    };
}

function approvalRead(value: unknown): HappyAgentComputeApproval | undefined {
    const approval = recordOf(value);
    if (
        !approval ||
        typeof approval.computerId !== "string" ||
        typeof approval.agentId !== "string"
    )
        return undefined;
    return {
        key: `${approval.computerId}/${approval.agentId}`,
        computerId: approval.computerId,
        computerName: textOrNull(approval.computerName),
        agentId: approval.agentId,
        agentTitle: textOrNull(approval.agentTitle),
        createdAt: numberOr(approval.createdAt, 0),
    };
}

function listRead<T>(value: unknown, key: string, read: (item: unknown) => T | undefined): T[] {
    const list = recordOf(value)?.[key];
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown) => {
        const entry = read(item);
        return entry === undefined ? [] : [entry];
    });
}

function installRead(value: unknown): HappyAgentComputeInstall | undefined {
    const answer = recordOf(value);
    const access = machineAccessOf(answer?.access);
    if (!answer || !access || typeof answer.token !== "string") return undefined;
    const commands = recordOf(answer.commands);
    return {
        access,
        concurrency:
            limitOrNull(answer.concurrency) ?? HAPPY_AGENT_COMPUTE_CONCURRENCY_DEFAULT[access],
        commands:
            commands && typeof commands.unix === "string" && typeof commands.windows === "string"
                ? { unix: commands.unix, windows: commands.windows }
                : null,
        systems: systemsRead(answer.platforms),
        notice: textOrNull(answer.notice),
        token: answer.token,
        clusterUrl: typeof answer.clusterUrl === "string" ? answer.clusterUrl : "",
        expiresAt: numberOr(answer.expiresAt, 0),
    };
}

/** Online first, then by name, so the machines that can take work lead. */
function computerCompare(left: HappyAgentComputeMachine, right: HappyAgentComputeMachine): number {
    const online = Number(right.status === "online") - Number(left.status === "online");
    return online !== 0 ? online : left.name.localeCompare(right.name);
}

export function happyAgentComputeStoreCreate(deps: {
    readonly request: HappyCloudRequest;
    readonly sync?: HappyAgentSync;
}): HappyAgentComputeStore {
    const store = createStore<HappyAgentComputeSnapshot>()(() => ({
        loading: true,
        access: "none",
        machines: [],
        approvals: [],
        approvalAnswers: new Map(),
        agentRemovals: new Set(),
    }));
    const listeners = new Set<() => void>();
    let disposed = false;
    let reading = false;
    /** A hint arrived during a read, which may have been answered before it. */
    let readAgain = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let follow: AbortController | undefined;
    /** The reader's own user ID, which never changes for this store. */
    let userId: string | undefined;
    /**
     * Member names by user ID, for the private machines of others a manager
     * sees; null for a member who has saved no name, so they are not asked again.
     */
    let names: ReadonlyMap<string, string | null> = new Map();

    const set = (change: Partial<HappyAgentComputeSnapshot>): void => {
        store.setState(change, false);
    };

    const schedule = (): void => {
        if (disposed || listeners.size === 0 || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            load();
        }, POLL_INTERVAL_MS);
    };

    const failed = (error: unknown): void => {
        if (store.getState().loading) set({ loading: false, error: happyAgentUserError(error) });
    };

    const accessRead = (permissions: unknown): HappyAgentComputeAccess => {
        const granted = recordOf(permissions)?.granted;
        const has = (id: string) => Array.isArray(granted) && granted.includes(id);
        // Every compute read and write needs `compute.use`, managing included.
        if (!has("compute.use")) return "none";
        return has("pools.manage") ? "manage" : "use";
    };

    /** Reads member names only while a machine names an owner it does not know. */
    const namesRead = async (computers: unknown): Promise<void> => {
        const owners = listRead(
            computers,
            "computers",
            (computer) => textOrNull(recordOf(computer)?.owner) ?? undefined,
        );
        if (owners.every((owner) => owner === userId || names.has(owner))) return;
        const members = listRead(await deps.request("GET", "v0/members"), "members", (item) => {
            const member = recordOf(item);
            const id = textOrNull(member?.userId);
            return id ? ([id, textOrNull(member?.name)] as const) : undefined;
        });
        names = new Map([...owners.map((owner) => [owner, null] as const), ...members]);
    };

    const reader = (): Reader => ({ userId, access: store.getState().access, names });

    const read = async (): Promise<void> => {
        const [permissions, profile] = await Promise.all([
            deps.request("GET", "v0/permissions"),
            userId === undefined ? deps.request("GET", "v0/profile") : undefined,
        ]);
        if (profile !== undefined)
            userId = textOrNull(recordOf(recordOf(profile)?.profile)?.userId) ?? undefined;
        const access = accessRead(permissions);
        const [computers, approvals] =
            access === "none"
                ? [undefined, undefined]
                : await Promise.all([
                      deps.request("GET", "v0/computers"),
                      deps.request("GET", "v0/computers/approvals"),
                  ]);
        if (access === "manage") await namesRead(computers);
        if (disposed) return;
        const current = store.getState();
        const { error: _cleared, machineDetail, machineDeletion, ...rest } = current;
        const machines = listRead(computers, "computers", (computer) =>
            computerRead(computer, { userId, access, names }),
        ).sort(computerCompare);
        // A machine revoked while its dialog was open takes the dialog with it.
        const detailKept =
            machineDetail &&
            (machineDetail.step === "saving" ||
                machines.some((machine) => machine.id === machineDetail.machineId));
        store.setState(
            {
                ...rest,
                ...(detailKept ? { machineDetail } : {}),
                // A machine gone while its deletion is asked about takes the question with it.
                ...(machineDeletion &&
                (machineDeletion.step === "deleting" ||
                    machines.some((machine) => machine.id === machineDeletion.machineId))
                    ? { machineDeletion }
                    : {}),
                loading: false,
                access,
                machines: referencesPreserve(current.machines, machines),
                approvals: referencesPreserve(
                    current.approvals,
                    listRead(approvals, "approvals", approvalRead),
                ),
            },
            true,
        );
    };

    function load(): void {
        if (disposed || listeners.size === 0) return;
        if (reading) {
            readAgain = true;
            return;
        }
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        reading = true;
        readAgain = false;
        void read()
            .catch((error: unknown) => {
                if (!disposed) failed(error);
            })
            .finally(() => {
                reading = false;
                if (readAgain) load();
                else schedule();
            });
    }

    const followStart = (): void => {
        const sync = deps.sync;
        if (!sync || follow || disposed) return;
        const active = new AbortController();
        follow = active;
        void (async () => {
            let greeted = false;
            for await (const input of sync.follow({
                signal: active.signal,
                events: ["runners.updated", "compute.nodes.updated", "compute.approvals.updated"],
            })) {
                const greeting = !greeted;
                greeted = true;
                // The first read was sent after this subscription was installed.
                if (input.kind === "error" || (greeting && input.kind !== "update")) continue;
                load();
            }
        })().catch(() => undefined);
    };

    const followStop = (): void => {
        follow?.abort();
        follow = undefined;
    };

    const machineAddSet = (machineAdd: HappyAgentComputeMachineAdd): void => {
        set({ machineAdd });
    };

    /** Changes the draft, which takes back a refusal the earlier draft got. */
    const machineAddDraftUpdate = (change: Partial<HappyAgentComputeMachineDraft>): void => {
        const add = store.getState().machineAdd;
        if (disposed || !add || (add.step !== "choosing" && add.step !== "failed")) return;
        machineAddSet({ step: "choosing", draft: { ...add.draft, ...change } });
    };

    /** Changes the open machine's draft, which takes back a refusal the earlier draft got. */
    const machineDraftUpdate = (change: Partial<HappyAgentComputeMachineEditDraft>): void => {
        const detail = store.getState().machineDetail;
        if (disposed || !detail || detail.step === "saving") return;
        set({
            machineDetail: {
                step: "editing",
                machineId: detail.machineId,
                draft: { ...detail.draft, ...change },
            },
        });
    };

    /** Runs a removal or an answer, keeping its mark until it settles. */
    const act = (
        request: () => Promise<unknown>,
        settle: (snapshot: HappyAgentComputeSnapshot) => Partial<HappyAgentComputeSnapshot>,
    ): void => {
        void request().then(
            () => {
                if (disposed) return;
                set(settle(store.getState()));
                load();
            },
            (error: unknown) => {
                if (disposed) return;
                set({ ...settle(store.getState()), actionError: happyAgentUserError(error) });
            },
        );
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            if (listeners.size === 1) {
                followStart();
                load();
            }
            let released = false;
            return () => {
                if (released) return;
                released = true;
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size > 0) return;
                followStop();
                if (timer !== undefined) clearTimeout(timer);
                timer = undefined;
            };
        },
        machineAddOpen() {
            const access = store.getState().access;
            if (disposed || access === "none") return;
            // A member may add only a private machine of their own.
            const machineAccess = access === "manage" ? "shared" : "private";
            machineAddSet({
                step: "choosing",
                draft: {
                    access: machineAccess,
                    ...concurrencyDraftOf(
                        HAPPY_AGENT_COMPUTE_CONCURRENCY_DEFAULT[machineAccess],
                        null,
                    ),
                },
            });
        },
        machineAddClose() {
            const { machineAdd, ...rest } = store.getState();
            if (disposed || !machineAdd || machineAdd.step === "creating") return;
            store.setState(rest, true);
        },
        machineAddAccessUpdate(access) {
            const snapshot = store.getState();
            const add = snapshot.machineAdd;
            if (access !== "private" && snapshot.access !== "manage") return;
            if (!add || add.step === "shown" || add.draft.access === access) return;
            // An untouched choice follows the access's own default.
            const before = concurrencyDraftOf(
                HAPPY_AGENT_COMPUTE_CONCURRENCY_DEFAULT[add.draft.access],
                null,
            );
            const untouched =
                add.draft.limited === before.limited &&
                add.draft.concurrency.trim() === before.concurrency;
            machineAddDraftUpdate({
                access,
                ...(untouched
                    ? concurrencyDraftOf(HAPPY_AGENT_COMPUTE_CONCURRENCY_DEFAULT[access], null)
                    : {}),
            });
        },
        machineAddLimitedUpdate(limited) {
            const add = store.getState().machineAdd;
            if (!add || add.step === "shown") return;
            machineAddDraftUpdate(concurrencyLimitedDraft(add.draft, limited, null));
        },
        machineAddConcurrencyUpdate(value) {
            machineAddDraftUpdate({ concurrency: value });
        },
        machineAddCreate() {
            const add = store.getState().machineAdd;
            if (disposed || !add || (add.step !== "choosing" && add.step !== "failed")) return;
            const concurrency = concurrencyParse(add.draft, null);
            if (concurrency instanceof UserError) {
                machineAddSet({ step: "failed", draft: add.draft, error: concurrency });
                return;
            }
            const creating: HappyAgentComputeMachineAdd = { step: "creating", draft: add.draft };
            machineAddSet(creating);
            void deps
                .request("POST", "v0/computers/join-tokens", {
                    access: add.draft.access,
                    concurrency,
                })
                .then(
                    (answer) => {
                        if (disposed || store.getState().machineAdd !== creating) return;
                        const install = installRead(answer);
                        machineAddSet(
                            install
                                ? { step: "shown", install }
                                : {
                                      step: "failed",
                                      draft: add.draft,
                                      error: new UserError(
                                          "Happy Cloud didn't send an install command.",
                                      ),
                                  },
                        );
                    },
                    (error: unknown) => {
                        if (disposed || store.getState().machineAdd !== creating) return;
                        machineAddSet({
                            step: "failed",
                            draft: add.draft,
                            error: happyAgentUserError(error),
                        });
                    },
                );
        },
        machineDetailOpen(machineId) {
            const snapshot = store.getState();
            const machine = snapshot.machines.find((entry) => entry.id === machineId);
            if (disposed || !machine || snapshot.machineDetail?.step === "saving") return;
            set({
                machineDetail: {
                    step: "editing",
                    machineId,
                    draft: {
                        name: machine.name,
                        description: machine.description ?? "",
                        ...concurrencyDraftOf(machine.concurrency, machine.maxConcurrency),
                        commandMemory: commandMemoryText(
                            machine.commandLimits?.memoryBytes ?? null,
                        ),
                        commandProcesses:
                            machine.commandLimits?.processes == null
                                ? ""
                                : String(machine.commandLimits.processes),
                    },
                },
            });
        },
        machineDetailClose() {
            const { machineDetail, ...rest } = store.getState();
            if (disposed || !machineDetail || machineDetail.step === "saving") return;
            store.setState(rest, true);
        },
        machineNameUpdate(value) {
            machineDraftUpdate({ name: value });
        },
        machineDescriptionUpdate(value) {
            machineDraftUpdate({ description: value });
        },
        machineLimitedUpdate(limited) {
            const snapshot = store.getState();
            const detail = snapshot.machineDetail;
            const machine = snapshot.machines.find((entry) => entry.id === detail?.machineId);
            if (!detail || !machine) return;
            if (!limited && machine.maxConcurrency !== null) return;
            machineDraftUpdate(
                concurrencyLimitedDraft(detail.draft, limited, machine.maxConcurrency),
            );
        },
        machineConcurrencyUpdate(value) {
            machineDraftUpdate({ concurrency: value });
        },
        machineCommandMemoryUpdate(value) {
            machineDraftUpdate({ commandMemory: value });
        },
        machineCommandProcessesUpdate(value) {
            machineDraftUpdate({ commandProcesses: value });
        },
        machineSave() {
            const snapshot = store.getState();
            const detail = snapshot.machineDetail;
            if (disposed || !detail || detail.step === "saving") return;
            const machine = snapshot.machines.find((entry) => entry.id === detail.machineId);
            if (!machine?.manageable) return;
            const refuse = (error: UserError): void => {
                set({ machineDetail: { ...detail, step: "failed", error } });
            };
            const name = detail.draft.name.trim();
            if (name === "") {
                refuse(new UserError("Give the computer a name."));
                return;
            }
            const description = detail.draft.description.trim();
            const concurrency = concurrencyParse(detail.draft, machine.maxConcurrency);
            if (concurrency instanceof UserError) {
                refuse(concurrency);
                return;
            }
            const commandLimits = commandLimitsParse(detail.draft, machine.commandLimits);
            if (commandLimits instanceof UserError) {
                refuse(commandLimits);
                return;
            }
            const changes = {
                ...(name === machine.name ? {} : { name }),
                ...(description === (machine.description ?? "")
                    ? {}
                    : { description: description === "" ? null : description }),
                ...(concurrency === machine.concurrency ? {} : { concurrency }),
                ...commandLimits,
            };
            const close = (): void => {
                const { machineDetail: _closed, ...rest } = store.getState();
                store.setState(rest, true);
            };
            if (Object.keys(changes).length === 0) {
                close();
                return;
            }
            const saving: HappyAgentComputeMachineDetail = {
                step: "saving",
                machineId: detail.machineId,
                draft: detail.draft,
            };
            set({ machineDetail: saving });
            void deps
                .request("PATCH", `v0/computers/${encodeURIComponent(detail.machineId)}`, changes)
                .then(
                    (answer) => {
                        if (disposed || store.getState().machineDetail !== saving) return;
                        const saved = computerRead(recordOf(answer)?.computer, reader());
                        if (saved) {
                            const current = store.getState();
                            set({
                                machines: current.machines
                                    .map((entry) => (entry.id === saved.id ? saved : entry))
                                    .sort(computerCompare),
                            });
                        }
                        close();
                        load();
                    },
                    (error: unknown) => {
                        if (disposed || store.getState().machineDetail !== saving) return;
                        refuse(happyAgentUserError(error));
                    },
                );
        },
        machineAgentRemove(machineId, agentId) {
            const snapshot = store.getState();
            const key = `${machineId}/${agentId}`;
            const machine = snapshot.machines.find((entry) => entry.id === machineId);
            if (disposed || !machine?.manageable || snapshot.agentRemovals.has(key)) return;
            set({
                agentRemovals: new Set([...snapshot.agentRemovals, key]),
                actionNotice: undefined,
                actionError: undefined,
            });
            act(
                () =>
                    deps.request(
                        "DELETE",
                        `v0/computers/${encodeURIComponent(machineId)}/agents/${encodeURIComponent(agentId)}`,
                    ),
                (current) => ({
                    agentRemovals: new Set(
                        [...current.agentRemovals].filter((entry) => entry !== key),
                    ),
                }),
            );
        },
        machineDeleteOpen(machineId) {
            const snapshot = store.getState();
            const machine = snapshot.machines.find((entry) => entry.id === machineId);
            if (disposed || !machine?.manageable) return;
            if (snapshot.machineDeletion?.step === "deleting") return;
            if (snapshot.machineDetail?.step === "saving") return;
            set({ machineDeletion: { step: "confirming", machineId, name: machine.name } });
        },
        machineDeleteClose() {
            const { machineDeletion, ...rest } = store.getState();
            if (disposed || !machineDeletion || machineDeletion.step === "deleting") return;
            store.setState(rest, true);
        },
        machineDelete(machineId) {
            const snapshot = store.getState();
            const machine = snapshot.machines.find((entry) => entry.id === machineId);
            if (disposed || !machine?.manageable) return;
            if (snapshot.machineDeletion?.step === "deleting") return;
            if (snapshot.machineDetail?.step === "saving") return;
            const deleting: HappyAgentComputeMachineDeletion = {
                step: "deleting",
                machineId,
                name: machine.name,
            };
            set({ machineDeletion: deleting, actionNotice: undefined, actionError: undefined });
            /** Takes the machine, and every dialog about it, out of the snapshot. */
            const forget = (notice: string | undefined): void => {
                const { machineDeletion: _deleted, machineDetail, ...rest } = store.getState();
                store.setState(
                    {
                        ...rest,
                        ...(machineDetail && machineDetail.machineId !== machineId
                            ? { machineDetail }
                            : {}),
                        ...(notice === undefined ? {} : { actionNotice: notice }),
                        machines: rest.machines.filter((entry) => entry.id !== machineId),
                        approvals: rest.approvals.filter((entry) => entry.computerId !== machineId),
                    },
                    true,
                );
                load();
            };
            void deps.request("DELETE", `v0/computers/${encodeURIComponent(machineId)}`).then(
                () => {
                    if (disposed || store.getState().machineDeletion !== deleting) return;
                    forget(undefined);
                },
                (error: unknown) => {
                    if (disposed || store.getState().machineDeletion !== deleting) return;
                    const status =
                        error instanceof HappyCloudRequestRefusal ? error.status : undefined;
                    if (status === 404) {
                        forget(`${machine.name} was already deleted.`);
                        return;
                    }
                    set({
                        machineDeletion: {
                            ...deleting,
                            step: "failed",
                            error:
                                status === 403
                                    ? new UserError("You can't delete this computer.", "forbidden")
                                    : happyAgentUserError(error),
                        },
                    });
                },
            );
        },
        approvalAnswer(key, answer) {
            const snapshot = store.getState();
            const approval = snapshot.approvals.find((entry) => entry.key === key);
            if (disposed || !approval || snapshot.approvalAnswers.has(key)) return;
            set({
                approvalAnswers: new Map([...snapshot.approvalAnswers, [key, answer]]),
                actionNotice: undefined,
                actionError: undefined,
            });
            act(
                () =>
                    deps.request(
                        "POST",
                        `v0/computers/approvals/${encodeURIComponent(approval.computerId)}/${encodeURIComponent(approval.agentId)}`,
                        { approve: answer === "approve" },
                    ),
                (current) => ({
                    approvalAnswers: new Map(
                        [...current.approvalAnswers].filter(([entry]) => entry !== key),
                    ),
                }),
            );
        },
        [Symbol.dispose]() {
            disposed = true;
            followStop();
            if (timer !== undefined) clearTimeout(timer);
            timer = undefined;
        },
    };
}

const INERT_SNAPSHOT: HappyAgentComputeSnapshot = {
    loading: false,
    access: "none",
    machines: [],
    approvals: [],
    approvalAnswers: new Map(),
    agentRemovals: new Set(),
};

/** Where there is no Happy Cloud compute: it lists nothing and never changes. */
export const happyAgentComputeStoreNoop: HappyAgentComputeStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    machineAddOpen: () => undefined,
    machineAddClose: () => undefined,
    machineAddAccessUpdate: () => undefined,
    machineAddLimitedUpdate: () => undefined,
    machineAddConcurrencyUpdate: () => undefined,
    machineAddCreate: () => undefined,
    machineDetailOpen: () => undefined,
    machineDetailClose: () => undefined,
    machineNameUpdate: () => undefined,
    machineDescriptionUpdate: () => undefined,
    machineLimitedUpdate: () => undefined,
    machineConcurrencyUpdate: () => undefined,
    machineCommandMemoryUpdate: () => undefined,
    machineCommandProcessesUpdate: () => undefined,
    machineSave: () => undefined,
    machineAgentRemove: () => undefined,
    machineDeleteOpen: () => undefined,
    machineDeleteClose: () => undefined,
    machineDelete: () => undefined,
    approvalAnswer: () => undefined,
    [Symbol.dispose]: () => undefined,
};
