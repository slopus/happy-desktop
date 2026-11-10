import { useState, type ReactNode } from "react";
import {
    happyAgentThinkingLabel,
    type HappyAgentDefaultModelSelection,
    type HappyAgentDefaultModelSnapshot,
} from "happy-desktop-state";
import { AssistantMark, assistantMarkOfProvider } from "../AssistantMark";
import { Button } from "../Button";
import { CopyButton } from "../CopyButton";
import { HAPPY_MOBILE_STORE_URLS } from "../DesktopMobileSetup";
import { FileTreeFamilyIcon, fileTreeFamily } from "../FileTree";
import type { MobileDirectConnectorState } from "../MobileDirectConnection";
import { pairingCountdown } from "../MobilePairingParts";
import { QRCode } from "../QRCode";
import { Select } from "../Select";
import { Spinner } from "../Spinner";
import { Ionicon } from "../vectorIcons/VectorIcon";
import { UiRow, UiRows, type UiRowTone } from "./UiRows";

/*
 * The chat UI components drawn in one language: a hairline frame standing
 * out from the reply by its padding, one 58px row per thing, its words on the
 * reply's edge and its one or two controls on the right, all ending on one
 * edge. A state changes words and controls, never the frame's height.
 */

const choiceKey = (selection: { providerId: string; modelId: string }) =>
    `${selection.providerId}\u0000${selection.modelId}`;

/** `default_model`: the model and effort new chats start on, as one row. */
export function UiDefaultModelRow(props: {
    readonly state: HappyAgentDefaultModelSnapshot;
    readonly onChange?: (selection: HappyAgentDefaultModelSelection) => void;
    readonly spinnerFrame?: number;
}) {
    const state = props.state;
    const shown = state.saving ?? state.current;
    const choice = shown
        ? state.choices.find((candidate) => choiceKey(candidate) === choiceKey(shown))
        : undefined;
    const effort = shown?.effort ?? choice?.defaultEffort;
    const usable = props.onChange !== undefined && !state.loading && state.saving === undefined;
    const vendor = choice ? assistantMarkOfProvider(choice.providerId) : undefined;
    const tone: UiRowTone = state.saveError
        ? "error"
        : state.saving || state.loading
          ? "busy"
          : "quiet";
    const line = state.saveError
        ? state.saveError.message
        : state.saving
          ? "Saving…"
          : state.loading
            ? "Reading the models…"
            : choice
              ? `New chats start on ${choice.providerName}`
              : "New chats start here";
    return (
        <UiRows data-happy-desktop-ui="chat-ui-default-model" label="Default model">
            <UiRow
                controls={
                    <>
                        <Select
                            aria-label="Default model"
                            disabled={!usable || state.choices.length === 0}
                            onValueChange={(value) => {
                                const next = state.choices.find(
                                    (candidate) => choiceKey(candidate) === value,
                                );
                                if (next)
                                    props.onChange?.({
                                        providerId: next.providerId,
                                        modelId: next.modelId,
                                    });
                            }}
                            options={state.choices.map((candidate) => ({
                                value: choiceKey(candidate),
                                label: candidate.modelName,
                            }))}
                            placeholder={state.loading ? "Loading…" : "No models yet"}
                            size="medium"
                            value={choice ? choiceKey(choice) : ""}
                            width={184}
                        />
                        <Select
                            aria-label="Effort"
                            disabled={!usable || !choice || choice.efforts.length < 2}
                            onValueChange={(value) => {
                                const level = choice?.efforts.find(
                                    (candidate) => candidate === value,
                                );
                                if (choice && level)
                                    props.onChange?.({
                                        providerId: choice.providerId,
                                        modelId: choice.modelId,
                                        effort: level,
                                    });
                            }}
                            options={(choice?.efforts ?? []).map((level) => ({
                                value: level,
                                label: happyAgentThinkingLabel(level),
                            }))}
                            placeholder="Effort"
                            size="medium"
                            value={effort ?? ""}
                            width={112}
                        />
                    </>
                }
                line={line}
                mark={
                    vendor ? (
                        <AssistantMark name={vendor} size={20} />
                    ) : (
                        <Ionicon name="sparkles-outline" size={18} />
                    )
                }
                name="Default model"
                tone={tone}
                {...(props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame })}
            />
        </UiRows>
    );
}

/**
 * `phone_app`: Happy on a phone, as one frame: what it is on the left, the
 * two store codes on the right, each captioned with its store.
 *
 *   1 + 12 + 112 code + 6 + 16 caption + 12 + 1 = 160
 */
export function UiPhoneAppCard() {
    return (
        <UiRows data-happy-desktop-ui="chat-ui-phone-app" label="Happy on your phone">
            <div className="happy-chat-card" data-card="phone-app">
                <span className="happy-chat-card__words">
                    <span className="happy-chat-row__mark">
                        <Ionicon name="phone-portrait-outline" size={18} />
                    </span>
                    <span className="happy-chat-card__text">
                        <span className="happy-chat-row__name">Happy on your phone</span>
                        <span className="happy-chat-card__line">
                            {
                                "Point your phone's camera at a code to get the app, then pair it here."
                            }
                        </span>
                    </span>
                </span>
                <span className="happy-chat-card__codes">
                    {(
                        [
                            ["App Store", "logo-apple-appstore", HAPPY_MOBILE_STORE_URLS.ios],
                            [
                                "Google Play",
                                "logo-google-playstore",
                                HAPPY_MOBILE_STORE_URLS.android,
                            ],
                        ] as const
                    ).map(([name, icon, url]) => (
                        <span className="happy-chat-card__code" key={name}>
                            <QRCode data={url} label={`Happy on ${name}`} size={112} />
                            <span className="happy-chat-card__code-name">
                                <Ionicon name={icon} size={14} />
                                {name}
                            </span>
                        </span>
                    ))}
                </span>
            </div>
        </UiRows>
    );
}

/** What the pairing card draws, worked out from the mobile connector and the code this widget holds. */
type PairStep =
    | { readonly kind: "loading" }
    | { readonly kind: "idle"; readonly devices: readonly string[] }
    | { readonly kind: "code"; readonly qr: string; readonly expiresAt: number }
    | { readonly kind: "elsewhere" }
    | {
          readonly kind: "emoji";
          readonly emoji: readonly string[];
          readonly device: string;
          readonly confirmed: boolean;
      }
    | { readonly kind: "paired"; readonly device: string }
    | { readonly kind: "failed"; readonly message: string };

function pairStep(state: MobileDirectConnectorState, ownQr: string | undefined): PairStep {
    if (state.kind === "loading") return { kind: "loading" };
    if (state.kind === "unsupported")
        return { kind: "failed", message: "This Happy Agent can't pair phones directly." };
    if (state.kind === "read-failed") return { kind: "failed", message: state.message };
    const connector = state.connector;
    const devices = connector.devices.map((device) => device.name);
    const pairing = connector.pairing;
    if (pairing === null) return { kind: "idle", devices };
    switch (pairing.status) {
        case "waiting": {
            const qr = ownQr ?? pairing.qr ?? undefined;
            return qr ? { kind: "code", qr, expiresAt: pairing.expiresAt } : { kind: "elsewhere" };
        }
        case "verifying":
            return pairing.emoji
                ? {
                      kind: "emoji",
                      emoji: pairing.emoji,
                      device: pairing.device?.name ?? "Your phone",
                      confirmed: pairing.desktopConfirmed,
                  }
                : { kind: "elsewhere" };
        case "completed":
            return { kind: "paired", device: pairing.device?.name ?? "Your phone" };
        case "cancelled":
            return { kind: "idle", devices };
        case "expired":
            return { kind: "failed", message: "The code expired before a phone used it." };
        case "rejected":
            return { kind: "failed", message: "The emoji didn't match, so nothing was paired." };
        case "failed":
            return { kind: "failed", message: pairing.error ?? "Pairing didn't finish." };
    }
}

/**
 * `phone_pair`: this computer's pairing with a phone, in one frame of one
 * height: the code, the four emoji or the result on the left, what to do on
 * the right, and one control for the step. Phones already paired are counted
 * as accounts are.
 *
 *   1 + 12 + 136 + 12 + 1 = 162
 */
export function UiPhonePairCard(props: {
    readonly connector: MobileDirectConnectorState;
    /** The code `start` answered this widget with, which it alone holds. */
    readonly qr?: string;
    readonly now: number;
    readonly busy?: "start" | "confirm" | "cancel";
    readonly error?: string;
    /** Why this viewer can't pair here; the controls are drawn disabled. */
    readonly unavailable?: string;
    readonly onStart?: () => void;
    readonly onConfirm?: () => void;
    readonly onCancel?: () => void;
    readonly spinnerFrame?: number;
}) {
    const step = pairStep(props.connector, props.qr);
    const spin = props.spinnerFrame === undefined ? {} : { frame: props.spinnerFrame };
    let visual: ReactNode;
    let title = "Pair your phone";
    let line: ReactNode;
    let tone: UiRowTone = "quiet";
    let controls: ReactNode = null;
    const start = (label: string) => (
        <Button
            data-emphasis=""
            data-strong=""
            disabled={props.onStart === undefined || props.unavailable !== undefined}
            loading={props.busy === "start"}
            onClick={() => props.onStart?.()}
            size="medium"
            variant="outline"
        >
            {label}
        </Button>
    );
    switch (step.kind) {
        case "loading":
            visual = <Spinner size={20} tone="muted" variant="arc" {...spin} />;
            line = "Reading this computer's phones…";
            tone = "busy";
            break;
        case "idle":
            visual = <Ionicon name="qr-code-outline" size={40} />;
            line =
                step.devices.length === 0
                    ? "Your phone reaches this computer directly, end to end. Takes a minute."
                    : `${String(step.devices.length)} phone${step.devices.length === 1 ? "" : "s"} paired · ${step.devices.join(", ")}`;
            if (step.devices.length > 0) tone = "done";
            controls = start(step.devices.length === 0 ? "Show pairing code" : "Pair another");
            break;
        case "code":
            visual = <QRCode data={step.qr} label="Pairing code" size={136} />;
            title = "Scan with Happy on your phone";
            line = `Open Happy, tap Pair, and point it here · ${pairingCountdown(step.expiresAt, props.now)}`;
            controls = (
                <Button
                    disabled={props.onCancel === undefined}
                    loading={props.busy === "cancel"}
                    onClick={() => props.onCancel?.()}
                    size="medium"
                    variant="ghost"
                >
                    Cancel
                </Button>
            );
            break;
        case "elsewhere":
            visual = <Spinner size={20} tone="muted" variant="arc" {...spin} />;
            line = "A pairing is open in another window.";
            tone = "busy";
            break;
        case "emoji":
            visual = (
                <span className="happy-chat-card__emoji" aria-label={step.emoji.join(" ")}>
                    {step.emoji.map((emoji, index) => (
                        <span key={index}>{emoji}</span>
                    ))}
                </span>
            );
            title = "Do these match your phone?";
            line = step.confirmed
                ? `Waiting for ${step.device} to confirm…`
                : `${step.device} shows four emoji too. Check all four.`;
            tone = step.confirmed ? "busy" : "quiet";
            controls = step.confirmed ? null : (
                <>
                    <Button
                        disabled={props.onCancel === undefined}
                        onClick={() => props.onCancel?.()}
                        size="medium"
                        variant="ghost"
                    >
                        No
                    </Button>
                    <Button
                        disabled={props.onConfirm === undefined}
                        loading={props.busy === "confirm"}
                        onClick={() => props.onConfirm?.()}
                        size="medium"
                        variant="primary"
                    >
                        They match
                    </Button>
                </>
            );
            break;
        case "paired":
            visual = (
                <span className="happy-chat-card__done">
                    <Ionicon name="checkmark-circle" size={40} />
                </span>
            );
            title = "Phone paired";
            line = `${step.device} reaches this computer now.`;
            tone = "done";
            break;
        case "failed":
            visual = <Ionicon name="qr-code-outline" size={40} />;
            line = step.message;
            tone = "error";
            controls = start("Try again");
            break;
    }
    if (props.error) {
        line = props.error;
        tone = "error";
    } else if (props.unavailable && (step.kind === "idle" || step.kind === "failed")) {
        line = props.unavailable;
        tone = "quiet";
    }
    return (
        <UiRows data-happy-desktop-ui="chat-ui-phone-pair" label="Pair your phone">
            <div className="happy-chat-card" data-card="phone-pair" data-step={step.kind}>
                <span className="happy-chat-card__visual">{visual}</span>
                <span className="happy-chat-card__side">
                    <span className="happy-chat-card__text">
                        <span className="happy-chat-row__name">{title}</span>
                        <span className="happy-chat-card__line" data-tone={tone} role="status">
                            {line}
                        </span>
                    </span>
                    {controls ? (
                        <span className="happy-chat-row__controls happy-chat-card__controls">
                            {controls}
                        </span>
                    ) : null}
                </span>
            </div>
        </UiRows>
    );
}

/** One place an agent names, with what it says about it. PROTOTYPE: `note` and `status` are proposed. */
export type UiFileTreeEntry = {
    readonly path: string;
    readonly note?: string;
    readonly status?: "added" | "modified" | "deleted";
};

type TreeNode = {
    readonly name: string;
    readonly id: string;
    folder: boolean;
    entry?: UiFileTreeEntry;
    readonly children: Map<string, TreeNode>;
};

/**
 * `file_tree`: the places an agent names, as a quiet indented list with
 * hairline guides, in a frame. A folder holding one folder reads as one path
 * (`src/ui`), so a deep path doesn't stair-step. Nothing in it is pressable.
 */
export function UiFileTreeList(props: { readonly entries: readonly UiFileTreeEntry[] }) {
    const root: TreeNode = { name: "", id: "", folder: true, children: new Map() };
    for (const entry of props.entries) {
        const parts = entry.path.split("/").filter((part) => part !== "");
        let at = root;
        parts.forEach((part, index) => {
            let next = at.children.get(part);
            if (!next) {
                next = { name: part, id: `${at.id}/${part}`, folder: false, children: new Map() };
                at.children.set(part, next);
            }
            if (index < parts.length - 1 || entry.path.endsWith("/")) next.folder = true;
            if (index === parts.length - 1) next.entry = entry;
            at = next;
        });
    }
    const rows: ReactNode[] = [];
    const walk = (node: TreeNode, depth: number) => {
        const children = [...node.children.values()].sort(
            (left, right) => Number(right.folder) - Number(left.folder),
        );
        for (const child of children) {
            let shown = child;
            let name = child.name;
            /* Fold a chain of lone folders into one row. */
            while (
                shown.folder &&
                shown.entry === undefined &&
                shown.children.size === 1 &&
                [...shown.children.values()][0]!.folder
            ) {
                shown = [...shown.children.values()][0]!;
                name = `${name}/${shown.name}`;
            }
            const status = shown.entry?.status;
            rows.push(
                <div
                    className="happy-chat-tree__row"
                    data-folder={shown.folder ? "" : undefined}
                    data-status={status}
                    key={shown.id}
                    role="listitem"
                    style={{ paddingLeft: `${String(depth * 20)}px` }}
                >
                    {Array.from({ length: depth }, (_, guide) => (
                        <span
                            aria-hidden="true"
                            className="happy-chat-tree__guide"
                            key={guide}
                            style={{ left: `${String(guide * 20 + 9)}px` }}
                        />
                    ))}
                    <span className="happy-chat-tree__icon">
                        {shown.folder ? (
                            <Ionicon name="folder-outline" size={16} />
                        ) : (
                            <FileTreeFamilyIcon
                                family={fileTreeFamily({ kind: "file", name: shown.name })}
                                size={16}
                            />
                        )}
                    </span>
                    <span className="happy-chat-tree__name">
                        {shown.folder ? `${name}/` : name}
                    </span>
                    {status ? (
                        <span className="happy-chat-tree__status" data-status={status}>
                            {status === "added"
                                ? "new"
                                : status === "deleted"
                                  ? "deleted"
                                  : "changed"}
                        </span>
                    ) : null}
                    {shown.entry?.note ? (
                        <span className="happy-chat-tree__note">{shown.entry.note}</span>
                    ) : null}
                </div>,
            );
            if (shown.folder) walk(shown, depth + 1);
        }
    };
    walk(root, 0);
    return (
        <UiRows data-happy-desktop-ui="chat-ui-file-tree" label="Files">
            <div className="happy-chat-tree" role="list">
                {rows}
            </div>
        </UiRows>
    );
}

/** `invite`: a teammate invite as one row; the code, once made, takes the line. */
export function UiInviteRow(props: {
    readonly roles: readonly { readonly id: string; readonly name: string }[];
    readonly role?: string;
    readonly loading: boolean;
    readonly manage: boolean;
    readonly owner: boolean;
    readonly creating: boolean;
    readonly created?: {
        readonly code: string;
        readonly detail: string;
        readonly message?: string;
    };
    readonly error?: string;
    readonly onCreate?: (roleId: string) => void;
    readonly onCreatedDismiss?: () => void;
    readonly spinnerFrame?: number;
}) {
    const [picked, setPicked] = useState<string | undefined>(undefined);
    const offered = props.roles.filter((role) => role.id !== "owner" || props.owner);
    const roleId =
        [picked, props.role, "member"].find(
            (candidate) => candidate !== undefined && offered.some((role) => role.id === candidate),
        ) ??
        offered[0]?.id ??
        "";
    const roleName = offered.find((role) => role.id === roleId)?.name ?? roleId;
    const usable = props.onCreate !== undefined && props.manage && !props.loading;
    const created = props.created;
    return (
        <UiRows data-happy-desktop-ui="chat-ui-invite" label="Invite a teammate">
            <UiRow
                controls={
                    created ? (
                        <>
                            {created.message ? (
                                <CopyButton
                                    caption="Copy invite"
                                    label="Copy the invite message"
                                    text={created.message}
                                />
                            ) : (
                                <CopyButton
                                    caption="Copy"
                                    label="Copy invite code"
                                    text={created.code}
                                />
                            )}
                            {props.onCreatedDismiss ? (
                                <Button
                                    onClick={props.onCreatedDismiss}
                                    size="medium"
                                    variant="ghost"
                                >
                                    Make another
                                </Button>
                            ) : null}
                        </>
                    ) : props.manage ? (
                        <>
                            <Select
                                aria-label="Role for the invite"
                                disabled={!usable || props.creating}
                                onValueChange={setPicked}
                                options={offered.map((role) => ({
                                    value: role.id,
                                    label: role.name,
                                }))}
                                placeholder={props.loading ? "Loading…" : "No roles"}
                                size="medium"
                                value={roleId}
                                width={128}
                            />
                            <Button
                                data-emphasis=""
                                data-strong=""
                                disabled={!usable || roleId === ""}
                                loading={props.creating}
                                onClick={() => props.onCreate?.(roleId)}
                                size="medium"
                                variant="outline"
                            >
                                Create code
                            </Button>
                        </>
                    ) : null
                }
                line={
                    props.error ??
                    (props.loading ? (
                        "Reading this server's roles…"
                    ) : !props.manage ? (
                        "Only owners and admins invite people here."
                    ) : created ? (
                        <>
                            <code>{created.code}</code> · {created.detail}
                        </>
                    ) : (
                        `Joins as ${roleName} with a one-time code`
                    ))
                }
                mark={<Ionicon name="person-add-outline" size={18} />}
                name="Invite a teammate"
                tone={props.error ? "error" : props.loading ? "busy" : created ? "done" : "quiet"}
                {...(props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame })}
            />
        </UiRows>
    );
}

/** `github_connect`: the viewer's GitHub link as one row; the device code takes the line. */
export function UiGithubRow(props: {
    readonly connectedAs?: string;
    readonly device?: { readonly userCode: string; readonly uri: string };
    readonly usable: boolean;
    readonly busy: boolean;
    readonly error?: string;
    readonly onStart?: () => void;
    readonly onPageOpen?: (url: string) => void;
    readonly spinnerFrame?: number;
}) {
    const device = props.device;
    const connected = props.connectedAs !== undefined;
    return (
        <UiRows data-happy-desktop-ui="chat-ui-github-connect" label="GitHub">
            <UiRow
                controls={
                    connected ? null : device ? (
                        <>
                            <CopyButton label="Copy the GitHub code" text={device.userCode} />
                            <Button
                                data-emphasis=""
                                data-strong=""
                                disabled={props.onPageOpen === undefined}
                                onClick={() => props.onPageOpen?.(device.uri)}
                                size="medium"
                                variant="primary"
                            >
                                Open GitHub
                            </Button>
                        </>
                    ) : (
                        <Button
                            disabled={!props.usable || props.busy}
                            loading={props.busy}
                            onClick={() => props.onStart?.()}
                            size="medium"
                            variant="outline"
                        >
                            Link GitHub
                        </Button>
                    )
                }
                line={
                    connected
                        ? `Linked as ${props.connectedAs}`
                        : (props.error ??
                          (device ? (
                              <>
                                  Enter <code>{device.userCode}</code> on GitHub · Happy notices
                                  when you approve
                              </>
                          ) : props.usable ? (
                              "So agents can work with your repositories"
                          ) : (
                              "You can't link GitHub from here"
                          )))
                }
                mark={<Ionicon name="logo-github" size={20} />}
                name="GitHub"
                tone={connected ? "done" : props.error ? "error" : device ? "busy" : "quiet"}
                {...(props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame })}
            />
        </UiRows>
    );
}

/**
 * `compute_join`: a pool as one row. Its machines are counted and named on
 * the line, live, so a machine joining changes words, not the frame; the join
 * command, once made, takes the line until a machine is joining.
 */
export function UiComputeJoinRows(props: {
    readonly pool: string;
    readonly commands?: readonly string[];
    readonly usable: boolean;
    readonly busy: boolean;
    readonly error?: string;
    readonly machines?: {
        readonly loading: boolean;
        readonly machines: readonly {
            readonly id: string;
            readonly name: string;
            readonly status: string;
        }[];
        readonly error?: string;
    };
    readonly onCreate?: () => void;
    readonly spinnerFrame?: number;
}) {
    const commands = props.commands;
    const machines = props.machines?.machines ?? [];
    const joining = machines.find((machine) => machine.status === "enrolling");
    const online = machines.filter((machine) => machine.status === "online");
    const count = `${String(machines.length)} machine${machines.length === 1 ? "" : "s"}`;
    const line: ReactNode =
        props.error ??
        props.machines?.error ??
        (joining ? (
            `${joining.name} is joining…`
        ) : commands ? (
            <code title={commands[0]}>{commands[0]}</code>
        ) : props.machines?.loading ? (
            "Reading the pool's machines…"
        ) : machines.length === 0 ? (
            props.usable ? (
                "No machines yet · add one so agents can work on it"
            ) : (
                "No machines yet"
            )
        ) : (
            `${count} · ${online.map((machine) => machine.name).join(", ") || "none online"}`
        ));
    const tone: UiRowTone =
        props.error || props.machines?.error
            ? "error"
            : joining || props.machines?.loading
              ? "busy"
              : online.length > 0 && !commands
                ? "done"
                : "quiet";
    return (
        <UiRows data-happy-desktop-ui="chat-ui-compute-join" label={props.pool}>
            <UiRow
                controls={
                    commands ? (
                        <CopyButton
                            caption="Copy command"
                            label="Copy the join commands"
                            text={commands.join("\n")}
                        />
                    ) : props.usable ? (
                        <Button
                            disabled={props.busy}
                            loading={props.busy}
                            onClick={() => props.onCreate?.()}
                            size="medium"
                            variant="outline"
                        >
                            Add a machine
                        </Button>
                    ) : null
                }
                line={line}
                mark={<Ionicon name="hardware-chip-outline" size={18} />}
                name={props.pool}
                tone={tone}
                {...(props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame })}
            />
        </UiRows>
    );
}
