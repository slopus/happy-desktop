import type {
    HappyAgentComputeApproval,
    HappyAgentComputeMachine,
    HappyAgentComputeMachineAdd,
    HappyAgentComputeSnapshot,
    HappyAgentComputeStore,
} from "happy-desktop-state";
import {
    HappyAgentComputeMachineAddDialog,
    HappyAgentComputeMachineEditDialog,
    HappyAgentComputeSettings,
    type HappyAgentComputeJoinRequestRow,
    type HappyAgentComputeMachineAddStage,
    type HappyAgentComputeMachineRow,
} from "happy-desktop-ui";

/** Settings › Compute on Happy Cloud, composed from its store. */
export function AppComputeSettings(props: {
    readonly snapshot: HappyAgentComputeSnapshot;
    readonly store: HappyAgentComputeStore;
}) {
    const { snapshot, store } = props;
    const add = snapshot.machineAdd;
    const edit = snapshot.machineEdit;
    return (
        <>
            <HappyAgentComputeSettings
                {...(snapshot.error ? { error: snapshot.error.message } : {})}
                {...(snapshot.actionError ? { actionError: snapshot.actionError.message } : {})}
                add={
                    snapshot.access === "manage"
                        ? "any"
                        : snapshot.access === "use"
                          ? "private"
                          : "none"
                }
                loading={snapshot.loading}
                machines={snapshot.machines.map((machine) => machineRow(machine, snapshot))}
                onMachineAdd={() => store.machineAddOpen()}
                onMachineEdit={(machineId) => store.machineEditOpen(machineId)}
                onMachineRelease={(machineId) => store.machineLockRelease(machineId)}
                onRequestAnswer={(key, approve) =>
                    store.approvalAnswer(key, approve ? "approve" : "deny")
                }
                requests={snapshot.approvals.map((approval) => requestRow(approval, snapshot))}
            />
            {add ? (
                <HappyAgentComputeMachineAddDialog
                    modes={snapshot.access === "manage" ? "any" : "private"}
                    onClose={() => store.machineAddClose()}
                    onCreate={() => store.machineAddCreate()}
                    onDescriptionChange={(text) => store.machineAddDescriptionUpdate(text)}
                    onModeChange={(mode) => store.machineAddModeUpdate(mode)}
                    onNameChange={(name) => store.machineAddNameUpdate(name)}
                    stage={addStage(add)}
                />
            ) : null}
            {edit ? (
                <HappyAgentComputeMachineEditDialog
                    description={edit.draft.description}
                    {...(edit.step === "failed" ? { error: edit.error.message } : {})}
                    name={edit.draft.name}
                    onClose={() => store.machineEditClose()}
                    onDescriptionChange={(text) => store.machineEditDescriptionUpdate(text)}
                    onNameChange={(name) => store.machineEditNameUpdate(name)}
                    onSave={() => store.machineEditSave()}
                    saving={edit.step === "saving"}
                />
            ) : null}
        </>
    );
}

function addStage(add: HappyAgentComputeMachineAdd): HappyAgentComputeMachineAddStage {
    switch (add.step) {
        case "shown":
            return {
                step: "install",
                install: { ...add.install, expires: expiresText(add.install.expiresAt) },
            };
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

function machineRow(
    machine: HappyAgentComputeMachine,
    snapshot: HappyAgentComputeSnapshot,
): HappyAgentComputeMachineRow {
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
    const mode = machine.mode;
    const holder = mode.mode === "exclusive" ? mode.holder : null;
    const owner = mode.mode === "private" ? mode.owner : null;
    return {
        id: machine.id,
        name: machine.name,
        status: holder && machine.status === "online" ? "busy" : machine.status,
        os:
            machine.os === "macos" || machine.os === "linux" || machine.os === "windows"
                ? machine.os
                : "other",
        mode: mode.mode,
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
        ...(holder ? { heldBy: holder.title ?? "an agent" } : {}),
        ...(machine.sandboxError ? { sandboxError: machine.sandboxError } : {}),
        edit: machine.editable,
        release:
            holder && snapshot.access === "manage"
                ? snapshot.lockReleases.has(machine.id)
                    ? "releasing"
                    : "offered"
                : "none",
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
        machine: approval.machineName ?? "your machine",
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
