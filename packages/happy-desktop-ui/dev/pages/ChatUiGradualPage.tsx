import type { ReactNode } from "react";
import {
    type ConversationMediaItem,
    type ConversationQuickReplies,
    type ProviderCli,
    type ReplyProviderId,
    type ReplyUi,
} from "happy-desktop-state";
import {
    conversationQuickRepliesLayout,
    messageContentMeasure,
} from "../../src/conversationRowHeight";
import { UiProviderSignIn } from "../../src/ui/UiLiveWidgets";
import { UiProviderSignInRow } from "../../src/ui/UiProviderSignInRow";
import { UiMedia } from "../../src/ui/UiMedia";
import { UiQuickReplies } from "../../src/ui/UiQuickReplies";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import {
    Agent,
    ChatColumn,
    cliFailed,
    cliFixture,
    cliMissing,
    cliSignedIn,
    cliWaiting,
    Person,
    Stage,
} from "./chatUiSpecimen";
import {
    complaintConnect,
    complaintCreateProfile,
    generatedLandscape,
    generatedPortrait,
    generatedSquare,
    readFlat,
    readNarrow,
    readWide,
    readWideSecond,
    thumbnails,
} from "./conversationMediaLayoutFixtures";

/*
 * Chat UI, change 2: the gradual provider sign-in (quick replies about each
 * AI, then one provider row at a time), quick replies on the agent's edge at
 * one width, and `media` in justified rows. Fixture data only.
 */
export const componentNumber = "C-338x";

/** The conversation row's width these specimens draw at, as the message list gives it. */
const ROW_WIDTH = 640;
const STILL = 0;

const act = () => new Promise<never>(() => undefined);
const control = { act, allowed: () => true };
/** A row whose sign-in the person already used, so it reads as connected. */
const usedControl = {
    ...control,
    attempt: {
        action: { type: "provider_sign_in.sign_in", payload: {} },
        outcome: { status: "accepted" as const },
    },
};

const CLAUDE_OUT = cliFixture("claude");
const CLAUDE_ONE = cliSignedIn("claude", [{ label: "ada@example.com", plan: "Max" }]);
const GROK_MISSING = cliMissing("grok");

const about = (provider: ReplyProviderId): ReplyUi => ({ type: "provider", props: { provider } });

/**
 * A suggestion as the conversation carries it, drawn at the row's width. The
 * wrapper names the heights the layout gave it, for the row-height check.
 */
function Replies(props: {
    readonly options: readonly (
        | string
        | { readonly text: string; readonly about: ReplyProviderId }
    )[];
    readonly chosen?: number;
    /** The row's width; the column's own by default. */
    readonly width?: number;
}) {
    const ui = props.options.map((option) =>
        typeof option === "string" ? null : about(option.about),
    );
    const replies: ConversationQuickReplies = {
        messageId: "msgfixture-replies",
        options: props.options.map((option) => (typeof option === "string" ? option : option.text)),
        ...(ui.some((entry) => entry !== null) ? { ui } : {}),
        live: props.chosen === undefined,
        ...(props.chosen === undefined ? {} : { chosen: props.chosen }),
    };
    const layout = conversationQuickRepliesLayout(replies, props.width ?? ROW_WIDTH);
    return (
        <div
            data-layout-height={layout.height}
            data-layout-pills={layout.pillHeights.join(" ")}
            style={{ display: "flex", flexDirection: "column" }}
        >
            <UiQuickReplies layout={layout} onSend={() => undefined} replies={replies} />
        </div>
    );
}

const signIn = (cli: ProviderCli, account?: "new", used?: boolean) => (
    <UiProviderSignIn
        {...(account ? { account } : {})}
        cli={cli}
        control={used ? usedControl : control}
        onPageOpen={() => undefined}
        provider={cli.id}
        spinnerFrame={STILL}
    />
);

const media = (items: readonly ConversationMediaItem[], labels?: readonly string[]) => (
    <UiMedia
        items={items}
        {...(labels ? { labels } : {})}
        onItemOpen={() => undefined}
        width={messageContentMeasure(ROW_WIDTH, "agent")}
    />
);

type Screen = {
    readonly id: string;
    readonly label: string;
    readonly height: number;
    /** A column narrower than the conversation's usual one. */
    readonly column?: number;
    readonly body: () => ReactNode;
};

/**
 * The narrowest conversation a row draws in: at Happy's 720px window minimum
 * the app's agent text is 274px and a row's frame 298px, measured in hidden
 * Electron; this column gives the specimen the same frame.
 */
const NARROWEST = 368;

const NOOP = () => undefined;
const ROW_ACTIONS = {
    onSignIn: NOOP,
    onCode: NOOP,
    onToken: NOOP,
    onCancel: NOOP,
    onPageOpen: NOOP,
};
const CODEX_ONE_ROW = cliSignedIn("codex", [{ label: "ada@example.com", plan: "Pro" }]);
const CLAUDE_TWO = cliSignedIn("claude", [
    { label: "ada@example.com", plan: "Max" },
    { label: "grace@example.com", plan: "Max" },
]);
const installing = (cli: ProviderCli): ProviderCli => ({
    ...cli,
    operation: {
        id: "op-1",
        kind: "install",
        status: "running",
        message: "Downloading from claude.ai",
        authorization: null,
        output: [],
        error: null,
        startedAt: 0,
        finishedAt: null,
    },
});
const lapsedOne: ProviderCli = {
    ...CLAUDE_TWO,
    accounts: CLAUDE_TWO.accounts!.map((account, index) =>
        index === 1 ? { ...account, signIn: "signed_out" as const } : account,
    ),
};

/** Every state a sign-in row goes through, each in the one box the row keeps. */
const ROW_STATES: readonly {
    readonly label: string;
    readonly row: () => ReactNode;
}[] = [
    {
        label: "checking",
        row: () => <UiProviderSignInRow provider="claude" spinnerFrame={STILL} />,
    },
    {
        label: "missing",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                cli={cliMissing("antigravity")}
                provider="antigravity"
            />
        ),
    },
    {
        label: "signed out",
        row: () => <UiProviderSignInRow {...ROW_ACTIONS} cli={CLAUDE_OUT} provider="claude" />,
    },
    {
        label: "signed in, Use",
        row: () => <UiProviderSignInRow {...ROW_ACTIONS} cli={CLAUDE_ONE} provider="claude" />,
    },
    {
        label: "installing",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                cli={installing(cliMissing("claude"))}
                provider="claude"
                spinnerFrame={STILL}
            />
        ),
    },
    {
        label: "signing in",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                cli={CLAUDE_OUT}
                provider="claude"
                requesting
                spinnerFrame={STILL}
            />
        ),
    },
    {
        label: "waiting on the browser",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                cli={cliWaiting(CLAUDE_OUT)}
                provider="claude"
                spinnerFrame={STILL}
            />
        ),
    },
    {
        label: "device code",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                cli={cliWaiting(CODEX_ONE_ROW, { userCode: "WXYZ-8F3K" })}
                provider="codex"
                spinnerFrame={STILL}
            />
        ),
    },
    {
        label: "code field",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                cli={cliWaiting(CLAUDE_OUT, { acceptsCode: true })}
                provider="claude"
                spinnerFrame={STILL}
            />
        ),
    },
    {
        label: "token field",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                cli={cliFailed(CLAUDE_OUT, "The sign-in page closed before it finished")}
                provider="claude"
                tokenOpen
            />
        ),
    },
    {
        label: "adding account 2",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                account="new"
                cli={cliWaiting(CODEX_ONE_ROW)}
                provider="codex"
                spinnerFrame={STILL}
            />
        ),
    },
    {
        label: "failed",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                cli={cliFailed(CLAUDE_OUT, "The sign-in page closed before it finished")}
                provider="claude"
            />
        ),
    },
    {
        label: "refused",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                cli={CLAUDE_OUT}
                error="Another sign-in for Claude Code is already running"
                provider="claude"
            />
        ),
    },
    {
        label: "one account signed out",
        row: () => <UiProviderSignInRow {...ROW_ACTIONS} cli={lapsedOne} provider="claude" />,
    },
    {
        label: "done",
        row: () => <UiProviderSignInRow {...ROW_ACTIONS} cli={CLAUDE_ONE} provider="claude" used />,
    },
    {
        label: "done, add another",
        row: () => (
            <UiProviderSignInRow
                {...ROW_ACTIONS}
                account="new"
                cli={CLAUDE_TWO}
                provider="claude"
            />
        ),
    },
];

/** The row states one under another, each named, for the size check. */
function RowStates() {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {ROW_STATES.map((state) => (
                <div data-row-state={state.label} key={state.label}>
                    <div
                        style={{
                            color: "var(--text-secondary)",
                            font: "12px/16px var(--happy-font-mono)",
                            marginBottom: "4px",
                        }}
                    >
                        {state.label}
                    </div>
                    {state.row()}
                </div>
            ))}
        </div>
    );
}

const NARROW = 440;
const NARROW_OPTIONS = [
    { text: "Add another Claude Code account", about: "claude" as const },
    { text: "Add another Codex account", about: "codex" as const },
    "Show me every file you changed and why, then open the pull request once I've read it",
    "Not yet",
];

const SCREENS: readonly Screen[] = [
    {
        id: "01-sign-in-ask",
        label: "Sign-in · which AI",
        height: 400,
        body: () => (
            <>
                <Agent body="Which AI should I work with? Pick one to start — you can add more later." />
                <Replies
                    options={[
                        { text: "Add another Codex account", about: "codex" },
                        { text: "Sign in to Claude Code", about: "claude" },
                        { text: "Set up Grok", about: "grok" },
                        "Skip for now",
                    ]}
                />
            </>
        ),
    },
    {
        id: "02-sign-in-row",
        label: "Sign-in · the one row",
        height: 300,
        body: () => (
            <>
                <Person body="Sign in to Claude Code" suggested />
                <Agent body="Sign in with your Claude account:">{signIn(CLAUDE_OUT)}</Agent>
            </>
        ),
    },
    {
        id: "03-sign-in-browser",
        label: "Sign-in · finish in the browser",
        height: 300,
        body: () => (
            <>
                <Person body="Sign in to Claude Code" suggested />
                <Agent body="Sign in with your Claude account:">
                    {signIn(cliWaiting(CLAUDE_OUT))}
                </Agent>
            </>
        ),
    },
    {
        id: "04-sign-in-code",
        label: "Sign-in · paste the code",
        height: 300,
        body: () => (
            <>
                <Person body="Sign in to Claude Code" suggested />
                <Agent body="Claude's page shows a code when you approve. Paste it here.">
                    {signIn(cliWaiting(CLAUDE_OUT, { acceptsCode: true }))}
                </Agent>
            </>
        ),
    },
    {
        id: "05-sign-in-failed",
        label: "Sign-in · failed",
        height: 300,
        body: () => (
            <>
                <Person body="Sign in to Claude Code" suggested />
                <Agent body="That sign-in didn't finish. Try again, or use a setup token.">
                    {signIn(cliFailed(CLAUDE_OUT, "The sign-in page closed before it finished"))}
                </Agent>
            </>
        ),
    },
    {
        id: "06-sign-in-next",
        label: "Sign-in · done, the next replies",
        height: 480,
        body: () => (
            <>
                <Agent body="Claude Code is connected.">
                    {signIn(CLAUDE_ONE, undefined, true)}
                </Agent>
                <Agent body="Want another AI, or another account?" />
                <Replies
                    options={[
                        { text: "Add another Claude Code account", about: "claude" },
                        { text: "Add another Codex account", about: "codex" },
                        "That's all for now",
                    ]}
                />
            </>
        ),
    },
    {
        id: "07-sign-in-another-account",
        label: "Sign-in · another account",
        height: 300,
        body: () => (
            <>
                <Person body="Add another Claude Code account" suggested />
                <Agent body="Sign in with the other Claude account:">
                    {signIn(cliWaiting(CLAUDE_ONE), "new")}
                </Agent>
            </>
        ),
    },
    {
        id: "08-sign-in-missing",
        label: "Sign-in · not installed",
        height: 300,
        body: () => (
            <>
                <Person body="Set up Grok" suggested />
                <Agent body="Grok isn't on this computer yet. Set it up and I'll open its sign-in.">
                    {signIn(GROK_MISSING)}
                </Agent>
            </>
        ),
    },
    {
        id: "09-replies-plain",
        label: "Quick replies · plain",
        height: 320,
        body: () => (
            <>
                <Agent body="Should I open the pull request now?" />
                <Replies options={["Yes, open it", "Not yet", "Show me the diff first"]} />
            </>
        ),
    },
    {
        id: "10-replies-chosen",
        label: "Quick replies · one chosen",
        height: 360,
        body: () => (
            <>
                <Agent body="Should I open the pull request now?" />
                <Replies
                    chosen={2}
                    options={["Yes, open it", "Not yet", "Show me the diff first"]}
                />
                <Person body="Show me the diff first" suggested />
            </>
        ),
    },
    {
        id: "11-replies-long",
        label: "Quick replies · past the cap",
        height: 320,
        body: () => (
            <>
                <Agent body="How should I handle the failing migration?" />
                <Replies
                    options={[
                        "Roll it back and write a new migration that keeps the old column until every client has moved",
                        "Fix it forward",
                        "Leave it",
                    ]}
                />
            </>
        ),
    },
    {
        id: "12-media-one",
        label: "Media · one",
        height: 420,
        body: () => (
            <Agent body="The new overview:">{media([readWide], ["Overview · 1440 × 900"])}</Agent>
        ),
    },
    {
        id: "13-media-one-tall",
        label: "Media · one tall",
        height: 560,
        body: () => <Agent body="A tall one sits on the left:">{media([generatedPortrait])}</Agent>,
    },
    {
        id: "14-media-two",
        label: "Media · a wide and a tall",
        height: 360,
        body: () => (
            <Agent body="The same screen on desktop and on a phone:">
                {media([readWideSecond, generatedPortrait], ["Desktop", "Phone"])}
            </Agent>
        ),
    },
    {
        id: "15-media-four",
        label: "Media · four",
        height: 520,
        body: () => (
            <Agent body="Four directions for the header art. Which one?">
                {media(thumbnails.slice(0, 4), ["Warm", "Coast", "Lilac", "Meadow"])}
            </Agent>
        ),
    },
    {
        id: "16-media-ten",
        label: "Media · ten, mixed shapes",
        height: 860,
        body: () => {
            const items = [
                complaintCreateProfile,
                complaintConnect,
                generatedLandscape,
                generatedSquare,
                generatedPortrait,
                readFlat,
                readNarrow,
                ...thumbnails.slice(0, 3),
            ];
            return (
                <Agent body="Every screen I captured, with what each is:">
                    {media(items, [
                        "Create profile",
                        "Connect",
                        "Dusk valley",
                        "Lake morning",
                        "Ridge at night",
                        "Header strip",
                        "Sidebar",
                        "Warm",
                        "Coast",
                        "A label long enough that it runs past its picture",
                    ])}
                </Agent>
            );
        },
    },
    {
        id: "17-replies-narrow",
        label: "Quick replies · narrow column, two lines then an ellipsis",
        height: 460,
        column: NARROW,
        body: () => (
            <>
                <Agent body="Claude Code and Codex are connected. What next?" />
                <Replies options={NARROW_OPTIONS} width={NARROW} />
            </>
        ),
    },
    {
        id: "18-replies-narrow-chosen",
        label: "Quick replies · narrow column, chosen: no height changes",
        height: 560,
        column: NARROW,
        body: () => (
            <>
                <Agent body="Claude Code and Codex are connected. What next?" />
                <Replies chosen={0} options={NARROW_OPTIONS} width={NARROW} />
                <Person body="Add another Claude Code account" suggested />
            </>
        ),
    },
    {
        id: "19-row-states",
        label: "Sign-in row · every state, one box",
        height: 1700,
        body: () => (
            <Agent body="Every state the row goes through:">
                <RowStates />
            </Agent>
        ),
    },
    {
        id: "20-row-states-narrowest",
        label: "Sign-in row · every state at the narrowest column",
        height: 1700,
        column: NARROWEST,
        body: () => (
            <Agent body="Every state the row goes through:">
                <RowStates />
            </Agent>
        ),
    },
];

export function ChatUiGradualPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Chat UI change 2. Provider sign-in one step at a time: quick replies about each AI with its live note, then one provider row. Quick replies on the agent's edge, every pill the widest one's width. Media in justified rows from the items' own sizes. Fixture data."
            title="Chat UI: gradual sign-in, quick replies and media"
        >
            <div className="specimen-grid">
                {SCREENS.map((screen) => (
                    <FullScreenSpecimen
                        detail={screen.id}
                        key={screen.id}
                        label={screen.label}
                        number={`${componentNumber}-${screen.id.slice(0, 2)}`}
                        screen={screen.id}
                        window={{
                            width: (screen.column ?? ROW_WIDTH) + 120,
                            height: screen.height,
                        }}
                    >
                        <Stage>
                            <ChatColumn
                                {...(screen.column === undefined ? {} : { width: screen.column })}
                            >
                                {screen.body()}
                            </ChatColumn>
                        </Stage>
                    </FullScreenSpecimen>
                ))}
            </div>
        </ComponentPage>
    );
}
