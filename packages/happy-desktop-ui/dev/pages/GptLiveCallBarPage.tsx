import { useState } from "react";
import { Button } from "../../src/Button";
import { DevBuildMenu } from "../../src/DevBuildMenu";
import { GptLiveCallBar, type GptLiveCallBarProps } from "../../src/GptLiveCallBar";
import { GptLivePhone, type GptLivePhoneProps } from "../../src/GptLivePhone";
import { Sidebar } from "../../src/Sidebar";
import { SidebarBugReport } from "../../src/SidebarBugReport";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ThemeScope } from "../../src/ThemeScope";
import { gptLiveSyntheticLevels } from "../gptLiveSyntheticLevels";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-352";

/* A call 1 minute 23 seconds in, on a pinned clock. */
const clock = () => 83_000;
const speaking = () => [0.95, 0.55, 0.36] as const;
const silent = () => [0, 0, 0] as const;
const idlePhone: GptLivePhoneProps = { status: "idle", onStart: () => {} };
const livePhone = (status: "connecting" | "active", muted = false): GptLivePhoneProps => ({
    status,
    muted,
    onMutedChange: () => {},
    onEnd: () => {},
});

/** One status bar: what the call is doing at its left, and the voice slot. */
interface CallState {
    readonly call?: GptLiveCallBarProps;
    readonly phone: GptLivePhoneProps;
}

const STATES: readonly { id: string; label: string; detail: string; state: CallState }[] = [
    {
        id: "01-idle",
        label: "Idle",
        detail: "No call: the phone sits before the bug report, theme and Settings",
        state: { phone: idlePhone },
    },
    {
        id: "02-connecting",
        label: "Connecting",
        detail: "The phone's slot turns red to cancel, mute appears before it · bars at rest, “Connecting…”",
        state: { call: { state: "connecting" }, phone: livePhone("connecting") },
    },
    {
        id: "03-active-speaking",
        label: "Active, agent speaking",
        detail: "Each bar one band of the received voice: mid, low, high",
        state: {
            call: { state: "active", since: 0, clock, levelsRead: speaking },
            phone: livePhone("active"),
        },
    },
    {
        id: "04-active-silent",
        label: "Active, agent silent",
        detail: "Bars at rest: 3 × 6px pills, 2px apart, in the row's grey",
        state: {
            call: { state: "active", since: 0, clock, levelsRead: silent },
            phone: livePhone("active"),
        },
    },
    {
        id: "05-muted",
        label: "Muted",
        detail: "Microphone slashed on a red wash, pressed",
        state: {
            call: { state: "active", since: 0, clock, levelsRead: speaking },
            phone: livePhone("active", true),
        },
    },
    {
        id: "06-ended-connection",
        label: "Ended: dropped",
        detail: "The reason and a close button at the left until closed; the phone is back in its slot",
        state: {
            call: {
                state: "ended",
                reason: "Call dropped",
                message: "The voice media connection ended. Start a new call to reconnect.",
                onClose: () => {},
            },
            phone: {
                status: "ended",
                message: "The voice media connection ended. Start a new call to reconnect.",
                onStart: () => {},
            },
        },
    },
];

/** The status bar as the app draws it, at a sidebar width, in one appearance. */
function StatusBar(props: {
    state: CallState;
    /** A development build's branch menu in the footer, as the app shows it in development. */
    devBuild?: boolean;
    mode: "light" | "dark";
    screen: string;
    width: number;
}) {
    const call = props.state.call;
    return (
        <ThemeScope mode={props.mode}>
            <div
                data-screen={props.screen}
                style={{
                    border: "1px solid var(--divider)",
                    display: "flex",
                    height: "120px",
                    overflow: "hidden",
                    width: `${String(props.width)}px`,
                }}
            >
                <Sidebar
                    activeItemId=""
                    footer={
                        <SidebarFooter
                            bugReport={
                                <SidebarBugReport
                                    discordUrl="https://discord.gg/fX9WBAhyfD"
                                    onLinkOpen={() => undefined}
                                    onReport={() => Promise.resolve()}
                                    xPostUrl="https://x.com/intent/post?text=%40happy__eng"
                                />
                            }
                            {...(call === undefined ? {} : { call: <GptLiveCallBar {...call} /> })}
                            {...(props.devBuild
                                ? {
                                      devMenu: (
                                          <DevBuildMenu
                                              branch="feature/a-long-branch-name-that-has-to-truncate"
                                              onBlueprintOpen={() => {}}
                                          />
                                      ),
                                  }
                                : {})}
                            onSettingsOpen={() => {}}
                            theme={{
                                appearance: props.mode,
                                mode: props.mode,
                                onModeSelect: () => {},
                            }}
                            voice={<GptLivePhone {...props.state.phone} />}
                        />
                    }
                    onItemSelect={() => {}}
                    sections={[]}
                    style={{ width: "100%" }}
                />
            </div>
        </ThemeScope>
    );
}

const syntheticLevels = gptLiveSyntheticLevels();

/** A live call whose bars follow synthetic voice levels while "Speak" is on. */
function SyntheticCall(props: { mode: "light" | "dark" }) {
    const [speaking, setSpeaking] = useState(false);
    const [muted, setMuted] = useState(false);
    const [since] = useState(() => Date.now());
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <StatusBar
                mode={props.mode}
                screen={`09-live-${props.mode}`}
                state={{
                    call: {
                        state: "active",
                        since,
                        ...(speaking ? { levelsRead: syntheticLevels } : {}),
                    },
                    phone: {
                        status: "active",
                        muted,
                        onMutedChange: setMuted,
                        onEnd: () => setSpeaking(false),
                    },
                }}
                width={330}
            />
            <Button onClick={() => setSpeaking(!speaking)} size="small" variant="secondary">
                {speaking ? "Stop speaking" : "Speak"}
            </Button>
        </div>
    );
}

export function GptLiveCallBarPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The window's voice call in the status bar: three bars that follow the agent's voice and the call's length at its left; hang-up in the phone's own slot, with mute just before it. No button moves between states."
            title="Voice call bar"
        >
            {STATES.map((entry) => (
                <Specimen
                    detail={entry.detail}
                    key={entry.id}
                    label={entry.label}
                    number={entry.id.slice(0, 2)}
                >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                        {(["light", "dark"] as const).map((mode) => (
                            <StatusBar
                                key={mode}
                                mode={mode}
                                screen={`${entry.id}-${mode}`}
                                state={entry.state}
                                width={330}
                            />
                        ))}
                    </div>
                </Specimen>
            ))}
            <Specimen
                detail="290px, the sidebar at Happy's 1100 × 760 window · 250px, the narrowest: “Connecting…” ends in an ellipsis, the call's length stays whole or goes"
                label="Sidebar widths"
                number="07"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {([290, 250] as const).flatMap((width) =>
                        [STATES[1]!, STATES[2]!].map((entry) => (
                            <StatusBar
                                key={`${String(width)}-${entry.id}`}
                                mode="light"
                                screen={`07-${String(width)}-${entry.id.slice(3)}`}
                                state={entry.state}
                                width={width}
                            />
                        )),
                    )}
                </div>
            </Specimen>
            <Specimen
                detail="A development build: the branch menu fills the row with no call and steps aside for one"
                label="Development build"
                number="08"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    <StatusBar
                        devBuild
                        mode="light"
                        screen="08-dev-idle"
                        state={STATES[0]!.state}
                        width={330}
                    />
                    <StatusBar
                        devBuild
                        mode="light"
                        screen="08-dev-active"
                        state={STATES[2]!.state}
                        width={330}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Synthetic voice levels drive the bars; press Speak"
                label="Live bars"
                number="09"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    <SyntheticCall mode="light" />
                    <SyntheticCall mode="dark" />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
