import type { ReactNode } from "react";
import type { ConversationQuickReplies } from "happy-desktop-state";
import { Message } from "../../src/Message";
import {
    uiAccountsCount,
    UiProviderAccountsList,
    uiProviderMark,
    type UiProviderAccounts,
} from "../../src/ui/UiProviderAccounts";
import { UiQuickReplies, type UiQuickReplyDecoration } from "../../src/ui/UiQuickReplies";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import {
    CLAUDE_OUT,
    CLAUDE_TWO_CODE,
    CLAUDE_TWO_ADDING,
    CLAUDE_TWO_FAILED,
    CODEX_ONE,
    CODEX_OUT,
    GROK_MISSING,
    SIGN_IN_STATES,
} from "./providerSignInFixtures";

/*
 * PROTOTYPE — chat UI onboarding experiment. Provider sign-in in two
 * directions, side by side in the same six states: A, one component with
 * every AI and its accounts; B, the chat asking with quick replies and
 * showing one step at a time. Fixture data only.
 */
export const componentNumber = "C-338x";

const STILL = 0;

/** One direction's chat, at the width a reply has in Happy's default window. */
const SCREEN = { width: 760, height: 500 } as const;

export function Stage(props: { readonly children: ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                boxSizing: "border-box",
                width: "100%",
                height: "100%",
                padding: "28px 56px",
                background: "var(--surface)",
            }}
        >
            {props.children}
        </div>
    );
}

/** One chat column: the agent's turn and what the person said, top to bottom. */
export function ChatColumn(props: { readonly children: ReactNode; readonly title?: string }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                width: "640px",
                minWidth: 0,
            }}
        >
            {props.title ? (
                <div
                    style={{
                        color: "var(--text-secondary)",
                        fontSize: "13px",
                        fontWeight: 600,
                        lineHeight: "20px",
                    }}
                >
                    {props.title}
                </div>
            ) : null}
            {props.children}
        </div>
    );
}

export function Agent(props: { readonly body: string; readonly children?: ReactNode }) {
    return (
        <Message
            agent
            author="Chief of Staff"
            body={props.body}
            bodyFormat="markdown"
            initials="CS"
            time="10:42"
            tone="brand"
        >
            {props.children}
        </Message>
    );
}

export function Person(props: { readonly body: string; readonly suggested?: boolean }) {
    return (
        <Message
            author="You"
            {...(props.suggested ? { authorNote: "↩ Suggested reply" } : {})}
            body={props.body}
            initials="Y"
            own
            time="10:43"
        />
    );
}

/** A reply option about one AI, with its mark and how many accounts it has, live. */
export function providerOption(
    provider: UiProviderAccounts,
): UiQuickReplyDecoration & { readonly provider: UiProviderAccounts } {
    return {
        provider,
        mark: uiProviderMark(provider.provider),
        note: !provider.installed
            ? "Not installed"
            : provider.accounts.length === 0
              ? "Not signed in"
              : uiAccountsCount(provider.accounts),
    };
}

export function Replies(props: {
    readonly options: readonly (
        | string
        | { readonly text: string; readonly about: UiProviderAccounts }
    )[];
    readonly chosen?: number;
}) {
    const replies: ConversationQuickReplies = {
        messageId: "msgfixture-b",
        options: props.options.map((option) => (typeof option === "string" ? option : option.text)),
        live: props.chosen === undefined,
        ...(props.chosen === undefined ? {} : { chosen: props.chosen }),
    };
    return (
        <UiQuickReplies
            decorations={props.options.map((option) =>
                typeof option === "string" ? undefined : providerOption(option.about),
            )}
            onSend={() => undefined}
            replies={replies}
            style={{ padding: 0 }}
        />
    );
}

const live = {
    onSignIn: () => undefined,
    onCode: () => undefined,
    onToken: () => undefined,
    onCancel: () => undefined,
    onPageOpen: () => undefined,
};

/** Direction A in one state: the whole component under the agent's one sentence. */
function DirectionA(props: { readonly providers: readonly UiProviderAccounts[] }) {
    return (
        <ChatColumn title="A · All in one">
            <Agent body="Connect the AIs you want me to work with. You can add more accounts any time.">
                <UiProviderAccountsList
                    providers={props.providers}
                    spinnerFrame={STILL}
                    {...live}
                />
            </Agent>
        </ChatColumn>
    );
}

/** Direction B in each state: what the chat shows at that point. */
const DIRECTION_B: Readonly<Record<(typeof SIGN_IN_STATES)[number]["id"], () => ReactNode>> = {
    "01-nothing-connected": () => (
        <>
            <Agent body="Which AI should I work with? Pick one to start — you can add more later." />
            <Replies
                options={[
                    { text: "Sign in to Codex", about: CODEX_OUT },
                    { text: "Sign in to Claude Code", about: CLAUDE_OUT },
                    { text: "Set up Grok", about: GROK_MISSING },
                    "Skip for now",
                ]}
            />
        </>
    ),
    "02-codex-one-account": () => (
        <>
            <Agent body="Codex is connected as ada@example.com. Add another account, or another AI?" />
            <Replies
                options={[
                    { text: "Add another Codex account", about: CODEX_ONE },
                    { text: "Sign in to Claude Code", about: CLAUDE_OUT },
                    "That's all for now",
                ]}
            />
        </>
    ),
    "03-claude-two-plus-signing-in": () => (
        <>
            <Person body="Add another Claude Code account" suggested />
            <Agent body="Finish in your browser — I'll carry on as soon as Claude says yes.">
                <UiProviderAccountsList
                    providers={[CLAUDE_TWO_ADDING]}
                    spinnerFrame={STILL}
                    {...live}
                />
            </Agent>
        </>
    ),
    "04-waiting-for-code": () => (
        <>
            <Person body="Add another Claude Code account" suggested />
            <Agent body="Claude's page shows a code when you approve. Paste it here.">
                <UiProviderAccountsList
                    providers={[CLAUDE_TWO_CODE]}
                    spinnerFrame={STILL}
                    {...live}
                />
            </Agent>
        </>
    ),
    "05-failed": () => (
        <>
            <Person body="Add another Claude Code account" suggested />
            <Agent body="That sign-in didn't finish. Try again, or use a setup token instead.">
                <UiProviderAccountsList
                    providers={[CLAUDE_TWO_FAILED]}
                    spinnerFrame={STILL}
                    {...live}
                />
            </Agent>
        </>
    ),
    "06-not-installed": () => (
        <>
            <Person body="Set up Grok" suggested />
            <Agent body="Grok isn't on this computer yet. It comes from x.ai; I'll install it and open its sign-in.">
                <UiProviderAccountsList providers={[GROK_MISSING]} {...live} />
            </Agent>
        </>
    ),
};

export function ProviderSignInDirectionsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="PROTOTYPE. Provider sign-in two ways, in the same states: A lists every AI with its accounts in one component; B asks with quick replies and shows one step at a time. Fixture data."
            title="Provider sign-in directions"
        >
            <div className="specimen-grid">
                {SIGN_IN_STATES.flatMap((state) =>
                    (["a", "b"] as const).map((direction) => (
                        <FullScreenSpecimen
                            detail={direction === "a" ? "A · all in one" : "B · iterative"}
                            key={`${direction}-${state.id}`}
                            label={state.label}
                            number={`${componentNumber}-${direction}${state.id.slice(0, 2)}`}
                            screen={`${direction}-${state.id}`}
                            window={SCREEN}
                        >
                            <Stage>
                                {direction === "a" ? (
                                    <DirectionA providers={state.providers} />
                                ) : (
                                    <ChatColumn title="B · Iterative">
                                        {DIRECTION_B[state.id]()}
                                    </ChatColumn>
                                )}
                            </Stage>
                        </FullScreenSpecimen>
                    )),
                )}
            </div>
        </ComponentPage>
    );
}
