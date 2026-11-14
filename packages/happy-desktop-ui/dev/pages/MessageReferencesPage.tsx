import { type ReactNode } from "react";
import type { HappyReference } from "happy-desktop-state";
import { Message } from "../../src/Message";
import { MessageSettingsLinksContext, type MessageSettingsLinks } from "../../src/MessageMarkdown";
import type { MessageReferences, MessageReferenceView } from "../../src/messageReferences";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-289";

const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};

/** The server these fixtures are read on; a share link naming it opens here. */
const INSTANCE = "k3x9q2m7p0a4b8c1d5e6f7g2";
/** Another server, which this surface is not connected to. */
const ELSEWHERE = "m8w2r5t1y6u3i9o4p7a0s2d5";
const share = (rest: string, instance = INSTANCE) =>
    `https://link.happy.page/#1/${instance}/${rest}`;

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
    ["agent:shiptask", { type: "link", label: "Ship the November build", busy: false }],
    ["agent:releasebot", { type: "link", label: "Release bot", busy: true }],
    ["agent:builder", { type: "link", label: "Release build", busy: true }],
    [
        "agent:packager",
        {
            type: "link",
            label: "Package the signed desktop build and upload it to the preview channel",
            busy: true,
        },
    ],
    ["workspace:quiet", { type: "link", label: "happy-references", busy: false }],
    ["workspace:cloning", { type: "link", label: "happy-onboarding", busy: true }],
    ["project:desktop", { type: "link", label: "happy-desktop", busy: false }],
    ["project:importing", { type: "link", label: "happy-agent", busy: true }],
]);

const references: MessageReferences = {
    instanceId: INSTANCE,
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

/** This surface has the Providers and Account pages, and not Members. */
const settingsLinks: MessageSettingsLinks = {
    has: (page) => page === "providers" || page === "account",
    open: () => undefined,
};

function channelFrame(children: ReactNode, screen?: string) {
    return (
        <div
            data-screen={screen}
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
            summary="Happy links an agent writes as ordinary Markdown links — link.happy.page share links, or legacy happy:// URLs — read as the current name of what they point at, whatever label was written between the brackets. One this server can open is an underlined link, and a busy target carries the shimmer band; one it cannot name reads as a placeholder such as “an unavailable artifact”, and a share link among those still routes to its server; a bare share link reads as its address; a link still arriving never shows. Legacy <happy-KIND id/> tags in older history read the same way."
            title="Message references"
        >
            <Specimen
                detail="A task, a bot, and an artifact written as [](share link) read as their current names · the bot is busy and shimmers · a stale label is ignored · a share link naming something this server does not hold, or another server, reads as a placeholder and routes there · a bare share link is its address · a legacy happy:// link reads the same as a share link"
                label="Share links"
                number="00"
                stage="app"
            >
                {channelFrame(
                    agentReply(
                        [
                            "Here is where the release stands:",
                            "",
                            `- [](${share("agents/shiptask?as=task")}) signed off this morning.`,
                            `- [](${share("agents/releasebot?as=bot")}) is still packaging the installer.`,
                            `- The numbers are in [](${share("artifacts/q3report")}), written once as [Old deck name](${share("artifacts/q3report")}).`,
                            `- [](${share("artifacts/retro")}) is not on this server, and [](${share("artifacts/plan", ELSEWHERE)}) is on one you are not connected to.`,
                            `- Bare: ${share("artifacts/q3report")}`,
                            "- Legacy: [](happy://artifacts/q3report)",
                        ].join("\n"),
                    ),
                    "share-links",
                )}
            </Specimen>
            <Specimen
                detail="Artifact, agent, workspace, and project · the same underline and colour as every Markdown link · a written label and a pinned version still read as the current title"
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
                        "idle-references",
                    )}
                    <DimensionRule label="16/24 body · underline in --text · no chip, no card" />
                </div>
            </Specimen>
            <Specimen
                detail="An agent working, a workspace and a project being prepared · ShimmerText sheen, inherit tone, inline · a wrapped link carries one band across all of its lines"
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
                            "",
                            "A long one wraps like prose, and one band crosses every line of it: [](happy://agents/packager).",
                        ].join("\n"),
                    ),
                )}
            </Specimen>
            <Specimen
                detail="Deleted, missing, not visible, services, malformed links, and unknown legacy kinds read as plain text: the name the app still has for it, or a placeholder — never the writer's label"
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
                detail="What a person mentioned from the composer's @ picker: their words exactly as typed, every reference the same underlined live title, a bare share link its address, an unavailable one its plain words"
                label="In a person's message"
                number="03b"
                stage="app"
            >
                {channelFrame(
                    ownMessage(
                        `Ask [Reviewer](happy://agents/reviewer) to fold the notes into [happy-desktop](happy://projects/desktop)  — **not** [](happy://artifacts/gone). Deck: ${share("artifacts/q3report")}`,
                    ),
                    "own-message",
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
            <Specimen
                detail='happy://settings/<page> opens that settings page and only navigates · titled "button" it reads as an inline pill padded sideways only, so the line height the row measured holds · a page this surface lacks reads as its words'
                label="Settings links and buttons"
                number="06"
                stage="app"
            >
                <MessageSettingsLinksContext.Provider value={settingsLinks}>
                    {channelFrame(
                        agentReply(
                            [
                                'Your team has no model yet. [Add your API keys](happy://settings/providers "button") to start, or [review your account](happy://settings/account) first.',
                                "",
                                "Managing people lives in [Members](happy://settings/members), which this app doesn't have.",
                            ].join("\n"),
                        ),
                    )}
                </MessageSettingsLinksContext.Provider>
            </Specimen>
        </ComponentPage>
    );
}
