import type { CSSProperties, ReactNode } from "react";
import {
    CloudOnboardingProviderDialog,
    type CloudOnboardingProviderDialogProps,
} from "../../src/CloudOnboardingProviderDialog";
import type { CloudOnboardingProviderRow } from "../../src/CloudOnboardingProviderRows";
import { CloudOnboardingScreen } from "../../src/CloudOnboardingScreen";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { SetupCover } from "../../src/SetupCover";
import { ThemeScope, type ThemeMode } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-061";

const noop = () => undefined;

const WINDOWS = [
    { width: 1100, height: 760 },
    { width: 760, height: 670 },
    { width: 720, height: 640 },
] as const;

type Window = (typeof WINDOWS)[number];

const STEPS = [
    { id: "profile", label: "Profile", done: true },
    { id: "inference", label: "AI", done: false },
    { id: "plugins", label: "Tools", done: false },
    { id: "compute", label: "Computer", done: false },
    { id: "teammates", label: "Team", done: false },
];

const connections: readonly ConnectionShellItem[] = [
    { id: "local", label: "This Mac", local: true, status: "connected" },
    { id: "acme", label: "@acme", local: false, placeholderSeed: "acme", status: "connected" },
    { id: "lab", label: "@lab", local: false, placeholderSeed: "lab", status: "connected" },
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

/** How many accounts each provider has, as the server would list them. */
type Accounts = Partial<Record<CloudOnboardingProviderRow["id"], number>>;

const NONE: Accounts = {};
const ONE: Accounts = { chatgpt: 1 };
const TWO_AND_ONE: Accounts = { chatgpt: 2, claude: 1 };

function rows(accounts: Accounts): readonly CloudOnboardingProviderRow[] {
    return (["chatgpt", "claude", "xai", "bedrock", "custom"] as const).map((id) => ({
        id,
        accounts: accounts[id] ?? 0,
        onOpen: noop,
    }));
}

/** A dialog's callbacks, which the specimens never call. */
const HANDLERS = {
    onWaySelect: noop,
    onSaveToChange: noop,
    onClose: noop,
    onAddAnother: noop,
    onSignInStart: noop,
    onSignInCodeSubmit: noop,
    onSetupTokenSubmit: noop,
    onApiKeySubmit: noop,
    onAwsKeysSubmit: noop,
} as const;

type DialogState = Omit<
    CloudOnboardingProviderDialogProps,
    keyof typeof HANDLERS | "team" | "regionEditable" | "saveToSwitchable"
>;

/** ChatGPT's device sign-in, waiting on the person at OpenAI with the code the server sent. */
const CHATGPT_PLAN: DialogState = {
    provider: "chatgpt",
    ways: ["plan", "key"],
    way: "plan",
    saveTo: "team",
    phase: "waiting",
    signIn: { url: "https://auth.openai.com/codex/device", userCode: "ABCD-1234" },
};

const SHOTS: readonly {
    readonly id: string;
    readonly label: string;
    readonly accounts: Accounts;
    readonly dialog?: DialogState;
    readonly light?: boolean;
    /** A member, who may keep accounts only for themselves. */
    readonly member?: boolean;
}[] = [
    { id: "o05-ai", label: "Nothing connected", accounts: NONE, light: true },
    {
        id: "o06-ai-chatgpt",
        label: "ChatGPT, plan, waiting on the code",
        accounts: NONE,
        dialog: CHATGPT_PLAN,
        light: true,
    },
    {
        id: "o07-ai-claude",
        label: "Claude, plan",
        accounts: NONE,
        dialog: {
            provider: "claude",
            ways: ["plan", "token", "key"],
            way: "plan",
            saveTo: "team",
            phase: "waiting",
            signIn: { url: "https://claude.ai/oauth/authorize" },
        },
    },
    {
        id: "o08-ai-key",
        label: "ChatGPT, API key",
        accounts: NONE,
        dialog: {
            provider: "chatgpt",
            ways: ["plan", "key"],
            way: "key",
            saveTo: "team",
            phase: "idle",
        },
    },
    {
        id: "o09-ai-success",
        label: "ChatGPT connected",
        accounts: ONE,
        dialog: { ...CHATGPT_PLAN, phase: "done" },
    },
    { id: "o09a-ai-one-account", label: "One ChatGPT account", accounts: ONE },
    {
        id: "o10-ai-two-and-one",
        label: "Two ChatGPT accounts and one Claude",
        accounts: TWO_AND_ONE,
        light: true,
    },
    {
        id: "o11-ai-add-another",
        label: 'ChatGPT from "Add another": the same form as the first',
        accounts: TWO_AND_ONE,
        dialog: CHATGPT_PLAN,
    },
    {
        id: "o11a-ai-private",
        label: 'ChatGPT after "Keep private instead"',
        accounts: NONE,
        dialog: { ...CHATGPT_PLAN, saveTo: "private" },
    },
    // Real states the mockups do not draw, in their style.
    {
        id: "x01-ai-chatgpt-starting",
        label: "ChatGPT, plan, before the server sends the code",
        accounts: NONE,
        dialog: { ...CHATGPT_PLAN, phase: "busy", signIn: undefined },
    },
    {
        id: "x02-ai-chatgpt-failed",
        label: "ChatGPT, plan, the sign-in stopped",
        accounts: NONE,
        dialog: {
            ...CHATGPT_PLAN,
            phase: "idle",
            signIn: undefined,
            error: "The code expired. Try again for a new one.",
        },
    },
    {
        id: "x03-ai-claude-token",
        label: "Claude, setup token",
        accounts: NONE,
        dialog: {
            provider: "claude",
            ways: ["plan", "token", "key"],
            way: "token",
            saveTo: "team",
            phase: "idle",
        },
    },
    {
        id: "x04-ai-key-checking",
        label: "ChatGPT, API key being checked",
        accounts: NONE,
        dialog: {
            provider: "chatgpt",
            ways: ["plan", "key"],
            way: "key",
            saveTo: "team",
            phase: "busy",
        },
    },
    {
        id: "x05-ai-key-refused",
        label: "ChatGPT, API key refused",
        accounts: NONE,
        dialog: {
            provider: "chatgpt",
            ways: ["plan", "key"],
            way: "key",
            saveTo: "team",
            phase: "idle",
            error: "OpenAI did not accept this key. Check it is whole and still active.",
        },
    },
    {
        id: "x06-ai-xai",
        label: "xAI, its one way",
        accounts: NONE,
        dialog: { provider: "xai", ways: ["key"], way: "key", saveTo: "team", phase: "idle" },
    },
    {
        id: "x07-ai-bedrock",
        label: "Amazon Bedrock, team only",
        accounts: NONE,
        dialog: { provider: "bedrock", ways: ["key"], way: "key", saveTo: "team", phase: "idle" },
    },
    {
        id: "x08-ai-member",
        label: "A member: private only, no switch",
        accounts: NONE,
        member: true,
        dialog: { ...CHATGPT_PLAN, saveTo: "private" },
    },
];

function Screen(props: {
    readonly mode: ThemeMode;
    readonly accounts: Accounts;
    readonly dialog?: DialogState;
    readonly member?: boolean;
}) {
    const connected = Object.values(props.accounts).some((count) => count > 0);
    return (
        <ConnectionShell
            add={{ label: "Connect to Happy Cloud", onAdd: noop }}
            items={connections}
            onSelect={noop}
            selectedId="acme"
            windowControls
        >
            <ConnectionSurface active>
                <SetupCover>
                    <CloudOnboardingScreen
                        action={{ label: "Continue", disabled: !connected, onSelect: noop }}
                        appearance={props.mode}
                        back={{ onSelect: noop }}
                        currentStep="inference"
                        exit={{ onSelect: noop }}
                        serverLabel="Acme"
                        steps={STEPS}
                        view={{ kind: "inference", rows: rows(props.accounts) }}
                        {...(connected ? {} : { skip: { onSelect: noop } })}
                    />
                    {props.dialog ? (
                        <CloudOnboardingProviderDialog
                            {...HANDLERS}
                            {...props.dialog}
                            regionEditable={!props.member}
                            saveToSwitchable={!props.member}
                            team="Acme"
                        />
                    ) : null}
                </SetupCover>
            </ConnectionSurface>
        </ConnectionShell>
    );
}

function size(window: Window): string {
    return `${String(window.width)}x${String(window.height)}`;
}

function Specimen(props: {
    readonly number: string;
    readonly shot: (typeof SHOTS)[number];
    readonly mode: ThemeMode;
    readonly window: Window;
    readonly children: ReactNode;
}) {
    return (
        <FullScreenSpecimen
            detail={`${props.mode} · ${size(props.window)}`}
            label={props.shot.label}
            number={props.number}
            screen={`${props.shot.id}-${props.mode}-${size(props.window)}`}
            window={props.window}
        >
            <div
                data-chrome="mac"
                style={{
                    height: "100%",
                    overflow: "hidden",
                    position: "relative",
                    transform: "translateZ(0)",
                    width: "100%",
                }}
            >
                <div style={{ containerType: "size", height: "100%", width: "100%" }}>
                    <ThemeScope mode={props.mode}>{props.children}</ThemeScope>
                </div>
                <TrafficLights />
            </div>
        </FullScreenSpecimen>
    );
}

/**
 * Happy Cloud onboarding's AI step, in the real frame: the real rows and the
 * real per-provider dialog with fixture props, one screen per round 4 mockup,
 * named as the mockups are.
 */
export function CloudOnboardingAiPage() {
    const captures = WINDOWS.flatMap((window) =>
        SHOTS.flatMap((shot) =>
            (["dark", ...(shot.light ? (["light"] as const) : [])] as const).map((mode) => ({
                shot,
                mode,
                window,
            })),
        ),
    );
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Happy Cloud onboarding's Connect your AI step: rows on the page, one dialog per provider."
            title="Cloud onboarding AI"
        >
            {captures.map((capture, index) => (
                <Specimen
                    key={`${capture.shot.id}-${capture.mode}-${size(capture.window)}`}
                    mode={capture.mode}
                    number={String(index + 1).padStart(2, "0")}
                    shot={capture.shot}
                    window={capture.window}
                >
                    <Screen
                        mode={capture.mode}
                        accounts={capture.shot.accounts}
                        member={capture.shot.member === true}
                        {...(capture.shot.dialog ? { dialog: capture.shot.dialog } : {})}
                    />
                </Specimen>
            ))}
        </ComponentPage>
    );
}
