import { useContext, type ReactNode } from "react";
import { WindowCover, WindowCoverHostContext } from "./WindowOverlay";

/** How many shown covers hold each element of the window inert. */
const inertHolds = new WeakMap<Element, number>();

/**
 * Makes everything beside the cover lane inert while a cover is shown — the
 * rail and the connection it covers — so Tab and assistive technology stay in
 * the setup in front. What the setup opens hangs on the same lane and stays
 * live. React attaches the ref only while the cover's connection is shown.
 */
function coverInertHold(lane: HTMLElement | null | undefined) {
    return (node: HTMLDivElement | null) => {
        const covered = lane?.parentElement
            ? [...lane.parentElement.children].filter((element) => element !== lane)
            : [];
        if (!node || covered.length === 0) return;
        for (const element of covered) {
            inertHolds.set(element, (inertHolds.get(element) ?? 0) + 1);
            element.setAttribute("inert", "");
        }
        return () => {
            for (const element of covered) {
                const holds = (inertHolds.get(element) ?? 1) - 1;
                inertHolds.set(element, holds);
                if (holds === 0) element.removeAttribute("inert");
            }
        };
    };
}

/**
 * C-356 SetupCover — a setup sequence that takes the whole window, the
 * connection rail included.
 *
 * A server's setup is written where it belongs, inside that server's own
 * surface, and hangs from the connection shell's cover lane, so the rail is
 * under it instead of beside it and a connection kept out of sight hides its
 * cover with it. A dialog the sequence opens is written inside the cover and
 * dims the same whole window. Without a shell it fills whatever contains it.
 */
export function SetupCover(props: { readonly children: ReactNode }) {
    const lane = useContext(WindowCoverHostContext);
    return (
        <WindowCover>
            <div
                className="happy-setup-cover"
                data-happy-desktop-ui="setup-cover"
                ref={coverInertHold(lane)}
            >
                {props.children}
            </div>
        </WindowCover>
    );
}
