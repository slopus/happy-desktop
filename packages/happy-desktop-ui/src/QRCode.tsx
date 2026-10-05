import { create } from "qrcode";

export interface QRCodeProps {
    readonly className?: string;
    /** Opaque pairing payload encoded into the symbol. */
    readonly data: string;
    readonly label?: string;
    readonly size?: number;
    readonly "data-testid"?: string;
}

/**
 * A crisp, token-coloured QR symbol.
 *
 * Drawing happens in the ref callback: the canvas is an imperative browser
 * boundary, and the callback gives it the current data and theme without a
 * second state system or a React effect. Module edges are snapped to physical
 * pixels so a dense pairing payload remains scannable on every display scale.
 */
export function QRCode(props: QRCodeProps) {
    const size = props.size ?? 160;
    const draw = (canvas: HTMLCanvasElement | null): void => {
        if (!canvas) return;
        const qr = create(props.data, { errorCorrectionLevel: "M" });
        const quietZone = 4;
        const cells = qr.modules.size + quietZone * 2;
        const pixels = Math.max(cells, Math.round(size * window.devicePixelRatio));
        canvas.width = pixels;
        canvas.height = pixels;

        const context = canvas.getContext("2d");
        if (!context) return;
        const style = getComputedStyle(canvas);
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, pixels, pixels);
        context.fillStyle = style.color;
        for (let row = 0; row < qr.modules.size; row += 1) {
            const top = Math.round(((row + quietZone) * pixels) / cells);
            const bottom = Math.round(((row + quietZone + 1) * pixels) / cells);
            for (let column = 0; column < qr.modules.size; column += 1) {
                if (!qr.modules.get(row, column)) continue;
                const left = Math.round(((column + quietZone) * pixels) / cells);
                const right = Math.round(((column + quietZone + 1) * pixels) / cells);
                context.fillRect(left, top, right - left, bottom - top);
            }
        }
    };

    return (
        <canvas
            aria-label={props.label ?? "QR code"}
            className={["happy-qr-code", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="qr-code"
            data-testid={props["data-testid"]}
            height={size}
            ref={draw}
            role="img"
            // `size` is the drawn resolution and the default box. A layout that
            // has to fit a short window may shrink the box through the property.
            style={{
                height: `var(--happy-qr-code-size, ${size}px)`,
                width: `var(--happy-qr-code-size, ${size}px)`,
            }}
            width={size}
        />
    );
}
