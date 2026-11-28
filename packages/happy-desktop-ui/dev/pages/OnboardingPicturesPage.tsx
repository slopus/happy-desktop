import type { CSSProperties, ReactNode } from "react";
import {
    CloudConnectScreen,
    type CloudConnectServer,
    type CloudConnectView,
} from "../../src/CloudConnectScreen";
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
import type { WelcomeSlide } from "../../src/WelcomeDeck";
import { WelcomeScreen } from "../../src/WelcomeScreen";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-050";

type WindowSize = { readonly width: number; readonly height: number };
const LARGE: WindowSize = { height: 760, width: 1100 };
const SMALL: WindowSize = { height: 640, width: 720 };
/** The window's minimum (`main.ts`). */
const MINIMUM: WindowSize = { height: 670, width: 760 };
const noop = () => undefined;

/* The start page's slide, word for word, as the onboarding flow page draws it. */
const pitch: readonly WelcomeSlide[] = [
    {
        art: { kind: "logo" },
        copy: "Happy is open source, so anyone can check what it does. Run it on hardware you trust, and reach it from your phone with end-to-end encryption.",
        id: "happy",
        title: "Work with AI as a team. Safely.",
    },
];

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
}) {
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
                        // An admin's bar always leads with the step that created the server.
                        steps={
                            props.flow === OWNER
                                ? [{ ...SERVER_STEP, done: true }, ...steps]
                                : steps
                        }
                        {...props.props}
                        // Every step has Back; the first one's goes to Your servers.
                        back={{ onSelect: noop }}
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
/** Six, more than the list shows at once: it scrolls, and nothing else moves. */
const SIX = [
    ACME,
    GUILD,
    LABS,
    { id: "north", displayName: "Northwind", name: "northwind" },
    { id: "studio", displayName: "Studio Nine", name: "studio-nine" },
    { id: "ops", displayName: "Acme Ops", name: "acme-ops" },
];
/** Who signed in, as email-code sign-in tells the window: the address alone. */
const ACCOUNT = { email: "steve@acme.dev" };
/** The same, had the shell read the account's name too (`GET /v1/me`). */
const ACCOUNT_NAMED = { email: "steve@acme.dev", name: "Steve Korshakov" };

function servers(
    list: readonly CloudConnectServer[],
    more: Partial<Extract<CloudConnectView, { kind: "servers" }>> = {},
): CloudConnectView {
    return {
        kind: "servers",
        servers: { status: "ready", servers: list },
        joins: new Map(),
        account: ACCOUNT,
        start: true,
        ...more,
    };
}

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
    seed = "acme",
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
            placeholderSeed: seed,
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
    /**
     * Kirill's second round (jobs A–D): drawn in light only, at 1100×760, and
     * also at 720×640 where `small` is set.
     */
    readonly round2?: boolean;
    readonly small?: boolean;
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
        id: "a00-first-window",
        label: "A · the first window: the start page, its way to Happy Cloud",
        round2: true,
        render: (mode) => (
            <WelcomeScreen
                appearance={mode}
                backdrop={{ kind: "sky" }}
                onAction={noop}
                onAppearanceChange={noop}
                secondaryAction={{ label: "Connect to Happy Cloud", tag: "Beta", onAction: noop }}
                slides={pitch}
            />
        ),
    },
    {
        id: "a01-start-welcome",
        label: "A · from the start page: Happy Cloud in its place, Back to it, no close button",
        round2: true,
        render: (mode) => (
            <Sheet mode={mode} view={{ kind: "welcome", emailSignIn: true, start: true }} />
        ),
    },
    {
        id: "a01a-signing-in",
        label: "A · signing in, in the browser: Cancel back to Happy Cloud",
        round2: true,
        render: (mode) => <Sheet mode={mode} view={{ kind: "signingIn", start: true }} />,
    },
    {
        id: "a02-plus-servers",
        label: "A · the sidebar's +: the sheet over the app, its close button, no Back",
        round2: true,
        render: (mode) => <Sheet mode={mode} view={servers([ACME, GUILD], { start: undefined })} />,
    },
    {
        id: "b01-servers-none",
        label: "B · Your servers, none yet: who is signed in, then Create your own",
        round2: true,
        small: true,
        render: (mode) => <Sheet mode={mode} view={servers([])} />,
    },
    {
        id: "b02-servers-one",
        label: "B · Your servers, one to join",
        round2: true,
        small: true,
        render: (mode) => <Sheet mode={mode} view={servers([GUILD])} />,
    },
    {
        id: "b03-servers-six",
        label: "B · Your servers, six: the list scrolls, the rest holds still",
        round2: true,
        small: true,
        render: (mode) => (
            <Sheet mode={mode} view={servers(SIX, { joins: new Map([[GUILD.id, "joined"]]) })} />
        ),
    },
    {
        id: "b04-servers-no-account",
        label: "B · signed in in the browser: the window is not told who, so no account row",
        round2: true,
        render: (mode) => (
            <Sheet mode={mode} view={servers([ACME, GUILD], { account: undefined })} />
        ),
    },
    {
        id: "b05-servers-named",
        label: "B · proposal: with the account's name too, had the shell read GET /v1/me",
        round2: true,
        render: (mode) => (
            <Sheet mode={mode} view={servers([ACME, GUILD], { account: ACCOUNT_NAMED })} />
        ),
    },
    {
        id: "g01-servers-none-no-account",
        label: "G · none, account unknown: Use another account closes the column",
        round2: true,
        small: true,
        render: (mode) => <Sheet mode={mode} view={servers([], { account: undefined })} />,
    },
    {
        id: "g02-servers-one-no-account",
        label: "G · one, account unknown",
        round2: true,
        small: true,
        render: (mode) => <Sheet mode={mode} view={servers([GUILD], { account: undefined })} />,
    },
    {
        id: "g03-servers-six-no-account",
        label: "G · six, account unknown: the list scrolls, the column stays centred",
        round2: true,
        small: true,
        render: (mode) => (
            <Sheet
                mode={mode}
                view={servers(SIX, {
                    account: undefined,
                    joins: new Map([[GUILD.id, "joined"]]),
                })}
            />
        ),
    },
    {
        id: "b06-create-first",
        label: "B · Bootstrap, the account's first server",
        round2: true,
        render: (mode) => <Create mode={mode} />,
    },
    {
        id: "c01-profile-no-name",
        label: "C · Profile, nothing typed: the person's placeholder picture alone",
        round2: true,
        render: (mode) => <Gate flow={OWNER} mode={mode} props={profile("")} />,
    },
    {
        id: "c02-profile-initials",
        label: "C · Profile, a name typed: its initials over the picture",
        round2: true,
        render: (mode) => <Gate flow={OWNER} mode={mode} props={profile("Steve Korshakov")} />,
    },
    {
        id: "d01-first-step-back",
        label: "D · the first step after Bootstrap: Back, to Your servers",
        round2: true,
        render: (mode) => (
            <Gate flow={OWNER} mode={mode} props={profile("Steve Korshakov", photoUrl)} />
        ),
    },
    {
        id: "d02-servers-from-setup",
        label: "D · Your servers in the step's place: Back returns to the step, Open resumes it",
        round2: true,
        render: (mode) => <Sheet mode={mode} view={servers([ACME, GUILD, LABS])} />,
    },
    {
        id: "d03-email-code",
        label: "D · the code: Back to the email, still typed",
        round2: true,
        render: (mode) => (
            <Sheet
                mode={mode}
                view={{
                    kind: "emailCode",
                    email: "steve@acme.dev",
                    code: "",
                    busy: false,
                    resendIn: 42,
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
        id: "o20-phone-after-bootstrap",
        label: "Phone · the owner's last step, seven segments with Server",
        light: true,
        render: (mode) => <Gate flow={OWNER} mode={mode} props={phone} />,
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
    const round1 = shots.filter((shot) => !shot.round2);
    const round2 = shots.filter((shot) => shot.round2);
    const captures = [
        ...round2.map((shot) => ({ shot, window: LARGE, mode: "light" as ThemeMode })),
        ...round2
            .filter((shot) => shot.small)
            .map((shot) => ({ shot, window: SMALL, mode: "light" as ThemeMode })),
        ...[LARGE, SMALL, MINIMUM].flatMap((window) =>
            round1.map((shot) => ({ shot, window, mode: "dark" as ThemeMode })),
        ),
        ...round1
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
