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
import { useWindowCaptionTrailing } from "./windowCaption";

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
    /** Takes focus with the page, so Enter answers it. */
    readonly autoFocus?: boolean;
    onSelect(): void;
}

/** The quiet way out under the primary action, such as skipping an optional step. */
export interface SetupPageSecondaryAction {
    readonly label: string;
    readonly disabled?: boolean;
    onSelect(): void;
}

/** A way around the sequence, pinned to a corner of the window. */
export interface SetupPageCornerAction {
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
    /** Ambient pictures between the backdrop and the page, never information. */
    readonly decoration?: ReactNode;
    /**
     * Stable identity of the setup stage. Changing it dissolves the new page
     * content into the retained frame; updates within one stage stay still.
     * A `top` page keeps its title, subtitle, body area and footer mounted
     * and crossfades only what is written in them.
     */
    readonly transitionKey?: string;
    /**
     * The animation that says what is happening. Omitted by a page whose body is
     * already its own picture — the install terminal, or the two-panel fork.
     */
    readonly scene?: LottieSceneName;
    /**
     * A picture of the page's own in the scene's square, in place of an
     * animation: whose page this is, such as the server an invitation is to.
     * It takes the same reserved square, so the title does not move for it.
     */
    readonly art?: ReactNode;
    /**
     * A press anywhere on the scene's square. It is not announced: it is for
     * flows that hide something behind the picture.
     */
    readonly onScenePress?: () => void;
    /**
     * Where the words sit. `line` (the default) hangs them from the window's
     * centre line under a fixed scene square, so they hold one height across
     * the sequence. `centered` drops the scene square and centres title and
     * content together above the footer, for a page that is a choice rather
     * than a report. `top` is for a sequence whose bodies differ in height: no
     * scene square, the title on one line near the top of the window, the
     * subtitle's one line reserved under it, and the content hanging from
     * there in a scrollport of its own that ends at the footer. Nothing a body
     * does can move the words above it or the action below it.
     */
    readonly placement?: "line" | "centered" | "top";
    readonly title: string;
    /** One short line under the title; may carry an inline link. Reserved when absent. */
    readonly copy?: ReactNode;
    readonly status?: SetupPageStatus;
    /** Keep the main content anchored while status/errors appear, wrap, or clear. */
    readonly statusReserved?: boolean;
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
    /**
     * One quiet line in that same slot when it holds no secondary action, such
     * as why the primary action is not available yet.
     */
    readonly footnote?: string;
    /** Pinned to the bottom-right corner, outside the page's own bands. */
    readonly help?: ReactNode;
    /** The step before this one, pinned to the bottom-left corner. Omitted on the first. */
    readonly back?: SetupPageCornerAction;
    /**
     * Leaving the sequence to finish it later: one control in the top corner
     * the native window controls leave free, its close mark on the side
     * nearest the window edge.
     */
    readonly exit?: SetupPageCornerAction;
    /** Pinned top-left where the connection rail's first tile stands: whose setup this is. */
    readonly identity?: ReactNode;
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
 * `placement` chooses how the words are held. `line` is the default above.
 * `centered` centres words and content for a page that is a choice. `top` is
 * for a sequence whose bodies differ in height or change while they are open:
 * the title holds one line near the top of the window, the body hangs under
 * it in a scrollport of its own, and a new stage crossfades the words and the
 * body inside a frame that stays mounted.
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
        "decoration",
        "transitionKey",
        "scene",
        "art",
        "onScenePress",
        "title",
        "copy",
        "status",
        "statusReserved",
        "command",
        "children",
        "action",
        "secondary",
        "footnote",
        "help",
        "back",
        "exit",
        "identity",
        "placement",
        "steps",
    ]);
    const centered = local.placement === "centered";
    const top = local.placement === "top";
    const captionTrailing = useWindowCaptionTrailing();
    // The subtitle keeps its line when a page has none, so the status and
    // content below start at one height. A centred or top page carries it in
    // the header, with the title, above its content.
    const headed = centered || top;
    const lead = (
        <div className="happy-setup-page__lead">
            <p className="happy-setup-page__copy" data-happy-desktop-ui="setup-page-copy">
                {top ? (
                    <SetupPageSwap swapKey={local.transitionKey}>{local.copy}</SetupPageSwap>
                ) : (
                    local.copy
                )}
            </p>
            {top ? null : local.statusReserved ? (
                <div
                    aria-label="Status"
                    className="happy-setup-page__status-slot"
                    data-happy-desktop-ui="setup-page-status-slot"
                    role="region"
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- long recovery messages scroll in this bounded region, which keyboard users must be able to focus
                    tabIndex={local.status ? 0 : -1}
                >
                    {local.status ? (
                        <SetupStatus
                            status={local.status}
                            tone={local.backdrop ? "inverse" : "default"}
                        />
                    ) : null}
                </div>
            ) : local.status ? (
                <SetupStatus status={local.status} tone={local.backdrop ? "inverse" : "default"} />
            ) : null}
        </div>
    );
    return (
        <div
            className={["happy-setup-page", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="setup-page"
            data-appearance={local.backdrop?.appearance}
            data-backdrop={local.backdrop?.kind}
            data-transition={local.transitionKey === undefined ? undefined : ""}
            data-testid={local["data-testid"]}
            data-steps={local.steps ? "true" : undefined}
            data-identity={local.identity ? "true" : undefined}
            data-placement={headed ? local.placement : undefined}
            data-caption={captionTrailing ? "trailing" : undefined}
            style={local.style}
        >
            {local.backdrop ? <OnboardingSky appearance={local.backdrop.appearance} /> : null}
            {local.decoration}
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
                    // A top page is one retained frame; its words swap inside it.
                    key={top ? undefined : local.transitionKey}
                >
                    {/* Scene and title, packed to the bottom of a band that ends
                        on the centre line, so the title sits at the same height on
                        every page. A centred page has no scene square at all. */}
                    <div
                        className="happy-setup-page__header"
                        data-happy-desktop-ui="setup-page-header"
                    >
                        {headed ? null : (
                            /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a hidden, pointer-only gesture by design */
                            <span
                                className="happy-setup-page__stage"
                                data-happy-desktop-ui="setup-page-stage"
                                onClick={local.onScenePress}
                            >
                                {local.art !== undefined ? (
                                    local.art
                                ) : local.scene ? (
                                    <LottieScene
                                        name={local.scene}
                                        // The picture repeats what the title already says, so
                                        // the only thing worth offering is one more play.
                                        replayLabel={local.title}
                                        size={80}
                                    />
                                ) : null}
                            </span>
                        )}
                        <h1
                            className="happy-setup-page__title"
                            data-happy-desktop-ui="setup-page-title"
                        >
                            {top ? (
                                <SetupPageSwap swapKey={local.transitionKey}>
                                    {local.title}
                                </SetupPageSwap>
                            ) : (
                                local.title
                            )}
                        </h1>
                        {headed ? lead : null}
                    </div>
                    {top ? (
                        /* The content's own scrollport, from under the words to
                           the footer: a body that outgrows the window scrolls
                           here instead of pushing anything. */
                        <ScrollArea
                            className="happy-setup-page__core"
                            data-happy-desktop-ui="setup-page-core"
                            viewportClassName="happy-setup-page__core-viewport"
                        >
                            <div className="happy-setup-page__core-content">
                                {/* The live line opens the body here: under the
                                    words it would push the body off its height. */}
                                {local.status ? (
                                    <SetupStatus
                                        status={local.status}
                                        tone={local.backdrop ? "inverse" : "default"}
                                    />
                                ) : null}
                                {local.command === undefined ? null : (
                                    <SetupCommand command={local.command} label="command" />
                                )}
                                <SetupPageSwap
                                    block
                                    className="happy-setup-page__slot"
                                    part="setup-page-slot"
                                    swapKey={local.transitionKey}
                                >
                                    {local.children}
                                </SetupPageSwap>
                            </div>
                        </ScrollArea>
                    ) : (
                        <div
                            className="happy-setup-page__core"
                            data-happy-desktop-ui="setup-page-core"
                        >
                            {centered ? null : lead}
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
                    )}
                    {/* The band under the content matches the header's above it,
                        so the content sits in the middle and the words centre in
                        the band between it and the step bar. */}
                    {centered ? <div className="happy-setup-page__balance" aria-hidden /> : null}
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
                                              // eslint-disable-next-line jsx-a11y/no-autofocus -- a page that asks one thing starts the keyboard there
                                              autoFocus={action.autoFocus}
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
                            ) : local.footnote ? (
                                <p
                                    className="happy-setup-page__footnote"
                                    data-happy-desktop-ui="setup-page-footnote"
                                >
                                    {local.footnote}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </div>
            </ScrollArea>
            {local.back ? (
                <div className="happy-setup-page__back" data-happy-desktop-ui="setup-page-back">
                    <Button
                        disabled={local.back.disabled}
                        icon="arrow-left"
                        onClick={local.back.onSelect}
                        size="medium"
                        variant="ghost"
                    >
                        {local.back.label}
                    </Button>
                </div>
            ) : null}
            {local.help ? (
                <div className="happy-setup-page__help" data-happy-desktop-ui="setup-page-help">
                    {local.help}
                </div>
            ) : null}
            {local.exit ? (
                <div className="happy-setup-page__close" data-happy-desktop-ui="setup-page-close">
                    <Button
                        className="happy-setup-page__exit"
                        disabled={local.exit.disabled}
                        icon="close"
                        onClick={local.exit.onSelect}
                        size="medium"
                        variant="ghost"
                    >
                        {local.exit.label}
                    </Button>
                </div>
            ) : null}
            {local.identity ? (
                <div
                    className="happy-setup-page__identity"
                    data-happy-desktop-ui="setup-page-identity"
                >
                    {local.identity}
                </div>
            ) : null}
        </div>
    );
}

/**
 * One of a top page's changing parts: the title's words, the subtitle's, or
 * the body. Its box is fixed by the frame around it, so a new stage only
 * changes what is inside.
 *
 * The part that leaves has no React tree left to fade, so its last picture is
 * kept instead: a lifeless copy of its DOM, laid exactly over where it stood
 * in a layer React renders empty and never looks into again. The copy fades
 * out there while the new part fades in underneath, and removes itself.
 */
function SetupPageSwap(props: {
    readonly swapKey: string | undefined;
    readonly children: ReactNode;
    /** A block of content rather than a run of words. */
    readonly block?: boolean;
    readonly className?: string;
    readonly part?: string;
}) {
    const Part = props.block ? "div" : "span";
    return (
        <>
            <Part
                className={["happy-setup-page__swap", props.className].filter(Boolean).join(" ")}
                data-happy-desktop-ui={props.part}
                key={props.swapKey}
                ref={setupPageSwapRef}
            >
                {props.children}
            </Part>
            <Part aria-hidden className="happy-setup-page__swap-ghosts" />
        </>
    );
}

/**
 * Runs when a swapped part mounts, and its cleanup just before React takes the
 * old one out of the document, while it is still laid out where it stood.
 */
function setupPageSwapRef(node: HTMLElement | null): (() => void) | undefined {
    if (!node) return undefined;
    // A new stage starts at its top, whatever the last one was scrolled to.
    node.closest("[data-scrollbar-viewport]")?.scrollTo(0, 0);
    return () => {
        const layer = node.nextElementSibling;
        // A page hidden with its server draws nothing, so its animations never
        // end: a picture made there would wait and flash when the page returns.
        if (!(layer instanceof HTMLElement) || node.offsetParent === null) return;
        const ghost = node.cloneNode(true) as HTMLElement;
        // A picture, not a second page: nothing in it may be found, focused,
        // or submitted, and nothing may share an identity with the live part.
        ghost.inert = true;
        for (const element of [ghost, ...ghost.querySelectorAll("*")])
            for (const name of ["id", "for", "name", "autofocus", "data-happy-desktop-ui"])
                element.removeAttribute(name);
        ghost.classList.add("happy-setup-page__swap-ghost");
        ghost.style.top = `${String(node.offsetTop)}px`;
        // Every part is centred in the column, and one stage's column may be
        // wider than the last: held by its centre, the picture stays put.
        ghost.style.left = `calc(50% - ${String(node.offsetWidth / 2)}px)`;
        ghost.style.width = `${String(node.offsetWidth)}px`;
        ghost.style.height = `${String(node.offsetHeight)}px`;
        ghost.addEventListener("animationend", (event) => {
            if (event.target === ghost) ghost.remove();
        });
        layer.replaceChildren(ghost);
        // A copy starts unscrolled: a list scrolled inside the part is pictured
        // where it stood.
        const pictured = ghost.querySelectorAll("[data-scrollbar-viewport]");
        node.querySelectorAll("[data-scrollbar-viewport]").forEach((port, index) => {
            pictured[index]?.scrollTo({
                top: port.scrollTop,
                left: port.scrollLeft,
                behavior: "instant",
            });
        });
    };
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
                    style={
                        measured
                            ? ({ "--happy-progress": String(fraction) } as CSSProperties)
                            : undefined
                    }
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
