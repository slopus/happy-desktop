import type { UiProviderAccounts } from "../../src/ui/UiProviderAccounts";

/*
 * PROTOTYPE fixtures for the chat UI onboarding experiment: the provider
 * sign-in states both directions are drawn in. Nothing here came from a
 * daemon; accounts per provider are the proposed contract, not today's.
 */

export const CODEX_OUT: UiProviderAccounts = {
    provider: "codex",
    name: "Codex",
    installed: true,
    installerHost: "chatgpt.com",
    accounts: [],
};

export const CODEX_ONE: UiProviderAccounts = {
    ...CODEX_OUT,
    accounts: [{ id: "codex", label: "ada@example.com", plan: "Pro", signIn: "signed_in" }],
};

export const CODEX_TWO: UiProviderAccounts = {
    ...CODEX_OUT,
    accounts: [
        ...CODEX_ONE.accounts,
        { id: "codex_lab", label: "lab@example.com", plan: "Plus", signIn: "signed_in" },
    ],
};

export const CODEX_ADDING: UiProviderAccounts = {
    ...CODEX_ONE,
    operation: {
        kind: "sign_in",
        account: "new",
        status: "waiting",
        authorization: {
            url: "https://auth.openai.com/codex/device",
            userCode: "KQ7M-4TZP",
            acceptsCode: false,
            openedByProgram: false,
        },
    },
};

export const CLAUDE_OUT: UiProviderAccounts = {
    provider: "claude",
    name: "Claude Code",
    installed: true,
    installerHost: "claude.ai",
    accounts: [],
};

export const CLAUDE_TWO: UiProviderAccounts = {
    ...CLAUDE_OUT,
    accounts: [
        { id: "claude", label: "ada@example.com", plan: "Max", signIn: "signed_in" },
        { id: "claude_work", label: "work@acme.example", plan: "Team", signIn: "signed_in" },
    ],
};

export const CLAUDE_THREE: UiProviderAccounts = {
    ...CLAUDE_TWO,
    accounts: [
        ...CLAUDE_TWO.accounts,
        { id: "claude_side", label: "side@example.com", plan: "Pro", signIn: "signed_in" },
    ],
};

export const CLAUDE_TWO_ADDING: UiProviderAccounts = {
    ...CLAUDE_TWO,
    operation: {
        kind: "sign_in",
        account: "new",
        status: "waiting",
        authorization: {
            url: "https://claude.ai/oauth/authorize",
            acceptsCode: false,
            openedByProgram: true,
        },
    },
};

export const CLAUDE_TWO_CODE: UiProviderAccounts = {
    ...CLAUDE_TWO,
    operation: {
        kind: "sign_in",
        account: "new",
        status: "waiting",
        authorization: {
            url: "https://claude.ai/oauth/authorize",
            acceptsCode: true,
            openedByProgram: true,
        },
    },
};

export const CLAUDE_TWO_FAILED: UiProviderAccounts = {
    ...CLAUDE_TWO,
    operation: {
        kind: "sign_in",
        status: "failed",
        message: "The sign-in page closed before it finished",
    },
};

export const GROK_MISSING: UiProviderAccounts = {
    provider: "grok",
    name: "Grok",
    installed: false,
    installerHost: "x.ai",
    accounts: [],
};

export const GROK_INSTALLING: UiProviderAccounts = {
    ...GROK_MISSING,
    operation: { kind: "install", status: "running", message: "Installing Grok from x.ai…" },
};

export const GROK_STARTING: UiProviderAccounts = {
    ...GROK_MISSING,
    installed: true,
    operation: {
        kind: "sign_in",
        account: "new",
        status: "running",
        message: "Opening Grok's sign-in…",
    },
};

export const GROK_ONE: UiProviderAccounts = {
    ...GROK_MISSING,
    installed: true,
    accounts: [{ id: "grok", label: "ada", plan: "SuperGrok", signIn: "signed_in" }],
};

export const ANTIGRAVITY_MISSING: UiProviderAccounts = {
    provider: "antigravity",
    name: "Antigravity",
    installed: false,
    installerHost: "antigravity.google",
    accounts: [],
};

/** The six states the directions are compared in. */
export const SIGN_IN_STATES = [
    {
        id: "01-nothing-connected",
        label: "Nothing connected",
        providers: [CODEX_OUT, CLAUDE_OUT, GROK_MISSING, ANTIGRAVITY_MISSING],
    },
    {
        id: "02-codex-one-account",
        label: "Codex with one account",
        providers: [CODEX_ONE, CLAUDE_OUT, GROK_MISSING, ANTIGRAVITY_MISSING],
    },
    {
        id: "03-claude-two-plus-signing-in",
        label: "Claude with two accounts, a third signing in",
        providers: [CODEX_ONE, CLAUDE_TWO_ADDING, GROK_MISSING, ANTIGRAVITY_MISSING],
    },
    {
        id: "04-waiting-for-code",
        label: "Sign-in waiting for a code",
        providers: [CODEX_ONE, CLAUDE_TWO_CODE, GROK_MISSING, ANTIGRAVITY_MISSING],
    },
    {
        id: "05-failed",
        label: "Sign-in failed",
        providers: [CODEX_ONE, CLAUDE_TWO_FAILED, GROK_MISSING, ANTIGRAVITY_MISSING],
    },
    {
        id: "06-not-installed",
        label: "Program not installed",
        providers: [CODEX_ONE, CLAUDE_TWO, GROK_MISSING, ANTIGRAVITY_MISSING],
    },
] as const;
