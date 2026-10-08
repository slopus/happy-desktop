import { useSyncExternalStore } from "react";
import {
    experimentsStoreNoop,
    type ExperimentsStore,
    type GptLiveStore,
} from "happy-desktop-state";
import { GptLivePhone } from "happy-desktop-ui";

export function AppGptLivePhone(props: { store: GptLiveStore; experiments?: ExperimentsStore }) {
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const experiments = props.experiments ?? experimentsStoreNoop;
    const experimental = useSyncExternalStore(
        experiments.subscribe,
        experiments.get,
        experiments.get,
    ).experimentalFeaturesEnabled;
    return experimental && state.gptLiveEnabled ? (
        <GptLivePhone state={state} onStart={props.store.callStart} onEnd={props.store.callEnd} />
    ) : null;
}
