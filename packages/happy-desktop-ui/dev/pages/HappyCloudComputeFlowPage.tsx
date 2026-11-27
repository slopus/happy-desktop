import type { ReactNode } from "react";
import {
    HappyAgentComputeMachineAddDialog,
    HappyAgentComputeMachineDeleteDialog,
    HappyAgentComputeMachineDialog,
    HappyAgentComputeSettings,
    HappyAgentSettingsShell,
    type HappyAgentComputeAddAccess,
    type HappyAgentComputeInstallView,
    type HappyAgentComputeJoinRequestRow,
    type HappyAgentComputeMachineAddDialogProps,
    type HappyAgentComputeMachineAgentRow,
    type HappyAgentComputeMachineDeleteDialogProps,
    type HappyAgentComputeMachineDialogProps,
    type HappyAgentComputeMachineRow,
    type HappyAgentSettingsCategory,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-042";

/** The settings categories a Happy Cloud server lists. */
const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { icon: "bell", id: "sharing", label: "Notifications", tone: "red" },
    { group: "Agents", icon: "doc", id: "instructions", label: "Instructions", tone: "purple" },
    { group: "Agents", icon: "globe", id: "providers", label: "Inference", tone: "indigo" },
    { group: "Agents", icon: "terminal", id: "compute", label: "Compute", tone: "blue" },
    { group: "Agents", icon: "shield", id: "zones", label: "Zones", tone: "purple" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { group: "Agents", icon: "zap", id: "usage", label: "Usage", tone: "teal" },
    { group: "Team", icon: "users", id: "members", label: "Members", tone: "orange" },
    { group: "Team", icon: "repository", id: "repositories", label: "Repositories", tone: "gray" },
];

const noop = () => undefined;

const zones = [
    { id: "default", name: "Default", color: "blue" },
    { id: "build", name: "Build", color: "teal" },
    { id: "release", name: "Release", color: "purple" },
] as const;

/**
 * The machines an admin sees: shared and private, a full one, one that can't
 * keep restricted commands in, and their own and a member's private machines.
 */
const machines: readonly HappyAgentComputeMachineRow[] = [
    {
        id: "m1",
        name: "build-01",
        zones: ["default", "build"],
        status: "online",
        os: "linux",
        access: "shared",
        detail: "build-01.acme.internal · Linux x86_64",
        description: "General builds and tests. Docker is installed; repos check out under /work.",
        agentCount: 3,
        concurrency: 0,
        manageable: true,
    },
    {
        id: "m2",
        name: "a100-box",
        zones: ["build"],
        status: "full",
        os: "linux",
        access: "shared",
        detail: "Linux x86_64",
        description:
            "GPU box, CUDA 12.4, use for training; repo checkouts under /data. One run at a time, so leave when you are done.",
        agentCount: 1,
        concurrency: 1,
        manageable: true,
    },
    {
        id: "m3",
        name: "steve-mbp",
        zones: null,
        status: "online",
        os: "macos",
        access: "private",
        detail: "steve-mbp.local · macOS arm64",
        description: "My laptop. Xcode 26 and the iOS simulators.",
        owner: { kind: "reader" },
        agentCount: 0,
        concurrency: 1,
        manageable: true,
    },
    {
        id: "m4",
        name: "team-box",
        zones: null,
        status: "online",
        os: "linux",
        access: "shared",
        detail: "team-box.acme.internal · Linux aarch64",
        description: "The team's staging stack. Postgres and Redis run here for integration tests.",
        agentCount: 2,
        concurrency: 8,
        boundary: { reason: "Landlock is not supported by this kernel (5.10)" },
        manageable: true,
    },
    {
        id: "m5",
        name: "kirill-desktop",
        zones: [],
        status: "offline",
        os: "windows",
        access: "private",
        detail: "Windows x86_64 · 3 h ago",
        owner: { kind: "member", name: "Kirill" },
        agentCount: 0,
        concurrency: 2,
        boundary: { reason: null },
        manageable: true,
    },
];

/**
 * The same machines as a member sees them: another member's private machine is
 * hidden, and only their own can be managed.
 */
const memberMachines: readonly HappyAgentComputeMachineRow[] = machines
    .filter((machine) => machine.owner?.kind !== "member")
    .map((machine) => ({ ...machine, manageable: machine.owner?.kind === "reader" }));

/** The agents on build-01. */
const agents: readonly HappyAgentComputeMachineAgentRow[] = [
    { id: "a1", title: "Fix the flaky upload test", removing: false },
    { id: "a2", title: "Release notes for 2026.11", removing: true },
    { id: "a3", title: "An agent you can't open", removing: false },
];

const requests: readonly HappyAgentComputeJoinRequestRow[] = [
    { key: "m3/a1", agent: "Fix the flaky upload test", machine: "steve-mbp", when: "just now" },
    { key: "m3/a2", agent: "Release notes for 2026.11", machine: "steve-mbp", when: "4 min ago" },
];

/** The window Happy opens at, and its minimum. */
const WINDOWS = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
] as const;

/** One screen of the settings window on Compute, at both review window sizes. */
function Screen(props: { number: string; screen: string; detail: string; children: ReactNode }) {
    return WINDOWS.map((window) => (
        <FullScreenSpecimen
            detail={props.detail}
            key={window.width}
            label={`Settings — Compute, ${String(window.width)} × ${String(window.height)}`}
            number={props.number}
            screen={`${props.screen}-${String(window.width)}x${String(window.height)}`}
            window={window}
        >
            {/* The overlay is fixed; the transform keeps a dialog inside its screen. */}
            <div style={{ display: "flex", transform: "translateZ(0)" }}>
                <HappyAgentSettingsShell
                    activeCategoryId="compute"
                    categories={categories}
                    description="The computers agents run on"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Compute"
                >
                    {props.children}
                </HappyAgentSettingsShell>
            </div>
        </FullScreenSpecimen>
    ));
}

function List(props: {
    add: HappyAgentComputeAddAccess;
    empty?: boolean;
    requests?: readonly HappyAgentComputeJoinRequestRow[];
    /** A machine already deleted, which the list no longer shows. */
    without?: string;
    actionNotice?: string;
}) {
    const shown = props.empty ? [] : props.add === "any" ? machines : memberMachines;
    return (
        <HappyAgentComputeSettings
            {...(props.actionNotice ? { actionNotice: props.actionNotice } : {})}
            add={props.add}
            loading={false}
            machines={shown.filter((machine) => machine.id !== props.without)}
            onMachineAdd={noop}
            onMachineOpen={noop}
            onRequestAnswer={noop}
            requests={props.requests ?? []}
            zones={zones}
        />
    );
}

function Add(props: Partial<HappyAgentComputeMachineAddDialogProps>) {
    return (
        <HappyAgentComputeMachineAddDialog
            accesses="any"
            onAccessChange={noop}
            onClose={noop}
            onConcurrencyChange={noop}
            onCreate={noop}
            onLimitedChange={noop}
            stage={{
                step: "form",
                draft: { access: "shared", limited: false, concurrency: "8" },
                creating: false,
            }}
            {...props}
        />
    );
}

function Detail(props: Partial<HappyAgentComputeMachineDialogProps>) {
    const machine = props.machine ?? machines[0]!;
    return (
        <HappyAgentComputeMachineDialog
            agents={agents}
            draft={{
                name: machine.name,
                description: machine.description ?? "",
                limited: machine.concurrency > 0,
                concurrency: String(machine.concurrency > 0 ? machine.concurrency : 8),
            }}
            machine={machine}
            maxConcurrency={null}
            onAgentRemove={noop}
            onClose={noop}
            onConcurrencyChange={noop}
            onDelete={noop}
            onDescriptionChange={noop}
            onLimitedChange={noop}
            onNameChange={noop}
            onSave={noop}
            saving={false}
            zones={zones}
            {...props}
        />
    );
}

function Delete(props: Partial<HappyAgentComputeMachineDeleteDialogProps>) {
    return (
        <HappyAgentComputeMachineDeleteDialog
            deleting={false}
            name={machines[0]!.name}
            onClose={noop}
            onDelete={noop}
            {...props}
        />
    );
}

const TOKEN =
    "eyJhbGciOiJFZERTQSIsImtpZCI6IjEifQ.eyJzdWIiOiJwb29sOmRlZmF1bHQiLCJleHAiOjE3OTMwMDAwMDB9.c2lnbmF0dXJl";
const CLUSTER = "https://acme.happy-clusters.com";
const BASE = "https://get.happy-clusters.com";

/** The install commands exactly as `POST /v0/computers/join-tokens` words them. */
function install(access: HappyAgentComputeInstallView["access"]): HappyAgentComputeInstallView {
    const sudo = access === "private" ? "" : "sudo ";
    return {
        access,
        concurrency: access === "private" ? 1 : 0,
        commands: {
            unix: `curl -fsSL ${BASE}/install.sh | ${sudo}HAPPY_CLUSTER_URL='${CLUSTER}' HAPPY_JOIN_TOKEN='${TOKEN}' HAPPY_COMPUTE_ACCESS='${access}' sh`,
            windows: `$env:HAPPY_CLUSTER_URL='${CLUSTER}'; $env:HAPPY_JOIN_TOKEN='${TOKEN}'; $env:HAPPY_COMPUTE_ACCESS='${access}'; irm ${BASE}/install.ps1 | iex`,
        },
        systems: ["linux"],
        notice: "macOS and Windows computers are not available yet: Happy compute is published for Linux x86_64 and Linux aarch64 only.",
        token: TOKEN,
        clusterUrl: CLUSTER,
        expires: "Expires in 1 hour",
    };
}

export function HappyCloudComputeFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A Happy Cloud server's compute: the shared and private computers agents join and the agents on them, the agents asking to join the reader's private computers, managing and deleting a computer, and adding one with a one-time install command."
            title="Happy Cloud compute flow"
            width={WINDOWS[0].width + 96}
        >
            <Screen detail="no compute yet" number="01" screen="01-empty">
                <List add="any" empty />
            </Screen>
            <Screen
                detail="shared and private computers, for an admin"
                number="02"
                screen="02-list"
            >
                <List add="any" />
            </Screen>
            <Screen detail="computers, for a member" number="03" screen="03-member">
                <List add="private" />
            </Screen>
            <Screen detail="agents asking to join" number="04" screen="04-join-requests">
                <List add="private" requests={requests} />
            </Screen>
            <Screen detail="adding a computer, as an admin" number="05" screen="05-add-admin">
                <List add="any" />
                <Add />
            </Screen>
            <Screen detail="adding a computer, as a member" number="06" screen="06-add-member">
                <List add="private" />
                <Add
                    accesses="private"
                    stage={{
                        step: "form",
                        draft: { access: "private", limited: true, concurrency: "1" },
                        creating: false,
                    }}
                />
            </Screen>
            <Screen detail="the shared install command" number="07" screen="07-install-shared">
                <List add="any" />
                <Add stage={{ step: "install", install: install("shared") }} />
            </Screen>
            <Screen detail="the private install command" number="08" screen="08-install-private">
                <List add="private" />
                <Add accesses="private" stage={{ step: "install", install: install("private") }} />
            </Screen>
            <Screen
                detail="managing a computer, its agents and the zones that can use it"
                number="09"
                screen="09-manage"
            >
                <List add="any" />
                <Detail onZonesChange={noop} />
            </Screen>
            <Screen
                detail="a computer that can't keep restricted commands in"
                number="10"
                screen="10-boundary"
            >
                <List add="any" />
                <Detail
                    agents={agents.slice(0, 2).map((agent) => ({ ...agent, removing: false }))}
                    machine={machines[3]!}
                />
            </Screen>
            <Screen detail="a computer, for a member" number="11" screen="11-details-member">
                <List add="private" />
                <Detail
                    agents={agents.slice(0, 1)}
                    machine={{ ...memberMachines[0]!, agentCount: 1 }}
                />
            </Screen>
            <Screen detail="the server has no compute set up" number="12" screen="12-add-refused">
                <List add="any" />
                <Add
                    stage={{
                        step: "form",
                        draft: { access: "shared", limited: false, concurrency: "8" },
                        creating: false,
                        error: "This server isn't set up to run computers yet.",
                    }}
                />
            </Screen>
            <Screen
                detail="a server that publishes no installer"
                number="13"
                screen="13-install-no-installer"
            >
                <List add="private" />
                <Add
                    accesses="private"
                    stage={{ step: "install", install: { ...install("private"), commands: null } }}
                />
            </Screen>
            <Screen
                detail="managing a computer with a limit"
                number="14"
                screen="14-manage-limited"
            >
                <List add="any" />
                <Detail
                    agents={agents.slice(0, 2).map((agent) => ({ ...agent, removing: false }))}
                    machine={{ ...machines[3]!, boundary: undefined }}
                />
            </Screen>
            <Screen
                detail="a computer whose operator set a ceiling"
                number="15"
                screen="15-manage-ceiling"
            >
                <List add="any" />
                <Detail
                    agents={agents.slice(0, 2).map((agent) => ({ ...agent, removing: false }))}
                    machine={{ ...machines[3]!, boundary: undefined }}
                    maxConcurrency={16}
                />
            </Screen>
            <Screen
                detail="confirming a computer's deletion"
                number="16"
                screen="16-delete-confirm"
            >
                <List add="any" />
                <Delete />
            </Screen>
            <Screen detail="deleting a computer" number="17" screen="17-delete-deleting">
                <List add="any" />
                <Delete deleting />
            </Screen>
            <Screen detail="a deletion the server refused" number="18" screen="18-delete-refused">
                <List add="any" />
                <Delete error="You can't delete this computer." />
            </Screen>
            <Screen
                detail="a deletion that couldn't be sent"
                number="19"
                screen="19-delete-offline"
            >
                <List add="any" />
                <Delete error="Happy couldn't reach the server." />
            </Screen>
            <Screen detail="after the computer is deleted" number="20" screen="20-delete-done">
                <List add="any" without="m1" />
            </Screen>
            <Screen
                detail="a computer that was already deleted"
                number="21"
                screen="21-delete-already"
            >
                <List actionNotice="build-01 was already deleted." add="any" without="m1" />
            </Screen>
        </ComponentPage>
    );
}
