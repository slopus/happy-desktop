import type { MenuItem } from "./Menu";
import { MenuButton } from "./MenuButton";

/** One application a file can be handed to, with its own artwork when it has some. */
export type FileOpenInTarget = {
    readonly id: string;
    readonly label: string;
    readonly iconUrl?: string;
};

export type FileOpenInMenuProps = {
    /** Editors and IDEs, in the order the host lists them. */
    targets: readonly FileOpenInTarget[];
    /** Finder's own artwork for the Show in Finder row. */
    revealIconUrl?: string;
    onReveal: () => void;
    /**
     * Hands the file to whatever application the reader's system opens it with.
     * Absent where the file's type might run rather than open, so the row is
     * missing rather than offered and refused.
     */
    onDefaultAppOpen?: () => void;
    onTargetOpen: (id: string) => void;
    /**
     * Why nothing can be opened right now — the Happy Agent is offline, the file
     * was deleted, the app needs updating. The menu still opens and says so as
     * its heading, with every row disabled.
     */
    unavailableReason?: string;
    className?: string;
    "data-testid"?: string;
};

const REVEAL_ID = "reveal";
const DEFAULT_APP_ID = "default-app";
const TARGET_PREFIX = "app:";

/** The rows the menu opens onto, for a caller that draws them without the trigger. */
export function fileOpenInMenuItems(props: FileOpenInMenuProps): MenuItem[] {
    const disabled = props.unavailableReason !== undefined;
    return [
        {
            kind: "item",
            id: REVEAL_ID,
            label: "Show in Finder",
            ...(props.revealIconUrl === undefined
                ? { icon: "files" as const }
                : { iconUrl: props.revealIconUrl }),
            disabled,
        },
        ...(props.onDefaultAppOpen === undefined
            ? []
            : [
                  {
                      kind: "item" as const,
                      id: DEFAULT_APP_ID,
                      label: "Open in default app",
                      icon: "open-external" as const,
                      disabled,
                  },
              ]),
        ...(props.targets.length > 0 ? [{ kind: "separator" as const }] : []),
        ...props.targets.map((target) => ({
            kind: "item" as const,
            id: `${TARGET_PREFIX}${target.id}`,
            label: target.label,
            ...(target.iconUrl === undefined
                ? { icon: "code" as const }
                : { iconUrl: target.iconUrl }),
            disabled,
        })),
    ];
}

/**
 * C-306 FileOpenInMenu — the file header's "Open in" action. A compact icon
 * trigger beside Download opens the same rows the project's Open in menu
 * shows: Show in Finder, the file's default application, then each installed
 * editor with its own icon. It is hung off the window overlay so a narrow side
 * panel never clips it. It owns nothing but whether it is open: no remembered
 * application, so opening a file never changes what the project control wears.
 */
export function FileOpenInMenu(props: FileOpenInMenuProps) {
    const disabled = props.unavailableReason !== undefined;
    const items = fileOpenInMenuItems(props);
    return (
        <MenuButton
            align="end"
            className={props.className}
            data-testid={props["data-testid"]}
            icon="open-external"
            items={items}
            label="Open in"
            menuLabel={props.unavailableReason ?? "Open in"}
            menuWidth={240}
            onSelect={(id) => {
                if (disabled) return;
                if (id === REVEAL_ID) props.onReveal();
                else if (id === DEFAULT_APP_ID) props.onDefaultAppOpen?.();
                else if (id.startsWith(TARGET_PREFIX))
                    props.onTargetOpen(id.slice(TARGET_PREFIX.length));
            }}
            overlay
        />
    );
}
