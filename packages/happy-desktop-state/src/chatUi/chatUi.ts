import {
    uiActionAllowed,
    uiActionText,
    uiActionDefinition,
    type UiActionBlock,
    type UiActionDefinition,
    type UiActionInput,
    type UiActionOutcome,
    type UiComponent,
    type UiDocument,
    type UiPermissionId,
} from "@slopus/happy-agent-client";
import type { ConversationMediaItem } from "../conversation/conversationEntry.js";

export type {
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
 * message entry that shows it; clicks go to `POST /v0/agents/:id/actions`.
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
    /** The pictures an `images` component names by `mediaIndex`; empty for a daemon's document. */
    readonly media: readonly ConversationMediaItem[];
    /** Each component's last recorded attempt, by component ID. */
    readonly attempts: ReadonlyMap<string, ConversationUiAttempt>;
    /** Each component's accepted `once` answer, by component ID: what it shows as chosen. */
    readonly answers: ReadonlyMap<string, UiActionInput>;
    /**
     * No person's message is recorded after the offer's message, so a `once`
     * action may still answer it. Once anyone speaks, every older offer closes.
     */
    readonly open: boolean;
};

/** The key a component's local state is kept under in its conversation. */
export function chatUiComponentKey(offer: ConversationUiOffer, componentId: string): string {
    return `${offer.messageId}\u0000${offer.uiId}\u0000${componentId}`;
}

/** An action's definition in this build's catalog, by its type such as `choice.choose`. */
export function chatUiActionDefinition(type: string): UiActionDefinition | undefined {
    return uiActionDefinition(type)?.definition;
}

/** Whether a successful action becomes the person's words, so it gets an optimistic bubble. */
export function chatUiActionSays(type: string): boolean {
    return chatUiActionDefinition(type)?.transcript === "message";
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

/** The person's words a `"message"` action becomes against a component, as the server stores them. */
export function chatUiActionText(
    component: UiComponent,
    action: UiActionInput,
): string | undefined {
    return uiActionText(component, action);
}

/** A stored action block, as its record carries it. */
export type ChatUiActionBlock = UiActionBlock;
