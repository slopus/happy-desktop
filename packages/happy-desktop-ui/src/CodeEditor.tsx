import {
    defaultKeymap,
    history as historyExtension,
    historyKeymap,
    indentWithTab,
} from "@codemirror/commands";
import {
    bracketMatching,
    HighlightStyle,
    indentUnit,
    LanguageDescription,
    syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
    Annotation,
    Compartment,
    EditorState,
    RangeSet,
    StateEffect,
    StateField,
    Transaction,
    type Extension,
} from "@codemirror/state";
import {
    Decoration,
    drawSelection,
    EditorView,
    highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars,
    keymap,
    lineNumbers,
    placeholder as placeholderExtension,
    type DecorationSet,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useCallback, useLayoutEffect, useRef, type CSSProperties } from "react";
import { ScrollbarTracks, useScrollbarController } from "./Scrollbar";

/**
 * The token palette, as CSS custom properties.
 *
 * These are the same names `code-editor.css` defines with `light-dark()`, and
 * the values behind them are Pierre's own theme — the one the file viewer and
 * the diff tokenize with. Editing a file therefore looks like reading it, and
 * the editor follows the product theme through `color-scheme` with nothing to
 * re-tokenize when it changes.
 */
const happyHighlightStyle = HighlightStyle.define([
    {
        tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
        color: "var(--code-comment)",
    },
    { tag: [tags.meta, tags.processingInstruction], color: "var(--code-comment)" },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--code-string)" },
    { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.self], color: "var(--code-number)" },
    {
        tag: [
            tags.keyword,
            tags.moduleKeyword,
            tags.controlKeyword,
            tags.definitionKeyword,
            tags.operatorKeyword,
            tags.modifier,
        ],
        color: "var(--code-keyword)",
    },
    {
        tag: [tags.typeName, tags.className, tags.namespace, tags.tagName, tags.labelName],
        color: "var(--code-type)",
    },
    {
        tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
        color: "var(--code-function)",
    },
    {
        tag: [tags.variableName, tags.propertyName, tags.attributeName],
        color: "var(--code-variable)",
    },
    {
        tag: [tags.constant(tags.variableName), tags.standard(tags.variableName)],
        color: "var(--code-constant)",
    },
    {
        tag: [
            tags.logicOperator,
            tags.arithmeticOperator,
            tags.compareOperator,
            tags.bitwiseOperator,
            tags.definitionOperator,
        ],
        color: "var(--code-operator)",
    },
    {
        tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator, tags.derefOperator],
        color: "var(--code-punctuation)",
    },
    { tag: [tags.heading, tags.strong], color: "var(--code-keyword)", fontWeight: "600" },
    { tag: [tags.emphasis], fontStyle: "italic" },
    { tag: [tags.link, tags.url], color: "var(--code-function)", textDecoration: "underline" },
    { tag: [tags.invalid], color: "var(--text-destructive)" },
]);

/**
 * The lines a reference named, marked in the text.
 *
 * Scrolling alone puts the region on screen and then leaves the reader to find
 * it: a file opened at line 700 looks exactly like a file opened anywhere else.
 * The band says which lines were being talked about, and it stays until the
 * text changes or the reader puts the caret somewhere — at which point they
 * have found what they came for and the mark is in the way.
 */
const revealSet = StateEffect.define<{ from: number; to: number }>();
const revealLine = Decoration.line({ class: "happy-code-editor__reveal" });
const revealField = StateField.define<DecorationSet>({
    create: () => RangeSet.empty,
    update(marks, transaction) {
        for (const effect of transaction.effects) {
            if (!effect.is(revealSet)) continue;
            const lines = [];
            for (let at = effect.value.from; at <= effect.value.to; ) {
                const line = transaction.state.doc.lineAt(at);
                lines.push(revealLine.range(line.from));
                if (line.to >= transaction.state.doc.length) break;
                at = line.to + 1;
            }
            return RangeSet.of(lines);
        }
        if (marks.size === 0) return marks;
        // A band marks lines of the text it was put on: once that text is
        // edited or replaced it is marking whatever moved under it. And once
        // the reader has put the caret somewhere they have found what they came
        // for, so the mark stops being an answer and starts being clutter.
        return transaction.docChanged || transaction.selection !== undefined
            ? RangeSet.empty
            : marks;
    },
    provide: (field) => EditorView.decorations.from(field),
});

/** One region of an open file to show, and which request asked for it. */
export type CodeEditorReveal = {
    readonly startLine: number;
    readonly endLine: number;
    /**
     * Changes on every ask. The region alone cannot say "show me this again",
     * and following the same reference twice has to scroll back to it twice.
     */
    readonly requestId: number;
};

export type CodeEditorProps = {
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
    /**
     * Full path or file name. The language follows from it, so a `.py` file is
     * Python without the caller naming a grammar.
     */
    name: string;
    /**
     * Stable identity of the authoritative document currently being drawn.
     * Supplying it lets recent CodeMirror states survive switches and unmounts.
     */
    documentKey?: string;
    /** The text being edited. */
    value: string;
    onValueChange?: (value: string) => void;
    /** Cmd/Ctrl+S inside the editor. */
    onSave?: () => void;
    readOnly?: boolean;
    placeholder?: string;
    /** Soft-wraps long lines at the view edge instead of scrolling them. */
    wrap?: boolean;
    /**
     * A region to scroll to and mark. Applied whenever its `requestId` changes,
     * and never in between, so an unrelated render cannot drag the view back.
     */
    reveal?: CodeEditorReveal;
};

type EditorBridge = {
    /** Conservative upper bound for text retained by this state's undo branch. */
    historyCharacters: number;
    onSave?: () => void;
    onValueChange?: (value: string) => void;
};

/** One parsed document that can move between mounted CodeEditor views. */
interface EditorDocument {
    readonly bridge: EditorBridge;
    /** Duplicate simultaneous consumers stay isolated and never enter the shared LRU. */
    readonly cacheable: boolean;
    readonly editable: Compartment;
    /** The read-only, wrapping, and placeholder configuration currently installed. */
    editableKey: string;
    /**
     * Which document this is, as the surface names it. It moves when the same
     * text is renamed under it — a save gives the file it wrote a new identity,
     * and the state the person is inside of goes with it.
     */
    key?: string;
    readonly language: Compartment;
    /** Pending lazy language whose single shared request this document follows. */
    languageDescription?: LanguageDescription;
    /** A failed lazy load settles to plain text until the file name changes. */
    languageFailedName?: string;
    /** Which file the loaded grammar belongs to. */
    languageName?: string;
    /** Which file currently has an unresolved grammar request. */
    languageRequestName?: string;
    /** Current mounted consumer, if any. Async grammar completion consults this owner. */
    owner?: EditorHandle;
    state: EditorState;
    /** Isolated so an authoritative replacement can discard obsolete undo. */
    readonly undo: Compartment;
}

/** Everything the imperative editor keeps for as long as its view is mounted. */
interface EditorHandle {
    document: EditorDocument;
    mounted: boolean;
    /** The last ask this view has already scrolled to. */
    revealRequestId?: number;
    view: EditorView;
}

/**
 * Scrolls one region into view and bands it, if the text that is loaded
 * actually reaches it.
 *
 * A tab can be asked for a region while its bytes are still being read, and
 * marking line 700 of an empty document would spend the ask on nothing and
 * leave the reader at the top of the file once it arrived. Not consuming it is
 * what makes the reference work on a cold open as well as a warm one.
 */
function revealApply(view: EditorView, reveal: CodeEditorReveal): boolean {
    const doc = view.state.doc;
    if (reveal.startLine > doc.lines) return false;
    const start = Math.max(reveal.startLine, 1);
    const end = Math.min(Math.max(reveal.endLine, start), doc.lines);
    const from = doc.line(start).from;
    const to = doc.line(end).to;
    view.dispatch({
        effects: [revealSet.of({ from, to }), EditorView.scrollIntoView(from, { y: "center" })],
    });
    return true;
}

/** Controlled document replacements are not typing and must not enter undo. */
const authoritativeDocumentUpdate = Annotation.define<boolean>();

/** Parsed documents retained across component and tab lifetimes, least recent first. */
const editorDocumentCache = new Map<string, EditorDocument>();
const editorDocumentLiveCounts = new Map<string, number>();
const EDITOR_DOCUMENT_CACHE_LIMIT = 12;
const EDITOR_DOCUMENT_CACHE_MAX_CHARACTERS = 1_000_000;
const EDITOR_DOCUMENT_CACHE_MAX_DOCUMENT_CHARACTERS = 250_000;
let editorDocumentCacheCharacters = 0;
type EditorLanguageLoad = {
    readonly documents: Set<EditorDocument>;
};
const editorLanguageLoads = new Map<LanguageDescription, EditorLanguageLoad>();

function editorBridgeUpdate(bridge: EditorBridge, props: CodeEditorProps): void {
    bridge.onSave = props.onSave;
    bridge.onValueChange = props.onValueChange;
}

function editorBridgeClear(bridge: EditorBridge): void {
    bridge.onSave = undefined;
    bridge.onValueChange = undefined;
}

function editorEditableKey(props: CodeEditorProps): string {
    return `${String(props.readOnly === true)}|${String(props.wrap === true)}|${props.placeholder ?? ""}`;
}

function editorEditableExtensions(props: CodeEditorProps): Extension[] {
    return [
        EditorView.editable.of(props.readOnly !== true),
        EditorState.readOnly.of(props.readOnly === true),
        ...(props.wrap === true ? [EditorView.lineWrapping] : []),
        ...(props.placeholder === undefined ? [] : [placeholderExtension(props.placeholder)]),
    ];
}

function editorDocumentCreate(props: CodeEditorProps, cacheable = true): EditorDocument {
    const bridge: EditorBridge = { historyCharacters: 0 };
    const editable = new Compartment();
    const language = new Compartment();
    const undo = new Compartment();
    const state = EditorState.create({
        doc: props.value,
        extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightActiveLine(),
            highlightSpecialChars(),
            drawSelection(),
            undo.of(historyExtension()),
            bracketMatching(),
            indentUnit.of("    "),
            syntaxHighlighting(happyHighlightStyle),
            revealField,
            language.of([]),
            editable.of(editorEditableExtensions(props)),
            keymap.of([
                {
                    key: "Mod-s",
                    preventDefault: true,
                    run: () => {
                        bridge.onSave?.();
                        return true;
                    },
                },
                indentWithTab,
                ...defaultKeymap,
                ...historyKeymap,
            ]),
            EditorView.updateListener.of((update) => {
                const authoritative = update.transactions.some(
                    (transaction) => transaction.annotation(authoritativeDocumentUpdate) === true,
                );
                if (update.docChanged && !authoritative) {
                    let changedCharacters = 0;
                    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                        changedCharacters += toA - fromA + inserted.length;
                    });
                    // Once the bound is crossed, its exact overshoot is
                    // irrelevant: this state will not be admitted to the LRU.
                    bridge.historyCharacters = Math.min(
                        EDITOR_DOCUMENT_CACHE_MAX_DOCUMENT_CHARACTERS + 1,
                        bridge.historyCharacters + changedCharacters,
                    );
                    bridge.onValueChange?.(update.state.doc.toString());
                }
            }),
            EditorState.allowMultipleSelections.of(true),
        ],
    });
    return {
        bridge,
        cacheable,
        editable,
        editableKey: editorEditableKey(props),
        key: props.documentKey,
        language,
        state,
        undo,
    };
}

function editorDocumentWeight(document: EditorDocument): number {
    return document.state.doc.length + document.bridge.historyCharacters;
}

function editorLanguageUnsubscribe(document: EditorDocument): void {
    const description = document.languageDescription;
    if (description === undefined) return;
    editorLanguageLoads.get(description)?.documents.delete(document);
    document.languageDescription = undefined;
}

function editorDocumentDrop(document: EditorDocument): void {
    editorBridgeClear(document.bridge);
    editorLanguageUnsubscribe(document);
    document.owner = undefined;
}

function editorDocumentCacheTake(key: string | undefined): EditorDocument | undefined {
    if (key === undefined) return undefined;
    const document = editorDocumentCache.get(key);
    if (document === undefined) return undefined;
    editorDocumentCache.delete(key);
    editorDocumentCacheCharacters -= editorDocumentWeight(document);
    return document;
}

function editorDocumentCacheRemember(document: EditorDocument): void {
    const key = document.key;
    const characters = editorDocumentWeight(document);
    editorBridgeClear(document.bridge);
    if (
        !document.cacheable ||
        key === undefined ||
        characters > EDITOR_DOCUMENT_CACHE_MAX_DOCUMENT_CHARACTERS ||
        characters > EDITOR_DOCUMENT_CACHE_MAX_CHARACTERS
    ) {
        editorDocumentDrop(document);
        return;
    }
    const replaced = editorDocumentCache.get(key);
    if (replaced !== undefined) {
        editorDocumentCache.delete(key);
        editorDocumentCacheCharacters -= editorDocumentWeight(replaced);
        editorDocumentDrop(replaced);
    }
    editorDocumentCache.set(key, document);
    editorDocumentCacheCharacters += characters;
    while (
        editorDocumentCache.size > EDITOR_DOCUMENT_CACHE_LIMIT ||
        editorDocumentCacheCharacters > EDITOR_DOCUMENT_CACHE_MAX_CHARACTERS
    ) {
        const oldestKey = editorDocumentCache.keys().next().value;
        if (oldestKey === undefined) break;
        const oldest = editorDocumentCache.get(oldestKey);
        editorDocumentCache.delete(oldestKey);
        if (oldest !== undefined) {
            editorDocumentCacheCharacters -= editorDocumentWeight(oldest);
            editorDocumentDrop(oldest);
        }
    }
}

function editorDocumentAcquire(props: CodeEditorProps): EditorDocument {
    const key = props.documentKey;
    const alreadyLive = key !== undefined && (editorDocumentLiveCounts.get(key) ?? 0) > 0;
    const document =
        (!alreadyLive ? editorDocumentCacheTake(key) : undefined) ??
        editorDocumentCreate(props, !alreadyLive);
    if (key !== undefined)
        editorDocumentLiveCounts.set(key, (editorDocumentLiveCounts.get(key) ?? 0) + 1);
    return document;
}

/**
 * Whether the requested document is the text this editor already holds.
 *
 * Not a guess about which document it is: the editor's own text is the
 * comparison, so this is only true when the bytes being asked for are the bytes
 * on screen.
 */
function editorSameText(
    editor: { view: EditorView; document: EditorDocument },
    props: CodeEditorProps,
): boolean {
    return (
        props.documentKey !== undefined &&
        editor.document.editableKey === editorEditableKey(props) &&
        props.value === editor.view.state.doc.toString()
    );
}

/**
 * Moves a live document to another key, keeping the state the person is inside
 * of. Only the bookkeeping moves: the live count that says whether a key is in
 * use, and the name the document will be cached under when it is released.
 */
function editorDocumentRekey(document: EditorDocument, key: string | undefined): void {
    const previous = document.key;
    if (previous !== undefined) {
        const remaining = Math.max(0, (editorDocumentLiveCounts.get(previous) ?? 1) - 1);
        if (remaining === 0) editorDocumentLiveCounts.delete(previous);
        else editorDocumentLiveCounts.set(previous, remaining);
    }
    document.key = key;
    if (key === undefined) return;
    // Whatever was cached under the new name is the same file's older text, and
    // the live document is now the answer for it.
    const replaced = editorDocumentCacheTake(key);
    if (replaced !== undefined) editorDocumentDrop(replaced);
    editorDocumentLiveCounts.set(key, (editorDocumentLiveCounts.get(key) ?? 0) + 1);
}

function editorDocumentRelease(document: EditorDocument): void {
    const key = document.key;
    let remaining = 0;
    if (key !== undefined) {
        remaining = Math.max(0, (editorDocumentLiveCounts.get(key) ?? 1) - 1);
        if (remaining === 0) editorDocumentLiveCounts.delete(key);
        else editorDocumentLiveCounts.set(key, remaining);
    }
    if (remaining === 0) editorDocumentCacheRemember(document);
    else editorDocumentDrop(document);
}

/** Loads the grammar for a file name, or nothing when no language claims it. */
function languageInstall(document: EditorDocument, name: string, extension: Extension): void {
    if (document.languageRequestName !== name) return;
    editorLanguageUnsubscribe(document);
    const effect = document.language.reconfigure(extension);
    const owner = document.owner;
    if (owner?.mounted && owner.document === document) {
        owner.view.dispatch({ effects: effect });
        document.state = owner.view.state;
    } else {
        document.state = document.state.update({ effects: effect }).state;
    }
    document.languageFailedName = undefined;
    document.languageName = name;
    document.languageRequestName = undefined;
}

function languageReconfigure(document: EditorDocument, name: string) {
    editorLanguageUnsubscribe(document);
    document.languageFailedName = undefined;
    document.languageName = undefined;
    document.languageRequestName = name;
    const description = LanguageDescription.matchFilename(languages, name);
    if (description === null) {
        languageInstall(document, name, []);
        return;
    }
    // LanguageDescription keeps its resolved support. Installing that support
    // synchronously is what prevents an already-known grammar from producing
    // one plain-text frame every time the reader returns to a file.
    if (description.support !== undefined) {
        languageInstall(document, name, description.support);
        return;
    }
    document.languageDescription = description;
    let loading = editorLanguageLoads.get(description);
    if (loading === undefined) {
        loading = { documents: new Set() };
        editorLanguageLoads.set(description, loading);
        const request = loading;
        void description.load().then(
            (support) => {
                if (editorLanguageLoads.get(description) !== request) return;
                editorLanguageLoads.delete(description);
                for (const waiting of request.documents)
                    languageInstall(waiting, waiting.languageRequestName ?? "", support);
            },
            () => {
                if (editorLanguageLoads.get(description) !== request) return;
                editorLanguageLoads.delete(description);
                for (const waiting of request.documents) {
                    waiting.languageDescription = undefined;
                    const failedName = waiting.languageRequestName;
                    if (failedName === undefined) continue;
                    waiting.languageFailedName = failedName;
                    waiting.languageRequestName = undefined;
                }
            },
        );
    }
    loading.documents.add(document);
}

/**
 * C-175 CodeEditor — a real code editor for one file.
 *
 * CodeMirror owns the text: incremental parsing means highlighting keeps up
 * with typing on a file of any size, which is the whole reason a highlighted
 * `<pre>` behind a `<textarea>` is not what this is. Undo history, bracket
 * matching, a line-number gutter, and the platform's own editing keys come with
 * it; Cmd/Ctrl+S reports intent to save and nothing else here writes anything.
 *
 * The caller owns the text. `value` is authoritative — a revert, a reload from
 * disk, or a switch to another file replaces the document — while ordinary
 * typing reports through `onValueChange` without the caller having to echo it
 * back, so the cursor never moves under the person using it.
 */
export function CodeEditor(props: CodeEditorProps) {
    // The view's own listeners fire while the person types, long after the
    // render that installed them, so they read the current props from here
    // rather than closing over the ones the view was created with.
    const latest = useRef(props);
    const handle = useRef<EditorHandle | undefined>(undefined);
    const scrollbarController = useScrollbarController("both");
    const hostAttach = useCallback(
        (element: HTMLDivElement | null) => scrollbarController.hostSet(element),
        [scrollbarController],
    );
    const attach = useCallback(
        (host: HTMLDivElement | null) => {
            if (host === null) return;
            const current = latest.current;
            const document = editorDocumentAcquire(current);
            editorBridgeUpdate(document.bridge, current);
            const view = new EditorView({
                parent: host,
                state: document.state,
            });
            const created: EditorHandle = {
                document,
                mounted: true,
                view,
            };
            document.owner = created;
            handle.current = created;
            scrollbarController.viewportSet(view.scrollDOM);
            if (
                document.languageName !== current.name &&
                document.languageRequestName !== current.name &&
                document.languageFailedName !== current.name
            )
                languageReconfigure(document, current.name);
            return () => {
                if (handle.current === created) handle.current = undefined;
                scrollbarController.viewportSet(null);
                created.mounted = false;
                created.document.state = view.state;
                if (created.document.owner === created) created.document.owner = undefined;
                editorDocumentRelease(created.document);
                view.destroy();
            };
        },
        [scrollbarController],
    );
    // eslint-disable-next-line happy-react/no-layout-effect -- CodeMirror is an imperative document; this is the only boundary where the authoritative text, the file's grammar, and the read-only state reach it, and the view itself is created and destroyed by the ref callback above
    useLayoutEffect(() => {
        latest.current = props;
        const editor = handle.current;
        if (editor === undefined) return;
        if (props.documentKey !== editor.document.key && editorSameText(editor, props)) {
            // A new identity carrying the text already on screen is this same
            // document under a new name — what a save is, since what the file
            // now says is what was just typed into it. Swapping states here
            // would throw away the caret, the scroll, and the selection the
            // person is holding, so the document is renamed in place instead.
            editorDocumentRekey(editor.document, props.documentKey);
        } else if (props.documentKey !== editor.document.key) {
            // Take the requested state before remembering the outgoing one, so
            // an LRU at capacity cannot evict the state we are returning to.
            const incoming = editorDocumentAcquire(props);
            editor.document.state = editor.view.state;
            if (editor.document.owner === editor) editor.document.owner = undefined;
            editorDocumentRelease(editor.document);
            editor.document = incoming;
            incoming.owner = editor;
            editorBridgeUpdate(incoming.bridge, props);
            editor.view.setState(incoming.state);
            // Another document is another text, and the band belonged to the
            // one that left. Whatever region this file is still being asked for
            // is asked for again below.
            editor.revealRequestId = undefined;
        }
        editorBridgeUpdate(editor.document.bridge, props);
        // Typing already produced this text, and replacing a document the
        // person is inside of would drop their cursor to the top. A replacement
        // from props is authoritative synchronization, not another edit: it
        // neither reports a draft nor becomes an undo step.
        if (props.value !== editor.view.state.doc.toString()) {
            // Removing and restoring the history compartment preserves every
            // other state field — including the parse tree — while making a
            // revert, save result, or disk reload a true lifetime boundary for
            // obsolete edits.
            editor.view.dispatch({
                effects: editor.document.undo.reconfigure([]),
            });
            editor.view.dispatch({
                changes: { from: 0, to: editor.view.state.doc.length, insert: props.value },
                annotations: [
                    authoritativeDocumentUpdate.of(true),
                    Transaction.addToHistory.of(false),
                ],
            });
            editor.view.dispatch({
                effects: editor.document.undo.reconfigure(historyExtension()),
            });
            editor.document.bridge.historyCharacters = 0;
        }
        if (
            editor.document.languageName !== props.name &&
            editor.document.languageRequestName !== props.name &&
            editor.document.languageFailedName !== props.name
        )
            languageReconfigure(editor.document, props.name);
        const editableKey = editorEditableKey(props);
        if (editor.document.editableKey !== editableKey) {
            editor.document.editableKey = editableKey;
            editor.view.dispatch({
                effects: editor.document.editable.reconfigure(editorEditableExtensions(props)),
            });
        }
        const reveal = props.reveal;
        if (reveal !== undefined && editor.revealRequestId !== reveal.requestId) {
            if (revealApply(editor.view, reveal)) editor.revealRequestId = reveal.requestId;
        }
        editor.document.state = editor.view.state;
    });
    return (
        <div
            className={["happy-code-editor", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="code-editor"
            data-read-only={props.readOnly ? "" : undefined}
            data-scrollbar-axes="both"
            data-scrollbar-host=""
            data-scrollbar-placement="overlay"
            data-testid={props["data-testid"]}
            ref={hostAttach}
            style={props.style}
        >
            <div className="happy-code-editor__mount" ref={attach} />
            <ScrollbarTracks axes="both" controller={scrollbarController} />
        </div>
    );
}
