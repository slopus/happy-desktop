import { SetupChoice } from "../../src/SetupChoice";
import { DesktopMobileSetup, type DesktopMobileSetupStep } from "../../src/DesktopMobileSetup";
import { LocalOnboardingScreen, type LocalOnboardingView } from "../../src/LocalOnboardingScreen";
import { ProfileSetupScreen } from "../../src/ProfileSetupScreen";
import { SetupHandoff, SetupPage } from "../../src/SetupPage";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-252";

const noop = () => undefined;

const desktopSteps: readonly { label: string; view: LocalOnboardingView }[] = [
    { label: "Progress · setup", view: { kind: "agent-setup", phase: { kind: "preparing" } } },
    { label: "Progress · assistants", view: { kind: "examining" } },
    {
        label: "Progress · retry",
        view: {
            kind: "connect-failed",
            message: "Happy Agent could not connect. Try again.",
            retrying: false,
        },
    },
];

const handoffSteps: readonly { label: string; busy: boolean; message?: string }[] = [
    { label: "Handoff · opening the conversation", busy: true },
    {
        label: "Handoff · setup retry",
        busy: false,
        message: "The conversation could not be opened. Try again.",
    },
];

const mobileSteps: readonly { label: string; step: DesktopMobileSetupStep }[] = [
    { label: "Mobile · get the app", step: { kind: "intro", platform: "ios" } },
    { label: "Mobile · Android", step: { kind: "intro", platform: "android" } },
    { label: "Mobile · code on its way", step: { kind: "link", phase: { kind: "checking" } } },
    {
        label: "Mobile · device QR",
        step: {
            kind: "link",
            phase: {
                kind: "pairing",
                data: "happy://terminal?AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                expiresAt: 1924992000000,
            },
        },
    },
    {
        label: "Mobile · code expired",
        step: {
            kind: "link",
            phase: {
                kind: "failed",
                message: "The pairing code expired or was cancelled. Try again for a new code.",
            },
        },
    },
    { label: "Mobile · connected", step: { kind: "connected", online: true } },
    { label: "Mobile · linked and offline", step: { kind: "connected", online: false } },
];

/** Setup fills the window, so every specimen gets a window-shaped frame. */
const frame = {
    border: "1px solid var(--border)",
    borderRadius: "10px",
    height: "460px",
    overflow: "hidden",
    position: "relative" as const,
    width: "100%",
};

export function SetupPagePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One step of setup as one centred page: a picture of what is happening, a sentence naming it, a line explaining it, and at most one thing to do. Every first-run state is this component with different fields filled in."
            title="Setup page"
        >
            <Specimen
                detail="Waiting on the machine · scene, title, copy, no action"
                label="Waiting"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={frame}>
                        <SetupPage
                            copy="Reading what this machine already has."
                            scene="snail"
                            title="Checking this machine…"
                        />
                    </div>
                    <DimensionRule label="560 body · 40 padding · 120 stage · 24 gap" />
                </div>
            </Specimen>

            <Specimen
                detail="A failure that can be named: the error verbatim, the command to run, one retry"
                label="Failed"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={frame}>
                        <SetupPage
                            action={{ label: "Try again", onSelect: noop }}
                            command="happy-agent start"
                            copy="connect ENOENT /Users/you/.happy/agent/server.sock"
                            scene="owl"
                            title="Happy could not reach Happy Agent"
                        />
                    </div>
                    <DimensionRule label="Command is selectable · monospace on surface-high" />
                </div>
            </Specimen>

            <Specimen
                detail="A body of its own replaces the scene: the fork is already a picture"
                label="With a body"
                number="03"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={frame}>
                        <SetupPage title="How should Happy run?">
                            <SetupChoice
                                onSelect={noop}
                                options={[
                                    {
                                        actionLabel: "Stay in the app",
                                        description:
                                            "Everything happens in this window. Nothing is added to your machine.",
                                        id: "app",
                                        scene: "sparkles",
                                        title: "Just the app",
                                    },
                                    {
                                        actionLabel: "Install the CLI",
                                        actionVariant: "primary",
                                        description:
                                            "Happy Agent is a coding agent you run from a terminal, always in sync with this app.",
                                        id: "happy-agent",
                                        scene: "robot",
                                        title: "Install CLI tools",
                                    },
                                ]}
                            />
                        </SetupPage>
                    </div>
                    <DimensionRule label="Slot is full width inside the body measure" />
                </div>
            </Specimen>

            <Specimen
                detail="A step, not a fault: no error, no command, and the wait sits on the button"
                label="Waiting on you"
                number="04"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={frame}>
                        <SetupPage
                            action={{ busy: true, label: "Check again", onSelect: noop }}
                            copy="Happy Agent runs the coding assistants you have already signed in to, and none are signed in yet. Sign in to Codex, Claude Code or Grok in a terminal, and Happy picks it up from there."
                            scene="owl"
                            title="No coding assistant yet"
                        />
                    </div>
                    <DimensionRule label="Busy action spins in place · the page does not change" />
                </div>
            </Specimen>

            <Specimen
                detail="Title alone, when there is nothing truthful to add under it"
                label="Bare"
                number="05"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={frame}>
                        <SetupPage
                            action={{ label: "Choose a folder…", onSelect: noop }}
                            scene="wand"
                            title="Open your first project"
                        />
                    </div>
                    <DimensionRule label="Missing fields collapse; the column stays centred" />
                </div>
            </Specimen>

            <Specimen
                detail="Managed first install · one verified download action, with no terminal prerequisite"
                label="Download Happy Agent"
                number="06"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={frame}>
                        <SetupPage
                            action={{ label: "Download and start", onSelect: noop }}
                            copy="Happy downloads the published release for this Mac, verifies its checksum, and keeps each version isolated before starting it."
                            scene="owl"
                            title="Download Happy Agent"
                        />
                    </div>
                    <DimensionRule label="One native action · 36px button, sized to its label" />
                </div>
            </Specimen>

            <Specimen
                detail="Bytes arriving · the bar stands where the button stood, at the same height"
                label="Measured progress"
                number="07"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={frame}>
                        <SetupPage
                            action={{
                                busy: true,
                                label: "Downloading…",
                                onSelect: noop,
                                progress: {
                                    detail: "12.4 MB of 38.2 MB",
                                    fraction: 0.32,
                                    kind: "measured",
                                },
                            }}
                            copy="Downloading Happy Agent 0.0.11…"
                            scene="owl"
                            title="Download Happy Agent"
                        />
                    </div>
                    <DimensionRule label="280 track · 4 tall · width eased over the reported count" />
                </div>
            </Specimen>

            <Specimen
                detail="Running with nothing measured yet · a sweep, because a bar at zero reads as stuck"
                label="Unmeasured progress"
                number="08"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={frame}>
                        <SetupPage
                            action={{
                                busy: true,
                                label: "Downloading…",
                                onSelect: noop,
                                progress: { kind: "waiting" },
                            }}
                            copy="Checking what arrived and unpacking it."
                            scene="owl"
                            title="Download Happy Agent"
                        />
                    </div>
                    <DimensionRule label="Same box · no fraction claimed, no position asserted" />
                </div>
            </Specimen>

            <Specimen
                detail="First-run setup · one shared sky, white content, appearance-paired paintings"
                label="Onboarding sky"
                number="09"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={frame}>
                        <ThemeScope mode="light">
                            <SetupPage
                                action={{ label: "Continue", onSelect: noop }}
                                backdrop={{ appearance: "light", kind: "sky" }}
                                copy="Happy Agent is running and ready for the next step."
                                scene="sparkles"
                                title="Happy Agent is ready"
                                transitionKey="ready"
                            />
                        </ThemeScope>
                    </div>
                    <div style={frame}>
                        <ThemeScope mode="dark">
                            <SetupPage
                                action={{ label: "Continue", onSelect: noop }}
                                backdrop={{ appearance: "dark", kind: "sky" }}
                                copy="Happy Agent is running and ready for the next step."
                                scene="sparkles"
                                title="Happy Agent is ready"
                                transitionKey="ready"
                            />
                        </ThemeScope>
                    </div>
                    <DimensionRule label="Same crop and contrast treatment as Welcome · 320ms stage dissolve" />
                </div>
            </Specimen>

            <Specimen
                detail="second onboarding screen · automatic verified download · no action required and no machine progress on the welcome deck"
                label="Preparing the first agent"
                number="10"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{
                                kind: "agent-setup",
                                phase: {
                                    download: {
                                        receivedBytes: 12.4 * 1024 * 1024,
                                        totalBytes: 38.2 * 1024 * 1024,
                                    },
                                    kind: "downloading",
                                },
                            }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>

            <Specimen
                detail="subscription search begins with all three vendor columns already mounted and Continue already standing there, inert"
                label="Subscription discovery"
                number="11"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{ kind: "examining" }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>

            <Specimen
                detail="same retained vendor columns · daemon checks update their labels in place without moving the owl, title, copy, or the inert Continue"
                label="Authentication checking"
                number="12"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{
                                assistants: [
                                    {
                                        authentication: "checking",
                                        command: "/opt/homebrew/bin/claude",
                                        id: "claude",
                                        status: "found",
                                    },
                                    {
                                        authentication: "checking",
                                        command: "/opt/homebrew/bin/codex",
                                        id: "codex",
                                        status: "found",
                                    },
                                    {
                                        authentication: "unavailable",
                                        id: "grok",
                                        status: "missing",
                                    },
                                ],
                                custom: { authentication: "checking", providers: [] },
                                kind: "provider-authentication",
                            }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>

            <Specimen
                detail="one successful inference proves a subscription works · local sign-in checks continue without repeating successful inference · Continue turns on without waiting for the rest"
                label="Authentication verified"
                number="13"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{
                                assistants: [
                                    {
                                        authentication: "valid",
                                        command: "/opt/homebrew/bin/claude",
                                        id: "claude",
                                        status: "found",
                                    },
                                    {
                                        authentication: "invalid",
                                        command: "/opt/homebrew/bin/codex",
                                        id: "codex",
                                        status: "found",
                                    },
                                    {
                                        authentication: "unavailable",
                                        id: "grok",
                                        status: "missing",
                                    },
                                ],
                                custom: { authentication: "invalid", providers: [] },
                                kind: "provider-authentication",
                            }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>

            <Specimen
                detail="nothing installed · each column carries the vendor install link · Continue stays inert without a subscription"
                label="Subscriptions missing"
                number="14a"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{
                                assistants: [
                                    {
                                        authentication: "unavailable",
                                        id: "claude",
                                        status: "missing",
                                    },
                                    {
                                        authentication: "unavailable",
                                        id: "codex",
                                        status: "missing",
                                    },
                                    {
                                        authentication: "unavailable",
                                        id: "grok",
                                        status: "missing",
                                    },
                                ],
                                custom: { authentication: "invalid", providers: [] },
                                kind: "provider-authentication",
                            }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>

            <Specimen
                detail="the first step, revisited from the step bar · reports what is installed and returns to the live step"
                label="Setup revisited"
                number="14b"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{
                                kind: "agent-ready",
                                nodeVersion: "v22.11.0",
                                version: "0.0.86",
                            }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>

            <Specimen
                detail="no valid local sign-in · every column says what to run · Continue stays inert, because there is nothing to continue to"
                label="Authentication unavailable"
                number="14"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{
                                assistants: [
                                    {
                                        authentication: "invalid",
                                        command: "/opt/homebrew/bin/claude",
                                        id: "claude",
                                        status: "found",
                                    },
                                    {
                                        authentication: "invalid",
                                        command: "/opt/homebrew/bin/codex",
                                        id: "codex",
                                        status: "found",
                                    },
                                    {
                                        authentication: "invalid",
                                        command: "/opt/homebrew/bin/grok",
                                        id: "grok",
                                        status: "found",
                                    },
                                ],
                                custom: { authentication: "invalid", providers: [] },
                                kind: "provider-authentication",
                            }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>

            <Specimen
                detail="optional final onboarding decision · one clear connection action and a permanent Skip"
                label="Happy Mobile offer"
                number="15"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{ busy: false, kind: "happy-mobile-offer" }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>

            <Specimen
                detail="daemon-supplied opaque data only · crisp QR · realtime approval wait · no manual refresh"
                label="Happy Mobile pairing"
                number="16"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{
                                data: "happy://terminal?eyJ2IjoxLCJwYWlyaW5nSWQiOiJibHVlcHJpbnQtcGFpcmluZyIsIm5vbmNlIjoiaGFwcHktbW9iaWxlIn0",
                                expiresAt: 1_900_000_000_000,
                                kind: "happy-mobile-pairing",
                            }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>

            <Specimen
                detail="pairing failure remains optional · retry is local to this step · Skip is still available"
                label="Happy Mobile failure"
                number="17"
                stage="surface"
            >
                <div style={frame}>
                    <ThemeScope mode="dark">
                        <LocalOnboardingScreen
                            appearance="dark"
                            onAssistantsContinue={noop}
                            onConnectRetry={noop}
                            onHappyMobileConnect={noop}
                            onHappyMobileSkip={noop}
                            view={{
                                busy: false,
                                kind: "happy-mobile-failed",
                                message:
                                    "The pairing code expired before Happy Mobile approved it.",
                            }}
                        />
                    </ThemeScope>
                </div>
            </Specimen>
            {desktopSteps.map(({ label, view }, index) => (
                <Specimen
                    key={label}
                    detail="Stable overall stages · completed and remaining counts · current step is not a loading animation"
                    label={label}
                    number={String(index + 18)}
                    stage="surface"
                >
                    <div style={{ ...frame, height: "800px" }} data-progress-specimen={label}>
                        <ThemeScope mode="dark">
                            <LocalOnboardingScreen
                                appearance="dark"
                                showSteps
                                view={view}
                                onAssistantsContinue={noop}
                                onConnectRetry={noop}
                                onHappyMobileConnect={noop}
                                onHappyMobileSkip={noop}
                            />
                        </ThemeScope>
                    </div>
                </Specimen>
            ))}
            {mobileSteps.map(({ label, step }, index) => (
                <Specimen
                    key={label}
                    detail="Optional mobile setup · bundled animated sticker · no runtime or account required"
                    label={label}
                    number={String(index + 18 + desktopSteps.length)}
                    stage="surface"
                >
                    <div style={{ ...frame, height: "800px" }} data-mobile-specimen={label}>
                        <ThemeScope mode="dark">
                            <DesktopMobileSetup
                                appearance="dark"
                                onboarding
                                step={step}
                                onContinue={noop}
                                onSkip={noop}
                                onPlatformSelect={noop}
                            />
                        </ThemeScope>
                    </div>
                </Specimen>
            ))}
            {handoffSteps.map(({ label, busy, message }, index) => (
                <Specimen
                    key={label}
                    detail="Link Mobile App is the last page · the app opens to an unsent editable Chief of Staff draft · manual projects use the sidebar + button"
                    label={label}
                    number={String(index + 18 + desktopSteps.length + mobileSteps.length)}
                    stage="surface"
                >
                    <div style={{ ...frame, height: "800px" }} data-handoff-specimen={label}>
                        <ThemeScope mode="dark">
                            <SetupHandoff error={message} busy={busy} onRetry={noop}>
                                <SetupPage
                                    title="Workspace stays open"
                                    copy="The conversation and sidebar remain usable while the draft is prepared."
                                />
                            </SetupHandoff>
                        </ThemeScope>
                    </div>
                </Specimen>
            ))}
            <Specimen
                detail="Remote Happy Agent only · a new team member's profile · not part of local setup"
                label="Remote · profile"
                number={String(18 + desktopSteps.length + mobileSteps.length + handoffSteps.length)}
                stage="surface"
            >
                <div style={{ ...frame, height: "800px" }}>
                    <ThemeScope mode="dark">
                        <ProfileSetupScreen
                            appearance="dark"
                            busy={false}
                            email=""
                            name=""
                            onCreate={noop}
                            onEmailChange={noop}
                            onNameChange={noop}
                        />
                    </ThemeScope>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
