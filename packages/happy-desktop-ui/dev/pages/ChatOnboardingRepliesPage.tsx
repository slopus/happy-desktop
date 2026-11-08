import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ChatActionChoice,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
    type HappyAgentDefaultModelSnapshot,
    type ProviderCli,
} from "happy-desktop-state";
import type { ChatActionFigures } from "../../src/ChatActionBlock";
import {
    ChatDefaultModelFigure,
    ChatInviteFigure,
    ChatMembersFigure,
    ChatProviderCliFigure,
} from "../../src/ChatActionFigures";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { MessageSettingsLinksContext } from "../../src/MessageMarkdown";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-033";

const noop = () => undefined;

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "chat-onboarding-replies",
    submission: { status: "idle" },
    text: "",
};

/*
 * Fixture data only: nothing is installed or signed in to draw these, and the
 * people and accounts are made up.
 */
const CLAUDE: ProviderCli = {
    id: "claude",
    name: "Claude Code",
    vendor: "Anthropic",
    website: "https://claude.com/claude-code",
    providerId: "claude",
    installation: { status: "missing", path: null, version: null, source: null, desktopApp: null },
    installer: {
        command: "curl -fsSL https://claude.ai/install.sh | bash",
        sourceUrl: "https://claude.ai/install.sh",
        sourceHost: "claude.ai",
        vendorSite: "https://claude.com/claude-code",
    },
    commands: { run: "claude", signIn: "claude /login" },
    signIn: { status: "signed_out", account: null, methods: ["browser"] },
    operation: null,
    version: "0199a000-0000-7000-8000-000000000002",
    updatedAt: 0,
};

const CODEX: ProviderCli = {
    ...CLAUDE,
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    website: "https://openai.com/codex",
    providerId: "codex",
    installation: {
        status: "installed",
        path: "/Users/you/.local/bin/codex",
        version: "0.61.0",
        source: "standalone",
        desktopApp: null,
    },
    signIn: {
        status: "signed_in",
        account: { email: "you@example.com", plan: "Plus" },
        methods: ["browser"],
    },
};

const CLIS = new Map([CLAUDE, CODEX].map((cli) => [cli.id, cli]));

const MODELS: HappyAgentDefaultModelSnapshot = {
    loading: false,
    current: { providerId: "codex", modelId: "openai/gpt-6.1-sol", effort: "medium" },
    choices: [
        {
            providerId: "codex",
            providerName: "Codex",
            modelId: "openai/gpt-6.1-sol",
            modelName: "GPT-6.1 Sol",
            efforts: ["low", "medium", "high", "xhigh"],
            defaultEffort: "medium",
        },
    ],
};

const FIGURES: ChatActionFigures = {
    providerCli: (cliId) => (
        <ChatProviderCliFigure
            cliId={cliId}
            {...(CLIS.get(cliId) ? { cli: CLIS.get(cliId)! } : {})}
            onCancel={noop}
            onCodeSend={noop}
            onInstall={noop}
            onPageOpen={noop}
            onSignIn={noop}
            spinnerFrame={0}
        />
    ),
    defaultModel: <ChatDefaultModelFigure onChange={noop} spinnerFrame={0} state={MODELS} />,
    invite: (role) => (
        <ChatInviteFigure
            creating={false}
            loading={false}
            manage
            onCreate={noop}
            onCreatedDismiss={noop}
            owner
            {...(role ? { role } : {})}
            roles={[
                { id: "owner", name: "Owner" },
                { id: "admin", name: "Admin" },
                { id: "member", name: "Member" },
                { id: "viewer", name: "Viewer" },
            ]}
        />
    ),
    members: () => (
        <ChatMembersFigure
            loading={false}
            onInviteRevoke={noop}
            rows={[
                {
                    id: "acc-olga",
                    kind: "member",
                    name: "Olga Petrova (you)",
                    role: "Owner",
                    status: "Joined Nov 8",
                    pending: false,
                    saving: false,
                },
                {
                    id: "inv-1",
                    kind: "invite",
                    name: "Invite code",
                    role: "Member",
                    status: "Waiting · Expires in 7 days",
                    pending: true,
                    saving: false,
                },
            ]}
            summary="1 person · 1 code waiting"
        />
    ),
    teamSettings: true,
};

const SETTINGS_LINKS = { has: () => true, open: noop };

/* Onboarding runs in the Chief of Staff bot's conversation, which speaks under its live name. */
const CHIEF_OF_STAFF: ConversationAuthor = { ...agentAuthor, displayName: "Chief of Staff" };

let sequence = 0;
function message(
    sender: ConversationAuthor,
    body: string,
    choices: Readonly<Record<string, ChatActionChoice>> = {},
    live = false,
): ConversationEntry {
    sequence += 1;
    const id = `m-${String(sequence).padStart(3, "0")}`;
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        messageId: id,
        actions: { blockStart: 0, choices, live },
        message: {
            id,
            chatId: "chat-onboarding-replies",
            sequence: id,
            changePts: id,
            sender,
            text: body,
            attachments: [],
            reactions: [],
            createdAt: `2026-11-08T10:${String(sequence).padStart(2, "0")}:00.000Z`,
        },
    };
}
/* A reply nobody has answered yet is the live one, and takes presses. */
const agent = (body: string, choices?: Readonly<Record<string, ChatActionChoice>>) =>
    message(agentAuthor, body, choices, choices === undefined);
const person = (body: string) => message(happyAgentOwnerAuthor, body);

/* A local first run: every block kind, and the pairs a reply puts them in. */
const LOCAL: readonly ConversationEntry[] = [
    agent(
        `Hi, I'm Happy. Let's get you working with an AI in a few minutes.

First, which AIs do you already use? Tick every one you pay for.

<form data-action="reply">
  <label><input type="checkbox" value="claude" checked> Claude <small>Claude Pro or Max</small></label>
  <label><input type="checkbox" value="codex" checked> ChatGPT <small>Plus or Pro, through Codex</small></label>
  <label><input type="checkbox" value="gemini"> Gemini</label>
  <button type="submit" data-emphasis data-empty-label="None yet">Use these</button>
</form>`,
        { "0": { kind: "checklist", values: ["claude", "codex"] } },
    ),
    person("Claude and ChatGPT"),
    agent(`Claude Code isn't on this computer yet, and Codex is ready. Install Claude Code here and sign in; it opens your browser once.

<figure data-provider-cli="claude"></figure>

<figure data-provider-cli="codex"></figure>

<menu>
  <button data-action="reply" data-emphasis>Both are ready</button>
  <button data-action="reply" data-text="I'd rather do it myself in a terminal">I'd rather do it myself</button>
</menu>`),
    person("Both are ready"),
    agent(`<ol data-steps>
  <li data-status="done" data-mark="claude">Claude Code installed <small>2.1.4 in ~/.local/bin</small></li>
  <li data-status="done" data-mark="openai">Codex signed in <small>you@example.com</small></li>
  <li data-status="running">First answer</li>
</ol>

<output data-status="done">Claude answered in 1.2 s.</output>

New chats use this model. You can change it here or in Settings any time.

<figure data-setting="default-model"></figure>

<menu>
  <button data-action="reply" data-emphasis>Keep it</button>
  <button data-action="reply">Change it later</button>
</menu>`),
    person("Keep it"),
    agent(`Want me to look for projects you worked on recently? I only read folder names and Git branches.

<form data-action="reply" data-table data-columns="Use|Project|Branch|Changed">
  <label><input type="checkbox" value="desktop" checked> happy-desktop <small>~/code/happy-desktop</small><small>main</small><small>2 hours ago</small></label>
  <label><input type="checkbox" value="agent"> happy-agent <small>~/code/happy-agent</small><small>chat-onboarding</small><small>yesterday</small></label>
  <button type="submit" data-emphasis>Add projects</button>
  <button type="button" data-action="reply" data-text="Not now">Not now</button>
</form>`),
    person("Add projects"),
    agent(`I'll keep watching these places:

<ul data-tree>
  <li>~/code
    <ul>
      <li>happy-desktop</li>
      <li>happy-agent</li>
    </ul>
  </li>
</ul>

<menu>
  <button data-action="reply" data-emphasis>Looks right</button>
  <button data-action="reply">Change it</button>
</menu>`),
    person("Looks right"),
    agent(`Happy is on your phone too. Scan a code to get the app, then pair it here.

<figure data-phone-app></figure>

<menu>
  <button data-action="reply" data-emphasis>I have the app</button>
  <button data-action="reply">Not now</button>
</menu>`),
    person("Not now"),
    agent(`If your browser showed a code instead, paste it here.

<form data-action="onboarding.next" data-step="sign-in-code">
  <input type="text" placeholder="Paste the code">
  <button type="submit" data-emphasis>Send code</button>
</form>

<output data-status="info">Your profile is saved on this computer only.</output>`),
];

/* A team owner's setup, where invites and members follow one another. */
const TEAM: readonly ConversationEntry[] = [
    agent(
        `Welcome to Acme, Olga. You own this server, so you decide who joins and which AI the team uses.

<menu>
  <button data-action="onboarding.next" data-step="team" data-emphasis>Set up my team</button>
  <button data-action="reply">Look around first</button>
</menu>`,
        { "0": { kind: "button", index: 0 } },
    ),
    person("Set up my team"),
    agent(`Invite your teammates. Each code works for a week, for anyone you send it to.

<figure data-invite data-role="member"></figure>

Everyone on Acme, and the codes still waiting:

<figure data-members></figure>

<menu>
  <button data-action="onboarding.next" data-step="invited" data-emphasis>Done inviting</button>
  <button data-action="onboarding.next" data-step="invite-later">Invite later</button>
</menu>`),
    person("Done inviting"),
    agent(`Connect the AI your team will share. Teammates use it without their own account.

<figure data-providers data-scope="team"></figure>

<menu>
  <button data-action="onboarding.next" data-step="providers" data-emphasis>Connected</button>
  <button data-action="onboarding.next" data-step="free-model">Stay on the free model</button>
</menu>`),
];

/** The product transcript, sized like a window, in one explicit appearance. */
function TranscriptWindow(props: {
    readonly entries: readonly ConversationEntry[];
    readonly id: string;
    readonly mode: "light" | "dark";
}) {
    return (
        <ThemeScope mode={props.mode}>
            <MessageSettingsLinksContext.Provider value={SETTINGS_LINKS}>
                <div
                    style={{
                        background: "var(--surface)",
                        display: "flex",
                        height: "100%",
                        width: "100%",
                    }}
                >
                    <ConversationView
                        actionFigures={FIGURES}
                        actionsPressable
                        agentAuthor={CHIEF_OF_STAFF}
                        dock={
                            <ConversationDock
                                composer={COMPOSER}
                                composerPlaceholder="Message Happy…"
                                onComposerSend={noop}
                                onComposerValueChange={noop}
                                running={false}
                            />
                        }
                        conversationId={`chat-onboarding-replies-${props.id}`}
                        entries={props.entries}
                        onActionPress={noop}
                        running={false}
                        style={{ flex: "1 1 auto", minWidth: 0 }}
                        title="Welcome to Happy"
                        viewerId={happyAgentOwnerAuthor.id}
                    />
                </div>
            </MessageSettingsLinksContext.Provider>
        </ThemeScope>
    );
}

/** Each reply with the person's message before it: one window per exchange. */
function exchanges(
    entries: readonly ConversationEntry[],
): readonly (readonly ConversationEntry[])[] {
    return entries.flatMap((entry, index) =>
        entry.kind === "message" && entry.message.sender?.kind === "agent"
            ? [entries.slice(Math.max(0, index - 1), index + 1)]
            : [],
    );
}

const SIZES = [
    { mode: "light", width: 1100, height: 760 },
    { mode: "dark", width: 1100, height: 760 },
    { mode: "light", width: 720, height: 640 },
] as const;

const SCREENS = SIZES.flatMap((size) =>
    [
        ...exchanges(LOCAL).map((entries, index) => ({
            name: `local-${String(index + 1)}`,
            entries,
        })),
        ...exchanges(TEAM).map((entries, index) => ({
            name: `team-${String(index + 1)}`,
            entries,
        })),
    ].map((exchange) => ({ ...exchange, ...size })),
);

export function ChatOnboardingRepliesPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Onboarding replies in the product transcript: every inline block kind among the reply's text, and the pairs a reply puts them in — text then a block, figure after figure, a figure then a menu, a block then more text. One rhythm separates every block from the next. Fixture data only."
            title="Chat onboarding replies"
        >
            {SCREENS.map((screen, index) => {
                const number = String(index + 1).padStart(2, "0");
                const size = `${String(screen.width)}x${String(screen.height)}`;
                return (
                    <FullScreenSpecimen
                        detail={`The virtualized product transcript, ${screen.mode}, ${String(screen.width)} wide`}
                        key={number}
                        label={`${screen.name} · ${screen.mode} · ${String(screen.width)}`}
                        number={number}
                        screen={`${number}-${screen.name}-${screen.mode}-${size}`}
                        window={{ width: screen.width, height: screen.height }}
                    >
                        <TranscriptWindow
                            entries={screen.entries}
                            id={`${screen.name}-${screen.mode}-${String(screen.width)}`}
                            mode={screen.mode}
                        />
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
