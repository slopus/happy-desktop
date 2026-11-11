import { type CSSProperties, type ReactNode } from "react";

export type SpinnerVariant =
    | "braille-2"
    | "braille-9"
    | "braille-10"
    | "braille-11"
    | "braille-13"
    | "braille-sand"
    | "line"
    | "arc"
    | "circle"
    | "blocks"
    | "bar"
    | "bounce"
    | "dots"
    | "toggle"
    | "pulse"
    | "grow-vertical"
    | "grow-horizontal"
    | "triangle"
    | "quadrant"
    | "box-bounce"
    | "hamburger"
    | "noise"
    | "arrow";

export type SpinnerTone = "default" | "muted" | "accent" | "inverse";

/** Every variant in the order the blueprint presents them. */
export const SPINNER_VARIANTS: readonly SpinnerVariant[] = [
    "braille-2",
    "braille-9",
    "braille-10",
    "braille-11",
    "braille-13",
    "braille-sand",
    "line",
    "arc",
    "circle",
    "blocks",
    "bar",
    "bounce",
    "dots",
    "toggle",
    "pulse",
    "grow-vertical",
    "grow-horizontal",
    "triangle",
    "quadrant",
    "box-bounce",
    "hamburger",
    "noise",
    "arrow",
];

/**
 * Discrete frame count of each loop, matching the ASCII original it reproduces
 * (braille ⣾⣽⣻⢿⡿⣟⣯⣷ is 8 frames, |/-\ is 4, ▮▯ is 2…). `frame` is taken
 * modulo this so a fixture can hold any variant on a known cell.
 */
export const SPINNER_FRAMES: Record<SpinnerVariant, number> = {
    "braille-2": 8,
    "braille-9": 8,
    "braille-10": 7,
    "braille-11": 8,
    "braille-13": 8,
    "braille-sand": 35,
    line: 4,
    arc: 4,
    circle: 4,
    blocks: 4,
    bar: 8,
    bounce: 10,
    dots: 4,
    toggle: 2,
    pulse: 4,
    "grow-vertical": 6,
    "grow-horizontal": 7,
    triangle: 4,
    quadrant: 4,
    "box-bounce": 4,
    hamburger: 3,
    noise: 3,
    arrow: 8,
};

export type SpinnerProps = {
    className?: string;
    /** Freeze the loop on one discrete frame — for fixtures and screenshots. */
    frame?: number;
    /** Accessible name; the spinner is a live `status` region. */
    label?: string;
    /** Line height of the spinner box in CSS pixels. Width follows the variant. */
    size?: number;
    tone?: SpinnerTone;
    variant?: SpinnerVariant;
};

function cells(count: number, part: string) {
    return Array.from({ length: count }, (_, index) => (
        <span
            className={`happy-spinner__${part}`}
            data-happy-desktop-ui={`spinner-${part}`}
            key={index}
        />
    ));
}

function bracketed(track: ReactNode) {
    return (
        <>
            <span
                className="happy-spinner__bracket"
                data-happy-desktop-ui="spinner-bracket"
                data-side="left"
            />
            {track}
            <span
                className="happy-spinner__bracket"
                data-happy-desktop-ui="spinner-bracket"
                data-side="right"
            />
        </>
    );
}

function variantParts(variant: SpinnerVariant) {
    if (variant.startsWith("braille")) {
        /* Always the full 2x4 cell: left column top to bottom is dots 1,2,3,7
         * and right column is dots 4,5,6,8 — the order spinner-braille.css
         * addresses. A spinner that never lights a dot leaves it unanimated at
         * the cell's resting opacity. */
        return (
            <>
                <span className="happy-spinner__column" data-happy-desktop-ui="spinner-column">
                    {cells(4, "dot")}
                </span>
                <span className="happy-spinner__column" data-happy-desktop-ui="spinner-column">
                    {cells(4, "dot")}
                </span>
            </>
        );
    }
    switch (variant) {
        case "blocks":
            return cells(4, "bar");
        case "hamburger":
            return cells(3, "bar");
        case "dots":
            return cells(3, "dot");
        case "bar":
            return bracketed(
                <span className="happy-spinner__track" data-happy-desktop-ui="spinner-track">
                    <span className="happy-spinner__fill" data-happy-desktop-ui="spinner-fill" />
                </span>,
            );
        case "circle":
            /* The four phases of ◐◓◑◒ as four still layers inside one still
               outline; only their opacity changes. */
            return (
                <span className="happy-spinner__glyph" data-happy-desktop-ui="spinner-glyph">
                    {cells(4, "phase")}
                </span>
            );
        case "bounce":
            return bracketed(
                <span className="happy-spinner__track" data-happy-desktop-ui="spinner-track">
                    <span className="happy-spinner__block" data-happy-desktop-ui="spinner-block" />
                </span>,
            );
        default:
            return <span className="happy-spinner__glyph" data-happy-desktop-ui="spinner-glyph" />;
    }
}

/**
 * Spinner — the ASCII terminal loaders (braille cells, |/-\, ◜◝◞◟, ◐◓◑◒,
 * ▁▃▅▇, [####  ], [ =  ], …, ▮▯, .oO@, ▁▄▆█, ▏▍▊█, ◢◣◤◥, ◰◳◲◱, ▖▘▝▗, ☱☲☴,
 * ▓▒░, ←↖↑↗) redrawn as CSS shapes. The component renders static markup
 * only; no script runs while a loader turns.
 *
 * Every loop moves only `transform` and `opacity`, so it runs on the
 * compositor and keeps turning while the page's main thread is busy.
 */
export function Spinner(props: SpinnerProps) {
    const variant = props.variant ?? "braille-2";
    const frames = SPINNER_FRAMES[variant];
    const paused = props.frame !== undefined;
    const index = paused ? (((props.frame ?? 0) % frames) + frames) % frames : 0;
    /*
     * Park three quarters into the requested cell rather than on its leading
     * edge: a negative delay that lands exactly on a `steps()` boundary is
     * resolved inconsistently, and by 75% of a cell the braille family's fade
     * ramps have also finished, so a parked frame is the settled glyph.
     */
    const offset = paused ? (index + 0.75) / frames : 0;
    return (
        <span
            aria-label={props.label ?? "Loading"}
            className={["happy-spinner", props.className].filter(Boolean).join(" ")}
            data-frame={paused ? index : undefined}
            data-happy-desktop-ui="spinner"
            data-paused={paused ? "" : undefined}
            data-tone={props.tone ?? "default"}
            data-variant={variant}
            role="status"
            style={
                {
                    "--happy-spinner-size": `${props.size ?? 16}px`,
                    "--happy-spinner-offset": `${offset}`,
                } as CSSProperties
            }
        >
            {variantParts(variant)}
        </span>
    );
}
