import {
    type HappyAgentClient,
    type HappyAgentProfile,
    type HappyAgentProfileActions,
    type HappyAgentProfileSource,
    type happyAgentProtocol,
    UserError,
} from "happy-desktop-state";

const RETRY_MS = 1_000;

export interface HappyAgentProfileAdapter {
    readonly actions: HappyAgentProfileActions;
    readonly source: HappyAgentProfileSource;
}

/**
 * Adapts the daemon's installation profile to the profile surface. One
 * bootstrap establishes the authoritative value, then the daemon's complete
 * `profile.updated` replacements keep it current.
 */
export function happyAgentProfileSourceCreate(client: HappyAgentClient): HappyAgentProfileAdapter {
    const subscribers = new Map<
        (profile: HappyAgentProfile | undefined) => void,
        (error: unknown) => void
    >();
    let active: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let latest: happyAgentProtocol.Profile | undefined;
    let initialized = false;

    const profileProject = (profile: happyAgentProtocol.Profile): HappyAgentProfile | undefined => {
        if (profile.email === null && profile.name === null) return undefined;
        return {
            email: profile.email ?? "",
            name: profile.name ?? "",
            updatedAt: profile.updatedAt,
        };
    };

    const profileAdopt = (profile: happyAgentProtocol.Profile, force = false): void => {
        if (
            initialized &&
            !force &&
            (profile.updatedAt < (latest?.updatedAt ?? 0) || profile.version === latest?.version)
        )
            return;
        latest = profile;
        initialized = true;
        const projected = profileProject(profile);
        for (const listener of subscribers.keys()) listener(projected);
    };

    const follow = async (controller: AbortController): Promise<void> => {
        for (;;) {
            const bootstrap = await client.getDesktopBootstrap({ signal: controller.signal });
            if (controller.signal.aborted) return;
            profileAdopt(bootstrap.profile, true);

            let reconcile = false;
            for await (const update of client.updates({
                after: bootstrap.cursor,
                signal: controller.signal,
            })) {
                if (update.kind === "state_lost") {
                    reconcile = true;
                    break;
                }
                if (update.kind === "daemon_started" && update.replaced) {
                    reconcile = true;
                    break;
                }
                if (update.kind === "event" && update.event.type === "profile.updated") {
                    const profile = update.event.payload.profile;
                    if (profile) profileAdopt(profile);
                    else {
                        const response = await client.getProfile({ signal: controller.signal });
                        if (controller.signal.aborted) return;
                        profileAdopt(response.profile);
                    }
                }
            }
            if (controller.signal.aborted) return;
            if (!reconcile) throw new Error("Happy Agent profile updates stopped.");
        }
    };

    const sourceStart = (): void => {
        if (active || subscribers.size === 0) return;
        const controller = new AbortController();
        active = controller;
        void follow(controller)
            .catch((error: unknown) => {
                if (controller.signal.aborted) return;
                for (const onError of subscribers.values()) onError(error);
            })
            .finally(() => {
                if (active === controller) active = undefined;
                if (!controller.signal.aborted && subscribers.size > 0)
                    retry = setTimeout(() => {
                        retry = undefined;
                        sourceStart();
                    }, RETRY_MS);
            });
    };

    return {
        actions: {
            async profileSave(input) {
                const current = latest ?? (await client.getProfile()).profile;
                const updated = await client.updateProfile(
                    {
                        email: input.email,
                        mutationId: crypto.randomUUID(),
                        name: input.name,
                    },
                    { ifMatch: current.version },
                );
                profileAdopt(updated.profile);
                const projected = profileProject(updated.profile);
                if (projected === undefined)
                    throw new UserError(
                        "Happy Agent saved an empty profile. Add a name and email, then try again.",
                    );
                return projected;
            },
        },
        source: {
            subscribe(listener, onError) {
                subscribers.set(listener, onError);
                if (initialized && latest) listener(profileProject(latest));
                sourceStart();
                let closed = false;
                return () => {
                    if (closed) return;
                    closed = true;
                    subscribers.delete(listener);
                    if (subscribers.size > 0) return;
                    active?.abort();
                    active = undefined;
                    if (retry) clearTimeout(retry);
                    retry = undefined;
                };
            },
        },
    };
}
