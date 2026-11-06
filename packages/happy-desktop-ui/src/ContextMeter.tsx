import { type CSSProperties } from "react";

export interface ContextMeterProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    /** Tokens already spent in the window. */
    readonly usedTokens: number;
    /** The whole context window. */
    readonly totalTokens: number;
    /**
     * Tokens at which the daemon compacts the conversation on its own. The notch sits here and
     * the colour turns as the fill approaches it. Without it the meter falls back to marking
     * three quarters of the window.
     */
    readonly compactTokens?: number;
    /** True when the underlying count is estimated rather than reported. */
    readonly approximate?: boolean;
    /** False while the model window is known but no provider measurement exists yet. */
    readonly measured?: boolean;
}

/** Where compaction is marked when the model publishes no threshold of its own. */
const DEFAULT_COMPACT_FRACTION = 0.75;
/**
 * The bar takes its warning colour once the fill is within this share of the compaction point,
 * so it turns yellow while there is still room to finish a thought, and its error colour at the
 * point itself, when the next turn compacts.
 */
const WARNING_MARGIN = 0.2;
const contextMeterFractions = new WeakMap<HTMLElement, number>();

function contextMeterAnimate(node: HTMLElement | null, fraction: number): void {
    if (!node) return;

    const previousFraction = contextMeterFractions.get(node);
    contextMeterFractions.set(node, fraction);
    if (
        previousFraction === undefined ||
        previousFraction === fraction ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
        return;

    const track = node.querySelector<HTMLElement>(".happy-context-meter__track");
    if (!track) return;

    track.getAnimations().forEach((animation) => animation.cancel());
    if (fraction > previousFraction) {
        track.animate(
            [
                { transform: "scaleX(1) scaleY(1)" },
                { transform: "scaleX(1.025) scaleY(1.45)", offset: 0.32 },
                { transform: "scaleX(0.995) scaleY(0.92)", offset: 0.68 },
                { transform: "scaleX(1) scaleY(1)" },
            ],
            {
                duration: 360,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
        );
        const shine = track.querySelector<HTMLElement>(".happy-context-meter__shine");
        shine?.animate(
            [
                { opacity: 0, transform: "translateX(-160%)" },
                { opacity: 0.82, offset: 0.24 },
                { opacity: 0, transform: "translateX(260%)" },
            ],
            {
                duration: 520,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
        );
        return;
    }

    track.animate(
        [
            { transform: "scaleX(1) scaleY(1)" },
            { transform: "scaleX(0.92) scaleY(1.55)", offset: 0.24 },
            { transform: "scaleX(1.035) scaleY(0.88)", offset: 0.58 },
            { transform: "scaleX(0.99) scaleY(1.08)", offset: 0.8 },
            { transform: "scaleX(1) scaleY(1)" },
        ],
        {
            duration: 460,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
    );
}

function tokensFormat(tokens: number): string {
    if (tokens < 1000) return String(Math.max(0, Math.round(tokens)));
    const thousands = tokens / 1000;
    if (thousands < 1000)
        return `${thousands < 100 ? thousands.toFixed(1).replace(/\.0$/, "") : String(Math.round(thousands))}k`;
    const millions = thousands / 1000;
    return `${millions.toFixed(1).replace(/\.0$/, "")}M`;
}

/**
 * ContextMeter — how much of the model's context window the conversation has
 * spent, as a short bar with the numbers behind it.
 *
 * It rides at the end of the composer's control row, beside the access mode and
 * the speed, because it belongs to the message being written: the reader is
 * about to type one more and wants to know whether it still fits. At rest only
 * the bar shows — the proportion is the whole answer at a glance — and pointing
 * at it slides the percentage and the token counts out to its left.
 *
 * Quiet by default. It takes colour only once compacting is the next thing to
 * do, so the colour means something when it appears.
 */
export function ContextMeter(props: ContextMeterProps) {
    const total = Math.max(0, props.totalTokens);
    const measured = props.measured !== false;
    const used = measured ? Math.max(0, Math.min(props.usedTokens, total)) : 0;
    const fraction = total === 0 ? 0 : used / total;
    const percent = Math.round(fraction * 100);
    const compactFraction =
        props.compactTokens !== undefined && props.compactTokens > 0 && props.compactTokens < total
            ? props.compactTokens / total
            : DEFAULT_COMPACT_FRACTION;
    const tone =
        fraction >= compactFraction
            ? "critical"
            : fraction >= compactFraction * (1 - WARNING_MARGIN)
              ? "compact"
              : "ample";
    const compactNote =
        props.compactTokens === undefined
            ? ""
            : ` \u00b7 compacts at ${tokensFormat(props.compactTokens)}`;
    return (
        <div
            aria-label={
                measured
                    ? `${tokensFormat(used)} of ${tokensFormat(total)} context tokens used${props.approximate ? ", approximate" : ""}${compactNote}`
                    : `Context measurement pending for a ${tokensFormat(total)} token window${compactNote}`
            }
            className={["happy-context-meter", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="context-meter"
            data-testid={props["data-testid"]}
            data-tone={tone}
            ref={(node) => {
                contextMeterAnimate(node, fraction);
            }}
            role="img"
            style={props.style}
            title={
                measured
                    ? `${tokensFormat(used)} of ${tokensFormat(total)} context tokens used${props.approximate ? " (approximate)" : ""}${compactNote}${tone === "critical" ? " — the next turn compacts the conversation" : tone === "compact" ? " — compaction is close; compact now to choose the moment" : ""}`
                    : `Waiting for the first context measurement (${tokensFormat(total)} token window${compactNote})`
            }
        >
            <span aria-hidden="true" className="happy-context-meter__readout">
                <span className="happy-context-meter__percent">
                    {measured ? `${props.approximate ? "~" : ""}${String(percent)}%` : "—"}
                </span>
                <span className="happy-context-meter__tokens">
                    {measured ? tokensFormat(used) : "—"}/{tokensFormat(total)}
                </span>
            </span>
            <span
                aria-hidden="true"
                className="happy-context-meter__track"
                data-happy-desktop-ui="context-meter-track"
            >
                {/*
                 * The fill is slid, not scaled: the bar is one hairline tall
                 * and a scaled fill would smear its rounded end.
                 */}
                <span
                    className="happy-context-meter__fill"
                    data-happy-desktop-ui="context-meter-fill"
                    style={
                        {
                            "--happy-context-meter-fraction": String(fraction),
                        } as CSSProperties
                    }
                />
                <span className="happy-context-meter__shine" />
                {/*
                 * Where the daemon compacts, notched into the track itself, so
                 * the fill approaching it is legible before the colour changes
                 * rather than only after. The notch is centred on the point.
                 */}
                <span
                    className="happy-context-meter__threshold"
                    style={{ left: `calc(${String(compactFraction * 100)}% - 0.5px)` }}
                />
            </span>
        </div>
    );
}
