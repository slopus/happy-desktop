import { useSyncExternalStore } from "react";
import {
    experimentsStoreNoop,
    type ExperimentsStore,
    type GptLiveCallState,
    type GptLiveProblem,
    type GptLiveStore,
} from "happy-desktop-state";
import { GptLiveCallBar, GptLivePhone, type GptLivePhoneProps } from "happy-desktop-ui";

/**
 * The window's one call as this agent's phone slot shows it. A call that is
 * connecting or live, on any agent, turns the slot into its hang-up and mute,
 * since it is the window's one call; an ended call is kept here only on the
 * agent that hosted it.
 */
function phoneOf(
    store: GptLiveStore,
    call: GptLiveCallState,
    connectionId: string,
): GptLivePhoneProps {
    if (call.kind === "connecting" || call.kind === "active")
        return {
            status: call.kind,
            muted: call.muted,
            onMutedChange: (muted) => store.microphoneMutedUpdate(muted),
            onEnd: store.callEnd,
        };
    const onStart = () => store.callStart(connectionId);
    if (call.kind === "ended" && call.connectionId === connectionId)
        return { status: "ended", message: call.message, onStart };
    return { status: "idle", onStart };
}

/** Whether the voice experiment is on; the window's own opt-in is in the call's snapshot. */
function useGptLiveExperimental(experiments: ExperimentsStore | undefined): boolean {
    const source = experiments ?? experimentsStoreNoop;
    return useSyncExternalStore(source.subscribe, source.get, source.get).voice;
}

/** One agent's phone slot: a call started here is hosted by that agent. */
export function AppGptLivePhone(props: {
    store: GptLiveStore;
    connectionId: string;
    experiments?: ExperimentsStore;
}) {
    // One subscription; this small control re-renders with the snapshot.
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const experimental = useGptLiveExperimental(props.experiments);
    if (!experimental || !state.gptLiveEnabled) return null;
    return <GptLivePhone {...phoneOf(props.store, state.call, props.connectionId)} />;
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
 * What the window's call is doing, at the left of the status bar, whichever
 * agent hosts it; the bars read its received voice. Its hang-up and mute are
 * in the phone's slot.
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
    if (call.kind === "connecting") return <GptLiveCallBar state="connecting" />;
    return (
        <GptLiveCallBar
            levelsRead={props.store.outputLevelsRead}
            since={call.since}
            state="active"
        />
    );
}
