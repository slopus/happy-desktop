import { useSyncExternalStore } from "react";
import {
    experimentsStoreNoop,
    type ExperimentsStore,
    type GptLiveCallState,
    type GptLiveStore,
} from "happy-desktop-state";
import { GptLivePhone, type GptLivePhoneStatus } from "happy-desktop-ui";

/** The window's one call as this agent's phone shows it. */
function phoneOf(
    call: GptLiveCallState,
    connectionId: string,
): { status: GptLivePhoneStatus; message?: string } {
    if (call.kind === "idle") return { status: "idle" };
    if (call.connectionId !== connectionId)
        return call.kind === "ended"
            ? { status: "idle" }
            : { status: "busy", message: "In a voice call on another agent. End it to call here." };
    if (call.kind === "ended") return { status: "ended", message: call.message };
    return { status: call.kind };
}

/** One agent's phone: a call started here is hosted by that agent. */
export function AppGptLivePhone(props: {
    store: GptLiveStore;
    connectionId: string;
    experiments?: ExperimentsStore;
}) {
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const experiments = props.experiments ?? experimentsStoreNoop;
    const experimental = useSyncExternalStore(
        experiments.subscribe,
        experiments.get,
        experiments.get,
    ).voice;
    if (!experimental || !state.gptLiveEnabled) return null;
    const phone = phoneOf(state.call, props.connectionId);
    return (
        <GptLivePhone
            {...phone}
            onStart={() => props.store.callStart(props.connectionId)}
            onEnd={props.store.callEnd}
        />
    );
}
