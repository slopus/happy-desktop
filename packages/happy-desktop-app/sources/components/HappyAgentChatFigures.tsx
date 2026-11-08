import { createContext, useCallback, useSyncExternalStore } from "react";
import {
    happyAgentChatOnboardingStoreNoop,
    type HappyAgentChatOnboardingStore,
    type HappyAgentClockStore,
    type HappyAgentDefaultModelStore,
    type HappyAgentMembersStore,
    type HappyAgentMobileConnectorStore,
    type HappyAgentProviderClisStore,
    type HappyAgentProviderCliTarget,
} from "happy-desktop-state";
import {
    ChatDefaultModelFigure,
    ChatInviteFigure,
    ChatMembersFigure,
    ChatProviderCliFigure,
    ChatSettingsFigure,
    MobileDirectPairingPanel,
    type ChatActionFigures,
    type ChatMembersFigureRow,
} from "happy-desktop-ui";
import {
    membersExpiresText,
    membersInviteMessage,
    membersJoinedText,
    membersRoleName,
    membersUsesText,
} from "../membersWords";

/**
 * What the conversations on the open Happy Agent add to what they draw: the
 * live figures its replies may hold, and the onboarding it may be running in
 * one of them. One value per connection, read by every conversation surface.
 */
export type HappyAgentConversationExtras = {
    readonly figures?: ChatActionFigures;
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
    readonly clock: HappyAgentClockStore;
};

/**
 * One connection's extras. A team server's invite and members are drawn live
 * from its members store; its other figures — providers, compute, the phone's
 * server link — are drawn as ways into its Settings.
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
    return {
        chatOnboarding: source.chatOnboarding ?? happyAgentChatOnboardingStoreNoop,
        figures: {
            ...(phone
                ? {
                      phonePairing: (live: boolean) => (
                          <HappyAgentChatPhonePairing clock={clock} live={live} phone={phone} />
                      ),
                  }
                : {}),
            ...(providerClis
                ? {
                      providerCli: (
                          cliId: string,
                          target: HappyAgentProviderCliTarget | undefined,
                          live: boolean,
                      ) => (
                          <HappyAgentChatProviderCli
                              cliId={cliId}
                              linkOpen={options.linkOpen}
                              live={live}
                              store={providerClis}
                              target={target}
                          />
                      ),
                  }
                : {}),
            ...(defaultModel
                ? { defaultModel: <HappyAgentChatDefaultModel store={defaultModel} /> }
                : {}),
            ...(members
                ? {
                      invite: (role: string | undefined, live: boolean) => (
                          <HappyAgentChatInvite live={live} role={role} store={members} />
                      ),
                      members: (live: boolean) => (
                          <HappyAgentChatMembers live={live} store={members} />
                      ),
                  }
                : {}),
            ...(options.teamServer ? { teamSettings: true as const } : {}),
        },
    };
}

/**
 * This Happy Agent's direct pairing with a phone, where a chat shows it: the
 * code to scan in Happy on the phone, then the emoji both screens approve.
 * Live, it opens a pairing while it is shown and closes it when it goes; in an
 * older message it shows the pairing as it stands and starts nothing. It owns
 * its subscriptions, so only it repaints as the code counts down.
 */
function HappyAgentChatPhonePairing(props: {
    readonly phone: HappyAgentMobileConnectorStore;
    readonly clock: HappyAgentClockStore;
    readonly live: boolean;
}) {
    const phone = useSyncExternalStore(props.phone.subscribe, props.phone.get, props.phone.get);
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const store = props.phone;
    const live = props.live;
    // One ref for the store's lifetime and liveness: a new one each render
    // would close and reopen the pairing every time the code counts down.
    const pairingHold = useCallback(
        (node: HTMLDivElement | null) => {
            if (!node || !live) return;
            store.pairingOpen();
            return () => store.pairingClose();
        },
        [store, live],
    );
    return (
        <div ref={pairingHold}>
            <MobileDirectPairingPanel
                cancelling={phone.cancelling}
                codeSize={204}
                confirming={phone.confirming}
                connector={phone.connector}
                density="compact"
                now={now}
                onConfirm={store.pairingConfirm}
                onReject={store.pairingReject}
                onStart={store.pairingStart}
                starting={phone.starting}
                {...(phone.actionError ? { actionError: phone.actionError } : {})}
            />
        </div>
    );
}

/**
 * One provider CLI where a chat shows it, live from the connection's provider
 * CLIs: its install and sign-in, each control calling the server's provider CLI
 * routes. In an older message it shows the CLI as it stands and has no
 * controls, so only the message the conversation stands on starts or cancels a
 * sign-in. A server that does not serve them gets the way into its providers'
 * Settings instead. Only it repaints as an install or sign-in goes on.
 */
function HappyAgentChatProviderCli(props: {
    readonly store: HappyAgentProviderClisStore;
    readonly cliId: string;
    /** Whose connection its sign-in makes, exactly as the figure named it. */
    readonly target: HappyAgentProviderCliTarget | undefined;
    readonly live: boolean;
    /** Opens a vendor's sign-in page in the person's browser. */
    readonly linkOpen: (url: string) => void;
}) {
    const clis = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const { store, cliId } = props;
    if (clis.status === "unsupported") return <ChatSettingsFigure type="providers" />;
    const cli = clis.clis.get(cliId);
    const error = clis.errors.get(cliId);
    return (
        <ChatProviderCliFigure
            cliId={cliId}
            {...(cli ? { cli } : {})}
            {...(error ? { error } : {})}
            {...(props.live
                ? {
                      onCancel: () => store.cliCancel(cliId),
                      onCodeSend: (code: string) => store.cliSignInCodeSend(cliId, code),
                      onInstall: () => store.cliInstall(cliId),
                      onPageOpen: props.linkOpen,
                      onSignIn: () => store.cliSignIn(cliId, props.target),
                  }
                : {})}
            requesting={clis.pending.has(cliId)}
        />
    );
}

/** The default model for new chats where a chat shows it, changed in place. */
function HappyAgentChatDefaultModel(props: { readonly store: HappyAgentDefaultModelStore }) {
    const state = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    return <ChatDefaultModelFigure onChange={props.store.defaultModelUpdate} state={state} />;
}

/**
 * A team server's invite where a reply asks for one: a role, and a code made
 * for it. The code is the server's answer to this window alone, kept only in
 * the members store and drawn only here; nothing writes it into the chat.
 */
function HappyAgentChatInvite(props: {
    readonly store: HappyAgentMembersStore;
    readonly role: string | undefined;
    readonly live: boolean;
}) {
    const members = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const store = props.store;
    // Only the reply the conversation stands on shows the code: an older one
    // asking for an invite never repeats it.
    const created = props.live ? members.inviteCreated : undefined;
    return (
        <ChatInviteFigure
            creating={members.inviteCreating}
            {...(created
                ? {
                      created: {
                          code: created.code,
                          message: membersInviteMessage(created),
                          detail: [
                              `Joins ${created.serverName} as ${membersRoleName(members, created.roleId)}`,
                              membersExpiresText(created.expiresAt),
                              "Shown only here",
                          ].join(" · "),
                      },
                  }
                : {})}
            {...((members.error ?? members.saveError)
                ? { error: (members.error ?? members.saveError)!.message }
                : {})}
            loading={members.loading}
            manage={members.manage}
            {...(props.live
                ? { onCreate: store.inviteCreate, onCreatedDismiss: store.inviteCreatedDismiss }
                : {})}
            owner={members.roleId === "owner"}
            {...(props.role ? { role: props.role } : {})}
            roles={members.roles}
        />
    );
}

/**
 * A team server's people where a reply shows them: everyone who joined, then
 * the codes still waiting. Live, someone who manages members may revoke a code.
 */
function HappyAgentChatMembers(props: {
    readonly store: HappyAgentMembersStore;
    readonly live: boolean;
}) {
    const members = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const store = props.store;
    const rows: ChatMembersFigureRow[] = [
        ...members.members.map(
            (member): ChatMembersFigureRow => ({
                id: member.id,
                kind: "member",
                name: `${member.name ?? "Someone new"}${member.self ? " (you)" : ""}`,
                role: membersRoleName(members, member.roleId),
                status: member.arrived
                    ? membersJoinedText(member.joinedAt)
                    : `Hasn't opened ${members.serverName} yet`,
                pending: !member.arrived,
                saving: member.saving,
            }),
        ),
        ...members.invites.map(
            (invite): ChatMembersFigureRow => ({
                id: invite.id,
                kind: "invite",
                name: "Invite code",
                role: membersRoleName(members, invite.roleId),
                status: [
                    membersUsesText(invite.uses) ?? "Waiting",
                    membersExpiresText(invite.expiresAt),
                ].join(" · "),
                pending: invite.uses === 0,
                saving: invite.saving,
            }),
        ),
    ];
    const people = members.members.length;
    const codes = members.invites.length;
    return (
        <ChatMembersFigure
            {...(members.error ? { error: members.error.message } : {})}
            loading={members.loading}
            {...(props.live && members.manage ? { onInviteRevoke: store.inviteRevoke } : {})}
            rows={rows}
            summary={[
                people === 1 ? "1 person" : `${String(people)} people`,
                ...(codes === 0
                    ? []
                    : [codes === 1 ? "1 code waiting" : `${String(codes)} codes waiting`]),
            ].join(" · ")}
        />
    );
}
