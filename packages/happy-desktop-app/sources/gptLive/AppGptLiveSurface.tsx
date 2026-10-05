import { useSyncExternalStore, type ReactNode } from "react";
import {
    experimentsStoreNoop,
    type ExperimentsStore,
    type GptLiveStore,
} from "happy-desktop-state";
import { GptLiveSurface } from "happy-desktop-ui";

export function AppGptLiveSurface(props: {
    readonly store: GptLiveStore;
    readonly experiments?: ExperimentsStore;
    readonly children: ReactNode;
}) {
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const experiments = props.experiments ?? experimentsStoreNoop;
    const experimental = useSyncExternalStore(
        experiments.subscribe,
        experiments.get,
        experiments.get,
    ).experimentalFeaturesEnabled;
    return (
        <GptLiveSurface
            state={experimental ? state : { ...state, gptLiveEnabled: false, panelVisible: false }}
            onOpen={props.store.panelOpen}
            onClose={props.store.panelClose}
            onStart={props.store.callStart}
            onEnd={props.store.callEnd}
            onAccountSelect={props.store.accountSelect}
            onMutedChange={props.store.microphoneMutedUpdate}
            onMessageConfirm={props.store.messageConfirm}
            onMessageCancel={props.store.messageCancel}
        >
            {props.children}
        </GptLiveSurface>
    );
}
