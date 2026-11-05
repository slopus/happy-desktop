/**
 * Closed product projections of a Happy Agent's artifacts: finished work an agent
 * or a person published to the installation's one global catalog, with every
 * version kept. The wire shapes are projected at the state boundary in
 * `artifactProject.ts`; application code and the UI only ever see these.
 */

declare const happyAgentArtifactIdBrand: unique symbol;

/** Branded artifact identifier (CUID2 on the wire). */
export type HappyAgentArtifactId = string & { readonly [happyAgentArtifactIdBrand]: true };

/**
 * What an artifact is, which decides how it is shown. The daemon's set grows
 * with the product, so a type this build does not know arrives as `unknown`
 * and is shown as its files rather than refused.
 */
export type HappyAgentArtifactType =
    | "markdown"
    | "html"
    | "image"
    | "image_series"
    | "video"
    | "document"
    | "unknown";

/**
 * How an artifact's author wants it shown in a chat: inline collapsed to its
 * title, inline at its full height, or as its title that opens it beside the
 * chat. A value this build does not know reads as no preference.
 */
export type HappyAgentArtifactDisplay = "inline_compact" | "inline_expanded" | "side";

/** The types this build knows, in the order a type filter offers them. */
export const HAPPY_AGENT_ARTIFACT_TYPES: readonly Exclude<HappyAgentArtifactType, "unknown">[] = [
    "markdown",
    "html",
    "image",
    "image_series",
    "video",
    "document",
];

/** One file of one version. Equal digests mean equal content. */
export interface HappyAgentArtifactFile {
    /** The file's place in the artifact: `/`-joined segments, case-sensitive. */
    readonly path: string;
    /** Decided by the daemon from the path's extension. */
    readonly mimeType: string;
    readonly size: number;
    readonly sha256: string;
}

/** The raster formats a cover arrives in; the daemon turns an SVG cover into PNG. */
export type HappyAgentArtifactCoverMimeType =
    | "image/png"
    | "image/jpeg"
    | "image/webp"
    | "image/gif";

/**
 * The picture that stands for an artifact where it is shown as a post: one
 * file of its latest version, which carries its headline, key number, or main
 * chart. It comes in one of two shapes, so a client lays out the picture's
 * box before a byte of it has arrived.
 */
export interface HappyAgentArtifactCover {
    /** The version whose file it is: the latest one when it was read. */
    readonly version: number;
    /** One file of that version. */
    readonly path: string;
    readonly mimeType: HappyAgentArtifactCoverMimeType;
    readonly width: number;
    readonly height: number;
    /** The cover's shape, which it is drawn at exactly. */
    readonly aspect: HappyAgentArtifactCoverAspect;
    /** Where the picture is read from, through the client's authenticated file route. */
    readonly url: string;
    /**
     * The picture's ThumbHash, standard base64, drawn in its place until it
     * loads; `null` when the daemon could not decode it or predates them.
     */
    readonly thumbhash: string | null;
    /** The still the daemon made of its first frame, or `null` when it made none. */
    readonly preview: HappyAgentArtifactPreview | null;
}

/**
 * A still WebP the daemon makes of an image file, a cover, or a video's
 * poster: the first frame, fitted within 640×640 and never enlarged.
 */
export interface HappyAgentArtifactPreview {
    /** Where it is read from, through the client's authenticated preview route. */
    readonly url: string;
    readonly width: number;
    readonly height: number;
}

/**
 * The picture a list leads an artifact's row with: its cover, else its own
 * image or video's preview. A media picture is always a still preview; a
 * cover is its preview where the daemon made one, and otherwise its whole
 * file, of which a list draws only the first frame.
 */
export type HappyAgentArtifactThumbnail =
    | {
          readonly kind: "cover";
          readonly aspect: HappyAgentArtifactCoverAspect;
          readonly url: string;
          /** Whether `url` is the cover's still preview rather than its whole file. */
          readonly preview: boolean;
          readonly thumbhash: string | null;
      }
    | {
          readonly kind: "media";
          readonly url: string;
          readonly thumbhash: string | null;
      };

/** The address of one file, or of its preview, of one version, as the connection's client reads it. */
export type HappyAgentArtifactFileLinkCreate = (
    artifactId: HappyAgentArtifactId,
    version: number,
    path: string,
) => string;

/**
 * How a projection addresses an artifact's pictures. Given where a surface
 * draws them; without it, an artifact has no cover and no thumbnail.
 */
export interface HappyAgentArtifactLinks {
    readonly file: HappyAgentArtifactFileLinkCreate;
    readonly preview: HappyAgentArtifactFileLinkCreate;
    /** Whether the daemon has `capabilities.artifactCovers`; without it, covers are not read. */
    readonly covers: boolean;
}

/** The two shapes a cover comes in: 16:9, or square. */
export type HappyAgentArtifactCoverAspect = "wide" | "square";

/**
 * Where an artifact, or one of its versions, was made. `agentId` names the
 * conversation it came from and is `null` when a person made it outside one.
 * A kind this build does not know is kept as `unknown`, still carrying the
 * conversation when the daemon named one, and reads as "elsewhere".
 */
export type HappyAgentArtifactSource =
    | { readonly kind: "bot"; readonly botId: string; readonly agentId: string | null }
    | { readonly kind: "task"; readonly taskId: string; readonly agentId: string | null }
    | { readonly kind: "project"; readonly projectId: string; readonly agentId: string | null }
    | {
          readonly kind: "workspace";
          readonly workspaceId: string;
          readonly projectId: string;
          readonly agentId: string | null;
      }
    | { readonly kind: "agent"; readonly agentId: string }
    | { readonly kind: "unknown"; readonly agentId: string | null };

/** The source kinds a list can be narrowed to, as the daemon names them. */
export type HappyAgentArtifactSourceKind = Exclude<HappyAgentArtifactSource["kind"], "unknown">;

/**
 * Who made a change. A person's `userId` is `null` for the one person of a
 * standalone installation. A kind this build does not know reads as "someone".
 */
export type HappyAgentArtifactAuthor =
    | { readonly kind: "agent"; readonly agentId: string; readonly botId: string | null }
    | { readonly kind: "user"; readonly userId: string | null }
    | { readonly kind: "unknown" };

/** The artifact as its latest version and its lifecycle leave it. */
export interface HappyAgentArtifact {
    readonly id: HappyAgentArtifactId;
    readonly type: HappyAgentArtifactType;
    readonly title: string;
    readonly status: "active" | "deleted";
    /** The number of the latest version, from 1. */
    readonly latestVersion: number;
    /**
     * The picture that stands for the artifact in a list, or `null`: none
     * named, one this build cannot draw, or a daemon without
     * `capabilities.artifactCovers`. After a new version it is the previous
     * one's until the artifact is read again.
     */
    readonly cover: HappyAgentArtifactCover | null;
    /**
     * The colour the latest version asks to be shown on, or `null` for none;
     * a cover is drawn on it. Kept with the cover, and read the same way.
     */
    readonly background: string | null;
    /**
     * The picture a list leads its row with, or `null` for its type's glyph:
     * its cover, else, for an image, image series, or video, the preview the
     * daemon made of its entry. After a new version it is the previous one's
     * until the artifact is read again.
     */
    readonly thumbnail: HappyAgentArtifactThumbnail | null;
    /** The latest version's entry: the file a client opens to show it. */
    readonly entry: HappyAgentArtifactFile;
    readonly fileCount: number;
    /** The latest version's files' bytes together. */
    readonly size: number;
    /** Where the artifact was created, or `null` when a person made it outside a conversation. */
    readonly source: HappyAgentArtifactSource | null;
    readonly createdBy: HappyAgentArtifactAuthor;
    readonly createdAt: number;
    /** Who made the latest change — a version, or the deletion — where, and when. */
    readonly updatedBy: HappyAgentArtifactAuthor;
    readonly updatedSource: HappyAgentArtifactSource | null;
    readonly updatedAt: number;
    readonly deletedBy: HappyAgentArtifactAuthor | null;
    readonly deletedSource: HappyAgentArtifactSource | null;
    readonly deletedAt: number | null;
    /** The concurrency version an update or a deletion must name. */
    readonly version: string;
}

/** One immutable version and its whole manifest. */
export interface HappyAgentArtifactVersion {
    readonly artifactId: HappyAgentArtifactId;
    readonly number: number;
    readonly title: string;
    /** One of `files`: the file a client opens to show this version. */
    readonly entry: HappyAgentArtifactFile;
    /** Every file, in path order. */
    readonly files: readonly HappyAgentArtifactFile[];
    readonly createdBy: HappyAgentArtifactAuthor;
    readonly source: HappyAgentArtifactSource | null;
    readonly createdAt: number;
    /**
     * The hex colour this version asks to be shown on. Absent means none —
     * the daemon sent `null`, left the field out, or sent something that is
     * not a hex colour — and the version is drawn on whatever surface holds it.
     */
    readonly background?: string;
}

/**
 * Which artifacts a list holds. Every field narrows; an empty filter is the
 * whole catalog. `source` names a kind, and optionally one place of that kind:
 * a bot, a task, a project root, a workspace, or a lone conversation.
 */
export interface HappyAgentArtifactFilter {
    readonly type?: Exclude<HappyAgentArtifactType, "unknown">;
    readonly source?: {
        readonly kind: HappyAgentArtifactSourceKind;
        readonly id?: string;
    };
    /** Only artifacts whose source names this conversation, whatever the kind. */
    readonly agentId?: string;
    /** Whether deleted artifacts stay listed as tombstones. */
    readonly includeDeleted: boolean;
}

/**
 * Whether this Happy Agent has artifacts at all. An older daemon answers the
 * catalog with 404, which means no artifacts rather than an empty catalog, and
 * every surface hides itself rather than reporting a failure.
 */
export type HappyAgentArtifactsAvailability = "checking" | "available" | "unsupported";
