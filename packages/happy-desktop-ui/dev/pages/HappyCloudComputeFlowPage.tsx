import type { ReactNode } from "react";
import {
    HappyAgentComputeMachineAddDialog,
    HappyAgentComputeSettings,
    HappyAgentSettingsShell,
    type HappyAgentComputeMachineAddDialogProps,
    type HappyAgentComputeMachineRow,
    type HappyAgentComputePoolRow,
    type HappyAgentSettingsCategory,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-042";

/** The settings categories a Happy Cloud server lists. */
const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { icon: "globe", id: "providers", label: "Providers", tone: "indigo" },
    { icon: "users", id: "members", label: "Members", tone: "orange" },
    { icon: "repository", id: "repositories", label: "Repositories", tone: "gray" },
    { icon: "terminal", id: "compute", label: "Compute", tone: "indigo" },
    { icon: "zap", id: "usage", label: "Usage", tone: "teal" },
];

const noop = () => undefined;

const pools: readonly HappyAgentComputePoolRow[] = [
    {
        id: "default",
        name: "Default",
        default: true,
        machines: { total: 3, online: 2 },
        sandboxes: { used: 5, total: 16 },
    },
    {
        id: "gpu",
        name: "GPU",
        default: false,
        machines: { total: 1, online: 1 },
        sandboxes: { used: 1, total: 4 },
    },
    {
        id: "windows",
        name: "Windows builds",
        default: false,
        machines: { total: 0, online: 0 },
        sandboxes: { used: 0, total: null },
    },
];

const machines: readonly HappyAgentComputeMachineRow[] = [
    {
        id: "m1",
        name: "mac-studio",
        status: "online",
        os: "macos",
        detail: "mac-studio.local · macOS arm64 · Default",
        sandboxes: { used: 3, total: 8 },
        agents: 3,
    },
    {
        id: "m2",
        name: "build-01",
        status: "online",
        os: "linux",
        detail: "build-01.acme.internal · Linux x86_64 · Default",
        sandboxes: { used: 2, total: 8 },
        agents: 2,
    },
    {
        id: "m3",
        name: "a100-box",
        status: "online",
        os: "linux",
        detail: "Linux x86_64 · GPU",
        sandboxes: { used: 1, total: 4 },
        agents: 1,
    },
    {
        id: "m4",
        name: "old-mini",
        status: "draining",
        os: "macos",
        detail: "macOS x86_64 · Default · 12 min ago",
        sandboxes: { used: 0, total: 2 },
        agents: 0,
        sandboxError: "Seatbelt profile refused to load",
    },
    {
        id: "m5",
        name: "steve-laptop",
        status: "offline",
        os: "macos",
        detail: "macOS arm64 · Default · 3 h ago",
        sandboxes: { used: 0, total: null },
        agents: 0,
    },
];

/** Runners as a member reads them: the same machines, with less detail. */
const runners: readonly HappyAgentComputeMachineRow[] = machines.map(
    ({ sandboxError: _hidden, ...machine }) => ({
        ...machine,
        detail: machine.detail.replace(/ · (Default|GPU)/u, ""),
        sandboxes: { used: 0, total: null },
        agents: 0,
    }),
);

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
                    description="The machines agents run on"
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

function List(props: { manage: boolean; empty?: boolean }) {
    return (
        <HappyAgentComputeSettings
            loading={false}
            machines={props.empty ? [] : props.manage ? machines : runners}
            manage={props.manage}
            onMachineAdd={noop}
            pools={props.empty || !props.manage ? [] : pools}
        />
    );
}

function Add(props: Partial<HappyAgentComputeMachineAddDialogProps>) {
    return (
        <HappyAgentComputeMachineAddDialog
            creating={false}
            onClose={noop}
            onCreate={noop}
            onPoolChange={noop}
            poolId="default"
            pools={pools}
            {...props}
        />
    );
}

const TOKEN = "eyJhbGciOiJFZERTQSJ9.eyJwb29sIjoiZGVmYXVsdCIsImV4cCI6MTc5MzAwMDAwMH0.c2lnbmF0dXJl";

export function HappyCloudComputeFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A Happy Cloud server's compute: its pools and the machines that joined them, adding a machine with a one-time install command, and the runners a member without pools.manage sees."
            title="Happy Cloud compute flow"
            width={WINDOWS[0].width + 96}
        >
            <Screen detail="no compute yet" number="01" screen="01-empty">
                <List empty manage />
            </Screen>
            <Screen detail="pools and machines, for a pool manager" number="02" screen="02-list">
                <List manage />
            </Screen>
            <Screen detail="runners, for a member" number="03" screen="03-runners">
                <List manage={false} />
            </Screen>
            <Screen detail="adding a machine: choosing its pool" number="04" screen="04-add">
                <List manage />
                <Add />
            </Screen>
            <Screen detail="the one-time install command" number="05" screen="05-add-command">
                <List manage />
                <Add
                    install={{
                        commands: {
                            unix: `curl -fsSL https://acme.happy.dev/install.sh | sh -s -- --join ${TOKEN}`,
                            windows: `iwr -useb https://acme.happy.dev/install.ps1 | iex; Install-Happy -Join ${TOKEN}`,
                        },
                        token: TOKEN,
                        clusterUrl: "https://acme.happy.dev",
                        expires: "Expires in 1 hour",
                    }}
                />
            </Screen>
            <Screen detail="the server has no compute set up" number="06" screen="06-add-refused">
                <List manage />
                <Add error="This server isn't set up to run machines yet." />
            </Screen>
        </ComponentPage>
    );
}
