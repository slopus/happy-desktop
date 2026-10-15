import { renderMessageMarkdown } from "../../src/MessageMarkdown";
import {
    GUIDED_REVIEW_FIXTURE_BASE,
    guidedReviewFixture,
    guidedReviewGrounding,
} from "../fixtures/guided-review/fixtures";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-296";

/*
 * Guided reviews of real changes, written by following
 * `.agents/skills/guided-review` against the diff frozen beside them, and drawn
 * with the same grounding the app builds over a live checkout. This is the
 * evaluation the master plan asks for: every quoted diff shows the real lines,
 * and every file list and count comes from the change itself.
 */

const fence = (label: string, body: string) => `\`\`\`${label}\n${body}\n\`\`\``;
const review = fence("happy-review", `base: ${GUIDED_REVIEW_FIXTURE_BASE}`);

const smallInset = [
    review,
    "The activity summary at the end of the working-status line now sits **30px** from the edge — the same inset as the text on the left — and truncates instead of spilling when the pane is narrow.",
    fence("happy-files", ""),
    "## Framing the line evenly",
    "The transcript entry gets the 30px trailing inset and becomes a flex box, so the summary can shrink and ellipsize inside it.",
    fence(
        "happy-diff",
        "path: packages/happy-desktop-ui/src/styles/happy-agent-chat.css\nlines: 424-440",
    ),
    "## A comment that still said 20px",
    "A stylesheet comment still described the old inset.",
    fence(
        "happy-diff",
        "path: packages/happy-desktop-ui/src/styles/conversation.css\nlines: 116-122",
    ),
].join("\n\n");

const smallInsetReview = [
    review,
    "The activity summary now sits 30px from the edge, mirroring the status text, and truncates in a narrow pane.",
    fence(
        "happy-verdict",
        "Safe to merge. The inset is right; tie the number to the gutter it mirrors first.",
    ),
    fence("happy-files", ""),
    "## Framing the line evenly",
    "The transcript entry gets the 30px trailing inset and becomes a flex box.",
    fence(
        "happy-diff",
        "path: packages/happy-desktop-ui/src/styles/happy-agent-chat.css\nlines: 424-440",
    ),
    fence(
        "happy-finding",
        [
            "severity: medium",
            "title: The 30px is written out, not taken from the gutter it mirrors",
            "path: packages/happy-desktop-ui/src/styles/happy-agent-chat.css",
            "lines: 429-435",
            "",
            "The left inset comes from the transcript gutter and this rule repeats its value, so the next gutter change splits the line again. Use the custom property the status text takes its inset from.",
        ].join("\n"),
    ),
    "## A comment that still said 20px",
    "A stylesheet comment still described the old inset.",
    fence(
        "happy-diff",
        "path: packages/happy-desktop-ui/src/styles/conversation.css\nlines: 116-122",
    ),
    fence(
        "happy-finding",
        [
            "severity: low",
            "title: The comment names a number instead of what it lines up with",
            "",
            "Saying it matches the status text inset stays true after the next change.",
        ].join("\n"),
    ),
].join("\n\n");

const messySenders = [
    review,
    "A message from another agent is now named and pictured the way that agent is elsewhere in the window, and `⌘N` opens *New task* instead of *New workspace*.",
    fence(
        "happy-flow",
        [
            "Transcript -> ChatStore [changed 2]: sender ids",
            "ChatStore -> AgentIdentities [new 1]: lookup",
            "AgentIdentities -> SessionList: index",
            "AgentIdentities -> getAgent [new 1]: unknown id",
            "ChatStore -> AgentActivityRow [changed 3]: face",
            "AgentActivityRow -> AgentMessageFace [new 3]",
            "AgentMessageFace -> AgentsGlyph [gone]",
        ].join("\n"),
    ),
    fence("happy-files", ""),
    "## Who sent this",
    "An agent is named from the session list first: a bot by its name and picture, a task by its name and its owner's face, any other conversation by its title. One the list does not name is asked about once.",
    fence(
        "happy-diff",
        "path: packages/happy-desktop-state/src/happyAgent/happyAgentAgentIdentities.ts\nlines: 40-50",
    ),
    "## Naming senders as the transcript is built",
    "The chat store collects the sender ids in a transcript, resolves each through the identity source, and follows the source only once somebody has written in.",
    fence(
        "happy-diff",
        "path: packages/happy-desktop-state/src/happyAgent/happyAgentChatStore.ts\nlines: 730-745",
    ),
    "## The face in the row",
    "The agent-message row draws the sender's face in the glyph lane and falls back to the first eight characters of an id nobody can name.",
    fence(
        "happy-diff",
        "path: packages/happy-desktop-ui/src/AgentActivityRow.tsx\nlines: 1113-1130",
    ),
    "## ⌘N makes a task",
    "The chord moves from workspaces to tasks, bound only while the machine on screen can make one; *New workspace* moves to `⇧⌘N`.",
    fence("happy-diff", "path: packages/happy-desktop-app/sources/appShortcuts.ts\nlines: 13-19"),
    "## Tests and Blueprint pages",
    "Identity and sender tests, and the pages that show the new row and shortcuts.",
    fence(
        "happy-files",
        [
            "packages/happy-desktop-ui/dev/pages",
            "packages/happy-desktop-state/src/happyAgent/happyAgentAgentIdentities.test.ts",
            "packages/happy-desktop-state/src/happyAgent/happyAgentChatStore.senders.test.ts",
            "packages/happy-desktop-ui/src/AgentActivityRow.test.tsx",
        ].join("\n"),
    ),
].join("\n\n");

const explanation = [
    "How a transcript row knows its height before it mounts.",
    fence(
        "happy-sequence",
        [
            "MessageBody -> RemarkTree: parse once",
            "RemarkTree -> RowHeightModel: measure blocks",
            "RowHeightModel -> VirtualList: height",
        ].join("\n"),
    ),
    "The body is parsed once into a remark tree, each block is measured with the fonts the renderer paints with, and the virtual list places the row from that height without measuring the DOM.",
].join("\n\n");

const invalid = [
    "A fence that names lines it cannot read keeps its source and says why.",
    fence(
        "happy-diff",
        "path: packages/happy-desktop-ui/src/styles/conversation.css\nlines: forty",
    ),
].join("\n\n");

const pictures = [
    review,
    "The summary moved inside the inset.",
    fence(
        "happy-before-after",
        "before: insetbefore0001@1\nafter: insetafter00001@1\n\nThe summary used to spill past the edge; now it stops 30px short and truncates.",
    ),
].join("\n\n");

/**
 * The reply drawn exactly as the transcript draws it: a Markdown message body
 * whose fences become Happy's components, grounded in the frozen change.
 * `data-geometry-*` lets a script compare the painted body with the row model.
 */
function Reply(props: {
    fixture?: string;
    screen: string;
    source: string;
    /** A reply still arriving, cut this far through. */
    streaming?: number;
    width?: number;
}) {
    const fixture = props.fixture === undefined ? undefined : guidedReviewFixture(props.fixture);
    const grounding = fixture === undefined ? undefined : guidedReviewGrounding(fixture);
    const text =
        props.streaming === undefined
            ? props.source
            : props.source.slice(0, Math.floor(props.source.length * props.streaming));
    return (
        <div data-screen={props.screen} style={{ width: props.width ?? 720 }}>
            <div
                className="happy-message__body happy-message__body--markdown"
                data-geometry-fixture={props.fixture ?? ""}
                data-geometry-streaming={props.streaming === undefined ? undefined : ""}
                data-geometry-text={text}
                data-markdown=""
                // In the transcript the body is a flex item, so a closing
                // block's margin stays inside it; flow-root keeps that here.
                style={{ display: "flow-root" }}
            >
                {renderMessageMarkdown(
                    text,
                    undefined,
                    () => undefined,
                    props.streaming === undefined ? "complete" : "streaming",
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    grounding,
                )}
            </div>
            {fixture === undefined ? null : (
                <p
                    style={{
                        font: "13px/20px var(--happy-font-mono)",
                        color: "var(--text-secondary)",
                    }}
                >
                    {fixture.ref} · {fixture.subject} · {String(fixture.files.length)} files
                </p>
            )}
        </div>
    );
}

export function GuidedReviewFixturesPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Guided reviews of real changes, drawn as the transcript draws a reply: Markdown whose Happy fences become Happy's own components, grounded in the diff frozen beside them, and drawn as they arrive while the reply streams."
            title="Guided review fixtures"
        >
            <Specimen detail="One idea, two CSS files" label="Small change" number="01" stage="app">
                <Reply fixture="small-inset" screen="01-small" source={smallInset} />
            </Specimen>
            <Specimen
                detail="Twenty files, a flow of the parts it touches, chapters side by side at the full chat measure"
                label="Messy change, wide"
                number="02"
                stage="app"
            >
                <Reply
                    fixture="messy-senders"
                    screen="02-messy-wide"
                    source={messySenders}
                    width={880}
                />
            </Specimen>
            <Specimen
                detail="The same reply in a narrow column: every chapter stacks"
                label="Messy change, narrow"
                number="03"
                stage="app"
            >
                <Reply
                    fixture="messy-senders"
                    screen="03-messy-narrow"
                    source={messySenders}
                    width={420}
                />
            </Specimen>
            <Specimen
                detail="A review: the verdict counts the findings, each finding sits in its chapter"
                label="Review"
                number="04"
                stage="app"
            >
                <Reply
                    fixture="small-inset"
                    screen="04-review"
                    source={smallInsetReview}
                    width={880}
                />
            </Specimen>
            <Specimen
                detail="Not a change: the same fences explaining a subsystem"
                label="Explanation"
                number="05"
                stage="app"
            >
                <Reply screen="05-explanation" source={explanation} />
            </Specimen>
            <Specimen
                detail="A fence that cannot be read stays as source, with the reason"
                label="Invalid"
                number="06"
                stage="app"
            >
                <Reply fixture="small-inset" screen="06-invalid" source={invalid} />
            </Specimen>
            <Specimen
                detail="Before and after name screenshots: each side keeps a 16:10 frame, here saying the picture cannot be shown"
                label="Pictures"
                number="07"
                stage="app"
            >
                <Reply fixture="small-inset" screen="07-pictures" source={pictures} />
            </Specimen>
            <Specimen
                detail="The review while it streams: closed fences drawn, the open one a quiet line"
                label="Arriving"
                number="08"
                stage="app"
            >
                <Reply
                    fixture="small-inset"
                    screen="08-arriving"
                    source={smallInsetReview}
                    streaming={0.62}
                    width={880}
                />
            </Specimen>
            <Specimen
                detail="Earlier in the stream, narrow"
                label="Arriving, narrow"
                number="09"
                stage="app"
            >
                <Reply
                    fixture="messy-senders"
                    screen="09-arriving-narrow"
                    source={messySenders}
                    streaming={0.3}
                    width={420}
                />
            </Specimen>
        </ComponentPage>
    );
}
