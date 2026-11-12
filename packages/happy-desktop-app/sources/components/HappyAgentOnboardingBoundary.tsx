import { useSyncExternalStore, type ReactNode } from "react";
import {
    experimentsStoreNoop,
    happyAgentMobileConnectorStoreUnfollowed,
    type AppearanceStore,
    type ExperimentsStore,
    type HappyAgentClockStore,
    type HappyAgentOnboardingStore,
    type HappyAgentProfileStore,
    type MobilePairingMethodStore,
    type WelcomeStore,
} from "happy-desktop-state";
import {
    LocalOnboardingScreen,
    ProfileSetupScreen,
    WelcomeScreen,
    type LocalOnboardingView,
} from "happy-desktop-ui";
import { happyAgentWelcomeSlides } from "../onboarding/happyAgentWelcomeSlides";
import { appMobileRelayFromOnboarding, useAppMobilePairingOptions } from "./AppMobilePairing";

export function HappyAgentOnboardingBoundary(props: {
    readonly store: HappyAgentOnboardingStore;
    readonly welcome: WelcomeStore;
    readonly appearance: AppearanceStore;
    readonly profile: HappyAgentProfileStore;
    readonly clock: HappyAgentClockStore;
    readonly online: boolean;
    /** Which pairing method shows: this computer's default until the person picks on the page. */
    readonly mobilePairingMethod: MobilePairingMethodStore;
    /** Whether Direct is offered beside Relay; absent, only Relay. */
    readonly experiments?: ExperimentsStore;
    readonly onRetry: () => void;
    readonly onExternalOpen?: (url: string) => void;
    readonly children: ReactNode;
}) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const welcome = useSyncExternalStore(
        props.welcome.subscribe,
        props.welcome.get,
        props.welcome.get,
    );
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
    const methodStore = props.mobilePairingMethod;
    const methodSnapshot = useSyncExternalStore(
        methodStore.subscribe,
        methodStore.get,
        methodStore.get,
    );
    const experimentsStore = props.experiments ?? experimentsStoreNoop;
    const experiments = useSyncExternalStore(
        experimentsStore.subscribe,
        experimentsStore.get,
        experimentsStore.get,
    );
    // Until Direct is turned on in Experiments, pairing is Relay alone.
    const relayOnly = !experiments.directConnection;
    const method = relayOnly ? "relay" : methodSnapshot.method;
    const online = props.online;
    // The relay offer leads to methods: the direct pairing opens with it,
    // and the connector is read only while Direct is on screen.
    const pairing =
        snapshot.state?.completed === false &&
        (mobile.status === "pairing" || mobile.status === "failed");
    const pairingOptions = useAppMobilePairingOptions({
        layout: "setup",
        method,
        relayOnly,
        // Choosing Direct asks for a direct code.
        onMethodSelect: (next) => {
            if (next === "direct") props.store.mobile.direct.pairingOpen();
            methodStore.methodSelect(next, "onboarding");
        },
        relay: appMobileRelayFromOnboarding(mobile),
        relayStarting: mobile.status === "failed" && mobile.pending,
        onRelayRetry: props.store.mobile.happyMobileConnect,
        direct:
            pairing && method === "direct"
                ? props.store.mobile.direct
                : happyAgentMobileConnectorStoreUnfollowed,
        clock: props.clock,
        online: () => online,
        ...(online ? {} : { unavailable: "Happy can't reach this Happy Agent right now." }),
    });
    // A Happy Cloud member is in once their profile is saved. The server's own
    // setup, naming its Chief of Staff, happens in that bot's chat.
    if (!snapshot.state || snapshot.state.completed || snapshot.state.member?.completed)
        return props.children;
    if (!welcome.welcomeAcknowledged)
        return (
            <WelcomeScreen
                appearance={appearance.mode}
                backdrop={{ kind: "sky" }}
                onAction={() => {
                    props.welcome.welcomeAcknowledge();
                    props.store.onboardingBegin();
                }}
                onAppearanceChange={props.appearance.appearanceSelect}
                slides={happyAgentWelcomeSlides}
            />
        );
    // A remote Happy Agent admits a new team member only once their profile
    // exists. Local setup never asks for one.
    if (!snapshot.state.steps.profile.done) {
        const message = profile.saveError || snapshot.error;
        return (
            <ProfileSetupScreen
                appearance={appearance.mode}
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
            onHappyMobileConnect={() => {
                // Linking from the offer opens the pairing page on the default.
                if (mobile.status === "offer") methodStore.methodReset();
                props.store.mobile.happyMobileConnect();
            }}
            onHappyMobileSkip={props.store.mobile.happyMobileSkip}
            happyMobilePairingOptions={pairingOptions}
        />
    );
}
