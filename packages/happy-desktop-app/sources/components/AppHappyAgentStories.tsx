import { useSyncExternalStore } from "react";
import type {
    HappyAgentBot,
    HappyAgentClockStore,
    HappyAgentRichTasksStore,
    HappyAgentStoriesStore,
    HappyAgentStoryOpen,
    HappyAgentStoryRing,
    HappyAgentSurfaceCatalogSnapshot,
    HappyAgentTask,
    RichTaskListEntry,
    happyAgentProtocol,
} from "happy-desktop-state";
import {
    avatarToneOf,
    localAgoTime,
    ModalOverlay,
    StoriesRow,
    StoryViewer,
    type ConversationRich,
    type StoryMark,
    type StoryQuoteView,
    type ToneName,
} from "happy-desktop-ui";

/** What the window already knows to name and picture whoever posted or replied. */
export interface AppStoryDirectory {
    readonly tasks: readonly HappyAgentTask[];
    /** The rich list's tasks, which carry their icons. */
    readonly entries: readonly RichTaskListEntry[];
    readonly bots: readonly HappyAgentBot[];
    /** The reader and the teammates the Surfaces catalog knows, with their photos. */
    readonly catalog: HappyAgentSurfaceCatalogSnapshot;
}

type Poster = { readonly name: string; readonly mark: StoryMark };
const posterNamed = (name: string, imageUrl: string | undefined, tone?: ToneName): Poster => ({
    name,
    mark: { kind: "person", label: name, tone, ...(imageUrl ? { imageUrl } : {}) },
});

/** A person by their photo where the window holds one, else their coloured initial. */
function personOf(userId: string | null, { catalog, tasks }: AppStoryDirectory): Poster {
    const person = userId === null ? catalog.profile : catalog.users.get(userId);
    const owner = tasks.find((task) => task.owner?.userId === userId)?.owner;
    return posterNamed(
        person?.name ?? owner?.name ?? "Someone",
        person?.photo?.url ?? owner?.avatar?.url,
        avatarToneOf(userId ?? catalog.viewer?.userId ?? ""),
    );
}

/** A bot by its picture, a task by its icon, a person by their photo. */
function posterOf(poster: happyAgentProtocol.StoryPoster, directory: AppStoryDirectory): Poster {
    if (poster.kind === "user") return personOf(poster.userId, directory);
    const bot = directory.bots.find(
        (each) => each.id === poster.botId || each.conversation.id === poster.agentId,
    );
    if (bot) return posterNamed(bot.name, bot.avatar?.url);
    const entry = directory.entries.find(
        (each) =>
            each.kind === "task" &&
            (each.task.id === poster.taskId || each.task.agent.id === poster.agentId),
    );
    const card = entry?.kind === "task" ? entry : undefined;
    const name =
        card?.task.name ||
        directory.tasks.find((each) => each.conversation.id === poster.agentId)?.name ||
        "Agent";
    return { name, mark: { kind: "icon", src: card?.iconSrc, label: name } };
}

/** Each task's ring, by task id: the card's disc wears it and opens it. */
export function appStoryTaskRings(rings: readonly HappyAgentStoryRing[]) {
    const byTask = new Map<string, { id: string; total: number; unseen: number }>();
    for (const { id, poster, stories, unseen } of rings)
        if (poster.kind === "agent" && poster.taskId !== null)
            byTask.set(poster.taskId, { id, total: stories.length, unseen });
    return byTask;
}

/** What a rich chat reads its story quotes and unread teammates from. */
export interface AppStoryChat {
    readonly stories: HappyAgentStoriesStore;
    readonly richTasks: HappyAgentRichTasksStore;
    readonly directory: AppStoryDirectory;
}

/** One agent's rich chat: quotes while stories are on, and who wrote while it was unread. */
export function appStoryChatRich(chat: AppStoryChat, agentId: string): ConversationRich {
    const { stories, directory } = chat;
    // An ended story, or one whose frame cannot be read, draws no quote.
    const quote = (artifactId: string): StoryQuoteView | undefined => {
        const held = stories.quoteOf(artifactId);
        if (held.kind !== "live") return held.kind === "loading" ? { kind: "loading" } : undefined;
        if (held.frame.kind === "failed") return undefined;
        const { story, frame, segment } = held;
        const poster = posterOf(story.poster, directory);
        return { kind: "live", frame, segment, poster, caption: story.caption };
    };
    const unread = chat.richTasks.unreadOf(agentId);
    const from = (unread?.from ?? []).filter((id) => id !== directory.catalog.viewer?.userId);
    return {
        ...(stories.get().mode === "on" ? { storyQuote: quote } : {}),
        onStoryQuoteOpen: stories.quoteOpen,
        faceOf: (userId) => personOf(userId, directory).mark,
        unread: unread && from.length > 0 ? { since: unread.since, from } : null,
    };
}

/** The stories header: "My story" first, with a plus while the reader has none up. */
export function AppHappyAgentStoriesRow(props: {
    readonly rings: readonly HappyAgentStoryRing[];
    readonly directory: AppStoryDirectory;
    readonly store: HappyAgentStoriesStore;
}) {
    const { rings, directory } = props;
    const items = rings.map(({ id, self, poster, stories, unseen }) => ({
        id,
        self,
        segments: { total: stories.length, unseen: self ? 0 : unseen },
        ...posterOf(poster, directory),
    }));
    if (!items.some((item) => item.self)) {
        const me = personOf(directory.catalog.viewer?.userId ?? null, directory);
        items.unshift({ id: "self", self: true, segments: { total: 0, unseen: 0 }, ...me });
    }
    return <StoriesRow items={items} onOpen={props.store.ringOpen} />;
}

/** The open story, over the window, until it is closed or walked past the last. */
export function AppHappyAgentStoryViewer(props: {
    readonly open: HappyAgentStoryOpen;
    readonly directory: AppStoryDirectory;
    readonly store: HappyAgentStoriesStore;
    readonly clock: HappyAgentClockStore;
}) {
    // The minute the clock is in, so the times redraw once a minute.
    const minute = () => Math.floor(props.clock.get() / 60_000) * 60_000;
    const now = useSyncExternalStore(props.clock.subscribe, minute, minute);
    const { open, store, directory } = props;
    const { frame, replies, story } = open;
    const reply = (message: happyAgentProtocol.UserMessage) => ({
        id: message.id,
        ...personOf(message.metadata.userId ?? null, directory),
        text: message.content
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join(" "),
        time: localAgoTime(message.createdAt, now),
    });
    const replyAgent = {
        kind: "agent",
        agentId: story.replyAgentId,
        taskId: null,
        botId: null,
    } as const;
    return (
        <ModalOverlay onDismiss={store.viewerClose} placement="center">
            <StoryViewer
                action={open.action}
                caption={story.caption}
                frame={frame}
                onClose={store.viewerClose}
                onReplySend={store.replySend}
                {...(open.repostOffered ? { onRepost: store.storyRepost } : {})}
                onStep={store.storyStep}
                {...(open.takeDownOffered ? { onTakeDown: store.storyTakeDown } : {})}
                poster={posterOf(story.poster, directory)}
                replies={
                    replies.status === "ready"
                        ? // The daemon reads replies newest first; the viewer wants them oldest first.
                          { status: "ready", items: replies.messages.map(reply).reverse() }
                        : replies
                }
                reply={open.reply}
                replyFocus={open.replyFocus}
                replyTarget={posterOf(replyAgent, directory).name}
                roundUrl={open.roundUrl}
                segment={open.segment}
                time={localAgoTime(story.postedAt, now)}
            />
        </ModalOverlay>
    );
}
