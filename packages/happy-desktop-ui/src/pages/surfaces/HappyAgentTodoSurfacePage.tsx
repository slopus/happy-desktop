import type { CSSProperties, ReactNode } from "react";
import {
    happyAgentTodoHeading,
    type HappyAgentSurfaceActiveTodo,
    type HappyAgentSurfaceCompletedTodo,
    type HappyAgentSurfaceTodoId,
    type HappyAgentTodoListSnapshot,
} from "happy-desktop-state";
import { Icon } from "../../Icon";
import { ReorderingList } from "../../ReorderingList";
import { ScrollArea } from "../../Scrollbar";
import { TextField } from "../../TextField";
import {
    HappyAgentSurfaceHeader,
    type HappyAgentSurfaceChatToggle,
} from "./HappyAgentSurfaceHeader";
import { HappyAgentTodoRow } from "./HappyAgentTodoRow";
import type { HappyAgentSurfacePersonView, HappyAgentSurfaceView } from "./surfacePresentation";

/**
 * Who wrote a todo, as its row shows them. A todo that credits nobody shows no
 * face, and nor does one whose author has not been read yet, so a face never
 * changes from a placeholder to the person.
 */
function authorOf(
    list: HappyAgentTodoListSnapshot,
    todo: HappyAgentSurfaceActiveTodo | HappyAgentSurfaceCompletedTodo,
): { author?: HappyAgentSurfacePersonView } {
    const person = todo.authorUserId === null ? undefined : list.authors.get(todo.authorUserId);
    if (person === undefined) return {};
    return {
        author: {
            name: person.name ?? "Someone",
            ...(person.photo ? { photo: person.photo } : {}),
        },
    };
}

function headingOf(text: string): { heading?: string } {
    const heading = happyAgentTodoHeading(text);
    return heading === undefined ? {} : { heading };
}

/** Every todo row is this tall, which is what lets a drag place rows by slot. */
const ROW_HEIGHT = 40;
const ROW_GAP = 4;

export interface HappyAgentTodoSurfacePageProps {
    /** Who else is looking at the Surface, for its header; see `HappyAgentSurfaceHeader`. */
    viewers?: ReactNode;
    surface: HappyAgentSurfaceView;
    /** The list as its store holds it, with this window's own changes applied. */
    list: HappyAgentTodoListSnapshot;
    onDraftChange: (text: string) => void;
    onDraftSubmit: () => void;
    onTodoCompletedChange: (todoId: HappyAgentSurfaceTodoId, completed: boolean) => void;
    /** An active todo was dragged across a slot; called for every slot it crosses. */
    onTodoMove: (todoId: HappyAgentSurfaceTodoId, toIndex: number) => void;
    onTodoDelete: (todoId: HappyAgentSurfaceTodoId) => void;
    onTodoEditStart: (todoId: HappyAgentSurfaceTodoId) => void;
    onTodoEditTextChange: (text: string) => void;
    onTodoEditCommit: () => void;
    onTodoEditCancel: () => void;
    onCompletedShownChange: (shown: boolean) => void;
    /**
     * Makes the add field the window's place to type, as a chat's composer is:
     * the caret is in it when the list opens, and a character typed while no
     * other control wants it lands in it. Give it to the one list on screen.
     */
    focusOnType?: boolean;
    /** The Surface's shared chat, toggled from the header. */
    chat?: HappyAgentSurfaceChatToggle;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentTodoSurfacePage — one shared todo list: its header, a field that
 * adds to the top of the list, the active todos in the order everyone in the
 * list shares, and the completed ones folded away beneath them. The list is
 * one centred column of cards laid over the list's picture.
 *
 * It never stands in for the list with a loader or an error: it shows what is
 * held, every change applies at once, and the store carries changes to the
 * Happy Agent in the background, again until they arrive.
 *
 * Only an active todo can be dragged, and only among the active todos; a drag
 * is held inside that list, so it can never land among the completed ones or
 * on the controls below it. Completed todos are listed newest completion first
 * and never move. Checking a todo off fades it out of the active list, and
 * unchecking one puts it back at the end.
 */
export function HappyAgentTodoSurfacePage(props: HappyAgentTodoSurfacePageProps) {
    const list = props.list;
    const editing = list.editing;
    const row = (todo: HappyAgentSurfaceActiveTodo | HappyAgentSurfaceCompletedTodo) => (
        <HappyAgentTodoRow
            {...authorOf(list, todo)}
            {...headingOf(todo.text)}
            completed={todo.status === "completed"}
            editing={editing?.todoId === todo.id ? editing.text : undefined}
            onCompletedChange={(completed) => props.onTodoCompletedChange(todo.id, completed)}
            onDelete={() => props.onTodoDelete(todo.id)}
            onEditCancel={props.onTodoEditCancel}
            onEditCommit={props.onTodoEditCommit}
            onEditStart={() => props.onTodoEditStart(todo.id)}
            onEditTextChange={props.onTodoEditTextChange}
            text={todo.text}
        />
    );
    const completedCount = list.completed.length;
    const completed =
        completedCount === 0 ? null : (
            <div
                className="happy-agent-todo-surface__completed"
                data-happy-desktop-ui="happy-agent-todo-surface-completed"
            >
                <button
                    aria-expanded={list.completedShown}
                    className="happy-agent-todo-surface__completed-toggle"
                    data-testid="happy-agent-todo-completed-toggle"
                    onClick={() => props.onCompletedShownChange(!list.completedShown)}
                    type="button"
                >
                    <Icon name={list.completedShown ? "chevron-down" : "chevron-right"} size={14} />
                    {list.completedShown ? "Hide" : "Show"} {String(completedCount)} completed
                </button>
                {list.completedShown ? (
                    <ReorderingList
                        aria-label="Completed todos"
                        data-testid="happy-agent-todo-completed-list"
                        gap={ROW_GAP}
                        itemHeight={ROW_HEIGHT}
                        itemKey={(todo) => todo.id}
                        items={list.completed}
                        renderItem={row}
                    />
                ) : null}
            </div>
        );
    return (
        <div
            className={["happy-agent-todo-surface", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-todo-surface"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <HappyAgentSurfaceHeader
                viewers={props.viewers}
                {...(props.chat ? { chat: props.chat } : {})}
                surface={props.surface}
            />
            <ScrollArea
                className="happy-agent-todo-surface__scroll"
                data-happy-desktop-ui="happy-agent-todo-surface-scroll"
                viewportClassName="happy-agent-todo-surface__scroll-viewport"
            >
                <div className="happy-agent-todo-surface__content">
                    <TextField
                        aria-label="Add a todo"
                        className="happy-agent-todo-surface__add"
                        data-testid="happy-agent-todo-add"
                        {...(props.focusOnType
                            ? { focusKey: list.surfaceId, focusOnType: true }
                            : {})}
                        fullWidth
                        leadingIcon="plus"
                        onSubmit={props.onDraftSubmit}
                        onValueChange={props.onDraftChange}
                        placeholder="Add a todo"
                        size="large"
                        value={list.draft}
                    />
                    {list.status === "ready" && list.active.length === 0 && completedCount === 0 ? (
                        <p className="happy-agent-todo-surface__empty">
                            Nothing here yet. What needs doing?
                        </p>
                    ) : null}
                    <ReorderingList
                        aria-label="Todos"
                        className="happy-agent-todo-surface__list"
                        data-testid="happy-agent-todo-list"
                        footer={completed}
                        gap={ROW_GAP}
                        itemHeight={ROW_HEIGHT}
                        itemKey={(todo) => todo.id}
                        items={list.active}
                        onMove={(key, toIndex) => {
                            const todo = list.active.find((entry) => entry.id === key);
                            if (todo) props.onTodoMove(todo.id, toIndex);
                        }}
                        renderItem={row}
                    />
                </div>
            </ScrollArea>
        </div>
    );
}
