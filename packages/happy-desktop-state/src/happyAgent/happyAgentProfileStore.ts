import { createStore } from "zustand/vanilla";
import type { UserError } from "../types.js";
import {
    HAPPY_AGENT_PROFILE_PHOTO_SIZE,
    happyAgentProfilePhotoError,
    happyAgentProfilePhotoRead,
    happyAgentProfilePhotoSourceCheck,
    happyAgentProfilePhotoSourceError,
    type HappyAgentProfilePhotoCodec,
    type HappyAgentProfilePhotoCropRegion,
    type HappyAgentProfilePhotoCropSource,
} from "./happyAgentProfilePhoto.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import type { HappyAgentAvatarImage } from "./happyAgentTypes.js";

/** The one human identity this installation authors work as. */
export interface HappyAgentProfile {
    readonly email: string;
    readonly name: string;
    readonly updatedAt: number;
    readonly photo?: HappyAgentProfilePhoto;
}

/**
 * The stored photo. Its ThumbHash arrives with the profile; the bytes are read
 * separately, so `imageUrl` follows once they are in hand.
 */
export interface HappyAgentProfilePhoto {
    readonly thumbhash: string;
    /** A local address for the photo's bytes, absent while they are still being read. */
    readonly imageUrl?: string;
}

export interface HappyAgentProfileSource {
    /**
     * Reports the stored profile whenever it changes, or `undefined` while this
     * installation has never been given one.
     */
    subscribe(
        listener: (profile: HappyAgentProfile | undefined) => void,
        onError: (error: unknown) => void,
    ): () => void;
}

export interface HappyAgentProfileActions {
    profileSave(input: {
        readonly email: string;
        readonly name: string;
    }): Promise<HappyAgentProfile>;
    /** Replaces the stored photo; the source reports the profile that results. */
    photoUpload(image: HappyAgentAvatarImage): Promise<void>;
    /** Removes the stored photo; the source reports the profile that results. */
    photoRemove(): Promise<void>;
}

export interface HappyAgentProfileSnapshot {
    /** The values in the fields, which are the stored ones until they are edited. */
    readonly email: string;
    readonly name: string;
    /** True while the fields differ from what is stored. */
    readonly dirty: boolean;
    readonly loading: boolean;
    readonly saving: boolean;
    /** The stored profile could not be read. */
    readonly error?: UserError;
    /** The last save was refused or failed. */
    readonly saveError?: string;
    /**
     * Whether a named profile is stored. A photo belongs to one — a team
     * member's first save is what creates them — so a photo can be added only
     * once this is true.
     */
    readonly saved: boolean;
    readonly photo?: HappyAgentProfilePhoto;
    /**
     * The photo change in flight: a picked picture being opened for cropping,
     * a crop being encoded and sent, or the stored photo being removed.
     */
    readonly photoActivity?: "opening" | "uploading" | "removing";
    /** A picked picture being cropped; nothing is sent until the crop is confirmed. */
    readonly photoCrop?: HappyAgentProfilePhotoCropView;
    /** Why the last photo change was refused or failed. */
    readonly photoError?: string;
    /**
     * A cropped photo held on this device for a profile not yet created: a team
     * member exists only once their name is saved, so `profileCreate` sends it
     * after the name.
     */
    readonly photoStaged?: { readonly imageUrl: string };
}

/** The picture being cropped, as a surface draws it. */
export interface HappyAgentProfilePhotoCropView {
    readonly imageUrl: string;
    /** Its size the right way up, in its own pixels. */
    readonly width: number;
    readonly height: number;
}

export interface HappyAgentProfileStore {
    get(): HappyAgentProfileSnapshot;
    subscribe(listener: () => void): () => void;
    displayNameUpdate(value: string): void;
    emailUpdate(value: string): void;
    /** Puts the fields back to what is stored. */
    profileRevert(): void;
    profileSave(): Promise<void>;
    /** Opens a picked file for cropping, refusing first what cannot be opened. */
    photoChoose(file: Blob): Promise<void>;
    /** Draws the chosen square, sends it as the new photo, and closes the crop once it is stored. */
    photoCropConfirm(region: HappyAgentProfilePhotoCropRegion): Promise<void>;
    /** Closes the crop without sending anything. */
    photoCropCancel(): void;
    photoRemove(): Promise<void>;
    /**
     * Opens a picked file for cropping into the photo a profile being created
     * will wear; confirming the crop holds it in `photoStaged` instead of sending it.
     */
    photoStageChoose(file: Blob): Promise<void>;
    /**
     * A team member's first save: the name, with the email only if one is
     * known, then the staged photo. A photo that does not arrive never undoes
     * the name; it says so in `photoError`.
     */
    profileCreate(): Promise<void>;
    [Symbol.dispose](): void;
}

export interface HappyAgentProfileStoreDeps {
    readonly source: HappyAgentProfileSource;
    readonly actions: HappyAgentProfileActions;
    readonly photoCodec: HappyAgentProfilePhotoCodec;
}

const EMPTY: HappyAgentProfileSnapshot = {
    dirty: false,
    email: "",
    loading: true,
    name: "",
    saved: false,
    saving: false,
};

const NAME_SAVE_FAILED = "Couldn't save your name. Check your connection and try again.";
const PHOTO_UPLOAD_FAILED = "Your photo didn't upload. You can add it later in Settings.";

const photoEqual = (
    left: HappyAgentProfilePhoto | undefined,
    right: HappyAgentProfilePhoto | undefined,
): boolean =>
    left === undefined || right === undefined
        ? left === right
        : left.thumbhash === right.thumbhash && left.imageUrl === right.imageUrl;

/**
 * The installation profile, edited in place: the snapshot's `name` and `email`
 * are what the fields show, and they follow the stored profile until the reader
 * changes one. Live for exactly as long as a surface is observing it.
 */
export function happyAgentProfileStoreCreate(
    deps: HappyAgentProfileStoreDeps,
): HappyAgentProfileStore {
    const store = createStore<HappyAgentProfileSnapshot>()(() => EMPTY);
    const listeners = new Set<() => void>();
    let stored: HappyAgentProfile | undefined;
    let unsubscribeSource: (() => void) | undefined;
    let disposed = false;
    /** The decoded picture behind `photoCrop`, owned here until the crop closes. */
    let cropSource: HappyAgentProfilePhotoCropSource | undefined;
    /** What confirming the open crop does: send it now, or hold it for `profileCreate`. */
    let cropPurpose: "upload" | "stage" = "upload";
    /** The encoded crop behind `photoStaged`, and the local address it is shown from. */
    let staged: { readonly image: Blob; readonly imageUrl: string } | undefined;

    const cropClose = (): void => {
        cropSource?.close();
        cropSource = undefined;
    };

    const stagedClear = (): void => {
        if (staged) URL.revokeObjectURL(staged.imageUrl);
        staged = undefined;
    };

    const dirtyAgainst = (
        profile: HappyAgentProfile | undefined,
        fields: { readonly email: string; readonly name: string },
    ): boolean => fields.name !== (profile?.name ?? "") || fields.email !== (profile?.email ?? "");

    const profileInput = (profile: HappyAgentProfile | undefined): void => {
        if (disposed) return;
        stored = profile;
        const current = store.getState();
        // An edit in progress is the reader's, so an authoritative read replaces
        // the fields only while they still show what was stored.
        const adopt = !current.dirty && !current.saving;
        const fields = adopt
            ? { email: profile?.email ?? "", name: profile?.name ?? "" }
            : { email: current.email, name: current.name };
        const dirty = dirtyAgainst(profile, fields);
        const saved = profile !== undefined && profile.name !== "";
        const photo = photoEqual(current.photo, profile?.photo) ? current.photo : profile?.photo;
        if (
            fields.email === current.email &&
            fields.name === current.name &&
            dirty === current.dirty &&
            saved === current.saved &&
            current.loading === false &&
            current.error === undefined &&
            current.photo === photo
        )
            return;
        store.setState({
            ...current,
            ...fields,
            dirty,
            saved,
            loading: false,
            error: undefined,
            photo,
        });
    };

    /** Sends one photo change, reporting why it did not happen. */
    const photoSend = async (
        activity: "uploading" | "removing",
        send: () => Promise<void>,
        settled: Partial<HappyAgentProfileSnapshot> = {},
    ): Promise<void> => {
        store.setState({ ...store.getState(), photoActivity: activity, photoError: undefined });
        try {
            // The source reports the profile that results through the
            // subscription, so there is nothing to adopt from the answer here.
            await send();
            if (disposed) return;
            store.setState({ ...store.getState(), ...settled, photoActivity: undefined });
        } catch (error) {
            if (disposed) return;
            store.setState({
                ...store.getState(),
                photoActivity: undefined,
                photoError: happyAgentProfilePhotoError(
                    error,
                    activity === "uploading" ? "upload" : "removal",
                ).message,
            });
        }
    };

    const fieldUpdate = (fields: { readonly email?: string; readonly name?: string }): void => {
        const current = store.getState();
        if (current.saving) return;
        const next = {
            email: fields.email ?? current.email,
            name: fields.name ?? current.name,
        };
        if (
            next.email === current.email &&
            next.name === current.name &&
            current.saveError === undefined
        )
            return;
        store.setState({
            ...current,
            ...next,
            dirty: dirtyAgainst(stored, next),
            saveError: undefined,
        });
    };

    /** Opens a picked file for cropping, refusing first what cannot be opened. */
    const photoOpen = async (file: Blob, purpose: "upload" | "stage"): Promise<void> => {
        store.setState({ ...store.getState(), photoActivity: "opening", photoError: undefined });
        let opened: HappyAgentProfilePhotoCropSource;
        try {
            await happyAgentProfilePhotoSourceCheck(file);
            opened = await deps.photoCodec.open(file);
        } catch (error) {
            if (disposed) return;
            store.setState({
                ...store.getState(),
                photoActivity: undefined,
                photoError: happyAgentProfilePhotoSourceError(error).message,
            });
            return;
        }
        if (disposed) {
            opened.close();
            return;
        }
        cropSource = opened;
        cropPurpose = purpose;
        store.setState({
            ...store.getState(),
            photoActivity: undefined,
            photoCrop: {
                imageUrl: opened.imageUrl,
                width: opened.width,
                height: opened.height,
            },
        });
    };

    /** Draws the chosen square and holds it on this device, in place of any held before. */
    const photoStage = async (
        source: HappyAgentProfilePhotoCropSource,
        region: HappyAgentProfilePhotoCropRegion,
    ): Promise<void> => {
        let image: Blob;
        try {
            image = await source.crop(region, HAPPY_AGENT_PROFILE_PHOTO_SIZE);
        } catch (error) {
            if (disposed) return;
            store.setState({
                ...store.getState(),
                photoError: happyAgentProfilePhotoSourceError(error).message,
            });
            return;
        }
        if (disposed) return;
        stagedClear();
        staged = { image, imageUrl: URL.createObjectURL(image) };
        if (cropSource === source) cropClose();
        store.setState({
            ...store.getState(),
            photoCrop: undefined,
            photoError: undefined,
            photoStaged: { imageUrl: staged.imageUrl },
        });
    };

    const start = (): void => {
        if (disposed || unsubscribeSource) return;
        unsubscribeSource = deps.source.subscribe(profileInput, (error) => {
            if (disposed) return;
            store.setState({
                ...store.getState(),
                loading: false,
                error: happyAgentUserError(error),
            });
        });
    };

    const stop = (): void => {
        unsubscribeSource?.();
        unsubscribeSource = undefined;
    };

    return {
        get: () => store.getState(),
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            const unsubscribe = store.subscribe(listener);
            start();
            return () => {
                unsubscribe();
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
        displayNameUpdate(value) {
            fieldUpdate({ name: value });
        },
        emailUpdate(value) {
            fieldUpdate({ email: value });
        },
        profileRevert() {
            const current = store.getState();
            if (current.saving) return;
            store.setState({
                ...current,
                dirty: false,
                email: stored?.email ?? "",
                name: stored?.name ?? "",
                saveError: undefined,
            });
        },
        async profileSave() {
            const current = store.getState();
            if (current.saving) return;
            const email = current.email.trim();
            const name = current.name.trim();
            if (!name) {
                store.setState({ ...current, saveError: "Enter the name to author work as." });
                return;
            }
            if (!email || !email.includes("@")) {
                store.setState({
                    ...current,
                    saveError: "Enter the email used for Git commits.",
                });
                return;
            }
            store.setState({
                ...current,
                email,
                name,
                saving: true,
                saveError: undefined,
            });
            try {
                const profile = await deps.actions.profileSave({ email, name });
                if (disposed) return;
                store.setState({ ...store.getState(), saving: false });
                profileInput(profile);
            } catch (error) {
                if (disposed) return;
                store.setState({
                    ...store.getState(),
                    saving: false,
                    saveError: happyAgentUserError(error).message,
                });
            }
        },
        async photoChoose(file) {
            const current = store.getState();
            if (current.photoActivity !== undefined || current.photoCrop !== undefined) return;
            if (!current.saved) {
                store.setState({
                    ...current,
                    photoError: "Save your name first, then add a photo.",
                });
                return;
            }
            await photoOpen(file, "upload");
        },
        async photoStageChoose(file) {
            const current = store.getState();
            if (
                current.photoActivity !== undefined ||
                current.photoCrop !== undefined ||
                current.saving
            )
                return;
            await photoOpen(file, "stage");
        },
        photoCropConfirm(region) {
            const source = cropSource;
            if (source === undefined || store.getState().photoActivity !== undefined)
                return Promise.resolve();
            if (cropPurpose === "stage") return photoStage(source, region);
            return photoSend(
                "uploading",
                async () => {
                    const encoded = await source.crop(region, HAPPY_AGENT_PROFILE_PHOTO_SIZE);
                    await deps.actions.photoUpload(await happyAgentProfilePhotoRead(encoded));
                    // Stored: the crop has done its work, and its picture can go.
                    if (cropSource === source) cropClose();
                },
                { photoCrop: undefined },
            );
        },
        photoCropCancel() {
            const current = store.getState();
            if (current.photoCrop === undefined || current.photoActivity === "uploading") return;
            cropClose();
            store.setState({ ...current, photoCrop: undefined, photoError: undefined });
        },
        photoRemove() {
            const current = store.getState();
            if (current.photoActivity !== undefined || current.photoCrop !== undefined)
                return Promise.resolve();
            return photoSend("removing", () => deps.actions.photoRemove());
        },
        async profileCreate() {
            const current = store.getState();
            if (current.saving || current.photoCrop !== undefined) return;
            const name = current.name.trim();
            if (!name) {
                store.setState({ ...current, saveError: "Enter your name." });
                return;
            }
            const email = current.email.trim();
            store.setState({
                ...current,
                name,
                saving: true,
                saveError: undefined,
                photoError: undefined,
            });
            let profile: HappyAgentProfile;
            try {
                profile = await deps.actions.profileSave({
                    email: email.includes("@") ? email : "",
                    name,
                });
            } catch {
                if (disposed) return;
                // Whatever the server said, the reader can only check their
                // connection and try again, so that is all this says.
                store.setState({ ...store.getState(), saving: false, saveError: NAME_SAVE_FAILED });
                return;
            }
            if (disposed) return;
            profileInput(profile);
            const photo = staged;
            let photoError: string | undefined;
            if (photo) {
                try {
                    await deps.actions.photoUpload(await happyAgentProfilePhotoRead(photo.image));
                } catch {
                    photoError = PHOTO_UPLOAD_FAILED;
                }
                if (disposed) return;
                if (staged === photo) stagedClear();
            }
            store.setState({
                ...store.getState(),
                saving: false,
                photoStaged: undefined,
                ...(photoError ? { photoError } : {}),
            });
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            cropClose();
            stagedClear();
            stop();
            listeners.clear();
        },
    };
}

const NO_PROFILE: HappyAgentProfileSnapshot = { ...EMPTY, loading: false };

export const happyAgentProfileStoreNoop: HappyAgentProfileStore = {
    get: () => NO_PROFILE,
    subscribe: () => () => undefined,
    displayNameUpdate: () => undefined,
    emailUpdate: () => undefined,
    profileRevert: () => undefined,
    profileSave: () => Promise.resolve(),
    photoChoose: () => Promise.resolve(),
    photoCropConfirm: () => Promise.resolve(),
    photoCropCancel: () => undefined,
    photoRemove: () => Promise.resolve(),
    photoStageChoose: () => Promise.resolve(),
    profileCreate: () => Promise.resolve(),
    [Symbol.dispose]: () => undefined,
};
