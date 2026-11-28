import { useSyncExternalStore, type ReactNode } from "react";
import {
    happyAgentMobileConnectorStoreUnfollowed,
    type AppearanceStore,
    type HappyAgentCloudProvidersStore,
    type HappyAgentPaymentsStore,
    type HappyAgentProvidersStore,
    type HappyAgentPluginsStore,
    type HappyAgentClockStore,
    type HappyAgentOnboardingStore,
    type HappyAgentProfileStore,
    type WelcomeStore,
} from "happy-desktop-state";
import {
    EmptyState,
    LocalOnboardingScreen,
    ProfileSetupScreen,
    SetupCover,
    WelcomeScreen,
    WindowDragRegion,
    type LocalOnboardingView,
} from "happy-desktop-ui";
import { happyAgentWelcomeSlides } from "../onboarding/happyAgentWelcomeSlides";
import { AppCloudOnboarding } from "./AppCloudOnboarding";
import { useAppMobilePairingOptions } from "./AppMobilePairing";

export function HappyAgentOnboardingBoundary(props: {
    readonly store: HappyAgentOnboardingStore;
    readonly welcome: WelcomeStore;
    readonly appearance: AppearanceStore;
    readonly profile: HappyAgentProfileStore;
    readonly clock: HappyAgentClockStore;
    readonly online: boolean;
    /** The server this window is joining, as its rail tile names it. */
    readonly serverLabel?: string;
    /** What a new member's placeholder is picked by until they choose a photo. */
    readonly placeholderSeed: string;
    readonly onRetry: () => void;
    readonly onExternalOpen?: (url: string) => void;
    /** A Happy Cloud server's AI connections, plugins and payments, for its gates. */
    readonly cloudProviders?: () => HappyAgentCloudProvidersStore | undefined;
    readonly plugins?: () => HappyAgentPluginsStore | undefined;
    readonly payments?: () => HappyAgentPaymentsStore | undefined;
    readonly providers?: () => HappyAgentProvidersStore;
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
    const online = props.online;
    // The offer leads to the direct code; the connector is read only while it is on screen.
    const pairing = snapshot.state?.completed === false && mobile.status === "pairing";
    const pairingOptions = useAppMobilePairingOptions({
        layout: "setup",
        direct: pairing ? props.store.mobile.direct : happyAgentMobileConnectorStoreUnfollowed,
        clock: props.clock,
        online: () => online,
        ...(online ? {} : { unavailable: "Happy can't reach this Happy Agent right now." }),
    });
    // A server with onboarding gates decides every step; the reader is in once
    // none is left on screen.
    if (snapshot.flow) {
        // Setup takes the whole window, the connection rail included, and
        // gives it back when the reader finishes or leaves.
        if (!snapshot.flow.current) return props.children;
        if (snapshot.flow.away) {
            // With only optional steps left the reader is in; the workspace
            // offers the way back. A required step still holds the server
            // shut, so its surface says so and nothing else.
            if (!snapshot.flow.blocked) return props.children;
            const left = snapshot.flow.remaining;
            return (
                <>
                    <WindowDragRegion />
                    <EmptyState
                        action={{ label: "Continue setup", onClick: props.store.onboardingResume }}
                        data-testid="cloud-onboarding-hold"
                        description={`${String(left)} ${left === 1 ? "step" : "steps"} left. What you finished is saved.`}
                        icon="spark"
                        size="panel"
                        title={`Finish setting up ${props.serverLabel ?? "this server"}`}
                    />
                </>
            );
        }
        return (
            <SetupCover>
                <AppCloudOnboarding
                    appearance={appearance.mode}
                    placeholderSeed={props.placeholderSeed}
                    profile={props.profile}
                    profileSnapshot={profile}
                    snapshot={snapshot}
                    store={props.store}
                    {...(props.cloudProviders ? { cloudProviders: props.cloudProviders } : {})}
                    {...(props.plugins ? { plugins: props.plugins } : {})}
                    {...(props.payments ? { payments: props.payments } : {})}
                    {...(props.providers ? { providers: props.providers } : {})}
                    {...(props.serverLabel ? { serverLabel: props.serverLabel } : {})}
                    {...(props.onExternalOpen ? { onExternalOpen: props.onExternalOpen } : {})}
                />
            </SetupCover>
        );
    }
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
        return (
            <ProfileSetupScreen
                appearance={appearance.mode}
                // A Happy Cloud server is not online until this profile exists,
                // and its profile route answers regardless, so the button
                // waits only on the profile itself; a save that can't reach
                // the server says so under the field.
                busy={profile.saving}
                loading={profile.loading}
                name={profile.name}
                {...(profile.saveError ? { message: profile.saveError } : {})}
                {...(profile.photoError ? { photoError: profile.photoError } : {})}
                {...(profile.photoCrop ? { photoCrop: profile.photoCrop } : {})}
                {...(profile.photoStaged ? { photoUrl: profile.photoStaged.imageUrl } : {})}
                photoOpening={profile.photoActivity === "opening"}
                placeholderSeed={props.placeholderSeed}
                {...(props.serverLabel ? { serverLabel: props.serverLabel } : {})}
                onCreate={() => void props.profile.profileCreate()}
                onExternalOpen={props.onExternalOpen}
                onNameChange={props.profile.displayNameUpdate}
                onPhotoChoose={(file) => void props.profile.photoStageChoose(file)}
                onPhotoCropCancel={props.profile.photoCropCancel}
                onPhotoCropConfirm={(region) => void props.profile.photoCropConfirm(region)}
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
                    busy: !props.online,
                    ...(mobile.message ? { message: mobile.message } : {}),
                };
            case "pairing":
                return { kind: "happy-mobile-pairing" };
            case "configured":
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
