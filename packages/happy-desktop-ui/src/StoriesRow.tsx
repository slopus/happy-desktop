import { StoryMarkView, StoryRing, type StoryMark, type StoryRingSegments } from "./StoryRing";

/** One poster in the stories row. */
export type StoriesRowItem = {
    /** Stable for the poster; the row keys its circles by it. */
    readonly id: string;
    readonly name: string;
    readonly mark: StoryMark;
    readonly segments: StoryRingSegments;
    /** The reader's own circle, first and named "My story"; with no story it wears a plus. */
    readonly self?: boolean;
};

export type StoriesRowProps = {
    readonly items: readonly StoriesRowItem[];
    readonly onOpen: (id: string) => void;
};

/**
 * The stories header at the top of the sidebar, as Telegram's chat list has
 * it: one ring per poster, one segment per live story, its name under it.
 */
export function StoriesRow(props: StoriesRowProps) {
    return (
        <div className="happy-stories-row" data-happy-desktop-ui="stories-row">
            <div className="happy-stories-row__scroll">
                <div className="happy-stories-row__items">
                    {props.items.map((item) => {
                        const empty = item.segments.total === 0;
                        return (
                            <button
                                aria-disabled={empty ? true : undefined}
                                className="happy-stories-row__item"
                                data-happy-desktop-ui="stories-row-item"
                                data-unseen={item.segments.unseen > 0 ? "" : undefined}
                                key={item.id}
                                onClick={empty ? undefined : () => props.onOpen(item.id)}
                                title={empty ? "Repost a story to share it here" : undefined}
                                type="button"
                            >
                                <span className="happy-stories-row__ring">
                                    {empty ? null : (
                                        <StoryRing segments={item.segments} size={48} />
                                    )}
                                    <StoryMarkView mark={item.mark} size={42} />
                                    {item.self && empty ? (
                                        <span
                                            aria-hidden="true"
                                            className="happy-stories-row__plus"
                                        >
                                            +
                                        </span>
                                    ) : null}
                                </span>
                                <span className="happy-stories-row__name">
                                    {item.self ? "My story" : item.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
