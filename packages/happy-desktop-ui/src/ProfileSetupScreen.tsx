import { Avatar } from "./Avatar";
import type { ImageCropRegion } from "./imageCrop";
import { OnboardingHelp } from "./OnboardingHelp";
import { initialsOf } from "./pages/surfaces/surfacePresentation";
import { PicturePicker } from "./PicturePicker";
import type { ProfilePhotoCropSource } from "./ProfilePhotoCropDialog";
import { SetupPage } from "./SetupPage";
import { TextField } from "./TextField";
import type { ThemeMode } from "./ThemeScope";

export interface ProfileSetupScreenProps {
    readonly appearance: ThemeMode;
    /** True while the name, and then any chosen photo, are being saved. */
    readonly busy: boolean;
    /** True while the server's profile, and so the prefilled name, is still being read. */
    readonly loading?: boolean;
    readonly name: string;
    /** The server this profile is for, as the reader knows it. */
    readonly serverLabel?: string;
    /** Not drawn here any more: until a photo is chosen the picture is the initials. */
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

/** The avatar's side in CSS pixels, as profile-setup.css draws it. */
const AVATAR_SIDE = 120;

/**
 * The profile a remote Happy Agent asks a new team
 * member for before it lets them in: how the team and its agents will see
 * them. Local setup never asks for one, so this page is not part of the
 * desktop's first-run sequence and draws no step bar.
 *
 * The avatar is the photo picker: pressing it, or the line under it, opens a
 * file, then the crop. A picture dropped on either is taken the same way.
 * Until a photo is chosen it wears the person's initials, as the app draws
 * anyone without a photo, following the name as it is typed; they are only
 * drawn, never uploaded. The photo is optional; Continue waits only on a name.
 * Under the field sits one line kept whether or not it says anything, so an
 * error never moves the page.
 */
export function ProfileSetupScreen(props: ProfileSetupScreenProps) {
    const blocked = props.busy || props.loading === true;
    const name = props.name.trim();
    const create = () => {
        if (!blocked && name) props.onCreate();
    };
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
            <ProfileSetupForm {...props} onSubmit={create} />
        </SetupPage>
    );
}

export interface ProfileSetupFormProps {
    readonly busy: boolean;
    readonly loading?: boolean;
    readonly name: string;
    readonly placeholderSeed: string;
    readonly photoUrl?: string;
    readonly photoOpening?: boolean;
    readonly message?: string;
    readonly photoError?: string;
    readonly photoCrop?: ProfilePhotoCropSource;
    /** Asks for the photo alone, from someone whose name is already saved. */
    readonly nameHidden?: boolean;
    onNameChange(value: string): void;
    /** Enter in the name field. */
    onSubmit(): void;
    onPhotoChoose(file: File): void;
    onPhotoCropCancel(): void;
    onPhotoCropConfirm(region: ImageCropRegion): void;
}

/**
 * The avatar that picks a photo, the name field, and the line under it, as
 * any setup page that asks for a profile draws them.
 */
export function ProfileSetupForm(props: ProfileSetupFormProps) {
    const blocked = props.busy || props.loading === true;
    const hint = props.message ?? props.photoError;
    return (
        <div className="happy-profile-setup__form" data-happy-desktop-ui="profile-setup">
            <PicturePicker
                {...(props.photoCrop ? { crop: props.photoCrop } : {})}
                data-testid="profile-setup-photo"
                disabled={blocked}
                layout="column"
                noun="photo"
                onChoose={props.onPhotoChoose}
                onCropCancel={props.onPhotoCropCancel}
                onCropConfirm={props.onPhotoCropConfirm}
                {...(props.photoOpening === undefined ? {} : { opening: props.photoOpening })}
                {...(props.photoUrl === undefined ? {} : { pictureUrl: props.photoUrl })}
                placeholder={
                    <Avatar
                        className="happy-picture-picker__image"
                        // With no name yet, the "?" Settings › Profile draws.
                        initials={initialsOf(props.name) || "?"}
                        size="lg"
                        // The lg avatar's 14px initials, scaled to the picture's side.
                        style={{
                            width: AVATAR_SIDE,
                            height: AVATAR_SIDE,
                            fontSize: Math.round((14 * AVATAR_SIDE) / 44),
                        }}
                    />
                }
                shape="circle"
                side={AVATAR_SIDE}
            />
            {props.nameHidden ? null : (
                <TextField
                    aria-label="Name"
                    autoFocus
                    className="happy-profile-setup__name"
                    disabled={props.busy}
                    fullWidth
                    onSubmit={props.onSubmit}
                    onValueChange={props.onNameChange}
                    placeholder="Your name"
                    size="large"
                    value={props.name}
                />
            )}
            <p
                className="happy-profile-setup__hint"
                data-tone={hint ? "attention" : undefined}
                role="status"
            >
                {hint}
            </p>
        </div>
    );
}
