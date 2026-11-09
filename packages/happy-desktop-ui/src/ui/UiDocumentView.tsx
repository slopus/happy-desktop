import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    chatUiActionAllowed,
    chatUiActionSays,
    chatUiComponentKey,
    type ChatUiGranted,
    type ConversationUi,
    type UiActionInput,
    type UiActionResponse,
    type UiComponent,
} from "happy-desktop-state";
import { ChatSettingsFigure } from "../ChatActionFigures";
import { messageTextLayoutFontGenerationGet } from "../messageTextLayout";
import { UiChecklist } from "./UiChecklist";
import { UiChoice } from "./UiChoice";
import { UiFallback } from "./UiFallback";
import { UiFileTree } from "./UiFileTree";
import { UiImages } from "./UiImages";
import { UiPhoneApp } from "./UiPhoneApp";
import type { UiControlState } from "./UiStatusLine";
import { UiTextField } from "./UiTextField";
import { chatUiLiveType, type ChatUiLive, type UiWidgetControl } from "./UiWidgetControl";

export type UiDocumentViewProps = {
    readonly ui: ConversationUi;
    /** The component types this server serves (`capabilities.chatUi.components`); absent, all. */
    readonly served?: ReadonlySet<string>;
    /** Clicks from this window on their way, by `chatUiComponentKey`. */
    readonly pending?: ReadonlyMap<string, UiActionInput>;
    /** Clicks that left no record, by `chatUiComponentKey`. */
    readonly errors?: ReadonlyMap<string, string>;
    /** What the viewer may do; absent, everything. */
    readonly granted?: ChatUiGranted;
    /** Sends one click. Absent, every control is inert: an older surface, or no way to write. */
    readonly onAction?: (
        component: UiComponent,
        action: UiActionInput,
    ) => Promise<UiActionResponse>;
    /** The live components the conversation's owner draws. Any other live one falls back. */
    readonly live?: ChatUiLive;
    /** Opens one of the document's pictures, by its index in `ui.media`. */
    readonly onMediaOpen?: (index: number) => void;
};

/**
 * Chat UI: a document's components drawn top to bottom, 16px apart, laid on
 * the chat like the reply around it. A component this build or this server
 * doesn't draw shows the one line the server wrote for it. Each live
 * component sits in one fixed box whatever it draws, so a sign-in going from
 * missing to signed in moves nothing.
 */
export function UiDocumentView(props: UiDocumentViewProps) {
    return (
        <div
            className="happy-chat-ui happy-chat-ui__document"
            data-happy-desktop-ui="chat-ui-document"
        >
            {props.ui.document.components.map((component) => (
                <UiComponentView component={component} key={component.id} view={props} />
            ))}
        </div>
    );
}

/** The fixed box each live type is drawn in; `chat-action.css` gives each its height. */
const LIVE_BOX: Record<string, { readonly className: string; readonly figure?: string }> = {
    provider_sign_in: { className: "happy-chat-action__figure", figure: "provider-cli" },
    default_model: { className: "happy-chat-action__figure", figure: "setting" },
    phone_pair: { className: "happy-chat-action__phone-pair" },
    invite: { className: "happy-chat-action__figure", figure: "invite" },
    github_connect: { className: "happy-chat-action__figure", figure: "invite" },
    compute_join: { className: "happy-chat-action__figure", figure: "invite" },
    server_link: { className: "happy-chat-action__figure", figure: "settings" },
};

function LiveBox(props: { readonly type: string; readonly children?: ReactNode }) {
    const box = LIVE_BOX[props.type]!;
    return (
        <div
            className={`happy-chat-action ${box.className}`}
            data-figure={box.figure}
            data-happy-desktop-ui={`chat-ui-${props.type.replaceAll("_", "-")}`}
        >
            {props.children}
        </div>
    );
}

function UiComponentView(props: {
    readonly component: UiComponent;
    readonly view: UiDocumentViewProps;
}) {
    const { component, view } = props;
    const ui = view.ui;
    const key = chatUiComponentKey(ui.offer, component.id);
    const granted = view.granted ?? "all";
    const allowed = (type: string) => chatUiActionAllowed(component, type, granted);
    const pending = view.pending?.get(key);
    const attempt = ui.attempts.get(component.id);
    /* A refused answer that would have been the person's words shows as their
       greyed bubble, so only a silent action's refusal is the component's. */
    const recordError =
        attempt !== undefined &&
        (attempt.outcome.status === "rejected" || attempt.outcome.status === "failed") &&
        !chatUiActionSays(attempt.action.type)
            ? (attempt.outcome.reason ?? "That didn't work.")
            : undefined;
    const error = view.errors?.get(key) ?? recordError;
    const act = view.onAction;
    const control: UiWidgetControl = {
        ...(act ? { act: (action: UiActionInput) => act(component, action) } : {}),
        allowed,
        ...(pending ? { pending } : {}),
        ...(attempt ? { attempt } : {}),
        ...(error ? { error } : {}),
    };
    if (view.served !== undefined && !view.served.has(component.type))
        return <UiFallback text={component.fallback} />;
    if (chatUiLiveType(component.type)) {
        const draw = view.live?.[component.type];
        if (draw === undefined) return <UiFallback text={component.fallback} />;
        return <LiveBox type={component.type}>{draw(component, control)}</LiveBox>;
    }
    /* What a `once` answer shows as chosen: the one accepted, or the one on its way. */
    const answer = ui.answers.get(component.id) ?? pending;
    const state = (type: string): UiControlState => ({
        ...(allowed(type) ? {} : { blocked: "You can read this, but not answer it here." }),
        ...(pending ? { pending: true } : {}),
        ...(error ? { error } : {}),
    });
    switch (component.type) {
        case "images":
            return (
                <UiImages
                    {...(component.props.columns ? { columns: component.props.columns } : {})}
                    items={component.props.images.flatMap((image) => {
                        const item = ui.media[image.mediaIndex];
                        return item ? [image.alt ? { ...item, name: image.alt } : item] : [];
                    })}
                    {...(view.onMediaOpen
                        ? {
                              onItemOpen: (index: number) => {
                                  const image = component.props.images[index];
                                  if (image) view.onMediaOpen?.(image.mediaIndex);
                              },
                          }
                        : {})}
                />
            );
        case "choice":
            return (
                <UiChoice
                    {...(answer?.type === "choice.choose"
                        ? { answer: String(answer.payload["optionId"]) }
                        : {})}
                    {...(control.act
                        ? {
                              onChoose: (optionId: string) =>
                                  void control
                                      .act?.({ type: "choice.choose", payload: { optionId } })
                                      .catch(() => undefined),
                          }
                        : {})}
                    options={component.props.options}
                    state={state("choice.choose")}
                />
            );
        case "checklist":
            return (
                <UiChecklist
                    {...(answer?.type === "checklist.submit" &&
                    Array.isArray(answer.payload["selected"])
                        ? { answer: answer.payload["selected"] as string[] }
                        : {})}
                    {...(component.props.emptyLabel
                        ? { emptyLabel: component.props.emptyLabel }
                        : {})}
                    {...(control.act
                        ? {
                              onSubmit: (selected: readonly string[]) =>
                                  void control
                                      .act?.({
                                          type: "checklist.submit",
                                          payload: { selected: [...selected] },
                                      })
                                      .catch(() => undefined),
                          }
                        : {})}
                    options={component.props.options}
                    state={state("checklist.submit")}
                    submitLabel={component.props.submitLabel}
                />
            );
        case "text_field":
            return (
                <UiTextField
                    {...(answer?.type === "text_field.submit"
                        ? { answer: String(answer.payload["text"]) }
                        : {})}
                    label={component.props.label}
                    {...(control.act
                        ? {
                              onSubmit: (text: string) =>
                                  void control
                                      .act?.({ type: "text_field.submit", payload: { text } })
                                      .catch(() => undefined),
                          }
                        : {})}
                    {...(component.props.placeholder
                        ? { placeholder: component.props.placeholder }
                        : {})}
                    state={state("text_field.submit")}
                    submitLabel={component.props.submitLabel}
                />
            );
        case "file_tree":
            return <UiFileTree paths={component.props.paths} />;
        case "phone_app":
            return <UiPhoneApp />;
        case "server_link":
            return (
                <LiveBox type="server_link">
                    <ChatSettingsFigure type="server_link" />
                </LiveBox>
            );
        default:
            return <UiFallback text={component.fallback} />;
    }
}

let measureHost: HTMLDivElement | undefined;
const measured = new WeakMap<ConversationUi, Map<string, number>>();

/**
 * The document's height at `width`, measured by laying out the same view in
 * an invisible box of that width. Live components are their fixed boxes,
 * whatever they draw, so only the document, what this window shows of its
 * answers, and which live types the surface draws decide it.
 */
export function uiDocumentHeight(
    props: Omit<UiDocumentViewProps, "onAction" | "onMediaOpen">,
    width: number,
): number {
    if (typeof document === "undefined") return 0;
    const live = props.live ? Object.keys(props.live).sort().join(",") : "";
    const key = [
        width,
        messageTextLayoutFontGenerationGet(),
        live,
        props.served ? [...props.served].join(",") : "*",
        uiDocumentStateSignature(props),
    ].join("|");
    let byKey = measured.get(props.ui);
    const known = byKey?.get(key);
    if (known !== undefined) return known;
    if (!measureHost?.isConnected) {
        measureHost = document.createElement("div");
        measureHost.setAttribute("aria-hidden", "true");
        measureHost.dataset.happyDesktopUi = "chat-ui-measure";
        /* Absolute: measuring must sit outside every flow so it moves nothing on screen.
           The class gives it the reply body's type, which the document inherits. */
        measureHost.className = "happy-message__body happy-message__body--markdown";
        measureHost.style.cssText =
            "position:absolute;top:0;left:-100000px;visibility:hidden;pointer-events:none;contain:layout paint;";
        document.body.append(measureHost);
    }
    measureHost.style.width = `${String(width)}px`;
    /* Live widgets measure as their empty fixed boxes; nothing live is drawn here. */
    const boxes: ChatUiLive | undefined = props.live
        ? Object.fromEntries(Object.keys(props.live).map((type) => [type, () => null]))
        : undefined;
    const template = document.createElement("template");
    template.innerHTML = renderToStaticMarkup(
        <UiDocumentView {...props} {...(boxes ? { live: boxes } : {})} />,
    );
    measureHost.replaceChildren(template.content);
    const height =
        [...measureHost.children].find((child) => child.tagName !== "LINK")?.getBoundingClientRect()
            .height ?? 0;
    measureHost.replaceChildren();
    if (!byKey) {
        byKey = new Map();
        measured.set(props.ui, byKey);
    }
    byKey.set(key, height);
    return height;
}

/**
 * What the window adds to a document that can change its height: which
 * controls are pending, refused, or blocked. Part of the row's cache key.
 */
export function uiDocumentStateSignature(
    props: Pick<UiDocumentViewProps, "ui" | "pending" | "errors" | "granted">,
): string {
    const parts: string[] = [];
    for (const component of props.ui.document.components) {
        const key = chatUiComponentKey(props.ui.offer, component.id);
        const attempt = props.ui.attempts.get(component.id);
        parts.push(
            [
                props.pending?.has(key) ? "p" : "",
                props.errors?.get(key) ?? "",
                attempt ? `${attempt.outcome.status}:${attempt.outcome.reason ?? ""}` : "",
                props.ui.answers.has(component.id) ? "a" : "",
            ].join(":"),
        );
    }
    const granted = props.granted;
    parts.push(granted === undefined || granted === "all" ? "all" : [...granted].sort().join(","));
    return parts.join("\u0000");
}
