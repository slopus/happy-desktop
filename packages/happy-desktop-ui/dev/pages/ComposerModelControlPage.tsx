import { useState, type ReactNode } from "react";
import { Button } from "../../src/Button";
import { Composer } from "../../src/Composer";
import {
    ComposerModelControl,
    type ComposerModelAccountNotice,
    type ComposerModelAccountUsage,
    type ComposerModelChoice,
    type ComposerModelControlPreview,
    type ComposerModelEffort,
    type ComposerModelSelection,
    type ComposerModelService,
    type ComposerModelUsageWatch,
} from "../../src/ComposerModelControl";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-145";

const EFFORT_LABELS = {
    off: "Off",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra High",
    max: "Maximum",
} as const;

function efforts(...ids: (keyof typeof EFFORT_LABELS)[]): readonly ComposerModelEffort[] {
    return ids.map((id) => ({ id, label: EFFORT_LABELS[id] }));
}

const CODEX_MODELS: readonly ComposerModelChoice[] = [
    {
        id: "gpt-6-astra",
        label: "GPT-6 Astra",
        efforts: efforts("low", "medium", "high", "xhigh", "max"),
        effort: "medium",
    },
    {
        id: "gpt-6-sol",
        label: "GPT-6 Sol",
        efforts: efforts("minimal", "low", "medium", "high", "xhigh"),
        effort: "high",
    },
    {
        id: "gpt-6-luna",
        label: "GPT-6 Luna",
        efforts: efforts("low", "medium", "high"),
        effort: "medium",
    },
];

const OPUS_5_5: ComposerModelChoice = {
    id: "opus-5-5",
    label: "Opus 5.5",
    efforts: efforts("low", "medium", "high", "xhigh", "max"),
    effort: "high",
};
const FABLE_5_1: ComposerModelChoice = {
    id: "fable-5-1",
    label: "Fable 5.1",
    efforts: efforts("off", "low", "medium", "high", "xhigh", "max"),
    effort: "medium",
};
const OPUS_5: ComposerModelChoice = {
    id: "opus-5",
    label: "Opus 5",
    efforts: efforts("off", "low", "medium", "high", "xhigh", "max"),
    effort: "high",
};
const CLAUDE_MODELS = [OPUS_5_5, FABLE_5_1, OPUS_5];

const GROK_MODELS: readonly ComposerModelChoice[] = [
    {
        id: "grok-4.7",
        label: "Grok 4.7",
        efforts: efforts("low", "medium", "high", "xhigh"),
        effort: "medium",
    },
    {
        id: "grok-4.6",
        label: "Grok 4.6",
        efforts: efforts("low", "medium", "high", "xhigh"),
        effort: "medium",
    },
];

/* Accounts are provider ids grouped by their configured type, as the adapter builds them. */
const SERVICES: readonly ComposerModelService[] = [
    {
        id: "codex",
        label: "Codex",
        account: "codex",
        accounts: [{ id: "codex", label: "Current CLI", models: CODEX_MODELS }],
    },
    {
        id: "claude",
        label: "Claude",
        account: "claude",
        accounts: [
            { id: "claude", label: "Current CLI", models: CLAUDE_MODELS },
            { id: "claude_extra", label: "work@example.com", models: CLAUDE_MODELS },
        ],
    },
    {
        id: "grok",
        label: "Grok",
        account: "grok",
        accounts: [
            { id: "grok", label: "Current CLI", models: GROK_MODELS },
            { id: "grok_api", label: "api@example.com", models: GROK_MODELS },
        ],
    },
];

const ASTRA: ComposerModelSelection = {
    service: "codex",
    account: "codex",
    model: "gpt-6-astra",
    effort: "xhigh",
};

/** The moment the fixtures' ages are told from: 3:00 PM today, wherever the page is open. */
const NOW = new Date(new Date().setHours(15, 0, 0, 0)).getTime();
const MINUTE = 60_000;

/*
 * Usage as the provider-usage feed reports it: each account's week and session
 * windows, already in local time. claude_extra runs on a `claude setup-token`
 * token, whose windows come from rate-limit headers. grok has no reading and
 * grok_api, an API key, has no usage API at all, so both read unknown.
 */
const USAGE: ReadonlyMap<string, ComposerModelAccountUsage> = new Map([
    [
        "codex",
        {
            week: { label: "Week", usedPercent: 18, resets: "resets Mon 9:00 AM" },
            session: { label: "Session", usedPercent: 42, resets: "resets 4:10 PM" },
            updatedAt: NOW - 3 * MINUTE,
        },
    ],
    [
        "claude",
        {
            week: { label: "Week", usedPercent: 64, resets: "resets Thu 8:00 PM" },
            session: { label: "Session", usedPercent: 12, resets: "resets 5:50 PM" },
            updatedAt: NOW - 3 * MINUTE,
        },
    ],
    [
        "claude_extra",
        {
            week: { label: "Week", usedPercent: 37, resets: "resets Fri 6:00 AM" },
            session: { label: "Session", usedPercent: 93, resets: "resets 3:35 PM" },
            updatedAt: NOW - 40 * 1_000,
        },
    ],
]);

/**
 * A usage feed holding a reading from earlier in the session: it answers at
 * once, as the provider-usage store does with its held reading, holds nothing
 * open, and has nobody to ask for a refresh.
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

const usageWatch = heldUsage(USAGE);

/** The fixture usage with one account's reading replaced. */
function usageWith(account: string, reading: ComposerModelAccountUsage): ComposerModelUsageWatch {
    return heldUsage(new Map([...USAGE, [account, reading]]));
}

const CLAUDE = USAGE.get("claude")!;

/* The default Claude account at each point of a refresh, and a spent one. */
const claudeUpdating = usageWith("claude", {
    ...CLAUDE,
    updatedAt: NOW - 47 * MINUTE,
    refreshing: true,
});
const claudeRefreshFailed = usageWith("claude", {
    ...CLAUDE,
    updatedAt: NOW - 19 * MINUTE,
    refreshError: "Claude did not answer the usage request in time.",
});
const claudeWeeklyBehind = usageWith("claude", {
    week: { ...CLAUDE.week!, capturedAt: NOW - 108 * MINUTE },
    session: { ...CLAUDE.session!, capturedAt: NOW - 2 * MINUTE },
    updatedAt: NOW - 2 * MINUTE,
});
const claudeExtraSpent = usageWith("claude_extra", {
    week: { label: "Week", usedPercent: 100, resets: "resets Wed 6:00 PM", blocking: true },
    session: { label: "Session", usedPercent: 0, resets: "resets 11:10 PM" },
    updatedAt: NOW - 18 * MINUTE,
    limit: { resets: "Wed 6:00 PM" },
});
const claudeNeverRead = usageWith("claude", { refreshing: true });

/*
 * Codex through a pool that takes turns between the Current CLI and a hidden
 * second account. The hidden one is listed only under the pool; the Current
 * CLI is its own account as well. The pool has no plan of its own to read.
 */
const POOL_SECOND = "codex_kirill_bra1ndump";
const POOL_SERVICES: readonly ComposerModelService[] = SERVICES.map((service) =>
    service.id === "codex"
        ? {
              ...service,
              account: "codex_pool",
              accounts: [
                  {
                      id: "codex_pool",
                      label: "Pool",
                      models: CODEX_MODELS,
                      members: [
                          { id: "codex", label: "Current CLI" },
                          { id: POOL_SECOND, label: "Kirill Bra1ndump" },
                      ],
                  },
                  { id: "codex", label: "Current CLI", models: CODEX_MODELS },
              ],
          }
        : service,
);
const ON_POOL: ComposerModelSelection = { ...ASTRA, account: "codex_pool" };
/* The Current CLI has signed out; the second account carries the pool. */
const poolSignedOut = heldUsage(
    new Map([
        ...USAGE,
        [
            "codex",
            {
                ...USAGE.get("codex")!,
                updatedAt: NOW - 52 * MINUTE,
                signedOut: true,
            },
        ],
        [
            POOL_SECOND,
            {
                week: { label: "Week", usedPercent: 46, resets: "resets Tue 11:00 AM" },
                session: { label: "Session", usedPercent: 71, resets: "resets 5:20 PM" },
                updatedAt: NOW - 2 * MINUTE,
            },
        ],
    ]),
);

/*
 * Claude with every kind of account side by side: one with room, one running
 * low, one whose week is spent until Wednesday, one under a long address, and
 * an API key with no reading at all.
 */
const MANY_ACCOUNTS = "personal.backup.account.for.sms@gmail.com";
const MANY_ACCOUNT_SERVICES: readonly ComposerModelService[] = SERVICES.map((service) =>
    service.id === "claude"
        ? {
              ...service,
              accounts: [
                  { id: "claude", label: "Current CLI", models: CLAUDE_MODELS },
                  { id: "claude_extra", label: "Extra", models: CLAUDE_MODELS },
                  { id: "claude_low", label: "team@example.com", models: CLAUDE_MODELS },
                  { id: "claude_long", label: MANY_ACCOUNTS, models: CLAUDE_MODELS },
                  { id: "claude_api", label: "api-key", models: CLAUDE_MODELS },
              ],
          }
        : service,
);
const manyAccountsUsage = heldUsage(
    new Map([
        ...USAGE,
        [
            "claude_extra",
            {
                week: {
                    label: "Week",
                    usedPercent: 100,
                    resets: "resets Wed 6:00 PM",
                    blocking: true,
                },
                session: { label: "Session", usedPercent: 0, resets: "resets 11:10 PM" },
                updatedAt: NOW - 18 * MINUTE,
                limit: { resets: "Wed 6:00 PM" },
            },
        ],
        [
            "claude_low",
            {
                week: { label: "Week", usedPercent: 81, resets: "resets Sat 10:00 AM" },
                session: { label: "Session", usedPercent: 30, resets: "resets 6:20 PM" },
                updatedAt: NOW - 2 * MINUTE,
            },
        ],
        [
            "claude_long",
            {
                week: { label: "Week", usedPercent: 45, resets: "resets Tue 9:00 AM" },
                session: { label: "Session", usedPercent: 5, resets: "resets 7:45 PM" },
                updatedAt: NOW - 5 * MINUTE,
            },
        ],
    ]),
);

const LONG_SERVICES: readonly ComposerModelService[] = [
    ...SERVICES,
    {
        id: "openrouter",
        label: "OpenRouter",
        account: "openrouter",
        accounts: [
            {
                id: "openrouter",
                label: "openrouter",
                default: true,
                models: [
                    "DeepSeek V4",
                    "Qwen 4 Max",
                    "Kimi K3",
                    "GLM 5",
                    "Mistral Large 3",
                    "Llama 5 405B",
                    "Gemini 3 Pro",
                    "Gemini 3 Flash",
                    "Command A+",
                    "Nova Premier 2",
                ].map((label) => ({
                    id: label.toLowerCase().replaceAll(" ", "-"),
                    label,
                    efforts: efforts("low", "medium", "high"),
                    effort: "medium",
                })),
            },
        ],
    },
];

/** Every real model has efforts; this invented one shows the case where a model has none. */
const NO_EFFORT_SERVICES: readonly ComposerModelService[] = [
    ...SERVICES,
    {
        id: "local",
        label: "Local",
        account: "local",
        accounts: [
            {
                id: "local",
                label: "local",
                default: true,
                models: [{ id: "echo-1", label: "Echo 1", efforts: [] }],
            },
        ],
    },
];

/** An invented split: the claude account lacks Fable 5.1 that claude_extra offers. */
const PARTIAL_SERVICES: readonly ComposerModelService[] = SERVICES.map((service) =>
    service.id === "claude"
        ? {
              ...service,
              account: "claude_extra",
              accounts: [
                  {
                      id: "claude",
                      label: "Current CLI",
                      models: [OPUS_5_5, OPUS_5],
                  },
                  { id: "claude_extra", label: "work@example.com", models: CLAUDE_MODELS },
              ],
          }
        : service,
);

/** Asking the Chief of Staff only writes its draft; here it settles at once. */
const chiefOfStaffAsk = () => Promise.resolve();

/* claude_extra is hidden: its account is not offered, but a conversation on it
   keeps running there. grok_api has been switched off. */
const HIDDEN_SERVICES: readonly ComposerModelService[] = SERVICES.map((service) =>
    service.id === "claude"
        ? { ...service, accounts: service.accounts.filter((account) => account.id === "claude") }
        : service.id === "grok"
          ? { ...service, accounts: service.accounts.filter((account) => account.id === "grok") }
          : service,
);

const ON_HIDDEN: ComposerModelSelection = {
    service: "claude",
    account: "claude_extra",
    model: "opus-5-5",
    effort: "high",
};

const ON_UNAVAILABLE: ComposerModelSelection = {
    service: "grok",
    account: "grok_api",
    model: "grok-4.7",
    effort: "medium",
};

const UNAVAILABLE_NOTICE: ComposerModelAccountNotice = {
    kind: "unavailable",
    explanation: "The grok_api account is switched off, so nothing is sent to it.",
    request: [
        "Troubleshooting: account unavailable (grok_api)",
        "A conversation is set to the grok_api account, which is switched off on this Happy Agent, so nothing is routed to it.",
        "Account: grok_api, model grok-4.7\nAgent: agent-7f3k2",
        'Please help me manage my connected accounts: bring this account back, or tell me which account to move the conversation to. Use the "Accounts and models" recipe, and ask before changing anything.',
    ].join("\n\n"),
    onAsk: chiefOfStaffAsk,
};

/** A live picker over fixture data; the preview only seeds its transient state. */
function Picker(props: {
    preview?: ComposerModelControlPreview;
    selection?: ComposerModelSelection;
    selectionModel?: ComposerModelChoice;
    accountNotice?: ComposerModelAccountNotice;
    services?: readonly ComposerModelService[];
    usageWatch?: ComposerModelUsageWatch;
}) {
    const [selection, selectionSet] = useState(props.selection ?? ASTRA);
    return (
        <ComposerModelControl
            accountNotice={props.accountNotice}
            onAccountsManage={chiefOfStaffAsk}
            onSelect={selectionSet}
            preview={props.preview}
            selection={selection}
            selectionModel={props.selectionModel}
            services={props.services ?? SERVICES}
            usageWatch={props.usageWatch ?? usageWatch}
        />
    );
}

/** Pins the pill to the bottom-right corner, where the composer puts it, with room for its lists. */
function Anchor(props: { children: ReactNode; height?: number; width?: number | string }) {
    return (
        <div
            style={{
                display: "flex",
                width: props.width ?? 880,
                height: props.height ?? 480,
                alignItems: "flex-end",
                justifyContent: "flex-end",
            }}
        >
            {props.children}
        </div>
    );
}

function Open(props: {
    preview?: ComposerModelControlPreview;
    selection?: ComposerModelSelection;
    selectionModel?: ComposerModelChoice;
    accountNotice?: ComposerModelAccountNotice;
    services?: readonly ComposerModelService[];
    usageWatch?: ComposerModelUsageWatch;
    height?: number;
    width?: number | string;
}) {
    return (
        <Anchor height={props.height} width={props.width}>
            <Picker
                accountNotice={props.accountNotice}
                preview={{ panel: "model", ...props.preview }}
                selection={props.selection}
                selectionModel={props.selectionModel}
                services={props.services}
                usageWatch={props.usageWatch}
            />
        </Anchor>
    );
}

const OPUS_MEDIUM: ComposerModelSelection = {
    service: "claude",
    account: "claude",
    model: "opus-5-5",
    effort: "medium",
};

const OPUS_EXTRA: ComposerModelSelection = { ...OPUS_MEDIUM, account: "claude_extra" };

/** Claude on an account whose id is longer than the model list is wide. */
const LONG_ACCOUNT = "claude_kirill_for_sms_gmail";
const LONG_ACCOUNT_SERVICES: readonly ComposerModelService[] = SERVICES.map((service) =>
    service.id === "claude"
        ? {
              ...service,
              accounts: [
                  ...service.accounts,
                  { id: LONG_ACCOUNT, label: LONG_ACCOUNT, models: CLAUDE_MODELS },
              ],
          }
        : service,
);
const OPUS_LONG_ACCOUNT: ComposerModelSelection = { ...OPUS_MEDIUM, account: LONG_ACCOUNT };

/* Claude on a long address whose week is running low and whose session is nearly spent. */
const EMAIL_ACCOUNT = "kirill2003deforsms@gmail.com";
const EMAIL_ACCOUNT_SERVICES: readonly ComposerModelService[] = SERVICES.map((service) =>
    service.id === "claude"
        ? {
              ...service,
              accounts: [
                  ...service.accounts,
                  { id: EMAIL_ACCOUNT, label: EMAIL_ACCOUNT, models: CLAUDE_MODELS },
              ],
          }
        : service,
);
const OPUS_EMAIL_ACCOUNT: ComposerModelSelection = { ...OPUS_MEDIUM, account: EMAIL_ACCOUNT };
const emailAccountLow = usageWith(EMAIL_ACCOUNT, {
    week: { label: "Week", usedPercent: 82, resets: "resets Thu 6:00 PM" },
    session: { label: "Session", usedPercent: 95, resets: "resets 11:10 PM" },
    updatedAt: NOW - 2 * MINUTE,
});

/* The selected Claude account running low on its week, its session, or spent. */
const claudeWeekLow = usageWith("claude", {
    ...CLAUDE,
    week: { label: "Week", usedPercent: 88, resets: "resets Thu 6:00 PM" },
});
const claudeSessionLow = usageWith("claude", {
    ...CLAUDE,
    session: { label: "Session", usedPercent: 85, resets: "resets 6:20 PM" },
});
const claudeBothLow = usageWith("claude", {
    week: { label: "Week", usedPercent: 88, resets: "resets Thu 6:00 PM" },
    session: { label: "Session", usedPercent: 92, resets: "resets 6:20 PM" },
    updatedAt: NOW - 3 * MINUTE,
});
const claudeWeekSpent = usageWith("claude", {
    ...CLAUDE,
    week: { label: "Week", usedPercent: 100, resets: "resets Thu 6:00 PM", blocking: true },
    limit: { resets: "Thu 6:00 PM" },
});

/** The closed pill on Opus, with room above it for its label. */
function Pill(props: {
    preview?: ComposerModelControlPreview;
    usageWatch?: ComposerModelUsageWatch;
}) {
    return (
        <Anchor height={72} width={360}>
            <Picker preview={props.preview} selection={OPUS_MEDIUM} usageWatch={props.usageWatch} />
        </Anchor>
    );
}

export function ComposerModelControlPage() {
    const [configured, configuredSet] = useState(false);
    const [selection, selectionSet] = useState(ASTRA);
    return (
        <ComponentPage
            number={componentNumber}
            title="Composer model control"
            summary="The pill opens a menu of two rows, Model and Effort, each naming its current choice. Model opens the catalog beside the menu, where each service header names its account and opens the accounts; Effort opens the chosen model's efforts."
        >
            <Specimen
                number="01"
                label="Closed"
                detail="The pill names the model and its effort."
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 800 }}>
                    <Composer
                        mentions={[]}
                        modelControl={<Picker />}
                        onAttachmentsSelect={() => undefined}
                        onSend={() => undefined}
                        onValueChange={() => undefined}
                        placeholder="Message Happy…"
                        value=""
                    />
                </div>
            </Specimen>
            <Specimen
                number="02"
                label="Menu"
                detail="Two rows: Model and Effort, each with its current choice and a chevron to its list."
                stage="surface"
            >
                <Open preview={{ panel: "main" }} height={200} />
            </Specimen>
            <Specimen
                number="03"
                label="Model list"
                detail="Model opens the catalog beside the menu, bottom edges level. Astra is chosen: its check follows its name. Each header reads its service and account, such as Codex (Current CLI), with a chevron centred on the text."
                stage="surface"
            >
                <Open />
            </Specimen>
            <Specimen
                number="04"
                label="Effort list"
                detail="Effort opens the chosen model's efforts beside the menu, the check after the current one. Picking one applies it and closes the menu; horizontal scroll over the Effort row steps it in place."
                stage="surface"
            >
                <Open preview={{ panel: "effort" }} height={320} />
            </Specimen>
            <Specimen
                number="05"
                label="Hovered row"
                detail="Sol, hovered below the selected Astra. The two highlights keep a gap."
                stage="surface"
            >
                <Open preview={{ activeModel: { service: "codex", model: "gpt-6-sol" } }} />
            </Specimen>
            <Specimen
                number="06"
                label="Header hovered"
                detail="The whole header is one button: pointing anywhere on it, a usage ring included, highlights the line the way a hovered model row is highlighted."
                stage="surface"
            >
                <Open preview={{ accountButtonHover: "claude" }} />
            </Specimen>
            <Specimen
                number="07"
                label="Account panel"
                detail="Clicking Claude's header opens its accounts beside the model list, away from the menu and level with the header."
                stage="surface"
            >
                <Open preview={{ accounts: "claude", accountHover: "claude" }} width={1140} />
            </Specimen>
            <Specimen
                number="08"
                label="Account panel inside a pane"
                detail="The pane the menu is painted in clips at the sidebar beside it and has no room for the account panel on the left of the model list, so the panel stays inside the pane, over the menu."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 480 }}>
                    <div style={{ display: "flex", flex: "0 0 640px", overflow: "hidden" }}>
                        <Open
                            preview={{ accounts: "claude", accountHover: "claude" }}
                            width={620}
                        />
                    </div>
                    <div
                        style={{
                            flex: "1 1 auto",
                            borderLeft: "1px solid var(--divider)",
                            background: "var(--surface-high)",
                        }}
                    />
                </div>
            </Specimen>
            <Specimen
                number="09"
                label="Default account and a named one"
                detail="Codex runs on Current CLI. Claude runs on work@example.com, the configured account's friendly name. A header shows a ring only while its account runs low: Codex has room, so it shows none; work@example.com's week has room but only 7% of its session is left, so Claude's header shows that one window, in red. The rest of the usage lives in the account panel."
                stage="surface"
            >
                <Open selection={OPUS_EXTRA} />
            </Specimen>
            <Specimen
                number="09b"
                label="Long account name"
                detail="Claude runs on claude_kirill_for_sms_gmail, which has no reading: its header shows no rings and saves no room for them. The account ends in an ellipsis well before the chevron, which stays on the right edge, so the list keeps its width. The full name is in the account panel."
                stage="surface"
            >
                <Open selection={OPUS_LONG_ACCOUNT} services={LONG_ACCOUNT_SERVICES} />
            </Specimen>
            <Specimen
                number="09d"
                label="Header usage running low"
                detail="Claude runs on a long address with 18% of its week left and 5% of its session. Both are low, but the week wins: one yellow ring for the week, never two. The address ends in an ellipsis; the ring and the chevron keep the right edge, level with every line's. Pointing at the ring names its window, what is left, and when it starts over. Grok has no reading, so its header has no ring."
                stage="surface"
            >
                <Open
                    selection={OPUS_EMAIL_ACCOUNT}
                    services={EMAIL_ACCOUNT_SERVICES}
                    usageWatch={emailAccountLow}
                />
            </Specimen>
            <Specimen
                number="09c"
                label="Long account name, account panel"
                detail="The same account in the panel beside the list. It has no reading, so nothing sits beside it and the name keeps the whole row before it ends in an ellipsis."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: LONG_ACCOUNT }}
                    selection={OPUS_LONG_ACCOUNT}
                    services={LONG_ACCOUNT_SERVICES}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="10"
                label="Session running low"
                detail="claude_extra runs on a setup token, its windows read from rate-limit headers. Its week has plenty left, but only 7% of its session is: that ring and number turn red."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude_extra" }}
                    selection={OPUS_EXTRA}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="11"
                label="API-key account without usage"
                detail="grok_api is an API key, and the Grok API has no usage endpoint: its row shows no ring, and its usage reads unknown, never 0% left. The grok CLI account has no reading either."
                stage="surface"
            >
                <Open preview={{ accounts: "grok", accountHover: "grok_api" }} width={1140} />
            </Specimen>
            <Specimen
                number="12"
                label="Account without the model"
                detail="Fable 5.1 runs on work@example.com. Current CLI has no Fable 5.1, but it can still be picked: the selection moves to its top model, Opus 5.5, on its remembered or default effort."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude" }}
                    selection={{
                        service: "claude",
                        account: "claude_extra",
                        model: "fable-5-1",
                        effort: "medium",
                    }}
                    services={PARTIAL_SERVICES}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="13"
                label="Long catalog"
                detail="The model list stops at 480 px and scrolls. Its scrollbar stays visible whenever the list overflows, even in Automatic mode, showing where you are in the catalog. The benchmarks link stays in view."
                stage="surface"
            >
                <Open height={560} services={LONG_SERVICES} />
            </Specimen>
            <Specimen
                number="14"
                label="Header focus above a hovered row"
                detail="Keyboard focus on Codex's header above a hovered, selected GPT-6 Astra, in the composer. Nothing touches."
                stage="surface"
            >
                <div
                    className="happy-theme-dark"
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        width: 800,
                        height: 520,
                        padding: 16,
                        background: "var(--surface-high)",
                    }}
                >
                    <Composer
                        mentions={[]}
                        modelControl={
                            <Picker
                                preview={{
                                    panel: "model",
                                    activeModel: { service: "codex", model: "gpt-6-astra" },
                                    accountFocus: "codex",
                                }}
                            />
                        }
                        onAttachmentsSelect={() => undefined}
                        onSend={() => undefined}
                        onValueChange={() => undefined}
                        placeholder="Message Happy…"
                        value=""
                    />
                </div>
            </Specimen>
            <Specimen
                number="15"
                label="Model without efforts"
                detail="A made-up model with no effort levels has no Effort row, and the pill names only the model."
                stage="surface"
            >
                <Open
                    height={560}
                    preview={{ panel: "main" }}
                    selection={{ service: "local", account: "local", model: "echo-1" }}
                    services={NO_EFFORT_SERVICES}
                />
            </Specimen>
            <Specimen
                number="16"
                label="Swipe account"
                detail="Horizontal scroll over a header steps its account and moves the selected model onto it, or onto the account's top model when it lacks this one."
                stage="surface"
            >
                <Open selection={OPUS_MEDIUM} />
            </Specimen>
            <Specimen
                number="17"
                label="Models not configured"
                detail="An empty node may still report a default model and effort. Neither is presented as a usable configuration."
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 800 }}>
                    <Composer
                        disabled
                        mentions={[]}
                        modelControl={
                            <ComposerModelControl
                                selection={{
                                    service: "bedrock",
                                    account: "bedrock",
                                    model: "openai/gpt-5.6-sol",
                                }}
                                services={[]}
                            />
                        }
                        onAttachmentsSelect={() => undefined}
                        onSend={() => undefined}
                        onValueChange={() => undefined}
                        placeholder="Configure models to start messaging…"
                        value=""
                    />
                </div>
            </Specimen>
            <Specimen
                number="18"
                label="Catalog changes"
                detail="Adding models enables the picker. Removing all models closes it immediately."
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", width: 560, gap: 16 }}>
                    <Button onClick={() => configuredSet(!configured)}>
                        {configured ? "Remove configured models" : "Configure models"}
                    </Button>
                    <Anchor width={560}>
                        <ComposerModelControl
                            onSelect={selectionSet}
                            selection={selection}
                            services={configured ? SERVICES : []}
                        />
                    </Anchor>
                </div>
            </Specimen>
            <Specimen
                number="19"
                label="Hidden account selected"
                detail="The conversation runs on claude_extra, which is hidden from the pickers. It stays selected and keeps working; a quiet grey triangle beside the pill explains it on hover. The account list does not offer it."
                stage="surface"
            >
                <Anchor height={120}>
                    <Picker
                        accountNotice={{ kind: "hidden" }}
                        preview={{ accountNoticeOpen: true }}
                        selection={ON_HIDDEN}
                        selectionModel={OPUS_5_5}
                        services={HIDDEN_SERVICES}
                    />
                </Anchor>
            </Specimen>
            <Specimen
                number="20"
                label="Unavailable account selected"
                detail="The conversation is set to grok_api, which is switched off. The triangle is red; clicking it explains what happened, shows the exact request, and offers to put it in the Chief of Staff's draft. Nothing is sent."
                stage="surface"
            >
                <Anchor height={400}>
                    <Picker
                        accountNotice={UNAVAILABLE_NOTICE}
                        preview={{ accountNoticeOpen: true }}
                        selection={ON_UNAVAILABLE}
                        selectionModel={{ ...GROK_MODELS[0]!, disabled: true }}
                        services={HIDDEN_SERVICES}
                    />
                </Anchor>
            </Specimen>
            <Specimen
                number="21"
                label="Manage accounts"
                detail="The model list's footer offers Manage accounts directly above Latest benchmarks, on the same line style. It adds a Manage connected accounts request to the Chief of Staff's draft and opens that conversation."
                stage="surface"
            >
                <Open
                    accountNotice={{ kind: "hidden" }}
                    selection={ON_HIDDEN}
                    selectionModel={OPUS_5_5}
                    services={HIDDEN_SERVICES}
                />
            </Specimen>
            <Specimen
                number="22"
                label="Usage freshness"
                detail="Each account's row shows how much of its week is left beside a small ring. Under the list, the hovered account's week and session, each with its local reset time, then a quiet line saying how long ago the account was read. It counts on while the menu stays open; opening the menu asks for a fresh reading of every account it lists."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude" }}
                    selection={OPUS_MEDIUM}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="23"
                label="Usage updating"
                detail="The reading is 47 minutes old and the daemon is reading the account now. The old numbers stay in place until the new ones arrive."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude" }}
                    selection={OPUS_MEDIUM}
                    usageWatch={claudeUpdating}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="24"
                label="Usage refresh failed"
                detail="The latest read failed, so the line names the time of the reading still shown and says the refresh did not work. Hovering it shows why."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude" }}
                    selection={OPUS_MEDIUM}
                    usageWatch={claudeRefreshFailed}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="25"
                label="Window from an earlier reading"
                detail="The session was just read, but the week is from nearly two hours ago, so it is named with its own time."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude" }}
                    selection={OPUS_MEDIUM}
                    usageWatch={claudeWeeklyBehind}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="26"
                label="Spent account"
                detail="claude_extra has used its whole week: its ring is empty and red, in the list and below it. The red line says when the limit lifts; once the daemon reads the account again after that, it goes without anyone asking."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude_extra" }}
                    selection={OPUS_EXTRA}
                    usageWatch={claudeExtraSpent}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="27"
                label="Several accounts"
                detail="Every account's week at a glance: plenty left in grey, little left in yellow, a spent week in red. The long address takes all the room up to its number before it ends in an ellipsis; the API key has no reading, so nothing sits beside it."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude_low" }}
                    selection={OPUS_MEDIUM}
                    services={MANY_ACCOUNT_SERVICES}
                    usageWatch={manyAccountsUsage}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="28"
                label="Never read"
                detail="The account has no reading yet and is being read for the first time: no ring in its row, usage unknown below, and Updating… until the first numbers arrive."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "claude", accountHover: "claude" }}
                    selection={OPUS_MEDIUM}
                    usageWatch={claudeNeverRead}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="29"
                label="Pill with room left"
                detail="The selected account has plenty of its week and session left, so the closed pill shows no ring and keeps no room for one."
                stage="surface"
            >
                <Pill />
            </Specimen>
            <Specimen
                number="30"
                label="Pill, week running low"
                detail="12% of the week is left: a yellow ring before the model name. The week wins over the session whenever it is low."
                stage="surface"
            >
                <Pill usageWatch={claudeWeekLow} />
            </Specimen>
            <Specimen
                number="31"
                label="Pill, session running low"
                detail="Only the session is low, 15% left, so the ring reads the session."
                stage="surface"
            >
                <Pill usageWatch={claudeSessionLow} />
            </Specimen>
            <Specimen
                number="32"
                label="Pill, week spent"
                detail="The week is spent and holds the account back: an empty red ring until it resets."
                stage="surface"
            >
                <Pill usageWatch={claudeWeekSpent} />
            </Specimen>
            <Specimen
                number="33"
                label="Pill warning label"
                detail="Pointing at the pill names the window, what is left, and when it resets, in local time."
                stage="surface"
            >
                <Pill preview={{ usageWarningOpen: true }} usageWatch={claudeWeekLow} />
            </Specimen>
            <Specimen
                number="34"
                label="Pill, week and session both low"
                detail="12% of the week and 8% of the session are left. The week wins: one yellow ring for the week, and the red session waits in the menu."
                stage="surface"
            >
                <Pill usageWatch={claudeBothLow} />
            </Specimen>
            <Specimen
                number="35"
                label="Pool and its accounts"
                detail="Pool takes turns between two Codex accounts, which hang under it like children in the sidebar. They are not choices: the hidden one is reachable only through Pool, and Current CLI is also its own row. Current CLI has signed out, so both of its rows say Signed out in place of a gauge, and the second account carries the pool."
                stage="surface"
            >
                <Open
                    preview={{ accounts: "codex", accountHover: "codex_pool" }}
                    selection={ON_POOL}
                    services={POOL_SERVICES}
                    usageWatch={poolSignedOut}
                    width={1140}
                />
            </Specimen>
            <Specimen
                number="36"
                label="Pool account pointed at"
                detail="Pointing at a pool's account shows its own week and session below the list, and when it was last read. The pool's Current CLI is highlighted, not the Current CLI row of its own, although both are the same account."
                stage="surface"
            >
                <Open
                    preview={{
                        accounts: "codex",
                        poolMemberHover: { pool: "codex_pool", member: "codex" },
                    }}
                    selection={ON_POOL}
                    services={POOL_SERVICES}
                    usageWatch={poolSignedOut}
                    width={1140}
                />
            </Specimen>
        </ComponentPage>
    );
}
