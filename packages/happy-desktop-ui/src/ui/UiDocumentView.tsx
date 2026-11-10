import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    chatUiActionAllowed,
    chatUiComponentKey,
    type ChatUiGranted,
    type ConversationUi,
    type UiActionInput,
    type UiActionResponse,
    type UiComponent,
} from "happy-desktop-state";
import { ChatSettingsFigure } from "../ChatActionFigures";
import { messageTextLayoutFontGenerationGet } from "../messageTextLayout";
import { UiFallback } from "./UiFallback";
import { UiFileTreeList, UiPhoneAppCard, type UiFileTreeEntry } from "./UiCards";
import { UiImages, type UiImagesLayout } from "./UiImages";
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
    compute_join: { className: "happy-chat-action__figure", figure: "compute-join" },
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
    /* Every action is silent, so its record's refusal is the component's to show. */
    const recordError =
        attempt !== undefined &&
        (attempt.outcome.status === "rejected" || attempt.outcome.status === "failed")
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
    switch (component.type) {
        case "images": {
            const shown = component.props.images.filter(
                (image) => ui.media[image.mediaIndex] !== undefined,
            );
            /* PROTOTYPE: `layout` is the proposed prop; today's documents carry `columns` only. */
            const layout = (component.props as { readonly layout?: UiImagesLayout }).layout;
            return (
                <UiImages
                    captions={shown.map((image) => image.caption)}
                    {...(component.props.columns ? { columns: component.props.columns } : {})}
                    items={shown.map((image) => {
                        const item = ui.media[image.mediaIndex]!;
                        return image.alt ? { ...item, name: image.alt } : item;
                    })}
                    {...(layout ? { layout } : {})}
                    {...(view.onMediaOpen
                        ? {
                              onItemOpen: (index: number) => {
                                  const image = shown[index];
                                  if (image) view.onMediaOpen?.(image.mediaIndex);
                              },
                          }
                        : {})}
                />
            );
        }
        case "file_tree": {
            /* PROTOTYPE: `entries` (a path with a note and a status) is the proposed prop. */
            const entries = (component.props as { readonly entries?: readonly UiFileTreeEntry[] })
                .entries;
            return (
                <UiFileTreeList
                    entries={entries ?? component.props.paths.map((path) => ({ path }))}
                />
            );
        }
        case "phone_app":
            return <UiPhoneAppCard />;
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
const measured = new WeakMap<object, Map<string, number>>();

/**
 * The height of `element` at `width`, laid out in an invisible box of that
 * width with the reply body's type, and kept per `owner` and `key`.
 */
export function chatUiMeasure(
    owner: object,
    key: string,
    width: number,
    element: () => ReactElement,
): number {
    if (typeof document === "undefined") return 0;
    const fullKey = `${String(width)}|${String(messageTextLayoutFontGenerationGet())}|${key}`;
    let byKey = measured.get(owner);
    const known = byKey?.get(fullKey);
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
    const template = document.createElement("template");
    template.innerHTML = renderToStaticMarkup(element());
    measureHost.replaceChildren(template.content);
    const height =
        [...measureHost.children].find((child) => child.tagName !== "LINK")?.getBoundingClientRect()
            .height ?? 0;
    measureHost.replaceChildren();
    if (!byKey) {
        byKey = new Map();
        measured.set(owner, byKey);
    }
    byKey.set(fullKey, height);
    return height;
}

/**
 * The document's height at `width`. Live components are their fixed boxes,
 * whatever they draw, and every other component draws its props alone, so
 * only the document, which types this server serves, and which live types
 * the surface draws decide it.
 */
export function uiDocumentHeight(
    props: Pick<UiDocumentViewProps, "ui" | "served" | "live">,
    width: number,
): number {
    return chatUiMeasure(props.ui, uiDocumentSignature(props), width, () => {
        /* Live widgets measure as their empty fixed boxes; nothing live is drawn here. */
        const boxes: ChatUiLive | undefined = props.live
            ? Object.fromEntries(Object.keys(props.live).map((type) => [type, () => null]))
            : undefined;
        return (
            <UiDocumentView
                ui={props.ui}
                {...(props.served ? { served: props.served } : {})}
                {...(boxes ? { live: boxes } : {})}
            />
        );
    });
}

/** What besides the document decides its height; part of the row's cache key. */
export function uiDocumentSignature(props: Pick<UiDocumentViewProps, "served" | "live">): string {
    return [
        props.live ? Object.keys(props.live).sort().join(",") : "",
        props.served ? [...props.served].sort().join(",") : "*",
    ].join("|");
}
