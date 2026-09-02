import { useId, type CSSProperties, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { SURFACE_HEADER_HEIGHT } from "./InfoPanel";
import { Modal } from "./Modal";
import { ModalOverlay } from "./ModalOverlay";
import { ScrollArea } from "./Scrollbar";
import { TextField } from "./TextField";
import { Toolbar } from "./Toolbar";

export interface HappySocialPerson {
    readonly firstName: string;
    readonly lastName?: string;
    readonly username: string;
}

export interface HappySocialTeam {
    readonly id: string;
    readonly name: string;
}

export type HappySocialOperation =
    | { readonly kind: "send"; readonly username: string }
    | { readonly kind: "accept"; readonly username: string }
    | { readonly kind: "reject"; readonly username: string }
    | { readonly kind: "teamCreate"; readonly name: string };

export interface HappySocialPageProps {
    readonly status: "loading" | "unenrolled" | "ready" | "error";
    readonly friendUsername: string;
    readonly friends: readonly HappySocialPerson[];
    readonly incomingRequests: readonly HappySocialPerson[];
    readonly outgoingRequests: readonly HappySocialPerson[];
    readonly teamCreateOpen: boolean;
    readonly teamName: string;
    readonly teams: readonly HappySocialTeam[];
    readonly teamsAvailable: boolean;
    readonly teamsStatus: "loading" | "ready" | "error";
    readonly operation?: HappySocialOperation;
    readonly error?: string;
    readonly teamCreateError?: string;
    readonly teamsError?: string;
    readonly unavailable?: string;
    onFriendUsernameChange(value: string): void;
    onFriendRequestSend(): void;
    onFriendRequestAccept(username: string): void;
    onFriendRequestReject(username: string): void;
    onTeamCreate(): void;
    onTeamCreateClose(): void;
    onTeamCreateOpen(): void;
    onTeamNameChange(value: string): void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/** A prop-driven Happy Social teams, friends, and requests surface. */
export function HappySocialPage(props: HappySocialPageProps) {
    const usernameId = `happy-social-friend-${useId()}`;
    const requestCount = props.incomingRequests.length + props.outgoingRequests.length;
    const ready = props.status === "ready";
    const loading = props.status === "loading";
    return (
        <div
            className={["happy-social-page", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-social-page"
            data-loading={loading ? "" : undefined}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <div
                aria-hidden={loading ? undefined : "true"}
                className="happy-social-page__loading"
                data-happy-desktop-ui="social-loading"
            >
                <EmptyState
                    animation="snail"
                    description={
                        props.teamsAvailable
                            ? "Reading your teams, friends, and requests from Happy Social."
                            : "Reading your friends and requests from Happy Social."
                    }
                    icon="users"
                    title="Loading social…"
                />
            </div>
            <div
                aria-hidden={loading ? "true" : undefined}
                className="happy-social-page__resolved"
                data-happy-desktop-ui="social-resolved"
                {...(loading ? { inert: true } : {})}
            >
                <div className="happy-social-page__header" data-happy-desktop-ui="social-header">
                    <Toolbar
                        height={SURFACE_HEADER_HEIGHT}
                        subtitle={socialSubtitle(
                            props.status,
                            props.teamsAvailable,
                            props.teams.length,
                            props.friends.length,
                            requestCount,
                        )}
                        title="Social"
                    />
                </div>
                <ScrollArea
                    className="happy-social-page__scroll"
                    data-happy-desktop-ui="social-scroll"
                    viewportClassName="happy-social-page__scroll-viewport"
                >
                    <div className="happy-social-page__content">
                        {props.error ? (
                            <Banner tone="danger" title="Happy Social could not update">
                                {props.error}
                            </Banner>
                        ) : null}
                        {props.unavailable ? (
                            <Banner tone="neutral" title="Happy Agent reconnecting">
                                {props.unavailable}
                            </Banner>
                        ) : null}

                        {props.status === "unenrolled" ? (
                            <EmptyState
                                description="Choose a Happy Social username in Profile settings to connect with friends."
                                icon="users"
                                title="Finish setting up Happy Social"
                            />
                        ) : props.status === "error" ? (
                            <EmptyState
                                description="This Happy Agent did not make its Social friends service available."
                                icon="users"
                                title="Social unavailable"
                            />
                        ) : null}

                        {ready && props.teamsAvailable ? (
                            <SocialSection
                                action={
                                    <Button
                                        disabled={
                                            props.operation !== undefined ||
                                            props.teamsStatus !== "ready" ||
                                            props.unavailable !== undefined
                                        }
                                        icon="plus"
                                        onClick={props.onTeamCreateOpen}
                                        size="small"
                                        variant="secondary"
                                    >
                                        New team
                                    </Button>
                                }
                                count={props.teams.length}
                                label="Teams"
                            >
                                {props.teamsError ? (
                                    <Banner tone="danger" title="Teams may be out of date">
                                        {props.teamsError}
                                    </Banner>
                                ) : null}
                                {props.teamsStatus === "loading" ? (
                                    <p className="happy-social-page__empty-line">
                                        Loading teams from Happy Cloud…
                                    </p>
                                ) : props.teams.length === 0 ? (
                                    <p className="happy-social-page__empty-line">
                                        Teams you create or join will appear here.
                                    </p>
                                ) : (
                                    <div className="happy-social-page__list">
                                        {props.teams.map((team) => (
                                            <SocialTeamRow key={team.id} team={team} />
                                        ))}
                                    </div>
                                )}
                            </SocialSection>
                        ) : null}

                        {ready ? (
                            <form
                                className="happy-social-page__add"
                                data-happy-desktop-ui="social-add"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    props.onFriendRequestSend();
                                }}
                            >
                                <label className="happy-social-page__add-copy" htmlFor={usernameId}>
                                    <strong>Add a friend</strong>
                                    <span>Send a request using their Happy Social username.</span>
                                </label>
                                <div className="happy-social-page__add-controls">
                                    <TextField
                                        autoComplete="off"
                                        disabled={props.operation !== undefined}
                                        fullWidth
                                        id={usernameId}
                                        name="happy-social-friend"
                                        onValueChange={props.onFriendUsernameChange}
                                        placeholder="@username"
                                        size="medium"
                                        value={props.friendUsername}
                                    />
                                    <Button
                                        disabled={
                                            props.friendUsername.trim() === "" ||
                                            props.unavailable !== undefined
                                        }
                                        icon="users"
                                        loading={props.operation?.kind === "send"}
                                        size="medium"
                                        type="submit"
                                    >
                                        Send request
                                    </Button>
                                </div>
                            </form>
                        ) : null}

                        {ready ? (
                            <SocialSection count={requestCount} label="Requests">
                                {requestCount === 0 ? (
                                    <p className="happy-social-page__empty-line">
                                        No friend requests.
                                    </p>
                                ) : (
                                    <div className="happy-social-page__list">
                                        {props.incomingRequests.map((person) => (
                                            <SocialPersonRow
                                                key={`incoming:${person.username}`}
                                                person={person}
                                                meta="Wants to be friends"
                                                actions={
                                                    <>
                                                        <Button
                                                            disabled={
                                                                props.operation !== undefined ||
                                                                props.unavailable !== undefined
                                                            }
                                                            loading={
                                                                props.operation?.kind ===
                                                                    "accept" &&
                                                                props.operation.username ===
                                                                    person.username
                                                            }
                                                            onClick={() =>
                                                                props.onFriendRequestAccept(
                                                                    person.username,
                                                                )
                                                            }
                                                            size="small"
                                                            variant="success"
                                                        >
                                                            Accept
                                                        </Button>
                                                        <Button
                                                            disabled={
                                                                props.operation !== undefined ||
                                                                props.unavailable !== undefined
                                                            }
                                                            loading={
                                                                props.operation?.kind ===
                                                                    "reject" &&
                                                                props.operation.username ===
                                                                    person.username
                                                            }
                                                            onClick={() =>
                                                                props.onFriendRequestReject(
                                                                    person.username,
                                                                )
                                                            }
                                                            size="small"
                                                            variant="ghost"
                                                        >
                                                            Reject
                                                        </Button>
                                                    </>
                                                }
                                            />
                                        ))}
                                        {props.outgoingRequests.map((person) => (
                                            <SocialPersonRow
                                                key={`outgoing:${person.username}`}
                                                person={person}
                                                meta="Request sent"
                                                status="Pending"
                                            />
                                        ))}
                                    </div>
                                )}
                            </SocialSection>
                        ) : null}

                        {ready ? (
                            <SocialSection count={props.friends.length} label="Friends">
                                {props.friends.length === 0 ? (
                                    <p className="happy-social-page__empty-line">
                                        Friends you connect with will appear here.
                                    </p>
                                ) : (
                                    <div className="happy-social-page__list">
                                        {props.friends.map((person) => (
                                            <SocialPersonRow
                                                key={person.username}
                                                person={person}
                                            />
                                        ))}
                                    </div>
                                )}
                            </SocialSection>
                        ) : null}
                    </div>
                </ScrollArea>
            </div>
            {props.teamsAvailable && props.teamCreateOpen ? (
                <ModalOverlay
                    onDismiss={
                        props.operation?.kind === "teamCreate" ? undefined : props.onTeamCreateClose
                    }
                >
                    <Modal
                        footer={
                            <>
                                <Button
                                    disabled={props.operation?.kind === "teamCreate"}
                                    onClick={props.onTeamCreateClose}
                                    variant="ghost"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    disabled={
                                        props.teamName.trim() === "" ||
                                        props.unavailable !== undefined
                                    }
                                    loading={props.operation?.kind === "teamCreate"}
                                    onClick={props.onTeamCreate}
                                >
                                    Create team
                                </Button>
                            </>
                        }
                        icon="users"
                        onClose={
                            props.operation?.kind === "teamCreate"
                                ? undefined
                                : props.onTeamCreateClose
                        }
                        size="medium"
                        title="Create a team"
                    >
                        <div
                            className="happy-social-page__team-create"
                            data-happy-desktop-ui="social-team-create"
                        >
                            <p>Create a team in Happy Cloud. You’ll be its administrator.</p>
                            <TextField
                                autoComplete="organization"
                                autoFocus
                                disabled={props.operation?.kind === "teamCreate"}
                                error={props.teamCreateError}
                                fullWidth
                                label="Team name"
                                onSubmit={props.onTeamCreate}
                                onValueChange={props.onTeamNameChange}
                                placeholder="Acme"
                                value={props.teamName}
                            />
                        </div>
                    </Modal>
                </ModalOverlay>
            ) : null}
        </div>
    );
}

function SocialSection(props: {
    readonly action?: ReactNode;
    readonly children: ReactNode;
    readonly count: number;
    readonly label: string;
}) {
    return (
        <section className="happy-social-page__section">
            <div className="happy-social-page__section-heading">
                <h2 className="happy-social-page__section-title">
                    <span>{props.label}</span>
                    <span className="happy-social-page__section-count">{props.count}</span>
                </h2>
                {props.action}
            </div>
            {props.children}
        </section>
    );
}

function SocialTeamRow(props: { readonly team: HappySocialTeam }) {
    return (
        <div className="happy-social-page__person" data-happy-desktop-ui="social-team">
            <Avatar aria-label={props.team.name} icon="users" initials="" size="md" tone="slate" />
            <div className="happy-social-page__person-copy">
                <strong>{props.team.name}</strong>
                <span>Happy Cloud team</span>
            </div>
        </div>
    );
}

function SocialPersonRow(props: {
    readonly actions?: ReactNode;
    readonly meta?: string;
    readonly person: HappySocialPerson;
    readonly status?: string;
}) {
    const name = [props.person.firstName, props.person.lastName].filter(Boolean).join(" ");
    return (
        <div className="happy-social-page__person" data-happy-desktop-ui="social-person">
            <Avatar
                aria-label={name}
                initials={personInitials(props.person)}
                size="md"
                tone="ocean"
            />
            <div className="happy-social-page__person-copy">
                <strong>{name}</strong>
                <span>
                    @{props.person.username}
                    {props.meta ? ` · ${props.meta}` : ""}
                </span>
            </div>
            {props.status ? (
                <span className="happy-social-page__person-status">{props.status}</span>
            ) : null}
            {props.actions ? (
                <div className="happy-social-page__person-actions">{props.actions}</div>
            ) : null}
        </div>
    );
}

function personInitials(person: HappySocialPerson): string {
    return `${person.firstName[0] ?? ""}${person.lastName?.[0] ?? ""}`.toUpperCase();
}

function socialSubtitle(
    status: HappySocialPageProps["status"],
    teamsAvailable: boolean,
    teams: number,
    friends: number,
    requests: number,
) {
    if (status === "loading") return "Loading friends and requests";
    if (status === "unenrolled") return "Profile setup required";
    if (status === "error") return "Friends unavailable";
    if (!teamsAvailable)
        return `${friends} ${friends === 1 ? "friend" : "friends"} · ${requests} ${requests === 1 ? "request" : "requests"}`;
    return `${teams} ${teams === 1 ? "team" : "teams"} · ${friends} ${friends === 1 ? "friend" : "friends"} · ${requests} ${requests === 1 ? "request" : "requests"}`;
}
