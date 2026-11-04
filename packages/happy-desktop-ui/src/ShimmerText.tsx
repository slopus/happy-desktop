import { partitionComponentProps } from "./componentProps";
import { type CSSProperties, type ReactNode } from "react";

export type ShimmerTextTone = "default" | "muted" | "accent" | "inherit";
export type ShimmerTextSweep = "lift" | "sheen";
export type ShimmerTextProps = {
    className?: string;
    "data-happy-desktop-ui"?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The text to shimmer. Plain text: the sweep is painted through the glyphs. */
    children: ReactNode;
    /**
     * The one text role the whole effect is built from. The default is ordinary
     * text; `muted` is the usual choice for a label that is waiting on something
     * and should read as secondary while it does.
     *
     * `inherit` builds the ramp from the colour the text already had, which is
     * the right choice for a shimmer swapped in over a live label: the letters
     * keep whatever colour the surface around them decided — a sidebar row that
     * is secondary at rest and full strength when unread — so turning the
     * shimmer on never repaints the text, it only adds the travelling band.
     */
    tone?: ShimmerTextTone;
    /**
     * Which end of the tone the letters rest at. `lift` dims them and sweeps a
     * full-strength band through, so the text reads as not-yet-finished.
     * `sheen` leaves them at their normal colour and sweeps a pale band instead
     * — whiteish on a light theme — for text that has to stay exactly as
     * legible as everything around it while it shimmers.
     */
    sweep?: ShimmerTextSweep;
    /**
     * Lets the run wrap like the prose around it. By default the shimmer is one
     * unbreakable box, which suits a label that sits on a line of its own. A
     * run inside a paragraph — a link in a message — has to break exactly where
     * its words would without the shimmer, so turning the sweep on and off
     * never reflows the text or the row it is in. The sweep still crosses the
     * whole run as one band, across every line it wraps onto.
     */
    inline?: boolean;
    /** One sweep, in milliseconds. */
    durationMs?: number;
    /**
     * Freezes the sweep at one position, `0` to `1` across the loop, for a
     * fixture or a screenshot that has to photograph identically every time.
     * Live surfaces leave it out and the sweep runs.
     *
     * The band crosses the line over the middle of that range: it reaches the
     * left edge around `0.25`, the middle at `0.5`, and the right edge around
     * `0.75`, and at `0` and `1` it is clear of the text altogether, which is a
     * real frame of the loop and shows the label at its resting colour.
     */
    phase?: number;
};

/**
 * C-254 ShimmerText — a band of light travelling through a line of text, for a
 * label that is waiting on something whose progress cannot be counted.
 *
 * It is the honest form of "something is happening" for work with no fraction to
 * report: a progress bar would have to invent one, and a spinner beside a label
 * says the same thing twice. The letters stay exactly where they are and stay
 * readable throughout — the sweep only moves colour through them, so nothing
 * reflows, nothing is occluded, and the text can be read at any moment of the
 * loop.
 *
 * The animation is decorative. Assistive technology is given the text and
 * nothing else, and a reader who has asked for reduced motion gets the resting
 * colour with no sweep at all. Props only, desktop-only: no timers, no store,
 * no elapsed time.
 *
 * A single-line run of text sweeps on the compositor: the ramp is a box of
 * its own that slides behind the run's glyphs, which mask it, so a frame of
 * the loop repaints and rasterises nothing. A wrapping inline run, or one that
 * is not plain text, such as an icon, keeps the painted gradient.
 */
export function ShimmerText(props: ShimmerTextProps) {
    const [local] = partitionComponentProps(props, [
        "children",
        "className",
        "data-happy-desktop-ui",
        "data-testid",
        "durationMs",
        "inline",
        "phase",
        "style",
        "sweep",
        "tone",
    ]);
    const paused = () => local.phase !== undefined;
    // Wrapped into the loop rather than clamped, so a fixture may step past the
    // end — or before the start — and still land on a real frame of the sweep.
    const offset = () => {
        const phase = local.phase ?? 0;
        return ((phase % 1) + 1) % 1;
    };
    const layered = () =>
        !local.inline && (typeof local.children === "string" || typeof local.children === "number");
    return (
        <span
            className={["happy-shimmer-text", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui={local["data-happy-desktop-ui"] ?? "shimmer-text"}
            data-inline={local.inline ? "" : undefined}
            data-layered={layered() ? "" : undefined}
            data-paused={paused() ? "" : undefined}
            data-sweep={local.sweep ?? "lift"}
            data-testid={local["data-testid"]}
            data-tone={local.tone ?? "default"}
            style={
                {
                    ...local.style,
                    ...(local.durationMs === undefined
                        ? {}
                        : { "--happy-shimmer-duration": `${local.durationMs}ms` }),
                    ...(paused() ? { "--happy-shimmer-offset": `${offset()}` } : {}),
                } as CSSProperties
            }
        >
            {local.children}
            {layered() ? <span aria-hidden="true" className="happy-shimmer-text__ramp" /> : null}
        </span>
    );
}
