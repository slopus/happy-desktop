import { messageListRowHeightCheckInstall } from "happy-desktop-ui";

declare const __HAPPY_RENDERER_VERSION__: string;

/**
 * A development or preview renderer (`X.Y.Z-preview.N`) warns about every
 * transcript row whose painted height settles away from the height the list
 * placed the next row from: `[happy:row-height]`, the row's entry key, its
 * width, and both heights. A production renderer installs nothing, so it
 * observes and measures no row. Renderer console output reaches the desktop
 * debug log while local debug mode is on.
 */
export function desktopRowHeightCheckInstall(): void {
    if (!import.meta.env.DEV && !__HAPPY_RENDERER_VERSION__.includes("-preview.")) return;
    messageListRowHeightCheckInstall((mismatch) => {
        const difference = mismatch.actual - mismatch.predicted;
        console.warn(
            `[happy:row-height] row ${mismatch.key} (index ${String(mismatch.index)}) at ` +
                `${String(mismatch.width)}px wide: predicted ${String(mismatch.predicted)}px, ` +
                `painted ${String(mismatch.actual)}px; ` +
                (difference > 0
                    ? `the next row overlaps its last ${String(difference)}px`
                    : `it leaves a ${String(-difference)}px gap`),
            mismatch,
        );
    });
}
