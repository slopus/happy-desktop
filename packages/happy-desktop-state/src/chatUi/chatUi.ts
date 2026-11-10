import { Value } from "@sinclair/typebox/value";
import {
    knownReplyUiSchema,
    uiActionAllowed,
    uiActionDefinition,
    type UiActionBlock,
    type UiActionDefinition,
    type UiActionInput,
    type UiActionOutcome,
    type UiComponent,
    type UiDocument,
    type KnownReplyUi,
    type ReplyUi as WireReplyUi,
    type UiPermissionId,
    type UiProvider,
} from "@slopus/happy-agent-client";
import type { ConversationMediaItem } from "../conversation/conversationEntry.js";

export type {
    QuickReply,
    UiActionInput,
    UiActionResponse,
    UiActionOutcome,
    UiDocument,
    UiPermissionId,
} from "@slopus/happy-agent-client";

/**
 * Chat UI as a conversation carries it (happy-agent API.md "Chat UI"): a flat
 * list of typed components the daemon wrote into an agent message, or a model
 * showed with `show_ui`. Both carriers project to one `ConversationUi` on the
 * message entry that shows it; clicks go to `POST /v0/agents/:id/actions`,
 * and every one is silent: what it did shows in its component.
 */

export type { UiComponent } from "@slopus/happy-agent-client";

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
 * Replies the conversation suggests now (API.md "Quick replies"): the latest
 * suggestion, while no person's message has been recorded after it. A tap
 * sends the option as an ordinary message naming where it came from.
 */
export type ConversationQuickReplies = {
    /** The agent message holding the suggestion. */
    readonly messageId: string;
    /** The `suggest_replies` call holding it; absent for the message's own block. */
    readonly toolCallId?: string;
    readonly options: readonly string[];
    /**
     * What each option is about, by position, drawn beside its words; `null`
     * for a plain option or a reply type this build doesn't draw. Absent when
     * no option has one. Display-only: a tap still sends the option's text.
     */
    readonly ui?: readonly (ReplyUi | null)[];
    /** The option a person's message sent, by its `quickReply`: read back from the transcript. */
    readonly chosen?: number;
    /** It takes a tap: the newest suggestion, with no person's message after it. */
    readonly live: boolean;
};

/** One option's reply component as this build draws it: a known type, props checked. */
export type ReplyUi = KnownReplyUi;

/**
 * The note a reply component carries under its words, frozen by the daemon
 * when it stored the options: what the stack says for good, never a live
 * reading. None until the contract carries `note`.
 */
export function replyUiNote(_ui: ReplyUi | null | undefined): string | undefined {
    return undefined;
}

/** An AI whose program a reply option or a sign-in row is about. */
export type ReplyProviderId = UiProvider;

/** One stored `ui` entry as this build draws it, or `null` for a bare option or an unknown type. */
export function replyUiRead(value: WireReplyUi | null): ReplyUi | null {
    return value !== null && Value.Check(knownReplyUiSchema, value) ? value : null;
}

/** The shared `media` layout every client draws with; see the client's `layoutMedia`. */
export {
    layoutMedia,
    MEDIA_GAP,
    MEDIA_ROW_HEIGHT_DESKTOP,
    type MediaArrangement,
    type MediaArrangementItem,
    type MediaFrame,
} from "@slopus/happy-agent-client";

/** The key a component's local state is kept under in its conversation. */
export function chatUiComponentKey(offer: ConversationUiOffer, componentId: string): string {
    return `${offer.messageId}\u0000${offer.uiId}\u0000${componentId}`;
}

/** An action's definition in this build's catalog, by its type such as `provider_sign_in.submit_token`. */
export function chatUiActionDefinition(type: string): UiActionDefinition | undefined {
    return uiActionDefinition(type)?.definition;
}

/**
 * Who may use a control: every permission (a standalone daemon's one user),
 * or the permissions this server granted the viewer.
 */
export type ChatUiGranted = "all" | ReadonlySet<UiPermissionId>;

/** Whether the viewer may send `type` against `component`'s props, for display only. */
export function chatUiActionAllowed(
    component: UiComponent,
    type: string,
    granted: ChatUiGranted,
): boolean {
    const definition = chatUiActionDefinition(type);
    if (definition === undefined) return false;
    if (granted === "all") return true;
    return uiActionAllowed(definition, component.props, granted);
}

/** A stored action block, as its record carries it. */
export type ChatUiActionBlock = UiActionBlock;
