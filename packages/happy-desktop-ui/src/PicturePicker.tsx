import { useRef, type ReactNode } from "react";
import { Button } from "./Button";
import type { ImageCropRegion } from "./imageCrop";
import { ProfilePhotoCropDialog, type ProfilePhotoCropSource } from "./ProfilePhotoCropDialog";
import { Spinner } from "./Spinner";
import { useImageDrop } from "./useImageDrop";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** The encodings a server accepts, offered as the file picker's filter. */
export const PICTURE_PICKER_ACCEPT = "image/png,image/jpeg,image/webp";

/** A picture being chosen, as its owner holds it, with what choosing it does. */
export interface PictureChoice {
    /** The chosen picture, cropped. */
    readonly url?: string;
    /** True while a picked picture is being opened for cropping. */
    readonly opening: boolean;
    /** A picked picture being cropped. */
    readonly crop?: ProfilePhotoCropSource;
    /** Why a picked picture could not be used. */
    readonly error?: string;
    onChoose(file: File): void;
    onCropCancel(): void;
    /** The square chosen, in the picked picture's own pixels. */
    onCropConfirm(region: ImageCropRegion): void;
}

export interface PicturePickerProps {
    /** The picture's side in CSS pixels. */
    readonly side: number;
    /** A person or bot is a circle; a server is a rounded square, as its tile is drawn. */
    readonly shape: "circle" | "rounded";
    /** What the picture is called on its controls: a person's "photo", anything else's "picture". */
    readonly noun: "photo" | "picture";
    /** The chosen picture; `placeholder` stands in until there is one. */
    readonly pictureUrl?: string;
    readonly placeholder: ReactNode;
    /**
     * `column` puts the Add button and the drop hint under the picture;
     * `compact` is the picture alone, for a row it shares with a field.
     */
    readonly layout: "column" | "compact";
    /** Nothing can be picked: the page is busy. */
    readonly disabled: boolean;
    /** True while a picked picture is being opened for cropping. */
    readonly opening?: boolean;
    /** A picked picture being cropped. */
    readonly crop?: ProfilePhotoCropSource;
    readonly "data-testid"?: string;
    /** The reader picked or dropped a file to crop. */
    onChoose(file: File): void;
    onCropCancel(): void;
    /** The square chosen, in the picked picture's own pixels. */
    onCropConfirm(region: ImageCropRegion): void;
}

/**
 * A picture the reader picks for something: pressing it opens a file, as
 * does the button under it, and a picture dragged onto either is taken the
 * same way; then the crop. While a picture is held over the zone it is ringed
 * in a dashed line of the page's own ink.
 */
export function PicturePicker(props: PicturePickerProps) {
    const input = useRef<HTMLInputElement>(null);
    const busy = props.disabled || props.opening === true;
    const pick = () => {
        if (!busy) input.current?.click();
    };
    const drop = useImageDrop<HTMLDivElement>({
        accept: PICTURE_PICKER_ACCEPT,
        disabled: busy,
        onFile: props.onChoose,
    });
    // A badge as large as a profile photo's would cover a small picture.
    const small = props.side < 96;
    const action = props.pictureUrl ? `Change ${props.noun}` : `Add ${props.noun}`;
    return (
        <>
            <div
                className="happy-picture-picker"
                data-dropping={drop.dropping || undefined}
                data-layout={props.layout}
                data-testid={props["data-testid"]}
                {...drop.zoneProps}
            >
                <button
                    aria-label={action}
                    className="happy-picture-picker__picture"
                    data-shape={props.shape}
                    disabled={busy}
                    onClick={(event) => {
                        // The crop dialog hands focus back to whatever had
                        // it, and not every engine focuses a clicked button.
                        event.currentTarget.focus();
                        pick();
                    }}
                    style={{ width: props.side, height: props.side }}
                    title={
                        props.layout === "compact"
                            ? `Click or drag a ${props.noun} here`
                            : undefined
                    }
                    type="button"
                >
                    {props.pictureUrl ? (
                        <img
                            alt=""
                            className="happy-picture-picker__image"
                            draggable={false}
                            src={props.pictureUrl}
                        />
                    ) : (
                        props.placeholder
                    )}
                    <span
                        className="happy-picture-picker__badge"
                        data-size={small ? "small" : undefined}
                        aria-hidden="true"
                    >
                        {props.opening ? (
                            <Spinner size={small ? 10 : 14} />
                        ) : (
                            <Ionicon name="camera" size={small ? 12 : 16} />
                        )}
                    </span>
                </button>
                {props.layout === "column" ? (
                    <>
                        <Button
                            className="happy-picture-picker__action"
                            disabled={busy}
                            onClick={(event) => {
                                event.currentTarget.focus();
                                pick();
                            }}
                            size="small"
                            variant="ghost"
                        >
                            {action}
                        </Button>
                        <p className="happy-picture-picker__hint" aria-hidden="true">
                            {drop.dropping
                                ? `Drop to use this ${props.noun}`
                                : `or drag a ${props.noun} here`}
                        </p>
                    </>
                ) : null}
                <input
                    accept={PICTURE_PICKER_ACCEPT}
                    data-testid={
                        props["data-testid"] === undefined
                            ? undefined
                            : `${props["data-testid"]}-input`
                    }
                    hidden
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        // Picking the same file again is a new choice.
                        event.currentTarget.value = "";
                        if (file) props.onChoose(file);
                    }}
                    ref={input}
                    type="file"
                />
            </div>
            {props.crop ? (
                <ProfilePhotoCropDialog
                    // A new picture is a new crop, centred afresh.
                    key={props.crop.imageUrl}
                    onCancel={props.onCropCancel}
                    onConfirm={props.onCropConfirm}
                    source={props.crop}
                />
            ) : null}
        </>
    );
}
