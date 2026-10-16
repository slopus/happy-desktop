import {
    useCallback,
    useContext,
    useLayoutEffect,
    useRef,
    useState,
    type ChangeEvent,
    type ClipboardEvent as ReactClipboardEvent,
    type CSSProperties,
    type DragEvent as ReactDragEvent,
    type FormEvent,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type ReactNode,
} from "react";
import { ChatPaneFocusContext } from "./ChatPaneFocus";
import { AudienceToggle, type AudienceValue } from "./AudienceToggle";
import { CommandPicker, type CommandPickerItem } from "./CommandPicker";
import { Avatar, type ToneName } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import {
    ComposerAttachmentPreviews,
    type ComposerAttachmentPreview,
} from "./ComposerAttachmentPreviews";
import { EmojiPicker, type EmojiItem } from "./EmojiPicker";
import { Icon, type IconName } from "./Icon";
import { ScrollbarTracks, useScrollbarController } from "./Scrollbar";
import { focusUnlessWritingElsewhere, useFocusOnType } from "./useFocusOnType";
/* ---- ContextChips ----------------------------------------------------- */
export type ContextKind = "file" | "run";
export type ContextItem = {
    detail?: string;
    id: string;
    kind: ContextKind;
    label: string;
};
export type ContextChipsProps = {
    className?: string;
    "data-testid"?: string;
    items: ContextItem[];
    label?: string;
    onRemove?: (id: string) => void;
    readOnly?: boolean;
    style?: CSSProperties;
};
const kindIcons: Record<ContextKind, IconName> = {
    file: "doc",
    run: "play",
};
/** Attached-context row for the composer: 24px chips with kind icons. */
export function ContextChips(props: ContextChipsProps) {
    return (
        <div
            className={["happy-context-chips", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="context-chips"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            {props.label ? (
                <span
                    className="happy-context-chips__label"
                    data-happy-desktop-ui="context-chips-label"
                >
                    {props.label}
                </span>
            ) : null}
            {props.items.map((item) => (
                <span
                    className="happy-context-chips__chip"
                    key={item.id}
                    data-kind={item.kind}
                    data-happy-desktop-ui="context-chips-chip"
                >
                    <span
                        className="happy-context-chips__icon"
                        data-happy-desktop-ui="context-chips-icon"
                    >
                        <Icon name={kindIcons[item.kind]} size={12} />
                    </span>
                    <span
                        className="happy-context-chips__text"
                        data-happy-desktop-ui="context-chips-text"
                    >
                        {item.label}
                    </span>
                    {item.detail ? (
                        <span
                            className="happy-context-chips__detail"
                            data-happy-desktop-ui="context-chips-detail"
                        >
                            {item.detail}
                        </span>
                    ) : null}
                    {!props.readOnly && props.onRemove ? (
                        <button
                            aria-label={`Remove ${item.label}`}
                            className="happy-context-chips__remove"
                            data-happy-desktop-ui="context-chips-remove"
                            onClick={() => props.onRemove?.(item.id)}
                            type="button"
                        >
                            <Icon name="close" size={12} />
                        </button>
                    ) : null}
                </span>
            ))}
        </div>
    );
}
/* ---- MentionPicker ----------------------------------------------------- */
export type Mentionable = {
    description?: string;
    id: string;
    initials: string;
    name: string;
    status?: "ready" | "working";
    tone?: ToneName;
};
export type MentionPickerProps = {
    /** Optional controlled highlight; defaults to the first filtered mention. */
    activeId?: string;
    className?: string;
    "data-testid"?: string;
    /** Visible heading for the picker (default "Mentions"). */
    label?: string;
    /** Exactly the candidates to show; whoever owns the query decides them. */
    mentions?: Mentionable[];
    onSelect: (mention: Mentionable) => void;
    /** The token these candidates answer, named in the empty state. */
    query: string;
    style?: CSSProperties;
};
function filterMentions(mentions: Mentionable[], query: string) {
    const needle = query.trim().toLowerCase();
    return needle
        ? mentions.filter((mention) => mention.name.toLowerCase().includes(needle))
        : mentions;
}
/**
 * Raised popover listing the mention candidates it is given. It spans the
 * composer it belongs to and wears the command picker's geometry — quiet
 * section headings over one-line 32px rows — so `@` and `/` are one surface.
 */
export function MentionPicker(props: MentionPickerProps) {
    const candidates = () => props.mentions ?? [];
    const activeId = () => props.activeId ?? candidates()[0]?.id;
    const row = (mention: Mentionable) => (
        <button
            aria-selected={mention.id === activeId() ? "true" : "false"}
            key={mention.id}
            className="happy-mention-picker__row"
            data-active={mention.id === activeId() ? "" : undefined}
            data-happy-desktop-ui="mention-picker-row"
            data-mention-id={mention.id}
            onClick={() => props.onSelect(mention)}
            role="option"
            type="button"
        >
            <Avatar initials={mention.initials} size="xs" tone={mention.tone} type="agent" />
            <span
                className="happy-mention-picker__meta"
                data-happy-desktop-ui="mention-picker-meta"
            >
                <span
                    className="happy-mention-picker__name"
                    data-happy-desktop-ui="mention-picker-name"
                >
                    {mention.name}
                </span>
                {mention.description ? (
                    <span
                        className="happy-mention-picker__description"
                        data-happy-desktop-ui="mention-picker-description"
                    >
                        {mention.description}
                    </span>
                ) : null}
            </span>
            {mention.status
                ? ((status) => (
                      <Badge
                          className="happy-mention-picker__status"
                          label={status}
                          variant={status === "ready" ? "success" : "warning"}
                      />
                  ))(mention.status)
                : null}
        </button>
    );
    return (
        <div
            aria-label={props.label ?? "Mentions"}
            className={["happy-mention-picker", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="mention-picker"
            data-testid={props["data-testid"]}
            role="listbox"
            style={props.style}
        >
            <div
                className="happy-mention-picker__header"
                data-happy-desktop-ui="mention-picker-header"
            >
                {props.label ?? "Mentions"}
            </div>
            {candidates().length > 0 ? (
                candidates().map(row)
            ) : (
                <div
                    className="happy-mention-picker__empty"
                    data-happy-desktop-ui="mention-picker-empty"
                >
                    No mentions match “{props.query}”
                </div>
            )}
        </div>
    );
}
/* ---- Composer ----------------------------------------------------------- */
export type ComposerProps = {
    /** Native file-picker accept filter, used with `onAttachmentsSelect`. */
    attachmentAccept?: string;
    /** Allows more than one file in the native picker. */
    attachmentMultiple?: boolean;
    /** Draft files rendered as compact square previews above the text. */
    attachmentPreviews?: readonly ComposerAttachmentPreview[];
    /**
     * Current message destination. Supplying it (with `onAudienceChange`)
     * renders the People/Agents toggle and enables Shift+Tab switching.
     */
    audience?: AudienceValue;
    className?: string;
    /** Short companion for `hint`, shown only when the toolbar needs to compact. */
    compactHint?: string;
    /**
     * Native plugin composer contribution triggers. The composer retains this
     * integration point while those controls are temporarily withheld.
     */
    contributions?: ReactNode;
    contextItems?: ContextItem[];
    /**
     * Slash commands offered for the current draft, already filtered by the
     * owner. Supplying them (with `onCommandSelect`) renders the command
     * popover and gives the arrow keys, Enter, and Tab to it.
     */
    commands?: readonly CommandPickerItem[];
    /** Chooses a command from the popover; the owner may invoke it or expand it in the draft. */
    onCommandSelect?: (id: string) => void;
    "data-testid"?: string;
    disabled?: boolean;
    /**
     * Makes this composer the last resort for content the surface has no other
     * home for: a character typed — or a Cmd/Ctrl+V pasted — while no control
     * that wants it has focus moves focus here and lands in the draft, and files
     * dragged anywhere over the window that nothing else answers are attached
     * here rather than opened by the browser. Only the composer the reader is
     * currently writing into may claim any of that, so an owner that mounts more
     * than one composer at a time turns it on for exactly one of them.
     */
    focusOnType?: boolean;
    /**
     * What this composer is currently writing into. Whenever the value changes
     * the caret is put in the draft, so arriving somewhere new — a conversation
     * just opened, a workspace just made — is already somewhere to type.
     *
     * It is the identity of the destination rather than a "focus now" flag,
     * because the same composer stays mounted across the move: what changed is
     * the only thing that can say a move happened at all. An owner that never
     * wants the caret taken leaves it out, and one that mounts two composers
     * gives it to whichever of them is being written into.
     */
    focusKey?: string;
    /** e.g. "Enter to send · @ to hand off to an agent" */
    hint?: string;
    /** Opens a host-owned attachment browser. Takes precedence over the native picker. */
    onAttachFile?: () => void;
    /** Called for toggle clicks and Shift+Tab with the next audience. */
    onAudienceChange?: (audience: AudienceValue) => void;
    /** Receives files picked, pasted into the draft, or dropped onto the composer. */
    onAttachmentsSelect?: (files: File[]) => void;
    /** Opens one of the draft's media previews in the full-window viewer. */
    onAttachmentPreviewOpen?: (id: string) => void;
    onContextRemove?: (id: string) => void;
    /** Called after an emoji is selected. Unicode emoji are also inserted into the draft. */
    onEmojiSelect?: (emoji: EmojiItem) => void;
    /** Reports browser focus transitions of the editable text control. */
    onFocusChange?: (focused: boolean) => void;
    /** Called when a mention is inserted from the picker. */
    onMentionSelect?: (mention: Mentionable) => void;
    /**
     * Mention candidates. Passing an array — even an empty one — is what makes
     * this composer a mentioning one: the `@` action, the token detection, and
     * the picker all follow the prop being present rather than the list having
     * anything in it, so a list that is still being searched cannot take the
     * affordance away.
     */
    mentions?: Mentionable[];
    /**
     * The active `@` token when the owner detects it and searches for the
     * candidates itself. Supplying it turns off the local name filter: the list
     * already answers this token, and matching it again here would throw away
     * everything the search matched some other way than by substring.
     */
    mentionQuery?: string;
    /** Visible heading above the mention candidates (default "Mentions"). */
    mentionPickerLabel?: string;
    /** Optional controlled model-selection control, rendered in the composer toolbar. */
    modelControl?: ReactNode;
    /** Optional controlled accessory rendered below the composer card. */
    footerControl?: ReactNode;
    onSend: () => unknown;
    /**
     * Ends the agent's current inference. With `running`, it takes over the send
     * control while the draft is empty; typing gives the control back to sending,
     * because a message written during a run steers it rather than stopping it.
     * Escape in the text control calls it too, whatever the draft holds.
     */
    onStop?: () => void;
    onValueChange: (value: string) => void;
    placeholder?: string;
    /** Keeps the composer geometry stable while the current send is being acknowledged. */
    pending?: boolean;
    /** True while the agent is producing a reply, which is what `onStop` ends. */
    running?: boolean;
    /** Emoji available to the composer's searchable picker. */
    emoji?: EmojiItem[];
    /** Emoji ids rendered in the picker's recent section. */
    recentEmoji?: string[];
    /** Overrides the text-only send check when attached context is sendable. */
    sendEnabled?: boolean;
    /**
     * Keeps the local draft editable while withholding the network submission.
     * This is distinct from `disabled`, which closes the whole composer.
     */
    submitDisabled?: boolean;
    style?: CSSProperties;
    value: string;
};
const LINE_HEIGHT = 22;
const MIN_LINES = 1;

/**
 * How far an edge fade may reach into the draft. It is a ceiling, never a fixed
 * band: a fade is only ever as tall as the line fragment the scrollport is
 * already cutting, so a line that is entirely visible — with its selection and
 * its caret — is never painted over.
 */
const MAX_FADE = 10;

/**
 * The half-leading between a line box's edge and its glyphs: (22 - 16) / 2 for
 * the draft's 16px text on 22px lines. A cut no deeper than this takes leading
 * only — no glyph is sliced — so it needs no fade. Browsers park the draft
 * exactly there: scrolling the caret into view reveals the caret's own box, not
 * the leading below it, leaving the line a couple of pixels short of aligned.
 * Without this the caret's own line, fully legible, was fed to the bottom fade.
 */
const LINE_LEADING = 3;

/**
 * The fade for one cut line, from how much of it the scrollport hides. It never
 * exceeds the hidden part — softening a cut is proportional to the cut, so a
 * line missing 2px is not covered by a 10px band — nor the visible fragment, so
 * a whole line, its selection, and its caret are never painted over.
 */
function cutLineFade(hidden: number) {
    if (hidden <= LINE_LEADING) return 0;
    return Math.min(LINE_HEIGHT - hidden, hidden, MAX_FADE);
}

/**
 * Points inside the card that already belong to something: a control, a link,
 * an editable area, an attachment chip whose name stays selectable, or a
 * popover that owns its own pointer and keyboard interaction. Everything else
 * in the card is the draft's own dead space.
 */
const SURFACE_CLAIMED_TARGETS =
    '[data-happy-desktop-ui="composer-popover"], [data-happy-desktop-ui="composer-emoji-popover"], [data-happy-desktop-ui="context-chips-chip"], button, input, textarea, select, a, [contenteditable], [tabindex], [role="button"], [role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"]';

/**
 * Below the card the composer stops being one input surface. The footer row
 * carries the session's own controls and agent-authored status text, which
 * stays selectable and never hands the caret to the draft.
 */
const FOOTER_TARGETS =
    '[data-happy-desktop-ui="composer-audience"], [data-happy-desktop-ui="composer-footer"]';

/**
 * Whether a drag in flight is carrying files. `types` is the only thing a drag
 * lets anyone read before it is dropped — the items themselves stay sealed until
 * then — so it is what decides whether the composer offers itself as the
 * destination. Dragging a selection of text, including one inside the draft,
 * carries no files and is left entirely to the browser.
 */
function dragCarriesFiles(transfer: DataTransfer | null): boolean {
    return transfer !== null && Array.from(transfer.types).includes("Files");
}

/**
 * Message composer: focus-within surface card with a one-line resting textarea
 * that grows through eight lines, context chips, capability-driven file/mention/emoji actions,
 * a primary send control, and keyboard-accessible picker popovers.
 */
export function Composer(props: ComposerProps) {
    const composerEl = useRef<HTMLDivElement>(null);
    const fileInputEl = useRef<HTMLInputElement>(null);
    const inputEl = useRef<HTMLDivElement>(null);
    const textareaEl = useRef<HTMLTextAreaElement>(null);
    const paneActive = useContext(ChatPaneFocusContext);
    const draftScrollbarController = useScrollbarController("vertical");
    const draftScrollbarHost = useCallback(
        (element: HTMLDivElement | null) => draftScrollbarController.hostSet(element),
        [draftScrollbarController],
    );
    const textareaAttach = useCallback(
        (element: HTMLTextAreaElement | null) => {
            textareaEl.current = element;
            draftScrollbarController.viewportSet(element);
        },
        [draftScrollbarController],
    );
    const wasBusy = useRef(Boolean(props.disabled || props.pending));
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [typedMentionQuery, setTypedMentionQuery] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    /*
     * Which command Enter would run. It is an index rather than an id because
     * the offered list narrows as the draft is typed; the index is clamped into
     * the current list on every read, so a shrinking list moves the highlight
     * instead of losing it.
     */
    const [commandIndex, setCommandIndex] = useState(0);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [emojiQuery, setEmojiQuery] = useState("");
    /* Whether a file drag this composer will take is currently in flight. */
    const [dropActive, setDropActive] = useState(false);
    const restoreFocusAfterSend = useRef(false);
    const [selection, setSelection] = useState({ start: 0, end: 0 });
    const busy = Boolean(props.disabled || props.pending);
    const mentionsSupported = () => props.mentions !== undefined;
    const mentions = () => props.mentions ?? [];
    const mentionQuery = () => props.mentionQuery ?? typedMentionQuery;
    const filtered = () =>
        props.mentionQuery === undefined
            ? filterMentions(mentions(), typedMentionQuery)
            : mentions();
    const mentionOpen = () => !busy && mentionStart !== null && mentions().length > 0;
    const activeMention = () => {
        const list = filtered();
        if (list.length === 0) return undefined;
        return list[Math.min(activeIndex, list.length - 1)];
    };
    const commands = () => props.commands ?? [];
    const commandOpen = () => !busy && commands().length > 0 && props.onCommandSelect !== undefined;
    const activeCommand = () => {
        const list = commands();
        if (list.length === 0) return undefined;
        return list[Math.min(commandIndex, list.length - 1)];
    };
    const selectCommand = (id: string) => {
        setCommandIndex(0);
        props.onCommandSelect?.(id);
        textareaEl.current?.focus();
    };
    const canSend = () =>
        !busy &&
        !props.submitDisabled &&
        !commandOpen() &&
        (props.sendEnabled ?? props.value.trim().length > 0);
    /*
     * One control, two acts. While the agent is running an empty draft has
     * nothing to send, so that same circle stops the run; the moment there is
     * something to say it returns to sending, and what it sends steers the run
     * already under way.
     *
     * Unless nothing can be sent at all. A draft left in a composer that has
     * since been closed — the checkout went away, or a send is already in
     * flight — cannot steer anything, so keeping the send control there would
     * leave a disabled circle sitting on top of a run the reader still has to
     * be able to end. Whenever sending is impossible, stopping takes the
     * circle back regardless of what is written.
     */
    const stopShown = () =>
        Boolean(props.running && props.onStop) && (busy || props.value.trim().length === 0);
    const emoji = () => props.emoji ?? [];
    const filteredEmoji = () => {
        const needle = emojiQuery.trim().toLowerCase();
        if (!needle) return emoji();
        return emoji().filter(
            (item) =>
                item.id.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle),
        );
    };
    const hasAttachmentAction = () => Boolean(props.onAttachFile || props.onAttachmentsSelect);
    const audienceEnabled = () => Boolean(props.audience && props.onAudienceChange);
    const audienceToggle = () => {
        if (!props.audience) return;
        props.onAudienceChange?.(props.audience === "agents" ? "people" : "agents");
    };
    /*
     * Sizes the two edge fades from the scrolled draft itself. Every line box is
     * exactly LINE_HEIGHT tall, so what the scrollport cuts at each end is the
     * remainder of the offset: none of it at a line-aligned position — which is
     * where the draft rests after typing or an arrow key, and where both fades
     * collapse to nothing — and up to a line elsewhere. cutLineFade turns that
     * cut into a band, so a badly cut line is softened rather than erased and a
     * barely cut one is left alone, which is what keeps whole lines, selections,
     * and the caret out of the fades entirely.
     *
     * The measurement is written straight to the wrapper because only the
     * committed textarea knows where its own viewport sits, and a scroll gesture
     * must not re-render the composer on every frame to say so.
     */
    const draftFadeSync = (el: HTMLTextAreaElement) => {
        const wrapper = inputEl.current;
        if (!wrapper) return;
        // How much of the first visible line the top edge has taken, and how
        // much of the last one the bottom edge is holding back. Either being
        // zero means that end cuts nothing and gets no fade.
        const cutAbove = el.scrollTop % LINE_HEIGHT;
        const cutBelow =
            (LINE_HEIGHT - ((el.scrollTop + el.clientHeight) % LINE_HEIGHT)) % LINE_HEIGHT;
        const hasBelow = el.scrollHeight - el.clientHeight - el.scrollTop > 0.5;
        const top = cutLineFade(cutAbove);
        const bottom = hasBelow ? cutLineFade(cutBelow) : 0;
        wrapper.style.setProperty("--happy-composer-fade-top", `${top}px`);
        wrapper.style.setProperty("--happy-composer-fade-bottom", `${bottom}px`);
    };
    const closeMention = () => {
        setMentionStart(null);
        setTypedMentionQuery("");
        setActiveIndex(0);
    };
    const closeEmoji = () => {
        setEmojiOpen(false);
        setEmojiQuery("");
    };
    const closePopovers = () => {
        closeMention();
        closeEmoji();
    };
    // eslint-disable-next-line happy-react/no-layout-effect -- a completed send returns real keyboard focus to the committed textarea only when this composer initiated the focus handoff
    useLayoutEffect(() => {
        if (wasBusy.current && !busy && restoreFocusAfterSend.current && paneActive) {
            if (textareaEl.current) focusUnlessWritingElsewhere(textareaEl.current);
            restoreFocusAfterSend.current = false;
        }
        wasBusy.current = busy;
    }, [busy, paneActive]);
    // A composer nobody can type into neither claims typing nor takes the caret.
    useFocusOnType(
        textareaEl,
        props.focusOnType === true && !busy,
        busy ? undefined : props.focusKey,
    );
    // eslint-disable-next-line happy-react/no-layout-effect -- composer popovers require one document-level outside-pointer listener whose lifetime follows the mounted composer and is completely cleaned up
    useLayoutEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (!composerEl.current?.contains(event.target as Node)) closePopovers();
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    });
    const rememberSelection = () => {
        const el = textareaEl.current;
        if (!el) return;
        setSelection({
            start: el.selectionStart ?? props.value.length,
            end: el.selectionEnd ?? props.value.length,
        });
    };
    const focusAt = (position: number) => {
        const el = textareaEl.current;
        if (!el) return;
        queueMicrotask(() => {
            el.focus();
            el.setSelectionRange(position, position);
            setSelection({ start: position, end: position });
        });
    };
    const replaceSelection = (text: string) => {
        const current = selection;
        const next = props.value.slice(0, current.start) + text + props.value.slice(current.end);
        const nextCaret = current.start + text.length;
        props.onValueChange(next);
        focusAt(nextCaret);
    };
    const detectMention = (el: HTMLTextAreaElement) => {
        // Tracked whenever this composer mentions at all, not only while it has
        // candidates in hand: the first `@` of a searched list is typed before
        // any result exists, and the token it opened is what the picker needs
        // once the results arrive.
        if (!mentionsSupported()) return;
        const caret = el.selectionStart ?? el.value.length;
        const before = el.value.slice(0, caret);
        // Everything up to the next space belongs to the token, so a path
        // typed into a file mention keeps it open past its first slash.
        const match = /(^|[\s([{])@(\S*)$/.exec(before);
        if (!match) {
            closeMention();
            return;
        }
        const query = match[2] ?? "";
        const start = caret - query.length - 1;
        if (mentionStart !== start || typedMentionQuery !== query) setActiveIndex(0);
        setMentionStart(start);
        setTypedMentionQuery(query);
    };
    const selectMention = (mention: Mentionable) => {
        const el = textareaEl.current;
        const start = mentionStart;
        if (!el || start === null) return;
        const caret = el.selectionStart ?? el.value.length;
        const insertion = `@${mention.name} `;
        const next = el.value.slice(0, start) + insertion + el.value.slice(caret);
        closeMention();
        props.onValueChange(next);
        props.onMentionSelect?.(mention);
        const nextCaret = start + insertion.length;
        focusAt(nextCaret);
    };
    const triggerMention = () => {
        const el = textareaEl.current;
        if (!el || busy || !mentionsSupported()) return;
        closeEmoji();
        el.focus();
        const caret = el.selectionStart ?? props.value.length;
        const before = props.value.slice(0, caret);
        const needsSpace = before.length > 0 && !/[\s([{]$/.test(before);
        const insertion = `${needsSpace ? " " : ""}@`;
        const next = before + insertion + props.value.slice(el.selectionEnd ?? caret);
        props.onValueChange(next);
        setMentionStart(caret + insertion.length - 1);
        setTypedMentionQuery("");
        setActiveIndex(0);
        const nextCaret = caret + insertion.length;
        focusAt(nextCaret);
    };
    const triggerEmoji = () => {
        if (busy || emoji().length === 0) return;
        closeMention();
        rememberSelection();
        const open = !emojiOpen;
        setEmojiOpen(open);
        setEmojiQuery("");
        queueMicrotask(() => {
            if (!open) return;
            composerEl.current
                ?.querySelector<HTMLInputElement>('[data-happy-desktop-ui="emoji-picker"] input')
                ?.focus();
        });
    };
    const selectEmoji = (id: string) => {
        const item = emoji().find((candidate) => candidate.id === id);
        if (!item) return;
        closeEmoji();
        if (item.char) replaceSelection(item.char);
        else textareaEl.current?.focus();
        props.onEmojiSelect?.(item);
    };
    const triggerAttachment = () => {
        if (busy) return;
        closePopovers();
        if (props.onAttachFile) props.onAttachFile();
        else fileInputEl.current?.click();
    };
    const selectAttachments = (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.currentTarget.files ?? []);
        if (files.length > 0) props.onAttachmentsSelect?.(files);
        event.currentTarget.value = "";
        textareaEl.current?.focus();
    };
    const send = () => {
        if (!canSend()) return;
        closePopovers();
        restoreFocusAfterSend.current = true;
        void props.onSend();
        queueMicrotask(() => {
            const textarea = textareaEl.current;
            if (!textarea || textarea.disabled || textarea.readOnly) return;
            textarea.focus();
            restoreFocusAfterSend.current = false;
        });
    };
    const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        // Modified arrows belong to window navigation, even while suggestions are open.
        const suggestionArrow = !event.metaKey && !event.ctrlKey && !event.altKey;
        if (
            event.key === "Tab" &&
            event.shiftKey &&
            audienceEnabled() &&
            !busy &&
            !event.nativeEvent.isComposing
        ) {
            event.preventDefault();
            audienceToggle();
            return;
        }
        if (commandOpen()) {
            const list = commands();
            if (suggestionArrow && event.key === "ArrowDown") {
                event.preventDefault();
                setCommandIndex((index) => (Math.min(index, list.length - 1) + 1) % list.length);
                return;
            }
            if (suggestionArrow && event.key === "ArrowUp") {
                event.preventDefault();
                setCommandIndex(
                    (index) => (Math.min(index, list.length - 1) - 1 + list.length) % list.length,
                );
                return;
            }
            if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
                event.preventDefault();
                const command = activeCommand();
                if (command) selectCommand(command.id);
                return;
            }
            if (event.key === "Escape") {
                // The whole draft is the command being typed, so dismissing the
                // popover and clearing what opened it are the same act.
                event.preventDefault();
                setCommandIndex(0);
                props.onValueChange("");
                return;
            }
        }
        if (mentionOpen()) {
            const list = filtered();
            if (suggestionArrow && event.key === "ArrowDown" && list.length > 0) {
                event.preventDefault();
                setActiveIndex((index) => (index + 1) % list.length);
                return;
            }
            if (suggestionArrow && event.key === "ArrowUp" && list.length > 0) {
                event.preventDefault();
                setActiveIndex((index) => (index - 1 + list.length) % list.length);
                return;
            }
            if (
                (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) &&
                list.length > 0
            ) {
                event.preventDefault();
                const mention = activeMention();
                if (mention) selectMention(mention);
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closeMention();
                return;
            }
        }
        if (emojiOpen && event.key === "Escape") {
            event.preventDefault();
            closeEmoji();
            textareaEl.current?.focus();
            return;
        }
        /*
         * Escape stops the run, the way it does in the Happy Agent TUI, and it is the
         * last thing Escape can mean here: every popover above has already had
         * its turn and returned. What is half-written stays written — the draft
         * was aimed at the run being called off, not at the next one — and a
         * draft with something in it stops the run just the same, even though
         * the send control has taken the circle back from stop.
         */
        if (
            event.key === "Escape" &&
            props.running &&
            props.onStop &&
            !event.nativeEvent.isComposing
        ) {
            event.preventDefault();
            props.onStop();
            return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
        }
    };
    const onInput = (event: FormEvent<HTMLTextAreaElement>) => {
        // A new query is a new list; start its highlight at the top.
        setCommandIndex(0);
        props.onValueChange(event.currentTarget.value);
        rememberSelection();
        detectMention(event.currentTarget);
    };
    const onPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
        // Anything on the clipboard that arrived as a file is an attachment: a
        // screenshot, a PDF copied in Finder, a log someone dragged in. Text
        // pastes carry no files and fall through to the textarea untouched.
        const files = Array.from(event.clipboardData.files);
        if (files.length === 0 || !props.onAttachmentsSelect) return;
        event.preventDefault();
        props.onAttachmentsSelect(files);
    };
    /*
     * Dropping files is attaching them, exactly as pasting them is: the same
     * screenshot, the same PDF, arriving by the other gesture. A composer that
     * cannot take attachments at all — or one that is switched off — leaves the
     * drag alone rather than accepting it into nothing.
     */
    const dropAccepted = () => Boolean(props.onAttachmentsSelect) && !props.disabled;
    const attachDropped = (transfer: DataTransfer | null) => {
        const files = Array.from(transfer?.files ?? []);
        if (files.length > 0) props.onAttachmentsSelect?.(files);
    };
    /*
     * Answering `dragover` is what makes the drop possible at all: an
     * unprevented one leaves the browser's own default in charge, which opens
     * the dropped file over the page. It repeats for as long as the pointer is
     * over the card, so it is also what raises the card's drop state.
     */
    const dragOverSurface = (event: ReactDragEvent<HTMLDivElement>) => {
        if (!dropAccepted() || !dragCarriesFiles(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!dropActive) setDropActive(true);
    };
    const dragLeaveSurface = (event: ReactDragEvent<HTMLDivElement>) => {
        if (!dropActive) return;
        // `dragleave` also fires on every boundary crossed *inside* the card —
        // into the textarea, onto a control — so the pointer's own position is
        // what says whether the drag has really left it. Leaving the window
        // reports a point outside the card too, which is the same answer.
        const bounds = event.currentTarget.getBoundingClientRect();
        const inside =
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom;
        if (!inside) setDropActive(false);
    };
    const dropOnSurface = (event: ReactDragEvent<HTMLDivElement>) => {
        if (!dropAccepted() || !dragCarriesFiles(event.dataTransfer)) return;
        event.preventDefault();
        setDropActive(false);
        attachDropped(event.dataTransfer);
    };
    /*
     * The same claim the composer makes over unclaimed typing, made over a file
     * nothing else on the surface wants: a screenshot dragged at the transcript,
     * the sidebar, or the gap beside the card is meant for this conversation,
     * and the draft is the only place on the surface that can hold it. Left
     * alone the browser would navigate the whole window onto that file instead.
     *
     * A surface that answers the drag itself has already prevented the event by
     * the time it reaches the window, and so has the card above, which is what
     * keeps one drop from being attached twice.
     */
    // eslint-disable-next-line happy-react/no-layout-effect -- claiming a file drop no surface wants requires window-level drag listeners whose lifetime follows the mounted composer, which no handler on a rendered element can express
    useLayoutEffect(() => {
        if (!paneActive || !props.focusOnType || !dropAccepted()) return;
        const onDragOver = (event: DragEvent) => {
            if (event.defaultPrevented || !dragCarriesFiles(event.dataTransfer)) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
            // Whatever the pointer is over, this composer is where the file will
            // land, so the card says so for the whole flight of the drag.
            setDropActive(true);
        };
        const onDragLeave = (event: DragEvent) => {
            // Only a pointer that has left the window has taken the drag away;
            // every boundary inside the page bubbles the same event here.
            if (
                event.clientX > 0 &&
                event.clientY > 0 &&
                event.clientX < window.innerWidth &&
                event.clientY < window.innerHeight
            )
                return;
            setDropActive(false);
        };
        const onDrop = (event: DragEvent) => {
            setDropActive(false);
            if (event.defaultPrevented || !dragCarriesFiles(event.dataTransfer)) return;
            event.preventDefault();
            attachDropped(event.dataTransfer);
        };
        window.addEventListener("dragover", onDragOver);
        window.addEventListener("dragleave", onDragLeave);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragover", onDragOver);
            window.removeEventListener("dragleave", onDragLeave);
            window.removeEventListener("drop", onDrop);
        };
    });
    /*
     * The composer is one input surface, not a small textarea surrounded by
     * dead padding. Keep native and semantic controls in charge of their own
     * pointer interactions, but direct every other point in the card to the
     * editable control. Popovers are visually adjacent to the card but own
     * their separate keyboard interactions, and the footer row below the card
     * is not part of the input surface at all.
     *
     * It runs on mousedown and suppresses that event's default, which is the
     * whole point: pressing a plain <div> otherwise hands focus to the nearest
     * focusable ancestor — the document body — right after this handler asked
     * for the textarea, so the card looked inert everywhere but the text itself.
     * Only dead space is defaulted away; claimed targets return first and keep
     * their own press behavior, including the text selection that starts inside
     * the textarea and the footer.
     */
    const focusTextareaFromSurface = (event: ReactMouseEvent<HTMLDivElement>) => {
        // Composing is the primary button's job. A secondary or middle press is
        // the platform's — a context menu, a paste — and taking its default
        // away would answer a question that was not asked here.
        if (event.button !== 0) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        const claimed = target.closest(`${SURFACE_CLAIMED_TARGETS}, ${FOOTER_TARGETS}`);
        if (claimed && event.currentTarget.contains(claimed)) return;
        const textarea = textareaEl.current;
        if (!textarea || textarea.disabled) return;
        event.preventDefault();
        textarea.focus();
    };
    return (
        <div
            className={["happy-composer", props.className].filter(Boolean).join(" ")}
            aria-busy={props.pending ? "true" : undefined}
            data-audience={audienceEnabled() ? "" : undefined}
            data-agents={audienceEnabled() && props.audience === "agents" ? "" : undefined}
            data-disabled={props.disabled ? "" : undefined}
            data-dropping={dropActive && dropAccepted() ? "" : undefined}
            data-pending={props.pending ? "" : undefined}
            data-submit-disabled={props.submitDisabled ? "" : undefined}
            data-happy-desktop-ui="composer"
            data-testid={props["data-testid"]}
            onDragEnter={dragOverSurface}
            onDragLeave={dragLeaveSurface}
            onDragOver={dragOverSurface}
            onDrop={dropOnSurface}
            onMouseDown={focusTextareaFromSurface}
            onBlur={(event) => {
                const next = event.relatedTarget;
                if (next && !event.currentTarget.contains(next as Node)) closePopovers();
            }}
            style={props.style}
            ref={composerEl}
        >
            <div className="happy-composer__surface" data-happy-desktop-ui="composer-surface">
                {(props.attachmentPreviews?.length ?? 0) > 0 ? (
                    <div
                        className="happy-composer__attachments"
                        data-happy-desktop-ui="composer-attachment-previews"
                    >
                        <ComposerAttachmentPreviews
                            items={props.attachmentPreviews ?? []}
                            onOpen={props.onAttachmentPreviewOpen}
                            onRemove={props.onContextRemove}
                            readOnly={busy || !props.onContextRemove}
                        />
                    </div>
                ) : null}
                {(props.contextItems?.length ?? 0) > 0 ? (
                    <div
                        className="happy-composer__context"
                        data-happy-desktop-ui="composer-context"
                    >
                        <ContextChips
                            items={props.contextItems ?? []}
                            onRemove={props.onContextRemove}
                            readOnly={!props.onContextRemove}
                        />
                    </div>
                ) : null}
                <div
                    className="happy-composer__input"
                    data-happy-desktop-ui="composer-input"
                    ref={inputEl}
                >
                    <div
                        className="happy-composer__textarea-scroll"
                        data-scrollbar-always=""
                        data-scrollbar-axes="vertical"
                        data-scrollbar-host=""
                        data-scrollbar-placement="stable-gutter"
                        ref={draftScrollbarHost}
                    >
                        <textarea
                            className="happy-composer__textarea"
                            data-happy-desktop-ui="composer-textarea"
                            disabled={props.disabled}
                            readOnly={props.pending}
                            onBlur={() => {
                                rememberSelection();
                                props.onFocusChange?.(false);
                            }}
                            onClick={rememberSelection}
                            onFocus={() => props.onFocusChange?.(true)}
                            onInput={onInput}
                            onKeyDown={onKeyDown}
                            onPaste={onPaste}
                            onScroll={(event) => draftFadeSync(event.currentTarget)}
                            onSelect={rememberSelection}
                            placeholder={props.placeholder}
                            ref={textareaAttach}
                            rows={MIN_LINES}
                            value={props.value}
                        />
                        <ScrollbarTracks controller={draftScrollbarController} />
                    </div>
                    {/* Decorative edge fades: the draft dissolves into the card
                        where it runs past the visible lines, so a clipped line
                        is never cut on a hard edge. */}
                    <div
                        aria-hidden="true"
                        className="happy-composer__fade happy-composer__fade--top"
                        data-happy-desktop-ui="composer-fade-top"
                    />
                    <div
                        aria-hidden="true"
                        className="happy-composer__fade happy-composer__fade--bottom"
                        data-happy-desktop-ui="composer-fade-bottom"
                    />
                </div>
                <div className="happy-composer__toolbar" data-happy-desktop-ui="composer-toolbar">
                    <div
                        className="happy-composer__leading"
                        data-happy-desktop-ui="composer-leading"
                    >
                        {hasAttachmentAction() ? (
                            <Button
                                aria-label="Attach file"
                                disabled={busy}
                                icon="plus"
                                iconOnly
                                onClick={triggerAttachment}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                        {mentionsSupported() ? (
                            <Button
                                aria-label="Mention someone"
                                disabled={busy}
                                icon="at"
                                iconOnly
                                onClick={triggerMention}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                        {emoji().length > 0 ? (
                            <Button
                                aria-expanded={emojiOpen ? "true" : "false"}
                                aria-haspopup="dialog"
                                aria-label="Add emoji"
                                disabled={busy}
                                icon="smile"
                                iconOnly
                                onClick={triggerEmoji}
                                size="small"
                                variant="ghost"
                            />
                        ) : null}
                    </div>
                    <div
                        className="happy-composer__trailing"
                        data-happy-desktop-ui="composer-trailing"
                    >
                        {props.modelControl ? (
                            <div
                                className="happy-composer__model"
                                data-happy-desktop-ui="composer-model"
                            >
                                {props.modelControl}
                            </div>
                        ) : null}
                        {stopShown() ? (
                            <Button
                                aria-label="Stop the agent"
                                className="happy-composer__send happy-composer__stop"
                                data-action="stop"
                                icon="stop"
                                iconOnly
                                onClick={() => props.onStop?.()}
                                size="small"
                                variant="primary"
                            />
                        ) : (
                            <Button
                                aria-label="Send message"
                                className="happy-composer__send"
                                disabled={!canSend()}
                                icon="arrow-up"
                                iconOnly
                                onClick={send}
                                size="small"
                                variant="primary"
                            />
                        )}
                    </div>
                </div>
                {commandOpen() ? (
                    <div
                        className="happy-composer__popover"
                        data-happy-desktop-ui="composer-popover"
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        <CommandPicker
                            activeId={activeCommand()?.id}
                            items={commands()}
                            onSelect={selectCommand}
                        />
                    </div>
                ) : null}
                {mentionOpen() ? (
                    <div
                        className="happy-composer__popover"
                        data-happy-desktop-ui="composer-popover"
                        onMouseDown={(event) => event.preventDefault()}
                    >
                        <MentionPicker
                            activeId={activeMention()?.id}
                            label={props.mentionPickerLabel}
                            mentions={filtered()}
                            onSelect={selectMention}
                            query={mentionQuery()}
                        />
                    </div>
                ) : null}
                {emojiOpen && !busy ? (
                    <div
                        aria-label="Choose emoji"
                        className="happy-composer__popover happy-composer__popover--emoji"
                        data-happy-desktop-ui="composer-emoji-popover"
                        onKeyDown={(event) => {
                            if (event.key !== "Escape") return;
                            event.preventDefault();
                            closeEmoji();
                            textareaEl.current?.focus();
                        }}
                        role="dialog"
                    >
                        <EmojiPicker
                            emoji={filteredEmoji()}
                            onQueryChange={setEmojiQuery}
                            onSelect={selectEmoji}
                            query={emojiQuery}
                            recent={props.recentEmoji}
                        />
                    </div>
                ) : null}
                {props.onAttachmentsSelect && !props.onAttachFile ? (
                    <input
                        accept={props.attachmentAccept}
                        aria-hidden="true"
                        className="happy-composer__file-input"
                        multiple={props.attachmentMultiple}
                        onChange={selectAttachments}
                        ref={fileInputEl}
                        tabIndex={-1}
                        type="file"
                    />
                ) : null}
            </div>
            {audienceEnabled() || props.footerControl ? (
                <div
                    className="happy-composer__footer"
                    data-happy-desktop-ui={
                        audienceEnabled() ? "composer-audience" : "composer-footer"
                    }
                >
                    {audienceEnabled() ? (
                        <AudienceToggle
                            disabled={busy}
                            onChange={(value) => props.onAudienceChange?.(value)}
                            value={props.audience!}
                        />
                    ) : null}
                    {props.footerControl}
                </div>
            ) : null}
        </div>
    );
}
