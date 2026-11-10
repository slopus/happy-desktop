import {
    HappyAgentApiError,
    uiActionAllowed,
    type ActionNamesOf,
    type PayloadOf,
    type ResultOf,
    type UiActionInput,
    type UiActionOutcome,
    type UiBundle,
    type UiDocument,
    type UiPermissionId,
} from "@slopus/happy-agent-client";
import type { ConversationMediaItem } from "../conversation/conversationEntry.js";

/**
 * Chat UI as a conversation carries it (happy-agent API.md "Chat UI"): a flat
 * list of typed components the daemon wrote into an agent message, or a model
 * showed with `show_ui`. Both carriers project to one `ConversationUi` on the
 * message entry that shows it. A click goes to `POST /v0/agents/:id/actions`
 * and never becomes the person's words: what it did shows in its component.
 */

export {
    defaultModelComponent,
    knownUiComponent,
    layoutMedia,
    MEDIA_GAP,
    MEDIA_LABEL_GAP,
    MEDIA_LABEL_LINE,
    MEDIA_ROW_HEIGHT_DESKTOP,
    type ActionNamesOf,
    type MediaArrangement,
    type MediaFrame,
    type PayloadOf,
    type QuickReply,
    type ResultOf,
    type UiActionInput,
    type UiActionOutcome,
    type UiBundle,
    type UiComponent,
    type UiDocument,
    type UiPermissionId,
    type UiWireComponent,
} from "@slopus/happy-agent-client";

/** Where an offer is: the agent message holding the document, and the document. */
export type ConversationUiOffer = {
    readonly messageId: string;
    readonly uiId: string;
};

/** The last attempt recorded on one component, from its service record; secrets left out. */
export type ConversationUiAttempt = {
    readonly action: UiActionInput;
    readonly outcome: UiActionOutcome;
};

/** A document on a message entry, with what the conversation recorded about it. */
export type ConversationUi = {
    readonly offer: ConversationUiOffer;
    readonly document: UiDocument;
    /** The pictures and recordings a `media` component names by `mediaIndex`; empty for a daemon's document. */
    readonly media: readonly ConversationMediaItem[];
    /** Each component's last recorded attempt, by component ID. */
    readonly attempts: ReadonlyMap<string, ConversationUiAttempt>;
};

/**
 * Replies a message suggests (API.md "Quick replies"). A tap sends the option
 * as an ordinary message naming where it came from.
 */
export type ConversationQuickReplies = {
    /** The agent message holding the suggestion. */
    readonly messageId: string;
    /** The `suggest_replies` call holding it; absent for the message's own block. */
    readonly toolCallId?: string;
    readonly options: readonly string[];
    /** The option a person's message sent, by its `quickReply`: read back from the transcript. */
    readonly chosen?: number;
    /** It takes a tap: the newest suggestion, with no person's message after it. */
    readonly live: boolean;
};

/** The key a component's local state is kept under in its conversation. */
export function chatUiComponentKey(offer: ConversationUiOffer, componentId: string): string {
    return `${offer.messageId}\u0000${offer.uiId}\u0000${componentId}`;
}

/** The key one suggestion and every `quickReply` naming it share. */
export function quickRepliesKey(replies: {
    readonly messageId: string;
    readonly toolCallId?: string;
}): string {
    return `${replies.messageId}\u0000${replies.toolCallId ?? ""}`;
}

/**
 * Who may use a control: every permission (a standalone daemon's one user),
 * or the permissions this server granted the viewer.
 */
export type ChatUiGranted = "all" | ReadonlySet<UiPermissionId>;

/**
 * Whether the viewer may send one of a bundle's actions against a component's
 * props. Only for drawing a control disabled; the server decides every click.
 */
export function chatUiActionAllowed<B extends UiBundle>(
    bundle: B,
    action: ActionNamesOf<B>,
    props: unknown,
    granted: ChatUiGranted,
): boolean {
    if (granted === "all") return true;
    const definition = bundle.actions[action];
    return definition !== undefined && uiActionAllowed(definition, props, granted);
}

/**
 * Sends one click on a component, typed by the component's bundle: the action
 * is one of the bundle's and the payload is that action's. The promise carries
 * the action's typed result to the caller alone, or `undefined` when it has
 * none; it rejects with a displayable `UserError` when nothing was recorded.
 */
export type ChatUiActionSend = <B extends UiBundle, K extends ActionNamesOf<B>>(
    offer: ConversationUiOffer,
    componentId: string,
    bundle: B,
    action: K,
    payload: PayloadOf<B, K>,
) => Promise<ResultOf<B, K> | undefined>;

/**
 * Whether a failed click may have been recorded all the same: it never
 * reached the daemon, timed out, or the daemon failed while answering. Such a
 * click is sent again under its own `id`, which replays a stored attempt; a
 * refusal (`400`, `403`, `404`, `409`, `429`) stored nothing.
 */
export function chatUiOutcomeUnknown(error: unknown): boolean {
    return !(error instanceof HappyAgentApiError) || error.status === 408 || error.status >= 500;
}
