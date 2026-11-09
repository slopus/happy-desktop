import { useState, type ReactNode } from "react";
import {
    UserError,
    type HappyAgentDefaultModelSelection,
    type HappyAgentDefaultModelSnapshot,
    type ProviderCli,
} from "happy-desktop-state";
import { Button } from "../Button";
import {
    ChatDefaultModelFigure,
    ChatInviteFigure,
    ChatProviderCliFigure,
    ChatSettingsFigure,
    type ChatInviteFigureProps,
} from "../ChatActionFigures";
import { CopyButton } from "../CopyButton";
import {
    MobileDirectPairingPanel,
    type MobileDirectConnectorState,
} from "../MobileDirectConnection";
import { Spinner } from "../Spinner";
import { Ionicon } from "../vectorIcons/VectorIcon";
import { uiWidgetSend, type UiWidgetControl } from "./UiWidgetControl";

/*
 * The live chat UI widgets. Each draws one figure from state its owner reads
 * live from the server, and sends every click through the component's own
 * actions, so the conversation's controls apply to it. A secret result — a
 * pairing code, an invite code, a device code, join commands — lives in the
 * widget's own state, shown here and nowhere else, and goes when it does.
 */

const busyOf = (control: UiWidgetControl): boolean =>
    control.pending !== undefined || control.attempt?.outcome.status === "pending";

/** `provider_sign_in`: one AI's install and sign-in, from the server's provider CLI state. */
export function UiProviderSignIn(props: {
    readonly provider: string;
    /** The program as the server last described it; absent until read. */
    readonly cli?: ProviderCli;
    /** The server doesn't run provider CLIs: the way into its providers' Settings instead. */
    readonly unsupported?: boolean;
    readonly control: UiWidgetControl;
    /** Opens a vendor's sign-in page in the person's browser. */
    readonly onPageOpen?: (url: string) => void;
    readonly spinnerFrame?: number;
}) {
    const control = props.control;
    if (props.unsupported) return <ChatSettingsFigure type="providers" />;
    const live = control.act !== undefined;
    const may = (type: string) => (live && control.allowed(type) ? true : undefined);
    return (
        <ChatProviderCliFigure
            cliId={props.provider}
            {...(props.cli ? { cli: props.cli } : {})}
            {...(control.error ? { error: control.error } : {})}
            {...(may("provider_sign_in.install")
                ? { onInstall: () => void uiWidgetSend(control, "provider_sign_in.install") }
                : {})}
            {...(may("provider_sign_in.sign_in")
                ? {
                      onSignIn: () => void uiWidgetSend(control, "provider_sign_in.sign_in"),
                      onUse: () => void uiWidgetSend(control, "provider_sign_in.sign_in"),
                  }
                : {})}
            {...(may("provider_sign_in.submit_code")
                ? {
                      onCodeSend: (code: string) =>
                          void uiWidgetSend(control, "provider_sign_in.submit_code", { code }),
                  }
                : {})}
            {...(may("provider_sign_in.submit_token")
                ? {
                      onTokenSend: (token: string) =>
                          void uiWidgetSend(control, "provider_sign_in.submit_token", { token }),
                  }
                : {})}
            {...(may("provider_sign_in.cancel")
                ? { onCancel: () => void uiWidgetSend(control, "provider_sign_in.cancel") }
                : {})}
            {...(props.onPageOpen ? { onPageOpen: props.onPageOpen } : {})}
            requesting={busyOf(control)}
            {...(props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame })}
        />
    );
}

/** `default_model`: the model new chats start on, changed with `default_model.set`. */
export function UiDefaultModel(props: {
    readonly state: HappyAgentDefaultModelSnapshot;
    readonly control: UiWidgetControl;
    readonly spinnerFrame?: number;
}) {
    const { state, control } = props;
    const pending = control.pending?.payload as HappyAgentDefaultModelSelection | undefined;
    const usable = control.act !== undefined && control.allowed("default_model.set");
    return (
        <ChatDefaultModelFigure
            {...(usable
                ? {
                      onChange: (selection: HappyAgentDefaultModelSelection) => {
                          const effort =
                              selection.effort ??
                              state.choices.find(
                                  (choice) =>
                                      choice.providerId === selection.providerId &&
                                      choice.modelId === selection.modelId,
                              )?.defaultEffort;
                          if (effort === undefined) return;
                          void uiWidgetSend(control, "default_model.set", {
                              providerId: selection.providerId,
                              modelId: selection.modelId,
                              effort,
                          });
                      },
                  }
                : {})}
            state={{
                ...state,
                ...(pending ? { saving: pending } : {}),
                ...(control.error ? { saveError: new UserError(control.error) } : {}),
            }}
            {...(props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame })}
        />
    );
}

type Pairing = { readonly pairingId: string; readonly pairing: string };

/**
 * `phone_pair`: this computer's pairing with a phone. `start` answers with the
 * code, which this widget alone holds; the emoji and the outcome come from
 * the server's mobile connector.
 */
export function UiPhonePair(props: {
    readonly connector: MobileDirectConnectorState;
    readonly now: number;
    readonly control: UiWidgetControl;
}) {
    const [started, setStarted] = useState<Pairing | undefined>(undefined);
    const control = props.control;
    const connector = props.connector;
    const pairing = connector.kind === "ready" ? connector.connector.pairing : null;
    const ours = started !== undefined && pairing?.id === started.pairingId;
    const shown: MobileDirectConnectorState =
        connector.kind === "ready" && pairing !== null
            ? {
                  kind: "ready",
                  connector: {
                      ...connector.connector,
                      pairing: { ...pairing, qr: ours ? started.pairing : null },
                  },
              }
            : connector;
    const busy = control.pending?.type;
    const pairingId = pairing?.id;
    return (
        <MobileDirectPairingPanel
            cancelling={busy === "phone_pair.cancel"}
            codeSize={204}
            confirming={busy === "phone_pair.confirm"}
            connector={shown}
            density="compact"
            now={props.now}
            onConfirm={() => {
                if (pairingId) void uiWidgetSend(control, "phone_pair.confirm", { pairingId });
            }}
            onReject={() => {
                if (pairingId) void uiWidgetSend(control, "phone_pair.cancel", { pairingId });
            }}
            onStart={() => {
                void uiWidgetSend(control, "phone_pair.start").then((response) => {
                    const result = response?.result;
                    if (
                        typeof result?.["pairingId"] === "string" &&
                        typeof result["pairing"] === "string"
                    )
                        setStarted({ pairingId: result["pairingId"], pairing: result["pairing"] });
                });
            }}
            starting={busy === "phone_pair.start"}
            {...(control.act === undefined || !control.allowed("phone_pair.start")
                ? { unavailable: "Only this computer's owner can pair a phone here." }
                : {})}
            {...(control.error ? { actionError: control.error } : {})}
        />
    );
}

/**
 * `invite`: a teammate invite. `invite.create` answers with the code, which
 * this widget alone holds, shown until it is dismissed or the widget goes.
 */
export function UiInvite(props: {
    readonly role?: string;
    readonly figure: Pick<ChatInviteFigureProps, "loading" | "roles" | "owner">;
    /** Words for a code just made: what it lets someone do, and the invite to copy. */
    readonly createdWords: (created: {
        readonly code: string;
        readonly roleId: string;
        readonly expiresAt: number;
        readonly serverName: string | null;
    }) => { readonly detail: string; readonly message?: string };
    readonly control: UiWidgetControl;
    readonly spinnerFrame?: number;
}) {
    const [created, setCreated] = useState<{
        readonly code: string;
        readonly detail: string;
        readonly message?: string;
    }>();
    const control = props.control;
    const manage = control.allowed("invite.create");
    return (
        <ChatInviteFigure
            {...props.figure}
            creating={control.pending?.type === "invite.create"}
            {...(created ? { created } : {})}
            {...(control.error ? { error: control.error } : {})}
            manage={manage}
            {...(control.act && manage
                ? {
                      onCreate: (roleId: string) => {
                          void uiWidgetSend(control, "invite.create", { role: roleId }).then(
                              (response) => {
                                  const result = response?.result;
                                  if (typeof result?.["code"] !== "string") return;
                                  const code = result["code"];
                                  setCreated({
                                      code,
                                      ...props.createdWords({
                                          code,
                                          roleId,
                                          expiresAt: Number(result["expiresAt"]),
                                          serverName:
                                              typeof result["serverName"] === "string"
                                                  ? result["serverName"]
                                                  : null,
                                      }),
                                  });
                              },
                          );
                      },
                      onCreatedDismiss: () => setCreated(undefined),
                  }
                : {})}
            {...(props.role ? { role: props.role } : {})}
            {...(props.spinnerFrame === undefined ? {} : { spinnerFrame: props.spinnerFrame })}
        />
    );
}

/**
 * `github_connect`: links the viewer's own GitHub account by device code. The
 * code `device_start` answers with is shown here alone; the server follows
 * the link and says when it's done.
 *
 *   24 head · 8 · 36 controls · 8 · 20 line = 96
 */
export function UiGithubConnect(props: {
    readonly control: UiWidgetControl;
    readonly onPageOpen?: (url: string) => void;
}) {
    const [device, setDevice] = useState<{ readonly userCode: string; readonly uri: string }>();
    const control = props.control;
    const usable = control.act !== undefined && control.allowed("github_connect.device_start");
    const busy = busyOf(control);
    const line =
        control.error ??
        (device
            ? "Enter this code on GitHub. Happy notices when you've approved it."
            : usable
              ? "Link your GitHub account so agents can work with your repositories."
              : "You can't link GitHub from here.");
    return (
        <UiFigure error={control.error !== undefined} line={line} title="Connect GitHub">
            {device ? (
                <>
                    <span className="happy-chat-figure__invite-code">{device.userCode}</span>
                    <CopyButton
                        caption="Copy"
                        label="Copy the GitHub code"
                        text={device.userCode}
                    />
                    <Button
                        disabled={props.onPageOpen === undefined}
                        onClick={() => props.onPageOpen?.(device.uri)}
                        size="medium"
                        variant="outline"
                    >
                        Open GitHub
                    </Button>
                </>
            ) : (
                <Button
                    data-emphasis=""
                    data-strong=""
                    disabled={!usable || busy}
                    loading={busy}
                    onClick={() => {
                        void uiWidgetSend(control, "github_connect.device_start").then(
                            (response) => {
                                const result = response?.result;
                                if (
                                    typeof result?.["userCode"] === "string" &&
                                    typeof result["verificationUri"] === "string"
                                )
                                    setDevice({
                                        userCode: result["userCode"],
                                        uri: result["verificationUri"],
                                    });
                            },
                        );
                    }}
                    size="medium"
                    variant="outline"
                >
                    Link GitHub
                </Button>
            )}
        </UiFigure>
    );
}

/**
 * `compute_join`: commands that add a machine to a compute pool. They are a
 * secret result, shown here alone; the first one is drawn and every one is
 * copied.
 *
 *   24 head · 8 · 36 controls · 8 · 20 line = 96
 */
export function UiComputeJoin(props: {
    readonly pool?: string;
    readonly control: UiWidgetControl;
}) {
    const [commands, setCommands] = useState<readonly string[]>();
    const control = props.control;
    const usable = control.act !== undefined && control.allowed("compute_join.create");
    const busy = busyOf(control);
    const line =
        control.error ??
        (commands
            ? "Run this on the machine to add it. It works once, for a short while."
            : usable
              ? `Add a machine${props.pool ? ` to ${props.pool}` : ""} so agents can work on it.`
              : "Owners and admins add machines here.");
    return (
        <UiFigure error={control.error !== undefined} line={line} title="Add a computer">
            {commands ? (
                <>
                    <code className="happy-chat-figure__command" title={commands[0]}>
                        {commands[0]}
                    </code>
                    <CopyButton
                        caption="Copy"
                        label="Copy the join commands"
                        text={commands.join("\n")}
                    />
                </>
            ) : (
                <Button
                    data-emphasis=""
                    data-strong=""
                    disabled={!usable || busy}
                    loading={busy}
                    onClick={() => {
                        void uiWidgetSend(control, "compute_join.create").then((response) => {
                            const list = response?.result?.["commands"];
                            if (
                                Array.isArray(list) &&
                                list.every((item) => typeof item === "string")
                            )
                                setCommands(list as string[]);
                        });
                    }}
                    size="medium"
                    variant="outline"
                >
                    Make join command
                </Button>
            )}
        </UiFigure>
    );
}

/** A figure's head, its controls, and one status line under them. */
function UiFigure(props: {
    readonly title: string;
    readonly line: string;
    readonly error: boolean;
    readonly children: ReactNode;
    readonly pending?: boolean;
}) {
    return (
        <div
            className="happy-chat-figure happy-chat-figure--invite"
            data-happy-desktop-ui="chat-ui-figure"
        >
            <div className="happy-chat-figure__head">
                <span className="happy-chat-figure__name">{props.title}</span>
            </div>
            <div className="happy-chat-figure__controls">{props.children}</div>
            <div
                className="happy-chat-figure__line"
                data-error={props.error ? "" : undefined}
                role="status"
            >
                <span className="happy-chat-figure__mark">
                    {props.error ? (
                        <Ionicon name="alert-circle" size={16} />
                    ) : props.pending ? (
                        <Spinner size={16} />
                    ) : (
                        <Ionicon name="information-circle-outline" size={16} />
                    )}
                </span>
                <span className="happy-chat-figure__text">{props.line}</span>
            </div>
        </div>
    );
}
