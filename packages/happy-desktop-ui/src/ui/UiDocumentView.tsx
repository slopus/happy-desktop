import {
    chatUiActionAllowed,
    chatUiComponentKey,
    defaultModelComponent,
    knownUiComponent,
    type ChatUiActionSend,
    type ChatUiDefaultModel,
    type ChatUiGranted,
    type ConversationUi,
    type UiActionInput,
    type UiWireComponent,
} from "happy-desktop-state";
import type { MessageTextLayoutCache } from "../messageTextLayout";
import { UiDefaultModel, uiDefaultModelHeight } from "./UiDefaultModel";
import { UiFallback, uiFallbackHeight } from "./UiFallback";
import { UiFileTree, uiFileTreeHeight } from "./UiFileTree";
import { UiMedia, uiMediaHeight, type UiMediaEntry } from "./UiMedia";

/** The space between a document's components. */
const DOCUMENT_GAP = 16;
/** The measure a document is drawn at where its surface states none. */
const DOCUMENT_WIDTH_FALLBACK = 600;

/** What a surface knows that a document's components draw from, besides the document. */
export type UiDocumentSurface = {
    /** Clicks from this window on their way, by `chatUiComponentKey`. */
    readonly pending?: ReadonlyMap<string, UiActionInput>;
    /** Clicks that left no record, by `chatUiComponentKey`. */
    readonly errors?: ReadonlyMap<string, string>;
    /** What the viewer may do; absent, everything. */
    readonly granted?: ChatUiGranted;
    /** Sends one click. Absent, every control is inert: there is no way to write here. */
    readonly onAction?: ChatUiActionSend;
    /**
     * The server's default model, which `default_model` draws. Absent, the
     * surface has no model catalog and the component shows its fallback line.
     */
    readonly defaultModel?: ChatUiDefaultModel;
};

export type UiDocumentViewProps = UiDocumentSurface & {
    readonly ui: ConversationUi;
    /** Opens one of the document's pictures, by its index in `ui.media`. */
    readonly onMediaOpen?: (index: number) => void;
    /** The reply's content measure, which `media` lays its rows across. */
    readonly width?: number;
};

/** A component as this build draws it, with what its drawing reads. */
type UiDrawn =
    | {
          readonly type: "media";
          /** The component's entries, each with its index in the document's media. */
          readonly entries: readonly (UiMediaEntry & { readonly mediaIndex: number })[];
      }
    | { readonly type: "file_tree"; readonly paths: readonly string[] }
    | { readonly type: "default_model"; readonly id: string; readonly props: object };

/**
 * A component as this build draws it, or `undefined` for one that shows its
 * fallback line. A component is drawn whole or not at all: the fallback
 * stands for a type this build's catalog does not know, props that are not
 * its type's, a type this build has no drawing for, and a `media` component
 * naming an item the document's media does not hold.
 */
function uiComponentDrawn(ui: ConversationUi, component: UiWireComponent): UiDrawn | undefined {
    const known = knownUiComponent(component);
    switch (known?.type) {
        case "media": {
            const entries = [];
            for (const entry of known.props.items) {
                const item = ui.media[entry.mediaIndex];
                if (item === undefined) return undefined;
                const label = entry.label?.trim();
                entries.push({ item, mediaIndex: entry.mediaIndex, ...(label ? { label } : {}) });
            }
            return { type: "media", entries };
        }
        case "file_tree":
            return { type: "file_tree", paths: known.props.paths };
        case "default_model":
            return { type: "default_model", id: known.id, props: known.props };
        default:
            return undefined;
    }
}

/**
 * The document's height at `width`, from the document alone and whether the
 * surface draws `default_model`: every component's box is known before
 * anything in it loads, and no state of a component changes it.
 */
export function uiDocumentHeight(
    ui: ConversationUi,
    width: number,
    defaultModel: boolean,
    cache?: MessageTextLayoutCache,
): number {
    let height = 0;
    for (const component of ui.document.components) {
        const drawn = uiComponentDrawn(ui, component);
        height +=
            (height === 0 ? 0 : DOCUMENT_GAP) +
            (drawn === undefined || (drawn.type === "default_model" && !defaultModel)
                ? uiFallbackHeight(component.fallback, width, cache)
                : drawn.type === "media"
                  ? uiMediaHeight(drawn.entries, width)
                  : drawn.type === "file_tree"
                    ? uiFileTreeHeight(drawn.paths)
                    : uiDefaultModelHeight(width));
    }
    return height;
}

/**
 * Chat UI: a document's components drawn top to bottom, 16px apart, laid on
 * the chat like the reply around it. A component this build doesn't draw
 * shows the one line the server wrote for it.
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

function UiComponentView(props: {
    readonly component: UiWireComponent;
    readonly view: UiDocumentViewProps;
}) {
    const { component, view } = props;
    const ui = view.ui;
    const drawn = uiComponentDrawn(ui, component);
    switch (drawn?.type) {
        case undefined:
            return <UiFallback text={component.fallback} />;
        case "media": {
            const entries = drawn.entries;
            const open = view.onMediaOpen;
            return (
                <UiMedia
                    entries={entries}
                    {...(open
                        ? {
                              onOpen: (index: number) => {
                                  const entry = entries[index];
                                  if (entry) open(entry.mediaIndex);
                              },
                          }
                        : {})}
                    width={view.width ?? DOCUMENT_WIDTH_FALLBACK}
                />
            );
        }
        case "file_tree":
            return <UiFileTree paths={drawn.paths} />;
        case "default_model": {
            const state = view.defaultModel;
            if (state === undefined) return <UiFallback text={component.fallback} />;
            const key = chatUiComponentKey(ui.offer, drawn.id);
            const outcome = ui.attempts.get(drawn.id)?.outcome;
            /* The action is silent, so its record's refusal is the component's to show. */
            const error =
                view.errors?.get(key) ??
                (outcome?.status === "rejected" || outcome?.status === "failed"
                    ? (outcome.reason ?? "That didn't work.")
                    : undefined);
            const send = view.onAction;
            return (
                <UiDefaultModel
                    {...(error === undefined ? {} : { error })}
                    forbidden={
                        !chatUiActionAllowed(
                            defaultModelComponent,
                            "set",
                            drawn.props,
                            view.granted ?? "all",
                        )
                    }
                    {...(send
                        ? {
                              onChange: (change) => {
                                  /* A refusal lands in `errors`, which the row shows. */
                                  send(
                                      ui.offer,
                                      drawn.id,
                                      defaultModelComponent,
                                      "set",
                                      change,
                                  ).catch(() => undefined);
                              },
                          }
                        : {})}
                    saving={view.pending?.has(key) ?? false}
                    state={state}
                    width={view.width ?? DOCUMENT_WIDTH_FALLBACK}
                />
            );
        }
    }
}
