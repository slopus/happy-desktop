import type { HappyAgentClient } from "@slopus/happy-agent-client";
import { UserError } from "../types.js";
import type { HappyAgentToolMediaPageOpening } from "./happyAgentHostServices.js";
import { happyAgentUserError } from "./happyAgentSupport.js";

/**
 * How a presented file is read for its preview: `document` as bytes for the
 * host's own viewer, `text` as characters for the Markdown and source views,
 * and `page` as characters for the source view while the host serves the same
 * file as a page.
 */
export type HappyAgentToolMediaDocumentView = "document" | "text" | "page";

/** One document a tool call presented: the call, and the item's media position. */
export interface HappyAgentToolMediaDocumentRef {
    readonly agentId: string;
    readonly toolCallId: string;
    readonly index: number;
    /** The presented file's base name, which a page is served under. */
    readonly name: string;
    readonly mimeType: string;
    readonly view: HappyAgentToolMediaDocumentView;
    /** Size of the presented bytes, which decides whether text is read at all. */
    readonly size: number;
}

/**
 * Where a presented HTML file is served as a page. It is resolved beside the
 * text rather than before it, so the source view never waits on the page.
 */
export type HappyAgentToolMediaPage =
    | { readonly type: "resolving" }
    | { readonly type: "opened"; readonly url: string }
    /** The desktop app predates presented pages; updating it renders them. */
    | { readonly type: "app-outdated" }
    | { readonly type: "failed"; readonly error: UserError };

/**
 * What the open document can be shown as. `ready` holds an object URL of its
 * bytes for the host's own viewer; `text` holds a text file's characters;
 * `external` is a type this host shows no viewer for, or bytes that turned out
 * not to be text, which the reader can still save.
 */
export type HappyAgentToolMediaDocumentContent =
    | { readonly type: "idle" }
    | { readonly type: "loading" }
    | { readonly type: "ready"; readonly url: string }
    | { readonly type: "text"; readonly text: string }
    | { readonly type: "external" }
    | { readonly type: "failed"; readonly error: UserError };

export interface HappyAgentToolMediaDocumentSnapshot {
    readonly document?: HappyAgentToolMediaDocumentRef;
    readonly content: HappyAgentToolMediaDocumentContent;
    /** Where a `page` document is served, present only where the host serves pages. */
    readonly page?: HappyAgentToolMediaPage;
}

/**
 * The document a presented-file preview is showing. A document is read whole
 * into memory and handed to the host's viewer as an object URL, because the
 * viewer runs in a frame that has no authenticated route to the daemon of its
 * own; a text file is read whole and decoded for the Markdown and source
 * views, and an HTML file is also served by the host as a page of its own.
 * Pictures and recordings never come here: they load by address.
 */
export interface HappyAgentToolMediaDocumentStore {
    get(): HappyAgentToolMediaDocumentSnapshot;
    subscribe(listener: () => void): () => void;
    /** Shows one document, or none; the previous one's bytes are released. */
    documentOpen(document: HappyAgentToolMediaDocumentRef | undefined): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentToolMediaDocumentDeps {
    readonly client: Pick<HappyAgentClient, "getToolCallMedia">;
    /** Whether this host renders a document of this media type inline. */
    readonly documentInline?: (mimeType: string) => boolean;
    /** Serves a presented HTML file as a page, where the host has a guest to show it in. */
    readonly pageOpen?: (
        agentId: string,
        toolCallId: string,
        index: number,
        name: string,
    ) => Promise<HappyAgentToolMediaPageOpening>;
}

const IDLE: HappyAgentToolMediaDocumentSnapshot = { content: { type: "idle" } };

/**
 * The largest text file read for its preview. Past this the highlighter and
 * the Markdown renderer stop being a quick look, and saving the file is the
 * better way to read it.
 */
const HAPPY_AGENT_TOOL_MEDIA_TEXT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The bytes as characters, or `undefined` when they are not text. The daemon
 * types a presented file by its extension alone, so the bytes are the only
 * evidence: invalid UTF-8 or a NUL byte means binary.
 */
function textDecode(data: ArrayBuffer): string | undefined {
    try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
        return text.includes("\u0000") ? undefined : text;
    } catch {
        return undefined;
    }
}

function refEqual(
    left: HappyAgentToolMediaDocumentRef | undefined,
    right: HappyAgentToolMediaDocumentRef | undefined,
): boolean {
    if (left === undefined || right === undefined) return left === right;
    return (
        left.agentId === right.agentId &&
        left.toolCallId === right.toolCallId &&
        left.index === right.index &&
        left.name === right.name &&
        left.mimeType === right.mimeType &&
        left.view === right.view &&
        left.size === right.size
    );
}

export function happyAgentToolMediaDocumentStoreCreate(
    deps: HappyAgentToolMediaDocumentDeps,
): HappyAgentToolMediaDocumentStore {
    let snapshot = IDLE;
    let controller: AbortController | undefined;
    let objectUrl: string | undefined;
    let disposed = false;
    const listeners = new Set<() => void>();

    const publish = (next: HappyAgentToolMediaDocumentSnapshot): void => {
        snapshot = next;
        for (const listener of listeners) listener();
    };
    const release = (): void => {
        controller?.abort();
        controller = undefined;
        if (objectUrl !== undefined && typeof URL.revokeObjectURL === "function")
            URL.revokeObjectURL(objectUrl);
        objectUrl = undefined;
    };
    const load = async (
        document: HappyAgentToolMediaDocumentRef,
        signal: AbortSignal,
    ): Promise<HappyAgentToolMediaDocumentContent> => {
        try {
            const media = await deps.client.getToolCallMedia(
                document.agentId,
                document.toolCallId,
                document.index,
                { signal },
            );
            if (media === null) throw new UserError("The document could not be read.");
            if (document.view !== "document") {
                const text = textDecode(media.data);
                return text === undefined ? { type: "external" } : { type: "text", text };
            }
            const url = URL.createObjectURL(new Blob([media.data], { type: document.mimeType }));
            if (signal.aborted) {
                URL.revokeObjectURL(url);
                return { type: "loading" };
            }
            objectUrl = url;
            return { type: "ready", url };
        } catch (error) {
            return { type: "failed", error: happyAgentUserError(error) };
        }
    };
    /**
     * Asks the host to serve a page document, beside reading its text. The
     * answer lands on the snapshot only while it still shows that document.
     */
    const pageOpen = (
        document: HappyAgentToolMediaDocumentRef,
    ): HappyAgentToolMediaPage | undefined => {
        if (document.view !== "page" || !deps.pageOpen) return undefined;
        const settle = (page: HappyAgentToolMediaPage): void => {
            if (disposed || snapshot.document !== document) return;
            publish({ ...snapshot, page });
        };
        void deps
            .pageOpen(document.agentId, document.toolCallId, document.index, document.name)
            .then(settle, (error: unknown) =>
                settle({ type: "failed", error: happyAgentUserError(error) }),
            );
        return { type: "resolving" };
    };

    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        documentOpen(document) {
            if (disposed || refEqual(document, snapshot.document)) return;
            release();
            if (document === undefined) {
                publish(IDLE);
                return;
            }
            const page = pageOpen(document);
            const pageField = page === undefined ? {} : { page };
            if (
                document.view !== "document" &&
                document.size > HAPPY_AGENT_TOOL_MEDIA_TEXT_MAX_BYTES
            ) {
                publish({
                    document,
                    content: {
                        type: "failed",
                        error: new UserError(
                            "This file is too large to preview. Download it to read it.",
                        ),
                    },
                    ...pageField,
                });
                return;
            }
            if (
                document.view === "document" &&
                (deps.documentInline?.(document.mimeType) !== true ||
                    typeof URL.createObjectURL !== "function")
            ) {
                publish({ document, content: { type: "external" } });
                return;
            }
            const active = new AbortController();
            controller = active;
            publish({ document, content: { type: "loading" }, ...pageField });
            void load(document, active.signal).then((content) => {
                if (active.signal.aborted || disposed) return;
                controller = undefined;
                // The page may have answered first, so its address is kept.
                publish({ ...snapshot, content });
            });
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            release();
            listeners.clear();
        },
    };
}
