import {
    useCallback,
    useContext,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react";
import { Avatar } from "./Avatar";
import { fixedBlockMeasure } from "./fixedBlock";
import { WindowOverlay, WindowOverlayHostContext } from "./WindowOverlay";

/** One place a repository is checked out: the branch, and the computer it is on when known. */
export interface RepositoryStackCheckout {
    readonly id: string;
    readonly branch: string;
    readonly computer?: string;
}

/** One repository a task works in. */
export interface RepositoryStackEntry {
    /** Its stable id: keys the tile and picks its placeholder when it has no photo. */
    readonly id: string;
    readonly name: string;
    /** Its photo, drawn covering a square; absent wears the placeholder its id picks. */
    readonly imageUrl?: string;
    /** Where it is checked out, in order; the list says them under its name. */
    readonly checkouts?: readonly RepositoryStackCheckout[];
}

export interface RepositoryStackProps {
    /** In the order the task took them up; the first is drawn in front. */
    readonly repositories: readonly RepositoryStackEntry[];
    readonly className?: string;
    readonly "data-testid"?: string;
    /** Holds the pile fanned and its list open without hover or focus, so a fixture can show it. */
    readonly listOpen?: boolean;
}

/** How long the pointer rests on the pile before the list opens. */
const LIST_DELAY = 350;
/** How far the list sits from the pile. */
const LIST_GAP = 6;
/** Below this much room under the pile, the list opens above it instead. */
const LIST_ROOM = 240;

function labelOf(repositories: readonly RepositoryStackEntry[]): string {
    if (repositories.length === 1) return `Repository: ${repositories[0]!.name}`;
    return `${String(repositories.length)} repositories: ${repositories.map((entry) => entry.name).join(", ")}`;
}

function checkoutText(checkout: RepositoryStackCheckout): string {
    return checkout.computer === undefined
        ? checkout.branch
        : `${checkout.branch} · ${checkout.computer}`;
}

function face(entry: RepositoryStackEntry, className: string) {
    return (
        <Avatar
            className={className}
            imageUrl={entry.imageUrl}
            initials={entry.name.slice(0, 1).toUpperCase()}
            {...(entry.imageUrl ? {} : { placeholderSeed: entry.id })}
            size="xs"
            type="agent"
        />
    );
}

/**
 * C-354 RepositoryStack — the repositories a task works in, in its sidebar
 * row's identity lane.
 *
 * A task scoped to one repository wears that repository's photo. A task in two
 * wears both piled, the first in front. A task in more wears the first photo
 * with a `+N` pill on its corner counting the rest, so the row still says how
 * many there are at a glance. Resting on a pile fans it apart and hangs a list beside it
 * naming every repository with its photo and where it is checked out, so they
 * can be skimmed without opening anything.
 *
 * The pile is exactly the row's 20px lane whatever it holds, so the names down
 * the column stay where they are, and nothing is drawn in the lane's corners,
 * where the row's unread dot and folded count go. The fan is a transform and
 * the list an overlay hung off the window, so neither lays anything out, and a
 * list inside a clipped sidebar is never cut off by it.
 */
export function RepositoryStack(props: RepositoryStackProps) {
    const [list, setList] = useState<{ x: number; y: number; above: boolean } | undefined>();
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const overlayHost = useContext(WindowOverlayHostContext);
    const repositories = props.repositories;
    const several = repositories.length > 1;
    const listSoon = (element: HTMLElement) => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const box = element.getBoundingClientRect();
            const view = element.ownerDocument.defaultView;
            const above = view !== null && view.innerHeight - box.bottom < LIST_ROOM;
            // The pile is measured against the window; the list is laid out
            // against whatever contains the place it is drawn in.
            const block = fixedBlockMeasure(overlayHost ?? element);
            setList({
                x: box.left - block.left,
                y: (above ? box.top - LIST_GAP : box.bottom + LIST_GAP) - block.top,
                above,
            });
        }, LIST_DELAY);
    };
    const listClose = () => {
        clearTimeout(timer.current);
        setList(undefined);
    };
    // A pile scrolled away or unmounted under the pointer leaves no timer behind.
    const timerRelease = useCallback(() => () => clearTimeout(timer.current), []);
    if (repositories.length === 0) return null;
    const rows = (
        <span className="happy-repository-stack__rows" role="list">
            {repositories.map((entry) => (
                <span
                    className="happy-repository-stack__row"
                    data-happy-desktop-ui="repository-stack-row"
                    key={entry.id}
                    role="listitem"
                >
                    {face(entry, "happy-repository-stack__row-photo")}
                    <span className="happy-repository-stack__text">
                        <span className="happy-repository-stack__name">{entry.name}</span>
                        {entry.checkouts?.length ? (
                            <span className="happy-repository-stack__where">
                                {entry.checkouts.map(checkoutText).join(", ")}
                            </span>
                        ) : null}
                    </span>
                </span>
            ))}
        </span>
    );
    const listPane =
        props.listOpen === true ? (
            // A fixture's list hangs from the pile itself, where nothing measures.
            <span
                className="happy-repository-stack__list"
                data-happy-desktop-ui="repository-stack-list"
                data-pinned=""
            >
                {rows}
            </span>
        ) : list === undefined ? null : (
            <WindowOverlay>
                <span
                    className="happy-repository-stack__list"
                    data-above={list.above ? "" : undefined}
                    data-happy-desktop-ui="repository-stack-list"
                    role="tooltip"
                    style={{ left: list.x, top: list.y }}
                >
                    {rows}
                </span>
            </WindowOverlay>
        );
    // Two are both drawn; past two, the first is drawn with a count of the rest.
    const more = repositories.length > 2 ? repositories.length - 1 : 0;
    const front = repositories[0]!;
    const back = repositories[1];
    const tile = (slot: 0 | 1, content: ReactNode, key: string) => (
        <span
            className="happy-repository-stack__tile"
            key={key}
            style={
                {
                    // The first is in front, at the bottom-left of the pile.
                    "--happy-repository-depth": 2 - slot,
                    "--happy-repository-slot": slot,
                } as CSSProperties
            }
        >
            {content}
        </span>
    );
    return (
        <span
            aria-label={labelOf(repositories)}
            className={["happy-repository-stack", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="repository-stack"
            data-open={props.listOpen === true || list !== undefined ? "" : undefined}
            data-pile={several ? "" : undefined}
            data-testid={props["data-testid"]}
            // One repository is the whole story; its name is all a list would add.
            onBlur={several ? listClose : undefined}
            onFocus={several ? (event) => listSoon(event.currentTarget) : undefined}
            onPointerEnter={several ? (event) => listSoon(event.currentTarget) : undefined}
            onPointerLeave={several ? listClose : undefined}
            ref={timerRelease}
            role="img"
        >
            {!several ? (
                <span className="happy-repository-stack__single">
                    {face(front, "happy-repository-stack__photo")}
                </span>
            ) : more > 0 ? (
                <>
                    <span className="happy-repository-stack__lead">
                        {face(front, "happy-repository-stack__photo")}
                    </span>
                    <span
                        aria-hidden="true"
                        className="happy-repository-stack__more"
                        data-happy-desktop-ui="repository-stack-more"
                    >
                        +{String(more)}
                    </span>
                </>
            ) : (
                <>
                    {tile(0, face(front, "happy-repository-stack__photo"), front.id)}
                    {tile(1, face(back!, "happy-repository-stack__photo"), back!.id)}
                </>
            )}
            {listPane}
        </span>
    );
}
