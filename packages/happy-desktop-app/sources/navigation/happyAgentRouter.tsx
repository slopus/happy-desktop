import {
    createRootRouteWithContext,
    createRoute,
    createRouter,
    Outlet,
    redirect,
    useMatches,
    useNavigate,
    useParams,
    useRouteContext,
    useRouter,
    type AnyRouteMatch,
    type ParsedLocation,
} from "@tanstack/react-router";
import { happyAgentHistoryCreate, type HappyAgentRouterHistory } from "./happyAgentHistory";
import { happyAgentRoutePathParse } from "./happyAgentRoute";
import { useSyncExternalStore } from "react";
import { HappyAgentOnboardingBoundary } from "../components/HappyAgentOnboardingBoundary";
import {
    happyAgentConversationContent,
    happyAgentFileLinkParse,
    parseHappyUrl,
} from "happy-desktop-state";
import type {
    AppearanceStore,
    HappyAgentArtifactId,
    CommandPaletteStore,
    ExperimentsStore,
    ProjectsVisibilityStore,
    StemCellAnimationStore,
    GptLiveStore,
    HappyAgentGroupId,
    UsageAnalyticsStore,
    KeepAwakeStore,
    StatusBarStore,
    HappyAgentFileTabKind,
    HappyAgentNavigationOrderStore,
    HappyAgentSidebarCollapseStore,
    HappyAgentSidebarSearchStore,
    HappyAgentSidebarVisibilityStore,
    HappyAgentAttentionStore,
    HappyAgentSessionId,
    HappyAgentSessionLocation,
    HappyAgentSettingsStore,
    HappyAgentSurfaceId,
    HappyAgentSurfaces,
    TitleShimmerStore,
    HappyAgentWindowStore,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    botFacePaint,
    SplashScreen,
    type BrowserContentRenderer,
    type HtmlPreviewRenderer,
    type LivePerformanceStore,
    type MediaWindowOpener,
} from "happy-desktop-ui";
import { messageReferenceEntities, messageReferenceSurfaceNames } from "../messageReferences";
import {
    AppHappyAgentView,
    fileTabKind,
    type AppBuildIdentity,
    type AppHappyAgentDirectoryStore,
    type AppHappyAgentUpdate,
} from "../AppHappyAgentView";
import {
    AppHappyAgentSettingsView,
    HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY,
    happyAgentSettingsCategoryExists,
    HAPPY_AGENT_SETTINGS_MOVED_CATEGORIES,
    type AppHappyAgentDaemonStore,
    type AppHappyAgentDebugStore,
    type AppHappyAgentProfilerStore,
} from "../views/AppHappyAgentSettingsView";
import type { AppHappyAgentReleaseNotesStore, AppHappyAgentUpdateStore } from "../agentUpdate";

/**
 * Everything the local route tree needs that the URL does not address: the
 * directory of Happy Agents this window can work in — each carrying its own connection,
 * workspace, host, clock, and model catalog — the window's own preferences, and
 * the appearance selection. It is the local counterpart of `AppRouterContext`
 * and is supplied to `RouterProvider` once the directory exists, so the router
 * can be constructed before any Happy Agent connects.
 */
export interface HappyAgentRouterContext {
    /** Whether this desktop fills logins saved in the person's browsers, whatever agent is connected. */
    readonly browserPasswordsAvailable?: boolean;
    /** A remote daemon uses its own setup inside this connection's router. */
    readonly connectionOnboarding?: boolean;
    /** Native Chromium guest renderer, present only in packaged Electron. */
    readonly browserContent?: BrowserContentRenderer;
    /** Renders one HTML workspace file as a page, in a host that has an engine. */
    readonly htmlPreview?: HtmlPreviewRenderer;
    /** The host's isolated guest for an HTML artifact served as a site. */
    readonly artifactPage?: HtmlPreviewRenderer;
    /**
     * Shows one workspace picture or recording in a window outside this one.
     * Present only in a shell that has separate windows to open, which is
     * packaged Electron.
     */
    readonly mediaWindow?: MediaWindowOpener;
    /**
     * Opens one web address in the machine's own browser rather than in an
     * embedded tab. Present only in a shell that can ask its host to, which is
     * packaged Electron; a browser tab opens links its own way.
     */
    readonly externalLinkOpen?: (url: string) => void;
    readonly debug?: AppHappyAgentDebugStore;
    /** Live renderer diagnostics, present only in an explicitly debug-launched desktop window. */
    readonly performance?: LivePerformanceStore;
    readonly daemon?: AppHappyAgentDaemonStore;
    /** The local Happy Agent update card, beside `daemon` and only with it. */
    readonly agentUpdate?: AppHappyAgentUpdateStore;
    readonly agentReleaseNotes?: AppHappyAgentReleaseNotesStore;
    /** First run on this machine, in Happy's own chat, until it is over. */
    readonly happyOnboarding?: import("happy-desktop-state").HappyOnboardingStore;
    readonly profiler?: AppHappyAgentProfilerStore;
    readonly happyAgents: AppHappyAgentDirectoryStore;
    /** This build's development identity; absent in the packaged product. */
    readonly buildIdentity?: AppBuildIdentity;
    readonly appearance: AppearanceStore;
    /** The window's own local preferences: default model, effort, and permissions. */
    readonly settings: HappyAgentSettingsStore;
    /**
     * Where this window remembers the order the reader arranged the sidebar's
     * pinned rows in. Absent in a host that keeps no such record, which leaves
     * the rows in the order the window offers them.
     */
    readonly navigationOrder?: HappyAgentNavigationOrderStore;
    /**
     * Where this window remembers which sidebar rows the reader folded shut.
     * Absent in a host that keeps no such record, which leaves every row open.
     */
    readonly sidebarCollapse?: HappyAgentSidebarCollapseStore;
    /**
     * What the sidebar's search field holds. Absent in a host that keeps none,
     * which leaves the sidebar without a search field.
     */
    readonly sidebarSearch?: HappyAgentSidebarSearchStore;
    /**
     * Which bots the reader muted or hid, and when each connection chimes:
     * each connection's own user settings for the reader, in one window store
     * shared by every connection. Absent in a host that keeps no such record,
     * which offers none of those controls.
     */
    readonly attention?: HappyAgentAttentionStore;
    /** Whether this window's left side is folded away; shared by every connection. */
    readonly sidebarVisibility?: HappyAgentSidebarVisibilityStore;
    /**
     * Whether this window offers the features that are not finished yet. Absent
     * in a host that remembers no such choice, which withholds them.
     */
    readonly experiments?: ExperimentsStore;
    /**
     * Whether the sidebar leaves the Projects sections out, for every
     * connection. Absent in a host that remembers no such choice, which shows them.
     */
    readonly projectsVisibility?: ProjectsVisibilityStore;
    readonly stemCellAnimation?: StemCellAnimationStore;
    /** Whether this window sends product analytics events. Absent where it sends none. */
    readonly usageAnalytics?: UsageAnalyticsStore;
    /** Window-owned GPT-Live opt-in; unrelated to coding-provider settings. */
    readonly gptLive?: GptLiveStore;
    /**
     * Whether this computer is held out of sleep, and the choice behind it.
     * Absent in a host that cannot hold the machine awake, which leaves the
     * footer without the control rather than with one wired to nothing.
     */
    readonly keepAwake?: KeepAwakeStore;
    /** Which optional controls the sidebar's status bar shows. */
    readonly statusBar?: StatusBarStore;
    /** Window-local preference for animated activity titles. */
    readonly titleShimmer?: TitleShimmerStore;
    /**
     * What the window's command palette is showing and asking. Absent in a host
     * that offers no palette, which leaves Command-K unbound.
     */
    readonly commandPalette?: CommandPaletteStore;
    /**
     * Which shell hosts this router. The Electron window has no native title bar,
     * so the workspace draws the traffic-light inset and drag lanes itself; the
     * browser development mode renders ordinary web chrome.
     */
    readonly platform?: "desktop" | "web";
    /**
     * The window's own chrome state. Full screen takes the native controls away,
     * so the inset the workspace reserves for them has to follow the window
     * rather than the platform.
     */
    readonly windowState?: HappyAgentWindowStore;
    /** Desktop-shell update state; absent when this route tree runs as plain web UI. */
    readonly update?: AppHappyAgentUpdate;
    readonly onUpdateApply?: () => void;
}

const rootRoute = createRootRouteWithContext<HappyAgentRouterContext>()({
    component: HappyAgentRoot,
});

function HappyAgentRoot() {
    const context = useRouteContext({ strict: false }) as HappyAgentRouterContext;
    if (!context.happyAgents) return null;
    return <HappyAgentRootContent context={context} />;
}

function HappyAgentRootContent({ context }: { readonly context: HappyAgentRouterContext }) {
    const directory = useSyncExternalStore(
        context.happyAgents.subscribe,
        context.happyAgents.get,
        context.happyAgents.get,
    );
    const entry = directory.happyAgents[0];
    // Sessions survive reconnects. Only the first connection gets a splash;
    // an already materialized workspace must keep its mounted UI and drafts.
    const setup = entry?.setup;
    if (!context.connectionOnboarding) return <Outlet />;
    const content = entry?.session ? (
        <Outlet />
    ) : (
        <SplashScreen note={entry?.message ?? `Connecting to ${entry?.label ?? "Happy Agent"}…`} />
    );
    if (!setup) return content;
    return (
        <HappyAgentOnboardingBoundary
            store={setup.onboarding}
            welcome={setup.welcome}
            appearance={context.appearance}
            profile={setup.profile}
            clock={setup.clock}
            online={entry?.status === "connected"}
            onRetry={setup.retry}
            {...(context.experiments ? { experiments: context.experiments } : {})}
            {...(context.externalLinkOpen ? { onExternalOpen: context.externalLinkOpen } : {})}
        >
            {content}
        </HappyAgentOnboardingBoundary>
    );
}

/**
 * The Happy Agent a bare address lands on: the first one in the window, which is the
 * machine this window runs on. The default is read rather than written down so
 * this file never names one Happy Agent as special.
 */
function happyAgentDefaultId(context: HappyAgentRouterContext | undefined): string {
    return context?.happyAgents?.get().happyAgents[0]?.id ?? "local";
}

/**
 * Redirects to one machine's list. The router helper's generic path type does not
 * retain this locally assembled tree, so `happyAgentRouterCreate` checks the path here.
 */
function happyAgentListRedirect(happyAgentId: string): never {
    throw redirect({ params: { happyAgentId }, replace: true, to: "/chats/$happyAgentId" });
}

/** The addressed Happy Agent's workspace store, absent while that Happy Agent is not connected. */
function happyAgentWorkspace(
    context: HappyAgentRouterContext,
    happyAgentId: string,
): HappyAgentWorkspaceStore | undefined {
    context.happyAgents.happyAgentActivate(happyAgentId);
    return context.happyAgents
        .get()
        .happyAgents.find((happyAgent) => happyAgent.id === happyAgentId)?.session?.workspace;
}

/** One machine's Surfaces, once it has stores to answer through. */
function happyAgentSurfaces(
    context: HappyAgentRouterContext,
    happyAgentId: string,
): HappyAgentSurfaces | undefined {
    return context.happyAgents
        .get()
        .happyAgents.find((happyAgent) => happyAgent.id === happyAgentId)?.session?.surfaces;
}

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    beforeLoad: ({ context }) => happyAgentListRedirect(happyAgentDefaultId(context)),
});

const chatsRootRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/chats",
    beforeLoad: ({ context }) => happyAgentListRedirect(happyAgentDefaultId(context)),
});

/**
 * The workspace layout is pathless so the shell, session list, and open
 * transcript keep one instance while the addressed machine and conversation
 * change underneath them. Every address that shows the window — a chat, the
 * inbox, the artifacts, a Surface, a new bot or task, the workbench — sits
 * under it, so moving between them changes only the content region and never
 * remounts the sidebar, its scroll, or its folds.
 */
const workspaceRoute = createRoute({
    component: HappyAgentWorkspaceLayout,
    getParentRoute: () => rootRoute,
    id: "_workspace",
});

/**
 * Addressing one Happy Agent without a conversation releases whichever one was open in
 * it. Materialization is a store concern applied on navigation; the URL alone
 * says which Happy Agent and which conversation that is.
 */
const chatsIndexRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        happyAgentWorkspace(context, params.happyAgentId)?.conversationClose();
    },
    path: "/chats/$happyAgentId",
});

/**
 * Addressing a project or worktree without one of its sessions: the group's tabs
 * are on screen but no session is open, so any previous one is released.
 */
const groupRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        happyAgentWorkspace(context, params.happyAgentId)?.groupOpen(
            params.groupId as HappyAgentGroupId,
        );
    },
    path: "/chats/$happyAgentId/$groupId",
});

/** Addressing one session materializes it, releasing the previous one. */
const chatRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        const groupId = params.groupId as HappyAgentGroupId;
        happyAgentWorkspace(context, params.happyAgentId)?.conversationOpen(
            params.chatId as HappyAgentSessionId,
            groupId,
        );
    },
    path: "/chats/$happyAgentId/$groupId/$chatId",
});

/** A file presentation carried explicitly by its durable address. */
function happyAgentFileTabKindParse(value: string): HappyAgentFileTabKind | undefined {
    return value === "file" || value === "diff" || value === "media" || value === "document"
        ? value
        : undefined;
}

/** A file opened over an empty workspace, with no session behind it. */
const groupFileRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        const groupId = params.groupId as HappyAgentGroupId;
        const workspace = happyAgentWorkspace(context, params.happyAgentId);
        const fileKind = happyAgentFileTabKindParse(params.fileKind);
        if (!fileKind)
            throw redirect({
                params: { groupId, happyAgentId: params.happyAgentId },
                replace: true,
                to: "/chats/$happyAgentId/$groupId",
            });
        workspace?.groupOpen(groupId);
        workspace?.filePreview(groupId, params.filePath, fileKind);
    },
    path: "/chats/$happyAgentId/$groupId/file/$fileKind/$filePath",
});

/** A file opened over one addressed session in its workspace. */
const chatFileRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        const groupId = params.groupId as HappyAgentGroupId;
        const workspace = happyAgentWorkspace(context, params.happyAgentId);
        const fileKind = happyAgentFileTabKindParse(params.fileKind);
        if (!fileKind)
            throw redirect({
                params: {
                    chatId: params.chatId,
                    groupId,
                    happyAgentId: params.happyAgentId,
                },
                replace: true,
                to: "/chats/$happyAgentId/$groupId/$chatId",
            });
        workspace?.conversationOpen(params.chatId as HappyAgentSessionId, groupId);
        workspace?.filePreview(groupId, params.filePath, fileKind);
    },
    path: "/chats/$happyAgentId/$groupId/$chatId/file/$fileKind/$filePath",
});

/**
 * Where a new bot is named on one machine. Arriving materializes the draft — a
 * name written on a previous visit is offered back, because the store keeps it
 * until the bot is actually made — and the surface then holds the whole content
 * region until the reader goes somewhere else or the new bot takes them there.
 */
const botCreateRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        // The store owns the seeds and the order of what happens; the painter
        // is lent to it because a canvas lives here, not there.
        happyAgentWorkspace(context, params.happyAgentId)?.botCreateOpen(botFacePaint);
    },
    path: "/bots/new/$happyAgentId",
});

/**
 * Where a new task is made on one machine. Arriving materializes the draft, as
 * the bot route does, and the surface holds the content region until the
 * reader goes elsewhere or the new task takes them there.
 */
const taskCreateRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    loader: ({ context, params }) => {
        happyAgentWorkspace(context, params.happyAgentId)?.taskCreateOpen();
    },
    path: "/tasks/new/$happyAgentId",
});

/**
 * One machine's inbox of agent questions. The Happy Agent is in the address because the
 * queue is that machine's — its agents are the ones waiting — so the window's
 * back and forward move between machines' inboxes rather than between two views
 * of one ambiguous list.
 */
const inboxRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "/inbox/$happyAgentId",
});

/**
 * One machine's published artifacts. The Happy Agent is in the address because
 * the catalog is that machine's, the way its inbox is.
 */
const artifactsRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "/artifacts/$happyAgentId",
});

/** One artifact open in the viewer, on the machine that keeps it. */
const artifactRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "/artifacts/$happyAgentId/$artifactId",
});

/**
 * One shared Surface — a todo list, or a type this build cannot show — on the
 * machine that keeps it. The Happy Agent is in the address because the Surface
 * is that machine's, the way its artifacts are.
 */
const surfaceRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "/surfaces/$happyAgentId/$surfaceId",
});

/**
 * A Surface with its shared chat open beside it. The chat is an ordinary
 * conversation, so the address names it, as a chat's own address does — but
 * only the Surface says which conversation that is. Arriving asks the Surface
 * for its chat, which is also what makes its workspace, listed nowhere, known
 * on a window that starts here; the conversation the Surface answers with is
 * the one opened, and an address naming any other is replaced by it.
 *
 * It renders nothing of its own: the Surface's window stays mounted while the
 * chat opens and closes beside it, so the page keeps its scroll, caret, and
 * edit, and the sidebar its own.
 */
const surfaceChatRoute = createRoute({
    getParentRoute: () => surfaceRoute,
    loader: async ({ abortController, context, params }) => {
        const workspace = happyAgentWorkspace(context, params.happyAgentId);
        const surfaces = happyAgentSurfaces(context, params.happyAgentId);
        if (!workspace || !surfaces) return;
        // A chat that cannot be opened says why in its panel; nothing opens.
        const location = await surfaces
            .catalog()
            .chatOpen(params.surfaceId as HappyAgentSurfaceId)
            .catch(() => undefined);
        // A reader who has gone elsewhere meanwhile stays there.
        if (location === undefined || abortController.signal.aborted) return;
        if (location.sessionId !== params.chatAgentId || location.groupId !== params.chatGroupId)
            throw redirect({
                params: {
                    chatAgentId: location.sessionId,
                    chatGroupId: location.groupId,
                    happyAgentId: params.happyAgentId,
                    surfaceId: params.surfaceId,
                },
                replace: true,
                to: "/surfaces/$happyAgentId/$surfaceId/chat/$chatGroupId/$chatAgentId",
            });
        workspace.conversationOpen(location.sessionId, location.groupId);
    },
    path: "chat/$chatGroupId/$chatAgentId",
});

/**
 * The component workbench, addressed without a Happy Agent because it renders component
 * pages rather than anything a machine holds. The route is registered only in a
 * development build, which is also the only build whose sidebar offers it.
 */
const blueprintRoute = createRoute({
    getParentRoute: () => workspaceRoute,
    path: "/blueprint",
});

const settingsIndexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    beforeLoad: () => {
        throw redirect({
            params: { section: HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY },
            replace: true,
            to: "/settings/$section",
        });
    },
});

/**
 * One settings category, addressed the same way a conversation is: the URL names
 * which category is open, so the window's back/forward and its permanent category
 * column agree without a second selection living in a store.
 */
const settingsSectionRoute = createRoute({
    component: HappyAgentSettingsRoute,
    getParentRoute: () => rootRoute,
    path: "/settings/$section",
    beforeLoad: ({ params }) => {
        const moved = HAPPY_AGENT_SETTINGS_MOVED_CATEGORIES[params.section];
        if (moved !== undefined)
            throw redirect({ params: { section: moved }, replace: true, to: "/settings/$section" });
        if (!happyAgentSettingsCategoryExists(params.section))
            throw redirect({
                params: { section: HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY },
                replace: true,
                to: "/settings/$section",
            });
    },
});

const routeTree = rootRoute.addChildren([
    indexRoute,
    chatsRootRoute,
    workspaceRoute.addChildren([
        chatsIndexRoute,
        groupRoute,
        chatRoute,
        groupFileRoute,
        chatFileRoute,
        inboxRoute,
        artifactsRoute,
        artifactRoute,
        surfaceRoute.addChildren([surfaceChatRoute]),
        botCreateRoute,
        taskCreateRoute,
        ...(import.meta.env.DEV ? [blueprintRoute] : []),
    ]),
    settingsIndexRoute,
    settingsSectionRoute,
]);

function HappyAgentWorkspaceLayout() {
    // Read loosely because this component renders under several routes, which
    // makes every context member optional; the provider supplies all of them
    // together, so it is read back as the whole context it was given.
    const context = useRouteContext({ strict: false }) as unknown as HappyAgentRouterContext;
    const navigate = useNavigate();
    const router = useRouter();
    // `strict: false` because a Happy Agent's list carries only `happyAgentId`, and a group
    // carries no `chatId`.
    const params = useParams({ strict: false });
    // What the content region shows, by the routes matched under this one
    // layout: the window around it stays the same instance at every address.
    const matched = new Set<string>(useMatches().map((match) => match.routeId));
    const shows = {
        artifacts: matched.has(artifactsRoute.id) || matched.has(artifactRoute.id),
        blueprint: matched.has(blueprintRoute.id),
        botCreate: matched.has(botCreateRoute.id),
        inbox: matched.has(inboxRoute.id),
        surface: matched.has(surfaceRoute.id),
        taskCreate: matched.has(taskCreateRoute.id),
    };
    // The router is constructed before RouterProvider supplies the real context,
    // so the very first render of a deep-linked URL can arrive with an empty
    // context; the provider's context lands on the next synchronous pass.
    if (!context.happyAgents) return null;
    return (
        <AppHappyAgentView
            appearance={context.appearance}
            browserContent={context.browserContent}
            buildIdentity={context.buildIdentity}
            performance={context.performance}
            htmlPreview={context.htmlPreview}
            {...(context.artifactPage ? { artifactPage: context.artifactPage } : {})}
            mediaWindow={context.mediaWindow}
            {...(context.externalLinkOpen ? { onExternalLinkOpen: context.externalLinkOpen } : {})}
            chatId={params.chatId}
            groupId={params.groupId}
            {...(context.daemon ? { daemon: context.daemon } : {})}
            {...(context.agentUpdate ? { agentUpdate: context.agentUpdate } : {})}
            {...(context.agentReleaseNotes ? { agentReleaseNotes: context.agentReleaseNotes } : {})}
            {...(context.happyOnboarding ? { happyOnboarding: context.happyOnboarding } : {})}
            {...(context.experiments ? { experiments: context.experiments } : {})}
            {...(context.projectsVisibility
                ? { projectsVisibility: context.projectsVisibility }
                : {})}
            {...(context.stemCellAnimation ? { stemCellAnimation: context.stemCellAnimation } : {})}
            {...(context.gptLive ? { gptLive: context.gptLive } : {})}
            {...(context.keepAwake ? { keepAwake: context.keepAwake } : {})}
            {...(context.statusBar ? { statusBar: context.statusBar } : {})}
            {...(context.titleShimmer ? { titleShimmer: context.titleShimmer } : {})}
            {...(context.commandPalette ? { commandPalette: context.commandPalette } : {})}
            {...(context.navigationOrder ? { navigationOrder: context.navigationOrder } : {})}
            {...(context.sidebarCollapse ? { sidebarCollapse: context.sidebarCollapse } : {})}
            {...(context.sidebarSearch ? { sidebarSearch: context.sidebarSearch } : {})}
            {...(context.attention ? { attention: context.attention } : {})}
            {...(context.sidebarVisibility ? { sidebarVisibility: context.sidebarVisibility } : {})}
            settings={context.settings}
            botCreateOpen={shows.botCreate}
            taskCreateOpen={shows.taskCreate}
            inboxOpen={shows.inbox}
            artifactsOpen={shows.artifacts}
            {...(shows.artifacts && params.artifactId !== undefined
                ? { artifactId: params.artifactId }
                : {})}
            {...(shows.surface && params.surfaceId !== undefined
                ? { surfaceId: params.surfaceId }
                : {})}
            {...(shows.surface &&
            params.chatGroupId !== undefined &&
            params.chatAgentId !== undefined
                ? { surfaceChat: { groupId: params.chatGroupId, chatId: params.chatAgentId } }
                : {})}
            onSurfaceOpen={(happyAgentId, surfaceId) =>
                happyAgentRouterSurfaceOpen(router, context, happyAgentId, surfaceId)
            }
            onSurfaceChatShow={(happyAgentId, surfaceId, chat) =>
                surfaceChatShow(
                    router,
                    happyAgentId,
                    surfaceId,
                    chat === undefined
                        ? undefined
                        : {
                              groupId: chat.groupId as HappyAgentGroupId,
                              sessionId: chat.chatId as HappyAgentSessionId,
                          },
                )
            }
            blueprintOpen={shows.blueprint}
            // Offered only where the route exists, which is what puts the
            // workbench row in a development sidebar and nowhere else.
            {...(import.meta.env.DEV
                ? { onBlueprintOpen: () => void navigate({ to: "/blueprint" }) }
                : {})}
            onBotCreateOpen={(happyAgentId) =>
                void navigate({ params: { happyAgentId }, to: "/bots/new/$happyAgentId" })
            }
            onTaskCreateOpen={(happyAgentId) =>
                void navigate({ params: { happyAgentId }, to: "/tasks/new/$happyAgentId" })
            }
            onInboxOpen={() =>
                void navigate({
                    params: { happyAgentId: params.happyAgentId ?? happyAgentDefaultId(context) },
                    to: "/inbox/$happyAgentId",
                })
            }
            onArtifactsOpen={() =>
                void navigate({
                    params: { happyAgentId: params.happyAgentId ?? happyAgentDefaultId(context) },
                    to: "/artifacts/$happyAgentId",
                })
            }
            onArtifactOpen={(happyAgentId, artifactId) =>
                void navigate({
                    params: { artifactId, happyAgentId },
                    to: "/artifacts/$happyAgentId/$artifactId",
                })
            }
            onArtifactClose={(happyAgentId) => happyAgentRouterArtifactClose(router, happyAgentId)}
            onUpdateApply={context.onUpdateApply}
            platform={context.platform}
            happyAgentId={params.happyAgentId ?? happyAgentDefaultId(context)}
            happyAgents={context.happyAgents}
            update={context.update}
            windowState={context.windowState}
            onChatSelect={(happyAgentId, groupId, chatId, replace) =>
                void navigate(
                    groupId === undefined
                        ? { params: { happyAgentId }, replace, to: "/chats/$happyAgentId" }
                        : chatId
                          ? {
                                params: { chatId, groupId, happyAgentId },
                                replace,
                                to: "/chats/$happyAgentId/$groupId/$chatId",
                            }
                          : {
                                params: { groupId, happyAgentId },
                                replace,
                                to: "/chats/$happyAgentId/$groupId",
                            },
                )
            }
            onChatClose={(happyAgentId, groupId, chatId, fallbackChatId) => {
                const changed = router.history.sessionForget(
                    happyAgentId,
                    groupId,
                    chatId,
                    fallbackChatId,
                );
                if (changed && router.history.subscribers.size === 0)
                    void router.load({ action: { type: "REPLACE" } });
                return changed;
            }}
            onGroupClose={(happyAgentId, groupId) =>
                happyAgentRouterGroupForget(router, happyAgentId, groupId)
            }
            onFileClose={(happyAgentId, groupId, path) => {
                // The route helper owns history repair; the surface owns the
                // tab bytes and closes those immediately after this callback.
                happyAgentRouterFileForget(router, happyAgentId, groupId, path);
            }}
            onFileSelect={(happyAgentId, groupId, chatId, path, fileKind, replace) => {
                if (chatId) {
                    void navigate({
                        params: { chatId, fileKind, filePath: path, groupId, happyAgentId },
                        replace,
                        to: "/chats/$happyAgentId/$groupId/$chatId/file/$fileKind/$filePath",
                    });
                    return;
                }
                void navigate({
                    params: { fileKind, filePath: path, groupId, happyAgentId },
                    replace,
                    to: "/chats/$happyAgentId/$groupId/file/$fileKind/$filePath",
                });
            }}
            onSettingsOpen={() =>
                void navigate({
                    params: { section: HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY },
                    to: "/settings/$section",
                })
            }
            // Settings has one destination per category, and the palette offers
            // them by name. The address stays this file's business: the view is
            // handed the one destination it asked for and never the router.
            onSettingsSectionOpen={(section) =>
                void navigate({
                    params: {
                        section: happyAgentSettingsCategoryExists(section)
                            ? section
                            : HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY,
                    },
                    to: "/settings/$section",
                })
            }
        />
    );
}

/**
 * Local route glue. Closing settings returns the reader to where they were
 * before it, however many categories they looked through; a window opened
 * straight onto settings has nowhere behind it and lands on the home address.
 */
function HappyAgentSettingsRoute() {
    const context = useRouteContext({ strict: false }) as unknown as HappyAgentRouterContext;
    const navigate = useNavigate();
    const router = useRouter();
    const params = useParams({ strict: false });
    return (
        <AppHappyAgentSettingsView
            appearance={context.appearance}
            browserPasswordsAvailable={context.browserPasswordsAvailable ?? false}
            update={context.update}
            onUpdateApply={context.onUpdateApply}
            {...(context.daemon ? { daemon: context.daemon } : {})}
            {...(context.debug ? { debug: context.debug } : {})}
            {...(context.profiler ? { profiler: context.profiler } : {})}
            {...(context.experiments ? { experiments: context.experiments } : {})}
            {...(context.projectsVisibility
                ? { projectsVisibility: context.projectsVisibility }
                : {})}
            {...(context.stemCellAnimation ? { stemCellAnimation: context.stemCellAnimation } : {})}
            {...(context.usageAnalytics ? { usageAnalytics: context.usageAnalytics } : {})}
            {...(context.gptLive ? { gptLive: context.gptLive } : {})}
            {...(context.keepAwake ? { keepAwake: context.keepAwake } : {})}
            {...(context.statusBar ? { statusBar: context.statusBar } : {})}
            {...(context.attention ? { attention: context.attention } : {})}
            onCategorySelect={(section) =>
                void navigate({ params: { section }, to: "/settings/$section" })
            }
            onClose={() => happyAgentRouterSettingsClose(router)}
            happyAgents={context.happyAgents}
            platform={context.platform}
            section={params.section ?? HAPPY_AGENT_SETTINGS_DEFAULT_CATEGORY}
            settings={context.settings}
            {...(context.titleShimmer ? { titleShimmer: context.titleShimmer } : {})}
            {...(context.sidebarVisibility ? { sidebarVisibility: context.sidebarVisibility } : {})}
            windowState={context.windowState}
        />
    );
}

/**
 * Creates the router that owns the local window's location lifetime. Local
 * sessions are grouped by the daemon's projects, so their address is the group —
 * the project, or the worktree inside it, by the durable id the daemon assigned
 * it, which keeps a filesystem layout out of the URL and survives a rename — and
 * then the session inside it. The machine comes first, because the same project
 * name may exist on several of them: `/chats/$happyAgentId/$groupId/$chatId`. It stays
 * one stable address, so the UI never keeps a second competing selection in a
 * store.
 */
export function happyAgentRouterCreate(history: HappyAgentRouterHistory = defaultHistory()) {
    const router = createRouter({
        context: undefined as unknown as HappyAgentRouterContext,
        defaultPreload: false,
        history,
        routeTree,
        // The application owns scrolling inside its own scrollports; letting the
        // router restore or reset window scroll would fight them. `false`, not a
        // function answering false: any function turns on the router's tracking
        // of every element that scrolls anywhere in the document, which only that
        // router's own navigation clears. Each connection has its own router, so
        // one not on screen kept every scrolled transcript alive after it closed.
        // What `false` leaves is a reset of the window, which never scrolls.
        scrollRestoration: false,
        scrollToTopSelectors: [],
    });
    // Every navigation that leaves a conversation passes here first, while the
    // conversation being left is still the open one: what it holds is noted,
    // so Create never takes the reader back to new work they left a draft in.
    router.subscribe("onBeforeNavigate", (event) => {
        if (event.fromLocation === undefined) return;
        const left = conversationAddressed(router, event.fromLocation);
        if (left === undefined) return;
        const staying = conversationAddressed(router, event.toLocation);
        if (staying?.happyAgentId === left.happyAgentId && staying.chatId === left.chatId) return;
        const session = router.options.context?.happyAgents
            ?.get()
            .happyAgents.find((happyAgent) => happyAgent.id === left.happyAgentId)?.session;
        if (session?.spaces === undefined) return;
        const content = happyAgentConversationContent(
            session.workspace.get().conversation,
            left.chatId,
        );
        if (content !== undefined) session.spaces.stemCellContentUpdate(left.chatId, content);
    });
    return router;
}

/** The conversation one address shows, by the router's own route identity. */
function conversationAddressed(
    router: { matchRoutes: (location: ParsedLocation) => readonly AnyRouteMatch[] },
    location: ParsedLocation,
): { readonly happyAgentId: string; readonly chatId: HappyAgentSessionId } | undefined {
    for (const match of router.matchRoutes(location)) {
        const params = match.params as Record<string, string | undefined>;
        const chatId =
            match.routeId === chatRoute.id || match.routeId === chatFileRoute.id
                ? params.chatId
                : match.routeId === surfaceChatRoute.id
                  ? params.chatAgentId
                  : undefined;
        if (chatId !== undefined && params.happyAgentId !== undefined)
            return { happyAgentId: params.happyAgentId, chatId: chatId as HappyAgentSessionId };
    }
    return undefined;
}

/**
 * Shows a Surface's shared chat beside it, at the conversation it is, or
 * hides it. The chat is found in the background; a reader who has moved
 * on by the time it answers stays where they went.
 */
function surfaceChatShow(
    router: HappyAgentRouter,
    happyAgentId: string,
    surfaceId: string,
    chat: HappyAgentSessionLocation | undefined,
): void {
    const shown = happyAgentRoutePathParse(router.history.location.pathname);
    if (
        shown?.kind !== "surface" ||
        shown.happyAgentId !== happyAgentId ||
        shown.surfaceId !== surfaceId
    )
        return;
    // Showing or hiding the chat is not a step to go back through.
    void router.navigate(
        chat === undefined
            ? {
                  params: { happyAgentId, surfaceId },
                  replace: true,
                  to: "/surfaces/$happyAgentId/$surfaceId",
              }
            : {
                  params: {
                      chatAgentId: chat.sessionId,
                      chatGroupId: chat.groupId,
                      happyAgentId,
                      surfaceId,
                  },
                  replace: true,
                  to: "/surfaces/$happyAgentId/$surfaceId/chat/$chatGroupId/$chatAgentId",
              },
    );
}

/** Opens one Surface, as its sidebar row does: with its chat beside it if the reader left it open. */
function happyAgentRouterSurfaceOpen(
    router: HappyAgentRouter,
    context: HappyAgentRouterContext,
    happyAgentId: string,
    surfaceId: string,
): void {
    const catalog = happyAgentSurfaces(context, happyAgentId)?.catalog();
    const shown = catalog?.get().chatsShown.has(surfaceId as HappyAgentSurfaceId);
    const found = shown ? catalog?.get().chats.get(surfaceId as HappyAgentSurfaceId) : undefined;
    if (found !== undefined) {
        void router.navigate({
            params: {
                chatAgentId: found.sessionId,
                chatGroupId: found.groupId,
                happyAgentId,
                surfaceId,
            },
            to: "/surfaces/$happyAgentId/$surfaceId/chat/$chatGroupId/$chatAgentId",
        });
        return;
    }
    void router.navigate({
        params: { happyAgentId, surfaceId },
        to: "/surfaces/$happyAgentId/$surfaceId",
    });
    // Not found yet in this run: it opens beside the Surface the way
    // the header's Chat opens it, saying so while it is found.
    if (shown && catalog)
        catalog
            .chatOpen(surfaceId as HappyAgentSurfaceId)
            .then((location) => surfaceChatShow(router, happyAgentId, surfaceId, location))
            .catch(() => undefined);
}

/**
 * Opens a Happy link the reader followed in a page the window shows — an
 * artifact or an HTML preview — on the Happy Agent on screen, exactly as the
 * same link in a message opens: an artifact beside the conversation, an
 * agent on its conversation, a workspace or project where the reader left
 * it, a Surface as its sidebar row does, and a file read-only beside the
 * conversation at the lines it named. A malformed link, one naming something
 * the reader's list does not hold, or a service or person does nothing.
 */
export function happyAgentRouterHappyLinkOpen(router: HappyAgentRouter, url: string): void {
    const context = router.options.context;
    const directory = context?.happyAgents?.get();
    const happyAgentId = directory?.activeHappyAgentId;
    const session = directory?.happyAgents.find((entry) => entry.id === happyAgentId)?.session;
    if (context === undefined || happyAgentId === undefined || session === undefined) return;
    const link = parseHappyUrl(url);
    if (link === undefined) return;
    if (link.type === "file") {
        const file = happyAgentFileLinkParse(url);
        if (file !== undefined) session.workspace.fileLinkOpen(file, fileTabKind(file.path));
        return;
    }
    const reference = link.reference;
    switch (reference.kind) {
        case "artifact":
            if (session.artifacts !== undefined)
                session.workspace.panel.artifactViewOpen(
                    reference.id as HappyAgentArtifactId,
                    reference.version,
                );
            return;
        case "surface": {
            const catalog = session.surfaces?.catalog().get();
            if (catalog && messageReferenceSurfaceNames(catalog).has(reference.id))
                happyAgentRouterSurfaceOpen(router, context, happyAgentId, reference.id);
            return;
        }
        case "agent":
        case "workspace":
        case "project": {
            const workspace = session.workspace.get();
            const entities = messageReferenceEntities(workspace.list);
            const entity = (
                reference.kind === "agent"
                    ? entities.agents
                    : reference.kind === "workspace"
                      ? entities.workspaces
                      : entities.projects
            ).get(reference.id);
            if (entity === undefined) return;
            // A workspace or project opens where the reader left it, the way
            // its sidebar row does; an agent opens on its own conversation.
            const chatId = entity.agentId ?? workspace.groupResume.get(entity.groupId);
            if (chatId === undefined)
                happyAgentRouterGroupOpen(router, happyAgentId, entity.groupId);
            else
                happyAgentRouterConversationOpen(router, happyAgentId, {
                    groupId: entity.groupId,
                    sessionId: chatId as HappyAgentSessionId,
                });
            return;
        }
        default:
            // Services and people open nowhere, in a message or here.
            return;
    }
}

/**
 * Addresses one local session: the single place that turns a session's location
 * into a local URL. The desktop shell never hand-builds one.
 */
export function happyAgentRouterConversationOpen(
    router: HappyAgentRouter,
    happyAgentId: string,
    location: HappyAgentSessionLocation,
): void {
    void router.navigate({
        params: { chatId: location.sessionId, groupId: location.groupId, happyAgentId },
        to: "/chats/$happyAgentId/$groupId/$chatId",
    });
}

/** The conversation addresses, the workspace proper rather than the window's other pages. */
const CONVERSATION_ROUTE_IDS = new Set<string>([
    chatsIndexRoute.id,
    groupRoute.id,
    chatRoute.id,
    groupFileRoute.id,
    chatFileRoute.id,
]);

/** Uses the router's explicit route identity, never a pathname convention. */
export function happyAgentRouterWorkspaceVisible(router: HappyAgentRouter): boolean {
    return router.state.matches.some((match) => CONVERSATION_ROUTE_IDS.has(match.routeId));
}

/**
 * Leaves an artifact for wherever it was opened from — the catalog, or the chat
 * whose panel listed it. A window opened straight onto an artifact has nowhere
 * behind it, so it lands on the catalog in place rather than growing a step
 * that Back would return to the artifact through.
 */
export function happyAgentRouterArtifactClose(
    router: HappyAgentRouter,
    happyAgentId: string,
): void {
    if (router.history.canGoBack()) {
        router.history.back();
        return;
    }
    void router.navigate({
        params: { happyAgentId },
        replace: true,
        to: "/artifacts/$happyAgentId",
    });
}

/**
 * Addresses a group that holds no conversation yet, such as a worktree the
 * reader has just added. The conversation started in it re-addresses the same
 * group through `happyAgentRouterConversationOpen` once it exists.
 */
export function happyAgentRouterGroupOpen(
    router: HappyAgentRouter,
    happyAgentId: string,
    groupId: string,
): void {
    void router.navigate({
        params: { groupId, happyAgentId },
        to: "/chats/$happyAgentId/$groupId",
    });
}

/**
 * Removes a closed file tab from this window's navigation stack. A current file
 * lands on the nearest surviving destination; a file that was the window's only
 * destination uncovers its addressed session or workspace.
 */
export function happyAgentRouterFileForget(
    router: HappyAgentRouter,
    happyAgentId: string,
    groupId: string,
    path: string,
): void {
    const changed = router.history.fileForget(happyAgentId, groupId, path);
    if (changed && router.history.subscribers.size === 0)
        void router.load({ action: { type: "REPLACE" } });
}

/**
 * Takes bot subtasks the host stopped listing out of this window's navigation.
 * Each removed conversation's remembered addresses go, so Back never reopens a
 * task that was archived. A reader who stood in one is then put on `open`, the
 * nearest conversation above it that is still listed, in place of where they
 * were rather than as a new step.
 */
export function happyAgentRouterSubtasksForget(
    router: HappyAgentRouter,
    happyAgentId: string,
    removed: readonly HappyAgentSessionLocation[],
    open: HappyAgentSessionLocation | undefined,
): void {
    // Read before the stack is repaired: the repair itself moves a reader off
    // a removed conversation, and only one who stood there is moved on again.
    const shown = happyAgentRoutePathParse(router.history.location.pathname);
    const stoodInRemoved =
        (shown?.kind === "chat" || shown?.kind === "file") &&
        shown.happyAgentId === happyAgentId &&
        removed.some((location) => location.sessionId === shown.chatId);
    let changed = false;
    for (const location of removed)
        changed =
            router.history.sessionForget(happyAgentId, location.groupId, location.sessionId) ||
            changed;
    if (open !== undefined && stoodInRemoved) {
        void router.navigate({
            params: { chatId: open.sessionId, groupId: open.groupId, happyAgentId },
            replace: true,
            to: "/chats/$happyAgentId/$groupId/$chatId",
        });
        return;
    }
    if (changed && router.history.subscribers.size === 0)
        void router.load({ action: { type: "REPLACE" } });
}

/**
 * Takes a group that stopped existing out of this window's navigation — archived
 * here, or from another window or machine.
 *
 * Every remembered address naming it goes, not just the one on screen: one
 * archive kills the workspace and each conversation opened inside it. The stack
 * is an array rather than the browser's, so they are removed outright.
 *
 * It moves nobody who was not standing on what went. A Happy Agent reports the removal
 * whether or not this window shows it, so a reader on another project, the Happy Agent's
 * list, or settings keeps their place while dead addresses drop from behind.
 */
export function happyAgentRouterGroupForget(
    router: HappyAgentRouter,
    happyAgentId: string,
    groupId: string,
): void {
    const changed = router.history.groupForget(happyAgentId, groupId);
    // A rendered window is subscribed to its own history and reloads from the
    // notification above. One that is not — a window still starting up — has to
    // be told, the same way the router tells itself when it commits a location
    // with nothing listening.
    if (changed && router.history.subscribers.size === 0)
        void router.load({ action: { type: "REPLACE" } });
}

/**
 * Closes settings: every settings page leaves this window's navigation and the
 * reader is back where they were before opening it, or on the home address
 * when the window has been nowhere else.
 */
export function happyAgentRouterSettingsClose(router: HappyAgentRouter): void {
    const changed = router.history.settingsForget();
    if (changed && router.history.subscribers.size === 0)
        void router.load({ action: { type: "REPLACE" } });
}

/**
 * Creates deterministic local-router history for application and navigation
 * tests. The starting point is given as a URL because that is what those tests
 * are about — which place a URL addresses — and it is parsed here exactly as one
 * arriving from the document would be.
 */
export function happyAgentMemoryHistoryCreate(
    initialUrl = "/chats/local",
): HappyAgentRouterHistory {
    const route = happyAgentRoutePathParse(initialUrl);
    return happyAgentHistoryCreate({ initialEntries: route ? [route] : [] });
}

/**
 * The stack every window navigates. It is this application's own array rather
 * than the browser's, so an address that stops existing can be removed from it;
 * the document URL only mirrors where the reader is. A window given somewhere to
 * keep it reopens where it was left.
 */
function defaultHistory(): HappyAgentRouterHistory {
    return happyAgentHistoryCreate();
}

export type HappyAgentRouter = ReturnType<typeof happyAgentRouterCreate>;

/**
 * Registers this window's route tree as the one every router helper is typed
 * against. There is exactly one router in this application, so `navigate`,
 * `redirect`, and `useParams` can name its addresses directly and a path or
 * parameter that does not exist stops being a compile error waiting to happen.
 */
declare module "@tanstack/react-router" {
    interface Register {
        router: HappyAgentRouter;
    }
}
