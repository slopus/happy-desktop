import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";
import { Button } from "./Button";
import { Banner } from "./Banner";
import type { Dimension } from "./dimensions";
import { LottieScene, type LottieSceneName } from "./LottieScene";
import { OnboardingSky } from "./OnboardingSky";
import { ScrollArea } from "./Scrollbar";
import { SetupCommand } from "./SetupCommand";
import { Spinner } from "./Spinner";
import type { ThemeMode } from "./ThemeScope";
import { WindowDragRegion } from "./TitleBar";

/** Keep the workspace mounted while first-run draft preparation finishes. */
export function SetupHandoff(props: {
    readonly children: ReactNode;
    readonly error?: string;
    readonly busy?: boolean;
    readonly onRetry: () => void;
}) {
    return (
        <div className="happy-setup-handoff" data-happy-desktop-ui="setup-handoff">
            {props.error ? (
                <Banner
                    tone="neutral"
                    action={props.busy ? undefined : { label: "Try again", onClick: props.onRetry }}
                >
                    {props.error}
                </Banner>
            ) : null}
            <div className="happy-setup-handoff__content">{props.children}</div>
        </div>
    );
}

/**
 * How far a running action has got, for the few that can say.
 *
 * Most of setup's actions are a request and an answer with nothing in between,
 * and those keep the spinner. This is for the one kind that takes long enough to
 * be watched — bytes arriving — and it is deliberately not a general "percent
 * complete": `waiting` is the honest state for work that is running but has
 * nothing measured yet, and it is a state every such action passes through both
 * before and after the part that counts.
 */
export type SetupPageProgress =
    | { readonly kind: "waiting" }
    | {
          readonly kind: "measured";
          /** What has arrived, in the flow's own words, beside the label. */
          readonly detail?: string;
          /** The share provably done, 0 to 1. */
          readonly fraction: number;
      };

/**
 * The live line just under the page's words: what is happening right now, and
 * how far it has got. Every page that is waiting on something says so in this
 * one place instead of wherever its body has room.
 */
export interface SetupPageStatus {
    readonly label: string;
    /** A bar, for work that has a length. Omitted for a plain line. */
    readonly progress?: SetupPageProgress;
    /** A spinner beside a plain line, while the page waits on something outside it. */
    readonly busy?: boolean;
}

/** The one thing this page is asking for, if it is asking for anything. */
export interface SetupPageAction {
    readonly label: string;
    readonly disabled?: boolean;
    /** Omit for the standard 240px action. */
    readonly width?: Dimension;
    /**
     * This action is running. The spinner goes on the button and the page keeps
     * everything else exactly where it was: an attempt started from here is not
     * a new step, and swapping the page for a waiting screen would take away the
     * error the person is still reading.
     */
    readonly busy?: boolean;
    /**
     * Reported instead of the spinner while this action is busy, when the flow
     * has something measurable to report. The button gives way to the bar in
     * place, at the same height, so pressing it changes what the page says
     * rather than where anything sits.
     */
    readonly progress?: SetupPageProgress;
    onSelect(): void;
}

/** The quiet way out under the primary action, such as skipping an optional step. */
export interface SetupPageSecondaryAction {
    readonly label: string;
    readonly disabled?: boolean;
    onSelect(): void;
}

export interface SetupPageProps {
    /** A retained, compact stage indicator above the scrolling page content. */
    readonly steps?: ReactNode;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    /** Optional first-run scenery. Other setup-shaped system screens stay plain. */
    readonly backdrop?: { readonly appearance: ThemeMode; readonly kind: "sky" };
    /**
     * Stable identity of the setup stage. Changing it dissolves the new page
     * content into the retained frame; updates within one stage stay still.
     */
    readonly transitionKey?: string;
    /**
     * The animation that says what is happening. Omitted by a page whose body is
     * already its own picture — the install terminal, or the two-panel fork.
     */
    readonly scene?: LottieSceneName;
    readonly title: string;
    /** One short line under the title; may carry an inline link. Reserved when absent. */
    readonly copy?: ReactNode;
    readonly status?: SetupPageStatus;
    /**
     * A command the reader is meant to run themselves, shown selectable in the
     * monospace face. Present only when there is genuinely something to type: a
     * page that offers a command it does not need is a page that looks broken.
     */
    readonly command?: string;
    /** What the page is for, under its words: columns, a QR code, a form. */
    readonly children?: ReactNode;
    /** Pinned to the foot of the page, at the same place on every page. */
    readonly action?: SetupPageAction;
    /** Under the primary action, in a slot every page reserves whether or not it is used. */
    readonly secondary?: SetupPageSecondaryAction;
    /** Pinned to the bottom-right corner, outside the page's own bands. */
    readonly help?: ReactNode;
}

/**
 * C-252 SetupPage — one step of setup, as one centred page.
 *
 * Every state of first-run setup is the same three places:
 *
 *   header   scene and title; the title sits on the window's centre line
 *   core     subtitle and status line right under it, then what the page is
 *            for, hanging from that line
 *   footer   the primary action and a reserved slot under it for a way out,
 *            pinned to the bottom
 *
 * So the words, the content, and the button stay where they are as the
 * sequence moves; only what is written in them changes.
 *
 * Onboarding may supply a compact stage indicator. It stays outside the
 * transitioning content and reports actual stages, not individual loading states.
 *
 * The scene is illustration and never information. `LottieScene` renders
 * nothing until its worker runtime arrives, and nothing at all in an engine that
 * cannot have one, so the title and copy carry the whole meaning of every page
 * and its stage keeps a fixed square whether the art comes or not.
 *
 * It fills the window of an Electron app that draws no native title bar, so it
 * owns the drag lane across its own top edge, out of the flow, the way every
 * other full-window state does.
 *
 * Props only: what a step means and what its action does belong to the flow.
 */
export function SetupPage(props: SetupPageProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "backdrop",
        "transitionKey",
        "scene",
        "title",
        "copy",
        "status",
        "command",
        "children",
        "action",
        "secondary",
        "help",
        "steps",
    ]);
    return (
        <div
            className={["happy-setup-page", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="setup-page"
            data-appearance={local.backdrop?.appearance}
            data-backdrop={local.backdrop?.kind}
            data-transition={local.transitionKey === undefined ? undefined : ""}
            data-testid={local["data-testid"]}
            data-steps={local.steps ? "true" : undefined}
            style={local.style}
        >
            {local.backdrop ? <OnboardingSky appearance={local.backdrop.appearance} /> : null}
            <WindowDragRegion />
            {local.steps ? <div className="happy-setup-page__steps">{local.steps}</div> : null}
            <ScrollArea
                axes="both"
                className="happy-setup-page__scroll"
                viewportClassName="happy-setup-page__scroll-viewport"
            >
                <div
                    className="happy-setup-page__body"
                    data-happy-desktop-ui="setup-page-body"
                    key={local.transitionKey}
                >
                    {/* Scene and title, packed to the bottom of a band that ends
                        on the centre line, so the title sits at the same height on
                        every page. */}
                    <div
                        className="happy-setup-page__header"
                        data-happy-desktop-ui="setup-page-header"
                    >
                        <span
                            className="happy-setup-page__stage"
                            data-happy-desktop-ui="setup-page-stage"
                        >
                            {local.scene ? (
                                <LottieScene
                                    name={local.scene}
                                    // The picture repeats what the title already says, so
                                    // the only thing worth offering is one more play.
                                    replayLabel={local.title}
                                    size={80}
                                />
                            ) : null}
                        </span>
                        <h1
                            className="happy-setup-page__title"
                            data-happy-desktop-ui="setup-page-title"
                        >
                            {local.title}
                        </h1>
                    </div>
                    <div className="happy-setup-page__core" data-happy-desktop-ui="setup-page-core">
                        {/* The subtitle keeps its line when a page has none, so the
                            status and content below start at one height. */}
                        <div className="happy-setup-page__lead">
                            <p
                                className="happy-setup-page__copy"
                                data-happy-desktop-ui="setup-page-copy"
                            >
                                {local.copy}
                            </p>
                            {local.status ? (
                                <SetupStatus
                                    status={local.status}
                                    tone={local.backdrop ? "inverse" : "default"}
                                />
                            ) : null}
                        </div>
                        {local.command === undefined ? null : (
                            <SetupCommand command={local.command} label="command" />
                        )}
                        {local.children === undefined ? null : (
                            <div
                                className="happy-setup-page__slot"
                                data-happy-desktop-ui="setup-page-slot"
                            >
                                {local.children}
                            </div>
                        )}
                    </div>
                    {/* Both slots are always reserved, so the primary action sits
                        at one height on every page whether or not a page offers a
                        way out under it. */}
                    <div
                        className="happy-setup-page__footer"
                        data-happy-desktop-ui="setup-page-footer"
                    >
                        <div className="happy-setup-page__footer-primary">
                            {local.action
                                ? ((action) =>
                                      action.busy && action.progress ? (
                                          <SetupProgress
                                              label={action.label}
                                              progress={action.progress}
                                          />
                                      ) : (
                                          <Button
                                              disabled={action.disabled}
                                              loading={action.busy}
                                              onClick={action.onSelect}
                                              size="large"
                                              width={action.width ?? 240}
                                          >
                                              {action.label}
                                          </Button>
                                      ))(local.action)
                                : null}
                        </div>
                        <div className="happy-setup-page__footer-secondary">
                            {local.secondary ? (
                                <Button
                                    disabled={local.secondary.disabled}
                                    onClick={local.secondary.onSelect}
                                    size="large"
                                    variant="ghost"
                                    width={240}
                                >
                                    {local.secondary.label}
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </div>
            </ScrollArea>
            {local.help ? (
                <div className="happy-setup-page__help" data-happy-desktop-ui="setup-page-help">
                    {local.help}
                </div>
            ) : null}
        </div>
    );
}

/** The header's live line: a bar when the work has a length, a quiet line otherwise. */
function SetupStatus(props: {
    readonly status: SetupPageStatus;
    readonly tone: "default" | "inverse";
}) {
    const { status } = props;
    if (status.progress)
        return <SetupProgress label={status.label} progress={status.progress} tone={props.tone} />;
    return (
        <p
            className="happy-setup-page__status"
            data-happy-desktop-ui="setup-page-status"
            data-tone={props.tone}
            role="status"
        >
            {status.busy ? <Spinner size={14} tone={props.tone} /> : null}
            <span>{status.label}</span>
        </p>
    );
}

/**
 * The action's own progress, in the place the action was.
 *
 * A bar rather than a spinner because a download has a length: a spinner says
 * only that something is happening, which someone watching a first install
 * already knows and is not what they are waiting to learn. It occupies the same
 * height as the button it replaces, so the page does not move when it appears.
 *
 * `waiting` is drawn as a sweep across the empty track instead of an empty bar.
 * A bar sitting at zero looks stuck, and the two moments this state covers —
 * before the first byte, and while what arrived is being checked and unpacked —
 * are exactly when someone is most likely to think it has died.
 */
export interface SetupProgressProps {
    readonly label: string;
    readonly progress: SetupPageProgress;
    /** Uses the light ink intended for a photographic or dark backdrop. */
    readonly tone?: "default" | "inverse";
}

export function SetupProgress(props: SetupProgressProps) {
    const measured = props.progress.kind === "measured" ? props.progress : undefined;
    const fraction = measured ? Math.min(1, Math.max(0, measured.fraction)) : 0;
    return (
        <div
            className="happy-setup-page__progress"
            data-happy-desktop-ui="setup-page-progress"
            data-state={props.progress.kind}
            data-tone={props.tone ?? "default"}
        >
            <span
                aria-label={props.label}
                aria-valuemax={100}
                aria-valuemin={0}
                // Absent while nothing is measured, which is what tells a screen
                // reader this is indeterminate rather than stalled at zero.
                aria-valuenow={measured ? Math.round(fraction * 100) : undefined}
                className="happy-setup-page__progress-track"
                data-happy-desktop-ui="setup-page-progress-track"
                role="progressbar"
            >
                <span
                    className="happy-setup-page__progress-fill"
                    data-happy-desktop-ui="setup-page-progress-fill"
                    style={measured ? { width: `${String(fraction * 100)}%` } : undefined}
                />
            </span>
            <span
                className="happy-setup-page__progress-line"
                data-happy-desktop-ui="setup-page-progress-line"
            >
                <span className="happy-setup-page__progress-label">{props.label}</span>
                {measured?.detail === undefined ? null : (
                    <span className="happy-setup-page__progress-detail">{measured.detail}</span>
                )}
            </span>
        </div>
    );
}
