import {
    type HappyAgentClient,
    HappyAgentApiError,
    type HappyAgentProfile,
    type HappyAgentProfileActions,
    type HappyAgentProfileSource,
    type HappyAgentSync,
    happyAgentSyncRead,
    type happyAgentProtocol,
    UserError,
} from "happy-desktop-state";

const RETRY_MS = 1_000;

export interface HappyAgentProfileAdapter {
    readonly actions: HappyAgentProfileActions;
    readonly source: HappyAgentProfileSource;
}

/** The photo bytes in hand, the photo they were read for, and their tag. */
interface PhotoBytes {
    readonly thumbhash: string;
    readonly etag: string | null;
    readonly imageUrl: string;
}

/**
 * Adapts the daemon's current member profile to the profile surface. Narrow
 * onboarding reads establish it before protected bootstrap, then the daemon's complete
 * `profile.updated` replacements keep it current.
 *
 * The profile carries only its photo's ThumbHash, so the bytes are read here
 * whenever the profile changes, conditionally on the tag of the bytes already
 * held: an unchanged photo costs a `304`, a replaced one swaps its address, and
 * a removed one is dropped. Until the bytes for the current photo arrive the
 * profile reports the ThumbHash alone, so a surface shows the placeholder
 * rather than the previous picture.
 */
export function happyAgentProfileSourceCreate(
    client: HappyAgentClient,
    sync: HappyAgentSync,
    onSaved: () => void = () => undefined,
): HappyAgentProfileAdapter {
    const subscribers = new Map<
        (profile: HappyAgentProfile | undefined) => void,
        (error: unknown) => void
    >();
    let active: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let latest: happyAgentProtocol.Profile | undefined;
    let initialized = false;
    let photo: PhotoBytes | undefined;
    /** The profile version whose photo was last read, or is being read now. */
    let photoVersion: string | undefined;
    let photoRead: AbortController | undefined;

    const profileProject = (profile: happyAgentProtocol.Profile): HappyAgentProfile | undefined => {
        if (profile.email === null && profile.name === null && profile.photo === null)
            return undefined;
        return {
            email: profile.email ?? "",
            name: profile.name ?? "",
            updatedAt: profile.updatedAt,
            ...(profile.photo === null
                ? {}
                : {
                      photo: {
                          thumbhash: profile.photo.thumbhash,
                          ...(photo?.thumbhash === profile.photo.thumbhash
                              ? { imageUrl: photo.imageUrl }
                              : {}),
                      },
                  }),
        };
    };

    const publish = (): void => {
        if (!latest) return;
        const projected = profileProject(latest);
        for (const listener of subscribers.keys()) listener(projected);
    };

    const photoReplace = (next: PhotoBytes | undefined): void => {
        const previous = photo;
        photo = next;
        publish();
        // Only once nothing reports the old address may its bytes go.
        if (previous && previous.imageUrl !== next?.imageUrl)
            URL.revokeObjectURL(previous.imageUrl);
    };

    const photoFollow = (profile: happyAgentProtocol.Profile): void => {
        if (profile.photo === null) {
            photoRead?.abort();
            photoRead = undefined;
            photoVersion = profile.version;
            if (photo) photoReplace(undefined);
            return;
        }
        // Every change to the profile is a new version, and the photo may be
        // among them; asking again for the same one would only answer `304`.
        if (photoVersion === profile.version) return;
        photoVersion = profile.version;
        photoRead?.abort();
        const controller = new AbortController();
        photoRead = controller;
        const thumbhash = profile.photo.thumbhash;
        const held = photo;
        void happyAgentSyncRead(
            controller.signal,
            async (): Promise<
                happyAgentProtocol.BinaryContent | "unchanged" | "missing" | "refused"
            > => {
                try {
                    return (
                        (await client.getProfilePhoto({
                            signal: controller.signal,
                            ...(held?.etag ? { ifNoneMatch: held.etag } : {}),
                        })) ?? "unchanged"
                    );
                } catch (error) {
                    if (!(error instanceof HappyAgentApiError) || error.status >= 500) throw error;
                    // Removed since this profile was read: the removal's own
                    // profile is on its way, and there is nothing to retry.
                    return error.status === 404 ? "missing" : "refused";
                }
            },
            () => undefined,
        )
            .then((content) => {
                if (controller.signal.aborted) return;
                if (content === "missing") photoReplace(undefined);
                // The ThumbHash stays; the next change to the profile asks again.
                else if (content === "refused") photoVersion = undefined;
                // The tag is content-derived, so these are the bytes already
                // held, now known to be this photo's.
                else if (content === "unchanged") {
                    if (held) photoReplace({ ...held, thumbhash });
                } else
                    photoReplace({
                        thumbhash,
                        etag: content.etag,
                        imageUrl: URL.createObjectURL(
                            new Blob([content.data], { type: content.contentType }),
                        ),
                    });
            })
            .catch(() => undefined)
            .finally(() => {
                if (photoRead === controller) photoRead = undefined;
            });
    };

    const photoForget = (): void => {
        photoRead?.abort();
        photoRead = undefined;
        photoVersion = undefined;
        if (photo) URL.revokeObjectURL(photo.imageUrl);
        photo = undefined;
    };

    const profileAdopt = (profile: happyAgentProtocol.Profile, force = false): void => {
        if (initialized && !force && profile.updatedAt < (latest?.updatedAt ?? 0)) return;
        latest = profile;
        initialized = true;
        // Re-deliver an unchanged successful value so a surface can clear its
        // previous read error without losing edits or replacing its snapshot.
        publish();
        if (subscribers.size > 0) photoFollow(profile);
    };

    const follow = async (controller: AbortController): Promise<void> => {
        let failed = false;
        const profileRead = () =>
            happyAgentSyncRead(
                controller.signal,
                () => client.getProfile({ signal: controller.signal }),
                (error) => {
                    failed = true;
                    for (const onError of subscribers.values()) onError(error);
                },
            );
        for await (const input of sync.follow({
            signal: controller.signal,
            events: ["profile.updated"],
            onOnboarding: (input) => {
                if (!input) return;
                profileAdopt(input.profile);
                failed = false;
            },
        })) {
            try {
                if (input.kind === "error") throw input.error;
                if (input.kind === "bootstrap") {
                    profileAdopt(input.bootstrap.profile, true);
                    failed = false;
                    continue;
                }
                if (input.kind === "reconcile" || (input.update.kind === "connected" && failed)) {
                    const response = await profileRead();
                    if (controller.signal.aborted) return;
                    profileAdopt(response.profile);
                    failed = false;
                    continue;
                }
                const update = input.update;
                if (update.kind === "event" && update.event.type === "profile.updated") {
                    const profile = update.event.payload.profile;
                    if (profile) profileAdopt(profile);
                    else {
                        const response = await profileRead();
                        if (controller.signal.aborted) return;
                        profileAdopt(response.profile);
                    }
                    failed = false;
                }
            } catch (error) {
                if (controller.signal.aborted) return;
                failed = true;
                for (const onError of subscribers.values()) onError(error);
            }
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

    /**
     * Sends one photo change against the version last seen. A refusal because
     * the profile moved on reads the profile again, so what is shown is the
     * version the reader's next attempt will be made against.
     */
    const photoChange = async (
        send: (version: string) => Promise<happyAgentProtocol.ProfileResponse>,
    ): Promise<void> => {
        const current = latest ?? (await client.getProfile()).profile;
        try {
            profileAdopt((await send(current.version)).profile);
        } catch (error) {
            if (error instanceof HappyAgentApiError && error.status === 409)
                await client.getProfile().then(
                    (response) => profileAdopt(response.profile),
                    () => undefined,
                );
            throw error;
        }
    };

    return {
        actions: {
            async profileSave(input) {
                const current = latest ?? (await client.getProfile()).profile;
                const updated = await client.updateProfile(
                    {
                        // A team member's first save may know no email; one
                        // is never invented for them.
                        ...(input.email ? { email: input.email } : {}),
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
                onSaved();
                return projected;
            },
            photoUpload(image) {
                return photoChange((version) =>
                    client.setProfilePhoto(
                        { contentType: image.contentType, data: image.data },
                        { ifMatch: version },
                    ),
                );
            },
            photoRemove() {
                return photoChange((version) => client.deleteProfilePhoto({ ifMatch: version }));
            },
        },
        source: {
            subscribe(listener, onError) {
                subscribers.set(listener, onError);
                if (initialized && latest) {
                    listener(profileProject(latest));
                    photoFollow(latest);
                }
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
                    photoForget();
                };
            },
        },
    };
}
