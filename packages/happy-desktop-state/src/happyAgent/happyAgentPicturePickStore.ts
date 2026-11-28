import { createStore } from "zustand/vanilla";
import {
    HAPPY_AGENT_PROFILE_PHOTO_SIZE,
    happyAgentProfilePhotoRead,
    happyAgentProfilePhotoSourceCheck,
    happyAgentProfilePhotoSourceError,
    type HappyAgentProfilePhotoCodec,
    type HappyAgentProfilePhotoCropRegion,
    type HappyAgentProfilePhotoCropSource,
} from "./happyAgentProfilePhoto.js";
import type { HappyAgentProfilePhotoCropView } from "./happyAgentProfileStore.js";
import type { HappyAgentAvatarImage } from "./happyAgentTypes.js";

export interface HappyAgentPicturePickSnapshot {
    /** True while a picked file is being opened for cropping. */
    readonly opening: boolean;
    /** A picked picture being cropped. */
    readonly crop?: HappyAgentProfilePhotoCropView;
    /** The cropped picture, held on this device and shown from this address. */
    readonly picked?: { readonly imageUrl: string };
    /** Why the last picture could not be used. */
    readonly error?: string;
}

export interface HappyAgentPicturePickStore {
    get(): HappyAgentPicturePickSnapshot;
    subscribe(listener: () => void): () => void;
    /** Opens a picked file for cropping, refusing first what cannot be opened. */
    pictureChoose(file: Blob): Promise<void>;
    /** Draws the chosen square and holds it in `picked`. */
    pictureCropConfirm(region: HappyAgentProfilePhotoCropRegion): Promise<void>;
    pictureCropCancel(): void;
    /** Lets go of the held picture, and any crop, for a fresh start. */
    pictureClear(): void;
    /** The held picture, as a server takes it; `undefined` with none. */
    pictureTake(): Promise<HappyAgentAvatarImage | undefined>;
    [Symbol.dispose](): void;
}

const IDLE: HappyAgentPicturePickSnapshot = { opening: false };

/**
 * A picture chosen for something other than the reader's own profile, such as
 * a new server: picked, cropped to a square like a profile photo, and held on
 * this device until its owner takes it with `pictureTake`, once the target
 * exists.
 */
export function happyAgentPicturePickStoreCreate(deps: {
    readonly codec: HappyAgentProfilePhotoCodec;
}): HappyAgentPicturePickStore {
    const store = createStore<HappyAgentPicturePickSnapshot>()(() => IDLE);
    let disposed = false;
    let cropSource: HappyAgentProfilePhotoCropSource | undefined;
    let picked: { readonly image: Blob; readonly imageUrl: string } | undefined;
    const cropClose = (): void => {
        cropSource?.close();
        cropSource = undefined;
    };
    const pickedClear = (): void => {
        if (picked) URL.revokeObjectURL(picked.imageUrl);
        picked = undefined;
    };
    return {
        get: () => store.getState(),
        subscribe: (listener) => (disposed ? () => undefined : store.subscribe(listener)),
        async pictureChoose(file) {
            const current = store.getState();
            if (current.opening || current.crop !== undefined) return;
            store.setState({ ...current, opening: true, error: undefined });
            let opened: HappyAgentProfilePhotoCropSource;
            try {
                await happyAgentProfilePhotoSourceCheck(file);
                opened = await deps.codec.open(file);
            } catch (error) {
                if (disposed) return;
                store.setState({
                    ...store.getState(),
                    opening: false,
                    error: happyAgentProfilePhotoSourceError(error).message,
                });
                return;
            }
            if (disposed) {
                opened.close();
                return;
            }
            cropSource = opened;
            store.setState({
                ...store.getState(),
                opening: false,
                crop: { imageUrl: opened.imageUrl, width: opened.width, height: opened.height },
            });
        },
        async pictureCropConfirm(region) {
            const source = cropSource;
            if (source === undefined) return;
            let image: Blob;
            try {
                image = await source.crop(region, HAPPY_AGENT_PROFILE_PHOTO_SIZE);
                // Refused here, not later when the server would take it.
                await happyAgentProfilePhotoRead(image);
            } catch (error) {
                if (disposed) return;
                store.setState({
                    ...store.getState(),
                    error: happyAgentProfilePhotoSourceError(error).message,
                });
                return;
            }
            if (disposed) return;
            pickedClear();
            picked = { image, imageUrl: URL.createObjectURL(image) };
            if (cropSource === source) cropClose();
            store.setState({
                ...store.getState(),
                crop: undefined,
                error: undefined,
                picked: { imageUrl: picked.imageUrl },
            });
        },
        pictureCropCancel() {
            const current = store.getState();
            if (current.crop === undefined) return;
            cropClose();
            store.setState({ ...current, crop: undefined, error: undefined });
        },
        pictureClear() {
            cropClose();
            pickedClear();
            store.setState(IDLE);
        },
        async pictureTake() {
            return picked ? await happyAgentProfilePhotoRead(picked.image) : undefined;
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            cropClose();
            pickedClear();
        },
    };
}
