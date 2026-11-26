import {
    type HappyAgentComputeApproval,
    type HappyAgentComputeMachine,
    type HappyAgentComputeMachineAdd,
    type HappyAgentComputeSnapshot,
    type HappyAgentComputeStore,
} from "happy-desktop-state";
import {
    HappyAgentComputeMachineAddDialog,
    HappyAgentComputeMachineDeleteDialog,
    HappyAgentComputeMachineDialog,
    HappyAgentComputeSettings,
    type HappyAgentComputeJoinRequestRow,
    type HappyAgentComputeMachineAddStage,
    type HappyAgentComputeMachineRow,
    type HappyAgentComputeSystemView,
} from "happy-desktop-ui";

/** Settings › Compute on Happy Cloud, composed from its store. */
export function AppComputeSettings(props: {
    readonly snapshot: HappyAgentComputeSnapshot;
    readonly store: HappyAgentComputeStore;
}) {
    const { snapshot, store } = props;
    const add = snapshot.machineAdd;
    const detail = snapshot.machineDetail;
    const deletion = snapshot.machineDeletion;
    const opened = detail
        ? snapshot.machines.find((machine) => machine.id === detail.machineId)
        : undefined;
    return (
        <>
            <HappyAgentComputeSettings
                {...(snapshot.error ? { error: snapshot.error.message } : {})}
                {...(snapshot.actionError ? { actionError: snapshot.actionError.message } : {})}
                {...(snapshot.actionNotice ? { actionNotice: snapshot.actionNotice } : {})}
                add={
                    snapshot.access === "manage"
                        ? "any"
                        : snapshot.access === "use"
                          ? "private"
                          : "none"
                }
                loading={snapshot.loading}
                machines={snapshot.machines.map(machineRow)}
                onMachineAdd={() => store.machineAddOpen()}
                onMachineOpen={(machineId) => store.machineDetailOpen(machineId)}
                onRequestAnswer={(key, approve) =>
                    store.approvalAnswer(key, approve ? "approve" : "deny")
                }
                requests={snapshot.approvals.map((approval) => requestRow(approval, snapshot))}
            />
            {add ? (
                <HappyAgentComputeMachineAddDialog
                    accesses={snapshot.access === "manage" ? "any" : "private"}
                    onAccessChange={(access) => store.machineAddAccessUpdate(access)}
                    onClose={() => store.machineAddClose()}
                    onConcurrencyChange={(value) => store.machineAddConcurrencyUpdate(value)}
                    onCreate={() => store.machineAddCreate()}
                    onLimitedChange={(limited) => store.machineAddLimitedUpdate(limited)}
                    stage={addStage(add)}
                />
            ) : null}
            {/* The confirmation takes the computer's own dialog's place while it is up. */}
            {deletion ? (
                <HappyAgentComputeMachineDeleteDialog
                    {...(deletion.step === "failed" ? { error: deletion.error.message } : {})}
                    deleting={deletion.step === "deleting"}
                    name={deletion.name}
                    onClose={() => store.machineDeleteClose()}
                    onDelete={() => store.machineDelete(deletion.machineId)}
                />
            ) : detail && opened ? (
                <HappyAgentComputeMachineDialog
                    {...(detail.step === "failed" ? { error: detail.error.message } : {})}
                    {...(snapshot.actionError ? { actionError: snapshot.actionError.message } : {})}
                    agents={opened.agents.map((agent) => ({
                        id: agent.agentId,
                        title: agent.title ?? "An agent you can't open",
                        removing: snapshot.agentRemovals.has(`${opened.id}/${agent.agentId}`),
                    }))}
                    draft={detail.draft}
                    commandDefaults={
                        opened.commandLimits
                            ? {
                                  memory: gibText(opened.commandLimits.defaultMemoryBytes),
                                  processes: String(opened.commandLimits.defaultProcesses),
                              }
                            : null
                    }
                    machine={machineRow(opened)}
                    maxConcurrency={opened.maxConcurrency}
                    onCommandMemoryChange={(value) => store.machineCommandMemoryUpdate(value)}
                    onCommandProcessesChange={(value) => store.machineCommandProcessesUpdate(value)}
                    onAgentRemove={(agentId) => store.machineAgentRemove(opened.id, agentId)}
                    onClose={() => store.machineDetailClose()}
                    onDelete={() => store.machineDeleteOpen(opened.id)}
                    onConcurrencyChange={(value) => store.machineConcurrencyUpdate(value)}
                    onDescriptionChange={(value) => store.machineDescriptionUpdate(value)}
                    onLimitedChange={(limited) => store.machineLimitedUpdate(limited)}
                    onNameChange={(value) => store.machineNameUpdate(value)}
                    onSave={() => store.machineSave()}
                    saving={detail.step === "saving"}
                    system={systemView(opened)}
                />
            ) : null}
        </>
    );
}

function addStage(add: HappyAgentComputeMachineAdd): HappyAgentComputeMachineAddStage {
    switch (add.step) {
        case "shown": {
            const { expiresAt: _expiresAt, notice, ...install } = add.install;
            return {
                step: "install",
                install: {
                    ...install,
                    ...(notice === null ? {} : { notice }),
                    expires: expiresText(add.install.expiresAt),
                },
            };
        }
        case "failed":
            return { step: "form", draft: add.draft, creating: false, error: add.error.message };
        case "choosing":
        case "creating":
            return { step: "form", draft: add.draft, creating: add.step === "creating" };
    }
}

const OS_NAMES: Readonly<Record<string, string>> = {
    macos: "macOS",
    linux: "Linux",
    windows: "Windows",
};

function machineRow(machine: HappyAgentComputeMachine): HappyAgentComputeMachineRow {
    const platform = [machine.os ? (OS_NAMES[machine.os] ?? machine.os) : undefined, machine.arch]
        .filter(Boolean)
        .join(" ");
    const detail = [
        machine.hostname !== machine.name ? machine.hostname : undefined,
        platform || undefined,
        machine.status === "online" ? undefined : sinceText(machine.since),
    ]
        .filter(Boolean)
        .join(" · ");
    const owner = machine.access.kind === "private" ? machine.access.owner : null;
    const full = machine.concurrency > 0 && machine.agents.length >= machine.concurrency;
    return {
        id: machine.id,
        name: machine.name,
        status: full && machine.status === "online" ? "full" : machine.status,
        os:
            machine.os === "macos" || machine.os === "linux" || machine.os === "windows"
                ? machine.os
                : "other",
        access: machine.access.kind,
        detail: detail || "No details yet",
        ...(machine.description ? { description: machine.description } : {}),
        ...(owner
            ? {
                  owner:
                      owner.kind === "reader"
                          ? { kind: "reader" }
                          : { kind: "member", name: owner.name },
              }
            : {}),
        agentCount: machine.agents.length,
        concurrency: machine.concurrency,
        ...(machine.boundary.available ? {} : { boundary: { reason: machine.boundary.reason } }),
        manageable: machine.manageable,
    };
}

const GIB = 1024 ** 3;

/** Bytes in GiB, to one decimal where it is not whole, as "7.8". */
function gibText(bytes: number): string {
    const gib = bytes / GIB;
    return Number.isInteger(gib) ? String(gib) : gib.toFixed(1);
}

function systemView(machine: HappyAgentComputeMachine): HappyAgentComputeSystemView {
    const { system, commandLimits } = machine;
    const platform = [
        [machine.os ? (OS_NAMES[machine.os] ?? machine.os) : undefined, system.osVersion]
            .filter(Boolean)
            .join(" "),
        machine.arch,
    ]
        .filter(Boolean)
        .join(" · ");
    const memory = commandLimits
        ? (commandLimits.memoryBytes ?? commandLimits.defaultMemoryBytes)
        : null;
    const processes = commandLimits
        ? (commandLimits.processes ?? commandLimits.defaultProcesses)
        : null;
    return {
        platform: platform || null,
        cpu:
            system.cpuCores === null
                ? null
                : `${String(system.cpuCores)} ${system.cpuCores === 1 ? "core" : "cores"}`,
        memory: system.memoryBytes === null ? null : `${gibText(system.memoryBytes)} GiB`,
        disk: system.diskBytes === null ? null : `${gibText(system.diskBytes)} GiB`,
        supervisor: system.version,
        perCommand:
            memory === null || processes === null
                ? null
                : `${gibText(memory)} GiB, ${String(processes)} processes`,
    };
}

function requestRow(
    approval: HappyAgentComputeApproval,
    snapshot: HappyAgentComputeSnapshot,
): HappyAgentComputeJoinRequestRow {
    const answering = snapshot.approvalAnswers.get(approval.key);
    return {
        key: approval.key,
        agent: approval.agentTitle ?? "An agent",
        machine: approval.computerName ?? "your computer",
        when: sinceText(approval.createdAt) ?? "just now",
        ...(answering ? { answering } : {}),
    };
}

function sinceText(at: number): string | undefined {
    if (at <= 0) return undefined;
    const minutes = Math.round((Date.now() - at) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${String(minutes)} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${String(hours)} h ago`;
    return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
}

function expiresText(at: number): string {
    const minutes = Math.round((at - Date.now()) / 60_000);
    if (minutes <= 0) return "Expired";
    if (minutes < 60) return `Expires in ${String(minutes)} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `Expires in ${String(hours)} ${hours === 1 ? "hour" : "hours"}`;
    return `Expires ${new Date(at).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
