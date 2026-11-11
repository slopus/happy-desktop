import type {
    HappyAgentComputeMachine,
    HappyAgentComputeSnapshot,
    HappyAgentComputeStore,
} from "happy-desktop-state";
import {
    HappyAgentComputeMachineAddDialog,
    HappyAgentComputeSettings,
    type HappyAgentComputeMachineRow,
} from "happy-desktop-ui";

/** Settings › Compute on Happy Cloud, composed from its store. */
export function AppComputeSettings(props: {
    readonly snapshot: HappyAgentComputeSnapshot;
    readonly store: HappyAgentComputeStore;
}) {
    const { snapshot, store } = props;
    const add = snapshot.machineAdd;
    const poolNames = new Map(snapshot.pools.map((pool) => [pool.id, pool.name]));
    return (
        <>
            <HappyAgentComputeSettings
                {...(snapshot.error ? { error: snapshot.error.message } : {})}
                loading={snapshot.loading}
                machines={snapshot.machines.map((machine) => machineRow(machine, poolNames))}
                manage={snapshot.manage}
                onMachineAdd={(poolId) => store.machineAddOpen(poolId)}
                pools={snapshot.pools}
            />
            {add ? (
                <HappyAgentComputeMachineAddDialog
                    creating={add.creating}
                    {...(add.error ? { error: add.error.message } : {})}
                    {...(add.install
                        ? {
                              install: {
                                  commands: add.install.commands,
                                  token: add.install.token,
                                  clusterUrl: add.install.clusterUrl,
                                  expires: expiresText(add.install.expiresAt),
                              },
                          }
                        : {})}
                    onClose={() => store.machineAddClose()}
                    onCreate={() => store.machineAddCreate()}
                    onPoolChange={(poolId) => store.machineAddPoolUpdate(poolId)}
                    poolId={add.poolId}
                    pools={snapshot.pools}
                />
            ) : null}
        </>
    );
}

const OS_NAMES: Readonly<Record<string, string>> = {
    macos: "macOS",
    linux: "Linux",
    windows: "Windows",
};

function machineRow(
    machine: HappyAgentComputeMachine,
    poolNames: ReadonlyMap<string, string>,
): HappyAgentComputeMachineRow {
    const platform = [machine.os ? (OS_NAMES[machine.os] ?? machine.os) : undefined, machine.arch]
        .filter(Boolean)
        .join(" ");
    const detail = [
        machine.hostname !== machine.name ? machine.hostname : undefined,
        platform || undefined,
        poolNames.get(machine.poolId),
        machine.status === "online" ? undefined : sinceText(machine.since),
    ]
        .filter(Boolean)
        .join(" · ");
    return {
        id: machine.id,
        name: machine.name,
        status: machine.status,
        os:
            machine.os === "macos" || machine.os === "linux" || machine.os === "windows"
                ? machine.os
                : "other",
        detail: detail || "No details yet",
        sandboxes: machine.sandboxes,
        agents: machine.agents.length,
        ...(machine.sandboxError ? { sandboxError: machine.sandboxError } : {}),
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
