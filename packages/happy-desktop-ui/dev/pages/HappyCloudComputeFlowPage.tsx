import type { ReactNode } from "react";
import {
    HappyAgentComputeMachineAddDialog,
    HappyAgentComputeMachineEditDialog,
    HappyAgentComputeSettings,
    HappyAgentSettingsShell,
    type HappyAgentComputeAddAccess,
    type HappyAgentComputeInstallView,
    type HappyAgentComputeJoinRequestRow,
    type HappyAgentComputeMachineAddDialogProps,
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

/** The machines an admin sees: every mode, a held exclusive machine, and their own private one. */
const machines: readonly HappyAgentComputeMachineRow[] = [
    {
        id: "m1",
        name: "build-01",
        status: "online",
        os: "linux",
        mode: "sandbox",
        detail: "build-01.acme.internal · Linux x86_64",
        description: "General builds and tests. Docker is installed; repos check out under /work.",
        edit: true,
        release: "none",
    },
    {
        id: "m2",
        name: "a100-box",
        status: "busy",
        os: "linux",
        mode: "exclusive",
        detail: "Linux x86_64",
        description:
            "GPU box, CUDA 12.4, use for training; repo checkouts under /data. One run at a time, so leave when you are done.",
        heldBy: "Train the ranking model",
        edit: true,
        release: "offered",
    },
    {
        id: "m3",
        name: "steve-mbp",
        status: "online",
        os: "macos",
        mode: "private",
        detail: "steve-mbp.local · macOS arm64",
        description: "My laptop. Xcode 26 and the iOS simulators.",
        owner: { kind: "reader" },
        edit: true,
        release: "none",
    },
    {
        id: "m4",
        name: "team-box",
        status: "online",
        os: "linux",
        mode: "shared",
        detail: "team-box.acme.internal · Linux aarch64",
        description: "The team's staging stack. Postgres and Redis run here for integration tests.",
        edit: true,
        release: "none",
    },
    {
        id: "m5",
        name: "kirill-desktop",
        status: "offline",
        os: "windows",
        mode: "private",
        detail: "Windows x86_64 · 3 h ago",
        owner: { kind: "member", name: "Kirill" },
        edit: true,
        release: "none",
    },
];

/** The same machines as a member sees them: another member's private machine is hidden. */
const memberMachines: readonly HappyAgentComputeMachineRow[] = machines
    .filter((machine) => machine.owner?.kind !== "member")
    .map((machine) => ({
        ...machine,
        edit: machine.owner?.kind === "reader",
        release: "none",
        ...(machine.heldBy ? { heldBy: "an agent" } : {}),
    }));

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
            onMachineEdit={noop}
            onMachineRelease={noop}
            onRequestAnswer={noop}
            requests={props.requests ?? []}
        />
    );
}

function Add(props: Partial<HappyAgentComputeMachineAddDialogProps>) {
    return (
        <HappyAgentComputeMachineAddDialog
            modes="any"
            onClose={noop}
            onCreate={noop}
            onDescriptionChange={noop}
            onModeChange={noop}
            onNameChange={noop}
            stage={{
                step: "form",
                draft: { mode: "sandbox", name: "", description: "" },
                creating: false,
            }}
            {...props}
        />
    );
}

const TOKEN =
    "eyJhbGciOiJFZERTQSIsImtpZCI6IjEifQ.eyJzdWIiOiJwb29sOmRlZmF1bHQiLCJleHAiOjE3OTMwMDAwMDB9.c2lnbmF0dXJl";
const CLUSTER = "https://acme.happy-clusters.com";
const BASE = "https://get.happy-clusters.com";

/** The install commands exactly as `POST /v0/compute/join-tokens` words them. */
function install(mode: HappyAgentComputeInstallView["mode"]): HappyAgentComputeInstallView {
    const sudo = mode === "private" ? "" : "sudo ";
    return {
        mode,
        commands: {
            unix: `curl -fsSL ${BASE}/install.sh | ${sudo}HAPPY_CLUSTER_URL='${CLUSTER}' HAPPY_JOIN_TOKEN='${TOKEN}' HAPPY_COMPUTE_MODE='${mode}' sh`,
            windows: `$env:HAPPY_CLUSTER_URL='${CLUSTER}'; $env:HAPPY_JOIN_TOKEN='${TOKEN}'; $env:HAPPY_COMPUTE_MODE='${mode}'; irm ${BASE}/install.ps1 | iex`,
        },
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
            summary="A Happy Cloud server's compute: the computers agents join and their modes, the agents asking to join the reader's private computers, adding a computer with a one-time install command, and editing a computer's name and description."
            title="Happy Cloud compute flow"
            width={WINDOWS[0].width + 96}
        >
            <Screen detail="no compute yet" number="01" screen="01-empty">
                <List add="any" empty />
            </Screen>
            <Screen detail="machines in all four modes, for an admin" number="02" screen="02-list">
                <List add="any" />
            </Screen>
            <Screen detail="machines, for a member" number="03" screen="03-member">
                <List add="private" />
            </Screen>
            <Screen detail="agents asking to join" number="04" screen="04-join-requests">
                <List add="private" requests={requests} />
            </Screen>
            <Screen detail="adding a machine, as an admin" number="05" screen="05-add-admin">
                <List add="any" />
                <Add
                    stage={{
                        step: "form",
                        draft: {
                            mode: "sandbox",
                            name: "build-02",
                            description: "Second build box. Docker and Node 24.",
                        },
                        creating: false,
                    }}
                />
            </Screen>
            <Screen detail="adding a machine, as a member" number="06" screen="06-add-member">
                <List add="private" />
                <Add
                    modes="private"
                    stage={{
                        step: "form",
                        draft: { mode: "private", name: "", description: "" },
                        creating: false,
                    }}
                />
            </Screen>
            <Screen detail="the sandbox install command" number="07" screen="07-install-sandbox">
                <List add="any" />
                <Add stage={{ step: "install", install: install("sandbox") }} />
            </Screen>
            <Screen detail="the private install command" number="08" screen="08-install-private">
                <List add="private" />
                <Add modes="private" stage={{ step: "install", install: install("private") }} />
            </Screen>
            <Screen detail="the shared install command" number="09" screen="09-install-shared">
                <List add="any" />
                <Add stage={{ step: "install", install: install("shared") }} />
            </Screen>
            <Screen detail="editing a machine" number="10" screen="10-edit">
                <List add="any" />
                <HappyAgentComputeMachineEditDialog
                    description="GPU box, CUDA 12.4, use for training; repo checkouts under /data. One run at a time, so leave when you are done."
                    name="a100-box"
                    onClose={noop}
                    onDescriptionChange={noop}
                    onNameChange={noop}
                    onSave={noop}
                    saving={false}
                />
            </Screen>
            <Screen detail="the server has no compute set up" number="11" screen="11-add-refused">
                <List add="any" />
                <Add
                    stage={{
                        step: "form",
                        draft: { mode: "shared", name: "", description: "" },
                        creating: false,
                        error: "This server isn't set up to run machines yet.",
                    }}
                />
            </Screen>
        </ComponentPage>
    );
}
