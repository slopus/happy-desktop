import { createContext, useCallback, useSyncExternalStore } from "react";
import {
    happyAgentChatOnboardingStoreNoop,
    type HappyAgentChatOnboardingStore,
    type HappyAgentClockStore,
    type HappyAgentDefaultModelStore,
    type HappyAgentMobileConnectorStore,
    type HappyAgentProviderClisStore,
} from "happy-desktop-state";
import {
    ChatDefaultModelFigure,
    ChatProviderCliFigure,
    ChatSettingsFigure,
    MobileDirectPairingPanel,
    type ChatActionFigures,
} from "happy-desktop-ui";

/**
 * What the conversations on the open Happy Agent add to what they draw: the
 * live figures its replies may hold, and the onboarding it may be running in
 * one of them. One value per connection, read by every conversation surface.
 */
export type HappyAgentConversationExtras = {
    readonly figures?: ChatActionFigures;
    readonly chatOnboarding: HappyAgentChatOnboardingStore;
};

const NO_EXTRAS: HappyAgentConversationExtras = {
    chatOnboarding: happyAgentChatOnboardingStoreNoop,
};

export const HappyAgentConversationExtrasContext =
    createContext<HappyAgentConversationExtras>(NO_EXTRAS);

/** The stores of one connection the extras are drawn from; absent where a host has none. */
export type HappyAgentConversationExtrasSource = {
    readonly chatOnboarding?: HappyAgentChatOnboardingStore;
    readonly providerClis?: () => HappyAgentProviderClisStore;
    readonly defaultModel?: () => HappyAgentDefaultModelStore;
    readonly mobileConnector?: () => HappyAgentMobileConnectorStore;
    readonly clock: HappyAgentClockStore;
};

/**
 * One connection's extras. A team server's own figures — invite, members,
 * compute, the phone's server link — are drawn as ways into its Settings.
 */
export function happyAgentConversationExtras(
    source: HappyAgentConversationExtrasSource | undefined,
    options: { readonly teamServer: boolean; readonly linkOpen: (url: string) => void },
): HappyAgentConversationExtras {
    if (source === undefined) return NO_EXTRAS;
    const providerClis = source.providerClis?.();
    const defaultModel = source.defaultModel?.();
    const phone = source.mobileConnector?.();
    const clock = source.clock;
    return {
        chatOnboarding: source.chatOnboarding ?? happyAgentChatOnboardingStoreNoop,
        figures: {
            ...(phone
                ? {
                      phonePairing: (live: boolean) => (
                          <HappyAgentChatPhonePairing clock={clock} live={live} phone={phone} />
                      ),
                  }
                : {}),
            ...(providerClis
                ? {
                      providerCli: (cliId: string) => (
                          <HappyAgentChatProviderCli
                              cliId={cliId}
                              linkOpen={options.linkOpen}
                              store={providerClis}
                          />
                      ),
                  }
                : {}),
            ...(defaultModel
                ? { defaultModel: <HappyAgentChatDefaultModel store={defaultModel} /> }
                : {}),
            ...(options.teamServer ? { teamSettings: true as const } : {}),
        },
    };
}

/**
 * This Happy Agent's direct pairing with a phone, where a chat shows it: the
 * code to scan in Happy on the phone, then the emoji both screens approve.
 * Live, it opens a pairing while it is shown and closes it when it goes; in an
 * older message it shows the pairing as it stands and starts nothing. It owns
 * its subscriptions, so only it repaints as the code counts down.
 */
function HappyAgentChatPhonePairing(props: {
    readonly phone: HappyAgentMobileConnectorStore;
    readonly clock: HappyAgentClockStore;
    readonly live: boolean;
}) {
    const phone = useSyncExternalStore(props.phone.subscribe, props.phone.get, props.phone.get);
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const store = props.phone;
    const live = props.live;
    // One ref for the store's lifetime and liveness: a new one each render
    // would close and reopen the pairing every time the code counts down.
    const pairingHold = useCallback(
        (node: HTMLDivElement | null) => {
            if (!node || !live) return;
            store.pairingOpen();
            return () => store.pairingClose();
        },
        [store, live],
    );
    return (
        <div ref={pairingHold}>
            <MobileDirectPairingPanel
                cancelling={phone.cancelling}
                codeSize={204}
                confirming={phone.confirming}
                connector={phone.connector}
                density="compact"
                now={now}
                onConfirm={store.pairingConfirm}
                onReject={store.pairingReject}
                onStart={store.pairingStart}
                starting={phone.starting}
                {...(phone.actionError ? { actionError: phone.actionError } : {})}
            />
        </div>
    );
}

/**
 * One provider CLI where a chat shows it, live from the connection's provider
 * CLIs: its install and sign-in, each control calling the server's provider CLI
 * routes. A server that does not serve them gets the way into its providers'
 * Settings instead. Only it repaints as an install or sign-in goes on.
 */
function HappyAgentChatProviderCli(props: {
    readonly store: HappyAgentProviderClisStore;
    readonly cliId: string;
    /** Opens a vendor's sign-in page in the person's browser. */
    readonly linkOpen: (url: string) => void;
}) {
    const clis = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const { store, cliId } = props;
    if (clis.status === "unsupported") return <ChatSettingsFigure type="providers" />;
    const cli = clis.clis.get(cliId);
    const error = clis.errors.get(cliId);
    return (
        <ChatProviderCliFigure
            cliId={cliId}
            {...(cli ? { cli } : {})}
            {...(error ? { error } : {})}
            onCancel={() => store.cliCancel(cliId)}
            onCodeSend={(code) => store.cliSignInCodeSend(cliId, code)}
            onInstall={() => store.cliInstall(cliId)}
            onPageOpen={props.linkOpen}
            onSignIn={() => store.cliSignIn(cliId)}
            requesting={clis.pending.has(cliId)}
        />
    );
}

/** The default model for new chats where a chat shows it, changed in place. */
function HappyAgentChatDefaultModel(props: { readonly store: HappyAgentDefaultModelStore }) {
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    return <ChatDefaultModelFigure onChange={props.store.defaultModelUpdate} state={state} />;
}
