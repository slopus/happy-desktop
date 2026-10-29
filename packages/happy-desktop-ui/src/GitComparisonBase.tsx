import { useCallback, useId, useRef, useState, type CSSProperties } from "react";
import { Badge, type BadgeVariant } from "./Badge";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { ScrollArea } from "./Scrollbar";
import { WindowOverlay } from "./WindowOverlay";

/** Where the comparison branch came from. */
export type GitComparisonBaseSource = "explicit" | "workspace" | "inferred" | "default";

export type GitComparisonBaseProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** The ref the changes are measured against; `null` when that is HEAD itself. */
    baseRef: string | null;
    /** Where that ref came from, when the host says. */
    source?: GitComparisonBaseSource;
    /** The host's own sentence about a fallback, shown under the row. */
    notice?: string;
    /**
     * The branch someone chose, as they typed it, or `null` for automatic. Only
     * read when the comparison can be changed.
     */
    choice?: string | null;
    /**
     * The branches the picker offers, best first. The picker narrows them to
     * what is typed, so a list answered for an earlier query still helps.
     */
    branches?: readonly string[];
    /** True while the caller is still finding branches for what is typed. */
    searching?: boolean;
    /**
     * Why the caller could not search the repository's branches, such as
     * `HTTP 404`; the card says so beside its heading.
     */
    unavailable?: string;
    /**
     * Receives a new branch, or `null` to go back to automatic. Without it the
     * row only states the comparison: there is nobody to hand a change to.
     */
    onChoiceChange?: (choice: string | null) => void;
    /** Hears what the open picker holds, from the moment it opens. */
    onQueryChange?: (query: string) => void;
    /** Hears the picker close, however it closed. */
    onClose?: () => void;
    /** Why a typed branch would be refused, said before anything is sent. */
    validate?: (value: string) => string | undefined;
};

const SOURCE_LABELS: Readonly<Record<GitComparisonBaseSource, string>> = {
    explicit: "Set by you",
    workspace: "Created from",
    inferred: "Inferred",
    default: "Default",
};

/** The person's own choice reads as theirs; everything else is the host's. */
const SOURCE_VARIANTS: Readonly<Record<GitComparisonBaseSource, BadgeVariant>> = {
    explicit: "accent",
    workspace: "neutral",
    inferred: "neutral",
    default: "neutral",
};

/** How close to the window's edge the card may sit before it is pushed back in. */
const VIEWPORT_MARGIN = 8;
const POPOVER_GAP = 4;
/** The card is never narrower than this, however narrow the row it opens from. */
const CARD_MIN_WIDTH = 280;

/**
 * C-289 GitComparisonBase — which branch a checkout's changes are measured
 * against.
 *
 * One 32px box shaped like the file browser's search field under it, so the
 * two read as a pair: a branch glyph where the field has its magnifier, then
 * "Compared with", the ref in the code face, and where that ref came from.
 * When the caller can change it, the whole box is the control and opens
 * `GitComparisonBaseCard` under it. A fallback the host had to make is said
 * under the box in its own words.
 *
 * It owns only whether the card is open, what is typed into it, and which
 * result the keyboard is on; the caller owns the comparison, the branches,
 * and what choosing one means.
 */
export function GitComparisonBase(props: GitComparisonBaseProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [active, setActive] = useState(0);
    const trigger = useRef<HTMLButtonElement>(null);
    const editable = props.onChoiceChange !== undefined;
    const refText = props.baseRef ?? "HEAD";
    const trimmed = draft.trim();
    const close = (returnFocus: boolean): void => {
        setOpen(false);
        props.onClose?.();
        if (returnFocus) trigger.current?.focus();
    };
    const choose = (choice: string | null): void => {
        close(true);
        props.onChoiceChange?.(choice);
    };
    // The card's commit is the moment it has a size, and the box above it is
    // already attached, so it is placed then: under the box and as wide as it,
    // pushed back inside the window near an edge.
    const popoverRef = useCallback((node: HTMLDivElement | null): void => {
        const anchor = trigger.current?.getBoundingClientRect();
        if (!node || !anchor) return;
        node.style.width = `${String(Math.max(CARD_MIN_WIDTH, Math.round(anchor.width)))}px`;
        const bounds = node.getBoundingClientRect();
        const left = Math.max(
            VIEWPORT_MARGIN,
            Math.min(anchor.left, window.innerWidth - bounds.width - VIEWPORT_MARGIN),
        );
        const top = Math.max(
            VIEWPORT_MARGIN,
            Math.min(
                anchor.bottom + POPOVER_GAP,
                window.innerHeight - bounds.height - VIEWPORT_MARGIN,
            ),
        );
        node.style.left = `${String(left)}px`;
        node.style.top = `${String(top)}px`;
    }, []);
    const content = (
        <>
            <span aria-hidden="true" className="happy-git-comparison__icon">
                <Icon name="branch" size={14} />
            </span>
            <span className="happy-git-comparison__label">Compared with</span>
            <span
                className="happy-git-comparison__ref"
                data-happy-desktop-ui="git-comparison-ref"
                title={refText}
            >
                {refText}
            </span>
            {props.source ? (
                <Badge
                    className="happy-git-comparison__source"
                    label={SOURCE_LABELS[props.source]}
                    variant={SOURCE_VARIANTS[props.source]}
                />
            ) : null}
            {editable ? (
                <span aria-hidden="true" className="happy-git-comparison__chevron">
                    <Icon name="chevron-down" size={12} />
                </span>
            ) : null}
        </>
    );
    return (
        <div
            className={["happy-git-comparison", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="git-comparison"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {editable ? (
                <button
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    aria-label={`Compared with ${refText}. Change comparison branch`}
                    className="happy-git-comparison__box"
                    data-happy-desktop-ui="git-comparison-trigger"
                    onClick={() => {
                        if (open) {
                            close(false);
                            return;
                        }
                        setDraft("");
                        setActive(0);
                        setOpen(true);
                        props.onQueryChange?.("");
                    }}
                    ref={trigger}
                    type="button"
                >
                    {content}
                </button>
            ) : (
                <div
                    className="happy-git-comparison__box"
                    data-happy-desktop-ui="git-comparison-row"
                >
                    {content}
                </div>
            )}
            {props.notice ? (
                <div
                    className="happy-git-comparison__notice"
                    data-happy-desktop-ui="git-comparison-notice"
                    role="note"
                >
                    <span className="happy-git-comparison__notice-icon">
                        <Icon name="alert" size={12} />
                    </span>
                    <span className="happy-git-comparison__notice-text">{props.notice}</span>
                </div>
            ) : null}
            {open && editable ? (
                <WindowOverlay>
                    <button
                        aria-label="Close"
                        className="happy-git-comparison__backdrop"
                        data-happy-desktop-ui="git-comparison-backdrop"
                        onClick={() => close(true)}
                        tabIndex={-1}
                        type="button"
                    />
                    <div
                        className="happy-git-comparison__popover"
                        data-happy-desktop-ui="git-comparison-popover"
                        onKeyDown={(event) => {
                            if (event.key !== "Escape") return;
                            event.preventDefault();
                            event.stopPropagation();
                            close(true);
                        }}
                        ref={popoverRef}
                    >
                        <GitComparisonBaseCard
                            active={active}
                            autoFocus
                            branches={props.branches ?? []}
                            current={props.choice ?? props.baseRef ?? undefined}
                            draft={draft}
                            onActiveChange={setActive}
                            onChoose={choose}
                            onDraftChange={(value) => {
                                setDraft(value);
                                setActive(0);
                                props.onQueryChange?.(value.trim());
                            }}
                            refusal={trimmed === "" ? undefined : props.validate?.(trimmed)}
                            resettable={props.choice !== null}
                            searching={props.searching}
                            unavailable={props.unavailable}
                        />
                    </div>
                </WindowOverlay>
            ) : null}
        </div>
    );
}

/** One row of the picker: a branch the caller offered, or the typed name itself. */
export type GitComparisonBaseOption =
    | { readonly kind: "branch"; readonly ref: string }
    | { readonly kind: "typed"; readonly ref: string };

/**
 * The picker's rows for what is typed: the offered branches that contain it,
 * ignoring case and in the order given, then the typed name itself when no
 * offered branch is exactly that, so a branch the caller does not know can
 * still be chosen.
 */
export function gitComparisonBaseOptions(
    branches: readonly string[],
    draft: string,
): readonly GitComparisonBaseOption[] {
    const query = draft.trim();
    const needle = query.toLowerCase();
    const seen = new Set<string>();
    const options: GitComparisonBaseOption[] = [];
    for (const ref of branches) {
        if (seen.has(ref) || !ref.toLowerCase().includes(needle)) continue;
        seen.add(ref);
        options.push({ kind: "branch", ref });
    }
    if (query !== "" && !seen.has(query)) options.push({ kind: "typed", ref: query });
    return options;
}

export type GitComparisonBaseCardProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /** What the field holds. */
    draft: string;
    onDraftChange: (draft: string) => void;
    /** Why the typed name would be refused; its row is withheld while there is one. */
    refusal?: string;
    /** The branches on offer, best first; the card narrows them to the draft. */
    branches: readonly string[];
    /** The branch compared with now, marked where it appears. */
    current?: string;
    /** The row the keyboard is on, an index into the narrowed rows. */
    active: number;
    onActiveChange: (active: number) => void;
    /** True while more branches are still being found for the draft. */
    searching?: boolean;
    /** Why the repository's branches could not be searched; said beside the heading. */
    unavailable?: string;
    /** Whether there is a choice in place to go back from. */
    resettable: boolean;
    /** Receives the chosen branch, or `null` for automatic. */
    onChoose: (choice: string | null) => void;
    /** Puts the caret in the field as the card appears. */
    autoFocus?: boolean;
};

/**
 * The card `GitComparisonBase` opens: a search field over the branches that
 * match it, and Reset to automatic when there is a choice to go back from. It
 * is the Menu's surface — plain surface, modal hairline, 10px radius, a short
 * drop — at least 280px wide.
 *
 * The field keeps the focus throughout, as a combobox: Up and Down move
 * through the results, Enter or a click takes one at once, and Escape is the
 * opener's. The current branch is marked with a check. Under the matches, the
 * typed name is offered as itself, so a branch that is not listed is one
 * Enter away; with no matches at all the card says so above it.
 *
 * Props only: the caller holds the draft and the keyboard position and
 * decides what a choice means.
 */
export function GitComparisonBaseCard(props: GitComparisonBaseCardProps) {
    const listId = useId();
    const options = gitComparisonBaseOptions(props.branches, props.draft);
    const matches = options.filter((option) => option.kind === "branch").length;
    const active =
        options.length === 0 ? -1 : Math.min(Math.max(props.active, 0), options.length - 1);
    const usable = (
        option: GitComparisonBaseOption | undefined,
    ): option is GitComparisonBaseOption =>
        option !== undefined && (option.kind === "branch" || props.refusal === undefined);
    const optionId = (index: number): string => `${listId}-option-${String(index)}`;
    // Focus stays in the field while the keyboard moves this highlight, so the
    // active row is brought into the visible part of the list by hand.
    const activeRowRef = useCallback((element: HTMLButtonElement | null) => {
        element?.scrollIntoView({ block: "nearest" });
    }, []);
    const query = props.draft.trim();
    return (
        <div
            aria-label="Comparison branch"
            className={["happy-git-comparison-card", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="git-comparison-card"
            data-testid={props["data-testid"]}
            role="dialog"
            style={props.style}
        >
            <div
                className="happy-git-comparison-card__field"
                data-happy-desktop-ui="git-comparison-field"
                data-invalid={props.refusal === undefined ? undefined : ""}
            >
                <span aria-hidden="true" className="happy-git-comparison-card__field-icon">
                    <Icon name="search" size={14} />
                </span>
                <input
                    aria-activedescendant={active < 0 ? undefined : optionId(active)}
                    aria-autocomplete="list"
                    aria-controls={listId}
                    aria-expanded="true"
                    aria-invalid={props.refusal === undefined ? undefined : "true"}
                    aria-label="Search branches"
                    autoComplete="off"
                    autoFocus={props.autoFocus}
                    className="happy-git-comparison-card__input"
                    data-happy-desktop-ui="git-comparison-input"
                    onInput={(event) => props.onDraftChange(event.currentTarget.value)}
                    onKeyDown={(event) => {
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                            event.preventDefault();
                            if (options.length === 0) return;
                            const step = event.key === "ArrowDown" ? 1 : -1;
                            props.onActiveChange((active + step + options.length) % options.length);
                            return;
                        }
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        const option = options[active];
                        if (usable(option)) props.onChoose(option.ref);
                    }}
                    placeholder="Search branches"
                    role="combobox"
                    spellCheck={false}
                    type="text"
                    value={props.draft}
                />
            </div>
            {props.refusal === undefined ? null : (
                <div
                    className="happy-git-comparison-card__refusal"
                    data-happy-desktop-ui="git-comparison-refusal"
                    role="alert"
                >
                    {props.refusal}
                </div>
            )}
            <div
                className="happy-git-comparison-card__heading"
                data-happy-desktop-ui="git-comparison-heading"
            >
                <span>{query === "" ? "Branches" : "Matching branches"}</span>
                {props.searching ? (
                    <span className="happy-git-comparison-card__searching">Searching…</span>
                ) : props.unavailable === undefined ? null : (
                    <span
                        className="happy-git-comparison-card__unavailable"
                        data-happy-desktop-ui="git-comparison-unavailable"
                        title={`Branch search unavailable: ${props.unavailable}`}
                    >
                        Branch search unavailable: {props.unavailable}
                    </span>
                )}
            </div>
            <ScrollArea
                className="happy-git-comparison-card__scroll"
                data-happy-desktop-ui="git-comparison-scroll"
                viewportClassName="happy-git-comparison-card__scroll-viewport"
            >
                <div
                    aria-label="Branches"
                    className="happy-git-comparison-card__list"
                    data-happy-desktop-ui="git-comparison-list"
                    id={listId}
                    role="listbox"
                >
                    {matches === 0 ? (
                        <div
                            className="happy-git-comparison-card__empty"
                            data-happy-desktop-ui="git-comparison-empty"
                        >
                            {query === "" ? "No branches to suggest" : "No matching branches"}
                        </div>
                    ) : null}
                    {options.map((option, index) => {
                        const highlighted = index === active;
                        const disabled = !usable(option);
                        const isCurrent = option.kind === "branch" && option.ref === props.current;
                        return (
                            <button
                                aria-disabled={disabled ? "true" : undefined}
                                aria-selected={highlighted ? "true" : "false"}
                                className="happy-git-comparison-card__option"
                                data-active={highlighted ? "" : undefined}
                                data-happy-desktop-ui="git-comparison-option"
                                data-kind={option.kind}
                                id={optionId(index)}
                                key={`${option.kind}:${option.ref}`}
                                onClick={() => {
                                    if (!disabled) props.onChoose(option.ref);
                                }}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseMove={() => {
                                    if (!highlighted) props.onActiveChange(index);
                                }}
                                ref={highlighted ? activeRowRef : undefined}
                                role="option"
                                tabIndex={-1}
                                title={option.ref}
                                type="button"
                            >
                                <span
                                    aria-hidden="true"
                                    className="happy-git-comparison-card__option-icon"
                                >
                                    <Icon
                                        name={option.kind === "branch" ? "branch" : "arrow-right"}
                                        size={12}
                                    />
                                </span>
                                {option.kind === "branch" ? (
                                    <span className="happy-git-comparison-card__option-label">
                                        {option.ref}
                                    </span>
                                ) : (
                                    <span className="happy-git-comparison-card__option-typed">
                                        <span>Compare with</span>
                                        <span className="happy-git-comparison-card__option-label">
                                            {option.ref}
                                        </span>
                                    </span>
                                )}
                                {isCurrent ? (
                                    <span
                                        className="happy-git-comparison-card__current"
                                        data-happy-desktop-ui="git-comparison-current"
                                    >
                                        <Icon name="check" size={12} />
                                        Current
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </ScrollArea>
            {props.resettable ? (
                <div
                    className="happy-git-comparison-card__actions"
                    data-happy-desktop-ui="git-comparison-actions"
                >
                    <Button onClick={() => props.onChoose(null)} size="small" variant="ghost">
                        Reset to automatic
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
