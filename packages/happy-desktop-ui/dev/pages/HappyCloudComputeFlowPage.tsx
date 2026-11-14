import type { ReactNode } from "react";
import {
    HappyAgentComputeMachineAddDialog,
    HappyAgentComputeMachineDialog,
    HappyAgentComputeSettings,
    HappyAgentSettingsShell,
    type HappyAgentComputeAddAccess,
    type HappyAgentComputeInstallView,
    type HappyAgentComputeJoinRequestRow,
    type HappyAgentComputeMachineAddDialogProps,
    type HappyAgentComputeMachineAgentRow,
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
    { group: "Agents", icon: "globe", id: "providers", label: "Inference", tone: "indigo" },
    { group: "Agents", icon: "terminal", id: "compute", label: "Compute", tone: "blue" },
    { group: "Agents", icon: "zap", id: "usage", label: "Usage", tone: "teal" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { group: "Team", icon: "users", id: "members", label: "Members", tone: "orange" },
    { group: "Team", icon: "repository", id: "repositories", label: "Repositories", tone: "gray" },
];

const noop = () => undefined;

/**
 * The machines an admin sees: shared and private, a full one, one that can't
 * keep restricted commands in, and their own and a member's private machines.
 */
const machines: readonly HappyAgentComputeMachineRow[] = [
    {
        id: "m1",
        name: "build-01",
        status: "online",
        os: "linux",
        access: "shared",
        detail: "build-01.acme.internal · Linux x86_64",
        description: "General builds and tests. Docker is installed; repos check out under /work.",
        agentCount: 3,
        concurrency: 8,
        manageable: true,
    },
    {
        id: "m2",
        name: "a100-box",
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
}) {
    return (
        <HappyAgentComputeSettings
            add={props.add}
            loading={false}
            machines={props.empty ? [] : props.add === "any" ? machines : memberMachines}
            onMachineAdd={noop}
            onMachineOpen={noop}
            onRequestAnswer={noop}
            requests={props.requests ?? []}
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
            stage={{
                step: "form",
                draft: { access: "shared", concurrency: "8" },
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
                concurrency: String(machine.concurrency),
            }}
            machine={machine}
            maxConcurrency={32}
            onAgentRemove={noop}
            onClose={noop}
            onConcurrencyChange={noop}
            onDescriptionChange={noop}
            onNameChange={noop}
            onSave={noop}
            saving={false}
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
        concurrency: access === "private" ? 1 : 8,
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
            summary="A Happy Cloud server's compute: the shared and private computers agents join and the agents on them, the agents asking to join the reader's private computers, managing a computer, and adding one with a one-time install command."
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
                        draft: { access: "private", concurrency: "1" },
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
            <Screen detail="managing a computer and its agents" number="09" screen="09-manage">
                <List add="any" />
                <Detail />
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
                        draft: { access: "shared", concurrency: "8" },
                        creating: false,
                        error: "This server isn't set up to run computers yet.",
                    }}
                />
            </Screen>
        </ComponentPage>
    );
}
