import { useRef } from "react";
import { AvatarPlaceholder } from "./AvatarPlaceholder";
import { Button } from "./Button";
import type { ImageCropRegion } from "./imageCrop";
import { OnboardingHelp } from "./OnboardingHelp";
import { ProfilePhotoCropDialog, type ProfilePhotoCropSource } from "./ProfilePhotoCropDialog";
import { SetupPage } from "./SetupPage";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import type { ThemeMode } from "./ThemeScope";
import { Ionicon } from "./vectorIcons/VectorIcon";

export interface ProfileSetupScreenProps {
    readonly appearance: ThemeMode;
    /** True while the name, and then any chosen photo, are being saved. */
    readonly busy: boolean;
    /** True while the server's profile, and so the prefilled name, is still being read. */
    readonly loading?: boolean;
    readonly name: string;
    /** The server this profile is for, as the reader knows it. */
    readonly serverLabel?: string;
    /** What the placeholder is picked by until a photo is chosen. */
    readonly placeholderSeed: string;
    /** The chosen photo, cropped and held on this device until the name is saved. */
    readonly photoUrl?: string;
    /** True while a picked picture is being opened for cropping. */
    readonly photoOpening?: boolean;
    /** Why the name was not saved, said under the field. */
    readonly message?: string;
    /** Why a picked picture could not be used, said under the field. */
    readonly photoError?: string;
    /** A picked picture being cropped. */
    readonly photoCrop?: ProfilePhotoCropSource;
    /** Opens an external page: the host owns how a link leaves the app. */
    onExternalOpen?(url: string): void;
    onNameChange(value: string): void;
    onCreate(): void;
    /** The reader picked a file to crop into their photo. */
    onPhotoChoose(file: File): void;
    onPhotoCropCancel(): void;
    /** The square chosen, in the picked picture's own pixels. */
    onPhotoCropConfirm(region: ImageCropRegion): void;
}

/** The encodings a server accepts, offered as the file picker's filter. */
const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp";
/** The avatar's side in CSS pixels, as profile-setup.css draws it. */
const AVATAR_SIDE = 120;

/**
 * The profile a remote Happy Agent asks a new team
 * member for before it lets them in: how the team and its agents will see
 * them. Local setup never asks for one, so this page is not part of the
 * desktop's first-run sequence and draws no step bar.
 *
 * The avatar is the photo picker: pressing it, or the line under it, opens a
 * file, then the crop. Until a photo is chosen it wears the placeholder this
 * person is given. The photo is optional; Continue waits only on a name.
 * Under the field sits one line kept whether or not it says anything, so an
 * error never moves the page.
 */
export function ProfileSetupScreen(props: ProfileSetupScreenProps) {
    const photoInput = useRef<HTMLInputElement>(null);
    const blocked = props.busy || props.loading === true;
    const photoBusy = blocked || props.photoOpening === true;
    const name = props.name.trim();
    const create = () => {
        if (!blocked && name) props.onCreate();
    };
    const photoPick = () => {
        if (!photoBusy) photoInput.current?.click();
    };
    const hint = props.message ?? props.photoError;
    return (
        <SetupPage
            action={{
                busy: props.busy,
                disabled: !name || props.loading === true,
                label: "Continue",
                onSelect: create,
            }}
            backdrop={{ appearance: props.appearance, kind: "sky" }}
            className="happy-profile-setup"
            copy={
                props.serverLabel
                    ? `This is how your team and agents see you on ${props.serverLabel}.`
                    : "This is how your team and agents see you."
            }
            data-testid="profile-setup-screen"
            help={<OnboardingHelp onExternalOpen={props.onExternalOpen} />}
            // Centred like the Happy Cloud pages that lead here, so the form
            // sits in the middle of the window rather than under its centre line.
            placement="centered"
            title="Create your profile"
            transitionKey="profile-setup"
        >
            <div className="happy-profile-setup__form" data-happy-desktop-ui="profile-setup">
                <button
                    aria-label={props.photoUrl ? "Change photo" : "Add photo"}
                    className="happy-profile-setup__avatar"
                    data-testid="profile-setup-avatar"
                    disabled={photoBusy}
                    onClick={(event) => {
                        // The crop dialog hands focus back to whatever had
                        // it, and not every engine focuses a clicked button.
                        event.currentTarget.focus();
                        photoPick();
                    }}
                    type="button"
                >
                    {props.photoUrl ? (
                        <img
                            alt=""
                            className="happy-profile-setup__photo"
                            draggable={false}
                            src={props.photoUrl}
                        />
                    ) : (
                        <AvatarPlaceholder
                            className="happy-profile-setup__photo"
                            seed={props.placeholderSeed}
                            side={AVATAR_SIDE}
                        />
                    )}
                    <span className="happy-profile-setup__badge" aria-hidden="true">
                        {props.photoOpening ? (
                            <Spinner size={14} />
                        ) : (
                            <Ionicon name="camera" size={16} />
                        )}
                    </span>
                </button>
                <Button
                    className="happy-profile-setup__photo-action"
                    disabled={photoBusy}
                    onClick={(event) => {
                        event.currentTarget.focus();
                        photoPick();
                    }}
                    size="small"
                    variant="ghost"
                >
                    {props.photoUrl ? "Change photo" : "Add photo"}
                </Button>
                <input
                    accept={PHOTO_ACCEPT}
                    data-testid="profile-setup-photo-input"
                    hidden
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        // Picking the same file again is a new choice.
                        event.currentTarget.value = "";
                        if (file) props.onPhotoChoose(file);
                    }}
                    ref={photoInput}
                    type="file"
                />
                <TextField
                    aria-label="Name"
                    autoFocus
                    className="happy-profile-setup__name"
                    disabled={props.busy}
                    fullWidth
                    onSubmit={create}
                    onValueChange={props.onNameChange}
                    placeholder="Your name"
                    size="large"
                    value={props.name}
                />
                <p
                    className="happy-profile-setup__hint"
                    data-tone={hint ? "attention" : undefined}
                    role="status"
                >
                    {hint}
                </p>
            </div>
            {props.photoCrop ? (
                <ProfilePhotoCropDialog
                    // A new picture is a new crop, centred afresh.
                    key={props.photoCrop.imageUrl}
                    onCancel={props.onPhotoCropCancel}
                    onConfirm={props.onPhotoCropConfirm}
                    source={props.photoCrop}
                />
            ) : null}
        </SetupPage>
    );
}
