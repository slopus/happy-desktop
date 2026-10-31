import { StoryMarkView } from "./StoryRing";
import type { StoryViewerProps } from "./StoryViewer";

/** The story a message answers: its frame and poster, or nothing yet while it is read. */
export type StoryQuoteView =
    | { readonly kind: "loading" }
    | ({ readonly kind: "live" } & Pick<
          StoryViewerProps,
          "frame" | "caption" | "segment" | "poster"
      >);

/** StoryQuote — the story a message answers, small and still above it; loading keeps its box. */
export function StoryQuote(props: { readonly quote: StoryQuoteView; readonly onOpen: () => void }) {
    const { quote } = props;
    const frame = quote.kind === "live" ? quote.frame : undefined;
    const Media = frame?.kind === "video" ? "video" : "img";
    return (
        <button
            aria-label="Open the story"
            className="happy-story-viewer__frame happy-story-quote happy-theme-dark"
            data-happy-desktop-ui="story-quote"
            disabled={quote.kind === "loading"}
            onClick={props.onOpen}
            type="button"
        >
            {frame?.kind === "image" || frame?.kind === "video" ? (
                <Media className="happy-story-viewer__media" src={frame.url} />
            ) : null}
            {quote.kind === "live" ? (
                <span className="happy-story-viewer__top">
                    <span className="happy-story-viewer__segments">
                        {Array.from({ length: quote.segment.total }, (_, index) => (
                            <span
                                data-on={index <= quote.segment.index ? "" : undefined}
                                key={index}
                            />
                        ))}
                    </span>
                    <span className="happy-story-viewer__head">
                        <StoryMarkView mark={quote.poster.mark} size={18} />
                        <b>{quote.poster.name}</b>
                    </span>
                </span>
            ) : null}
            {quote.kind === "live" && quote.caption ? (
                <span className="happy-story-quote__caption">{quote.caption}</span>
            ) : null}
        </button>
    );
}
