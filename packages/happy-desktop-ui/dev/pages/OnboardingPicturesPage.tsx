import type { CSSProperties, ReactNode } from "react";
import { CloudConnectScreen, type CloudConnectView } from "../../src/CloudConnectScreen";
import {
    CloudOnboardingScreen,
    type CloudOnboardingScreenProps,
    type CloudOnboardingStep,
} from "../../src/CloudOnboardingScreen";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import type { ProfilePhotoCropSource } from "../../src/ProfilePhotoCropDialog";
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

const OWNER: readonly { readonly id: string; readonly label: string }[] = [
    { id: "profile", label: "Profile" },
    { id: "inference", label: "AI" },
    { id: "plugins", label: "Tools" },
    { id: "compute", label: "Computer" },
    { id: "teammates", label: "Team" },
    { id: "mobileApp", label: "Phone" },
];
const MEMBER: typeof OWNER = [
    { id: "profile", label: "Profile" },
    { id: "compute", label: "Computer" },
    { id: "mobileApp", label: "Phone" },
];

/**
 * Step 0, creating the server, before the steps it is expected to ask; the app
 * lists the same ones (`appCloudServerCreateSteps`).
 */
const SERVER_STEP = { id: "server", label: "Server" };
const CREATE_STEPS: readonly CloudOnboardingStep[] = [SERVER_STEP, ...OWNER].map((step) => ({
    ...step,
    done: false,
}));

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
    /** Created in this window a moment ago: the bar leads with that step, done. */
    readonly created?: boolean;
}) {
    const first = props.flow[0]?.id === props.props.currentStep;
    const steps = bar(props.flow, props.props.currentStep);
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
                        steps={props.created ? [{ ...SERVER_STEP, done: true }, ...steps] : steps}
                        {...props.props}
                        {...(first ? {} : { back: { onSelect: noop } })}
                        exit={{ onSelect: noop }}
                    />
                </SetupCover>
            </ConnectionSurface>
        </ConnectionShell>
    );
}

/** A picture dropped on the create step, open in its crop. */
const cropSource: ProfilePhotoCropSource = {
    imageUrl: new URL("../assets/crop-landscape.webp", import.meta.url).href,
    width: 960,
    height: 540,
};

function Create(props: {
    readonly mode: ThemeMode;
    readonly pictureUrl?: string;
    readonly crop?: ProfilePhotoCropSource;
}) {
    return (
        <Sheet
            mode={props.mode}
            {...(props.pictureUrl ? { pictureUrl: props.pictureUrl } : {})}
            {...(props.crop ? { crop: props.crop } : {})}
            view={{ kind: "create", name: "acme", availability: "available", back: false }}
        />
    );
}

/** The account's servers: one already in this app, one joined just now, one to join. */
const ACME = { id: "acme", displayName: "Acme", name: "acme", inApp: true as const };
const GUILD = { id: "guild", displayName: "Design Guild", name: "design-guild" };
const LABS = { id: "labs", displayName: "Acme Labs", name: "acme-labs" };

/** The sidebar's "+" over the app: the sheet, as the window draws it. */
function Sheet(props: {
    readonly mode: ThemeMode;
    readonly view: CloudConnectView;
    readonly pictureUrl?: string;
    readonly crop?: ProfilePhotoCropSource;
}) {
    return (
        <CloudConnectScreen
            appearance={props.mode}
            createSteps={CREATE_STEPS}
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
            onServerOpen={noop}
            onServersContinue={noop}
            onTestLoginChange={noop}
            onTestPasswordChange={noop}
            onTestSignIn={noop}
            picture={{
                ...(props.pictureUrl ? { url: props.pictureUrl } : {}),
                ...(props.crop ? { crop: props.crop } : {}),
                opening: false,
                onChoose: noop,
                onCropCancel: noop,
                onCropConfirm: noop,
            }}
            view={props.view}
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

/** The phone step, as `AppCloudOnboarding` hands it over: optional, not done. */
const phone: Omit<CloudOnboardingScreenProps, "appearance" | "steps"> = {
    currentStep: "mobileApp",
    serverLabel: "Acme",
    action: { label: "Continue", disabled: true, onSelect: noop },
    skip: { onSelect: noop },
    view: {
        kind: "mobileApp",
        appStoreUrl: "https://apps.apple.com/us/app/happy-claude-code-client/id6748571505",
        playStoreUrl: "https://play.google.com/store/apps/details?id=com.ex3ndr.happy",
        registered: false,
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
        id: "e01-servers",
        label: "The sidebar's + · the account's servers: open, join, or create your own",
        light: true,
        render: (mode) => (
            <Sheet
                mode={mode}
                view={{
                    kind: "servers",
                    servers: { status: "ready", servers: [ACME, GUILD, LABS] },
                    joins: new Map(),
                }}
            />
        ),
    },
    {
        id: "e01a-servers-joined",
        label: "The sidebar's + · one joined, so Continue",
        render: (mode) => (
            <Sheet
                mode={mode}
                view={{
                    kind: "servers",
                    servers: { status: "ready", servers: [ACME, GUILD, LABS] },
                    joins: new Map([[GUILD.id, "joined"]]),
                }}
            />
        ),
    },
    {
        id: "e01b-servers-none",
        label: "The sidebar's + · an account on no server yet",
        light: true,
        render: (mode) => (
            <Sheet
                mode={mode}
                view={{
                    kind: "servers",
                    servers: { status: "ready", servers: [] },
                    joins: new Map(),
                }}
            />
        ),
    },
    {
        id: "e01c-servers-first-run",
        label: "First run · from the start page, nothing behind it, so no close button",
        render: (mode) => (
            <Sheet
                mode={mode}
                view={{
                    kind: "servers",
                    servers: { status: "ready", servers: [] },
                    joins: new Map(),
                    start: true,
                }}
            />
        ),
    },
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
        id: "o02b-create-crop",
        label: "Create a server · a dropped picture in its crop, over the whole window",
        render: (mode) => <Create crop={cropSource} mode={mode} />,
    },
    {
        id: "o03-profile",
        label: "Profile · nothing uploaded, the initials",
        light: true,
        render: (mode) => <Gate flow={OWNER} mode={mode} props={profile("Steve Korshakov")} />,
    },
    {
        id: "o03c-profile-after-bootstrap",
        label: "Profile · just after Bootstrap, the Server step done",
        light: true,
        render: (mode) => (
            <Gate created flow={OWNER} mode={mode} props={profile("Steve Korshakov")} />
        ),
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
        id: "o20-phone-after-bootstrap",
        label: "Phone · the owner's last step, seven segments with Server",
        light: true,
        render: (mode) => <Gate created flow={OWNER} mode={mode} props={phone} />,
    },
    {
        id: "m13-next-phone",
        label: "Member · phone, the last step",
        render: (mode) => <Gate flow={MEMBER} mode={mode} props={phone} />,
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
 * The pictures of Happy Cloud onboarding: the new server's and the person's,
 * each with nothing uploaded and with an upload, named as
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
            summary="How Happy Cloud onboarding starts, from the sidebar's + to the server's first steps, and the server's and the person's pictures, in the real frame."
            title="Onboarding entry and pictures"
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
