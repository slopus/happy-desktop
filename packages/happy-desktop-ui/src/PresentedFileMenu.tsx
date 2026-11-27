import {
    createContext,
    useContext,
    useRef,
    useState,
    type MouseEvent,
    type ReactNode,
} from "react";
import { ContextMenu } from "./ContextMenu";
import { fileRevealMenuItems, fileRevealMenuSelect } from "./FileRevealMenu";
import { FileRevealContext } from "./LinkContextMenu";
import type { MenuItem } from "./Menu";

/** One application a file may be opened in, as Finder's Open With lists it. */
export interface FileOpenApplication {
    /** The host's own id for it, only ever handed back to `FileOpen.open`. */
    readonly id: string;
    readonly name: string;
    /** Whether it is the application a double-click opens the file in. */
    readonly isDefault: boolean;
}

/**
 * Opens a file a chat was shown in an application this machine offers for it,
 * as Finder's Open With does. Absent where no host can: another machine's
 * agent, or a host that is not a Mac.
 */
export interface FileOpen {
    /**
     * The applications offered for the file, the default first; none when the
     * host does not open it: a kind that runs something, a folder, an
     * executable, or a file not on this machine. Never rejects.
     */
    readonly applicationsRead: (path: string) => Promise<readonly FileOpenApplication[]>;
    readonly open: (path: string, applicationId: string) => void;
}
export const FileOpenContext = createContext<FileOpen | undefined>(undefined);

/** The prefix of an Open with row's id; the rest is its place in the list. */
const OPEN_WITH = "open-with:";
/**
 * How long a right-click waits for the applications before its menu opens
 * without them. The menu is placed once, when it opens, so its rows never
 * change while it is up; the list is asked for when the pointer reaches the
 * file and kept per kind of file, so it is almost always already there.
 */
const APPLICATIONS_WAIT_MS = 150;

function openWithItems(applications: readonly FileOpenApplication[]): MenuItem[] {
    if (applications.length === 0) return [];
    return [
        { kind: "label", label: "Open with" },
        ...applications.map(
            (application, index): MenuItem => ({
                kind: "item",
                id: `${OPEN_WITH}${String(index)}`,
                label: application.name,
                ...(application.isDefault ? { detail: "default" } : {}),
            }),
        ),
    ];
}

interface PresentedFileMenuAt {
    readonly x: number;
    readonly y: number;
    readonly path: string | undefined;
    readonly leading: readonly MenuItem[];
    readonly onLeading: ((id: string) => void) | undefined;
    readonly applications: readonly FileOpenApplication[];
}

/**
 * The menu of a file an agent put in front of the reader, a card, a picture,
 * a recording, or the line naming it: the caller's own rows (Open, as a click
 * does), then Open with and the applications this machine offers for the
 * file, then Show in Finder and Copy path. A file the item did not keep the
 * source of has only the caller's rows.
 */
export function usePresentedFileMenu(): {
    readonly ask: (
        event: MouseEvent<HTMLElement>,
        path: string | undefined,
        leading: readonly MenuItem[],
        onLeading?: (id: string) => void,
    ) => void;
    /** Asks for a file's applications ahead of its menu, as the pointer reaches it. */
    readonly warm: (path: string | undefined) => void;
    readonly menu: ReactNode;
} {
    const reveal = useContext(FileRevealContext);
    const opener = useContext(FileOpenContext);
    const [menuAt, setMenuAt] = useState<PresentedFileMenuAt>();
    // The latest ask; an earlier one answered late does not open its menu.
    const asked = useRef(0);
    const items = (at: PresentedFileMenuAt): MenuItem[] => {
        const openWith = openWithItems(at.applications);
        const blocks = [
            at.leading,
            openWith,
            at.path === undefined ? [] : fileRevealMenuItems(reveal),
        ].filter((block) => block.length > 0);
        return blocks.flatMap((block, index) =>
            index === 0 ? [...block] : [{ kind: "separator" } as const, ...block],
        );
    };
    return {
        ask: (event, path, leading, onLeading) => {
            event.preventDefault();
            event.stopPropagation();
            const ask = (asked.current += 1);
            const at = { x: event.clientX, y: event.clientY, path, leading, onLeading };
            if (path === undefined || opener === undefined) {
                setMenuAt({ ...at, applications: [] });
                return;
            }
            void Promise.race([
                opener.applicationsRead(path),
                new Promise<readonly FileOpenApplication[]>((resolve) =>
                    setTimeout(() => resolve([]), APPLICATIONS_WAIT_MS),
                ),
            ]).then((applications) => {
                if (ask === asked.current) setMenuAt({ ...at, applications });
            });
        },
        warm: (path) => {
            if (path !== undefined) void opener?.applicationsRead(path);
        },
        menu:
            menuAt === undefined ? null : (
                <ContextMenu
                    data-testid="presented-file-menu"
                    items={items(menuAt)}
                    onClose={() => setMenuAt(undefined)}
                    onSelect={(id) => {
                        setMenuAt(undefined);
                        if (menuAt.leading.some((item) => item.kind === "item" && item.id === id))
                            menuAt.onLeading?.(id);
                        else if (menuAt.path === undefined) return;
                        else if (id.startsWith(OPEN_WITH)) {
                            const application =
                                menuAt.applications[Number(id.slice(OPEN_WITH.length))];
                            if (application) opener?.open(menuAt.path, application.id);
                        } else fileRevealMenuSelect(reveal, menuAt.path, id);
                    }}
                    x={menuAt.x}
                    y={menuAt.y}
                />
            ),
    };
}
