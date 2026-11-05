import { Fragment } from "react";
import type { HappyAgentArtifact, HappyAgentArtifactId } from "happy-desktop-state";
import { happyAgentArtifactTypeLabel } from "happy-desktop-state";
import { Badge } from "../../Badge";
import { MediaImageTile } from "../../ConversationMedia";
import { ArtifactTypeGlyph, type HappyAgentArtifactLabels } from "./artifactPresentation";

export interface HappyAgentArtifactRowProps {
    artifact: HappyAgentArtifact;
    labels: HappyAgentArtifactLabels;
    /** `page` is the catalog's full row; `panel` is the narrow one beside a chat. */
    density: "page" | "panel";
    /** The artifact is the one open in the viewer. */
    selected?: boolean;
    onOpen: (artifactId: HappyAgentArtifactId) => void;
}

/** The 16:9 slot a row leads with, by density: its cover, or its type's glyph. */
const THUMBNAIL = {
    page: { width: 80, height: 45, glyph: 18 },
    panel: { width: 64, height: 36, glyph: 16 },
} as const;

/**
 * One artifact in a list: its cover, what it is called, where it was made and
 * by whom, when it last changed, and how many versions it has. The whole row
 * opens it. A deleted artifact stays readable as a record of what was there,
 * in secondary type and marked as gone.
 *
 * Every row leads with the same 16:9 slot, so every row is one height: a wide
 * cover fills it, a square one stands whole in its middle on the artifact's
 * background, and an artifact without a cover, or a deleted one, wears its
 * type's glyph there instead.
 */
export function HappyAgentArtifactRow(props: HappyAgentArtifactRowProps) {
    const artifact = props.artifact;
    const deleted = artifact.status === "deleted";
    const thumbnail = THUMBNAIL[props.density];
    const cover = deleted ? null : artifact.cover;
    const changed =
        deleted && artifact.deletedAt !== null
            ? `Deleted ${props.labels.time(artifact.deletedAt)}`
            : props.labels.time(artifact.updatedAt);
    // The catalog row has the width to say everything; the row beside a chat
    // keeps where and when, since the chat already says most of the rest.
    const place = props.labels.source(artifact.source);
    const author = props.labels.author(artifact.createdBy);
    const meta =
        props.density === "page"
            ? [
                  happyAgentArtifactTypeLabel(artifact.type),
                  place,
                  ...(author === place ? [] : [author]),
              ]
            : [place];
    return (
        <button
            aria-current={props.selected ? "true" : undefined}
            className="happy-agent-artifact-row"
            data-artifact-id={artifact.id}
            data-density={props.density}
            data-happy-desktop-ui="happy-agent-artifact-row"
            data-status={artifact.status}
            onClick={() => props.onOpen(artifact.id)}
            type="button"
        >
            <span
                aria-hidden="true"
                className="happy-agent-artifact-row__thumbnail"
                data-aspect={cover?.aspect}
                data-happy-desktop-ui="happy-agent-artifact-row-thumbnail"
                data-type={artifact.type}
                style={
                    cover !== null && artifact.background !== null
                        ? { background: artifact.background }
                        : undefined
                }
            >
                {cover === null ? (
                    <ArtifactTypeGlyph size={thumbnail.glyph} type={artifact.type} />
                ) : (
                    <MediaImageTile
                        alt=""
                        className="happy-agent-artifact-row__cover"
                        height={thumbnail.height}
                        url={cover.url}
                        width={
                            cover.aspect === "wide" ? thumbnail.width : thumbnail.height
                        }
                    />
                )}
            </span>
            <span className="happy-agent-artifact-row__text">
                <span className="happy-agent-artifact-row__headline">
                    <span className="happy-agent-artifact-row__title">
                        {artifact.title || "Untitled"}
                    </span>
                    {deleted ? <Badge label="Deleted" variant="danger" /> : null}
                    <span
                        className="happy-agent-artifact-row__version"
                        title={`Version ${String(artifact.latestVersion)}`}
                    >
                        v{artifact.latestVersion}
                    </span>
                </span>
                <span className="happy-agent-artifact-row__meta">
                    {meta.map((part, index) => (
                        // A fixed sequence of facts, never reordered.
                        <Fragment key={index}>
                            {index > 0 ? (
                                <span
                                    aria-hidden="true"
                                    className="happy-agent-artifact-row__meta-dot"
                                >
                                    ·
                                </span>
                            ) : null}
                            <span className="happy-agent-artifact-row__meta-part">{part}</span>
                        </Fragment>
                    ))}
                    <span aria-hidden="true" className="happy-agent-artifact-row__meta-dot">
                        ·
                    </span>
                    {/* When is the one fact a narrow row must keep whole. */}
                    <span className="happy-agent-artifact-row__meta-time">{changed}</span>
                </span>
            </span>
        </button>
    );
}
