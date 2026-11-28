import { useSyncExternalStore } from "react";
import {
    type HappyAgentCloudProviderAddFlow,
    type HappyAgentCloudProvidersSnapshot,
    type HappyAgentCloudProvidersStore,
    type HappyAgentOnboardingGate,
    type HappyAgentOnboardingSnapshot,
    type HappyAgentOnboardingStore,
    type HappyAgentPaymentsStore,
    type HappyAgentProvidersSnapshot,
    type HappyAgentProvidersStore,
    happyAgentMoneyExponent,
    type HappyAgentPluginsStore,
    type HappyAgentProfileSnapshot,
    type HappyAgentProfileStore,
} from "happy-desktop-state";
import {
    CloudOnboardingProviderDialog,
    CloudOnboardingScreen,
    type CloudOnboardingProviderDialogProvider,
    type CloudOnboardingProviderRow,
    type CloudOnboardingProviderWay,
    type CloudOnboardingScreenProps,
    type ThemeMode,
} from "happy-desktop-ui";
import { AppCustomProviderDialog } from "../views/AppHappyAgentSettingsView";
import { methodText, moneyText, PAYMENT_PRESETS } from "../views/AppPaymentsSettings";
import { cloudOnboardingToolsDialog, cloudOnboardingToolsView } from "./AppCloudOnboardingTools";

const STEP_LABELS: Readonly<Record<HappyAgentOnboardingGate["kind"], string>> = {
    profile: "Profile",
    avatar: "Photo",
    adminBot: "Admin bot",
    inference: "AI",
    plugins: "Tools",
    teammates: "Team",
    mobileApp: "Phone",
    paymentMethod: "Payment",
    payment: "Credit",
    unknown: "More",
};

/**
 * The credential vendors each AI row counts as its accounts: a plan and an API
 * key of the same family are one row. A custom endpoint is counted from the
 * team's own providers instead.
 */
const ROW_VENDORS: Readonly<Record<CloudOnboardingProviderDialogProvider, readonly string[]>> = {
    chatgpt: ["codex", "openai"],
    claude: ["claude-code", "anthropic"],
    xai: ["grok"],
    bedrock: ["bedrock"],
};

const noopSubscribe = () => () => undefined;
const noSnapshot = () => undefined;

/** Why the plugins step's Continue waits: the required plugins still to connect, by name. */
function pluginsFootnote(
    gate: Extract<HappyAgentOnboardingGate, { readonly kind: "plugins" }>,
): string {
    const left = gate.plugins.filter((plugin) => plugin.required && !plugin.active);
    if (left.length === 0) return "Connect a plugin to continue.";
    const names = left.map((plugin) => plugin.name);
    const list =
        names.length === 1
            ? names[0]!
            : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return `Connect ${list} to continue.`;
}

/** The ways this server offers to connect a provider, plan first. */
function providerWays(
    provider: CloudOnboardingProviderDialogProvider,
    providers: HappyAgentCloudProvidersSnapshot,
): readonly CloudOnboardingProviderWay[] {
    switch (provider) {
        case "chatgpt":
            return providers.signIns.has("codex") ? ["plan", "key"] : ["key"];
        case "claude":
            return [
                ...(providers.signIns.has("claude") ? (["plan"] as const) : []),
                ...(providers.setupToken ? (["token"] as const) : []),
                "key",
            ];
        case "xai":
        case "bedrock":
            return ["key"];
    }
}

/** The store's flow for one way of one provider. */
function providerFlow(
    provider: CloudOnboardingProviderDialogProvider,
    way: CloudOnboardingProviderWay,
): HappyAgentCloudProviderAddFlow {
    if (way === "plan")
        return provider === "chatgpt" ? { kind: "chatgpt" } : { kind: "claude", setupToken: false };
    if (way === "token") return { kind: "claude", setupToken: true };
    const vendor = (
        { chatgpt: "openai", claude: "anthropic", xai: "grok", bedrock: "bedrock" } as const
    )[provider];
    return { kind: "apiKey", vendor };
}

/** The provider and way an open flow is, or nothing for the store's chooser. */
function flowProvider(flow: HappyAgentCloudProviderAddFlow):
    | {
          readonly provider: CloudOnboardingProviderDialogProvider;
          readonly way: CloudOnboardingProviderWay;
      }
    | undefined {
    switch (flow.kind) {
        case "choose":
            return undefined;
        case "chatgpt":
            return { provider: "chatgpt", way: "plan" };
        case "claude":
            return { provider: "claude", way: flow.setupToken ? "token" : "plan" };
        case "apiKey":
            return {
                provider: (
                    {
                        openai: "chatgpt",
                        anthropic: "claude",
                        grok: "xai",
                        bedrock: "bedrock",
                    } as const
                )[flow.vendor],
                way: "key",
            };
    }
}

/**
 * Opens one provider's dialog on a way, kept where `to` says. A plan's sign-in
 * starts at once, so its code or page is there when the dialog is.
 */
function providerOpen(
    store: HappyAgentCloudProvidersStore,
    provider: CloudOnboardingProviderDialogProvider,
    way: CloudOnboardingProviderWay,
    to: "team" | "private",
): void {
    store.addOpen({ flow: providerFlow(provider, way), to });
    if (way === "plan") store.signInStart();
}

/**
 * The AI step's rows: each provider with how many of its accounts are
 * connected, the reader's own and the team's. Bedrock's keys can only be the
 * team's, so it is offered only to a reader who may add for the team.
 */
function providerRows(
    providers: HappyAgentCloudProvidersSnapshot | undefined,
    store: HappyAgentCloudProvidersStore | undefined,
    custom: HappyAgentProvidersSnapshot | undefined,
    customCreate: (() => void) | undefined,
): readonly CloudOnboardingProviderRow[] {
    const connections = (providers?.connections ?? []).filter(
        (connection) => connection.source === "tenant",
    );
    const accounts = (vendors: readonly string[]): number =>
        connections.reduce(
            (count, connection) =>
                count +
                (connection.credentials
                    ? connection.credentials.filter((credential) =>
                          vendors.includes(credential.vendor),
                      ).length
                    : connection.vendors.some((vendor) => vendors.includes(vendor))
                      ? 1
                      : 0),
            0,
        );
    const to = providers?.teamAllowed ? "team" : "private";
    const row = (provider: CloudOnboardingProviderDialogProvider): CloudOnboardingProviderRow => ({
        id: provider,
        accounts: accounts(ROW_VENDORS[provider]),
        ...(store && providers
            ? {
                  onOpen: () =>
                      providerOpen(store, provider, providerWays(provider, providers)[0]!, to),
              }
            : {}),
    });
    return [
        row("chatgpt"),
        row("claude"),
        row("xai"),
        ...(providers?.teamAllowed ? [row("bedrock")] : []),
        {
            id: "custom",
            accounts: (custom?.providers ?? []).filter((provider) => provider.custom).length,
            ...(customCreate ? { onOpen: customCreate } : {}),
        },
    ];
}

/**
 * A Happy Cloud server's onboarding: the gate the server puts on screen, drawn
 * by `CloudOnboardingScreen`, with each step's action handed to the store that
 * owns it. Which gate shows and whether it may be skipped is the server's.
 */
export function AppCloudOnboarding(props: {
    readonly store: HappyAgentOnboardingStore;
    readonly snapshot: HappyAgentOnboardingSnapshot;
    readonly profile: HappyAgentProfileStore;
    readonly profileSnapshot: HappyAgentProfileSnapshot;
    readonly cloudProviders?: () => HappyAgentCloudProvidersStore | undefined;
    readonly plugins?: () => HappyAgentPluginsStore | undefined;
    readonly payments?: () => HappyAgentPaymentsStore | undefined;
    readonly providers?: () => HappyAgentProvidersStore;
    readonly appearance: ThemeMode;
    readonly serverLabel?: string;
    readonly placeholderSeed: string;
    readonly onExternalOpen?: (url: string) => void;
}) {
    const flow = props.snapshot.flow!;
    const gate = flow.current!;
    const providersStore = gate.kind === "inference" ? props.cloudProviders?.() : undefined;
    const providers = useSyncExternalStore(
        providersStore?.subscribe ?? noopSubscribe,
        providersStore?.get ?? noSnapshot,
        providersStore?.get ?? noSnapshot,
    );
    // The team's own providers, for the Custom tile, where the reader may add one.
    const customStore = providersStore ? props.providers?.() : undefined;
    const custom = useSyncExternalStore(
        customStore?.subscribe ?? noopSubscribe,
        customStore?.get ?? noSnapshot,
        customStore?.get ?? noSnapshot,
    );
    const customCreate =
        customStore && custom?.customProvidersManageable
            ? () => {
                  providersStore?.addClose();
                  customStore.customProviderCreateOpen();
              }
            : undefined;
    const pluginsStore = gate.kind === "plugins" ? props.plugins?.() : undefined;
    const plugins = useSyncExternalStore(
        pluginsStore?.subscribe ?? noopSubscribe,
        pluginsStore?.get ?? noSnapshot,
        pluginsStore?.get ?? noSnapshot,
    );
    const paymentsStore =
        gate.kind === "paymentMethod" || gate.kind === "payment" ? props.payments?.() : undefined;
    const payments = useSyncExternalStore(
        paymentsStore?.subscribe ?? noopSubscribe,
        paymentsStore?.get ?? noSnapshot,
        paymentsStore?.get ?? noSnapshot,
    );
    const { store, profile, profileSnapshot } = props;
    const pending = flow.pending === gate.id;
    const done = gate.status === "done" || gate.status === "skipped";
    const proceed = {
        label: "Continue",
        busy: pending,
        disabled: !done,
        onSelect: () => store.gateContinue(gate.id),
    };
    const skip =
        gate.requirement === "optional" && gate.status === "open" && gate.canComplete
            ? { disabled: flow.pending !== undefined, onSelect: () => store.gateContinue(gate.id) }
            : undefined;
    const open = (url: string) =>
        props.onExternalOpen ? props.onExternalOpen(url) : window.open(url, "_blank", "noopener");
    const tools =
        gate.kind === "plugins"
            ? cloudOnboardingToolsView({
                  gate,
                  plugins,
                  // A server whose health does not say it serves plugins has no
                  // store: its plugins are listed from the gate, not offered.
                  connectable: pluginsStore !== undefined,
                  snapshot: props.snapshot,
                  store,
                  open,
              })
            : undefined;
    const screen = ((): Pick<
        CloudOnboardingScreenProps,
        "view" | "action" | "skip" | "footnote"
    > => {
        if (flow.stance && flow.stance !== "act")
            return {
                view: {
                    kind: "notice",
                    reason: flow.stance,
                    step: STEP_LABELS[gate.kind],
                    owners: flow.owners,
                },
            };
        const photo = {
            busy: profileSnapshot.saving,
            loading: profileSnapshot.loading,
            name: profileSnapshot.name,
            placeholderSeed: props.placeholderSeed,
            photoOpening: profileSnapshot.photoActivity === "opening",
            ...(profileSnapshot.photoCrop ? { photoCrop: profileSnapshot.photoCrop } : {}),
            ...(profileSnapshot.photoError ? { photoError: profileSnapshot.photoError } : {}),
            onNameChange: profile.displayNameUpdate,
            onPhotoCropCancel: profile.photoCropCancel,
            onPhotoCropConfirm: (region: Parameters<typeof profile.photoCropConfirm>[0]) =>
                void profile.photoCropConfirm(region),
        };
        switch (gate.kind) {
            case "profile": {
                const create = async () => {
                    // Back on a saved profile with nothing changed, there is nothing to send.
                    if (
                        !profileSnapshot.saved ||
                        profileSnapshot.dirty ||
                        profileSnapshot.photoStaged
                    )
                        await profile.profileCreate();
                    if (!profile.get().saveError) store.gateContinue(gate.id);
                };
                const named = profileSnapshot.name.trim() !== "";
                return {
                    view: {
                        kind: "profile",
                        ask: "profile",
                        ...photo,
                        ...((profileSnapshot.photoStaged ?? profileSnapshot.photo)
                            ? {
                                  photoUrl: (profileSnapshot.photoStaged ?? profileSnapshot.photo)!
                                      .imageUrl,
                              }
                            : {}),
                        ...((profileSnapshot.saveError ?? flow.error)
                            ? { message: profileSnapshot.saveError ?? flow.error }
                            : {}),
                        onSubmit: () => void (named ? create() : undefined),
                        onPhotoChoose: (file: File) => void profile.photoStageChoose(file),
                    },
                    action: {
                        label: "Continue",
                        busy: profileSnapshot.saving || pending,
                        disabled: !named || profileSnapshot.loading,
                        onSelect: () => void create(),
                    },
                    footnote: "Add your name to continue.",
                };
            }
            case "avatar":
                return {
                    view: {
                        kind: "profile",
                        ask: "photo",
                        ...photo,
                        busy: profileSnapshot.photoActivity === "uploading",
                        ...(profileSnapshot.photo?.imageUrl
                            ? { photoUrl: profileSnapshot.photo.imageUrl }
                            : {}),
                        ...(flow.error ? { message: flow.error } : {}),
                        onSubmit: () => store.gateContinue(gate.id),
                        onPhotoChoose: (file: File) => void profile.photoChoose(file),
                    },
                    action: proceed,
                    ...(skip ? { skip } : {}),
                    footnote: "Add a photo to continue.",
                };
            case "adminBot":
                return {
                    view: {
                        kind: "adminBot",
                        title: gate.title,
                        description: gate.description,
                        points: gate.points,
                        note: gate.note,
                        name: props.snapshot.adminBotName ?? gate.name,
                        avatarUrl: gate.avatarUrl,
                        placeholderSeed: gate.botId || "chief-of-staff",
                        busy: pending,
                        ...(flow.error ? { error: flow.error } : {}),
                        onNameChange: store.adminBotNameUpdate,
                        onSubmit: store.adminBotNameSubmit,
                    },
                    action: {
                        label: "Continue",
                        busy: pending,
                        disabled: (props.snapshot.adminBotName ?? gate.name).trim() === "",
                        onSelect: store.adminBotNameSubmit,
                    },
                    ...(skip ? { skip } : {}),
                    footnote: "Give it a name to continue.",
                };
            case "inference":
                return {
                    view: {
                        kind: "inference",
                        rows: providerRows(providers, providersStore, custom, customCreate),
                        ...((flow.error ?? providers?.error?.message)
                            ? { error: flow.error ?? providers?.error?.message }
                            : {}),
                    },
                    action: proceed,
                    ...(skip ? { skip } : {}),
                    footnote: "Connect one to continue.",
                };
            case "plugins":
                return {
                    view: {
                        kind: "plugins",
                        ...tools!,
                        ...((flow.error ?? tools?.error)
                            ? { error: flow.error ?? tools?.error }
                            : {}),
                    },
                    action: proceed,
                    ...(skip ? { skip } : {}),
                    footnote: pluginsFootnote(gate),
                };
            case "teammates": {
                const invites = props.snapshot.invites;
                return {
                    view: {
                        kind: "teammates",
                        email: invites.email,
                        busy: invites.creating === "email",
                        invites: invites.sent,
                        ...(invites.link ? { link: invites.link } : {}),
                        linkBusy: invites.creating === "link",
                        ...((invites.error ?? flow.error)
                            ? { error: invites.error ?? flow.error }
                            : {}),
                        onEmailChange: store.inviteEmailUpdate,
                        onInvite: store.inviteEmailSend,
                        onLinkCreate: store.inviteLinkCreate,
                    },
                    action: proceed,
                    ...(skip ? { skip } : {}),
                    footnote: "Invite someone to continue.",
                };
            }
            case "mobileApp":
                return {
                    view: {
                        kind: "mobileApp",
                        appStoreUrl: gate.appStoreUrl,
                        playStoreUrl: gate.playStoreUrl,
                        registered: gate.registered || gate.status === "done",
                    },
                    action: proceed,
                    ...(skip ? { skip } : {}),
                    footnote: "Sign in on your phone. This page moves on by itself.",
                };
            case "paymentMethod":
            case "payment": {
                // Without the server's payments, or where they turn out to be
                // off for this reader, the step cannot be done from here.
                if (!paymentsStore || !payments || (!payments.loading && !payments.available))
                    return {
                        view: {
                            kind: "notice",
                            reason: "unavailable",
                            step: STEP_LABELS[gate.kind],
                        },
                        ...(skip ? { skip } : {}),
                    };
                const account = payments.account;
                const currency = account?.currency ?? "usd";
                const unit = 10 ** happyAgentMoneyExponent(currency);
                const kind = gate.kind === "paymentMethod" ? "setup" : "topUp";
                const waiting =
                    !done && (payments.redirecting === kind || payments.opened === kind);
                const target = { open };
                const error =
                    payments.actionError?.message ?? payments.error?.message ?? flow.error;
                const selected =
                    payments.topUp.preset === "custom" ? undefined : payments.topUp.preset;
                return {
                    view: {
                        kind: "payment",
                        ask: gate.kind === "paymentMethod" ? "method" : "credit",
                        method: account?.paymentMethod ? methodText(account.paymentMethod) : null,
                        balance: account ? moneyText(account.balance) : null,
                        detail:
                            gate.kind === "paymentMethod"
                                ? "With it on file, adding credit later takes one step."
                                : "Owners can cap what agents spend each month in Settings.",
                        testMode: account?.mode === "test",
                        ...(gate.kind === "payment"
                            ? {
                                  amounts: PAYMENT_PRESETS.map((major) => ({
                                      id: String(major * unit),
                                      label: moneyText({ minor: major * unit, currency }, true),
                                  })),
                                  ...(selected !== undefined ? { amount: String(selected) } : {}),
                                  onAmountSelect: (id: string) =>
                                      paymentsStore.topUpPresetSelect(Number(id)),
                              }
                            : {}),
                        waiting,
                        ...(error ? { error } : {}),
                    },
                    // Stripe reports back to the server; the gate's own status
                    // moves the page on, so the action is Continue once it is done.
                    action: done
                        ? proceed
                        : gate.kind === "paymentMethod"
                          ? {
                                label: "Add card",
                                busy: payments.redirecting === "setup",
                                disabled: payments.loading,
                                onSelect: () => paymentsStore.methodSetup(target),
                            }
                          : {
                                label:
                                    selected !== undefined
                                        ? `Add ${moneyText({ minor: selected, currency }, true)}`
                                        : "Add credit",
                                busy: payments.redirecting === "topUp",
                                disabled: payments.loading || selected === undefined,
                                onSelect: () => paymentsStore.topUpSubmit(target),
                            },
                    ...(skip ? { skip } : {}),
                    footnote: "Pick an amount to continue.",
                };
            }
            case "unknown":
                return {
                    view: { kind: "notice", reason: "unavailable", step: STEP_LABELS[gate.kind] },
                };
        }
    })();
    return (
        <>
            <CloudOnboardingScreen
                appearance={props.appearance}
                currentStep={gate.id}
                steps={flow.sequence.map((id) => {
                    const entry = flow.gates.find((entry) => entry.id === id);
                    return {
                        id,
                        label: STEP_LABELS[entry?.kind ?? "unknown"],
                        done: entry?.status === "done" || entry?.status === "skipped",
                    };
                })}
                {...(props.serverLabel ? { serverLabel: props.serverLabel } : {})}
                {...(props.onExternalOpen ? { onExternalOpen: props.onExternalOpen } : {})}
                {...(flow.previous === undefined
                    ? {}
                    : {
                          back: {
                              disabled: flow.pending !== undefined,
                              onSelect: store.gateBack,
                          },
                      })}
                exit={{ onSelect: store.onboardingExit }}
                {...screen}
            />
            {tools
                ? cloudOnboardingToolsDialog({
                      view: tools,
                      plugins,
                      snapshot: props.snapshot,
                      store,
                      open,
                  })
                : null}
            {providersStore && providers?.add
                ? ((add, opened) =>
                      opened ? (
                          <CloudOnboardingProviderDialog
                              onAddAnother={() =>
                                  providerOpen(
                                      providersStore,
                                      opened.provider,
                                      providerWays(opened.provider, providers)[0]!,
                                      add.to,
                                  )
                              }
                              onApiKeySubmit={providersStore.apiKeySubmit}
                              onAwsKeysSubmit={providersStore.awsKeysSubmit}
                              onClose={providersStore.addClose}
                              onSaveToChange={(to) =>
                                  // A sign-in already started was asked for the other
                                  // place: it is let go and started again for this one.
                                  providerOpen(providersStore, opened.provider, opened.way, to)
                              }
                              onSetupTokenSubmit={providersStore.setupTokenSubmit}
                              onSignInCodeSubmit={providersStore.signInCodeSubmit}
                              onSignInStart={providersStore.signInStart}
                              onWaySelect={(way) =>
                                  providerOpen(providersStore, opened.provider, way, add.to)
                              }
                              phase={add.phase}
                              provider={opened.provider}
                              regionEditable={providers.teamAllowed}
                              saveTo={add.to}
                              saveToSwitchable={providers.privateAllowed && providers.teamAllowed}
                              team={props.serverLabel ?? "this server"}
                              way={opened.way}
                              ways={providerWays(opened.provider, providers)}
                              {...(add.signIn
                                  ? {
                                        signIn: {
                                            url: add.signIn.url,
                                            ...(add.signIn.userCode === undefined
                                                ? {}
                                                : { userCode: add.signIn.userCode }),
                                        },
                                    }
                                  : {})}
                              {...(add.error ? { error: add.error.message } : {})}
                              {...(props.onExternalOpen
                                  ? { onExternalOpen: props.onExternalOpen }
                                  : {})}
                          />
                      ) : null)(providers.add, flowProvider(providers.add.flow))
                : null}
            {customStore && custom ? (
                <AppCustomProviderDialog snapshot={custom} store={customStore} />
            ) : null}
        </>
    );
}
