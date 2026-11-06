import { createContext, useContext } from "react";
import { ContextMenu, type ContextMenuProps } from "./ContextMenu";

/**
 * What Copy link writes for a destination: the application supplies it where a
 * link leaving the app needs another form, such as a Happy link written as the
 * share link that names the server it belongs to. `undefined` means the
 * destination has no form that leaves the app, and nothing is offered to copy.
 * Absent, the destination is copied as it is.
 */
export const LinkCopyContext = createContext<(href: string) => string | undefined>((href) => href);

export interface LinkContextMenuProps extends Omit<ContextMenuProps, "items" | "onSelect"> {
    /** The destination carried by the link, including any custom scheme or file fragment. */
    readonly href: string;
    readonly items?: ContextMenuProps["items"];
    readonly onSelect?: ContextMenuProps["onSelect"];
}

/** A link's optional open actions followed by its clipboard action, when it has one. */
export function LinkContextMenu({ href, items = [], onSelect, ...props }: LinkContextMenuProps) {
    const copied = useContext(LinkCopyContext)(href);
    if (copied === undefined && items.length === 0) return null;
    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
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
                ...(copied === undefined
                    ? []
                    : [
                          ...(items.length > 0 ? [{ kind: "separator" } as const] : []),
                          {
                              kind: "item",
                              id: "copy-link",
                              label: "Copy link",
                              icon: "copy",
                          } as const,
                      ]),
            ]}
            onSelect={(id) => {
                if (id === "copy-link" && copied !== undefined) {
                    void copy(copied);
                    return;
                }
                onSelect?.(id);
            }}
        />
    );
}
