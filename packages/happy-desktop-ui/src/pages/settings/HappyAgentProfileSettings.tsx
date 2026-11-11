import { useRef } from "react";
import { Avatar } from "../../Avatar";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import type { ImageCropRegion } from "../../imageCrop";
import { ProfilePhotoCropDialog, type ProfilePhotoCropSource } from "../../ProfilePhotoCropDialog";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import { thumbhashDataUrl } from "../../thumbhashDataUrl";
import { HappyAgentSettingsGroup, HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** The stored photo: its ThumbHash, and the address of its bytes once they are read. */
export interface HappyAgentProfileSettingsPhoto {
    readonly thumbhash: string;
    readonly imageUrl?: string;
}

export interface HappyAgentProfileSettingsProps {
    /** The name in the field, which is the stored one until it is edited. */
    readonly name: string;
    readonly email: string;
    readonly photo?: HappyAgentProfileSettingsPhoto;
    /** True while the fields differ from what this machine has stored. */
    readonly dirty?: boolean;
    readonly loading?: boolean;
    readonly saving?: boolean;
    /** Why the profile could not be read at all. */
    readonly error?: string;
    /** Why the last save was refused. */
    readonly saveError?: string;
    /** Why the profile cannot currently be saved. */
    readonly unavailable?: string;
    /** True while a chosen photo is being sent. */
    readonly photoUploading?: boolean;
    /** True while the stored photo is being removed. */
    readonly photoRemoving?: boolean;
    /** Why the last photo change was refused. */
    readonly photoError?: string;
    /** Why a photo cannot be added yet, such as a profile that was never saved. */
    readonly photoUnavailable?: string;
    /**
     * A picked picture being cropped. The crop dialog shows it, and holds while
     * a confirmed crop is `saving`, saying why it was not stored in `error`.
     */
    readonly photoCrop?: {
        readonly source: ProfilePhotoCropSource;
        readonly saving?: boolean;
        readonly error?: string;
    };
    onNameChange(value: string): void;
    onEmailChange(value: string): void;
    onRevert(): void;
    onSave(): void;
    /** The reader picked a file to crop into the photo. */
    onPhotoChoose(file: File): void;
    onPhotoCropCancel(): void;
    /** The square chosen, in the picked picture's own pixels. */
    onPhotoCropConfirm(region: ImageCropRegion): void;
    onPhotoRemove(): void;
}

/** The encodings the daemon accepts, offered as the file picker's filter. */
const PHOTO_ACCEPT = "image/png,image/jpeg,image/webp";

const initials = (name: string): string =>
    name
        .trim()
        .split(/\s+/u)
        .slice(0, 2)
        .map((part) => part[0] ?? "")
        .join("")
        .toLocaleUpperCase();

/**
 * The Profile category: the one identity this machine authors work as, edited
 * where it is shown. There is no list and no separate editor — the fields are
 * the profile, and a save is offered only once they differ from what is stored.
 *
 * The fields are ordinary settings rows rather than a bordered card. Every other
 * category in this window is a block of hairline-separated rows, and a card here
 * made the profile look like an object sitting inside settings instead of a part
 * of them. Nothing above the rows repeats them: the name and Git email are
 * their own rows, and the avatar sits in the Photo row it belongs to.
 *
 * The photo is a row like the fields: its picker and removal sit where every
 * other setting's control does, beside the avatar that shows the result. A
 * picked picture opens in a crop dialog first; nothing is sent until the
 * reader confirms the square. Until the photo's bytes arrive the avatar shows
 * its ThumbHash, so a replaced photo never shows the previous picture in the
 * meantime.
 *
 * The block carries no title of its own. The category header directly above it
 * already reads "Profile", and a second heading saying the same word was the
 * only thing between it and the first field.
 */
export function HappyAgentProfileSettings(props: HappyAgentProfileSettingsProps) {
    const blocked = props.unavailable !== undefined;
    const photoInput = useRef<HTMLInputElement>(null);
    // While the crop is open its own dialog shows the upload in flight, and
    // the picker stays enabled underneath so focus can come back to it.
    const photoBusy =
        props.photoCrop === undefined &&
        (props.photoUploading === true || props.photoRemoving === true);
    const photoBlocked = blocked || props.photoUnavailable !== undefined;
    const photoUrl =
        props.photo === undefined
            ? undefined
            : (props.photo.imageUrl ?? thumbhashDataUrl(props.photo.thumbhash));
    return (
        <HappyAgentSettingsSection rows="cards">
            {props.unavailable ? <Banner tone="warning">{props.unavailable}</Banner> : null}
            {props.error ? (
                <Banner tone="danger" title="Profile unavailable">
                    {props.error}
                </Banner>
            ) : null}
            {props.loading ? (
                <Box className="happy-agent-settings__pending">
                    <Spinner size={16} />
                    <span>Reading the profile…</span>
                </Box>
            ) : (
                <form
                    className="happy-agent-profile"
                    data-happy-desktop-ui="happy-agent-profile"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!blocked) props.onSave();
                    }}
                >
                    {props.photoError ? (
                        <Banner tone="danger" title="Photo not changed">
                            {props.photoError}
                        </Banner>
                    ) : null}
                    {props.saveError ? (
                        <Banner tone="danger" title="Not saved">
                            {props.saveError}
                        </Banner>
                    ) : null}
                    <HappyAgentSettingsGroup>
                        <FormRow
                            control={
                                <Box className="happy-agent-profile__photo-actions">
                                    <Avatar
                                        data-testid="happy-agent-profile-avatar"
                                        imageUrl={photoUrl}
                                        initials={initials(props.name) || "?"}
                                        size="lg"
                                    />
                                    {props.photo ? (
                                        <Button
                                            data-testid="happy-agent-profile-photo-remove"
                                            disabled={blocked || photoBusy}
                                            loading={props.photoRemoving}
                                            onClick={props.onPhotoRemove}
                                            size="small"
                                            variant="ghost"
                                        >
                                            Remove
                                        </Button>
                                    ) : null}
                                    <Button
                                        data-testid="happy-agent-profile-photo-choose"
                                        disabled={photoBlocked || photoBusy}
                                        loading={
                                            props.photoCrop === undefined && props.photoUploading
                                        }
                                        onClick={(event) => {
                                            // The crop dialog hands focus back to
                                            // whatever had it, and not every engine
                                            // focuses a clicked button itself.
                                            event.currentTarget.focus();
                                            photoInput.current?.click();
                                        }}
                                        size="small"
                                        variant="secondary"
                                    >
                                        {props.photo ? "Replace photo" : "Upload photo"}
                                    </Button>
                                    <input
                                        accept={PHOTO_ACCEPT}
                                        data-testid="happy-agent-profile-photo-input"
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
                                </Box>
                            }
                            description={
                                props.photoUnavailable ?? "PNG, JPEG, or WebP, up to 8 MiB"
                            }
                            label="Photo"
                        />
                        <FormRow
                            control={
                                <TextField
                                    className="happy-agent-profile__field"
                                    disabled={blocked}
                                    onValueChange={props.onNameChange}
                                    placeholder="Your name"
                                    size="medium"
                                    value={props.name}
                                />
                            }
                            description="Shown on work this machine authors"
                            label="Name"
                        />
                        <FormRow
                            control={
                                <TextField
                                    className="happy-agent-profile__field"
                                    disabled={blocked}
                                    onValueChange={props.onEmailChange}
                                    placeholder="you@example.com"
                                    size="medium"
                                    type="email"
                                    value={props.email}
                                />
                            }
                            description="The Git author address on every commit made here"
                            label="Git email"
                        />
                    </HappyAgentSettingsGroup>
                    {/* No saved-state line: both controls are disabled until
                        the fields differ from what is stored, so the pair
                        already says whether there is anything unsaved, and Save
                        carries its own spinner while the write is in flight. */}
                    <Box className="happy-agent-profile__actions">
                        <Button
                            disabled={!props.dirty || props.saving}
                            onClick={props.onRevert}
                            size="small"
                            variant="ghost"
                        >
                            Revert
                        </Button>
                        <Button
                            disabled={blocked || !props.dirty}
                            loading={props.saving}
                            size="small"
                            type="submit"
                            variant="primary"
                        >
                            Save
                        </Button>
                    </Box>
                </form>
            )}
            {props.photoCrop ? (
                <ProfilePhotoCropDialog
                    // A new picture is a new crop, centred afresh.
                    key={props.photoCrop.source.imageUrl}
                    onCancel={props.onPhotoCropCancel}
                    onConfirm={props.onPhotoCropConfirm}
                    source={props.photoCrop.source}
                    {...(props.photoCrop.saving ? { saving: true } : {})}
                    {...(props.photoCrop.error ? { error: props.photoCrop.error } : {})}
                />
            ) : null}
        </HappyAgentSettingsSection>
    );
}
