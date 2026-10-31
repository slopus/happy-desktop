import { StoryViewer } from "../../src/StoryViewer";
import { ComponentPage, Specimen } from "../kit";
import { STORY_FRAME_DARK, STORY_VIEWER_PROPS } from "./storyFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-336";

const row = { display: "flex", gap: 24, alignItems: "flex-start" } as const;

export function StoryViewerPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="One story, one frame: segments, the poster, the frame, its caption, the replies sent to the agent, and a solid reply bar that reads the same over a white frame or a dark one."
            title="Story viewer"
        >
            <Specimen
                detail="300px · white frame · dark frame"
                label="Teammate's view"
                number="01"
                stage="app"
            >
                <div style={row}>
                    <StoryViewer {...STORY_VIEWER_PROPS} />
                    <StoryViewer
                        {...STORY_VIEWER_PROPS}
                        frame={{ kind: "image", url: STORY_FRAME_DARK }}
                        reply={{ phase: "sent" }}
                        segments={{ total: 2, current: 1 }}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="take down offered · loading replies · a page frame · a failed repost"
                label="Owner's view and states"
                number="02"
                stage="app"
            >
                <div style={row}>
                    <StoryViewer
                        {...STORY_VIEWER_PROPS}
                        frame={{ kind: "loading" }}
                        onRepost={undefined}
                        onTakeDown={() => undefined}
                        replies={{ status: "loading" }}
                    />
                    <StoryViewer
                        {...STORY_VIEWER_PROPS}
                        action={{ phase: "failed", message: "The daemon refused the repost." }}
                        caption={null}
                        frame={{ kind: "artifact" }}
                        onFrameOpen={() => undefined}
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
