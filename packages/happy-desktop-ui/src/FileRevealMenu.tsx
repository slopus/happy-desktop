import { useContext, useState, type MouseEvent, type ReactNode } from "react";
import { ContextMenu } from "./ContextMenu";
import { FileRevealContext } from "./LinkContextMenu";

const REVEAL = "reveal";
const PATH_COPY = "path-copy";

/**
 * The context menu a file's name carries wherever it is drawn as a heading:
 * show it in Finder, or copy its path. The path is relative to the workspace
 * the nearest `FileRevealContext` reveals into, or absolute. Without a host
 * that can reveal files the name has no menu of its own.
 */
export function useFileRevealMenu(path: string | undefined): {
    readonly onContextMenu: ((event: MouseEvent<HTMLElement>) => void) | undefined;
    readonly menu: ReactNode;
} {
    const reveal = useContext(FileRevealContext);
    // Where the pointer asked for the menu, while it is up.
    const [menuAt, setMenuAt] = useState<{ x: number; y: number }>();
    if (reveal === undefined || path === undefined || path.trim().length === 0)
        return { onContextMenu: undefined, menu: null };
    return {
        onContextMenu: (event) => {
            event.preventDefault();
            event.stopPropagation();
            setMenuAt({ x: event.clientX, y: event.clientY });
        },
        menu:
            menuAt === undefined ? null : (
                <ContextMenu
                    data-testid="file-reveal-menu"
                    items={[
                        { kind: "item", id: REVEAL, label: "Show in Finder", icon: "folder-open" },
                        { kind: "item", id: PATH_COPY, label: "Copy path", icon: "copy" },
                    ]}
                    onClose={() => setMenuAt(undefined)}
                    onSelect={(id) => {
                        setMenuAt(undefined);
                        if (id === REVEAL) reveal.path(path);
                        else if (id === PATH_COPY)
                            void navigator.clipboard.writeText(path).catch(() => undefined);
                    }}
                    x={menuAt.x}
                    y={menuAt.y}
                />
            ),
    };
}
