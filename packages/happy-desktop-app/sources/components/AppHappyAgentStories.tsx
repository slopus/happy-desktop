import { useSyncExternalStore } from "react";
import type {
    HappyAgentArtifactPeopleStore,
    HappyAgentBot,
    HappyAgentClockStore,
    HappyAgentStoriesStore,
    HappyAgentStoryOpen,
    HappyAgentStoryRing,
    HappyAgentTask,
    RichTaskListEntry,
    happyAgentProtocol,
} from "happy-desktop-state";
import {
    localAgoTime,
    ModalOverlay,
    StoriesRow,
    StoryViewer,
    type StoryMark,
    type StoryViewerReply,
} from "happy-desktop-ui";

/** What the window already knows to name and picture whoever posted a story. */
export interface AppStoryDirectory {
    readonly tasks: readonly HappyAgentTask[];
    /** The rich list's tasks, which carry their clay icons. */
    readonly entries: readonly RichTaskListEntry[];
    readonly bots: readonly HappyAgentBot[];
    readonly names: ReadonlyMap<string, string>;
    readonly people?: HappyAgentArtifactPeopleStore;
}

type Poster = { readonly name: string; readonly mark: StoryMark };

function personOf(userId: string | null, directory: AppStoryDirectory): Poster {
    const owner = directory.tasks.find((task) => task.owner?.userId === userId)?.owner;
    const name = owner?.name ?? (userId === null ? undefined : directory.names.get(userId));
    if (userId !== null && name === undefined) directory.people?.userNameRequest(userId);
    const label = name ?? (userId === null ? "Me" : "Someone");
    return {
        name: label,
        mark: { kind: "person", label, ...(owner?.avatar ? { imageUrl: owner.avatar.url } : {}) },
    };
}

/** A bot by its picture, a task by its clay icon, a person by their photo. */
export function appStoryPoster(
    poster: happyAgentProtocol.StoryPoster,
    directory: AppStoryDirectory,
): Poster {
    if (poster.kind === "user") return personOf(poster.userId, directory);
    const bot = directory.bots.find(
        (each) => each.id === poster.botId || each.conversation.id === poster.agentId,
    );
    if (bot)
        return {
            name: bot.name,
            mark: bot.avatar
                ? { kind: "person", label: bot.name, imageUrl: bot.avatar.url }
                : { kind: "icon", slug: null, label: bot.name },
        };
    const wire = directory.entries.find(
        (entry) =>
            entry.kind === "task" &&
            (entry.task.id === poster.taskId || entry.task.agent.id === poster.agentId),
    );
    const task = directory.tasks.find(
        (each) => each.id === poster.taskId || each.conversation.id === poster.agentId,
    );
    const name = (wire?.kind === "task" ? wire.task.name : undefined) || task?.name || "Agent";
    const slug = wire?.kind === "task" ? (wire.task.icon?.slug ?? null) : null;
    return { name, mark: { kind: "icon", slug, label: name } };
}

/** The stories header: "My story" first, with a plus while the reader has none up. */
export function AppHappyAgentStoriesRow(props: {
    readonly rings: readonly HappyAgentStoryRing[];
    readonly directory: AppStoryDirectory;
    readonly store: HappyAgentStoriesStore;
}) {
    const segments = (ring: HappyAgentStoryRing) => ({
        total: ring.stories.length,
        unseen: ring.self ? 0 : ring.unseen,
    });
    const items = props.rings.map((ring) => ({
        id: ring.id,
        self: ring.self,
        segments: segments(ring),
        ...appStoryPoster(ring.poster, props.directory),
    }));
    if (!items.some((item) => item.self))
        items.unshift({
            id: "self",
            self: true,
            segments: { total: 0, unseen: 0 },
            ...personOf(null, props.directory),
        });
    return <StoriesRow items={items} onOpen={props.store.ringOpen} />;
}

function repliesOf(
    open: HappyAgentStoryOpen,
    directory: AppStoryDirectory,
    now: number,
): StoryViewerReply[] {
    if (open.replies.status !== "ready") return [];
    return open.replies.messages.map((message) => {
        const person = personOf(message.metadata.userId ?? null, directory);
        return {
            id: message.id,
            name: person.name,
            mark: person.mark,
            text: message.content
                .flatMap((block) => (block.type === "text" ? [block.text] : []))
                .join(" "),
            time: localAgoTime(message.createdAt, now),
        };
    });
}

/** The open story, over the window, until it is closed or walked past the last. */
export function AppHappyAgentStoryViewer(props: {
    readonly open: HappyAgentStoryOpen;
    readonly rings: readonly HappyAgentStoryRing[];
    readonly directory: AppStoryDirectory;
    readonly store: HappyAgentStoriesStore;
    readonly clock: HappyAgentClockStore;
    readonly onArtifactOpen: (artifactId: string) => void;
}) {
    // The minute the clock is in, so the times redraw once a minute.
    const minute = () => Math.floor(props.clock.get() / 60_000) * 60_000;
    const now = useSyncExternalStore(props.clock.subscribe, minute, minute);
    const { open, store } = props;
    const ring = props.rings.find((each) => each.id === open.ringId);
    const poster = appStoryPoster(open.story.poster, props.directory);
    const target = appStoryPoster(
        { kind: "agent", agentId: open.story.replyAgentId, taskId: null, botId: null },
        props.directory,
    );
    const frame = open.frame;
    return (
        <ModalOverlay onDismiss={store.viewerClose} placement="center">
            <StoryViewer
                action={open.action}
                caption={open.story.caption}
                frame={frame.kind === "artifact" ? { kind: "artifact" } : frame}
                onClose={store.viewerClose}
                {...(frame.kind === "artifact"
                    ? { onFrameOpen: () => props.onArtifactOpen(frame.artifactId) }
                    : {})}
                onReplySend={store.replySend}
                {...(open.repostOffered ? { onRepost: store.storyRepost } : {})}
                onStep={store.storyStep}
                {...(open.takeDownOffered ? { onTakeDown: store.storyTakeDown } : {})}
                poster={poster}
                replies={
                    open.replies.status === "ready"
                        ? { status: "ready", items: repliesOf(open, props.directory, now) }
                        : open.replies
                }
                reply={open.reply}
                replyTarget={target.name}
                roundUrl={
                    frame.kind === "loading" || frame.kind === "failed" ? null : frame.roundUrl
                }
                segments={{
                    total: ring?.stories.length ?? 1,
                    current: Math.max(
                        0,
                        ring?.stories.findIndex(
                            (story) => story.artifactId === open.story.artifactId,
                        ) ?? 0,
                    ),
                }}
                time={localAgoTime(open.story.postedAt, now)}
            />
        </ModalOverlay>
    );
}
