import { Banner } from "./Banner";
import { CommandPalette } from "./CommandPalette";
import { CommandPaletteResults } from "./CommandPaletteResults";
import { ModalOverlay } from "./ModalOverlay";

export interface ChatProjectPickerProps {
    readonly projects: readonly {
        readonly id: string;
        readonly title: string;
        readonly detail: string;
    }[];
    readonly query: string;
    readonly activeIndex: number;
    readonly busy?: boolean;
    readonly error?: string;
    readonly autoFocus?: boolean;
    readonly onQueryChange: (query: string) => void;
    readonly onActiveIndexChange: (index: number) => void;
    readonly onSelect: (id: string) => void;
    readonly onClose: () => void;
}

/** The same searchable, keyboard-driven picker as the window's command palette. */
export function ChatProjectPicker(props: ChatProjectPickerProps) {
    const index = Math.min(props.activeIndex, Math.max(0, props.projects.length - 1));
    const select = (id: string) => {
        if (!props.busy) props.onSelect(id);
    };
    return (
        <ModalOverlay onDismiss={props.busy ? undefined : props.onClose} placement="top">
            <CommandPalette
                autoFocus={props.autoFocus}
                onClose={() => {
                    if (!props.busy) props.onClose();
                }}
                onQueryChange={props.onQueryChange}
                onSelectionMove={(direction) => {
                    if (props.projects.length > 0 && !props.busy)
                        props.onActiveIndexChange(
                            (index + direction + props.projects.length) % props.projects.length,
                        );
                }}
                onSelectionCommit={() => {
                    const project = props.projects[index];
                    if (project) select(project.id);
                }}
                placeholder="New chat beside · choose a project…"
                query={props.query}
            >
                {props.error ? (
                    <Banner title="Could not create chat" tone="warning">
                        {props.error}
                    </Banner>
                ) : null}
                <CommandPaletteResults
                    activeIndex={index}
                    label="Projects for new chat"
                    emptyLabel="No available projects"
                    emptyDescription="Try another search, or connect a machine with a ready project."
                    onActiveIndexChange={props.onActiveIndexChange}
                    onSelect={select}
                    sections={[
                        {
                            id: "projects",
                            caption: props.busy
                                ? "Creating chat…"
                                : "Open a new chat alongside your work",
                            rows: props.projects.map((project) => ({
                                kind: "command",
                                id: project.id,
                                title: project.title,
                                meta: project.detail,
                                icon: "inbox",
                            })),
                        },
                    ]}
                />
            </CommandPalette>
        </ModalOverlay>
    );
}
