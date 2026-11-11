import {
    chatUiComponentKey,
    type ChatUiDefaultModel,
    type ConversationMediaItem,
    type ConversationQuickReplies,
    type ConversationUi,
    type UiWireComponent,
} from "happy-desktop-state";
import { Message } from "../../src/Message";
import { UiDocumentView, type UiDocumentViewProps } from "../../src/ui/UiDocumentView";
import { UiQuickReplies, uiQuickRepliesLayout } from "../../src/ui/UiQuickReplies";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-339";

/* Fixture documents only: nothing here was sent by a daemon. */
const OFFER = { messageId: "msgfixture01", uiId: "uifixture01" };

const documentOf = (
    components: readonly UiWireComponent[],
    extra: Partial<Pick<ConversationUi, "media" | "attempts">> = {},
): ConversationUi => ({
    offer: OFFER,
    document: { id: OFFER.uiId, components: [...components] },
    media: extra.media ?? [],
    attempts: extra.attempts ?? new Map(),
});

const FILE_TREE: UiWireComponent = {
    id: "tree",
    type: "file_tree",
    fallback: "weather-cli: src/index.ts, src/forecast.ts, package.json",
    props: {
        paths: [
            "weather-cli/src/index.ts",
            "weather-cli/src/forecast.ts",
            "weather-cli/src/ui/chart/Bars.tsx",
            "weather-cli/package.json",
            "weather-cli/README.md",
        ],
    },
};

const MEDIA: readonly ConversationMediaItem[] = [
    {
        kind: "image",
        name: "landscape.webp",
        mimeType: "image/webp",
        size: 0,
        width: 1600,
        height: 900,
        url: new URL("../assets/crop-landscape.webp", import.meta.url).href,
    },
    {
        kind: "image",
        name: "portrait.webp",
        mimeType: "image/webp",
        size: 0,
        width: 900,
        height: 1600,
        url: new URL("../assets/crop-portrait.webp", import.meta.url).href,
    },
    {
        kind: "image",
        name: "cover.webp",
        mimeType: "image/webp",
        size: 0,
        width: 1600,
        height: 900,
        url: new URL("../assets/feed-cover-launch.webp", import.meta.url).href,
    },
    {
        kind: "document",
        name: "forecast-report.pdf",
        mimeType: "application/pdf",
        size: 0,
        url: "about:blank",
    },
];

const IMAGES: UiWireComponent = {
    id: "shots",
    type: "media",
    fallback: "2 images: The forecast, wide · The forecast on a phone",
    props: {
        items: [
            { mediaIndex: 0, label: "The forecast, wide" },
            { mediaIndex: 1, label: "The forecast on a phone" },
        ],
    },
};

const IMAGES_AND_FILE: UiWireComponent = {
    id: "files",
    type: "media",
    fallback: "4 files",
    props: {
        items: [{ mediaIndex: 0 }, { mediaIndex: 2 }, { mediaIndex: 1 }, { mediaIndex: 3 }],
    },
};

const DEFAULT_MODEL: UiWireComponent = {
    id: "model",
    type: "default_model",
    fallback: "Choose the default model in Happy on your computer",
    props: {},
};

/* A type from a newer daemon, which this build has never heard of. */
const UNKNOWN: UiWireComponent = {
    id: "future",
    type: "calendar_pick",
    fallback: "Pick a time for the call: Tue 10:00, Wed 14:00",
    props: { slots: ["Tue 10:00", "Wed 14:00"] },
};

/* A type the catalog knows and this build has no drawing for. */
const SIGN_IN: UiWireComponent = {
    id: "sign-in",
    type: "provider_sign_in",
    fallback: "Sign in to Claude in Happy on your computer",
    props: { provider: "claude" },
};

/* A `media` naming an item its document does not hold: the whole component falls back. */
const MEDIA_MISSING: UiWireComponent = {
    id: "missing",
    type: "media",
    fallback: "2 images: Before · After",
    props: {
        items: [
            { mediaIndex: 0, label: "Before" },
            { mediaIndex: 9, label: "After" },
        ],
    },
};

/* A known type whose props are not its type's. */
const MALFORMED: UiWireComponent = {
    id: "broken",
    type: "file_tree",
    fallback: "The project's files",
    props: { paths: "src/index.ts" },
};

const MODELS: ChatUiDefaultModel = {
    loading: false,
    current: { providerId: "codex", modelId: "openai/gpt-6.1-sol", effort: "medium" },
    choices: [
        {
            providerId: "codex",
            providerType: "codex",
            providerName: "Codex",
            modelId: "openai/gpt-6.1-sol",
            modelName: "GPT-6.1 Sol",
            efforts: ["low", "medium", "high", "xhigh"],
            defaultEffort: "medium",
        },
        {
            providerId: "claude",
            providerType: "claude",
            providerName: "Claude",
            modelId: "anthropic/claude-fable-5-2",
            modelName: "Fable 5.2",
            efforts: ["low", "medium", "high"],
            defaultEffort: "high",
        },
    ],
};

const MODEL_KEY = chatUiComponentKey(OFFER, DEFAULT_MODEL.id);
const never = (): Promise<undefined> => new Promise(() => undefined);
const model = (view: Partial<UiDocumentViewProps> = {}): UiDocumentViewProps => ({
    ui: documentOf([DEFAULT_MODEL]),
    defaultModel: MODELS,
    onAction: never,
    ...view,
});

const DOCUMENTS: readonly {
    readonly number: string;
    readonly label: string;
    readonly detail: string;
    readonly view: UiDocumentViewProps;
    /** The measure the specimen is drawn at; absent, 600px. */
    readonly width?: number;
}[] = [
    {
        number: "C-339a",
        label: "File tree",
        detail: "paths as a quiet tree; a lone chain of folders reads as one path",
        view: { ui: documentOf([FILE_TREE]) },
    },
    {
        number: "C-339b",
        label: "Media",
        detail: "justified rows from the items' own sizes; a label is one line under its item",
        view: { ui: documentOf([IMAGES], { media: MEDIA }), onMediaOpen: () => undefined },
    },
    {
        number: "C-339c",
        label: "Media, several rows and a file",
        detail: "a file that is no picture is its icon and name in the same box",
        view: { ui: documentOf([IMAGES_AND_FILE], { media: MEDIA }) },
    },
    {
        number: "C-339d",
        label: "Default model",
        detail: "the server's catalog, live; a change is one click",
        view: model(),
    },
    {
        number: "C-339e",
        label: "Default model, saving",
        detail: "a click from this window is on its way",
        view: model({
            pending: new Map([[MODEL_KEY, { type: "default_model.set", payload: {} }]]),
        }),
    },
    {
        number: "C-339f",
        label: "Default model, reading",
        detail: "before the catalog arrives; the row is already its height",
        view: model({ defaultModel: { loading: true, choices: [] } }),
    },
    {
        number: "C-339g",
        label: "Default model, refused before a record",
        detail: "the server's refusal takes the line",
        view: model({
            errors: new Map([[MODEL_KEY, "Not allowed. Your role does not permit this."]]),
        }),
    },
    {
        number: "C-339h",
        label: "Default model, recorded as failed",
        detail: "the attempt record's reason, from any device",
        view: model({
            ui: documentOf([DEFAULT_MODEL], {
                attempts: new Map([
                    [
                        DEFAULT_MODEL.id,
                        {
                            action: { type: "default_model.set", payload: {} },
                            outcome: {
                                status: "rejected",
                                reason: "That model is no longer offered.",
                            },
                        },
                    ],
                ]),
            }),
        }),
    },
    {
        number: "C-339i",
        label: "Default model, not permitted",
        detail: "a viewer without `config.manage`: drawn disabled, and why",
        view: model({ granted: new Set() }),
    },
    {
        number: "C-339j",
        label: "Default model, read only",
        detail: "a conversation that takes no message takes no click",
        view: { ui: documentOf([DEFAULT_MODEL]), defaultModel: MODELS },
    },
    {
        number: "C-339s",
        label: "Default model, narrow column",
        detail: "under 540px the selects go under the words, at the column's width",
        view: model(),
        width: 320,
    },
    {
        number: "C-339t",
        label: "Default model, narrow column, refused",
        detail: "the stacked row holds every state in the same box",
        view: model({
            errors: new Map([[MODEL_KEY, "Not allowed. Your role does not permit this."]]),
        }),
        width: 320,
    },
    {
        number: "C-339k",
        label: "Fallback",
        detail: "an unknown type, a known type with no drawing here, props that are not the type's, a media item that is missing, and a live type on a surface with no catalog",
        view: {
            ui: documentOf([UNKNOWN, SIGN_IN, MALFORMED, MEDIA_MISSING, DEFAULT_MODEL], {
                media: MEDIA,
            }),
        },
    },
    {
        number: "C-339l",
        label: "A whole document",
        detail: "components top to bottom, 16px apart",
        view: model({
            ui: documentOf([FILE_TREE, DEFAULT_MODEL, UNKNOWN, IMAGES], { media: MEDIA }),
        }),
    },
];

const REPLIES: ConversationQuickReplies = {
    messageId: "msgfixture02",
    toolCallId: "callfixture01",
    options: ["Write code", "Plan a launch", "Just look around"],
    live: true,
};

const REPLIES_LONG: ConversationQuickReplies = {
    messageId: "msgfixture03",
    options: [
        "Yes, ship it",
        "Not yet — run the slow browser suite first, then tell me which engines failed and why, and what you would change before trying again",
        "Show me the diff",
    ],
    live: true,
};

const QUICK_REPLIES: readonly {
    readonly number: string;
    readonly label: string;
    readonly detail: string;
    readonly replies: ConversationQuickReplies;
    readonly sent?: boolean;
}[] = [
    {
        number: "C-339m",
        label: "Quick replies",
        detail: "the person's bubbles, fainter, one under another; the newest takes a tap",
        replies: REPLIES,
    },
    {
        number: "C-339n",
        label: "Quick replies, just tapped",
        detail: "sent from this window and not yet back in the transcript: no second tap",
        replies: REPLIES,
        sent: true,
    },
    {
        number: "C-339o",
        label: "Quick replies, one sent",
        detail: "the sent one takes the bubble's fill and a tick, the rest go quiet; nothing moves",
        replies: { ...REPLIES, chosen: 1, live: false },
    },
    {
        number: "C-339p",
        label: "Quick replies, passed by",
        detail: "someone wrote since: kept, but no longer taking a tap",
        replies: { ...REPLIES, live: false },
    },
    {
        number: "C-339q",
        label: "Quick replies, a long option",
        detail: "two lines at most; a longer option ends in an ellipsis",
        replies: REPLIES_LONG,
    },
];

export function ChatUiPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Chat UI: a document's components drawn top to bottom, 16px apart, on the reply's measure, and the replies an agent suggests. A component this build doesn't draw shows the server's fallback line; a live one keeps one fixed box."
            title="Chat UI"
        >
            <div className="specimen-grid">
                {DOCUMENTS.map((specimen) => (
                    <Specimen
                        detail={specimen.detail}
                        key={specimen.number}
                        label={specimen.label}
                        number={specimen.number}
                        stage="surface"
                    >
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                padding: "24px",
                                width: `${(specimen.width ?? 600) + 48}px`,
                            }}
                        >
                            <UiDocumentView {...specimen.view} width={specimen.width ?? 600} />
                        </div>
                    </Specimen>
                ))}
                {QUICK_REPLIES.map((specimen) => (
                    <Specimen
                        detail={specimen.detail}
                        key={specimen.number}
                        label={specimen.label}
                        number={specimen.number}
                        stage="surface"
                    >
                        <div style={{ display: "flex", width: "720px" }}>
                            <UiQuickReplies
                                layout={uiQuickRepliesLayout(specimen.replies.options, 720)}
                                onSend={() => undefined}
                                replies={specimen.replies}
                                sent={specimen.sent ?? false}
                            />
                        </div>
                    </Specimen>
                ))}
                <Specimen
                    detail="a tapped reply is the person's own message, marked with where it came from"
                    label="Sent from a suggestion"
                    number="C-339r"
                    stage="surface"
                >
                    <div style={{ display: "flex", flexDirection: "column", width: "720px" }}>
                        <Message
                            author="You"
                            authorNote="↩ Suggested reply"
                            body="Plan a launch"
                            initials="Y"
                            own
                            time="10:52"
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
