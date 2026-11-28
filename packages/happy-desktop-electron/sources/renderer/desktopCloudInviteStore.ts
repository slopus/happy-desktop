import {
    happyCloudInviteStoreCreate,
    happyExternalLinkParse,
    type HappyCloudInviteLink,
    type HappyCloudInviteStore,
} from "happy-desktop-state";
import type { DesktopHappyCloud, HappyDesktopBridge } from "../shared/desktopContract";
import { HAPPY_CLOUD_ACCOUNT_ID, happyCloudConnectionId } from "../shared/happyCloud";

/**
 * An invitation to a Happy Cloud server, in this window: the invite steps
 * `happy-desktop-state` owns, bound to the shell. The shell asks Happy Cloud
 * on the window's behalf and holds the account's session; the window holds an
 * invitation's token only while that invitation is on show.
 *
 * The account signs in the way it does everywhere in this app, in the system
 * browser. A joined server is added and opened exactly as one picked from the
 * account's servers is.
 */
export function desktopCloudInviteStoreCreate(input: {
    readonly cloud: DesktopHappyCloud;
    readonly bridge: Pick<
        HappyDesktopBridge,
        "serverSignInBegin" | "serverSignInFinish" | "serverSignInCancel"
    >;
    /** Selects a server the shell just signed in to, once the window hears of it. */
    readonly connect: (
        connectionId: string,
    ) => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>;
    /** Whether a server, by its connection ID, is already in this app. */
    readonly inApp: (connectionId: string) => boolean;
    /** Shows a server already in this app, by its connection ID. */
    readonly open: (connectionId: string) => void;
    /** A server from an invitation is on show: whatever else stood over the app gives way. */
    readonly entered?: () => void;
}): HappyCloudInviteStore {
    const { cloud, bridge } = input;
    const { invitePreview, inviteAccept } = cloud;
    return happyCloudInviteStoreCreate({
        ...(invitePreview && inviteAccept
            ? { invites: { preview: invitePreview, accept: inviteAccept } }
            : {}),
        // The shell does not say who is signed in; the account's servers are
        // read with its session, so whether they can be read answers it. A
        // failure to reach Happy Cloud is not a signed-out account: Join asks.
        async accountSignedIn() {
            const answer = await cloud.serversList();
            return answer.ok || answer.code !== "sign_in_required";
        },
        accountSignIn() {
            let attemptId: string | undefined;
            let cancelled = false;
            const finished = (async () => {
                const { serverSignInBegin, serverSignInFinish } = bridge;
                if (!serverSignInBegin || !serverSignInFinish)
                    return {
                        signedIn: false as const,
                        message: "This version of Happy can't sign in to Happy Cloud.",
                    };
                const begun = await serverSignInBegin(HAPPY_CLOUD_ACCOUNT_ID);
                if (!begun.ok) return { signedIn: false as const, message: begun.message };
                if (cancelled) {
                    void bridge.serverSignInCancel?.(begun.value.attemptId);
                    return { signedIn: false as const };
                }
                attemptId = begun.value.attemptId;
                const ended = await serverSignInFinish(begun.value.attemptId);
                attemptId = undefined;
                if (ended.ok) return { signedIn: true as const };
                // A sign-in the person gave up has nothing to explain.
                return cancelled
                    ? { signedIn: false as const }
                    : { signedIn: false as const, message: ended.message };
            })();
            return {
                finished,
                cancel() {
                    cancelled = true;
                    if (attemptId !== undefined) void bridge.serverSignInCancel?.(attemptId);
                    attemptId = undefined;
                },
            };
        },
        accountSignOut: () => cloud.accountSignOut(),
        serverInApp: (name) => input.inApp(happyCloudConnectionId(name)),
        serverOpen(name) {
            input.open(happyCloudConnectionId(name));
            input.entered?.();
        },
        async serverEnter(serverId) {
            const added = await cloud.serverConnect(serverId);
            if (!added.ok)
                return added.code === "sign_in_required"
                    ? { kind: "signInRequired" }
                    : { kind: "failed", message: added.message };
            const connected = await input.connect(added.value);
            if (!connected.ok) return { kind: "failed", message: connected.message };
            input.entered?.();
            return { kind: "entered" };
        },
    });
}

/**
 * Hands a link the system opened Happy with, or one pressed inside the
 * window, to what shows it: the Cloud's servers, an invitation, or the server
 * an instance link names. A Cloud link on a shell without Happy Cloud goes
 * the way of any link this app cannot open. The link is never logged: an
 * invitation's is a secret.
 */
export function desktopExternalLinkRoute(
    url: string,
    to: {
        /** `happy://cloud/servers`; absent without Happy Cloud. */
        readonly cloudServers?: () => void;
        /** An invite link; absent without Happy Cloud. */
        readonly cloudInvite?: (invite: HappyCloudInviteLink) => void;
        /** Every other link, and a Cloud link nothing here can show. */
        readonly other: (url: string) => void;
    },
): void {
    const link = happyExternalLinkParse(url);
    if (link.kind === "cloudServers" && to.cloudServers) to.cloudServers();
    else if (link.kind === "cloudInvite" && to.cloudInvite) to.cloudInvite(link.invite);
    else to.other(url);
}
