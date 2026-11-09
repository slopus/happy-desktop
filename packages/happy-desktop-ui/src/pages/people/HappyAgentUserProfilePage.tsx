import type { CSSProperties } from "react";
import { AvatarPlaceholder } from "../../AvatarPlaceholder";
import { Banner } from "../../Banner";
import { Icon } from "../../Icon";
import { SURFACE_HEADER_HEIGHT } from "../../InfoPanel";
import { ScrollArea } from "../../Scrollbar";
import { Spinner } from "../../Spinner";
import { StatTile } from "../../StatTile";
import { thumbhashDataUrl } from "../../thumbhashDataUrl";
import { Toolbar } from "../../Toolbar";

/** One of the person's tasks, as their profile lists it. */
export interface HappyAgentUserProfileTaskRow {
    readonly id: string;
    readonly name: string;
    /** Its state and last activity, already worded: "Working · 5 min ago". */
    readonly meta: string;
}

/** The person a profile shows, with everything already worded but the counts. */
export interface HappyAgentUserProfileView {
    readonly name: string;
    /** Their photo; until its bytes arrive the ThumbHash stands in. */
    readonly photo?: { readonly imageUrl: string; readonly thumbhash: string };
    /** Picks the placeholder a person without a photo wears, as everywhere else: their user ID. */
    readonly placeholderSeed: string;
    readonly jobTitle?: string;
    /** Their role on the team, named. */
    readonly teamRole?: string;
    readonly tasks: { readonly total: number; readonly active: number };
    /** UTC days in the last 30 they used anything. */
    readonly activeDays: number;
    /** When they last did anything, worded: "2 h ago", or "Never". */
    readonly lastActive: string;
    /** Tokens per window, summed over every provider and model. */
    readonly tokens: {
        readonly hour: number;
        readonly day: number;
        readonly week: number;
        readonly month: number;
    };
    /** Newest activity first. */
    readonly recentTasks: readonly HappyAgentUserProfileTaskRow[];
}

export interface HappyAgentUserProfilePageProps {
    /** True before the first answer, so nothing is claimed early. */
    readonly loading: boolean;
    readonly profile?: HappyAgentUserProfileView;
    /** Why the profile could not be read; what was read stays beneath it. */
    readonly error?: string;
    readonly onTaskOpen: (taskId: string) => void;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
}

const TOKENS = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const COUNT = new Intl.NumberFormat("en-US");

const TOKEN_WINDOWS = [
    { key: "hour", label: "Last hour" },
    { key: "day", label: "Last day" },
    { key: "week", label: "Last week" },
    { key: "month", label: "Last month" },
] as const;

/** The face's side in CSS pixels, as the stylesheet draws it. */
const FACE_SIDE = 88;

/**
 * One person on a Happy Cloud server: who they are, how much they have used,
 * and the tasks they last worked in. The face and name are centred at the top;
 * the face is the photo over its ThumbHash, or the placeholder their ID picks;
 * the usage and the tasks are read down the content column under them. The
 * caller words every time and opens a task, so every state renders from props.
 */
export function HappyAgentUserProfilePage(props: HappyAgentUserProfilePageProps) {
    const profile = props.profile;
    const placeholder = profile?.photo ? thumbhashDataUrl(profile.photo.thumbhash) : undefined;
    return (
        <div
            className={["happy-agent-user-profile", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-user-profile"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div className="happy-agent-user-profile__header">
                <Toolbar height={SURFACE_HEADER_HEIGHT} title="Profile" titleLevel={1} />
            </div>
            <ScrollArea
                className="happy-agent-user-profile__scroll"
                viewportClassName="happy-agent-user-profile__scroll-viewport"
            >
                <div className="happy-agent-user-profile__content">
                    {props.error ? (
                        <Banner tone="danger" title="Profile unavailable">
                            {props.error}
                        </Banner>
                    ) : null}
                    {profile === undefined ? (
                        props.loading ? (
                            <div className="happy-agent-user-profile__pending">
                                <Spinner size={16} />
                                <span>Reading the profile…</span>
                            </div>
                        ) : null
                    ) : (
                        <>
                            <div
                                className="happy-agent-user-profile__identity"
                                data-happy-desktop-ui="happy-agent-user-profile-identity"
                            >
                                <span
                                    aria-hidden="true"
                                    className="happy-agent-user-profile__face"
                                    data-happy-desktop-ui="happy-agent-user-profile-face"
                                    {...(placeholder
                                        ? { style: { backgroundImage: `url("${placeholder}")` } }
                                        : {})}
                                >
                                    {profile.photo ? (
                                        <img
                                            alt=""
                                            className="happy-agent-user-profile__photo"
                                            draggable={false}
                                            src={profile.photo.imageUrl}
                                        />
                                    ) : (
                                        <AvatarPlaceholder
                                            className="happy-agent-user-profile__photo"
                                            seed={profile.placeholderSeed}
                                            side={FACE_SIDE}
                                        />
                                    )}
                                </span>
                                <h2 className="happy-agent-user-profile__name">{profile.name}</h2>
                                {profile.jobTitle || profile.teamRole ? (
                                    <span className="happy-agent-user-profile__role">
                                        {[profile.jobTitle, profile.teamRole]
                                            .filter((part) => part)
                                            .join(" · ")}
                                    </span>
                                ) : null}
                            </div>
                            <section className="happy-agent-user-profile__section">
                                <h3 className="happy-agent-user-profile__section-title">Usage</h3>
                                <div className="happy-agent-user-profile__tiles">
                                    <StatTile
                                        className="happy-agent-user-profile__tile"
                                        hint={`${COUNT.format(profile.tasks.active)} active`}
                                        label="Tasks"
                                        value={COUNT.format(profile.tasks.total)}
                                    />
                                    <StatTile
                                        className="happy-agent-user-profile__tile"
                                        hint="Of the last 30"
                                        label="Active days"
                                        value={COUNT.format(profile.activeDays)}
                                    />
                                    <StatTile
                                        className="happy-agent-user-profile__tile"
                                        label="Last active"
                                        value={profile.lastActive}
                                    />
                                </div>
                                <div className="happy-agent-user-profile__tiles">
                                    {TOKEN_WINDOWS.map((window) => (
                                        <StatTile
                                            className="happy-agent-user-profile__tile"
                                            hint="Tokens"
                                            key={window.key}
                                            label={window.label}
                                            value={TOKENS.format(profile.tokens[window.key])}
                                        />
                                    ))}
                                </div>
                            </section>
                            <section className="happy-agent-user-profile__section">
                                <h3 className="happy-agent-user-profile__section-title">
                                    Last activity
                                </h3>
                                {profile.recentTasks.length === 0 ? (
                                    <span className="happy-agent-user-profile__empty">
                                        No tasks yet.
                                    </span>
                                ) : (
                                    <div
                                        className="happy-agent-user-profile__tasks"
                                        data-happy-desktop-ui="happy-agent-user-profile-tasks"
                                    >
                                        {profile.recentTasks.map((task) => (
                                            <button
                                                className="happy-agent-user-profile__task"
                                                data-happy-desktop-ui="happy-agent-user-profile-task"
                                                key={task.id}
                                                onClick={() => props.onTaskOpen(task.id)}
                                                type="button"
                                            >
                                                <span className="happy-agent-user-profile__task-icon">
                                                    <Icon name="chat" size={16} />
                                                </span>
                                                <span className="happy-agent-user-profile__task-text">
                                                    <span className="happy-agent-user-profile__task-name">
                                                        {task.name}
                                                    </span>
                                                    <span className="happy-agent-user-profile__task-meta">
                                                        {task.meta}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
