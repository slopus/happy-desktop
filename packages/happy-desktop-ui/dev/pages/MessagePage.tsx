import { type ReactNode } from "react";
import type { ConversationAuthor } from "happy-desktop-state";
import { ConversationEntryView } from "../../src/ConversationEntryView";
import { DiffSnippet } from "../../src/DiffSnippet";
import { FileAttachment } from "../../src/FileAttachment";
import { DayDivider, Message, MessageList, SteeringNotice, SystemNotice } from "../../src/Message";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-012";
const column: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
};
const teamAuthors: readonly ConversationAuthor[] = [
    {
        id: "team-maya",
        userId: "team-maya",
        displayName: "Maya Johnson",
        username: "Maya Johnson",
        kind: "human",
        avatar: { thumbhash: "HAgGXxBVauaQSKZWmNmKFmhmhjAoCYMC" },
    },
    {
        id: "team-jun",
        userId: "team-jun",
        displayName: "Jun Park",
        username: "Jun Park",
        kind: "human",
    },
    {
        id: "team-deleted",
        userId: "team-deleted",
        displayName: "DELETED",
        username: "DELETED",
        kind: "human",
    },
];
/* Screenshot-safe inline artwork so the blueprint never loads a network asset. */
function demoImage(width: number, height: number, from: string, to: string): string {
    const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>` +
        `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
        `<stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>` +
        `</linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
/* Messages are full-bleed rows; specimens frame them in an app-surface card. */
function channelFrame(children: ReactNode, height?: string) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                ...(height ? { height } : { padding: "8px 0" }),
                overflow: "hidden",
                width: "680px",
            }}
        >
            {children}
        </div>
    );
}
export function MessagePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The chat column: rich-bodied messages with agent badges, reactions, attachments, and reply affordances inside a bottom-anchored scrolling list."
            title="Message · MessageList · DayDivider · SystemNotice"
        >
            <Specimen
                detail="Own (outgoing) → dark bubble, right, no avatar · incoming human → neutral bubble, left · agent → no bubble, on surface"
                label="Message — bubble variants"
                number="00"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <>
                            <Message
                                agent
                                author="Codex"
                                body="Deploy is green — cold-start retry landed and the device farm is clear."
                                initials="CX"
                                time="10:51"
                                tone="mint"
                            />
                            <Message
                                author="Maya Johnson"
                                body="Nice. Can you cut the release notes?"
                                time="10:52"
                                tone="amber"
                            />
                            <Message
                                author="Steve"
                                body="On it — publishing in five."
                                own
                                time="10:53"
                                tone="ocean"
                            />
                            <Message author="Steve" body="Done ✅" grouped own time="10:54" />
                        </>,
                    )}
                    <DimensionRule label="10px radius bubbles · own accent right · human neutral left · agent unbubbled" />
                </div>
            </Specimen>

            <Specimen
                detail="6px 20px row · 36px avatar + 12px gap · author 14/700 · time 11 mono · body 15/22"
                label="Message — rich body segments"
                number="01"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <Message
                            author="Maya Johnson"
                            body={[
                                {
                                    kind: "text",
                                    text: "Standup: notifications bug is the last blocker for Friday. ",
                                },
                                { kind: "mention", text: "Claude" },
                                { kind: "text", text: " can you take " },
                                { kind: "code", text: "MOB-217" },
                                { kind: "text", text: " and loop in " },
                                { kind: "mention", text: "Codex" },
                                { kind: "text", text: " per the " },
                                { kind: "link", text: "launch checklist" },
                                { kind: "text", text: "?" },
                            ]}
                            time="10:42"
                            tone="amber"
                        />,
                    )}
                    <DimensionRule label="680 px frame · text / mention / code / link segments" />
                </div>
            </Specimen>

            <Specimen
                detail="Accent AGENT badge · agent avatar (rounded square) · existing reactions"
                label="Message — agent author with reactions"
                number="02"
                stage="app"
            >
                {channelFrame(
                    <Message
                        agent
                        author="Codex"
                        body="Fix is up — moved token registration behind the handshake promise and added a cold-start retry."
                        initials="CX"
                        reactions={[
                            { count: 3, emoji: "🎉" },
                            { count: 2, emoji: "🚀" },
                            { active: true, count: 1, emoji: "✅" },
                        ]}
                        time="10:51"
                        tone="mint"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="children slot renders full-width below the body, 8px top margin"
                label="Message — attachment card"
                number="03"
                stage="app"
            >
                {channelFrame(
                    <Message
                        agent
                        author="Codex"
                        body={[
                            { kind: "text", text: "Diff for " },
                            { kind: "code", text: "fix/cold-start-push" },
                            { kind: "text", text: " is ready for review." },
                        ]}
                        initials="CX"
                        time="10:52"
                        tone="mint"
                    >
                        <DiffSnippet
                            file="src/push/register.ts"
                            lines={[
                                { kind: "meta", number: 41, text: "@@ async register(token) @@" },
                                {
                                    kind: "del",
                                    number: 42,
                                    text: "const lock = await mutex.tryLock()",
                                },
                                {
                                    kind: "add",
                                    number: 42,
                                    text: "const lock = await mutex.lock({ timeout: 5_000 })",
                                },
                                {
                                    kind: "context",
                                    number: 43,
                                    text: "if (!lock) return queue.enqueue(token)",
                                },
                            ]}
                            stats={{ added: 86, removed: 17 }}
                        />
                    </Message>,
                )}
            </Specimen>

            <Specimen
                detail="Inline photos render below the body as a clickable grid; click opens a web-modal lightbox"
                label="Message — photo attachments"
                number="04"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <Message
                            author="Nora Kim"
                            body="Device farm came back green across the board 🎉"
                            images={[
                                {
                                    id: "p1",
                                    alt: "Device farm results",
                                    height: 400,
                                    url: demoImage(640, 400, "#8b7cf7", "#f472b6"),
                                    width: 640,
                                },
                            ]}
                            onImageOpen={() => {}}
                            time="11:14"
                            tone="rose"
                        />,
                    )}
                    {channelFrame(
                        <Message
                            author="Nora Kim"
                            body=""
                            grouped
                            images={[
                                {
                                    id: "p0",
                                    alt: "Release dashboard",
                                    height: 420,
                                    url: demoImage(760, 420, "#a89bff", "#f472b6"),
                                    width: 760,
                                },
                            ]}
                            onImageOpen={() => {}}
                            time="11:14"
                        />,
                    )}
                    {channelFrame(
                        <Message
                            author="Nora Kim"
                            body="A page-tall screenshot keeps a usable width and crops; a small one stays its own size."
                            images={[
                                {
                                    id: "p2",
                                    alt: "Full-page screenshot",
                                    height: 3000,
                                    url: demoImage(900, 3000, "#8b7cf7", "#34d399"),
                                    width: 900,
                                },
                            ]}
                            onImageOpen={() => {}}
                            time="11:14"
                            tone="rose"
                        />,
                    )}
                    {channelFrame(
                        <Message
                            author="Nora Kim"
                            body=""
                            grouped
                            images={[
                                {
                                    id: "p3",
                                    alt: "Small sticker",
                                    height: 96,
                                    url: demoImage(96, 96, "#fbbf24", "#f87171"),
                                    width: 96,
                                },
                            ]}
                            onImageOpen={() => {}}
                            time="11:15"
                        />,
                    )}
                    {channelFrame(
                        <Message
                            author="Nora Kim"
                            body="And the before/after grid for the settings redesign:"
                            images={[
                                { id: "g1", url: demoImage(400, 400, "#60a5fa", "#34d399") },
                                { id: "g2", url: demoImage(400, 400, "#fbbf24", "#f87171") },
                                { id: "g3", url: demoImage(400, 400, "#a89bff", "#8b7cf7") },
                            ]}
                            onImageOpen={() => {}}
                            time="11:15"
                            tone="rose"
                        />,
                    )}
                    {channelFrame(
                        <Message
                            author="Nora Kim"
                            body="Deck and the standalone build are attached:"
                            time="11:16"
                            tone="rose"
                        >
                            <FileAttachment
                                name="Relay Flagship (standalone).html"
                                onOpen={() => {}}
                                size="283 KB"
                                variant="chat"
                            />
                        </Message>,
                    )}
                    <DimensionRule label="single ≤ 380 × 320 (aspect from metadata) · grid squares · media-only sits flush" />
                </div>
            </Specimen>

            <Specimen
                detail="grouped: no avatar/author row — the 11px mono time hides until hover (shown here), right-aligned in the 36px gutter with a 12px gap to the body"
                label="Message — grouped follow-ups"
                number="05"
                stage="app"
            >
                {channelFrame(
                    <>
                        <Message
                            author="Claude"
                            agent
                            body="On it. I reproduced the drop — notifications registered before the push token handshake finishes on cold start."
                            time="10:43"
                            tone="ember"
                        />
                        <Message
                            grouped
                            author="Claude"
                            body="Handing the fix to Codex and I'll draft release notes in parallel."
                            time="10:44"
                        />
                        <Message
                            grouped
                            author="Claude"
                            body={[
                                { kind: "text", text: "Tracking in " },
                                { kind: "code", text: "MOB-217" },
                                { kind: "text", text: "." },
                            ]}
                            time="10:44"
                        />
                    </>,
                )}
            </Specimen>

            <Specimen
                detail="Consecutive author grouping removes repeated identity; sending changes opacity only and preserves every box"
                label="Message — grouped + sending"
                number="07"
                stage="app"
            >
                {channelFrame(
                    <>
                        <Message
                            author="Maya Johnson"
                            body="The release note is ready to publish."
                            time="11:02"
                            tone="amber"
                        />
                        <Message
                            author="Maya Johnson"
                            body="Waiting for the final server acknowledgement."
                            deliveryState="sending"
                            grouped
                            time="11:03"
                        />
                    </>,
                )}
                <DimensionRule label="identical row geometry before / during delivery" />
            </Specimen>

            <Specimen
                detail="String body renders as Markdown — headings, lists, emphasis, inline + fenced code, isolated Mermaid diagrams, and safe links, all on theme tokens"
                label="Message — Markdown body (complete)"
                number="08"
                stage="app"
            >
                {channelFrame(
                    <Message
                        agent
                        author="Codex"
                        body={
                            "## Cold-start fix\n\n" +
                            "Moved token registration behind the **handshake promise** and added a *cold-start* retry.\n\n" +
                            "- Registers after `handshake.settled`\n" +
                            "- Retries once on `isColdStart()`\n\n" +
                            "```ts\nawait handshake.settled;\nconst token = await requestPushToken({ retry: isColdStart() });\n```\n\n" +
                            "```mermaid\nflowchart LR\n  Handshake --> Token\n  Token --> Retry\n```\n\n" +
                            "See the [launch checklist](https://example.com/launch) for the rollout steps."
                        }
                        generationStatus="complete"
                        initials="CX"
                        time="10:58"
                        tone="mint"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="Streaming: incomplete inline syntax is suppressed and a static caret marks the live cursor; content stays full opacity"
                label="Message — Markdown body (streaming)"
                number="09"
                stage="app"
            >
                {channelFrame(
                    <Message
                        agent
                        author="Codex"
                        body={"## Result\n\n- **par"}
                        generationStatus="streaming"
                        initials="CX"
                        time="10:58"
                        tone="mint"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="11/700 mono uppercase pill (inset bg, radius 999) between hairline segments"
                label="DayDivider"
                number="10"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <>
                            <DayDivider label="Yesterday" />
                            <DayDivider label="Today" />
                            <DayDivider label="Monday, June 30" />
                        </>,
                    )}
                    <DimensionRule label="20 px pill · 12 px gap to hairlines" />
                </div>
            </Specimen>

            <Specimen
                detail="Centered service line · 14px leading glyph + 8px gap · 13/20 muted text · @user / #channel refs color-lifted (no pill)"
                label="SystemNotice — membership announcements"
                number="13"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <>
                            <SystemNotice text="@ada joined #welcome" />
                            <SystemNotice text="@bob joined the server" />
                            <SystemNotice text="@caroline-ng was added to #announcements by @ada" />
                        </>,
                    )}
                    <DimensionRule label="680 px frame · icon faint · refs at text-secondary weight 500" />
                </div>
            </Specimen>

            <Specimen
                detail="The service line for a message the agent took mid-run, quoting that message so the moment reads on its own"
                label="SteeringNotice — steering applied"
                number="14"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <>
                            <SteeringNotice
                                quote="Also check the retry budget before you touch the scheduler."
                                text="@ada steered @fixer"
                            />
                            <SteeringNotice
                                quote="stop after the migration"
                                text="@bob steered @fixer"
                            />
                        </>,
                    )}
                    <DimensionRule label="line at 13/20 · quote capped at 560 px, centered" />
                </div>
            </Specimen>

            <Specimen
                detail="Sparse history bottom-anchors against the 12px padding, so a short conversation sits on the composer instead of floating at the top"
                label="MessageList — bottom anchor"
                number="11"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <MessageList>
                            <DayDivider label="Today" />
                            <Message
                                author="Maya Johnson"
                                body="Standup: notifications bug is the last blocker."
                                time="10:42"
                                tone="amber"
                            />
                            <Message
                                compact
                                author="Maya Johnson"
                                body="Kicking off the fix now."
                                time="10:43"
                            />
                        </MessageList>,
                        "400px",
                    )}
                    <DimensionRule label="400 px viewport · newest message pinned to the bottom" />
                </div>
            </Specimen>

            <Specimen
                detail="Overflowing history mounts scrolled to the newest message and follows appended content unless the reader scrolls up"
                label="MessageList — long history"
                number="12"
                stage="app"
            >
                {channelFrame(
                    <MessageList>
                        <DayDivider label="Yesterday" />
                        <Message
                            author="Maya Johnson"
                            body="Kickoff notes are in the doc — mobile v2 scope is locked."
                            time="09:58"
                            tone="amber"
                        />
                        <Message
                            agent
                            author="Claude"
                            body="I filed the remaining QA tasks and assigned owners."
                            time="10:05"
                            tone="ember"
                        />
                        <DayDivider label="Today" />
                        <Message
                            author="Maya Johnson"
                            body={[
                                { kind: "text", text: "Standup: " },
                                { kind: "mention", text: "Claude" },
                                { kind: "text", text: " can you take " },
                                { kind: "code", text: "MOB-217" },
                                { kind: "text", text: "?" },
                            ]}
                            time="10:42"
                            tone="amber"
                        />
                        <Message
                            agent
                            author="Claude"
                            body="On it. I reproduced the drop — registering before the handshake finishes."
                            time="10:43"
                            tone="ember"
                        />
                        <Message
                            agent
                            author="Codex"
                            body="Fix is up — cold-start retry added, tests green."
                            initials="CX"
                            reactions={[
                                { count: 3, emoji: "🎉" },
                                { count: 2, emoji: "🚀" },
                            ]}
                            time="10:51"
                            tone="mint"
                        />
                        <Message
                            author="Sasha K."
                            body="Reviewing now. If it's green on the device farm we're clear for Friday."
                            time="10:54"
                            tone="ocean"
                        />
                    </MessageList>,
                    "360px",
                )}
            </Specimen>
            <Specimen
                detail="onAuthorSelect makes the avatar and author name clickable to open the author's profile — same geometry, adds cursor, hover, and focus ring; grouped follow-ups have no affordance"
                label="Message — clickable identity"
                number="13"
                stage="app"
            >
                {channelFrame(
                    <>
                        <Message
                            author="Maya Johnson"
                            body="Tap my name or avatar to open my profile in the panel."
                            onAuthorSelect={() => {}}
                            time="10:42"
                            tone="amber"
                        />
                        <Message
                            agent
                            author="Codex"
                            body="Agent identities open a profile too."
                            initials="CX"
                            onAuthorSelect={() => {}}
                            time="10:43"
                            tone="mint"
                        />
                        <Message
                            grouped
                            author="Codex"
                            body="Grouped follow-ups stay non-interactive — no repeated identity to click."
                            onAuthorSelect={() => {}}
                            time="10:44"
                        />
                    </>,
                )}
                <DimensionRule label="clickable avatar + name · grouped rows carry no profile affordance" />
            </Specimen>

            <Specimen
                detail="automated: a plugin/API posted on the author's behalf. The author identity stays; a quiet Automated marker sits after the name (incoming), on the first line inside an own bubble, or above own media when there is no text. It is not the agent treatment, and a hand-typed follow-up starts a new group so it never inherits the marker."
                label="Message — automated attribution"
                number="14"
                stage="app"
            >
                <div style={column}>
                    {channelFrame(
                        <>
                            <Message
                                author="Maya Johnson"
                                automated
                                body="Standup summary posted: 3 PRs merged, 1 review pending."
                                time="9:02"
                                tone="amber"
                            />
                            <Message
                                author="Maya Johnson"
                                body="I'll take the pending review after lunch."
                                time="9:05"
                                tone="amber"
                            />
                            <Message
                                author="Steve"
                                automated
                                body="Scheduled release notes published to #announcements."
                                own
                                time="9:10"
                                tone="ocean"
                            />
                            <Message
                                author="Steve"
                                automated
                                body=""
                                images={[
                                    {
                                        id: "automated-media",
                                        alt: "Automated release report",
                                        height: 320,
                                        url: demoImage(480, 320, "#a89bff", "#34d399"),
                                        width: 480,
                                    },
                                ]}
                                own
                                time="9:11"
                                tone="ocean"
                            />
                        </>,
                    )}
                    <DimensionRule label="marker stays visible without hover · manual reply is a separate group" />
                </div>
            </Specimen>

            <Specimen
                detail="collapsed tool-only summaries preserve a readable row without inventing message content"
                label="Message — empty summary"
                number="15"
                stage="app"
            >
                {channelFrame(
                    <Message
                        agent
                        author="Happy"
                        body=""
                        emptyText="(no text)"
                        time="9:14"
                        tone="mint"
                    />,
                )}
                <DimensionRule label="italic · secondary text · 64% opacity" />
            </Specimen>

            <Specimen
                detail="a message that arrived from another session wears that session's generated mark instead of initials"
                label="Message — from another session"
                number="16"
                stage="app"
            >
                {channelFrame(
                    <>
                        <Message
                            author="Inspect workspace status"
                            avatarSessionId="rj3ssbvts1t0wqrn39af3prx"
                            body="Background work completed."
                            time="9:14"
                        />
                        <Message
                            author="Migrate the plugin permission table"
                            avatarSessionId="cm4x81kq0000zt6hf2b9d7we"
                            body="Background work completed."
                            time="9:16"
                        />
                    </>,
                )}
                <DimensionRule label="mark 12 · the identity gutter, same slot as an initials avatar" />
            </Specimen>

            <Specimen
                detail="a standing fact about the message, printed once under the name it is a fact about — where another person's message stands with respect to the agent's context. Unlike the hover metadata it never appears or disappears with the pointer, and an own message never carries one."
                label="Message — context note"
                number="17"
                stage="app"
            >
                {channelFrame(
                    <>
                        <Message
                            author="Jun Park"
                            body="Does the blocking lock hold across the retry?"
                            contextNote="In the agent's context"
                            initials="JP"
                            time="9:44"
                        />
                        <Message
                            author="Maya Kovacs"
                            body="Check the cold-start path too."
                            contextNote="Waiting to reach the agent"
                            initials="MK"
                            time="9:45"
                        />
                        <Message
                            author="Amara Achebe"
                            body="This one was written a long way back in the run."
                            contextNote="Outside the agent's context"
                            initials="AA"
                            time="9:46"
                        />
                    </>,
                )}
                <DimensionRule label="12/16 secondary line · shares the author line's 12 px inset" />
            </Specimen>
            <Specimen
                detail="User ID and minimal profile travel with the message · API ThumbHash avatar, initials-only, and deleted identity"
                label="Message — team user profiles"
                number="18"
                stage="app"
            >
                {channelFrame(
                    teamAuthors.map((sender) => (
                        <ConversationEntryView
                            key={sender.id}
                            entry={{
                                kind: "message",
                                source: "server",
                                delivery: "sent",
                                message: {
                                    id: `message:${sender.id}`,
                                    chatId: "team-conversation",
                                    sequence: "1",
                                    changePts: "1",
                                    sender,
                                    text: "This message keeps its author's current name and avatar.",
                                    reactions: [],
                                    attachments: [],
                                    createdAt: "2026-01-01T10:00:00.000Z",
                                },
                            }}
                        />
                    )),
                )}
            </Specimen>
        </ComponentPage>
    );
}
