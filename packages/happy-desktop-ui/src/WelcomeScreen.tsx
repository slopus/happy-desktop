import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { NightSkyShader, type NightSkyShaderMotion } from "./NightSkyShader";
import { OnboardingSky } from "./OnboardingSky";
import { WelcomeDeck, type WelcomeSlide } from "./WelcomeDeck";
/*
 * The same triple the settings surface offers, deliberately reused rather than
 * respelled here: an appearance chosen on this screen and one chosen in Settings
 * are the same window setting, and two declarations of it would eventually
 * disagree about what the third option is called.
 */
import type { HappyAgentAppearanceChoice } from "./pages/settings/HappyAgentGeneralSettings";
import { ScrollArea } from "./Scrollbar";
import { WindowDragRegion } from "./TitleBar";
import { Ionicon } from "./vectorIcons/VectorIcon";

export type WelcomeScreenBackdrop =
    | {
          readonly kind: "night-sky";
          /** `still` is the deterministic Blueprint and reduced-motion presentation. */
          readonly motion?: NightSkyShaderMotion;
      }
    /** Native iOS/Android grain gradient, with the matching light/dark palette. */
    | { readonly kind: "sky" };

export interface WelcomeScreenProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    /** At least one. The first is shown first. */
    readonly slides: readonly WelcomeSlide[];
    /** Primary action label. Defaults to "Go Happy". */
    readonly actionLabel?: string;
    readonly actionDisabled?: boolean;
    /** The primary action takes focus with the screen, so Enter answers it. */
    readonly actionAutoFocus?: boolean;
    /** Optional decorative scenery behind the welcome deck. */
    readonly backdrop?: WelcomeScreenBackdrop;
    onAction(): void;
    /** A quieter second way in, under the primary action. */
    readonly secondaryAction?: {
        readonly label: string;
        readonly disabled?: boolean;
        onAction(): void;
    };
    /** Between the deck and the actions, for what a flow reveals there. */
    readonly children?: ReactNode;
    /** A hidden, pointer-only press on the deck's art. */
    readonly onArtPress?: () => void;
    /**
     * Quieter ways in, side by side under the primary action, such as
     * creating or joining a team.
     */
    readonly secondaryActions?: readonly { readonly label: string; onAction(): void }[];
    /** Which appearance this window is on. */
    readonly appearance: HappyAgentAppearanceChoice;
    /** Omit to leave out the corner switcher, on a screen inside the app. */
    onAppearanceChange?(appearance: HappyAgentAppearanceChoice): void;
}

/**
 * The appearance cycle, and what the one button that drives it is called.
 *
 * A single control has to say two things a segmented group says by showing
 * them: which appearance the window is on, and which one pressing it produces.
 * A reader who cannot see the glyph gets both from the name; a reader who can
 * still gets the promise of what happens next, which "Theme" never gave them.
 */
const APPEARANCE_CYCLE: Record<
    HappyAgentAppearanceChoice,
    { readonly next: HappyAgentAppearanceChoice; readonly label: string }
> = {
    system: { next: "light", label: "Appearance follows the system. Switch to light." },
    light: { next: "dark", label: "Appearance is light. Switch to dark." },
    dark: { next: "system", label: "Appearance is dark. Switch to following the system." },
    midnight: { next: "system", label: "Appearance is midnight. Switch to following the system." },
    custom: { next: "system", label: "Appearance is custom. Switch to following the system." },
};

/**
 * C-250 WelcomeScreen — the first thing a new reader sees: one centred column of
 * big art, a title, a slogan, a row of dots, and the single button that leaves.
 *
 * The deck itself is C-276 WelcomeDeck, which owns the slides, their timing, and
 * the promise that nothing under the reader's pointer moves while it advances.
 * This screen is what that deck is standing in: the window it fills, the scenery
 * behind it, and the one button that leaves.
 *
 * It fills the window of an Electron app that draws no native title bar, so it
 * owns the drag lane across its own top 56px the way every other full-window
 * state does. The lane is an absolutely positioned overlay outside the flex
 * flow: the centred column is laid out as if it were not there, and it stays
 * pinned to the window's top edge rather than scrolling away with the content
 * at the minimum window height.
 *
 * The optional backdrop is also outside that flow: either one full-window
 * decorative WebGL canvas or the appearance-matched grain gradient, below every
 * control. Both are quietest behind the central copy, so the chosen light or
 * dark appearance remains authoritative.
 *
 * The appearance switcher in the opposite corner is out of that flow for the
 * same reason and one more: it exists on a screen whose whole argument is that
 * nothing moves under the pointer, so it must not be able to take a pixel from
 * the column no matter which of the three glyphs it is showing. It is the
 * bottom-right corner precisely because the drag lane owns the top, and the two
 * can never contend for the same 56px.
 *
 * Props only: the words are the app's, the layout and the timing are ours.
 */
export function WelcomeScreen(props: WelcomeScreenProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "slides",
        "actionLabel",
        "actionDisabled",
        "actionAutoFocus",
        "backdrop",
        "onAction",
        "secondaryAction",
        "children",
        "onArtPress",
        "secondaryActions",
        "appearance",
        "onAppearanceChange",
    ]);
    return (
        <div
            className={["happy-welcome-screen", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="welcome-screen"
            data-appearance={local.appearance}
            data-backdrop={local.backdrop?.kind}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            {/* The window has no native title bar behind this screen, so the
                screen itself has to provide somewhere to pick the window up.
                It is rendered here rather than beside the screen because this
                root is what establishes its positioning context. */}
            <WindowDragRegion />
            {local.backdrop?.kind === "night-sky" ? (
                <NightSkyShader
                    className="happy-welcome-screen__backdrop"
                    motion={local.backdrop.motion}
                />
            ) : null}
            {/* Decorative native scenery stays beneath the unchanged deck. */}
            {local.backdrop?.kind === "sky" ? (
                <OnboardingSky
                    appearance={local.appearance}
                    className="happy-welcome-screen__backdrop"
                />
            ) : null}
            <ScrollArea
                className="happy-welcome-screen__view"
                data-happy-desktop-ui="welcome-view"
                viewportClassName="happy-welcome-screen__view-viewport"
            >
                <div className="happy-welcome-screen__body" data-happy-desktop-ui="welcome-body">
                    <WelcomeDeck
                        label="Welcome slides"
                        onArtPress={local.onArtPress}
                        slides={local.slides}
                        tint={local.backdrop?.kind === "sky" ? "sky" : "surface"}
                    />

                    {local.children}

                    <div className="happy-welcome-screen__actions">
                        <Button
                            // eslint-disable-next-line jsx-a11y/no-autofocus -- a screen that asks one thing starts the keyboard there
                            autoFocus={local.actionAutoFocus}
                            className="happy-welcome-screen__action"
                            disabled={local.actionDisabled}
                            onClick={local.onAction}
                            size="large"
                        >
                            {local.actionLabel ?? "Go Happy"}
                        </Button>
                        {local.secondaryAction ? (
                            <Button
                                className="happy-welcome-screen__secondary"
                                disabled={local.secondaryAction.disabled}
                                onClick={local.secondaryAction.onAction}
                                variant="ghost"
                            >
                                {local.secondaryAction.label}
                            </Button>
                        ) : null}
                        {local.secondaryActions && local.secondaryActions.length > 0 ? (
                            <div className="happy-welcome-screen__secondaries">
                                {local.secondaryActions.map((action) => (
                                    <Button
                                        className="happy-welcome-screen__secondary"
                                        key={action.label}
                                        onClick={action.onAction}
                                        variant="ghost"
                                    >
                                        {action.label}
                                    </Button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </ScrollArea>

            {/* Outside the scrollport as well as outside the flex flow: it is a
                corner of the window rather than the last item of a column, and
                it has to stay in that corner while a short window scrolls. */}
            {local.onAppearanceChange ? (
                <Button
                    aria-label={APPEARANCE_CYCLE[local.appearance].label}
                    className="happy-welcome-screen__appearance"
                    data-appearance={local.appearance}
                    iconOnly
                    onClick={() =>
                        local.onAppearanceChange?.(APPEARANCE_CYCLE[local.appearance].next)
                    }
                    size="small"
                    variant="ghost"
                >
                    {appearanceGlyph(local.appearance)}
                </Button>
            ) : null}
        </div>
    );
}

/**
 * The glyph for the appearance the window is on now — the state, not the
 * destination: the button's own name already says where pressing it goes, and a
 * glyph showing the next state would contradict the name beside it.
 *
 * `sun` and `moon` are the curated house names. Following the system has no
 * curated equivalent, so it addresses the upstream Ionicon directly, which is
 * what `Ionicon` is for: a half-filled disc is the conventional "whichever one
 * this machine is on" mark, and it cannot be mistaken for either of the two
 * states it sits between.
 */
function appearanceGlyph(appearance: HappyAgentAppearanceChoice) {
    if (appearance === "light") return <Icon name="sun" size={16} />;
    if (appearance === "dark") return <Icon name="moon" size={16} />;
    return <Ionicon name="contrast-outline" size={16} />;
}
