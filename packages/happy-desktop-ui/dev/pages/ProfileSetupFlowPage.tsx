import type { ReactNode } from "react";
import { ProfileSetupScreen, type ProfileSetupScreenProps } from "../../src/ProfileSetupScreen";
import { ThemeScope, type ThemeMode } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-043";

const WINDOW = { height: 760, width: 1100 } as const;
const noop = () => undefined;

const photoUrl = new URL("../assets/profile-photo.webp", import.meta.url).href;

type Specimen = {
    readonly label: string;
    readonly detail: string;
    readonly props: Partial<ProfileSetupScreenProps>;
};

const specimens: readonly Specimen[] = [
    {
        label: "Empty",
        detail: "the token carried no name: Continue waits for one",
        props: { name: "" },
    },
    {
        label: "Prefilled",
        detail: "the name the Happy account sign-in suggested, ready to confirm",
        props: { name: "Steve Korshakov" },
    },
    {
        label: "Photo chosen",
        detail: "a cropped photo held on this device until the name is saved",
        props: { name: "Steve Korshakov", photoUrl },
    },
    {
        label: "Saving",
        detail: "the name, then the photo, being sent",
        props: { busy: true, name: "Steve Korshakov", photoUrl },
    },
    {
        label: "Error",
        detail: "the name was not saved; the reason stays under the field",
        props: {
            message: "Couldn't save your name. Check your connection and try again.",
            name: "Steve Korshakov",
            photoUrl,
        },
    },
];

/** Contains the fixed page and crop dialog inside the window-sized viewport. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                height: "100%",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}

export function ProfileSetupFlowPage() {
    const modes: readonly ThemeMode[] = ["light", "dark"];
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A new team member's first step on a Happy Cloud server: their photo and the name the team and agents will see, before they land in the server."
            title="Create your profile"
        >
            {modes.flatMap((mode) =>
                specimens.map((specimen, index) => {
                    const number = String(index + 1).padStart(2, "0");
                    const slug = specimen.label.toLowerCase().replace(/ /gu, "-");
                    return (
                        <FullScreenSpecimen
                            detail={`${mode} · ${specimen.detail}`}
                            key={`${mode}-${specimen.label}`}
                            label={`${specimen.label} · ${mode}`}
                            number={number}
                            screen={`${number}-${slug}-${mode}`}
                            window={WINDOW}
                        >
                            {frame(
                                <ThemeScope mode={mode}>
                                    <ProfileSetupScreen
                                        appearance={mode}
                                        busy={false}
                                        name=""
                                        onCreate={noop}
                                        onNameChange={noop}
                                        onPhotoChoose={noop}
                                        onPhotoCropCancel={noop}
                                        onPhotoCropConfirm={noop}
                                        placeholderSeed="acme"
                                        serverLabel="Acme"
                                        {...specimen.props}
                                    />
                                </ThemeScope>,
                            )}
                        </FullScreenSpecimen>
                    );
                }),
            )}
        </ComponentPage>
    );
}
