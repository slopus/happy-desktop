import type { CSSProperties, ReactNode } from "react";
import { CloudConnectScreen, type CloudConnectView } from "../../src/CloudConnectScreen";
import {
    CloudOnboardingScreen,
    type CloudOnboardingScreenProps,
    type CloudOnboardingStep,
} from "../../src/CloudOnboardingScreen";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { SetupCover } from "../../src/SetupCover";
import { ThemeScope, type ThemeMode } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-050";

type WindowSize = { readonly width: number; readonly height: number };
const LARGE: WindowSize = { height: 760, width: 1100 };
const SMALL: WindowSize = { height: 640, width: 720 };
/** The window's minimum (`main.ts`). */
const MINIMUM: WindowSize = { height: 670, width: 760 };
const noop = () => undefined;

const photoUrl = new URL("../assets/profile-photo.webp", import.meta.url).href;
/** The admin bot's default picture, as happy-agent gives the Chief of Staff. */
const chiefOfStaffAvatarUrl = new URL("../assets/chief-of-staff-avatar.webp", import.meta.url).href;

const OWNER: readonly { readonly id: string; readonly label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "adminBot", label: "Admin bot" },
    { id: "inference", label: "AI" },
    { id: "plugins", label: "Tools" },
    { id: "compute", label: "Computer" },
    { id: "teammates", label: "Team" },
];
const MEMBER: typeof OWNER = [
    { id: "profile", label: "Profile" },
    { id: "compute", label: "Computer" },
];

/** The bar for someone walking forward: every step before `current` is finished. */
function bar(flow: typeof OWNER, current: string): readonly CloudOnboardingStep[] {
    const index = flow.findIndex((step) => step.id === current);
    return flow.map((step, position) => ({ ...step, done: position < index }));
}

const connections: readonly ConnectionShellItem[] = [
    { id: "local", label: "This Mac", local: true, status: "connected" },
    { id: "acme", label: "@acme", local: false, placeholderSeed: "acme", status: "connected" },
];

/** Fixture-only stand-in for the native macOS traffic lights: 14px at x 14…68, y 13. */
function TrafficLights() {
    const dot = (background: string): CSSProperties => ({
        background,
        borderRadius: "50%",
        height: "14px",
        width: "14px",
    });
    return (
        <span
            aria-hidden="true"
            style={{
                display: "flex",
                gap: "6px",
                left: "14px",
                pointerEvents: "none",
                position: "absolute",
                top: "13px",
                zIndex: 2000,
            }}
        >
            <i style={dot("#ff5f57")} />
            <i style={dot("#febc2e")} />
            <i style={dot("#28c840")} />
        </span>
    );
}

/** The window: what the page draws, clipped to it, under the traffic lights. */
function Window(props: { readonly children: ReactNode }) {
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
            {props.children}
            <TrafficLights />
        </div>
    );
}

/** A gate covering the window, the rail under it, as the app mounts onboarding. */
function Gate(props: {
    readonly mode: ThemeMode;
    readonly flow: typeof OWNER;
    readonly props: Omit<CloudOnboardingScreenProps, "appearance" | "steps">;
}) {
    const first = props.flow[0]?.id === props.props.currentStep;
    return (
        <ConnectionShell
            add={{ label: "Connect to Happy Cloud", onAdd: noop }}
            items={connections}
            onSelect={noop}
            selectedId="acme"
            windowControls
        >
            <ConnectionSurface active>
                <SetupCover>
                    <CloudOnboardingScreen
                        appearance={props.mode}
                        steps={bar(props.flow, props.props.currentStep)}
                        {...props.props}
                        {...(first ? {} : { back: { onSelect: noop } })}
                        exit={{ onSelect: noop }}
                    />
                </SetupCover>
            </ConnectionSurface>
        </ConnectionShell>
    );
}

function Create(props: { readonly mode: ThemeMode; readonly pictureUrl?: string }) {
    const view: CloudConnectView = {
        kind: "create",
        name: "acme",
        availability: "available",
        back: false,
    };
    return (
        <CloudConnectScreen
            appearance={props.mode}
            onAgentAdd={noop}
            onBack={noop}
            onCloudOpen={noop}
            onClose={noop}
            onContinue={noop}
            onCreate={noop}
            onCreateNameChange={noop}
            onCreateOpen={noop}
            onEmailChange={noop}
            onEmailChangeOpen={noop}
            onEmailCodeChange={noop}
            onEmailCodeResend={noop}
            onEmailCodeSend={noop}
            onEmailCodeVerify={noop}
            onEmailOpen={noop}
            onLogoPress={noop}
            onServerPick={noop}
            onServersContinue={noop}
            onTestLoginChange={noop}
            onTestPasswordChange={noop}
            onTestSignIn={noop}
            picture={{
                ...(props.pictureUrl ? { url: props.pictureUrl } : {}),
                opening: false,
                onChoose: noop,
                onCropCancel: noop,
                onCropConfirm: noop,
            }}
            view={view}
        />
    );
}

function profile(
    name: string,
    photo?: string,
): Omit<CloudOnboardingScreenProps, "appearance" | "steps"> {
    return {
        currentStep: "profile",
        serverLabel: "Acme",
        action: { label: "Continue", disabled: name.trim() === "", onSelect: noop },
        view: {
            kind: "profile",
            ask: "profile",
            busy: false,
            name,
            ...(photo ? { photoUrl: photo } : {}),
            placeholderSeed: "acme",
            onNameChange: noop,
            onSubmit: noop,
            onPhotoChoose: noop,
            onPhotoCropCancel: noop,
            onPhotoCropConfirm: noop,
        },
    };
}

const adminBot: Omit<CloudOnboardingScreenProps, "appearance" | "steps"> = {
    currentStep: "adminBot",
    serverLabel: "Acme",
    action: { label: "Continue", onSelect: noop },
    view: {
        kind: "adminBot",
        title: "Name your admin bot",
        description: "It has extra powers, so it can shape Happy around your team.",
        points: [
            "Changes this server's settings when you ask",
            "Connects your tools and creates the bots you need",
            "Builds a system around how your team works",
        ],
        note: "Only people who manage bots can talk to it.",
        name: "Chief of Staff",
        avatarUrl: chiefOfStaffAvatarUrl,
        placeholderSeed: "chief-of-staff",
        picture: { opening: false, onChoose: noop, onCropCancel: noop, onCropConfirm: noop },
        busy: false,
        onNameChange: noop,
        onSubmit: noop,
    },
};

interface Shot {
    /** The round 4 mockup's file name, without appearance and size. */
    readonly id: string;
    readonly label: string;
    /** Also drawn in light at 1100×760, where the mockups have it. */
    readonly light?: boolean;
    readonly render: (mode: ThemeMode) => ReactNode;
}

const shots: readonly Shot[] = [
    {
        id: "o02-create",
        label: "Create a server · nothing uploaded, the shader",
        light: true,
        render: (mode) => <Create mode={mode} />,
    },
    {
        id: "o02a-create-picture",
        label: "Create a server · picture uploaded",
        render: (mode) => <Create mode={mode} pictureUrl={photoUrl} />,
    },
    {
        id: "o03-profile",
        label: "Profile · nothing uploaded, the initials",
        light: true,
        render: (mode) => <Gate flow={OWNER} mode={mode} props={profile("Steve Korshakov")} />,
    },
    {
        id: "o03a-profile-photo",
        label: "Profile · photo uploaded",
        render: (mode) => (
            <Gate flow={OWNER} mode={mode} props={profile("Steve Korshakov", photoUrl)} />
        ),
    },
    {
        id: "o03b-profile-no-name",
        label: "Profile · no name typed yet",
        render: (mode) => <Gate flow={OWNER} mode={mode} props={profile("")} />,
    },
    {
        id: "o04-admin-bot",
        label: "Admin bot · the bot's picture with the picker",
        light: true,
        render: (mode) => <Gate flow={OWNER} mode={mode} props={adminBot} />,
    },
    {
        id: "m03-next-profile",
        label: "Member · profile, the initials",
        render: (mode) => <Gate flow={MEMBER} mode={mode} props={profile("Sam Lee")} />,
    },
];

const size = (window: WindowSize) => `${String(window.width)}x${String(window.height)}`;

/**
 * The name fields focus themselves as they mount; the last one mounted keeps
 * focus, ring and all, so one picture would show a ring the others do not.
 * None of these pictures has been pressed or typed in, so the page lets go of
 * any focus it was not given by a press or a key.
 */
function releaseUnaskedFocus(element: HTMLDivElement | null) {
    if (!element) return;
    let asked = false;
    const ask = () => {
        asked = true;
    };
    element.addEventListener("pointerdown", ask, true);
    element.addEventListener("keydown", ask, true);
    element.addEventListener("focusin", (event) => {
        if (!asked && event.target instanceof HTMLElement) event.target.blur();
    });
    // What took focus in the same commit, before this listener was there.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && element.contains(focused)) focused.blur();
}

/**
 * The pictures of Happy Cloud onboarding: the new server's, the person's and
 * the admin bot's, each with nothing uploaded and with an upload, named as
 * the round 4 mockups so the two can be laid side by side.
 */
export function OnboardingPicturesPage() {
    const captures = [
        ...[LARGE, SMALL, MINIMUM].flatMap((window) =>
            shots.map((shot) => ({ shot, window, mode: "dark" as ThemeMode })),
        ),
        ...shots
            .filter((shot) => shot.light)
            .map((shot) => ({ shot, window: LARGE, mode: "light" as ThemeMode })),
    ];
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The server's, the person's and the admin bot's pictures in Happy Cloud onboarding, in the real frame."
            title="Onboarding pictures"
        >
            <div ref={releaseUnaskedFocus} style={{ display: "contents" }}>
                {captures.map(({ shot, window, mode }, index) => (
                    <FullScreenSpecimen
                        detail={`${mode} · ${size(window)}`}
                        key={`${shot.id}-${mode}-${size(window)}`}
                        label={shot.label}
                        number={String(index + 1).padStart(2, "0")}
                        screen={`${shot.id}-${mode}-${size(window)}`}
                        window={window}
                    >
                        <Window>
                            <ThemeScope mode={mode}>{shot.render(mode)}</ThemeScope>
                        </Window>
                    </FullScreenSpecimen>
                ))}
            </div>
        </ComponentPage>
    );
}
