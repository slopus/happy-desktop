import { createContext, useContext } from "react";
import { ContextMenu, type ContextMenuProps } from "./ContextMenu";

/**
 * What Copy link writes for a destination: the application supplies it where a
 * link leaving the app needs another form, such as a Happy link that names the
 * server it belongs to. Absent, the destination is copied as it is.
 */
export const LinkCopyContext = createContext<(href: string) => string>((href) => href);

export interface LinkContextMenuProps extends Omit<ContextMenuProps, "items" | "onSelect"> {
    /** The destination carried by the link, including any custom scheme or file fragment. */
    readonly href: string;
    readonly items?: ContextMenuProps["items"];
    readonly onSelect?: ContextMenuProps["onSelect"];
}

/** A link's optional open actions followed by its clipboard action. */
export function LinkContextMenu({ href, items = [], onSelect, ...props }: LinkContextMenuProps) {
    const copied = useContext(LinkCopyContext);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(copied(href));
            props.onClose();
        } catch {
            // Clipboard permission belongs to the browser; leave the menu open to retry.
        }
    };
    return (
        <ContextMenu
            {...props}
            items={[
                ...items,
                ...(items.length > 0 ? [{ kind: "separator" } as const] : []),
                { kind: "item", id: "copy-link", label: "Copy link", icon: "copy" },
            ]}
            onSelect={(id) => {
                if (id === "copy-link") {
                    void copy();
                    return;
                }
                onSelect?.(id);
            }}
        />
    );
}
