import { createContext, useContext } from "react";
import type { HappyAgentFileLink } from "happy-desktop-state";
import { ContextMenu, type ContextMenuProps } from "./ContextMenu";

/**
 * What Copy link writes for a destination: the application supplies it where a
 * link leaving the app needs another form, such as a Happy link written as the
 * share link that names the server it belongs to. `undefined` means the
 * destination has no form that leaves the app, and nothing is offered to copy.
 * Absent, the destination is copied as it is.
 */
export const LinkCopyContext = createContext<(href: string) => string | undefined>((href) => href);

/**
 * Shows the file a link names selected in the machine's file manager: a path
 * in the surface's own workspace (relative, or absolute anywhere on the
 * machine), or a `happy://` / `happy-file://` file link into another folder.
 * Absent where no host can reveal files, and file links offer only Copy link.
 */
export interface FileReveal {
    readonly path: (path: string) => void;
    readonly link: (link: HappyAgentFileLink) => void;
}
export const FileRevealContext = createContext<FileReveal | undefined>(undefined);

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
