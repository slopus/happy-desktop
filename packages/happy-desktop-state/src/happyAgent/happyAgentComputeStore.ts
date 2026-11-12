import { createStore } from "zustand/vanilla";
import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import { UserError } from "../types.js";
import type { HappyCloudRequest } from "./happyAgentProviderCredentials.js";
import { happyAgentUserError, referencesPreserve } from "./happyAgentSupport.js";

/**
 * How a machine takes agents, fixed by the config on the machine itself:
 * isolated sandboxes, the host shared by every agent, the host held by one
 * agent at a time, or a member's own machine for their own agents.
 */
export type HappyAgentComputeMode = "sandbox" | "shared" | "exclusive" | "private";

export const HAPPY_AGENT_COMPUTE_MODES: readonly HappyAgentComputeMode[] = [
    "sandbox",
    "shared",
    "exclusive",
    "private",
];

/**
 * What the reader may do with compute: add any machine and free a held one
 * (`pools.manage`), use machines and add a private one of their own
 * (`compute.use`), or nothing at all.
 */
export type HappyAgentComputeAccess = "manage" | "use" | "none";

/** Where a machine stands; a revoked machine is no longer listed. */
export type HappyAgentComputeMachineStatus = "online" | "offline" | "draining" | "enrolling";

/** The agent holding an exclusive machine; its title is null when the reader may not see it. */
export interface HappyAgentComputeHolder {
    readonly agentId: string;
    readonly title: string | null;
}

/** Who owns a private machine, as the reader sees them. */
export type HappyAgentComputeOwner =
    | { readonly kind: "reader" }
    | { readonly kind: "member"; readonly userId: string; readonly name: string | null };

/** A machine's mode, with what only that mode carries. */
export type HappyAgentComputeMachineMode =
    | { readonly mode: "sandbox" }
    | { readonly mode: "shared" }
    | { readonly mode: "exclusive"; readonly holder: HappyAgentComputeHolder | null }
    /** `owner` is null for a machine that joined before owners were kept. */
    | { readonly mode: "private"; readonly owner: HappyAgentComputeOwner | null };

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
    readonly mode: HappyAgentComputeMachineMode;
    /** What agents read about it in `list_compute`. */
    readonly description: string | null;
    /** Whether the reader may rename it and change its description. */
    readonly editable: boolean;
    /** Why its sandbox failed its self-test, while it does; shown only to managers. */
    readonly sandboxError: string | null;
    /** When the status last changed, in milliseconds. */
    readonly since: number;
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

/** The one-time install command a new machine joins with. */
export interface HappyAgentComputeInstall {
    readonly mode: HappyAgentComputeMode;
    /** Unix and Windows install commands; null where the server publishes no installer. */
    readonly commands: { readonly unix: string; readonly windows: string } | null;
    /** The join token itself, for an install without the commands. */
    readonly token: string;
    readonly clusterUrl: string;
    /** When the token stops working, in milliseconds. */
    readonly expiresAt: number;
}

/** What a new machine will be: its mode, and the name and description it joins with. */
export interface HappyAgentComputeMachineDraft {
    readonly mode: HappyAgentComputeMode;
    readonly name: string;
    readonly description: string;
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

/** A machine's name and description as the edit dialog holds them. */
export interface HappyAgentComputeMachineEditDraft {
    readonly machineId: string;
    readonly name: string;
    readonly description: string;
}

/** Renaming or describing a machine, while its dialog is open. */
export type HappyAgentComputeMachineEdit =
    | { readonly step: "editing"; readonly draft: HappyAgentComputeMachineEditDraft }
    | { readonly step: "saving"; readonly draft: HappyAgentComputeMachineEditDraft }
    | {
          readonly step: "failed";
          readonly draft: HappyAgentComputeMachineEditDraft;
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
    /** Exclusive machines whose lock is being freed. */
    readonly lockReleases: ReadonlySet<string>;
    readonly machineAdd?: HappyAgentComputeMachineAdd;
    readonly machineEdit?: HappyAgentComputeMachineEdit;
    /** Why the last answer or release did not go through. */
    readonly actionError?: UserError;
    readonly error?: UserError;
}

/**
 * Settings › Compute on Happy Cloud: the computers agents join, the requests to
 * join the reader's private computers, adding a computer, and editing one. The
 * lists are read again on `runners.updated`, `compute.nodes.updated` and
 * `compute.approvals.updated`, and every few seconds while on screen, since a
 * computer going offline is announced by nothing.
 */
export interface HappyAgentComputeStore {
    get(): HappyAgentComputeSnapshot;
    subscribe(listener: () => void): () => void;
    machineAddOpen(): void;
    machineAddClose(): void;
    machineAddModeUpdate(mode: HappyAgentComputeMode): void;
    machineAddNameUpdate(name: string): void;
    machineAddDescriptionUpdate(description: string): void;
    /** Mints the machine's one-time join token and its install commands. */
    machineAddCreate(): void;
    machineEditOpen(machineId: string): void;
    machineEditClose(): void;
    machineEditNameUpdate(name: string): void;
    machineEditDescriptionUpdate(description: string): void;
    machineEditSave(): void;
    /** Frees an exclusive machine from the agent holding it. */
    machineLockRelease(machineId: string): void;
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

function computerStatusOf(value: unknown): HappyAgentComputeMachineStatus | undefined {
    return (["online", "offline", "draining", "enrolling"] as const).find(
        (status) => status === value,
    );
}

function modeOf(value: unknown): HappyAgentComputeMode | undefined {
    return HAPPY_AGENT_COMPUTE_MODES.find((mode) => mode === value);
}

/** Who the reader is and what they may do, for reading the machines they see. */
interface Reader {
    readonly userId: string | undefined;
    readonly access: HappyAgentComputeAccess;
    readonly names: ReadonlyMap<string, string | null>;
}

function computerModeRead(computer: Record<string, unknown>, reader: Reader) {
    const mode = modeOf(computer.mode);
    if (mode === "exclusive") {
        const held = recordOf(computer.exclusiveAgent);
        return {
            mode,
            holder:
                held && typeof held.id === "string"
                    ? { agentId: held.id, title: textOrNull(held.title) }
                    : null,
        } satisfies HappyAgentComputeMachineMode;
    }
    if (mode === "private") {
        const owner = textOrNull(computer.owner);
        return {
            mode,
            owner:
                owner === null
                    ? null
                    : owner === reader.userId
                      ? { kind: "reader" }
                      : { kind: "member", userId: owner, name: reader.names.get(owner) ?? null },
        } satisfies HappyAgentComputeMachineMode;
    }
    return mode === undefined ? undefined : { mode };
}

/** A computer from `/v0/computers`; a revoked one is left out. */
function computerRead(value: unknown, reader: Reader): HappyAgentComputeMachine | undefined {
    const computer = recordOf(value);
    const status = computerStatusOf(computer?.status);
    if (!computer || typeof computer.id !== "string" || !status) return undefined;
    const mode = computerModeRead(computer, reader);
    if (!mode) return undefined;
    return {
        id: computer.id,
        name: textOrNull(computer.name) ?? textOrNull(computer.hostname) ?? computer.id.slice(0, 8),
        status,
        hostname: textOrNull(computer.hostname),
        os: textOrNull(computer.os),
        arch: textOrNull(computer.arch),
        mode,
        description: textOrNull(computer.description),
        editable:
            reader.access === "manage" ||
            (mode.mode === "private" && mode.owner?.kind === "reader"),
        sandboxError: textOrNull(computer.sandboxError),
        since: numberOr(computer.since, 0),
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
    const mode = modeOf(answer?.mode);
    if (!answer || !mode || typeof answer.token !== "string") return undefined;
    const commands = recordOf(answer.commands);
    return {
        mode,
        commands:
            commands && typeof commands.unix === "string" && typeof commands.windows === "string"
                ? { unix: commands.unix, windows: commands.windows }
                : null,
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

/** The fields' trimmed text, or null where it is empty. */
function draftText(value: string): string | null {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
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
        lockReleases: new Set(),
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
        const reader: Reader = { userId, access, names };
        const current = store.getState();
        const { error: _cleared, ...rest } = current;
        store.setState(
            {
                ...rest,
                loading: false,
                access,
                machines: referencesPreserve(
                    current.machines,
                    listRead(computers, "computers", (computer) =>
                        computerRead(computer, reader),
                    ).sort(computerCompare),
                ),
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

    const machineEditDraftUpdate = (change: Partial<HappyAgentComputeMachineEditDraft>): void => {
        const edit = store.getState().machineEdit;
        if (disposed || !edit || edit.step === "saving") return;
        set({ machineEdit: { step: "editing", draft: { ...edit.draft, ...change } } });
    };

    /** Runs a release or an answer, keeping its mark until it settles. */
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
            machineAddSet({
                step: "choosing",
                draft: {
                    // A member may add only a private machine of their own.
                    mode: access === "manage" ? "sandbox" : "private",
                    name: "",
                    description: "",
                },
            });
        },
        machineAddClose() {
            const { machineAdd, ...rest } = store.getState();
            if (disposed || !machineAdd || machineAdd.step === "creating") return;
            store.setState(rest, true);
        },
        machineAddModeUpdate(mode) {
            if (mode !== "private" && store.getState().access !== "manage") return;
            machineAddDraftUpdate({ mode });
        },
        machineAddNameUpdate(name) {
            machineAddDraftUpdate({ name });
        },
        machineAddDescriptionUpdate(description) {
            machineAddDraftUpdate({ description });
        },
        machineAddCreate() {
            const add = store.getState().machineAdd;
            if (disposed || !add || (add.step !== "choosing" && add.step !== "failed")) return;
            const creating: HappyAgentComputeMachineAdd = { step: "creating", draft: add.draft };
            machineAddSet(creating);
            const name = draftText(add.draft.name);
            const description = draftText(add.draft.description);
            void deps
                .request("POST", "v0/computers/join-tokens", {
                    mode: add.draft.mode,
                    ...(name === null ? {} : { name }),
                    ...(description === null ? {} : { description }),
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
        machineEditOpen(machineId) {
            const machine = store.getState().machines.find((entry) => entry.id === machineId);
            if (disposed || !machine?.editable) return;
            set({
                machineEdit: {
                    step: "editing",
                    draft: {
                        machineId,
                        name: machine.name,
                        description: machine.description ?? "",
                    },
                },
            });
        },
        machineEditClose() {
            const { machineEdit, ...rest } = store.getState();
            if (disposed || !machineEdit || machineEdit.step === "saving") return;
            store.setState(rest, true);
        },
        machineEditNameUpdate(name) {
            machineEditDraftUpdate({ name });
        },
        machineEditDescriptionUpdate(description) {
            machineEditDraftUpdate({ description });
        },
        machineEditSave() {
            const { machineEdit: edit, machines } = store.getState();
            if (disposed || !edit || edit.step === "saving") return;
            const draft = edit.draft;
            const machine = machines.find((entry) => entry.id === draft.machineId);
            const name = draftText(draft.name);
            const description = draftText(draft.description);
            if (!machine || name === null) return;
            const body = {
                ...(name === machine.name ? {} : { name }),
                // `null` clears the description.
                ...(description === machine.description ? {} : { description }),
            };
            if (Object.keys(body).length === 0) {
                const { machineEdit: _closed, ...rest } = store.getState();
                store.setState(rest, true);
                return;
            }
            const saving: HappyAgentComputeMachineEdit = { step: "saving", draft };
            set({ machineEdit: saving });
            void deps
                .request("PATCH", `v0/computers/${encodeURIComponent(draft.machineId)}`, body)
                .then(
                    () => {
                        if (disposed || store.getState().machineEdit !== saving) return;
                        const { machineEdit: _closed, ...rest } = store.getState();
                        store.setState(rest, true);
                        load();
                    },
                    (error: unknown) => {
                        if (disposed || store.getState().machineEdit !== saving) return;
                        set({
                            machineEdit: {
                                step: "failed",
                                draft,
                                error: happyAgentUserError(error),
                            },
                        });
                    },
                );
        },
        machineLockRelease(machineId) {
            const snapshot = store.getState();
            if (disposed || snapshot.access !== "manage" || snapshot.lockReleases.has(machineId))
                return;
            set({
                lockReleases: new Set([...snapshot.lockReleases, machineId]),
                actionError: undefined,
            });
            act(
                () =>
                    deps.request(
                        "POST",
                        `v0/computers/${encodeURIComponent(machineId)}/release-lock`,
                        {},
                    ),
                (current) => ({
                    lockReleases: new Set(
                        [...current.lockReleases].filter((entry) => entry !== machineId),
                    ),
                }),
            );
        },
        approvalAnswer(key, answer) {
            const snapshot = store.getState();
            const approval = snapshot.approvals.find((entry) => entry.key === key);
            if (disposed || !approval || snapshot.approvalAnswers.has(key)) return;
            set({
                approvalAnswers: new Map([...snapshot.approvalAnswers, [key, answer]]),
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
    lockReleases: new Set(),
};

/** Where there is no Happy Cloud compute: it lists nothing and never changes. */
export const happyAgentComputeStoreNoop: HappyAgentComputeStore = {
    get: () => INERT_SNAPSHOT,
    subscribe: () => () => undefined,
    machineAddOpen: () => undefined,
    machineAddClose: () => undefined,
    machineAddModeUpdate: () => undefined,
    machineAddNameUpdate: () => undefined,
    machineAddDescriptionUpdate: () => undefined,
    machineAddCreate: () => undefined,
    machineEditOpen: () => undefined,
    machineEditClose: () => undefined,
    machineEditNameUpdate: () => undefined,
    machineEditDescriptionUpdate: () => undefined,
    machineEditSave: () => undefined,
    machineLockRelease: () => undefined,
    approvalAnswer: () => undefined,
    [Symbol.dispose]: () => undefined,
};
