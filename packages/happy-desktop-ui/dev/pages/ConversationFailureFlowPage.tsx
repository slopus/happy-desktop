import type { ReactNode } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationEntry,
    type ConversationFailure,
    type ConversationFailureProvider,
    type ConversationRetrying,
} from "happy-desktop-state";
import {
    ComposerModelControl,
    type ComposerModelAccountUsage,
    type ComposerModelChoice,
    type ComposerModelControlPreview,
    type ComposerModelService,
    type ComposerModelUsageWatch,
} from "../../src/ComposerModelControl";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import type { ConversationSwitchSource } from "../../src/conversationSwitchTargets";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { conversationEntries } from "./happyAgentChatFixtures";

/** The page plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-023";

const noop = () => undefined;

/** The reviewed blueprints' frame, and the smallest window Happy allows. */
const windows = [
    { id: "reference", width: 856, height: 720 },
    { id: "minimum", width: 720, height: 640 },
] as const;

/* Reset times are told on a pinned viewer clock so the page is deterministic:
   the reader is in Los Angeles at 2:05 PM on 19 October 2026. */
const ZONE = { locale: "en-US", timeZone: "America/Los_Angeles" } as const;
const NOW = Date.UTC(2026, 9, 19, 21, 5);
const RESETS = Date.UTC(2026, 9, 19, 22, 40);
const CLOCK = { now: NOW, zone: ZONE };

const CLAUDE: ConversationFailureProvider = {
    id: "claude",
    type: "claude",
    vendorName: "Claude",
    label: "claude",
};

const choice = (id: string, label: string): ComposerModelChoice => ({
    id,
    label,
    efforts: [{ id: "high", label: "High" }],
    effort: "high",
});
const OPUS = choice("opus-5-5", "Opus 5.5");
const SONNET = choice("sonnet-5", "Sonnet 5");
const account = (id: string, label: string, models: readonly ComposerModelChoice[]) => ({
    id,
    label,
    models,
});

/* The conversation's own model picker: four Claude accounts, the conversation
   on team@ whose week is spent, and two other services. */
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "claude",
        label: "Claude",
        account: "claude_team",
        accounts: [
            account("claude", "Current CLI", [OPUS, SONNET]),
            account("claude_work", "work@example.com", [OPUS, SONNET]),
            account("claude_team", "team@example.com", [OPUS, SONNET]),
            account("claude_spare", "spare@example.com", [OPUS]),
        ],
    },
    {
        id: "codex",
        label: "Codex",
        account: "codex",
        accounts: [account("codex", "codex", [choice("gpt-6.1-sol", "GPT-6.1 Sol")])],
    },
    {
        id: "grok",
        label: "Grok",
        account: "grok",
        accounts: [account("grok", "grok", [choice("grok-4.7", "Grok 4.7")])],
    },
];
const SELECTION = { service: "claude", account: "claude_team", model: "opus-5-5", effort: "high" };

const reading = (week: number, session: number, limit?: string): ComposerModelAccountUsage => ({
    week: {
        label: "Week",
        usedPercent: week,
        resets: "resets Thu 8:00 PM",
        ...(week >= 100 ? { blocking: true } : {}),
    },
    session: { label: "Session", usedPercent: session, resets: "resets 5:50 PM" },
    updatedAt: NOW - 20 * 1_000,
    ...(limit === undefined ? {} : { limit: { resets: limit } }),
});
const USAGE: ReadonlyMap<string, ComposerModelAccountUsage> = new Map([
    ["claude", reading(50, 12)],
    ["claude_work", reading(57, 31)],
    ["claude_team", reading(99, 100, "5:50 PM")],
    ["claude_spare", reading(100, 4, "Thu 8:00 PM")],
    ["codex", reading(18, 42)],
]);
/** Every Claude account spent, so the switch prefers another service. */
const USAGE_CLAUDE_SPENT: ReadonlyMap<string, ComposerModelAccountUsage> = new Map([
    ...USAGE,
    ["claude", reading(100, 64, "Thu 8:00 PM")],
    ["claude_work", reading(100, 12, "Fri 6:00 AM")],
]);

/**
 * The provider-usage store's held reading, as the picker's watch answers with
 * it at once. Nothing here is read again, so a refresh asks nobody.
 */
function heldUsage(usage: ReadonlyMap<string, ComposerModelAccountUsage>): ComposerModelUsageWatch {
    return {
        subscribe(listener) {
            listener({ accounts: usage, now: NOW });
            return () => undefined;
        },
        refresh: () => undefined,
    };
}
const SOURCE: ConversationSwitchSource = {
    services: SERVICES,
    selection: SELECTION,
    usageWatch: heldUsage(USAGE),
};
const SOURCE_CLAUDE_SPENT: ConversationSwitchSource = {
    ...SOURCE,
    usageWatch: heldUsage(USAGE_CLAUDE_SPENT),
};
/** A machine with one account: nothing to switch to. */
const SOURCE_ALONE: ConversationSwitchSource = {
    services: [{ ...SERVICES[0]!, accounts: [account("claude_team", "team@example.com", [OPUS])] }],
    selection: SELECTION,
    usageWatch: heldUsage(USAGE),
};
const CODEX_KEY = `codex\u0000gpt-6.1-sol`;
const SPARE_KEY = `claude_spare\u0000opus-5-5`;

const before = conversationEntries.slice(0, 3);
const failed = (failure: ConversationFailure): ConversationEntry => ({
    kind: "notice",
    id: "failed",
    sequence: "30",
    variant: "notice",
    level: "error",
    text: failure.message,
    failure,
});
const resetNotice: ConversationEntry = {
    kind: "notice",
    id: "reset",
    sequence: "29",
    text: "Context reset",
    variant: "configuration",
    level: "info",
};
const agentReply = conversationEntries[2] as Extract<ConversationEntry, { kind: "message" }>;
const continued: ConversationEntry = {
    ...agentReply,
    message: {
        ...agentReply.message,
        id: "continued",
        sequence: "50",
        changePts: "50",
        text: "Applied the blocking lock in `src/auth/refresh.ts`. The rotation test passes now.",
    },
};

const signinMissing = failed({
    kind: "signin_missing",
    provider: CLAUDE,
    product: "Claude Code",
    command: "claude auth login",
    message: "Claude Code isn't signed in. Run `claude auth login`, then retry.",
});
const usageLimit: ConversationFailure = {
    kind: "usage_limit",
    provider: CLAUDE,
    resetsAt: RESETS,
    message: "Claude usage limit reached.",
};
const noAccount = failed({
    kind: "no_account_available",
    poolName: "Claude pool",
    resetsAt: RESETS,
    message: "Every account in “Claude pool” is out of usage.",
});
/* A daemon that names the accounts it set aside: one spent, one signed out. */
const noAccountMembers = failed({
    kind: "no_account_available",
    poolName: "Claude pool",
    resetsAt: RESETS,
    message: "Every account in “Claude pool” is out of usage.",
    members: [
        {
            provider: { ...CLAUDE, id: "claude_extra", label: "work@example.com" },
            reason: "usage_limit",
            command: null,
            resetsAt: RESETS,
        },
        {
            provider: { ...CLAUDE, label: "Current CLI" },
            reason: "signin_missing",
            command: "claude auth login",
            resetsAt: null,
        },
    ],
});

type Screen = {
    readonly id: string;
    readonly label: string;
    readonly entries: readonly ConversationEntry[];
    readonly running?: boolean;
    readonly retrying?: ConversationRetrying;
    /** The picker the switch reads; the four-account machine when absent. */
    readonly source?: ConversationSwitchSource;
    /** A daemon before protocol 32, which is offered no switch at all. */
    readonly olderDaemon?: boolean;
    /** The composer's model picker, seeded open beside the card. */
    readonly picker?: ComposerModelControlPreview;
    readonly preview?: { readonly target?: string; readonly menu?: { readonly active?: string } };
};

const screens: readonly Screen[] = [
    {
        id: "signin-missing",
        label: "Sign-in missing · switching is primary",
        entries: [...before, signinMissing],
    },
    {
        id: "signin-missing-no-switch",
        label: "Sign-in missing · no other account, Retry is primary",
        entries: [...before, signinMissing],
        source: SOURCE_ALONE,
    },
    {
        id: "usage-limit",
        label: "Usage limit · preset to the account with the most week left",
        entries: [...before, failed(usageLimit)],
    },
    {
        id: "usage-limit-menu",
        label: "Usage limit · the picker's accounts and usage, codex hovered",
        entries: [...before, failed(usageLimit)],
        preview: { menu: { active: CODEX_KEY } },
    },
    {
        id: "usage-limit-menu-spent",
        label: "Usage limit · a spent account hovered",
        entries: [...before, failed(usageLimit)],
        preview: { menu: { active: SPARE_KEY } },
    },
    {
        id: "usage-limit-beside-picker",
        label: "Usage limit · the composer's picker open on the same Claude accounts",
        entries: [...before, failed(usageLimit)],
        picker: { accounts: "claude", accountHover: "claude" },
    },
    {
        id: "usage-limit-older-daemon",
        label: "Usage limit · a daemon before protocol 32 offers Retry, not a switch",
        entries: [...before, failed(usageLimit)],
        olderDaemon: true,
    },
    {
        id: "usage-limit-picked",
        label: "Usage limit · codex picked",
        entries: [...before, failed(usageLimit)],
        preview: { target: CODEX_KEY },
    },
    {
        id: "usage-limit-resolved",
        label: "Usage limit · switched, the card stays in history",
        entries: [
            ...before,
            failed({
                ...usageLimit,
                resolution: {
                    action: "switched",
                    at: NOW,
                    providerId: "claude",
                    providerLabel: "Current CLI",
                    modelId: "opus-5-5",
                    modelName: "Opus 5.5",
                },
            }),
            continued,
        ],
    },
    {
        id: "no-account-available",
        label: "No account available · every Claude account spent, Codex preset",
        entries: [...before, noAccount],
        source: SOURCE_CLAUDE_SPENT,
    },
    {
        id: "no-account-available-members",
        label: "No account available · each account set aside, and why",
        entries: [...before, noAccountMembers],
        source: SOURCE_CLAUDE_SPENT,
    },
    {
        id: "no-account-available-menu",
        label: "No account available · target list open",
        entries: [...before, noAccount],
        source: SOURCE_CLAUDE_SPENT,
        preview: { menu: {} },
    },
    {
        id: "retrying",
        label: "Auto-retry · live attempt with Stop",
        entries: before,
        running: true,
        retrying: {
            kind: "provider_unavailable",
            attempt: 3,
            maxAttempts: 10,
            vendorName: "Claude",
        },
    },
    {
        id: "retries-exhausted",
        label: "Auto-retry · gave up",
        entries: [
            ...before,
            failed({
                kind: "provider_unavailable",
                provider: CLAUDE,
                message: "Claude is overloaded right now.",
            }),
        ],
    },
    {
        id: "context-resetting",
        label: "Context full · resetting, then retrying",
        entries: [...before, resetNotice],
        running: true,
        retrying: { kind: "context_too_long", attempt: 1, maxAttempts: 1, vendorName: "Claude" },
    },
    {
        id: "context-too-long",
        label: "Context too long · New chat on the message line",
        entries: [
            ...before,
            resetNotice,
            failed({
                kind: "context_too_long",
                modelId: "opus-5.5",
                modelName: "Opus 5.5",
                message: "This conversation is too long for Opus 5.5, even after a reset.",
            }),
        ],
    },
];

const statusAlignment: Screen = {
    id: "status-alignment",
    label: "Failed turn · shared status-row content edge",
    entries: [
        failed({
            ...usageLimit,
            resolution: {
                action: "switched",
                at: NOW,
                providerId: "claude_kirill_for_sms_gmail",
                providerLabel: "Claude Kirill For Sms Gmail",
                modelId: "opus-5-5",
                modelName: "Opus 5.5",
            },
        }),
        {
            kind: "turnStatus",
            id: "failed-status",
            sequence: "31",
            status: "failed",
            durationMs: 1_000,
        },
        {
            kind: "notice",
            variant: "configuration",
            id: "provider-changed",
            sequence: "32",
            level: "info",
            text: "Provider selection changed: claude → claude_kirill_for_sms_gmail",
        },
    ],
};

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "conversation-failure-flow",
    submission: { status: "idle" },
    text: "",
};

function conversation(screen: Screen): ReactNode {
    return (
        <ConversationView
            activityTreatment="focused"
            agentAuthor={agentAuthor}
            dock={
                <ConversationDock
                    composer={COMPOSER}
                    composerControls={
                        <ComposerModelControl
                            onSelect={noop}
                            selection={SELECTION}
                            services={SERVICES}
                            usageWatch={(screen.source ?? SOURCE).usageWatch}
                            {...(screen.picker ? { preview: screen.picker } : {})}
                        />
                    }
                    composerPlaceholder="Message Happy…"
                    onAbort={noop}
                    onComposerSend={noop}
                    onComposerValueChange={noop}
                    running={screen.running ?? false}
                />
            }
            conversationId={screen.id}
            elapsedMs={41_000}
            entries={screen.entries}
            errorAssistance={[{ entryId: "failed", assistance: { status: "ready" } }]}
            failureActions={{ onNewChat: noop, onRetry: noop, onSwitch: noop }}
            failureClock={CLOCK}
            {...(screen.olderDaemon ? {} : { failureSwitch: screen.source ?? SOURCE })}
            {...(screen.preview ? { failurePreview: screen.preview } : {})}
            motion="calm-typed"
            onErrorAssistanceRequest={noop}
            {...(screen.retrying ? { retrying: screen.retrying } : {})}
            running={screen.running ?? false}
            style={{ flex: "1 1 auto", minWidth: 0 }}
            subtitle="~/Developer/happy-agent"
            title="Token rotation race"
            viewerId={happyAgentOwnerAuthor.id}
            workingPhase="thinking"
        />
    );
}

export function ConversationFailureFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Failed turns as the client writes them from the failure's kind: the message with Retry or New chat after it, then the switch split button and Ask Chief of Staff. The switch lists the conversation's model picker's own accounts and live usage, never a list stored with the failure. Reset times are told on the viewer's own clock; this page pins it to Los Angeles. Each viewport is named for `pnpm blueprint:screens`."
            title="Conversation failure flow"
        >
            {[
                { width: 1100, height: 760 },
                { width: 720, height: 640 },
            ].map((window) => (
                <FullScreenSpecimen
                    key={`status-alignment-${String(window.width)}`}
                    detail="Only the author avatar hangs in the gutter; status icons share the content edge."
                    label={statusAlignment.label}
                    number="00"
                    screen={`00-status-alignment-${String(window.width)}x${String(window.height)}`}
                    window={window}
                >
                    <ThemeScope mode="dark">
                        <div style={{ display: "flex", width: "100%", height: "100%" }}>
                            {conversation(statusAlignment)}
                        </div>
                    </ThemeScope>
                </FullScreenSpecimen>
            ))}
            {windows.flatMap((window) =>
                screens.map((screen, index) => {
                    const number = String(index + 1).padStart(2, "0");
                    return (
                        <FullScreenSpecimen
                            key={`${window.id}-${screen.id}`}
                            detail={`${String(window.width)} × ${String(window.height)} · ${window.id} window`}
                            label={screen.label}
                            number={number}
                            screen={`${number}-${screen.id}-${String(window.width)}x${String(window.height)}`}
                            window={window}
                        >
                            <ThemeScope mode="light">
                                <div style={{ display: "flex", width: "100%", height: "100%" }}>
                                    {conversation(screen)}
                                </div>
                            </ThemeScope>
                        </FullScreenSpecimen>
                    );
                }),
            )}
        </ComponentPage>
    );
}
