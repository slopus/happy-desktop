import { StoryMarkView, StoryRing } from "../../src/StoryRing";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-334";

const SEGMENTS = [
    { total: 1, unseen: 1 },
    { total: 2, unseen: 1 },
    { total: 3, unseen: 3 },
    { total: 5, unseen: 2 },
    { total: 1, unseen: 0 },
    { total: 4, unseen: 0 },
] as const;

export function StoryRingPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One segment per live story, clockwise from the top: seen ones first in grey, the unseen ones in the accent. The stroke sits on the box's outer edge, so a ring arriving never moves the mark."
            title="Story ring"
        >
            <Specimen
                detail="48px box · 42px mark · 2px unseen, 1.5px seen · 3px gaps"
                label="Stories header"
                number="01"
                stage="chrome"
            >
                <div style={{ display: "flex", gap: 16 }}>
                    {SEGMENTS.map((segments) => (
                        <span
                            key={`${segments.total}/${segments.unseen}`}
                            style={{ position: "relative", display: "flex", padding: 3 }}
                            title={`${segments.total} stories, ${segments.unseen} unseen`}
                        >
                            <StoryRing segments={segments} size={48} />
                            <StoryMarkView
                                mark={{ kind: "icon", slug: "ux", label: "UX" }}
                                size={42}
                            />
                        </span>
                    ))}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
