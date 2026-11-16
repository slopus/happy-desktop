import { createContext, useContext, type ReactNode } from "react";

/**
 * The window's zoom as its owner reports it, in percent: 100 is unzoomed.
 * `undefined` where nothing reports it, as in a browser tab, whose own zoom
 * the page can only infer from its pixel ratio.
 */
const WindowZoomContext = createContext<number | undefined>(undefined);

/**
 * Supplies the zoom the window's owner applied. The desktop shell changes zoom
 * itself and says what it came to, so nothing below this has to guess it from
 * the device pixel ratio, which also changes when the window moves to a
 * display of another density and nothing was zoomed at all.
 */
export function WindowZoomProvider(props: { children: ReactNode; percent: number }) {
    return (
        <WindowZoomContext.Provider value={props.percent}>
            {props.children}
        </WindowZoomContext.Provider>
    );
}

/** The owner-reported zoom in percent, or `undefined` where no owner reports one. */
export function useWindowZoom(): number | undefined {
    return useContext(WindowZoomContext);
}
