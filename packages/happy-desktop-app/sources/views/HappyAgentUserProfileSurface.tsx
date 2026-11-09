import { useSyncExternalStore } from "react";
import type {
    HappyAgentClockStore,
    HappyAgentUserProfile,
    HappyAgentUserProfileStore,
    HappyAgentUserProfileTask,
} from "happy-desktop-state";
import {
    HappyAgentUserProfilePage,
    localAgoTime,
    type HappyAgentUserProfileView,
} from "happy-desktop-ui";

/** "Working · 12m", "Archived · Tue", or the time alone. */
function taskMeta(task: HappyAgentUserProfileTask, now: number): string {
    const state = task.archived ? "Archived" : task.working ? "Working" : undefined;
    const ago = localAgoTime(task.lastActivityAt, now);
    return state === undefined ? ago : `${state} · ${ago}`;
}

function profileView(profile: HappyAgentUserProfile, now: number): HappyAgentUserProfileView {
    return {
        name: profile.name,
        ...(profile.avatar
            ? { photo: { imageUrl: profile.avatar.url, thumbhash: profile.avatar.thumbhash } }
            : {}),
        placeholderSeed: profile.id,
        ...(profile.jobTitle === null ? {} : { jobTitle: profile.jobTitle }),
        ...(profile.teamRole === null ? {} : { teamRole: profile.teamRole.name }),
        tasks: profile.tasks,
        activeDays: profile.activeDays,
        lastActive:
            profile.lastActivityAt === null ? "Never" : localAgoTime(profile.lastActivityAt, now),
        tokens: profile.tokens,
        recentTasks: profile.recentTasks.map((task) => ({
            id: task.id,
            name: task.name,
            meta: taskMeta(task, now),
        })),
    };
}

/** One member's profile on Happy Cloud, read live while it is on screen. */
export function HappyAgentUserProfileSurface(props: {
    readonly store: HappyAgentUserProfileStore;
    readonly clock: HappyAgentClockStore;
    readonly onTaskOpen: (task: HappyAgentUserProfileTask) => void;
}) {
    const snapshot = useSyncExternalStore(props.store.subscribe, props.store.get, props.store.get);
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const profile = snapshot.profile;
    return (
        <HappyAgentUserProfilePage
            loading={snapshot.loading}
            {...(profile ? { profile: profileView(profile, now) } : {})}
            {...(snapshot.error ? { error: snapshot.error.message } : {})}
            onTaskOpen={(taskId) => {
                const task = profile?.recentTasks.find((entry) => entry.id === taskId);
                if (task) props.onTaskOpen(task);
            }}
        />
    );
}
