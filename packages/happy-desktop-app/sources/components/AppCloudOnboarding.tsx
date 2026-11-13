import { useSyncExternalStore } from "react";
import {
    HappyAgentPluginFieldsError,
    type HappyAgentCloudProvidersSnapshot,
    type HappyAgentCloudProvidersStore,
    type HappyAgentOnboardingGate,
    type HappyAgentOnboardingSnapshot,
    type HappyAgentOnboardingStore,
    type HappyAgentPluginsSnapshot,
    type HappyAgentPluginsStore,
    type HappyAgentProfileSnapshot,
    type HappyAgentProfileStore,
} from "happy-desktop-state";
import {
    CloudOnboardingPluginDialog,
    CloudOnboardingScreen,
    HappyAgentProviderAddDialog,
    type CloudOnboardingInferenceOption,
    type CloudOnboardingPlugin,
    type CloudOnboardingScreenProps,
    type ThemeMode,
} from "happy-desktop-ui";
import { providerAddProps } from "../views/AppHappyAgentSettingsView";

const STEP_LABELS: Readonly<Record<HappyAgentOnboardingGate["kind"], string>> = {
    profile: "Profile",
    avatar: "Photo",
    adminBot: "Admin bot",
    inference: "AI",
    plugins: "Plugins",
    teammates: "Team",
    mobileApp: "Phone",
    paymentMethod: "Payment",
    payment: "Credit",
    unknown: "More",
};

/** Which credential vendors light which AI tile; anything else the team added is Custom. */
const TILE_VENDORS: Readonly<
    Record<Exclude<CloudOnboardingInferenceOption["id"], "custom">, string>
> = {
    claude: "claude-code",
    chatgpt: "codex",
    grok: "grok",
};

/** How many plugins the plugins step offers: the required ones, then others to fill. */
const PLUGIN_ROWS = 3;

const noopSubscribe = () => () => undefined;
const noSnapshot = () => undefined;

function inferenceOptions(
    providers: HappyAgentCloudProvidersSnapshot | undefined,
    store: HappyAgentCloudProvidersStore | undefined,
): readonly CloudOnboardingInferenceOption[] {
    const vendors = new Set(
        (providers?.connections ?? [])
            .filter((connection) => connection.source === "tenant")
            .flatMap((connection) =>
                connection.credentials
                    ? connection.credentials.map((credential) => credential.vendor)
                    : connection.vendors,
            ),
    );
    const known = new Set(Object.values(TILE_VENDORS));
    const to = providers?.teamAllowed ? "team" : "private";
    const open = (flow: Parameters<HappyAgentCloudProvidersStore["addOpen"]>[0]) =>
        store ? () => store.addOpen(flow) : undefined;
    const options: readonly {
        readonly id: CloudOnboardingInferenceOption["id"];
        readonly connected: boolean;
        readonly onSelect?: (() => void) | undefined;
    }[] = [
        {
            id: "claude",
            connected: vendors.has(TILE_VENDORS.claude),
            ...(providers?.signIns.has("claude") || providers?.setupToken
                ? {
                      onSelect: open({
                          flow: { kind: "claude", setupToken: !providers.signIns.has("claude") },
                          to,
                      }),
                  }
                : {}),
        },
        {
            id: "chatgpt",
            connected: vendors.has(TILE_VENDORS.chatgpt),
            ...(providers?.signIns.has("codex")
                ? { onSelect: open({ flow: { kind: "chatgpt" }, to }) }
                : {}),
        },
        {
            id: "grok",
            connected: vendors.has(TILE_VENDORS.grok),
            onSelect: open({ flow: { kind: "apiKey", vendor: "grok" }, to }),
        },
        {
            id: "custom",
            connected: [...vendors].some((vendor) => !known.has(vendor)),
            onSelect: open({ flow: { kind: "choose" }, to }),
        },
    ];
    return options.map(({ onSelect, ...option }) => (onSelect ? { ...option, onSelect } : option));
}

function pluginRows(
    gate: Extract<HappyAgentOnboardingGate, { readonly kind: "plugins" }>,
    plugins: HappyAgentPluginsSnapshot | undefined,
    connecting: string | undefined,
    connect: ((pluginId: string) => void) | undefined,
): readonly CloudOnboardingPlugin[] {
    const catalog = plugins?.plugins ?? [];
    const required = gate.plugins.filter((plugin) => plugin.required);
    const offered = [
        ...required.map((plugin) => plugin.id),
        ...catalog.map((plugin) => plugin.id).filter((id) => !gate.required.includes(id)),
    ].slice(0, Math.max(PLUGIN_ROWS, required.length));
    return offered.map((id) => {
        const entry = catalog.find((plugin) => plugin.id === id);
        const gateEntry = gate.plugins.find((plugin) => plugin.id === id);
        const installations = (plugins?.installations ?? []).filter(
            (installation) => installation.pluginId === id && installation.available,
        );
        const state =
            gateEntry?.active || installations.some((entry) => entry.status === "active")
                ? "connected"
                : installations.length > 0
                  ? "setup"
                  : "available";
        return {
            id,
            name: entry?.name ?? gateEntry?.name ?? id,
            description: entry?.description ?? "",
            image: entry?.image ?? null,
            required: gate.required.includes(id),
            state,
            ...(connecting === id ? { busy: true } : {}),
            ...(!connect || state === "connected" || (connecting !== undefined && connecting !== id)
                ? {}
                : { onSelect: () => connect(id) }),
        };
    });
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
    const pluginsStore = gate.kind === "plugins" ? props.plugins?.() : undefined;
    const plugins = useSyncExternalStore(
        pluginsStore?.subscribe ?? noopSubscribe,
        pluginsStore?.get ?? noSnapshot,
        pluginsStore?.get ?? noSnapshot,
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
    // The sign-in the plugins gate opened, while its installation still needs one.
    const setup = props.snapshot.pluginSetup;
    const setupPlugin = plugins?.plugins.find((plugin) => plugin.id === setup?.pluginId);
    const setupInstallation = plugins?.installations.find(
        (installation) =>
            installation.id === setup?.installationId &&
            installation.available &&
            installation.status !== "active",
    );
    const screen = ((): Pick<CloudOnboardingScreenProps, "view" | "action" | "skip"> => {
        if (flow.stance && flow.stance !== "act")
            return { view: { kind: "notice", reason: flow.stance, step: STEP_LABELS[gate.kind] } };
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
                    await profile.profileCreate();
                    // A photo chosen here completes the photo step too; one
                    // left out is not asked for again when it is optional.
                    if (!profile.get().saveError) store.gateContinue(gate.id, { also: ["avatar"] });
                };
                const named = profileSnapshot.name.trim() !== "";
                return {
                    view: {
                        kind: "profile",
                        ask: "profile",
                        ...photo,
                        ...(profileSnapshot.photoStaged
                            ? { photoUrl: profileSnapshot.photoStaged.imageUrl }
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
                };
            case "inference":
                return {
                    view: {
                        kind: "inference",
                        options: inferenceOptions(providers, providersStore),
                        ...((flow.error ?? providers?.error?.message)
                            ? { error: flow.error ?? providers?.error?.message }
                            : {}),
                    },
                    action: proceed,
                    ...(skip ? { skip } : {}),
                };
            case "plugins":
                return {
                    view: {
                        kind: "plugins",
                        // A server whose health does not say it serves plugins has no
                        // store: its required plugins are listed from the gate, not offered.
                        plugins: pluginRows(
                            gate,
                            plugins,
                            props.snapshot.pluginConnecting,
                            pluginsStore ? (id) => store.pluginConnect(id, { open }) : undefined,
                        ),
                        loading: pluginsStore ? (plugins?.loading ?? true) : false,
                        ...((flow.error ?? plugins?.error?.message)
                            ? { error: flow.error ?? plugins?.error?.message }
                            : {}),
                    },
                    action: proceed,
                    ...(skip ? { skip } : {}),
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
                        ...((invites.error ?? flow.error)
                            ? { error: invites.error ?? flow.error }
                            : {}),
                        onEmailChange: store.inviteEmailUpdate,
                        onInvite: store.inviteEmailSend,
                        onLinkCreate: store.inviteLinkCreate,
                    },
                    action: proceed,
                    ...(skip ? { skip } : {}),
                };
            }
            case "mobileApp":
                return {
                    view: {
                        kind: "mobileApp",
                        appStoreUrl: gate.appStoreUrl,
                        playStoreUrl: gate.playStoreUrl,
                        registered: gate.registered || done,
                    },
                    action: proceed,
                    ...(skip ? { skip } : {}),
                };
            case "paymentMethod":
            case "payment":
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
                    const kind = flow.gates.find((entry) => entry.id === id)?.kind ?? "unknown";
                    return { id, label: STEP_LABELS[kind] };
                })}
                {...(props.serverLabel ? { serverLabel: props.serverLabel } : {})}
                {...(props.onExternalOpen ? { onExternalOpen: props.onExternalOpen } : {})}
                {...screen}
            />
            {pluginsStore && setup && setupPlugin && setupInstallation ? (
                <CloudOnboardingPluginDialog
                    description={setupPlugin.description}
                    image={setupPlugin.image}
                    installation={setupInstallation}
                    methods={setupPlugin.authMethods}
                    name={setupPlugin.name}
                    onClose={store.pluginSetupClose}
                    onConfigure={async (installationId, methodId, values) => {
                        try {
                            await pluginsStore.installationConfigure(
                                installationId,
                                methodId,
                                values,
                            );
                        } catch (error) {
                            if (error instanceof HappyAgentPluginFieldsError)
                                return { message: error.message, fields: error.fields };
                            throw error;
                        }
                        store.pluginSetupClose();
                        return undefined;
                    }}
                    onConnect={async (installationId, methodId) => {
                        await pluginsStore.installationConnect(installationId, methodId, { open });
                        store.pluginSetupClose();
                    }}
                />
            ) : null}
            {providersStore && providers?.add ? (
                <HappyAgentProviderAddDialog
                    {...providerAddProps(providers, providersStore, props.onExternalOpen)}
                />
            ) : null}
        </>
    );
}
