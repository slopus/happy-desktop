import { useSyncExternalStore, type ReactNode } from "react";
import {
    happyAgentMobileConnectorStoreNoop,
    mobilePairingMethodStoreNoop,
    type AppearanceStore,
    type HappyAgentClockStore,
    type HappyAgentOnboardingStore,
    type HappyAgentProfileStore,
    type MobilePairingMethodStore,
} from "happy-desktop-state";
import {
    LocalOnboardingScreen,
    ProfileSetupScreen,
    type LocalOnboardingView,
} from "happy-desktop-ui";
import { appMobileRelayFromOnboarding, useAppMobilePairingOptions } from "./AppMobilePairing";

export function HappyAgentOnboardingBoundary(props: {
    readonly store: HappyAgentOnboardingStore;
    readonly appearance: AppearanceStore;
    readonly profile: HappyAgentProfileStore;
    readonly clock: HappyAgentClockStore;
    readonly online: boolean;
    /** Which pairing method shows first; absent, Relay. */
    readonly mobilePairingMethod?: MobilePairingMethodStore;
    readonly onRetry: () => void;
    readonly onExternalOpen?: (url: string) => void;
    /**
     * Experimental onboarding: a team member is asked only for what their
     * account didn't give. The name and email it gave are saved as offered.
     */
    readonly profileFromAccount?: boolean;
    readonly children: ReactNode;
}) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const appearance = useSyncExternalStore(
        props.appearance.subscribe,
        props.appearance.get,
        props.appearance.get,
    );
    const profile = useSyncExternalStore(
        props.profile.subscribe,
        props.profile.get,
        props.profile.get,
    );
    const mobile = useSyncExternalStore(
        props.store.mobile.subscribe,
        props.store.mobile.get,
        props.store.mobile.get,
    );
    const methodStore = props.mobilePairingMethod ?? mobilePairingMethodStoreNoop;
    const { method } = useSyncExternalStore(
        methodStore.subscribe,
        methodStore.get,
        methodStore.get,
    );
    const online = props.online;
    const pairingOptions = useAppMobilePairingOptions({
        layout: "setup",
        method,
        // Setup links a phone through the relay only for now; Direct stays in
        // Settings › Mobile Access.
        relayOnly: true,
        // Choosing Direct asks for a direct code.
        onMethodSelect: (next) => {
            if (next === "direct") props.store.mobile.direct.pairingOpen();
            methodStore.methodSelect(next, "onboarding");
        },
        relay: appMobileRelayFromOnboarding(mobile),
        relayStarting: mobile.status === "failed" && mobile.pending,
        onRelayRetry: props.store.mobile.happyMobileConnect,
        direct: happyAgentMobileConnectorStoreNoop,
        clock: props.clock,
        online: () => online,
        ...(online ? {} : { unavailable: "Happy can't reach this Happy Agent right now." }),
    });
    // A Happy Cloud member is in once their profile is saved. The server's own
    // setup, naming its Chief of Staff, happens in that bot's chat.
    if (!snapshot.state || snapshot.state.completed || snapshot.state.member?.completed)
        return props.children;
    // A remote Happy Agent admits a new team member only once their profile
    // exists. Local setup never asks for one.
    if (!snapshot.state.steps.profile.done) {
        const message = profile.saveError || snapshot.error;
        const offered = profile.name.trim() !== "" && profile.email.includes("@");
        // The account gave both and they are being saved: the connection's
        // own splash stays until the server lets the member in.
        if (props.profileFromAccount && offered && !message) return props.children;
        return (
            <ProfileSetupScreen
                appearance={appearance.mode}
                {...(props.profileFromAccount && profile.storedEmail.includes("@")
                    ? { ask: "name" as const }
                    : {})}
                // A Happy Cloud server is not online until this profile exists,
                // and its profile route answers regardless, so the button
                // waits only on the profile itself; a save that can't reach
                // the server says so in the step's message.
                busy={profile.loading || profile.saving}
                email={profile.email}
                {...(message ? { message } : {})}
                name={profile.name}
                onCreate={() => {
                    if (!profile.loading && profile.name.trim() && profile.email.trim())
                        void props.profile.profileSave().catch(() => undefined);
                }}
                onEmailChange={props.profile.emailUpdate}
                onExternalOpen={props.onExternalOpen}
                onNameChange={props.profile.displayNameUpdate}
            />
        );
    }
    // A server that runs onboarding as a conversation offers the phone, and
    // everything else, there.
    if (snapshot.chatOnboarding) return props.children;
    const view = ((): LocalOnboardingView => {
        switch (mobile.status) {
            case "desktop":
                return { kind: "happy-mobile-desktop", step: mobile.step };
            case "checking":
                return { kind: "happy-mobile-checking" };
            case "offer":
                return {
                    kind: "happy-mobile-offer",
                    busy: mobile.pending || !props.online,
                    ...(mobile.message ? { message: mobile.message } : {}),
                };
            case "pairing":
            case "failed":
                return { kind: "happy-mobile-pairing" };
            case "configured":
            case "disabled":
            case "skipped":
                return { kind: "checking", message: snapshot.error ?? "Finishing setup…" };
        }
    })();
    return (
        <LocalOnboardingScreen
            appearance={appearance.mode}
            view={view}
            onExternalOpen={props.onExternalOpen}
            onAssistantsContinue={() => undefined}
            onConnectRetry={props.onRetry}
            onHappyMobileConnect={props.store.mobile.happyMobileConnect}
            onHappyMobileSkip={props.store.mobile.happyMobileSkip}
            happyMobilePairingOptions={pairingOptions}
        />
    );
}
