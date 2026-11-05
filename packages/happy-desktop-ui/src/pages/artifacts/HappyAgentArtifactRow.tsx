import { Fragment, useContext, useState } from "react";
import type { HappyAgentArtifact, HappyAgentArtifactId } from "happy-desktop-state";
import { happyAgentArtifactTypeLabel } from "happy-desktop-state";
import { Badge } from "../../Badge";
import { ContextMenu } from "../../ContextMenu";
import { MediaImageTile } from "../../ConversationMedia";
import { LinkCopyContext } from "../../LinkContextMenu";
import { thumbhashDataUrl } from "../../thumbhashDataUrl";
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

/** The 16:9 slot a row leads with, by density: its picture, or its type's glyph. */
const THUMBNAIL = {
    page: { width: 80, height: 45, glyph: 18 },
    panel: { width: 64, height: 36, glyph: 16 },
} as const;

/**
 * One artifact in a list: its picture, what it is called, where it was made and
 * by whom, when it last changed, and how many versions it has. The whole row
 * opens it, and its context menu copies its link. A deleted artifact stays readable as a record of what was there,
 * in secondary type and marked as gone.
 *
 * Every row leads with the same 16:9 slot, so every row is one height: a wide
 * cover fills it, a square one stands whole in its middle on the artifact's
 * background, an image or video without a cover fills it with its own
 * picture, and any other artifact, or a deleted one, wears its type's glyph
 * there instead. The picture is the daemon's still preview where it made one,
 * painted first as its ThumbHash, and never moves: an animated cover read
 * whole shows only its first frame.
 */
export function HappyAgentArtifactRow(props: HappyAgentArtifactRowProps) {
    const artifact = props.artifact;
    const linkCopy = useContext(LinkCopyContext);
    const [menu, setMenu] = useState<{ readonly x: number; readonly y: number } | undefined>();
    const deleted = artifact.status === "deleted";
    const thumbnail = THUMBNAIL[props.density];
    const picture = deleted ? null : artifact.thumbnail;
    const square = picture?.kind === "cover" && picture.aspect === "square";
    const placeholderUrl =
        picture === null || picture.thumbhash === null
            ? undefined
            : thumbhashDataUrl(picture.thumbhash);
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
        <>
            <button
                aria-current={props.selected ? "true" : undefined}
                className="happy-agent-artifact-row"
                data-artifact-id={artifact.id}
                data-density={props.density}
                data-happy-desktop-ui="happy-agent-artifact-row"
                data-status={artifact.status}
                onClick={() => props.onOpen(artifact.id)}
                onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ x: event.clientX, y: event.clientY });
                }}
                type="button"
            >
                <span
                    aria-hidden="true"
                    className="happy-agent-artifact-row__thumbnail"
                    data-aspect={picture?.kind === "cover" ? picture.aspect : undefined}
                    data-happy-desktop-ui="happy-agent-artifact-row-thumbnail"
                    data-type={artifact.type}
                    style={
                        picture?.kind === "cover" && artifact.background !== null
                            ? { background: artifact.background }
                            : undefined
                    }
                >
                    {picture === null ? (
                        <ArtifactTypeGlyph size={thumbnail.glyph} type={artifact.type} />
                    ) : (
                        <MediaImageTile
                            alt=""
                            className="happy-agent-artifact-row__cover"
                            fit={square ? "contain" : "cover"}
                            height={thumbnail.height}
                            {...(placeholderUrl === undefined ? {} : { placeholderUrl })}
                            still={picture.kind === "cover" && !picture.preview}
                            url={picture.url}
                            width={square ? thumbnail.height : thumbnail.width}
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
            {/* Beside the row rather than in it, so a choice in the menu is
                never also a click on the row. */}
            {menu ? (
                <ContextMenu
                    data-testid="happy-agent-artifact-row-menu"
                    items={[
                        {
                            kind: "item",
                            id: ARTIFACT_LINK_COPY,
                            label: "Copy link to artifact",
                            icon: "link",
                        },
                    ]}
                    onClose={() => setMenu(undefined)}
                    onSelect={(id) => {
                        setMenu(undefined);
                        if (id !== ARTIFACT_LINK_COPY) return;
                        void navigator.clipboard
                            .writeText(linkCopy(`happy://artifacts/${artifact.id}`))
                            .catch(() => undefined);
                    }}
                    x={menu.x}
                    y={menu.y}
                />
            ) : null}
        </>
    );
}

const ARTIFACT_LINK_COPY = "artifact-link-copy";
