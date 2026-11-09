import { createContext, useSyncExternalStore } from "react";
import {
    happyAgentChatOnboardingStoreNoop,
    type HappyAgentChatOnboardingStore,
    type HappyAgentClockStore,
    type HappyAgentComputePoolStore,
    type HappyAgentDefaultModelStore,
    type HappyAgentMembersStore,
    type HappyAgentMobileConnectorStore,
    type HappyAgentOwnGitCredentialsStore,
    type HappyAgentProviderClisStore,
    type UiActionInput,
} from "happy-desktop-state";
import {
    UiComputeJoin,
    UiDefaultModel,
    UiGithubConnect,
    UiInvite,
    UiPhonePair,
    UiProviderSignIn,
    type ChatUiLive,
    type UiWidgetControl,
} from "happy-desktop-ui";
import { membersExpiresText, membersInviteMessage, membersRoleName } from "../membersWords";

/**
 * What the conversations on the open Happy Agent add to what they draw: the
 * live chat UI components its documents may hold, and the onboarding it may
 * be running in one of them. One value per connection, read by every
 * conversation surface.
 */
export type HappyAgentConversationExtras = {
    readonly live?: ChatUiLive;
    readonly chatOnboarding: HappyAgentChatOnboardingStore;
};

const NO_EXTRAS: HappyAgentConversationExtras = {
    chatOnboarding: happyAgentChatOnboardingStoreNoop,
};

export const HappyAgentConversationExtrasContext =
    createContext<HappyAgentConversationExtras>(NO_EXTRAS);

/** The stores of one connection the extras are drawn from; absent where a host has none. */
export type HappyAgentConversationExtrasSource = {
    readonly chatOnboarding?: HappyAgentChatOnboardingStore;
    readonly providerClis?: () => HappyAgentProviderClisStore;
    readonly defaultModel?: () => HappyAgentDefaultModelStore;
    readonly mobileConnector?: () => HappyAgentMobileConnectorStore;
    /** A team server's members and invites; undefined anywhere else. */
    readonly members?: () => HappyAgentMembersStore | undefined;
    /** A team server's compute pool, by ID or its default; undefined anywhere else. */
    readonly computePool?: (poolId: string | undefined) => HappyAgentComputePoolStore | undefined;
    /** The reader's own git credentials for a host on a team server; undefined anywhere else. */
    readonly ownGitCredentials?: (host: string) => HappyAgentOwnGitCredentialsStore | undefined;
    readonly clock: HappyAgentClockStore;
};

/**
 * One connection's live chat UI components, each drawn from the store that
 * follows its state on the server. Every click goes through the component's
 * own action; the stores only say how things stand. Team components are
 * drawn only on a team server.
 */
export function happyAgentConversationExtras(
    source: HappyAgentConversationExtrasSource | undefined,
    options: { readonly teamServer: boolean; readonly linkOpen: (url: string) => void },
): HappyAgentConversationExtras {
    if (source === undefined) return NO_EXTRAS;
    const providerClis = source.providerClis?.();
    const defaultModel = source.defaultModel?.();
    const phone = source.mobileConnector?.();
    const members = options.teamServer ? source.members?.() : undefined;
    const clock = source.clock;
    const linkOpen = options.linkOpen;
    return {
        chatOnboarding: source.chatOnboarding ?? happyAgentChatOnboardingStoreNoop,
        live: {
            ...(providerClis
                ? {
                      provider_sign_in: (component, control) =>
                          component.type === "provider_sign_in" ? (
                              <HappyAgentChatProviderSignIn
                                  control={control}
                                  linkOpen={linkOpen}
                                  provider={component.props.provider}
                                  store={providerClis}
                              />
                          ) : null,
                  }
                : {}),
            ...(defaultModel
                ? {
                      default_model: (_component, control) => (
                          <HappyAgentChatDefaultModel control={control} store={defaultModel} />
                      ),
                  }
                : {}),
            ...(phone
                ? {
                      phone_pair: (_component, control) => (
                          <HappyAgentChatPhonePair clock={clock} control={control} phone={phone} />
                      ),
                  }
                : {}),
            ...(members
                ? {
                      invite: (component, control) =>
                          component.type === "invite" ? (
                              <HappyAgentChatInvite
                                  control={control}
                                  {...(component.props.role ? { role: component.props.role } : {})}
                                  store={members}
                              />
                          ) : null,
                  }
                : {}),
            ...(options.teamServer
                ? {
                      github_connect: (_component, control) => (
                          <HappyAgentChatGithubConnect
                              control={control}
                              credentials={source.ownGitCredentials?.("github.com")}
                              linkOpen={linkOpen}
                          />
                      ),
                      compute_join: (component, control) =>
                          component.type === "compute_join" ? (
                              <HappyAgentChatComputeJoin
                                  control={control}
                                  pool={component.props.pool}
                                  store={source.computePool?.(component.props.pool)}
                              />
                          ) : null,
                  }
                : {}),
        },
    };
}

/** Actions after which the server runs a sign-in whose page this window opens. */
const SIGN_IN_STARTS: ReadonlySet<string> = new Set([
    "provider_sign_in.install",
    "provider_sign_in.sign_in",
]);

/**
 * One AI's install and sign-in where a document shows it, live from the
 * connection's provider CLIs. A sign-in it asks for opens its vendor's page
 * in the person's browser, the way Settings does. Only it repaints as an
 * install or sign-in goes on.
 */
function HappyAgentChatProviderSignIn(props: {
    readonly store: HappyAgentProviderClisStore;
    readonly provider: string;
    readonly control: UiWidgetControl;
    readonly linkOpen: (url: string) => void;
}) {
    const clis = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const { store, provider, control } = props;
    const act = control.act;
    const cli = clis.clis.get(provider);
    return (
        <UiProviderSignIn
            {...(cli ? { cli } : {})}
            control={
                act
                    ? {
                          ...control,
                          act: (action: UiActionInput) => {
                              if (SIGN_IN_STARTS.has(action.type)) store.cliSignInWatch(provider);
                              return act(action);
                          },
                      }
                    : control
            }
            onPageOpen={props.linkOpen}
            provider={provider}
            unsupported={clis.status === "unsupported"}
        />
    );
}

/** The default model for new chats where a document shows it, changed in place. */
function HappyAgentChatDefaultModel(props: {
    readonly store: HappyAgentDefaultModelStore;
    readonly control: UiWidgetControl;
}) {
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    return <UiDefaultModel control={props.control} state={state} />;
}

/**
 * This Happy Agent's pairing with a phone where a document shows it: the
 * emoji and the outcome from the connection's mobile connector, the code from
 * the widget's own start. It owns its subscriptions, so only it repaints as
 * the code counts down.
 */
function HappyAgentChatPhonePair(props: {
    readonly phone: HappyAgentMobileConnectorStore;
    readonly clock: HappyAgentClockStore;
    readonly control: UiWidgetControl;
}) {
    const phone = useSyncExternalStore(props.phone.subscribe, props.phone.get, props.phone.get);
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    return <UiPhonePair connector={phone.connector} control={props.control} now={now} />;
}

/**
 * A team server's invite where a document asks for one: a role, and a code
 * made for it. The code is the action's answer to this window alone, held by
 * the widget and drawn only there; nothing writes it into the chat.
 */
function HappyAgentChatInvite(props: {
    readonly store: HappyAgentMembersStore;
    readonly role?: string;
    readonly control: UiWidgetControl;
}) {
    const members = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    return (
        <UiInvite
            control={props.control}
            createdWords={(created) => {
                const serverName = created.serverName ?? members.serverName;
                return {
                    message: membersInviteMessage({
                        serverName,
                        code: created.code,
                        expiresAt: created.expiresAt,
                    }),
                    detail: [
                        `Joins ${serverName} as ${membersRoleName(members, created.roleId)}`,
                        membersExpiresText(created.expiresAt),
                        "Shown only here",
                    ].join(" · "),
                };
            }}
            figure={{
                loading: members.loading,
                roles: members.roles,
                owner: members.roleId === "owner",
            }}
            {...(props.role ? { role: props.role } : {})}
        />
    );
}

/* A host with no team server reads nothing. */
const NO_READ = { loading: false } as const;
const readSubscribeNoop = () => () => undefined;
const readNoop = () => NO_READ;

/**
 * Linking the reader's own GitHub where a document asks for it. The server
 * follows the device sign-in itself; the card learns it is done when the
 * reader's own GitHub credential appears in the live list.
 */
function HappyAgentChatGithubConnect(props: {
    readonly credentials: HappyAgentOwnGitCredentialsStore | undefined;
    readonly control: UiWidgetControl;
    readonly linkOpen: (url: string) => void;
}) {
    const credentials = useSyncExternalStore(
        props.credentials?.subscribe ?? readSubscribeNoop,
        props.credentials?.get ?? readNoop,
        props.credentials?.get ?? readNoop,
    );
    const linked = credentials.value?.[0];
    return (
        <UiGithubConnect
            {...(linked ? { connectedAs: linked.username ?? linked.name } : {})}
            control={props.control}
            onPageOpen={props.linkOpen}
        />
    );
}

/** Adding a machine where a document asks for it, with the pool's machines live under it. */
function HappyAgentChatComputeJoin(props: {
    readonly store: HappyAgentComputePoolStore | undefined;
    readonly pool: string | undefined;
    readonly control: UiWidgetControl;
}) {
    const pool = useSyncExternalStore(
        props.store?.subscribe ?? readSubscribeNoop,
        props.store?.get ?? readNoop,
        props.store?.get ?? readNoop,
    );
    return (
        <UiComputeJoin
            control={props.control}
            {...(props.store
                ? {
                      machines: {
                          loading: pool.loading,
                          ...(pool.value ? { name: pool.value.name } : {}),
                          machines: pool.value?.machines ?? [],
                          ...(pool.error ? { error: pool.error } : {}),
                      },
                  }
                : {})}
            {...(props.pool ? { pool: props.pool } : {})}
        />
    );
}
