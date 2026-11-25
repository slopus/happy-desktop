import { useState, type ReactNode } from "react";
import { Button } from "../../src/Button";
import { GptLiveCallBar, type GptLiveCallBarProps } from "../../src/GptLiveCallBar";
import { DevBuildMenu } from "../../src/DevBuildMenu";
import { GptLivePhone } from "../../src/GptLivePhone";
import { Sidebar } from "../../src/Sidebar";
import { SidebarBugReport } from "../../src/SidebarBugReport";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ThemeScope } from "../../src/ThemeScope";
import { gptLiveSyntheticLevels } from "../gptLiveSyntheticLevels";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-352";

const live = { onEnd: () => {}, onMutedChange: () => {} };
/* A call 1 minute 23 seconds in, on a pinned clock. */
const clock = () => 83_000;
const speaking = () => [0.95, 0.55, 0.36] as const;
const silent = () => [0, 0, 0] as const;

const STATES: readonly {
    id: string;
    label: string;
    detail: string;
    bar: GptLiveCallBarProps;
}[] = [
    {
        id: "01-connecting",
        label: "Connecting",
        detail: "Bars at rest · “Connecting…” · mute live · the pill cancels",
        bar: { state: "connecting", muted: false, ...live },
    },
    {
        id: "02-active-speaking",
        label: "Active, agent speaking",
        detail: "Each bar one band of the received voice: mid, low, high",
        bar: {
            state: "active",
            muted: false,
            since: 0,
            clock,
            levelsRead: speaking,
            ...live,
        },
    },
    {
        id: "03-active-silent",
        label: "Active, agent silent",
        detail: "Bars at rest: 3 × 6px pills, 2px apart, in the row's grey",
        bar: {
            state: "active",
            muted: false,
            since: 0,
            clock,
            levelsRead: silent,
            ...live,
        },
    },
    {
        id: "04-muted",
        label: "Muted",
        detail: "Microphone slashed on a red wash, pressed",
        bar: {
            state: "active",
            muted: true,
            since: 0,
            clock,
            levelsRead: speaking,
            ...live,
        },
    },
    {
        id: "05-ended-connection",
        label: "Ended: dropped",
        detail: "Reason, its full message behind it, and a close button, until closed",
        bar: {
            state: "ended",
            reason: "Call dropped",
            message: "The voice media connection ended. Start a new call to reconnect.",
            onClose: () => {},
        },
    },
];

/** The status bar as the app draws it, at a sidebar width, in one appearance. */
function StatusBar(props: {
    call?: ReactNode;
    /** A development build's branch menu in the footer, as the app shows it in development. */
    devBuild?: boolean;
    mode: "light" | "dark";
    screen: string;
    width: number;
}) {
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
                            {...(props.call === undefined ? {} : { call: props.call })}
                            {...(props.devBuild
                                ? {
                                      devMenu: (
                                          <DevBuildMenu
                                              branch="feature/example"
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
                            voice={
                                props.call === undefined ? (
                                    <GptLivePhone
                                        onEnd={() => {}}
                                        onStart={() => {}}
                                        status="idle"
                                    />
                                ) : undefined
                            }
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
                call={
                    <GptLiveCallBar
                        muted={muted}
                        onEnd={() => setSpeaking(false)}
                        onMutedChange={setMuted}
                        since={since}
                        state="active"
                        {...(speaking ? { levelsRead: syntheticLevels } : {})}
                    />
                }
                mode={props.mode}
                screen={`09-live-${props.mode}`}
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
            summary="The window's voice call in the status bar: three bars that follow the agent's voice, the call's length, mute, and a red hang-up pill, from the bar's leading edge."
            title="Voice call bar"
        >
            {STATES.map((state) => (
                <Specimen
                    detail={state.detail}
                    key={state.id}
                    label={state.label}
                    number={state.id.slice(0, 2)}
                >
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                        {(["light", "dark"] as const).map((mode) => (
                            <StatusBar
                                call={<GptLiveCallBar {...state.bar} />}
                                key={mode}
                                mode={mode}
                                screen={`${state.id}-${mode}`}
                                width={330}
                            />
                        ))}
                    </div>
                </Specimen>
            ))}
            <Specimen
                detail="No call: the phone sits before the theme menu and Settings"
                label="Idle"
                number="06"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    {(["light", "dark"] as const).map((mode) => (
                        <StatusBar key={mode} mode={mode} screen={`06-idle-${mode}`} width={330} />
                    ))}
                </div>
            </Specimen>
            <Specimen
                detail="290px, the sidebar at Happy's 1100 × 760 window: “Connecting…” and the call's length fit · 250px, the narrowest: the label gives way"
                label="Sidebar widths"
                number="07"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    <StatusBar
                        call={<GptLiveCallBar {...STATES[0]!.bar} />}
                        mode="light"
                        screen="07-default-connecting"
                        width={290}
                    />
                    <StatusBar
                        call={<GptLiveCallBar {...STATES[1]!.bar} />}
                        mode="light"
                        screen="07-default-active"
                        width={290}
                    />
                    <StatusBar
                        call={<GptLiveCallBar {...STATES[1]!.bar} />}
                        mode="light"
                        screen="07-narrowest-active"
                        width={250}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="A development build: the branch menu fills the row with no call and steps aside for one"
                label="Development build"
                number="08"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
                    <StatusBar devBuild mode="light" screen="08-dev-idle" width={330} />
                    <StatusBar
                        call={<GptLiveCallBar {...STATES[1]!.bar} />}
                        devBuild
                        mode="light"
                        screen="08-dev-active"
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
