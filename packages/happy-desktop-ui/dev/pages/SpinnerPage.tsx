import {
    SPINNER_FRAMES,
    SPINNER_VARIANTS,
    Spinner,
    type SpinnerTone,
    type SpinnerVariant,
} from "../../src/Spinner";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-160";

const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
};

const row: Record<string, string> = {
    display: "flex",
    alignItems: "center",
    gap: "24px",
    flexWrap: "wrap",
};

const cell: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "8px",
    minWidth: "96px",
};

const caption: Record<string, string> = {
    color: "var(--text-secondary)",
    fontFamily: "var(--happy-font-mono)",
    fontSize: "10px",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
};

const filmstrip: Record<string, string> = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
};

const card: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "20px 24px",
    border: "1px solid var(--divider)",
    borderRadius: "10px",
    background: "var(--surface)",
};

const ascii: Record<string, Record<string, string>> = {
    "braille-2": { source: "⣾⣽⣻⢿⡿⣟⣯⣷", note: "cli-spinners dots2" },
    "braille-9": { source: "⢹⢺⢼⣸⣇⡧⡗⡏", note: "cli-spinners dots9" },
    "braille-10": { source: "⢄⢂⢁⡁⡈⡐⡠", note: "cli-spinners dots10 · 7 frames" },
    "braille-11": { source: "⠁⠂⠄⡀⢀⠠⠐⠈", note: "cli-spinners dots11 · single dot orbit" },
    "braille-13": { source: "⣼⣹⢻⠿⡟⣏⣧⣶", note: "cli-spinners dots13" },
    "braille-sand": { source: "⠁⠂⠄⡀⡈⡐⡠⣀⣁⣂⣄⣌…", note: "cli-spinners sand · 35 frames" },
    line: { source: "| / - \\", note: "1 bar · 45° per frame" },
    arc: { source: "◜ ◝ ◞ ◟", note: "quarter arc · 90° per frame" },
    circle: { source: "◐ ◓ ◑ ◒", note: "half-filled disc · 90° per frame" },
    blocks: { source: "▁ ▃ ▅ ▇", note: "4 bars · staggered quarter cycle" },
    bar: { source: "[####    ]", note: "8 cells · clip-path reveal" },
    bounce: { source: "[ =   ]", note: "6 slots · 5 steps each way" },
    dots: { source: ".   ..  ...", note: "cli-spinners simpleDots · 4 frames" },
    toggle: { source: "▮ ▯", note: "1 square · fill on/off" },
    pulse: { source: ". o O @", note: "1 disc · 4 discrete scales" },
    "grow-vertical": { source: "▁ ▃ ▄ ▅ ▆ ▇", note: "1 bar · 6 heights, ping-pong" },
    "grow-horizontal": { source: "▏ ▎ ▍ ▌ ▋ ▊ ▉", note: "1 bar · 7 widths, ping-pong" },
    triangle: { source: "◢ ◣ ◤ ◥", note: "clip-path triangle · 90° per frame" },
    quadrant: { source: "◰ ◳ ◲ ◱", note: "outlined box · filled quarter turns" },
    "box-bounce": { source: "▖ ▘ ▝ ▗", note: "half block · four corners" },
    hamburger: { source: "☱ ☲ ☴", note: "3 rules · one lit at a time" },
    noise: { source: "▓ ▒ ░", note: "1 block · 3 densities" },
    arrow: { source: "← ↖ ↑ ↗ → ↘ ↓ ↙", note: "chevron · 45° per frame" },
};

const tones: SpinnerTone[] = ["default", "muted", "accent"];

/* Square edge paired with the largest Icon size that fits it. */
function VariantCell(props: { variant: SpinnerVariant }) {
    return (
        <div style={cell}>
            <Spinner variant={props.variant} />
            <span style={caption}>{props.variant}</span>
            <span style={{ ...caption, textTransform: "none" }}>{ascii[props.variant].source}</span>
        </div>
    );
}

function Filmstrip(props: { variant: SpinnerVariant }) {
    const frames = SPINNER_FRAMES[props.variant];
    return (
        <div style={column}>
            <div style={filmstrip}>
                {Array.from({ length: frames }, (_, frame) => (
                    <div key={frame} style={{ ...cell, minWidth: "auto" }}>
                        <Spinner frame={frame} size={20} variant={props.variant} />
                        <span style={caption}>{frame}</span>
                    </div>
                ))}
            </div>
            <span style={caption}>
                {props.variant} · {frames} frames · {ascii[props.variant].note}
            </span>
        </div>
    );
}

export function SpinnerPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Twenty-three terminal ASCII loaders rebuilt as compact geometric marks. The production Braille loop stamps one shared dot mask onto the actual device-pixel grid; the remaining variants use CSS shapes, and every variant parks on an exact frame for fixtures."
            title="Spinner"
        >
            <Specimen
                detail="16px line height · width follows the variant · live animation"
                label="Twenty-three variants"
                number="01"
                stage="surface"
            >
                <div style={card}>
                    <div style={row}>
                        {SPINNER_VARIANTS.map((variant) => (
                            <VariantCell key={variant} variant={variant} />
                        ))}
                    </div>
                    <DimensionRule label="16 px high · braille 8 · blocks 18 · bounce 42 · bar 56 · rest 16 wide" />
                </div>
            </Specimen>

            <Specimen
                detail="frame prop freezes the loop on one discrete cell — deterministic for screenshots"
                label="Frame-by-frame filmstrips"
                number="02"
                stage="app"
            >
                <div style={{ ...card, gap: "24px" }}>
                    {SPINNER_VARIANTS.map((variant) => (
                        <Filmstrip key={variant} variant={variant} />
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Braille includes its 14px production size; every variant retains its documented scale"
                label="Size scale"
                number="03"
                stage="surface"
            >
                <div style={{ ...card, gap: "20px" }}>
                    {(
                        ["braille-2", "braille-sand", "arc", "blocks", "bar"] as SpinnerVariant[]
                    ).map((variant) => (
                        <div key={variant} style={row}>
                            {(variant.startsWith("braille")
                                ? [12, 14, 16, 20, 24, 32, 48]
                                : [12, 16, 20, 24, 32, 48]
                            ).map((size) => (
                                <div key={size} style={{ ...cell, minWidth: "auto" }}>
                                    <Spinner size={size} variant={variant} />
                                    <span style={caption}>{size} px</span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="currentColor throughout — default text, secondary, and link tones"
                label="Tones"
                number="04"
                stage="surface"
            >
                <div style={card}>
                    {tones.map((tone) => (
                        <div key={tone} style={row}>
                            {SPINNER_VARIANTS.map((variant) => (
                                <Spinner key={variant} tone={tone} variant={variant} />
                            ))}
                            <span style={caption}>{tone}</span>
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="Inverse tone on the primary action surface"
                label="On a dark surface"
                number="05"
                stage="chrome"
            >
                <div
                    style={{
                        ...row,
                        background: "var(--button-primary-background)",
                        borderRadius: "var(--happy-radius-sm)",
                        padding: "16px 20px",
                    }}
                >
                    {SPINNER_VARIANTS.map((variant) => (
                        <Spinner key={variant} tone="inverse" variant={variant} />
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="16px spinner beside 13px UI text — baseline sits on the text line box"
                label="Inline with text"
                number="07"
                stage="surface"
            >
                <div style={card}>
                    {(["braille-2", "dots", "bar"] as SpinnerVariant[]).map((variant) => (
                        <div key={variant} style={{ ...row, gap: "8px" }}>
                            <Spinner tone="muted" variant={variant} />
                            <span
                                style={{
                                    color: "var(--text-secondary)",
                                    fontFamily: "var(--happy-font-ui)",
                                    fontSize: "13px",
                                }}
                            >
                                Building workspace…
                            </span>
                        </div>
                    ))}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
