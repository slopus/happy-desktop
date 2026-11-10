import { useState } from "react";
import {
    UserError,
    type HappyAgentDefaultModelSelection,
    type HappyAgentDefaultModelSnapshot,
    type ProviderCli,
} from "happy-desktop-state";
import { ChatSettingsFigure, type ChatInviteFigureProps } from "../ChatActionFigures";
import type { MobileDirectConnectorState } from "../MobileDirectConnection";
import {
    UiComputeJoinRows,
    UiDefaultModelRow,
    UiGithubRow,
    UiInviteRow,
    UiPhonePairCard,
} from "./UiCards";
import { UiProviderSignInRow } from "./UiProviderSignInRow";
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

/** The actions that sign the row's AI in here once accepted: the row has been used. */
const SIGN_IN_USED: ReadonlySet<string> = new Set([
    "provider_sign_in.sign_in",
    "provider_sign_in.submit_code",
    "provider_sign_in.submit_token",
]);

/** `provider_sign_in`: one AI's install and sign-in, from the server's provider CLI state, as one row. */
export function UiProviderSignIn(props: {
    readonly provider: string;
    /** The program as the server last described it; absent until read. */
    readonly cli?: ProviderCli;
    /** Adds another account instead of signing the default one in. */
    readonly account?: "new";
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
    const may = (type: string) => live && control.allowed(type);
    const start =
        props.cli?.installation.status === "missing"
            ? "provider_sign_in.install"
            : "provider_sign_in.sign_in";
    return (
        <UiProviderSignInRow
            {...(props.account ? { account: props.account } : {})}
            {...(props.cli ? { cli: props.cli } : {})}
            {...(control.error ? { error: control.error } : {})}
            {...(may("provider_sign_in.cancel")
                ? { onCancel: () => void uiWidgetSend(control, "provider_sign_in.cancel") }
                : {})}
            {...(may("provider_sign_in.submit_code")
                ? {
                      onCode: (code: string) =>
                          void uiWidgetSend(control, "provider_sign_in.submit_code", { code }),
                  }
                : {})}
            {...(props.onPageOpen ? { onPageOpen: props.onPageOpen } : {})}
            {...(may(start) ? { onSignIn: () => void uiWidgetSend(control, start) } : {})}
            {...(may("provider_sign_in.submit_token")
                ? {
                      onToken: (token: string) =>
                          void uiWidgetSend(control, "provider_sign_in.submit_token", { token }),
                  }
                : {})}
            provider={props.provider}
            requesting={busyOf(control)}
            used={
                control.attempt?.outcome.status === "accepted" &&
                SIGN_IN_USED.has(control.attempt.action.type)
            }
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
        <UiDefaultModelRow
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
        <UiPhonePairCard
            {...(busy === "phone_pair.start"
                ? { busy: "start" as const }
                : busy === "phone_pair.confirm"
                  ? { busy: "confirm" as const }
                  : busy === "phone_pair.cancel"
                    ? { busy: "cancel" as const }
                    : {})}
            connector={shown}
            {...(control.error ? { error: control.error } : {})}
            now={props.now}
            onCancel={() => {
                if (pairingId) void uiWidgetSend(control, "phone_pair.cancel", { pairingId });
            }}
            onConfirm={() => {
                if (pairingId) void uiWidgetSend(control, "phone_pair.confirm", { pairingId });
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
            {...(ours ? { qr: started.pairing } : {})}
            {...(control.act === undefined || !control.allowed("phone_pair.start")
                ? { unavailable: "Only this computer's owner can pair a phone here." }
                : {})}
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
        <UiInviteRow
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
 * the link, and once the reader's own GitHub credential appears the card says
 * so and the code goes.
 *
 *   24 head · 8 · 36 controls · 8 · 20 line = 96
 */
export function UiGithubConnect(props: {
    readonly control: UiWidgetControl;
    readonly onPageOpen?: (url: string) => void;
    /** The account the reader's own GitHub credential signs in as, once there is one. */
    readonly connectedAs?: string;
}) {
    const [device, setDevice] = useState<{ readonly userCode: string; readonly uri: string }>();
    const control = props.control;
    const usable = control.act !== undefined && control.allowed("github_connect.device_start");
    const busy = busyOf(control);
    return (
        <UiGithubRow
            busy={busy}
            {...(props.connectedAs !== undefined ? { connectedAs: props.connectedAs } : {})}
            {...(device ? { device } : {})}
            {...(control.error ? { error: control.error } : {})}
            onStart={() => {
                void uiWidgetSend(control, "github_connect.device_start").then((response) => {
                    const result = response?.result;
                    if (
                        typeof result?.["userCode"] === "string" &&
                        typeof result["verificationUri"] === "string"
                    )
                        setDevice({ userCode: result["userCode"], uri: result["verificationUri"] });
                });
            }}
            {...(props.onPageOpen ? { onPageOpen: props.onPageOpen } : {})}
            usable={usable}
        />
    );
}

/** A pool's machines as the join card lists them, from its owner's live store. */
export type UiComputeJoinPool = {
    readonly loading: boolean;
    /** The pool's own name, once read. */
    readonly name?: string;
    /** Revoked machines left out. */
    readonly machines: readonly {
        readonly id: string;
        readonly name: string;
        readonly status: string;
    }[];
    readonly error?: string;
};

/**
 * `compute_join`: commands that add a machine to a compute pool, and the
 * pool's machines as they join. The commands are a secret result, shown here
 * alone; the first one is drawn and every one is copied.
 *
 *   24 head · 8 · 36 controls · 8 · 20 line · 8 · 60 machines (three rows, then scrolling) = 164
 */
export function UiComputeJoin(props: {
    readonly pool?: string;
    /** The pool's machines, live; absent where nothing follows them. */
    readonly machines?: UiComputeJoinPool;
    readonly control: UiWidgetControl;
}) {
    const [commands, setCommands] = useState<readonly string[]>();
    const control = props.control;
    const usable = control.act !== undefined && control.allowed("compute_join.create");
    const busy = busyOf(control);
    const poolName = props.machines?.name ?? props.pool ?? "Add a computer";
    return (
        <UiComputeJoinRows
            busy={busy}
            {...(commands ? { commands } : {})}
            {...(control.error ? { error: control.error } : {})}
            {...(props.machines ? { machines: props.machines } : {})}
            onCreate={() => {
                void uiWidgetSend(control, "compute_join.create").then((response) => {
                    const list = response?.result?.["commands"];
                    if (Array.isArray(list) && list.every((item) => typeof item === "string"))
                        setCommands(list as string[]);
                });
            }}
            pool={poolName}
            usable={usable}
        />
    );
}
