import {
    happyAgentChatOnboardingOver,
    type HappyAgentChatOnboardingStore,
    type WelcomeStore,
} from "happy-desktop-state";
import type { LocalOnboardingStore } from "./localOnboardingStore";

/**
 * How first-run setup runs on this machine's own Happy Agent.
 *
 * - `classic`: the window's own setup screens, for a Happy Agent that does not
 *   run onboarding itself, or that this window is not talking to.
 * - `checking`: connected, and the Happy Agent has not said yet whether it runs
 *   onboarding itself. Nothing is drawn for setup meanwhile, so neither kind
 *   flashes before the other.
 * - `chat`: the Happy Agent runs onboarding in Chief of Staff's conversation,
 *   and the window shows the workspace with that conversation open.
 */
export type DesktopChatOnboardingPhase = "classic" | "checking" | "chat";

export interface DesktopChatOnboardingStore {
    get(): DesktopChatOnboardingPhase;
    subscribe(listener: () => void): () => void;
    [Symbol.dispose](): void;
}

/** The local connection's onboarding conversation, while the connection exists. */
export interface DesktopChatOnboardingLocal {
    readonly store: HappyAgentChatOnboardingStore;
    /** The connection failed rather than still coming up. */
    readonly failed: boolean;
}

/**
 * Hands first-run setup to the Happy Agent when it runs onboarding itself
 * (happy-agent API.md "Onboarding in a conversation").
 *
 * The welcome still chooses between this computer and Happy Cloud, and the
 * window still installs and starts Happy Agent itself. Once the Happy Agent
 * answers with `chatOnboarding`, this begins the server's flow while the
 * machine's own setup is still owed, and that conversation carries the rest:
 * the assistants, the profile, the phone. What the window's setup still records
 * for itself — that the assistants were seen, that the phone step is done, that
 * setup finished — follows from the flow: the assistants as soon as the
 * conversation carries them, the rest once the server says onboarding is over.
 *
 * A Happy Agent without the capability keeps the classic setup, and nothing
 * here treats a missing capability as onboarding being complete.
 */
export function desktopChatOnboardingStoreCreate(options: {
    readonly welcome: WelcomeStore;
    readonly onboarding: LocalOnboardingStore;
    readonly local: {
        get(): DesktopChatOnboardingLocal | undefined;
        subscribe(listener: () => void): () => void;
    };
}): DesktopChatOnboardingStore {
    const listeners = new Set<() => void>();
    let phase: DesktopChatOnboardingPhase = "classic";
    let disposed = false;
    let followed: HappyAgentChatOnboardingStore | undefined;
    let followedStop: (() => void) | undefined;
    /** Machine setup is followed only once the welcome hands the window to it. */
    let setupStop: (() => void) | undefined;
    /** The setup stage the assistants were last continued from, so each arrival is answered once. */
    let continuedFrom: string | undefined;
    let mobileSkipped = false;

    const synchronize = (): void => {
        if (disposed) return;
        const welcomed = options.welcome.get().welcomeAcknowledged;
        if (welcomed && setupStop === undefined)
            setupStop = options.onboarding.subscribe(synchronize);
        const local = welcomed ? options.local.get() : undefined;
        const store = local?.store;
        if (store !== followed) {
            followedStop?.();
            followed = store;
            followedStop = store?.subscribe(synchronize);
        }
        const setup = welcomed ? options.onboarding.get().onboarding : undefined;
        const owed =
            setup !== undefined && setup.stage !== "inactive" && setup.stage !== "complete";
        const chat = store?.get();
        const over =
            chat?.status === "available" &&
            chat.flow !== undefined &&
            happyAgentChatOnboardingOver(chat.flow);
        // Begun while machine setup is still owed; the server starts it only
        // if its own onboarding is incomplete. Beginning publishes, which
        // brings the window back here.
        if (store !== undefined && chat?.status === "available" && !chat.begun && !over && owed) {
            store.begin();
            return;
        }
        const next: DesktopChatOnboardingPhase =
            chat === undefined || chat.status === "unsupported"
                ? "classic"
                : chat.status === "checking"
                  ? local?.failed === true
                      ? "classic"
                      : "checking"
                  : over || chat.begun
                    ? "chat"
                    : "classic";
        if (next === "chat" && store !== undefined && setup !== undefined && owed)
            carry(store, setup.stage);
        else continuedFrom = undefined;
        if (next === phase) return;
        phase = next;
        for (const listener of listeners) listener();
    };

    /** What the window's own setup records while the conversation carries it. */
    const carry = (store: HappyAgentChatOnboardingStore, stage: string): void => {
        // The conversation shows what this machine has and connects it, so the
        // window's report of the same is continued past rather than shown.
        if (stage === "providersMissing" || stage === "assistantsFound") {
            if (continuedFrom !== stage) {
                continuedFrom = stage;
                options.onboarding.assistantsContinue();
            }
        } else continuedFrom = undefined;
        const flow = store.get().flow;
        if (flow === undefined || !happyAgentChatOnboardingOver(flow) || mobileSkipped) return;
        // The phone was offered in the conversation. Skipping the window's
        // own phone step lets setup finish, which opens nothing new: the
        // conversation is already where the person is.
        mobileSkipped = true;
        options.onboarding.happyMobileSkip();
    };

    const stops = [options.welcome.subscribe(synchronize), options.local.subscribe(synchronize)];
    synchronize();

    return {
        get: () => phase,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        [Symbol.dispose]() {
            disposed = true;
            for (const stop of stops) stop();
            setupStop?.();
            setupStop = undefined;
            followedStop?.();
            followedStop = undefined;
            followed = undefined;
            listeners.clear();
        },
    };
}
