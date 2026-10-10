import type { CSSProperties } from "react";
import { Avatar } from "./Avatar";
import { AvatarBrutalist } from "./AvatarBrutalist";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";

/** One task the reader can see, as the browse list states it. */
export type HappyAgentTaskBrowseEntry = {
    id: string;
    name: string;
    /**
     * The team member who owns it. Absent where every task is the reader's own
     * — a standalone Happy Agent — and the row then shows no face and no name.
     */
    owner?: {
        /** The owner's name; absent when nobody was identified. */
        name?: string;
        /** The owner's photo. Without one the owner's initials stand in. */
        imageUrl?: string;
    };
    /** Whether the reader is already a member, which offers Open instead of Join. */
    joined: boolean;
    /** True while a join this window asked for has not been answered. */
    joining?: boolean;
};

export type HappyAgentTaskBrowseDialogProps = {
    tasks: readonly HappyAgentTaskBrowseEntry[];
    /** Why the last join failed, in the Happy Agent's own words. */
    error?: string;
    /** Why this Happy Agent cannot currently accept a join. */
    joinDisabledReason?: string;
    onJoin: (id: string) => void;
    onOpen: (id: string) => void;
    onClose: () => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

/** Up to two initials from a person's name, for a face with no photo. */
function ownerInitials(name: string): string {
    const words = name
        .trim()
        .split(/\s+/u)
        .filter((word) => word.length > 0);
    return words
        .slice(0, 2)
        .map((word) => word.slice(0, 1).toUpperCase())
        .join("");
}

/**
 * C-286 HappyAgentTaskBrowseDialog — every active task on one Happy Agent, to
 * join one or open one already joined.
 *
 * In a team a row is the task's owner and the task's name: the owner's photo,
 * their initials without one, and the generated mark when nobody was
 * identified, the same face the task wears in the sidebar once joined. Where
 * every task is the reader's own there is no owner to show, and a row is the
 * name alone. The caller owns the list, the in-flight joins, and the failure,
 * so every state renders from props alone.
 */
export function HappyAgentTaskBrowseDialog(props: HappyAgentTaskBrowseDialogProps) {
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                className={props.className}
                data-testid={props["data-testid"]}
                footer={
                    <Button onClick={props.onClose} variant="ghost">
                        Done
                    </Button>
                }
                icon="tasks"
                onClose={props.onClose}
                size="medium"
                style={props.style}
                title="Browse tasks"
            >
                <div
                    className="happy-agent-task-browse-dialog"
                    data-happy-desktop-ui="happy-agent-task-browse-dialog"
                >
                    {props.joinDisabledReason ? (
                        <Banner tone="neutral" title="Happy Agent unavailable">
                            {props.joinDisabledReason}
                        </Banner>
                    ) : null}
                    {props.error ? (
                        <Banner tone="danger" title="Couldn’t join task">
                            {props.error}
                        </Banner>
                    ) : null}
                    {props.tasks.length === 0 ? (
                        <p
                            className="happy-agent-task-browse-dialog__empty"
                            data-happy-desktop-ui="happy-agent-task-browse-dialog-empty"
                        >
                            No active tasks on this Happy Agent yet.
                        </p>
                    ) : (
                        <ul
                            aria-label="Tasks"
                            className="happy-agent-task-browse-dialog__list"
                            data-happy-desktop-ui="happy-agent-task-browse-dialog-list"
                        >
                            {props.tasks.map((task) => (
                                <li
                                    className="happy-agent-task-browse-dialog__row"
                                    data-happy-desktop-ui="happy-agent-task-browse-dialog-row"
                                    key={task.id}
                                >
                                    {task.owner === undefined ? null : task.owner.imageUrl ===
                                          undefined && task.owner.name === undefined ? (
                                        <AvatarBrutalist id={task.id} size={28} />
                                    ) : (
                                        <Avatar
                                            imageUrl={task.owner.imageUrl}
                                            initials={ownerInitials(task.owner.name ?? "")}
                                            size="sm"
                                        />
                                    )}
                                    <span className="happy-agent-task-browse-dialog__text">
                                        <span className="happy-agent-task-browse-dialog__name">
                                            {task.name}
                                        </span>
                                        {task.owner?.name ? (
                                            <span className="happy-agent-task-browse-dialog__owner">
                                                {task.owner.name}
                                            </span>
                                        ) : null}
                                    </span>
                                    {task.joined ? (
                                        <Button
                                            aria-label={`Open ${task.name}`}
                                            onClick={() => props.onOpen(task.id)}
                                            size="small"
                                            variant="secondary"
                                        >
                                            Open
                                        </Button>
                                    ) : (
                                        <Button
                                            aria-label={`Join ${task.name}`}
                                            disabled={props.joinDisabledReason !== undefined}
                                            loading={task.joining === true}
                                            onClick={() => props.onJoin(task.id)}
                                            size="small"
                                            title={props.joinDisabledReason}
                                            variant="primary"
                                        >
                                            Join
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </Modal>
        </ModalOverlay>
    );
}
