import type {
    ConversationUiAttempt,
    UiActionInput,
    UiActionResponse,
    UiComponent,
} from "happy-desktop-state";
import type { ReactNode } from "react";

/**
 * What a chat UI component may do, as its document hands it down: send its
 * own actions, and know how its last one went. The server decides every
 * click; `allowed` only draws a control disabled.
 */
export type UiWidgetControl = {
    /**
     * Sends one of this component's actions, under one ID. The promise's
     * `result` is the caller's alone: a widget keeps a secret result in its
     * own memory and drops it when it goes. Absent, the component is inert.
     */
    readonly act?: (action: UiActionInput) => Promise<UiActionResponse>;
    /** Whether the viewer may send an action of this type. */
    readonly allowed: (type: string) => boolean;
    /** An action from this window that hasn't been answered yet. */
    readonly pending?: UiActionInput;
    /** The component's last recorded attempt, from any device. */
    readonly attempt?: ConversationUiAttempt;
    /**
     * Why the last attempt didn't go through: its record's refusal, or a
     * click the server refused before recording anything.
     */
    readonly error?: string;
};

/**
 * The components whose state is live on the server, each drawn by the owner
 * of that state from its own store: the conversation knows the document, the
 * owner knows the provider, the model catalog, the phone, the team.
 */
export type ChatUiLive = {
    readonly [type in ChatUiLiveType]?: (
        component: UiComponent,
        control: UiWidgetControl,
    ) => ReactNode;
};

export type ChatUiLiveType =
    | "provider_sign_in"
    | "default_model"
    | "phone_pair"
    | "invite"
    | "github_connect"
    | "compute_join";

/** Whether a component type is drawn from live state rather than its props alone. */
export function chatUiLiveType(type: string): type is ChatUiLiveType {
    return (
        type === "provider_sign_in" ||
        type === "default_model" ||
        type === "phone_pair" ||
        type === "invite" ||
        type === "github_connect" ||
        type === "compute_join"
    );
}

/**
 * Sends an action and swallows its rejection: the control already shows why
 * from the store's own error, so nothing more is owed to the click.
 */
export function uiWidgetSend(
    control: UiWidgetControl,
    type: string,
    payload: Readonly<Record<string, unknown>> = {},
): Promise<UiActionResponse | undefined> {
    const act = control.act;
    if (act === undefined || !control.allowed(type)) return Promise.resolve(undefined);
    return act({ type, payload: { ...payload } }).catch(() => undefined);
}
