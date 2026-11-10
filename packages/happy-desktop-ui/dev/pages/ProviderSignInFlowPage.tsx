import { useState, type ReactNode } from "react";
import type { ConversationQuickReplies } from "happy-desktop-state";
import {
    UiProviderAccountsList,
    type UiProviderAccount,
    type UiProviderAccounts,
    type UiProviderKey,
    type UiProviderOperation,
} from "../../src/ui/UiProviderAccounts";
import { UiQuickReplies } from "../../src/ui/UiQuickReplies";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { Agent, ChatColumn, Person, providerOption } from "./ProviderSignInDirectionsPage";
import { ANTIGRAVITY_MISSING, CLAUDE_OUT, CODEX_ONE, GROK_MISSING } from "./providerSignInFixtures";

/*
 * PROTOTYPE — chat UI onboarding experiment. Both provider sign-in
 * directions as working flows over a pretend daemon: a click starts the
 * operation, and timers move it on as the vendor's program would. Recorded
 * for the experiment's videos. Fixture data only; nothing leaves the page.
 */
export const componentNumber = "C-338y";

const NEW_ACCOUNTS: Readonly<Record<UiProviderKey, readonly UiProviderAccount[]>> = {
    claude: [
        { id: "claude", label: "ada@example.com", plan: "Max", signIn: "signed_in" },
        { id: "claude_work", label: "work@acme.example", plan: "Team", signIn: "signed_in" },
    ],
    codex: [{ id: "codex_lab", label: "lab@example.com", plan: "Plus", signIn: "signed_in" }],
    grok: [{ id: "grok", label: "ada", plan: "SuperGrok", signIn: "signed_in" }],
    antigravity: [{ id: "antigravity", label: "ada@example.com", signIn: "signed_in" }],
};

/** How each provider's pretend sign-in goes: what its page asks for, and whether the first try fails. */
const SCRIPT: Readonly<Record<UiProviderKey, "browser" | "code" | "device">> = {
    claude: "browser",
    codex: "browser",
    grok: "device",
    antigravity: "browser",
};

/** A pretend daemon over the accounts rows: every action moves its provider on as a real one would. */
function usePretendDaemon(initial: readonly UiProviderAccounts[]) {
    const [providers, setProviders] = useState(initial);
    /* Second sign-ins of Claude ask for a code; the first Codex add fails once. */
    const [tries, setTries] = useState<Readonly<Record<string, number>>>({});
    const patch = (
        key: UiProviderKey,
        change: (provider: UiProviderAccounts) => UiProviderAccounts,
    ) =>
        setProviders((all) =>
            all.map((provider) => (provider.provider === key ? change(provider) : provider)),
        );
    const operate = (key: UiProviderKey, operation: UiProviderOperation | undefined) =>
        patch(key, (provider) => {
            const { operation: _, ...rest } = provider;
            return operation ? { ...rest, operation } : rest;
        });
    const connect = (key: UiProviderKey) =>
        patch(key, (provider) => {
            const { operation: _, ...rest } = provider;
            const next = NEW_ACCOUNTS[key].find(
                (account) => !provider.accounts.some((had) => had.id === account.id),
            );
            return {
                ...rest,
                installed: true,
                accounts: next ? [...provider.accounts, next] : provider.accounts,
            };
        });
    const later = (ms: number, then: () => void) => window.setTimeout(then, ms);
    const name = (key: UiProviderKey) =>
        providers.find((provider) => provider.provider === key)?.name ?? key;
    const signIn = (key: UiProviderKey) => {
        const provider = providers.find((candidate) => candidate.provider === key)!;
        const attempt = (tries[key] ?? 0) + 1;
        setTries((all) => ({ ...all, [key]: attempt }));
        const begin = () => {
            operate(key, {
                kind: "sign_in",
                account: "new",
                status: "running",
                message: `Opening ${name(key)}'s sign-in…`,
            });
            later(900, () => {
                const asksCode = key === "claude" && provider.accounts.length > 0;
                const method = asksCode ? "code" : SCRIPT[key];
                operate(key, {
                    kind: "sign_in",
                    account: "new",
                    status: "waiting",
                    authorization: {
                        url: "https://example.com/sign-in",
                        acceptsCode: method === "code",
                        openedByProgram: method !== "device",
                        ...(method === "device" ? { userCode: "KQ7M-4TZP" } : {}),
                    },
                });
                if (method === "code") return;
                const fails = key === "codex" && attempt === 1;
                later(2200, () =>
                    fails
                        ? operate(key, {
                              kind: "sign_in",
                              status: "failed",
                              message: "The sign-in page closed before it finished",
                          })
                        : connect(key),
                );
            });
        };
        if (!provider.installed) {
            operate(key, {
                kind: "install",
                status: "running",
                message: `Installing ${name(key)} from ${provider.installerHost ?? "its vendor"}…`,
            });
            later(1600, begin);
        } else begin();
    };
    const checking = (key: UiProviderKey, message: string) => {
        operate(key, { kind: "sign_in", account: "new", status: "running", message });
        later(900, () => connect(key));
    };
    return {
        providers,
        actions: {
            onSignIn: (key: UiProviderKey) => signIn(key),
            onCode: (key: UiProviderKey) => checking(key, "Checking the code…"),
            onToken: (key: UiProviderKey) => checking(key, "Checking the token…"),
            onCancel: (key: UiProviderKey) => operate(key, undefined),
            onPageOpen: () => undefined,
        },
    };
}

const START = [CODEX_ONE, CLAUDE_OUT, GROK_MISSING, ANTIGRAVITY_MISSING] as const;

function FlowA() {
    const daemon = usePretendDaemon(START);
    return (
        <ChatColumn>
            <Agent body="Connect the AIs you want me to work with. You can add more accounts any time.">
                <UiProviderAccountsList providers={daemon.providers} {...daemon.actions} />
            </Agent>
        </ChatColumn>
    );
}

type Turn =
    | {
          readonly kind: "agent";
          readonly body: string;
          readonly provider?: UiProviderKey;
          /** The account this step's sign-in added, once it has. */
          readonly added?: UiProviderAccount;
      }
    | { readonly kind: "replies"; readonly options: readonly ReplyOption[]; chosen?: number }
    | { readonly kind: "person"; readonly body: string };

type ReplyOption = {
    readonly text: string;
    readonly provider?: UiProviderKey;
    readonly done?: true;
};

/** What the model offers next, from what the person has now. */
function nextOffer(providers: readonly UiProviderAccounts[]): ReplyOption[] {
    const options: ReplyOption[] = [];
    for (const provider of providers.slice(0, 3)) {
        options.push({
            text: !provider.installed
                ? `Set up ${provider.name}`
                : provider.accounts.length === 0
                  ? `Sign in to ${provider.name}`
                  : `Add another ${provider.name} account`,
            provider: provider.provider,
        });
    }
    options.push({ text: "That's all for now", done: true });
    return options;
}

function FlowB() {
    const daemon = usePretendDaemon(START);
    const [turns, setTurns] = useState<readonly Turn[]>(() => [
        {
            kind: "agent",
            body: "Which AI should I work with? Pick one — you can add more any time.",
        },
        { kind: "replies", options: nextOffer(START) },
    ]);
    const [watching, setWatching] = useState<{ key: UiProviderKey; had: number } | undefined>();
    const provider = (key: UiProviderKey) =>
        daemon.providers.find((candidate) => candidate.provider === key)!;
    /* The pretend model hears a connection and answers, as the daemon's note would wake it. */
    if (watching) {
        const now = provider(watching.key);
        if (now.accounts.length > watching.had && now.operation === undefined) {
            setWatching(undefined);
            const count = now.accounts.length;
            const added = now.accounts.at(-1)!;
            setTurns((all) => [
                ...all.map((turn) =>
                    turn.kind === "agent" &&
                    turn.provider === watching.key &&
                    turn.added === undefined
                        ? { ...turn, added }
                        : turn,
                ),
                {
                    kind: "agent",
                    body:
                        count === 1
                            ? `${now.name} is connected as ${now.accounts[0]!.label}. Anything else?`
                            : `${now.name} has ${String(count)} accounts now. I'll switch between them when one runs out.`,
                },
                { kind: "replies", options: nextOffer(daemon.providers) },
            ]);
        }
    }
    const choose = (turnIndex: number, optionIndex: number) => {
        const turn = turns[turnIndex];
        if (turn?.kind !== "replies") return;
        const option = turn.options[optionIndex]!;
        const marked = turns.map((candidate, index) =>
            index === turnIndex ? { ...turn, chosen: optionIndex } : candidate,
        );
        if (option.done || option.provider === undefined) {
            setTurns([
                ...marked,
                { kind: "person", body: option.text },
                {
                    kind: "agent",
                    body: "Great. Tell me what you're working on and I'll get started.",
                },
            ]);
            return;
        }
        const key = option.provider;
        const p = provider(key);
        setTurns([
            ...marked,
            { kind: "person", body: option.text },
            {
                kind: "agent",
                body: !p.installed
                    ? `${p.name} isn't on this computer yet. It comes from ${p.installerHost ?? "its vendor"}; I'll install it and open its sign-in.`
                    : "Finish in your browser — I'll carry on as soon as it says yes.",
                provider: key,
            },
        ]);
        setWatching({ key, had: p.accounts.length });
        daemon.actions.onSignIn(key);
    };
    const lastReplies = turns.reduce(
        (last, turn, index) => (turn.kind === "replies" ? index : last),
        -1,
    );
    return (
        <ChatColumn>
            {turns.map((turn, index) => {
                if (turn.kind === "person")
                    return <Person body={turn.body} key={index} suggested />;
                if (turn.kind === "agent")
                    return (
                        <Agent body={turn.body} key={index}>
                            {turn.provider ? (
                                <UiProviderAccountsList
                                    providers={[provider(turn.provider)]}
                                    {...(turn.added ? { settled: turn.added } : {})}
                                    {...daemon.actions}
                                />
                            ) : null}
                        </Agent>
                    );
                const replies: ConversationQuickReplies = {
                    messageId: `flow-${String(index)}`,
                    options: turn.options.map((option) => option.text),
                    live: index === lastReplies && turn.chosen === undefined,
                    ...(turn.chosen === undefined ? {} : { chosen: turn.chosen }),
                };
                return (
                    <UiQuickReplies
                        decorations={turn.options.map((option) =>
                            option.provider ? providerOption(provider(option.provider)) : undefined,
                        )}
                        key={index}
                        onSend={(optionIndex) => choose(index, optionIndex)}
                        replies={replies}
                        style={{ padding: 0 }}
                    />
                );
            })}
        </ChatColumn>
    );
}

/** A chat window's transcript: it follows the bottom as turns arrive. */
function Transcript(props: { readonly children: ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                /* Reversed so the scroll position rests at the newest turn without script. */
                flexDirection: "column-reverse",
                boxSizing: "border-box",
                width: "100%",
                height: "100%",
                overflow: "auto",
                background: "var(--surface)",
            }}
        >
            <div style={{ display: "flex", flexDirection: "column", padding: "28px 56px" }}>
                {props.children}
            </div>
        </div>
    );
}

export function ProviderSignInFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="PROTOTYPE. Provider sign-in as working flows over a pretend daemon: A, every AI in one component; B, the chat asking one step at a time."
            title="Provider sign-in flows"
        >
            <div className="specimen-grid">
                <FullScreenSpecimen
                    detail="A · all in one"
                    label="Provider sign-in, all in one"
                    number={`${componentNumber}-a`}
                    screen="flow-a"
                    window={{ width: 760, height: 520 }}
                >
                    <Transcript>
                        <FlowA />
                    </Transcript>
                </FullScreenSpecimen>
                <FullScreenSpecimen
                    detail="B · iterative"
                    label="Provider sign-in, one step at a time"
                    number={`${componentNumber}-b`}
                    screen="flow-b"
                    window={{ width: 760, height: 720 }}
                >
                    <Transcript>
                        <FlowB />
                    </Transcript>
                </FullScreenSpecimen>
            </div>
        </ComponentPage>
    );
}
