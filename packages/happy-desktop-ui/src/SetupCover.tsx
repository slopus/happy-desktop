import type { ReactNode } from "react";
import { WindowCover } from "./WindowOverlay";

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
    return (
        <WindowCover>
            <div className="happy-setup-cover" data-happy-desktop-ui="setup-cover">
                {props.children}
            </div>
        </WindowCover>
    );
}
