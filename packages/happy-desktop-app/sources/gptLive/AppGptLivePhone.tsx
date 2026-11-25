import { useSyncExternalStore } from "react";
import {
    experimentsStoreNoop,
    type ExperimentsStore,
    type GptLiveCallState,
    type GptLiveProblem,
    type GptLiveStore,
} from "happy-desktop-state";
import { GptLiveCallBar, GptLivePhone, type GptLivePhoneStatus } from "happy-desktop-ui";

/**
 * The window's one call as this agent's phone shows it. While a call is
 * connecting or live, on any agent, the status bar's call bar stands in for
 * the phone, so there is none.
 */
function phoneOf(
    call: GptLiveCallState,
    connectionId: string,
): { status: GptLivePhoneStatus; message?: string } | undefined {
    if (call.kind === "idle") return { status: "idle" };
    if (call.kind === "connecting" || call.kind === "active") return undefined;
    if (call.connectionId !== connectionId) return { status: "idle" };
    return { status: "ended", message: call.message };
}

/** Whether the voice experiment is on; the window's own opt-in is in the call's snapshot. */
function useGptLiveExperimental(experiments: ExperimentsStore | undefined): boolean {
    const source = experiments ?? experimentsStoreNoop;
    return useSyncExternalStore(source.subscribe, source.get, source.get).voice;
}

/** One agent's phone: a call started here is hosted by that agent. */
export function AppGptLivePhone(props: {
    store: GptLiveStore;
    connectionId: string;
    experiments?: ExperimentsStore;
}) {
    // One subscription; this small control re-renders with the snapshot.
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const experimental = useGptLiveExperimental(props.experiments);
    const phone = phoneOf(state.call, props.connectionId);
    if (!experimental || !state.gptLiveEnabled || !phone) return null;
    return <GptLivePhone {...phone} onStart={() => props.store.callStart(props.connectionId)} />;
}

/** The few words the status bar keeps for why a call stopped. */
const ENDED_REASONS: Record<GptLiveProblem, string> = {
    connection: "Call dropped",
    agentOffline: "Agent offline",
    notSetUp: "Voice isn't set up",
    unsupportedWindow: "Can't call from here",
    microphonePermission: "No microphone access",
};

/**
 * The window's call in the status bar, whichever agent hosts it: mute and
 * hang-up act on that one call, and the bars read its received voice.
 */
export function AppGptLiveCallBar(props: { store: GptLiveStore; experiments?: ExperimentsStore }) {
    // One subscription; the bar's levels are read on demand, never through it.
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const experimental = useGptLiveExperimental(props.experiments);
    const call = state.call;
    if (!experimental || !state.gptLiveEnabled || call.kind === "idle") return null;
    if (call.kind === "ended")
        return (
            <GptLiveCallBar
                message={call.message}
                onClose={props.store.callEnd}
                reason={ENDED_REASONS[call.problem]}
                state="ended"
            />
        );
    const live = {
        muted: call.muted,
        onEnd: props.store.callEnd,
        onMutedChange: (muted: boolean) => props.store.microphoneMutedUpdate(muted),
    };
    if (call.kind === "connecting") return <GptLiveCallBar {...live} state="connecting" />;
    return (
        <GptLiveCallBar
            {...live}
            levelsRead={props.store.outputLevelsRead}
            since={call.since}
            state="active"
        />
    );
}
