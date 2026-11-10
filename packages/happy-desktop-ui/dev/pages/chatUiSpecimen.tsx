import type { ReactNode } from "react";
import type { ProviderCli } from "happy-desktop-state";
import { Message } from "../../src/Message";

/*
 * Shared pieces of the chat UI Blueprint pages: a chat column at a reply's
 * width, the agent's and the person's messages, and provider CLI fixtures in
 * the server's own shape. Fixture data only; every email is example.com.
 */

/** The window's chat surface, padded like the conversation. */
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
export function ChatColumn(props: { readonly children: ReactNode; readonly width?: number }) {
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                width: `${String(props.width ?? 640)}px`,
                minWidth: 0,
            }}
        >
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

const INSTALLERS = {
    claude: { host: "claude.ai", name: "Claude Code", vendor: "Anthropic" },
    codex: { host: "chatgpt.com", name: "Codex", vendor: "OpenAI" },
    grok: { host: "x.ai", name: "Grok", vendor: "xAI" },
    antigravity: { host: "antigravity.google", name: "Antigravity", vendor: "Google" },
} as const;

/** A provider CLI as the server describes it, signed out unless `change` says otherwise. */
export function cliFixture(
    id: keyof typeof INSTALLERS,
    change: Partial<ProviderCli> & {
        readonly accounts?: readonly {
            readonly id: string;
            readonly label: string;
            readonly plan?: string;
            readonly signIn: "signed_in" | "signed_out";
        }[];
    } = {},
): ProviderCli {
    const vendor = INSTALLERS[id];
    return {
        id,
        name: vendor.name,
        vendor: vendor.vendor,
        website: `https://${vendor.host}`,
        providerId: id,
        installation: {
            status: "installed",
            path: `/Users/you/.local/bin/${id}`,
            version: "1.0.0",
            source: "standalone",
            desktopApp: null,
        },
        installer: {
            command: `${id} install`,
            sourceUrl: `https://${vendor.host}/install.sh`,
            sourceHost: vendor.host,
            vendorSite: `https://${vendor.host}`,
        },
        commands: { run: id, signIn: `${id} login` },
        signIn: { status: "signed_out", account: null, methods: ["browser"] },
        operation: null,
        version: "1",
        updatedAt: 0,
        ...change,
    };
}

/** A program signed in with `accounts`, the first as its own sign-in. */
export function cliSignedIn(
    id: keyof typeof INSTALLERS,
    accounts: readonly { readonly label: string; readonly plan?: string }[],
): ProviderCli {
    const first = accounts[0]!;
    return cliFixture(id, {
        signIn: {
            status: "signed_in",
            account: { email: first.label, plan: first.plan ?? null },
            methods: ["browser"],
        },
        accounts: accounts.map((account, index) => ({
            id: index === 0 ? id : `${id}_${String(index + 1)}`,
            label: account.label,
            ...(account.plan ? { plan: account.plan } : {}),
            signIn: "signed_in" as const,
        })),
    });
}

/** A program whose sign-in waits on its vendor's page. */
export function cliWaiting(
    cli: ProviderCli,
    authorization: { readonly acceptsCode?: boolean; readonly userCode?: string } = {},
): ProviderCli {
    return {
        ...cli,
        operation: {
            id: "op-1",
            kind: "sign_in",
            status: "waiting",
            message: "Waiting for the sign-in page",
            authorization: {
                method: authorization.userCode ? "device" : "browser",
                url: "https://example.com/sign-in",
                userCode: authorization.userCode ?? null,
                openedByProgram: true,
                acceptsCode: authorization.acceptsCode ?? false,
                expiresAt: 0,
            },
            output: [],
            error: null,
            startedAt: 0,
            finishedAt: null,
        },
    };
}

/** A program whose last install or sign-in failed with `message`. */
export function cliFailed(cli: ProviderCli, message: string): ProviderCli {
    return {
        ...cli,
        operation: {
            id: "op-1",
            kind: "sign_in",
            status: "failed",
            message,
            authorization: null,
            output: [],
            error: { code: "sign_in_failed", message },
            startedAt: 0,
            finishedAt: 0,
        },
    };
}

/** A program that isn't on the computer yet. */
export function cliMissing(id: keyof typeof INSTALLERS): ProviderCli {
    return cliFixture(id, {
        installation: {
            status: "missing",
            path: null,
            version: null,
            source: null,
            desktopApp: null,
        },
    });
}
