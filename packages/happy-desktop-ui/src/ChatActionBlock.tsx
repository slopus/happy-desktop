import { useId, useState, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
    ChatAction,
    ChatActionBlock as ChatActionBlockModel,
    ChatActionButton as ChatActionButtonModel,
    ChatActionChoice,
    ChatFigure,
    ChatStatusTone,
    ChatStepStatus,
    ChatTreeNode,
} from "happy-desktop-state";
import { AssistantMark } from "./AssistantMark";
import { Button } from "./Button";
import { CHAT_SETTINGS_FIGURES, ChatSettingsFigure } from "./ChatActionFigures";
import { Checkbox } from "./Checkbox";
import { HAPPY_MOBILE_STORE_URLS } from "./DesktopMobileSetup";
import { FileTree, type FileTreeNode } from "./FileTree";
import { QRCode } from "./QRCode";
import { Spinner } from "./Spinner";
import { TextField } from "./TextField";
import { messageTextLayoutFontGenerationGet } from "./messageTextLayout";
import { Ionicon } from "./vectorIcons/VectorIcon";

/**
 * C-330 ChatActionBlock — inline UI an agent wrote into its reply: a menu of
 * buttons, a checklist or table with its submit, a code field, a list of steps,
 * one status line, a file tree, or a live figure.
 *
 * It draws a tree `@slopus/happy-agent-client` already parsed and checked.
 * Every string in it is plain text: nothing is read as Markdown or HTML, and
 * nothing is linked. It is laid on the chat like every inline layout: no frame,
 * no background, the reply's own left edge and type.
 *
 * Buttons are outlined; at most one is emphasized, and it is still outlined,
 * only in ink. A press marks the control chosen and locks the block without
 * changing the size of anything, so the height the transcript reserved for
 * the block stays true in every state and a press never moves the layout. A
 * control whose action this build does not know is drawn but cannot be
 * pressed.
 */
export type ChatActionBlockProps = {
    readonly block: ChatActionBlockModel;
    /**
     * What was chosen here: recorded on the message, or on its way. A block
     * with a choice is locked. Numbered as the daemon records it: a menu's
     * buttons in order; a checklist's submit is its `checklist` choice and its
     * other buttons count from 1.
     */
    readonly choice?: ChatActionChoice;
    /** Reports a press. Absent, the block is shown but cannot be used. */
    readonly onInvoke?: (press: ChatActionBlockPress) => void;
    /** Pins a step's spinner on one frame, for a still fixture. */
    readonly spinnerFrame?: number;
    /** What the live figures show, drawn by the conversation's owner. */
    readonly figures?: ChatActionFigures;
    /**
     * Whether its message is still the one the conversation stands on. A
     * figure in an older message shows what it shows without starting anything.
     */
    readonly live?: boolean;
};

/** One press as the block reports it; the owner adds where the block is. */
export type ChatActionBlockPress = {
    readonly controlIndex: number;
    readonly choice: ChatActionChoice;
    readonly action: ChatAction;
    readonly label: string;
    /** A checklist's ticked values, or a code field's text. Never kept by the block. */
    readonly values: readonly string[];
};

/**
 * The live figures a reply may hold, each drawn by whoever owns the
 * conversation from its own live state. A figure with nothing here is not
 * drawn at all; `chatActionFigureDrawn` says which are.
 */
export type ChatActionFigures = {
    /**
     * This Happy Agent's live pairing with a phone. Live, it opens a pairing;
     * in an older message it only shows the pairing as it stands.
     */
    readonly phonePairing?: (live: boolean) => ReactNode;
    /**
     * One provider CLI's live sign-in, and its install where this machine does
     * that. Live, its controls work; in an older message it only shows the CLI
     * as it stands.
     */
    readonly providerCli?: (
        cliId: string,
        target: "team" | "private" | undefined,
        live: boolean,
    ) => ReactNode;
    /** The live default model for new chats. */
    readonly defaultModel?: ReactNode;
    /**
     * A team server's own figures — invite, members, providers, compute, the
     * phone's server link — drawn as the way into the Settings page that does
     * each, which opens through the conversation's settings links.
     */
    readonly teamSettings?: true;
};

/** The figure types an owner draws, from what it supplied. The download codes need nothing. */
export function chatActionFigureTypes(
    figures: ChatActionFigures | undefined,
): ReadonlySet<ChatFigure["type"]> {
    const types = new Set<ChatFigure["type"]>(["phoneApp"]);
    if (figures?.phonePairing !== undefined) types.add("phonePair");
    if (figures?.providerCli !== undefined) types.add("providerCli");
    if (figures?.defaultModel !== undefined) types.add("setting");
    if (figures?.teamSettings === true)
        for (const type of CHAT_SETTINGS_FIGURES.keys()) types.add(type);
    return types;
}

export function ChatActionBlock(props: ChatActionBlockProps) {
    const block = props.block;
    switch (block.kind) {
        case "menu":
            return (
                <div
                    className="happy-chat-action happy-chat-action__buttons"
                    data-happy-desktop-ui="chat-action-buttons"
                    data-locked={props.choice ? "" : undefined}
                    role="group"
                >
                    {block.buttons.map((button, index) => (
                        <ChatActionButtonView
                            button={button}
                            chosen={props.choice?.kind === "button" && props.choice.index === index}
                            key={index}
                            locked={props.choice !== undefined}
                            onPress={pressOf(props, button, index, { kind: "button", index })}
                        />
                    ))}
                </div>
            );
        case "checklist":
            return <ChatActionChecklist {...props} block={block} />;
        case "code":
            return <ChatActionCode {...props} block={block} />;
        case "steps":
            return (
                /* A list by role, not `<ol>`: the reply body's Markdown list rules
                   must not reach it, here or in the box that measures it. */
                <div
                    className="happy-chat-action happy-chat-action__steps"
                    data-happy-desktop-ui="chat-action-steps"
                    role="list"
                >
                    {block.steps.map((step, index) => (
                        <div
                            className="happy-chat-action__step"
                            role="listitem"
                            data-happy-desktop-ui="chat-action-step"
                            data-status={step.status}
                            key={index}
                        >
                            <span className="happy-chat-action__mark">
                                {stepMark(step.status, props.spinnerFrame)}
                            </span>
                            {step.mark ? (
                                <span className="happy-chat-action__product">
                                    <AssistantMark name={step.mark} size={16} />
                                </span>
                            ) : null}
                            <span className="happy-chat-action__text">
                                <span className="happy-chat-action__label">{step.label}</span>
                                {step.detail ? (
                                    <span className="happy-chat-action__detail">{step.detail}</span>
                                ) : null}
                            </span>
                        </div>
                    ))}
                </div>
            );
        case "status":
            return (
                <div
                    className="happy-chat-action happy-chat-action__status"
                    data-happy-desktop-ui="chat-action-status"
                    data-status={block.status}
                    role="status"
                >
                    <span className="happy-chat-action__mark">
                        {statusMark(block.status, props.spinnerFrame)}
                    </span>
                    <span className="happy-chat-action__text">
                        <span className="happy-chat-action__label">{block.text}</span>
                        {block.detail ? (
                            <span className="happy-chat-action__detail">{block.detail}</span>
                        ) : null}
                    </span>
                </div>
            );
        case "tree":
            return (
                <div
                    className="happy-chat-action happy-chat-action__tree"
                    data-happy-desktop-ui="chat-action-tree"
                >
                    <FileTree label="Places" nodes={treeNodesOf(block.nodes, "")} />
                </div>
            );
        case "figure":
            return (
                <ChatActionFigureView
                    figure={block.figure}
                    figures={props.figures}
                    live={props.live === true}
                />
            );
    }
}

/** A press of one control, or nothing when it cannot be pressed. */
function pressOf(
    props: ChatActionBlockProps,
    button: ChatActionButtonModel,
    controlIndex: number,
    choice: ChatActionChoice,
): (() => void) | undefined {
    const action = button.action;
    const onInvoke = props.onInvoke;
    if (action === undefined || onInvoke === undefined) return undefined;
    return () => onInvoke({ controlIndex, choice, action, label: button.label, values: [] });
}

/**
 * One fixed box per figure, whatever state it draws, so the height the
 * transcript reserved for it holds from missing to signed in, or from a code
 * to paired.
 */
function ChatActionFigureView(props: {
    readonly figure: ChatFigure;
    readonly figures: ChatActionFigures | undefined;
    readonly live: boolean;
}) {
    const figure = props.figure;
    switch (figure.type) {
        case "phoneApp":
            return (
                <div
                    className="happy-chat-action happy-chat-action__phone"
                    data-happy-desktop-ui="chat-action-phone-app"
                >
                    <QRCode
                        data={HAPPY_MOBILE_STORE_URLS.ios}
                        label="iPhone"
                        mark="app-store"
                        size={120}
                    />
                    <QRCode
                        data={HAPPY_MOBILE_STORE_URLS.android}
                        label="Android"
                        mark="google-play"
                        size={120}
                    />
                </div>
            );
        case "phonePair":
            return (
                <div
                    className="happy-chat-action happy-chat-action__phone-pair"
                    data-happy-desktop-ui="chat-action-phone-pair"
                >
                    {props.figures?.phonePairing?.(props.live)}
                </div>
            );
        case "providerCli":
            return (
                <div
                    className="happy-chat-action happy-chat-action__figure"
                    data-figure="provider-cli"
                    data-happy-desktop-ui="chat-action-provider-cli"
                >
                    {props.figures?.providerCli?.(figure.cliId, figure.target, props.live)}
                </div>
            );
        case "setting":
            return (
                <div
                    className="happy-chat-action happy-chat-action__figure"
                    data-figure="setting"
                    data-happy-desktop-ui="chat-action-setting"
                >
                    {props.figures?.defaultModel}
                </div>
            );
        case "invite":
        case "members":
        case "providers":
        case "computeJoin":
        case "serverLink":
            return (
                <div
                    className="happy-chat-action happy-chat-action__figure"
                    data-figure="settings"
                    data-happy-desktop-ui="chat-action-settings-figure"
                >
                    <ChatSettingsFigure type={figure.type} />
                </div>
            );
    }
}

function ChatActionChecklist(
    props: ChatActionBlockProps & {
        readonly block: Extract<ChatActionBlockModel, { kind: "checklist" }>;
    },
) {
    const block = props.block;
    const id = useId();
    /* Ticks are this block's own until it is submitted; then the choice holds them. */
    const [ticked, setTicked] = useState<ReadonlySet<string>>(
        () =>
            new Set(block.options.filter((option) => option.checked).map((option) => option.value)),
    );
    const submitted = props.choice?.kind === "checklist" ? new Set(props.choice.values) : undefined;
    const values = submitted ?? ticked;
    const locked = props.choice !== undefined;
    const chosenValues = block.options
        .filter((option) => values.has(option.value))
        .map((option) => option.value);
    const action = block.action;
    const onInvoke = props.onInvoke;
    /* With nothing ticked, the submit says what it does then, when the block says. */
    const submitLabel =
        chosenValues.length === 0 && block.submit.emptyLabel
            ? block.submit.emptyLabel
            : block.submit.label;
    const tick = (value: string, checked: boolean) => {
        const next = new Set(ticked);
        if (checked) next.add(value);
        else next.delete(value);
        setTicked(next);
    };
    return (
        <div
            className="happy-chat-action happy-chat-action__checklist"
            data-happy-desktop-ui="chat-action-checklist"
            data-locked={locked ? "" : undefined}
        >
            {block.table ? (
                <ChatActionTable
                    columns={block.table.columns}
                    id={id}
                    locked={locked}
                    onTick={tick}
                    options={block.options}
                    values={values}
                />
            ) : (
                <div className="happy-chat-action__options" role="group">
                    {block.options.map((option, index) => (
                        <div
                            className="happy-chat-action__option"
                            data-happy-desktop-ui="chat-action-option"
                            key={option.value}
                        >
                            <Checkbox
                                checked={values.has(option.value)}
                                disabled={locked || option.disabled}
                                id={`${id}-${String(index)}`}
                                onChange={(checked) => tick(option.value, checked)}
                            />
                            <label
                                className="happy-chat-action__text"
                                htmlFor={`${id}-${String(index)}`}
                            >
                                {option.mark ? (
                                    <span className="happy-chat-action__product">
                                        <AssistantMark name={option.mark} size={16} />
                                    </span>
                                ) : null}
                                <span className="happy-chat-action__label">{option.label}</span>
                                {option.detail ? (
                                    <span className="happy-chat-action__detail">
                                        {option.detail}
                                    </span>
                                ) : null}
                            </label>
                        </div>
                    ))}
                </div>
            )}
            <div className="happy-chat-action__buttons" role="group">
                <ChatActionButtonView
                    button={{ label: submitLabel, emphasized: block.submit.emphasized }}
                    chosen={props.choice?.kind === "checklist"}
                    locked={locked}
                    onPress={
                        action !== undefined && onInvoke !== undefined
                            ? () =>
                                  onInvoke({
                                      controlIndex: 0,
                                      choice: { kind: "checklist", values: chosenValues },
                                      action,
                                      label: submitLabel,
                                      values: chosenValues,
                                  })
                            : undefined
                    }
                />
                {block.others.map((button, index) => (
                    <ChatActionButtonView
                        button={button}
                        chosen={props.choice?.kind === "button" && props.choice.index === index + 1}
                        key={index}
                        locked={locked}
                        onPress={pressOf(props, button, index + 1, {
                            kind: "button",
                            index: index + 1,
                        })}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * A checklist as a table: the checkbox column, the item column with its mark
 * and sub-line, then one column per cell, under the headings the block names.
 */
function ChatActionTable(props: {
    readonly columns: readonly string[];
    readonly id: string;
    readonly options: Extract<ChatActionBlockModel, { kind: "checklist" }>["options"];
    readonly values: ReadonlySet<string>;
    readonly locked: boolean;
    readonly onTick: (value: string, checked: boolean) => void;
}) {
    const cells = props.columns.length - 2;
    /* The checkbox's column is as wide as its heading. No column is ever
       narrower than its longest word, so a heading or an email never breaks
       inside itself; past that the item and every cell but the last grow to
       what they need, and the last takes the rest. When the row is short of
       room, labels wrap between their words instead. */
    const template = [
        "minmax(20px, max-content)",
        ...Array.from({ length: cells + 1 }, (_, index) =>
            index === cells ? "minmax(min-content, 1fr)" : "minmax(min-content, max-content)",
        ),
    ].join(" ");
    return (
        <div
            className="happy-chat-action__table"
            data-happy-desktop-ui="chat-action-table"
            role="table"
            style={{ gridTemplateColumns: template }}
        >
            <div className="happy-chat-action__table-row happy-chat-action__table-head" role="row">
                {props.columns.map((column, index) => (
                    <span
                        className="happy-chat-action__table-heading"
                        key={index}
                        role="columnheader"
                    >
                        {column}
                    </span>
                ))}
            </div>
            {props.options.map((option, index) => {
                const inputId = `${props.id}-${String(index)}`;
                return (
                    <div
                        className="happy-chat-action__table-row"
                        data-happy-desktop-ui="chat-action-table-row"
                        key={option.value}
                        role="row"
                    >
                        <span className="happy-chat-action__table-check" role="cell">
                            <Checkbox
                                checked={props.values.has(option.value)}
                                disabled={props.locked || option.disabled}
                                id={inputId}
                                onChange={(checked) => props.onTick(option.value, checked)}
                            />
                        </span>
                        <label
                            className="happy-chat-action__table-item"
                            htmlFor={inputId}
                            role="cell"
                        >
                            <span className="happy-chat-action__table-name">
                                {option.mark ? (
                                    <span className="happy-chat-action__product">
                                        <AssistantMark name={option.mark} size={16} />
                                    </span>
                                ) : null}
                                <span className="happy-chat-action__label">{option.label}</span>
                            </span>
                            {option.detail ? (
                                <span className="happy-chat-action__detail">{option.detail}</span>
                            ) : null}
                        </label>
                        {Array.from({ length: cells }, (_, at) => {
                            const cell = option.cells?.[at] ?? "";
                            return (
                                <span
                                    className="happy-chat-action__table-cell"
                                    key={at}
                                    role="cell"
                                    title={cell}
                                >
                                    {cell}
                                </span>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * A single-line field for a code, with its submit. What is typed goes to the
 * press and nowhere else: the block keeps it only while it is being typed,
 * empties the field once it is sent, and never shows it again. Submitted, the
 * block locks like any other; a code that turned out wrong is asked for again
 * in a new message.
 */
function ChatActionCode(
    props: ChatActionBlockProps & {
        readonly block: Extract<ChatActionBlockModel, { kind: "code" }>;
    },
) {
    const [code, setCode] = useState("");
    const locked = props.choice !== undefined;
    const action = props.block.action;
    const onInvoke = props.onInvoke;
    const usable = !locked && action !== undefined && onInvoke !== undefined && code.trim() !== "";
    const send = () => {
        if (!usable) return;
        onInvoke({
            controlIndex: 0,
            choice: { kind: "submitted" },
            action,
            label: props.block.submit.label,
            values: [code.trim()],
        });
        setCode("");
    };
    return (
        <div
            className="happy-chat-action happy-chat-action__code"
            data-happy-desktop-ui="chat-action-code"
            data-locked={locked ? "" : undefined}
        >
            <TextField
                aria-label={props.block.placeholder || props.block.submit.label}
                autoComplete="one-time-code"
                className="happy-chat-action__code-field"
                disabled={locked || action === undefined || onInvoke === undefined}
                onSubmit={send}
                onValueChange={setCode}
                placeholder={props.block.placeholder}
                size="medium"
                value={locked ? "" : code}
            />
            <ChatActionButtonView
                button={{
                    label: props.block.submit.label,
                    emphasized: props.block.submit.emphasized,
                }}
                chosen={locked}
                locked={locked}
                onPress={usable ? send : undefined}
            />
        </div>
    );
}

/**
 * One outline button. Live, the emphasized one is drawn in ink; once its block
 * is answered nothing is emphasized any more: the chosen one takes the pressed
 * fill and the others fade. One naming something already connected wears a
 * green check on its corner, out of the flow so it moves nothing.
 */
function ChatActionButtonView(props: {
    readonly button: Pick<ChatActionButtonModel, "label" | "emphasized" | "mark" | "connected">;
    readonly chosen: boolean;
    readonly locked: boolean;
    readonly onPress: (() => void) | undefined;
}) {
    const usable = props.onPress !== undefined && !props.locked;
    /* The check rides the button's corner, so it hangs off a wrapper: the
       button's label is its own containing block. */
    return (
        <span className="happy-chat-action__choice">
            <Button
                aria-pressed={props.locked ? props.chosen : undefined}
                className="happy-chat-action__button"
                data-chosen={props.chosen ? "" : undefined}
                data-emphasis={props.button.emphasized && !props.locked ? "" : undefined}
                data-strong={props.button.emphasized ? "" : undefined}
                disabled={!usable && !props.chosen}
                onClick={() => {
                    if (usable) props.onPress?.();
                }}
                size="medium"
                variant="outline"
            >
                {props.button.mark ? (
                    <span className="happy-chat-action__product">
                        <AssistantMark name={props.button.mark} size={16} />
                    </span>
                ) : null}
                {props.button.label}
            </Button>
            {props.button.connected ? (
                <span aria-label="Connected" className="happy-chat-action__connected" role="img">
                    <Ionicon name="checkmark" size={11} />
                </span>
            ) : null}
        </span>
    );
}

/** A tree block's places as the file tree draws them, every folder open. */
function treeNodesOf(nodes: readonly ChatTreeNode[], parent: string): FileTreeNode[] {
    return nodes.map((node, index) => {
        const id = `${parent}/${String(index)}`;
        return node.children.length > 0
            ? {
                  id,
                  name: node.name,
                  kind: "directory",
                  expanded: true,
                  children: treeNodesOf(node.children, id),
              }
            : { id, name: node.name, kind: "directory" };
    });
}

function stepMark(status: ChatStepStatus, frame: number | undefined): ReactNode {
    switch (status) {
        case "pending":
            return <Ionicon name="ellipse-outline" size={16} />;
        case "running":
            return <Spinner size={16} {...(frame === undefined ? {} : { frame })} />;
        case "done":
            return <Ionicon name="checkmark-circle" size={16} />;
        case "failed":
            return <Ionicon name="close-circle" size={16} />;
    }
}

function statusMark(tone: ChatStatusTone, frame: number | undefined): ReactNode {
    switch (tone) {
        case "info":
            return <Ionicon name="information-circle-outline" size={16} />;
        case "running":
            return <Spinner size={16} {...(frame === undefined ? {} : { frame })} />;
        case "done":
            return <Ionicon name="checkmark-circle" size={16} />;
        case "failed":
            return <Ionicon name="alert-circle" size={16} />;
    }
}

let measureHost: HTMLDivElement | undefined;
const measured = new WeakMap<ChatActionBlockModel, Map<string, number>>();

/**
 * The block's height at `width`, measured by laying out the same component in
 * an invisible box of that width. A choice never changes it, and a figure is a
 * fixed box whatever it draws, so the block alone decides it.
 *
 * The markup laid out is React's own rendering of the typed block, with every
 * string escaped as text; the agent's HTML never reaches the document.
 */
export function chatActionBlockHeight(block: ChatActionBlockModel, width: number): number {
    if (typeof document === "undefined") return 0;
    const key = `${String(width)}|${String(messageTextLayoutFontGenerationGet())}`;
    let byKey = measured.get(block);
    const known = byKey?.get(key);
    if (known !== undefined) return known;
    if (!measureHost?.isConnected) {
        measureHost = document.createElement("div");
        measureHost.setAttribute("aria-hidden", "true");
        measureHost.dataset.happyDesktopUi = "chat-action-measure";
        /* Absolute: measuring must sit outside every flow so it moves nothing on screen.
           The class gives it the reply body's type, which the block inherits. */
        measureHost.className = "happy-message__body happy-message__body--markdown";
        measureHost.style.cssText =
            "position:absolute;top:0;left:-100000px;visibility:hidden;pointer-events:none;contain:layout paint;";
        document.body.append(measureHost);
    }
    measureHost.style.width = `${String(width)}px`;
    const template = document.createElement("template");
    template.innerHTML = renderToStaticMarkup(<ChatActionBlock block={block} spinnerFrame={0} />);
    measureHost.replaceChildren(template.content);
    /* The block itself, past the image preloads React writes ahead of it. */
    const height =
        [...measureHost.children].find((child) => child.tagName !== "LINK")?.getBoundingClientRect()
            .height ?? 0;
    measureHost.replaceChildren();
    if (!byKey) {
        byKey = new Map();
        measured.set(block, byKey);
    }
    byKey.set(key, height);
    return height;
}
