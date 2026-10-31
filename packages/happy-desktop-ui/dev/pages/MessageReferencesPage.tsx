import { type ReactNode } from "react";
import type { HappyReference } from "happy-desktop-state";
import { Message } from "../../src/Message";
import type { MessageReferences, MessageReferenceView } from "../../src/messageReferences";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-289";

const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};

/** What each fixture id reads as; anything else is unknown to this surface. */
const VIEWS: ReadonlyMap<string, MessageReferenceView> = new Map([
    ["artifact:q3report", { type: "link", label: "Q3 revenue report", busy: false }],
    [
        "artifact:longtitle",
        {
            type: "link",
            label: "Migration plan for moving every desktop surface onto the realtime difference APIs",
            busy: false,
        },
    ],
    ["artifact:gone", { type: "text", label: "Old onboarding deck" }],
    ["agent:reviewer", { type: "link", label: "Review the release notes", busy: false }],
    ["agent:builder", { type: "link", label: "Release build", busy: true }],
    ["workspace:quiet", { type: "link", label: "happy-references", busy: false }],
    ["workspace:cloning", { type: "link", label: "happy-onboarding", busy: true }],
    ["project:desktop", { type: "link", label: "happy-desktop", busy: false }],
    ["project:importing", { type: "link", label: "happy-agent", busy: true }],
]);

const references: MessageReferences = {
    view(reference: HappyReference) {
        return (
            VIEWS.get(`${reference.kind}:${reference.id}`) ?? {
                type: "text",
                label: ["artifact", "agent", "workspace", "project", "service"].includes(
                    reference.kind,
                )
                    ? `an unavailable ${reference.kind}`
                    : "an unavailable reference",
            }
        );
    },
    open: () => undefined,
};

function channelFrame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: "8px 0",
                width: "680px",
            }}
        >
            {children}
        </div>
    );
}

function agentReply(body: string, streaming = false) {
    return (
        <Message
            agent
            author="Happy"
            brandAvatar
            body={body}
            {...(streaming ? { generationStatus: "streaming" as const } : {})}
            initials="HA"
            references={references}
            time="10:51"
            tone="mint"
        />
    );
}

/** A person's message, shown as typed: only its references read as links. */
function ownMessage(body: string) {
    return (
        <Message
            author="Steve"
            body={body}
            bodyFormat="plain"
            initials="SK"
            own
            references={references}
            time="10:52"
        />
    );
}

export function MessageReferencesPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Happy references an agent writes as ordinary Markdown links to happy:// URLs, read as underlined links titled with the live name of what they point at. A busy target carries the shimmer band; anything that cannot be opened is plain words; a link still arriving never shows. Legacy <happy-KIND id/> tags in older history read the same way."
            title="Message references"
        >
            <Specimen
                detail="Artifact, agent, workspace, and project · the same underline and colour as every Markdown link · a pinned version still reads as the current title"
                label="Idle references"
                number="01"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        agentReply(
                            [
                                "I published [the Q3 report](happy://artifacts/q3report) with the numbers you asked for.",
                                "",
                                "[](happy://artifacts/q3report?version=2)",
                                "",
                                "The longer one wraps like prose: [](happy://artifacts/longtitle).",
                                "",
                                "[](happy://agents/reviewer) checked it in [](happy://workspaces/quiet) of [](happy://projects/desktop).",
                            ].join("\n"),
                        ),
                    )}
                    <DimensionRule label="16/24 body · underline in --text · no chip, no card" />
                </div>
            </Specimen>
            <Specimen
                detail="An agent working, a workspace and a project being prepared · ShimmerText sheen, inherit tone, inline"
                label="Busy references"
                number="02"
                stage="app"
            >
                {channelFrame(
                    agentReply(
                        [
                            "Handed the packaging to [](happy://agents/builder), which is still working.",
                            "",
                            "The new checkout [](happy://workspaces/cloning) is being prepared, and [](happy://projects/importing) is still cloning.",
                        ].join("\n"),
                    ),
                )}
            </Specimen>
            <Specimen
                detail="Deleted, missing, not visible, services, malformed links, and unknown legacy kinds read as plain text: the live name, the writer's label, or a placeholder"
                label="Unavailable references"
                number="03"
                stage="app"
            >
                {channelFrame(
                    agentReply(
                        '[](happy://artifacts/gone) was deleted, [the hidden reviewer](happy://agents/hidden) is not visible here, [](happy://workspaces/quiet/services/preview) does not open yet, [a broken link](happy://artifacts/a/b) is malformed, and <happy-gizmo id="x1"/> is a legacy kind this build does not know.',
                    ),
                )}
            </Specimen>
            <Specimen
                detail="What a person mentioned from the composer's @ picker: their words exactly as typed, every reference the same underlined live title, an unavailable one its plain words"
                label="In a person's message"
                number="03b"
                stage="app"
            >
                {channelFrame(
                    ownMessage(
                        "Ask [Reviewer](happy://agents/reviewer) to fold the notes into [happy-desktop](happy://projects/desktop)  — **not** [](happy://artifacts/gone).",
                    ),
                )}
            </Specimen>
            <Specimen
                detail="A link that has only partly arrived is held back until it completes"
                label="Streaming"
                number="04"
                stage="app"
            >
                {channelFrame(agentReply("Here is the report: [Q3 report](happy://arti", true))}
            </Specimen>
            <Specimen
                detail="Links inside inline code and fenced code stay literal"
                label="Code stays code"
                number="05"
                stage="app"
            >
                {channelFrame(
                    agentReply(
                        [
                            "Write `[Q3](happy://artifacts/q3report)` to link it:",
                            "",
                            "```md",
                            "[Q3](happy://artifacts/q3report)",
                            "```",
                        ].join("\n"),
                    ),
                )}
            </Specimen>
        </ComponentPage>
    );
}
