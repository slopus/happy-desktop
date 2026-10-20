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
 * Usage as the provider-usage feed reports it. A full login (codex, claude)
 * reports its plan; claude_extra runs on a `claude setup-token` token, which
 * cannot read the plan, so its 5h and weekly windows come from rate-limit
 * headers and it has no plan. grok has no reading and grok_api, an API key,
 * has no usage API at all, so both read unknown.
 */
const USAGE: ReadonlyMap<string, ComposerModelAccountUsage> = new Map([
    [
        "codex",
        {
            plan: "Pro",
            windows: [
                { id: "fiveHour", label: "5h", usedPercent: 42, resets: "resets 4:10 PM" },
                { id: "weekly", label: "Weekly", usedPercent: 18, resets: "resets Mon 9:00 AM" },
            ],
            updatedAt: NOW - 3 * MINUTE,
        },
    ],
    [
        "claude",
        {
            plan: "Max",
            windows: [
                { id: "fiveHour", label: "5h", usedPercent: 12, resets: "resets 5:50 PM" },
                { id: "weekly", label: "Weekly", usedPercent: 64, resets: "resets Thu 8:00 PM" },
            ],
            updatedAt: NOW - 3 * MINUTE,
        },
    ],
    [
        "claude_extra",
        {
            windows: [
                { id: "fiveHour", label: "5h", usedPercent: 91, resets: "resets 2:35 PM" },
                { id: "weekly", label: "Weekly", usedPercent: 37, resets: "resets Fri 6:00 AM" },
            ],
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

const CLAUDE_WINDOWS = USAGE.get("claude")!.windows;

/* The default Claude account at each point of a refresh, and a spent one. */
const claudeUpdating = usageWith("claude", {
    plan: "Max",
    windows: CLAUDE_WINDOWS,
    updatedAt: NOW - 47 * MINUTE,
    refreshing: true,
});
const claudeRefreshFailed = usageWith("claude", {
    plan: "Max",
    windows: CLAUDE_WINDOWS,
    updatedAt: NOW - 19 * MINUTE,
    refreshError: "Claude did not answer the usage request in time.",
});
const claudeWeeklyBehind = usageWith("claude", {
    plan: "Max",
    windows: [
        { ...CLAUDE_WINDOWS[0]!, capturedAt: NOW - 2 * MINUTE },
        { ...CLAUDE_WINDOWS[1]!, capturedAt: NOW - 108 * MINUTE },
    ],
    updatedAt: NOW - 2 * MINUTE,
});
const claudeExtraSpent = usageWith("claude_extra", {
    windows: [
        { id: "fiveHour", label: "5h", usedPercent: 100, resets: "resets 3:05 PM" },
        { id: "weekly", label: "Weekly", usedPercent: 41, resets: "resets Fri 6:00 AM" },
    ],
    updatedAt: NOW - 6 * MINUTE,
    limit: { resets: "3:05 PM" },
});

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
                detail="Pointing at a header highlights just that button, the way a project's settings gear does in the sidebar."
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
                detail="Codex runs on Current CLI. Claude runs on work@example.com, the configured account's friendly name. Headers never show a plan; plans live in the account panel."
                stage="surface"
            >
                <Open selection={OPUS_EXTRA} />
            </Specimen>
            <Specimen
                number="09b"
                label="Long account name"
                detail="Claude runs on claude_kirill_for_sms_gmail. The header keeps Claude, the parentheses, and the chevron, and the account ends in an ellipsis, so the list stays as wide as its model names make it. The full name is in the account panel."
                stage="surface"
            >
                <Open selection={OPUS_LONG_ACCOUNT} services={LONG_ACCOUNT_SERVICES} />
            </Specimen>
            <Specimen
                number="09c"
                label="Long account name, account panel"
                detail="The same account in the panel beside the list, truncated the same way."
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
                label="Usage without a plan"
                detail="claude_extra runs on a setup token: its 5h and weekly usage are real, read from rate-limit headers, but it cannot see its plan, so its plan cell reads a muted dash."
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
                detail="grok_api is an API key, and the Grok API has no usage endpoint: its plan cell reads a dash and its usage reads unknown, never 0%. The grok CLI account reports no plan either."
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
                detail="The model list stops at 480 px and scrolls. The scrollbar stands beside the rows, the panel inset away from the selected row, and the benchmarks link stays in view."
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
                detail="Under the bars, a quiet line says how long ago the account was read. It counts on while the menu stays open; opening the menu asks for a fresh reading of every account it lists."
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
                detail="The 5h window was just read, but the weekly one is from nearly two hours ago, so it is named with its own time."
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
                detail="claude_extra has used its whole 5h window. The line leads with when the limit lifts; once the daemon reads the account again after that, the line goes without anyone asking."
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
                label="Follow-up while running"
                detail="While the agent works, the send control says what Enter does and what Command+Enter does instead; a locked choice names only the one delivery. Idle, it says nothing."
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 800 }}>
                    {(
                        [
                            { plain: "steer", command: "queue" },
                            { plain: "queue", command: "steer" },
                            { plain: "queue", command: "queue" },
                        ] as const
                    ).map((deliveries) => (
                        <Composer
                            key={`${deliveries.plain}-${deliveries.command}`}
                            mentions={[]}
                            modelControl={<Picker />}
                            onSend={() => undefined}
                            onStop={() => undefined}
                            onValueChange={() => undefined}
                            running
                            sendDeliveries={deliveries}
                            value="Then write the release notes."
                        />
                    ))}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
