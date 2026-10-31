import { create } from "qrcode";
import { Ionicon } from "./vectorIcons/VectorIcon";

/**
 * What sits in the cleared centre of a symbol: the store a download code leads
 * to, or the two devices a pairing code links.
 */
export type QRCodeMark = "app-store" | "google-play" | "link";

export interface QRCodeProps {
    readonly className?: string;
    /** Opaque payload encoded into the symbol. */
    readonly data: string;
    readonly label?: string;
    /** Clears the centre of the symbol and names where the code leads. */
    readonly mark?: QRCodeMark;
    readonly size?: number;
    readonly "data-testid"?: string;
}

/** The quiet zone, in modules, on every side. */
const QUIET_ZONE = 4;
/** Modules kept clear between the mark and the nearest module. */
const MARK_MARGIN = 1.5;
/**
 * Each mark's box as a share of the whole symbol, quiet zone included, so the
 * cleared area is the same number of modules at every display size and the
 * mark scales with the code. Measured from the approved artwork: the store
 * marks at a 176px code, the pairing mark at a 136px one.
 */
const MARK_BOX: Record<QRCodeMark, { readonly width: number; readonly height: number }> = {
    "app-store": { width: 55 / 176, height: 42 / 176 },
    "google-play": { width: 60 / 176, height: 46 / 176 },
    link: { width: 36 / 136, height: 36 / 136 },
};

/** The odd module count nearest to `value`, so a cleared run centres on the middle module. */
function oddModules(value: number): number {
    return Math.max(1, Math.round((value - 1) / 2) * 2 + 1);
}

/** A rounded square path in module units, for the finder patterns. */
function roundedSquare(x: number, y: number, size: number, radius: number): string {
    const side = size - 2 * radius;
    return (
        `M${String(x + radius)} ${String(y)}h${String(side)}` +
        `a${String(radius)} ${String(radius)} 0 0 1 ${String(radius)} ${String(radius)}v${String(side)}` +
        `a${String(radius)} ${String(radius)} 0 0 1 ${String(-radius)} ${String(radius)}h${String(-side)}` +
        `a${String(radius)} ${String(radius)} 0 0 1 ${String(-radius)} ${String(-radius)}v${String(-side)}` +
        `a${String(radius)} ${String(radius)} 0 0 1 ${String(radius)} ${String(-radius)}z`
    );
}

interface QRCodeGeometry {
    /** Modules plus quiet zone on one side, the viewBox edge. */
    readonly cells: number;
    /** Every dark data module, as square horizontal runs. */
    readonly modules: string;
    /** The three finder patterns: rounded ring and rounded centre, even-odd. */
    readonly finders: string;
}

/**
 * The symbol at error correction H, with the mark's area truly cleared rather
 * than painted over: no module is drawn under the mark or its margin, and H's
 * redundancy carries what was removed.
 */
function qrCodeGeometry(data: string, mark: QRCodeMark | undefined): QRCodeGeometry {
    const qr = create(data, { errorCorrectionLevel: "H" });
    const count = qr.modules.size;
    const cells = count + QUIET_ZONE * 2;
    const middle = (count - 1) / 2;
    const box = mark ? MARK_BOX[mark] : undefined;
    const clearColumns = box ? oddModules(box.width * cells + MARK_MARGIN * 2) : 0;
    const clearRows = box ? oddModules(box.height * cells + MARK_MARGIN * 2) : 0;
    const finder = (row: number, column: number) =>
        (row < 7 && column < 7) ||
        (row < 7 && column >= count - 7) ||
        (row >= count - 7 && column < 7);
    const cleared = (row: number, column: number) =>
        Math.abs(column - middle) <= (clearColumns - 1) / 2 &&
        Math.abs(row - middle) <= (clearRows - 1) / 2;
    const dark = (row: number, column: number) =>
        Boolean(qr.modules.get(row, column)) && !finder(row, column) && !cleared(row, column);

    let modules = "";
    for (let row = 0; row < count; row += 1) {
        let column = 0;
        while (column < count) {
            if (!dark(row, column)) {
                column += 1;
                continue;
            }
            const start = column;
            while (column < count && dark(row, column)) column += 1;
            const run = column - start;
            modules += `M${String(start + QUIET_ZONE)} ${String(row + QUIET_ZONE)}h${String(run)}v1h${String(-run)}z`;
        }
    }

    const finders = [
        [QUIET_ZONE, QUIET_ZONE],
        [QUIET_ZONE + count - 7, QUIET_ZONE],
        [QUIET_ZONE, QUIET_ZONE + count - 7],
    ]
        .map(
            ([x = 0, y = 0]) =>
                roundedSquare(x, y, 7, 2.5) +
                roundedSquare(x + 1, y + 1, 5, 1.5) +
                roundedSquare(x + 2, y + 2, 3, 0.75),
        )
        .join("");
    return { cells, finders, modules };
}

/**
 * A crisp QR symbol: square data modules, rounded finder eyes, a four-module
 * quiet zone, and error correction H.
 *
 * Data modules render with crisp edges so a dense payload stays sharp and
 * scannable at every display scale; only the finder curves are smoothed. A
 * mark sits straight on the paper in the cleared centre, in grey so a camera
 * and a reader never mistake it for modules. It is sized against the code's
 * own box, so a layout that shrinks the code to fit a short window shrinks the
 * mark with it.
 */
export function QRCode(props: QRCodeProps) {
    const size = props.size ?? 160;
    const geometry = qrCodeGeometry(props.data, props.mark);
    const viewBox = `0 0 ${String(geometry.cells)} ${String(geometry.cells)}`;
    return (
        <div
            aria-label={props.label ?? "QR code"}
            className={["happy-qr-code", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="qr-code"
            data-testid={props["data-testid"]}
            role="img"
            // `size` is the default box. A layout that has to fit a short window
            // may shrink the box through the property.
            style={{
                height: `var(--happy-qr-code-size, ${String(size)}px)`,
                width: `var(--happy-qr-code-size, ${String(size)}px)`,
            }}
        >
            <svg aria-hidden className="happy-qr-code__symbol" viewBox={viewBox}>
                <path d={geometry.modules} shapeRendering="crispEdges" />
                <path d={geometry.finders} fillRule="evenodd" />
            </svg>
            {props.mark ? <QRCodeMarkView mark={props.mark} /> : null}
        </div>
    );
}

/** Lucide `monitor-smartphone` (ISC), the approved pairing mark. */
function LinkMarkIcon() {
    return (
        <svg
            className="happy-qr-code__mark-devices"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            // 1.4px at the 22px reference size, the weight of an Ionicons outline.
            strokeWidth={(1.4 * 24) / 22}
            viewBox="0 0 24 24"
        >
            <path d="M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8" />
            <path d="M10 19v-3.96 3.15" />
            <path d="M7 19h5" />
            <rect height="10" rx="2" width="6" x="16" y="12" />
        </svg>
    );
}

function QRCodeMarkView(props: { readonly mark: QRCodeMark }) {
    if (props.mark === "link")
        return (
            <span aria-hidden className="happy-qr-code__mark" data-mark="link">
                <LinkMarkIcon />
            </span>
        );
    return (
        <span aria-hidden className="happy-qr-code__mark" data-mark={props.mark}>
            <Ionicon
                className="happy-qr-code__mark-glyph"
                name={props.mark === "app-store" ? "logo-apple-appstore" : "logo-google-playstore"}
                // The glyph scales with the code rather than at a fixed pixel size.
                style={{ fontSize: "var(--happy-qr-code-mark-glyph)", height: "1em", width: "1em" }}
            />
            <span className="happy-qr-code__mark-name">
                {props.mark === "app-store" ? "App Store" : "Google Play"}
            </span>
            <span className="happy-qr-code__mark-action">Download</span>
        </span>
    );
}
