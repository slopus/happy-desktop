import {
    HappyAgentUserProfilePage,
    type HappyAgentUserProfileView,
} from "../../src/pages/people/HappyAgentUserProfilePage";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-041";

const WINDOW = { width: 1100, height: 760 } as const;

const profile: HappyAgentUserProfileView = {
    name: "Maya Okafor",
    photo: {
        imageUrl: new URL("../assets/user-profile-photo.webp", import.meta.url).href,
        thumbhash: "lygKFwTqpkl5endwmLeHl3d4ilBHB4kB",
    },
    placeholderSeed: "user-maya",
    jobTitle: "Product designer",
    teamRole: "Owner",
    tasks: { total: 48, active: 5 },
    activeDays: 22,
    lastActive: "12m",
    tokens: { hour: 184_200, day: 2_418_000, week: 14_960_000, month: 61_300_000 },
    recentTasks: [
        { id: "task-1", name: "Redesign the onboarding sky", meta: "Working · 12m" },
        { id: "task-2", name: "Members search in Settings", meta: "3h" },
        { id: "task-3", name: "Audit avatar sizes across the sidebar", meta: "Sat" },
        { id: "task-4", name: "Fix the feed's unread count", meta: "Archived · 2/11" },
    ],
};

const newcomer: HappyAgentUserProfileView = {
    name: "Theo Lindqvist",
    placeholderSeed: "user-theo",
    teamRole: "Member",
    tasks: { total: 0, active: 0 },
    activeDays: 0,
    lastActive: "Never",
    tokens: { hour: 0, day: 0, week: 0, month: 0 },
    recentTasks: [],
};

export function HappyAgentUserProfileBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="One person on a Happy Cloud server: their face, name, job title and team role centred at the top, their usage as tiles, and the tasks they last worked in, each of which opens the task."
            title="HappyAgentUserProfilePage"
        >
            <FullScreenSpecimen
                detail="A member with a photo, a job title, usage in every window, and recent tasks."
                label="Profile"
                number="01"
                screen="01-profile-1100x760"
                window={WINDOW}
            >
                <HappyAgentUserProfilePage
                    loading={false}
                    onTaskOpen={() => undefined}
                    profile={profile}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Someone who just joined: no photo, so their placeholder; nothing used yet."
                label="New member"
                number="02"
                screen="02-new-member-1100x760"
                window={WINDOW}
            >
                <HappyAgentUserProfilePage
                    loading={false}
                    onTaskOpen={() => undefined}
                    profile={newcomer}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Before the first answer arrives."
                label="Loading"
                number="03"
                screen="03-loading-1100x760"
                window={WINDOW}
            >
                <HappyAgentUserProfilePage loading onTaskOpen={() => undefined} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The server refused, such as for someone on another team."
                label="Unavailable"
                number="04"
                screen="04-error-1100x760"
                window={WINDOW}
            >
                <HappyAgentUserProfilePage
                    error="This person isn't on your team."
                    loading={false}
                    onTaskOpen={() => undefined}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
