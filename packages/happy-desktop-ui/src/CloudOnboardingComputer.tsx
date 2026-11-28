import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { SetupCommand } from "./SetupCommand";
import { Spinner } from "./Spinner";
import { Ionicon, type IoniconName } from "./vectorIcons/VectorIcon";

/*
 * The computer step of a Happy Cloud server's onboarding: why agents need a
 * computer, with one diagram; "Connect this Mac" and "Add server or sandbox"
 * side by side; "How is this secured?"; and the narrow list of the reader's
 * computers, in room held from the start. Its two dialogs are here too.
 * Props only: what is on the list and what each button does are the caller's.
 */

/** The system the app runs on. A Windows computer joins but runs no work yet. */
export type CloudOnboardingComputerOs = "mac" | "linux" | "windows";

/** Who is setting up: an owner has nobody to ask; a member's server card says the team reads along. */
export type CloudOnboardingComputerReader = "owner" | "member";

/** Where one computer on the list stands. */
export type CloudOnboardingComputerRowState =
    | { readonly kind: "online" }
    /** Not online yet: still joining, or waiting for its command to be run. */
    | { readonly kind: "joining" }
    | { readonly kind: "offline" }
    /** Online, but its system runs no agents' work yet. */
    | { readonly kind: "unsupported" }
    /** Its reason stands in the name's place. */
    | { readonly kind: "failed"; readonly reason: string };

export interface CloudOnboardingComputerRow {
    readonly id: string;
    readonly name: string;
    readonly os: CloudOnboardingComputerOs | "other";
    readonly state: CloudOnboardingComputerRowState;
    /** One quiet line under the name, such as what to do with a copied command. */
    readonly note?: string;
}

/**
 * The first button's one box: ready, working (it keeps its words and cannot
 * be pressed), done, failed (it offers to try again), or not offered on a
 * system that runs no work.
 */
export type CloudOnboardingComputerConnect =
    | { readonly kind: "idle" }
    | { readonly kind: "working" }
    | { readonly kind: "connected" }
    /** `copyNext`: the app couldn't run the installer here, so the press copies the command. */
    | { readonly kind: "failed"; readonly copyNext?: boolean };

export interface CloudOnboardingComputerBodyProps {
    readonly reader: CloudOnboardingComputerReader;
    /** The server, as its rail tile names it. */
    readonly serverName: string;
    /** The system the app runs on. It names the first button. */
    readonly hostOs: CloudOnboardingComputerOs;
    readonly connect: CloudOnboardingComputerConnect;
    /** Every computer that joined or is joining, newest last, this one in its place. */
    readonly computers: readonly CloudOnboardingComputerRow[];
    /** "Connect this Mac", and "Try again" or "Copy the command instead" after a failure. */
    onConnect?(): void;
    /** "Add server or sandbox". */
    onAdd?(): void;
    /** "How is this secured?". */
    onExplain?(): void;
}

/** The title and the line under it. */
export function cloudOnboardingComputerCopy(props: {
    readonly reader: CloudOnboardingComputerReader;
    readonly serverName: string;
    /** The step is required. */
    readonly required: boolean;
    /** The team already has a shared computer the reader's agents may use. */
    readonly shared: boolean;
}): { readonly title: string; readonly copy: string } {
    const title = "Add a computer";
    if (props.shared && !props.required)
        return {
            title,
            copy: `Your agents can use ${props.serverName}’s shared computer. Add yours to work with your files.`,
        };
    if (props.reader === "member" && props.required)
        return { title, copy: `${props.serverName} asks everyone to add one for their agents.` };
    if (props.reader === "member")
        return { title, copy: "Your agents need one to run commands and work with files." };
    return { title, copy: "Agents need a computer to run commands and work with files." };
}

/* ---- Small parts ------------------------------------------------------------ */

function Tag(props: { readonly label: string }) {
    return <span className="happy-computer-step__tag">{props.label}</span>;
}

function Points(props: { readonly items: readonly string[] }) {
    return (
        <ul className="happy-computer-step__points">
            {props.items.map((item) => (
                <li className="happy-computer-step__point" key={item}>
                    <span aria-hidden className="happy-computer-step__point-mark">
                        <span className="happy-computer-step__bullet" />
                    </span>
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}

/** One end of the diagram: a mark, a title, one quiet line, and its points. */
function Node(props: {
    readonly glyph: IoniconName;
    readonly title: string;
    readonly detail: string;
    readonly children: ReactNode;
}) {
    return (
        <div className="happy-computer-step__node">
            <div className="happy-computer-step__head">
                <span aria-hidden className="happy-computer-step__mark">
                    <Ionicon name={props.glyph} size={16} />
                </span>
                <span className="happy-computer-step__head-text">
                    <span className="happy-computer-step__title">{props.title}</span>
                    <span className="happy-computer-step__detail">{props.detail}</span>
                </span>
            </div>
            {props.children}
        </div>
    );
}

/** One direction of the link: the word sits in the middle of its own line. */
function Wire(props: { readonly label: string; readonly dir: "forward" | "back" }) {
    return (
        <span className="happy-computer-step__wire" data-dir={props.dir}>
            {props.dir === "back" ? (
                <span className="happy-computer-step__wire-head">
                    <Ionicon name="caret-back" size={12} />
                </span>
            ) : null}
            <span className="happy-computer-step__wire-rule" />
            <span className="happy-computer-step__wire-label">{props.label}</span>
            <span className="happy-computer-step__wire-rule" />
            {props.dir === "forward" ? (
                <span className="happy-computer-step__wire-head">
                    <Ionicon name="caret-forward" size={12} />
                </span>
            ) : null}
        </span>
    );
}

const EXAMPLE = { command: "git checkout main", output: "Switched to branch 'main'" } as const;

/**
 * Why a computer is needed: the server where agents think, the computer where
 * their commands run, and what crosses between them, with one example. The
 * page and "How is this secured?" draw this same component.
 */
function Diagram(props: {
    readonly reader: CloudOnboardingComputerReader;
    readonly serverName: string;
    /** `dialog` draws the two ends as frames, so they never read as cards in a card. */
    readonly surface: "page" | "dialog";
}) {
    return (
        <div className="happy-computer-step__diagram" data-surface={props.surface}>
            <Node
                detail={props.reader === "member" ? "Your team’s server" : "Happy Cloud server"}
                glyph="cloud-outline"
                title={props.serverName}
            >
                {/* A member's last point takes two lines, so it has one point fewer:
                    both cards stay four lines tall for owner and member alike. */}
                <Points
                    items={
                        props.reader === "member"
                            ? [
                                  "Agents think here",
                                  "Keeps your AI keys",
                                  "Teammates can read commands in shared work",
                              ]
                            : [
                                  "Agents think here",
                                  "Keeps your AI keys",
                                  "Sends the commands",
                                  "Sees commands and output",
                              ]
                    }
                />
            </Node>
            <div className="happy-computer-step__link">
                <Wire dir="forward" label="Commands" />
                <code className="happy-computer-step__example">$ {EXAMPLE.command}</code>
                <Wire dir="back" label="Output" />
                <code className="happy-computer-step__example">{EXAMPLE.output}</code>
            </div>
            <Node detail="Where agents work" glyph="desktop-outline" title="Your computer">
                <Points
                    items={[
                        "Checkout and push code",
                        "Run shell commands",
                        "Read / write your local files",
                        "Reviewed in Auto mode",
                    ]}
                />
            </Node>
        </div>
    );
}

/* ---- The page -------------------------------------------------------------- */

const OS_GLYPH: Readonly<Record<CloudOnboardingComputerRow["os"], IoniconName>> = {
    mac: "logo-apple",
    linux: "logo-tux",
    windows: "logo-windows",
    other: "desktop-outline",
};

const CONNECT_THIS: Readonly<Record<CloudOnboardingComputerOs, string>> = {
    mac: "Connect this Mac",
    linux: "Connect this Linux machine",
    windows: "Connect this PC",
};

const THIS_CONNECTED: Readonly<Record<CloudOnboardingComputerOs, string>> = {
    mac: "This Mac connected",
    linux: "This machine connected",
    windows: "This PC connected",
};

/** Whether a computer on this system can run agents' work. */
function runsWork(os: CloudOnboardingComputerOs): boolean {
    return os !== "windows";
}

/** The first button's one box, which never changes size or place. */
function ConnectThis(props: {
    readonly os: CloudOnboardingComputerOs;
    readonly connect: CloudOnboardingComputerConnect;
    readonly onConnect: (() => void) | undefined;
}) {
    if (!runsWork(props.os))
        return (
            <span className="happy-computer-step__connect" data-state="unavailable">
                <Ionicon name="logo-windows" size={14} />
                This PC: not yet
            </span>
        );
    if (props.connect.kind === "connected")
        return (
            <span className="happy-computer-step__connect" data-state="connected">
                <Icon name="check" size={14} />
                {THIS_CONNECTED[props.os]}
            </span>
        );
    return (
        <Button
            loading={props.connect.kind === "working"}
            onClick={props.onConnect}
            size="medium"
            width={232}
        >
            {props.connect.kind !== "failed"
                ? CONNECT_THIS[props.os]
                : props.connect.copyNext
                  ? "Copy the command instead"
                  : "Try again"}
        </Button>
    );
}

/**
 * One computer. Its state sits at the row's end in one fixed box, so the name
 * never moves as a spinner becomes a check. A failure's reason takes the
 * name's place, cut to fit, with the whole of it in the title; what the
 * installer said last goes under it in full, and the row grows down for it.
 */
function ComputerRow(props: { readonly row: CloudOnboardingComputerRow }) {
    const { row } = props;
    const { state } = row;
    const text = state.kind === "failed" ? state.reason : row.name;
    return (
        <li
            className="happy-computer-step__computer"
            data-happy-desktop-ui="cloud-onboarding-computer"
            data-state={state.kind}
            title={
                state.kind === "failed"
                    ? `${row.name}: ${state.reason}${row.note ? `. ${row.note}` : ""}`
                    : undefined
            }
        >
            <span aria-hidden className="happy-computer-step__computer-mark">
                <Ionicon name={OS_GLYPH[row.os]} size={14} />
            </span>
            <span className="happy-computer-step__computer-text">
                <span className="happy-computer-step__computer-name">{text}</span>
                {row.note ? (
                    <span className="happy-computer-step__computer-note">{row.note}</span>
                ) : null}
            </span>
            <span className="happy-computer-step__computer-state">
                {state.kind === "online" ? (
                    <span aria-label="Online" className="happy-computer-step__check" role="img">
                        <Icon name="check" size={14} />
                    </span>
                ) : state.kind === "failed" ? (
                    <span aria-label="Failed" className="happy-computer-step__failed" role="img">
                        <Icon name="alert" size={14} />
                    </span>
                ) : state.kind === "joining" ? (
                    <Spinner label="Joining" size={14} tone="muted" />
                ) : state.kind === "offline" ? (
                    "Offline"
                ) : (
                    "Not yet"
                )}
            </span>
        </li>
    );
}

/**
 * The step body: the diagram, the two buttons, "How is this secured?", and the
 * narrow list of computers. Every part has its room from the start, so nothing
 * moves between states. With nothing on it the list shows nothing; on Windows
 * it holds why this PC cannot join yet, in the first row's place.
 */
export function CloudOnboardingComputerBody(props: CloudOnboardingComputerBodyProps) {
    return (
        <div className="happy-computer-step" data-happy-desktop-ui="cloud-onboarding-computer-step">
            <Diagram reader={props.reader} serverName={props.serverName} surface="page" />
            <div className="happy-computer-step__actions">
                <div className="happy-computer-step__pair">
                    <ConnectThis
                        connect={props.connect}
                        onConnect={props.onConnect}
                        os={props.hostOs}
                    />
                    <Button
                        icon="plus"
                        onClick={props.onAdd}
                        size="medium"
                        variant="secondary"
                        width={232}
                    >
                        Add server or sandbox
                    </Button>
                </div>
                <Button icon="shield" onClick={props.onExplain} size="small" variant="ghost">
                    How is this secured?
                </Button>
            </div>
            <div className="happy-computer-step__list" data-scrollbar-always="">
                {props.computers.length > 0 ? (
                    <ul className="happy-computer-step__rows">
                        {props.computers.map((row) => (
                            <ComputerRow key={row.id} row={row} />
                        ))}
                    </ul>
                ) : runsWork(props.hostOs) ? null : (
                    <p className="happy-computer-step__list-note">
                        Windows can’t run agents’ work yet. Add a server instead.
                    </p>
                )}
            </div>
        </div>
    );
}

/* ---- Dialogs --------------------------------------------------------------- */

/** The dialog's header chip: 28px, 7px corners, 16px glyph. */
function Chip(props: { readonly glyph: IoniconName }) {
    return (
        <span aria-hidden className="happy-computer-step__chip">
            <Ionicon name={props.glyph} size={16} />
        </span>
    );
}

function Script(props: {
    readonly glyph: IoniconName;
    readonly label: string;
    /** Shown with its tag and line, and nothing to copy. */
    readonly off?: string;
    /** The command, or what stands in its place while it is minted or refused. */
    readonly command?: CloudOnboardingComputerCommand;
    readonly note: string;
}) {
    const { command } = props;
    return (
        <section
            className="happy-computer-step__script"
            data-off={props.off === undefined ? undefined : ""}
        >
            <h3 className="happy-computer-step__script-label">
                <span aria-hidden className="happy-computer-step__script-mark">
                    <Ionicon name={props.glyph} size={16} />
                </span>
                {props.label}
                {props.off === undefined ? null : <Tag label={props.off} />}
            </h3>
            {command === undefined ? null : command.kind === "ready" ? (
                <SetupCommand command={command.text} label={props.label.replace(/^Copy /u, "")} />
            ) : (
                <div
                    className="happy-computer-step__command-pending"
                    data-tone={command.kind === "failed" ? "attention" : undefined}
                >
                    {command.kind === "minting" ? (
                        <Spinner label="Making the command" size={14} tone="muted" />
                    ) : (
                        command.error
                    )}
                </div>
            )}
            <p className="happy-computer-step__script-note">{props.note}</p>
        </section>
    );
}

/** The one-time setup command, as the server issued it. macOS and Linux run the same one. */
export type CloudOnboardingComputerCommand =
    | { readonly kind: "minting" }
    | { readonly kind: "ready"; readonly text: string }
    | { readonly kind: "failed"; readonly error: string };

/** The add dialog's height as drawn, at every window size. */
const ADD_HEIGHT = 402;

/**
 * "Add server or sandbox": the commands for other machines, all in view at
 * once: a label, the command with its copy control, and one quiet line each.
 * Its top is set by the height drawn for it, so a refusal longer than one
 * line grows the card down instead of moving it. Nothing drills in and nothing
 * needs confirming, so there is no Back and no button row. A machine that
 * joins shows up in the page's list.
 */
export function CloudOnboardingComputerAddDialog(props: {
    readonly command: CloudOnboardingComputerCommand;
    onClose(): void;
}) {
    return (
        <ModalOverlay className="happy-computer-step-overlay" onDismiss={props.onClose}>
            <Modal
                anchorHeight={ADD_HEIGHT}
                className="happy-computer-step-dialog"
                frame="anchored"
                leading={<Chip glyph="server-outline" />}
                onClose={props.onClose}
                size="medium"
                title="Add server or sandbox"
            >
                <div className="happy-computer-step__scripts">
                    <Script
                        command={props.command}
                        glyph="logo-apple"
                        label="Copy macOS setup script"
                        note="Paste it in Terminal on that Mac. It works once, for an hour."
                    />
                    <Script
                        command={props.command}
                        glyph="logo-tux"
                        label="Copy Linux setup script"
                        note="Works once, for an hour. Needs bubblewrap; AppArmor on Ubuntu 23.10+ can block it."
                    />
                    <Script
                        glyph="logo-windows"
                        label="Copy Windows setup script"
                        note="Windows computers can join, but can’t run agents’ work yet."
                        off="Not yet"
                    />
                    <Script
                        glyph="cube-outline"
                        label="Connect a Happy Sandbox"
                        note="A computer Happy runs for you, on demand."
                        off="Coming soon"
                    />
                </div>
            </Modal>
        </ModalOverlay>
    );
}

type FactIcon = IoniconName;

/** The plain statements under the explainer's diagram; a member reads two more. */
function facts(
    reader: CloudOnboardingComputerReader,
    server: string,
): readonly { readonly icon: FactIcon; readonly lead: string; readonly text: string }[] {
    const all = [
        {
            icon: "download-outline",
            lead: "Installs",
            text: "a signed runner in your user account. No admin password is needed. It starts when you log in.",
        },
        {
            icon: "terminal-outline",
            lead: "Agents can",
            text: "run commands as you, within what auto review allows.",
        },
        {
            icon: "warning-outline",
            lead: "Full access",
            text: "is your choice per conversation. With it, an agent can do anything your account can.",
        },
        {
            icon: "lock-closed-outline",
            lead: "No admin rights.",
            text: "Nothing is installed or run as an administrator. Secrets you attach to an agent reach it.",
        },
        {
            icon: "eye-outline",
            lead: "Leaves your computer:",
            text: `every command and its output, to ${server}. It is not end-to-end encrypted.`,
        },
        {
            icon: "person-outline",
            lead: "Only yours.",
            text: "Only your agents can use it, and you approve each one.",
        },
        {
            icon: "trash-outline",
            lead: "Undo:",
            text: "remove it in Settings › Compute. That revokes it.",
        },
    ] as const;
    if (reader === "owner") return all;
    return [
        ...all,
        {
            icon: "folder-open-outline",
            lead: "Your team reads the folder too.",
            text: `Everyone on ${server} can browse the folder an agent works in, read-only, except an admin bot’s folder.`,
        },
        {
            icon: "shield-outline",
            lead: "People who manage computers",
            text: `on ${server} can see it and remove it.`,
        },
    ];
}

/**
 * The explainer's height at the opening window, measured; its text is fixed,
 * so it is centred on it. A shorter window drops the cards' second lines, and
 * the stylesheet gives that height there.
 */
const EXPLAINER_HEIGHT: Readonly<Record<CloudOnboardingComputerReader, number>> = {
    owner: 431,
    member: 507,
};

/** "How is this secured?": the page's diagram, one to one without the buttons, and the plain statements under it. */
export function CloudOnboardingComputerExplainerDialog(props: {
    readonly reader: CloudOnboardingComputerReader;
    readonly serverName: string;
    onClose(): void;
}) {
    return (
        <ModalOverlay className="happy-computer-step-overlay" onDismiss={props.onClose}>
            <Modal
                anchorHeight={EXPLAINER_HEIGHT[props.reader]}
                className={`happy-computer-step-dialog happy-computer-step-dialog--explainer happy-computer-step-dialog--${props.reader}`}
                frame="anchored"
                leading={<Chip glyph="shield-checkmark-outline" />}
                onClose={props.onClose}
                size="medium"
                title="How is this secured?"
            >
                <div className="happy-computer-step__explainer">
                    <Diagram reader={props.reader} serverName={props.serverName} surface="dialog" />
                    <ul className="happy-computer-step__facts">
                        {facts(props.reader, props.serverName).map((fact) => (
                            <li className="happy-computer-step__fact" key={fact.lead}>
                                <span className="happy-computer-step__fact-icon">
                                    <Ionicon name={fact.icon} size={14} />
                                </span>
                                <span>
                                    <b>{fact.lead}</b> {fact.text}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </Modal>
        </ModalOverlay>
    );
}
