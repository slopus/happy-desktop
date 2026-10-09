import { useSyncExternalStore, type ReactNode } from "react";
import type {
    AppearanceStore,
    HappyAgentOnboardingStore,
    HappyAgentProfileStore,
    WelcomeStore,
} from "happy-desktop-state";
import {
    LocalOnboardingScreen,
    ProfileSetupScreen,
    WelcomeScreen,
    type LocalOnboardingView,
} from "happy-desktop-ui";
import { happyAgentWelcomeSlides } from "../onboarding/happyAgentWelcomeSlides";

export function HappyAgentOnboardingBoundary(props: {
    readonly store: HappyAgentOnboardingStore;
    readonly welcome: WelcomeStore;
    readonly appearance: AppearanceStore;
    readonly profile: HappyAgentProfileStore;
    readonly online: boolean;
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
    const profileAvailable = props.online || snapshot.available === true;
    if (!snapshot.state || snapshot.state.completed) return props.children;
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
                busy={profile.loading || profile.saving || !profileAvailable}
                email={profile.email}
                {...(message ? { message } : {})}
                name={profile.name}
                onCreate={() => {
                    if (
                        profileAvailable &&
                        !profile.loading &&
                        profile.name.trim() &&
                        profile.email.trim()
                    )
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
                return {
                    kind: "happy-mobile-pairing",
                    data: mobile.data,
                    expiresAt: mobile.expiresAt,
                };
            case "failed":
                return {
                    kind: "happy-mobile-failed",
                    busy: mobile.pending || !props.online,
                    message: mobile.message,
                };
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
            onHappyMobilePlatformSelect={props.store.mobile.happyMobilePlatformSelect}
        />
    );
}
