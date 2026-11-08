import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
    BrowserGuestFrame,
    type BrowserContentProps,
    type BrowserGuestOwner,
} from "happy-desktop-ui";
import { DesktopBrowserGuest } from "./desktopBrowserView";

type Entry = {
    root: Root;
    container: HTMLDivElement;
    host: HTMLElement;
    props: BrowserContentProps;
    slot?: HTMLDivElement;
    observeDispose?: () => void;
    displayLease: number;
    closed?: boolean;
};
type Owner = { entries: Map<string, Entry>; unsubscribe: () => void };

/**
 * The native adapter owns one subscription per panel owner, not per tab. The
 * authoritative list closes guests; React mounts merely borrow a display slot.
 * A guest's root never changes parent, which would destroy Electron's webview.
 */
export class DesktopBrowserGuests {
    private readonly owners = new Map<BrowserGuestOwner, Owner>();

    attach(
        slot: HTMLDivElement,
        props: BrowserContentProps,
        host = slot.ownerDocument.body,
    ): () => void {
        const retention = props.retention;
        if (!retention) return () => undefined;
        if (!retention.owner.get().browserTabs.some((tab) => tab.id === retention.id))
            return () => undefined;
        let owner = this.owners.get(retention.owner);
        if (!owner) {
            owner = { entries: new Map(), unsubscribe: () => undefined };
            this.owners.set(retention.owner, owner);
            owner.unsubscribe = retention.owner.subscribe(() => this.reconcile(retention.owner));
        }
        let entry = owner.entries.get(retention.id);
        if (!entry) {
            const container = slot.ownerDocument.createElement("div");
            container.dataset.happyRetainedBrowser = retention.id;
            host.append(container);
            entry = { container, host, root: createRoot(container), props, displayLease: 0 };
            owner.entries.set(retention.id, entry);
        }
        entry.observeDispose?.();
        entry.props = props;
        entry.slot = slot;
        entry.displayLease += 1;
        const current = entry;
        const render = () => this.render(current);
        const resize = new ResizeObserver(render);
        resize.observe(slot);
        resize.observe(host);
        const mutation = new MutationObserver(render);
        for (let ancestor: HTMLElement | null = slot; ancestor; ancestor = ancestor.parentElement)
            mutation.observe(ancestor, {
                attributes: true,
                attributeFilter: ["class", "style", "hidden", "inert"],
            });
        const window = slot.ownerDocument.defaultView!;
        window.addEventListener("resize", render);
        window.addEventListener("scroll", render, true);
        current.observeDispose = () => {
            resize.disconnect();
            mutation.disconnect();
            window.removeEventListener("resize", render);
            window.removeEventListener("scroll", render, true);
        };
        this.render(current);
        return () => {
            if (current.slot !== slot) return;
            current.observeDispose?.();
            current.observeDispose = undefined;
            current.slot = undefined;
            this.render(current);
        };
    }

    update(props: BrowserContentProps): void {
        const retention = props.retention;
        const entry = retention && this.owners.get(retention.owner)?.entries.get(retention.id);
        if (!entry) return;
        entry.props = props;
        this.render(entry);
    }

    private reconcile(source: BrowserGuestOwner): void {
        const owner = this.owners.get(source);
        if (!owner) return;
        const tabs = source.get().browserTabs;
        for (const [id, entry] of owner.entries) {
            const tab = tabs.find((tab) => tab.id === id);
            if (!tab) {
                entry.closed = true;
                entry.observeDispose?.();
                // Store actions can fire during React's commit; dispose after it.
                queueMicrotask(() => {
                    entry.root.unmount();
                    entry.container.remove();
                });
                owner.entries.delete(id);
            } else if (
                entry.props.target?.artifactId === undefined &&
                entry.props.target &&
                entry.props.target.networkId !== tab.networkId
            ) {
                entry.props = {
                    ...entry.props,
                    target: { ...entry.props.target, networkId: tab.networkId },
                };
                this.render(entry);
            }
        }
        if (owner.entries.size === 0) {
            owner.unsubscribe();
            this.owners.delete(source);
        }
    }

    private render(entry: Entry): void {
        if (entry.closed) return;
        const slot = entry.slot;
        const rect = slot?.getBoundingClientRect();
        const shown =
            entry.props.visible !== false &&
            slot?.isConnected &&
            !slot.closest("[hidden], [inert]") &&
            slot.getClientRects().length > 0 &&
            rect &&
            rect.width > 0 &&
            rect.height > 0;
        // ConnectionSurface establishes the containing block and stacking
        // context. Keeping guests inside it lets its modal lane cover them.
        const origin =
            entry.host === entry.container.ownerDocument.body
                ? { x: 0, y: 0 }
                : entry.host.getBoundingClientRect();
        const bounds = shown
            ? { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height }
            : undefined;
        if (!shown) {
            const focused = entry.container.ownerDocument.activeElement;
            if (focused instanceof HTMLElement && entry.container.contains(focused)) focused.blur();
        }
        // Hide synchronously on lease release: the next React root commit can
        // be deferred, but the old native page must stop receiving input now.
        entry.container.hidden = !shown;
        entry.root.render(
            createElement(BrowserGuestFrame, {
                bounds,
                children: createElement(DesktopBrowserGuest, {
                    ...entry.props,
                    displayLease: entry.displayLease,
                }),
            }),
        );
    }
}

export const desktopBrowserGuests = new DesktopBrowserGuests();
