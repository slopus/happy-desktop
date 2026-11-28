import { happyCloudInviteLinkParse, happyShareLinkParse } from "happy-desktop-state";

/**
 * Sends every click on a link.happy.page share link in `root` to `receive`
 * instead of the browser or a browser tab: a share link carries a Happy
 * instance link, which opens in the app on that instance. This is the one
 * door every anchor in the window passes through, a message's or an
 * artifact's alike. With `invites`, a Happy Cloud invite link is taken the
 * same way, so an invitation pressed inside the app is shown by the app and
 * never leaves for the browser. Returns the way to stop.
 */
export function happyShareLinkClicksRoute(
    root: Document,
    receive: (url: string) => void,
    options: { readonly invites?: boolean } = {},
): () => void {
    const click = (event: MouseEvent): void => {
        if (event.defaultPrevented) return;
        if (event.button !== (event.type === "auxclick" ? 1 : 0)) return;
        const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
        const href = anchor?.getAttribute("href");
        if (!href) return;
        const taken =
            happyShareLinkParse(href) !== undefined ||
            (options.invites === true && happyCloudInviteLinkParse(href) !== undefined);
        if (!taken) return;
        event.preventDefault();
        event.stopPropagation();
        receive(href);
    };
    root.addEventListener("click", click, true);
    root.addEventListener("auxclick", click, true);
    return () => {
        root.removeEventListener("click", click, true);
        root.removeEventListener("auxclick", click, true);
    };
}
