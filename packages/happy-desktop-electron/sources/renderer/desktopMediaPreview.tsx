import { useSyncExternalStore } from "react";
import {
    CLOSE_SHORTCUT,
    commandShortcutMatches,
    filePreviewKind,
    ImageViewer,
    VideoViewer,
} from "happy-desktop-ui";
import type { DesktopMediaPreview, HappyMediaPreviewBridge } from "../shared/desktopContract";

/** The file this window is on, as a store the shell can subscribe to. */
export interface DesktopMediaPreviewStore {
    get(): DesktopMediaPreview | undefined;
    subscribe(listener: () => void): () => void;
}

/**
 * Follows the file the shell points this window at.
 *
 * The first subject is asked for once, because a window that has just opened has
 * not been sent anything yet; every later one arrives on the bridge, so pointing
 * the window at a different file replaces what is showing instead of opening a
 * second window.
 */
export function desktopMediaPreviewStoreCreate(
    bridge: HappyMediaPreviewBridge,
): DesktopMediaPreviewStore {
    let preview: DesktopMediaPreview | undefined;
    const listeners = new Set<() => void>();
    const publish = (next: DesktopMediaPreview | undefined): void => {
        preview = next;
        // A copy, so a listener that unsubscribes while being told is told once
        // and does not disturb the set the loop is walking.
        const current = Array.from(listeners);
        for (const listener of current) listener();
    };
    void bridge.mediaPreviewGet().then(
        (initial) => {
            if (preview === undefined) publish(initial);
        },
        () => undefined,
    );
    const stop = bridge.mediaPreviewSubscribe(publish);
    return {
        get: () => preview,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) stop();
            };
        },
    };
}

/**
 * The whole of the separate preview window: one file, at whatever size the
 * reader wants it, and nothing else.
 *
 * It renders the same viewers the file preview does, so the zooming, panning,
 * transport and keyboard a reader already knows are the ones they get here. The
 * window's own title bar names the file, which is why nothing is drawn above it.
 *
 * Which viewer that is comes from the path, and the path was read out of the
 * address the shell had already validated — the same fact the window is titled
 * after. A kind sent alongside the address would be a second claim about one
 * file, and the window would have no way to tell which of the two was lying.
 */
export function DesktopMediaPreviewWindow(props: { store: DesktopMediaPreviewStore }) {
    const preview = useSyncExternalStore(props.store.subscribe, props.store.get);
    const content = preview
        ? ({ type: "url", url: preview.url } as const)
        : ({ type: "loading" } as const);
    const name = preview ? preview.path.slice(preview.path.lastIndexOf("/") + 1) : "the file";
    return preview && filePreviewKind(preview.path) === "video" ? (
        <VideoViewer autoFocus content={content} name={name} />
    ) : (
        <ImageViewer autoFocus content={content} name={name} />
    );
}

/**
 * Closes the preview window on Escape or the close chord, from anywhere in it.
 *
 * The listener is on the document rather than on a React subtree because the
 * window is one file: wherever focus happens to be — the frame, a control, or
 * nothing at all — either key means the same thing. It lives as long as the window
 * does, which is why nothing here removes it.
 */
export function desktopMediaPreviewEscapeBind(bridge: HappyMediaPreviewBridge): void {
    document.addEventListener("keydown", (event) => {
        if (event.defaultPrevented) return;
        if (event.key !== "Escape" && !commandShortcutMatches(event, CLOSE_SHORTCUT)) return;
        event.preventDefault();
        void bridge.mediaPreviewClose().catch(() => undefined);
    });
}
