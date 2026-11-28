import type { CSSProperties, ReactNode } from "react";
import {
    CloudOnboardingComputerAddDialog,
    CloudOnboardingComputerExplainerDialog,
    type CloudOnboardingComputerReader,
    type CloudOnboardingComputerRow,
} from "../../src/CloudOnboardingComputer";
import {
    CloudOnboardingScreen,
    type CloudOnboardingScreenProps,
    type CloudOnboardingStep,
} from "../../src/CloudOnboardingScreen";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { EmptyState } from "../../src/EmptyState";
import { HappyAgentOnboardingSettings } from "../../src/pages/settings/HappyAgentOnboardingSettings";
import { HappyAgentSettingsShell } from "../../src/pages/settings/HappyAgentSettingsShell";
import { SetupCover } from "../../src/SetupCover";
import { ThemeScope, type ThemeMode } from "../../src/ThemeScope";
import { WindowDragRegion } from "../../src/TitleBar";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { HAPPY_CLOUD_OWNER_SETTINGS_CATEGORIES } from "./happyAgentSettingsFixtures";

/*
 * The computer step of a Happy Cloud server's onboarding, owner then member,
 * one specimen per state of the round 4 mockups and named as they are
 * (`o17-computer`, `m04-computer-optional`, …). The step is the real
 * `CloudOnboardingScreen` with its `computer` view, and the dialogs are the
 * real ones; the rows are what `AppCloudOnboarding` makes of the gate's
 * `data.computers` and "Connect this Mac".
 */

/** The component plan this page documents. */
export const componentNumber = "P-046c";

type Window = { readonly width: number; readonly height: number };
const LARGE: Window = { width: 1100, height: 760 };
const SMALL: Window = { width: 720, height: 640 };
const MINIMUM: Window = { width: 760, height: 670 };
const noop = () => undefined;

const SERVER = "Acme";
const COMMAND =
    "curl -fsSL https://get.happy.engineering/install.sh | HAPPY_JOIN_URL='https://acme.happy.engineering/v0/supervisors/join' HAPPY_JOIN_TOKEN='hj_5fK2mQ8dR1xT7vZ3' sh";

const connections: readonly ConnectionShellItem[] = [
    { id: "local", label: "This Mac", local: true, status: "connected" },
    { id: "acme", label: "@acme", local: false, placeholderSeed: "acme", status: "connected" },
];

/** Fixture-only stand-in for the native macOS traffic lights: 14px at x 14…68, y 13. */
function TrafficLights() {
    const dot = (background: string): CSSProperties => ({
        background,
        borderRadius: "50%",
        height: "14px",
        width: "14px",
    });
    return (
        <span
            aria-hidden="true"
            style={{
                display: "flex",
                gap: "6px",
                left: "14px",
                pointerEvents: "none",
                position: "absolute",
                top: "13px",
                zIndex: 2000,
            }}
        >
            <i style={dot("#ff5f57")} />
            <i style={dot("#febc2e")} />
            <i style={dot("#28c840")} />
        </span>
    );
}

/** Three 46 × 40 caption buttons, as Electron's `titleBarOverlay` paints them on Windows. */
const CAPTION_WIDTH = 138;

/**
 * Fixture-only stand-in for the Windows caption overlay: the host paints it
 * above everything the page draws, in the theme's header colour.
 */
function CaptionButtons() {
    const cell: CSSProperties = {
        alignItems: "center",
        display: "flex",
        fontFamily: "'Segoe Fluent Icons', 'Segoe MDL2 Assets', system-ui, sans-serif",
        fontSize: "10px",
        fontStyle: "normal",
        height: "40px",
        justifyContent: "center",
        width: "46px",
    };
    return (
        <span
            aria-hidden="true"
            style={{
                background: "var(--header-background)",
                color: "var(--header-tint)",
                display: "flex",
                pointerEvents: "none",
                position: "absolute",
                right: 0,
                top: 0,
                zIndex: 2000,
            }}
        >
            <i style={cell}>&#x2500;</i>
            <i style={cell}>&#x25A1;</i>
            <i style={{ ...cell, fontSize: "13px" }}>&#x2715;</i>
        </span>
    );
}

type Chrome = "mac" | "windows";

/** The window: the rail, the cover setup takes, and the native controls. */
function Window(props: { readonly chrome?: Chrome; readonly children: ReactNode }) {
    const windows = props.chrome === "windows";
    return (
        <div
            style={
                {
                    containerType: "size",
                    height: "100%",
                    overflow: "hidden",
                    position: "relative",
                    transform: "translateZ(0)",
                    width: "100%",
                    // Windows reports a zero `titlebar-area-x` and the caption
                    // buttons' width; macOS reports neither.
                    ...(windows
                        ? {
                              "--happy-window-caption-right": `${String(CAPTION_WIDTH)}px`,
                              "--happy-window-controls-width": "12px",
                          }
                        : {}),
                } as CSSProperties
            }
        >
            <ConnectionShell
                add={{ label: "Connect to Happy Cloud", onAdd: noop }}
                items={connections}
                onSelect={noop}
                selectedId="acme"
                windowControls
            >
                <ConnectionSurface active>{props.children}</ConnectionSurface>
            </ConnectionShell>
            {windows ? <CaptionButtons /> : <TrafficLights />}
        </div>
    );
}

const OWNER_STEPS = [
    { id: "profile", label: "Profile" },
    { id: "inference", label: "AI" },
    { id: "plugins", label: "Tools" },
    { id: "computer", label: "Computer" },
    { id: "teammates", label: "Team" },
] as const;
const MEMBER_STEPS = [
    { id: "profile", label: "Profile" },
    { id: "computer", label: "Computer" },
] as const;

function bar(reader: CloudOnboardingComputerReader): readonly CloudOnboardingStep[] {
    const steps = reader === "owner" ? OWNER_STEPS : MEMBER_STEPS;
    const index = steps.findIndex((step) => step.id === "computer");
    return steps.map((step, position) => ({ ...step, done: position < index }));
}

/** One state of the step, as `AppCloudOnboarding` hands it to the screen. */
interface State {
    readonly reader: CloudOnboardingComputerReader;
    readonly required?: boolean;
    readonly shared?: boolean;
    readonly hostOs?: "mac" | "linux" | "windows";
    readonly connect?: "idle" | "working" | "connected" | "failed";
    readonly computers?: readonly CloudOnboardingComputerRow[];
    /** Done: a computer of the reader's is online. */
    readonly done?: boolean;
    readonly dialog?: "add" | "explainer";
    /** The add dialog's command, when it is not ready yet. */
    readonly command?: "minting" | "failed";
    /** The list scrolled as far as it goes. */
    readonly end?: boolean;
}

function footnote(state: State): string {
    if (state.reader === "owner") return "Add a computer to continue.";
    return state.hostOs === "windows"
        ? "No Mac or Linux computer? Ask Olga."
        : "Can’t add one? Ask Olga.";
}

function scrollListToEnd(element: HTMLDivElement | null) {
    const list = element?.querySelector(".happy-computer-step__list");
    if (list) list.scrollTop = list.scrollHeight;
}

function Step(props: {
    readonly mode: ThemeMode;
    readonly state: State;
    readonly chrome: Chrome | undefined;
}) {
    const { state } = props;
    const done = state.done === true;
    const screen: CloudOnboardingScreenProps = {
        appearance: props.mode,
        serverLabel: SERVER,
        steps: bar(state.reader),
        currentStep: "computer",
        view: {
            kind: "computer",
            reader: state.reader,
            required: state.required === true,
            shared: state.shared === true,
            hostOs: state.hostOs ?? "mac",
            connect: { kind: state.connect ?? "idle" },
            computers: state.computers ?? [],
            onConnect: noop,
            onAdd: noop,
            onExplain: noop,
        },
        action: { label: "Continue", disabled: !done, onSelect: noop },
        ...(!done && !state.required ? { skip: { onSelect: noop } } : {}),
        footnote: footnote(state),
        back: { onSelect: noop },
        exit: { onSelect: noop },
    };
    return (
        <Window chrome={props.chrome}>
            <SetupCover>
                <div ref={state.end ? scrollListToEnd : undefined} style={{ display: "contents" }}>
                    <CloudOnboardingScreen {...screen} />
                </div>
                {state.dialog === "add" ? (
                    <CloudOnboardingComputerAddDialog
                        command={
                            state.command === "minting"
                                ? { kind: "minting" }
                                : state.command === "failed"
                                  ? {
                                        kind: "failed",
                                        // Two lines: they fit the command box, so the card keeps its drawn top and height.
                                        error: "You can't add computers on Acme. Ask an owner to add one for you or to give you access.",
                                    }
                                  : { kind: "ready", text: COMMAND }
                        }
                        onClose={noop}
                    />
                ) : state.dialog === "explainer" ? (
                    <CloudOnboardingComputerExplainerDialog
                        onClose={noop}
                        reader={state.reader}
                        serverName={SERVER}
                    />
                ) : null}
            </SetupCover>
        </Window>
    );
}

/* ---- The rows, as the adapter makes them from the gate -------------------- */

const waiting = (here: string, paste: string, os: "mac" | "linux"): CloudOnboardingComputerRow => ({
    id: "this",
    name: `Waiting for ${here}`,
    os,
    state: { kind: "joining" },
    note: `Copied. Paste in ${paste}.`,
});
const OLGA_MAC: CloudOnboardingComputerRow = {
    id: "mac",
    name: "Olga’s MacBook Pro",
    os: "mac",
    state: { kind: "online" },
};
const SAM_MAC: CloudOnboardingComputerRow = { ...OLGA_MAC, name: "Sam’s MacBook Pro" };
const BUILD: CloudOnboardingComputerRow = {
    id: "build",
    name: "build-01.acme.dev",
    os: "linux",
    state: { kind: "online" },
};
const STUDIO: CloudOnboardingComputerRow = {
    id: "studio",
    name: "Olga’s Mac Studio",
    os: "mac",
    state: { kind: "online" },
};
const GPU: CloudOnboardingComputerRow = {
    id: "gpu",
    name: "gpu-box.acme.internal",
    os: "linux",
    state: { kind: "joining" },
};
const ENROLLING: CloudOnboardingComputerRow = {
    ...OLGA_MAC,
    state: { kind: "joining" },
    note: "Connecting",
};
const OFFLINE: CloudOnboardingComputerRow = { ...BUILD, state: { kind: "offline" } };
const WINDOWS_PC: CloudOnboardingComputerRow = {
    id: "pc",
    name: "OLGA-DESKTOP",
    os: "windows",
    state: { kind: "unsupported" },
};
const FAILED: CloudOnboardingComputerRow = {
    id: "this",
    name: "this Mac",
    os: "mac",
    state: { kind: "failed", reason: "The command expired." },
};

interface Shot {
    readonly id: string;
    readonly label: string;
    readonly state?: State;
    /** The window's own controls, as its mockup draws them; Mac's unless said. */
    readonly chrome?: Chrome;
    readonly render?: (mode: ThemeMode) => ReactNode;
    /** Also shot in light. */
    readonly light?: boolean;
}

const OWNER: State = { reader: "owner" };
const MEMBER: State = { reader: "member" };

const shots: readonly Shot[] = [
    { id: "o17-computer", label: "Owner · first seen", state: OWNER, light: true },
    {
        id: "o17a-computer-connecting",
        label: "Owner · Connect this Mac pressed: command copied, waiting",
        state: {
            ...OWNER,
            connect: "working",
            computers: [waiting("this Mac", "Terminal", "mac")],
        },
        light: true,
    },
    {
        id: "o18-computer-online",
        label: "Owner · this Mac online",
        state: { ...OWNER, connect: "connected", computers: [OLGA_MAC], done: true },
    },
    {
        id: "o18a-computer-failed",
        label: "Owner · the command expired",
        state: { ...OWNER, connect: "failed", computers: [FAILED] },
    },
    {
        id: "o19-computer-two",
        label: "Owner · two computers",
        state: { ...OWNER, connect: "connected", computers: [OLGA_MAC, BUILD], done: true },
    },
    {
        id: "o19a-computer-four",
        label: "Owner · four computers, one still joining, at rest",
        state: {
            ...OWNER,
            connect: "connected",
            computers: [OLGA_MAC, BUILD, STUDIO, GPU],
            done: true,
        },
    },
    {
        id: "o19e-computer-four-end",
        label: "Owner · four computers, scrolled to the end",
        state: {
            ...OWNER,
            connect: "connected",
            computers: [OLGA_MAC, BUILD, STUDIO, GPU],
            done: true,
            end: true,
        },
    },
    {
        id: "o19b-computer-dialog",
        label: "Owner · Add server or sandbox",
        state: { ...OWNER, dialog: "add" },
        light: true,
    },
    {
        id: "o19c-computer-explainer",
        label: "Owner · How is this secured?",
        state: { ...OWNER, dialog: "explainer" },
    },
    {
        id: "o19d-computer-windows",
        label: "Owner · on Windows",
        state: { ...OWNER, hostOs: "windows" },
    },
    {
        id: "x01-computer-enrolling",
        label: "Not in the mockups · this Mac's computer joined and is connecting",
        state: { ...OWNER, connect: "working", computers: [ENROLLING] },
    },
    {
        id: "x02-computer-offline-windows",
        label: "Not in the mockups · a computer offline, and a Windows PC that joined",
        state: { ...OWNER, computers: [OFFLINE, WINDOWS_PC] },
    },
    {
        id: "x03-computer-linux",
        label: "Not in the mockups · on Linux, Connect pressed",
        state: {
            ...OWNER,
            hostOs: "linux",
            connect: "working",
            computers: [waiting("this machine", "a terminal", "linux")],
        },
    },
    {
        id: "x04-computer-dialog-minting",
        label: "Not in the mockups · Add server or sandbox while its command is made",
        state: { ...OWNER, dialog: "add", command: "minting" },
    },
    {
        id: "x05-computer-dialog-refused",
        label: "Not in the mockups · Add server or sandbox, the command refused",
        state: { ...OWNER, dialog: "add", command: "failed" },
    },
    { id: "m04-next-computer-optional", label: "Member · optional", state: MEMBER, light: true },
    {
        id: "m05-next-computer-optional-shared",
        // Kirill: a shared team computer completes the step too, so the gate is
        // done and Continue is live, though the person may still add their own.
        label: "Member · optional, the team has a shared computer",
        state: { ...MEMBER, shared: true, done: true },
    },
    {
        id: "m06-next-computer-installing",
        label: "Member · Connect this Mac pressed",
        state: {
            ...MEMBER,
            connect: "working",
            computers: [waiting("this Mac", "Terminal", "mac")],
        },
    },
    {
        id: "m07-next-computer-connected",
        label: "Member · this Mac online",
        state: { ...MEMBER, connect: "connected", computers: [SAM_MAC], done: true },
    },
    {
        id: "m08-next-computer-explainer",
        label: "Member · How is this secured?",
        state: { ...MEMBER, dialog: "explainer" },
    },
    {
        id: "m09-next-computer-add",
        label: "Member · Add server or sandbox",
        state: { ...MEMBER, dialog: "add" },
    },
    {
        id: "m10-next-computer-required",
        label: "Member · required",
        state: { ...MEMBER, required: true },
    },
    {
        id: "m11-next-windows-optional",
        label: "Member · on Windows, optional",
        state: { ...MEMBER, hostOs: "windows" },
        chrome: "windows",
    },
    {
        id: "m12-next-windows-required",
        label: "Member · on Windows, required",
        state: { ...MEMBER, hostOs: "windows", required: true },
        chrome: "windows",
    },
    {
        id: "m17-next-left-required",
        label: "Member · left setup on a required computer step",
        render: () => (
            <Window>
                <WindowDragRegion />
                <EmptyState
                    action={{ label: "Continue setup", onClick: noop }}
                    description="1 step left. What you finished is saved."
                    icon="spark"
                    size="panel"
                    title="Finish setting up @acme"
                />
            </Window>
        ),
    },
    {
        id: "m18-settings-computer-optional",
        label: "Settings › Administration, Computer on Optional",
        render: () => (
            <Window>
                <HappyAgentSettingsShell
                    activeCategoryId="administration"
                    categories={HAPPY_CLOUD_OWNER_SETTINGS_CATEGORIES}
                    connectionRail
                    description="How this server is set up for everyone on it"
                    onCategorySelect={noop}
                    onClose={noop}
                    sidebarWidth={240}
                    title="Administration"
                    windowControls
                >
                    <HappyAgentOnboardingSettings
                        loading={false}
                        onStepRequirementChange={noop}
                        steps={[
                            {
                                id: "avatar",
                                label: "Photo",
                                description: "Each person adds a profile picture.",
                                requirement: "optional",
                                editable: true,
                                saving: false,
                            },
                            {
                                id: "computer",
                                label: "Computer",
                                description:
                                    "Each person adds a computer of their own, and only their agents work on it. Required also stops anyone who only has a Windows PC, which can’t run work yet.",
                                requirement: "optional",
                                editable: true,
                                saving: false,
                            },
                            {
                                id: "mobileApp",
                                label: "Phone",
                                description: "Each person signs in to the mobile app.",
                                requirement: "off",
                                editable: true,
                                saving: false,
                            },
                        ]}
                    />
                </HappyAgentSettingsShell>
            </Window>
        ),
    },
];

/**
 * A dialog focuses its first control as it mounts; none of these pictures has
 * been pressed or typed in, so the page lets go of any focus it was not given
 * by a press or a key.
 */
function releaseUnaskedFocus(element: HTMLDivElement | null) {
    if (!element) return;
    let asked = false;
    const ask = () => {
        asked = true;
    };
    element.addEventListener("pointerdown", ask, true);
    element.addEventListener("keydown", ask, true);
    element.addEventListener("focusin", (event) => {
        if (!asked && event.target instanceof HTMLElement) event.target.blur();
    });
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && element.contains(focused)) focused.blur();
}

const size = (window: Window) => `${String(window.width)}x${String(window.height)}`;

function captures(): readonly {
    readonly name: string;
    readonly shot: Shot;
    readonly mode: ThemeMode;
    readonly window: Window;
}[] {
    return [LARGE, SMALL, MINIMUM].flatMap((window) =>
        shots.flatMap((shot) =>
            (shot.light && window === LARGE
                ? (["dark", "light"] as const)
                : (["dark"] as const)
            ).map((mode) => ({ name: `${shot.id}-${mode}-${size(window)}`, shot, mode, window })),
        ),
    );
}

/**
 * `?only=<text>` renders only the screens whose name holds it: every screen
 * mounts its own WebGL sky, and Chromium keeps a bounded number alive.
 */
const only = new URLSearchParams(window.location.search).get("only");
const selected = captures().filter((capture) => only === null || capture.name.includes(only));

/*
 * Where the caption buttons sit is read from the window itself, one answer for
 * the whole page, so the page answers as Windows would only when `?only=`
 * picks screens drawn in a Windows window alone (`?only=next-windows`).
 */
if (selected.length > 0 && selected.every((capture) => capture.shot.chrome === "windows"))
    Object.defineProperty(navigator, "windowControlsOverlay", {
        configurable: true,
        value: {
            visible: true,
            getTitlebarAreaRect: () => new DOMRect(0, 0, window.innerWidth - CAPTION_WIDTH, 40),
            addEventListener: noop,
            removeEventListener: noop,
        },
    });

export function CloudOnboardingComputerPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The computer step of a Happy Cloud server's onboarding and its two dialogs, owner then member, one specimen per round 4 mockup."
            title="Cloud onboarding · Add a computer"
        >
            <div ref={releaseUnaskedFocus} style={{ display: "contents" }}>
                {selected.map((capture, index) => (
                    <FullScreenSpecimen
                        detail={`${capture.mode} · ${size(capture.window)}`}
                        key={capture.name}
                        label={capture.shot.label}
                        number={String(index + 1).padStart(2, "0")}
                        screen={capture.name}
                        window={capture.window}
                    >
                        <ThemeScope mode={capture.mode}>
                            {capture.shot.render ? (
                                capture.shot.render(capture.mode)
                            ) : capture.shot.state ? (
                                <Step
                                    chrome={capture.shot.chrome}
                                    mode={capture.mode}
                                    state={capture.shot.state}
                                />
                            ) : null}
                        </ThemeScope>
                    </FullScreenSpecimen>
                ))}
            </div>
        </ComponentPage>
    );
}
