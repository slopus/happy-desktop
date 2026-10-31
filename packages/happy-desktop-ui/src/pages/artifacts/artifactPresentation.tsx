import type {
    HappyAgentArtifactAuthor,
    HappyAgentArtifactSource,
    HappyAgentArtifactSourceKind,
    HappyAgentArtifactType,
} from "happy-desktop-state";
import { Icon } from "../../Icon";
import { Ionicon } from "../../vectorIcons/VectorIcon";

/**
 * How the artifact surfaces put places, people, and moments into words. The
 * owner knows what this Happy Agent's bots, tasks, projects, conversations,
 * and people are called and how the window writes a time, so it supplies all
 * three; the surfaces only decide where each one goes.
 */
export interface HappyAgentArtifactLabels {
    /** Where an artifact or one of its versions was made. */
    readonly source: (source: HappyAgentArtifactSource | null) => string;
    /** Who made a change. */
    readonly author: (author: HappyAgentArtifactAuthor) => string;
    /** When something happened, as the window writes a moment. */
    readonly time: (at: number) => string;
}

/** One place the catalog can be narrowed to: every place of a kind, or one of them. */
export interface HappyAgentArtifactSourceChoice {
    readonly kind: HappyAgentArtifactSourceKind;
    readonly id?: string;
    readonly label: string;
}

/**
 * The glyph an artifact wears for its type, so a list is read by shape before
 * it is read by title. A type this build does not know wears the house
 * package, which is what it is: something packaged by someone else.
 */
export function ArtifactTypeGlyph(props: { type: HappyAgentArtifactType; size: 16 | 18 | 20 }) {
    switch (props.type) {
        case "markdown":
            return <Icon name="doc" size={props.size} />;
        case "html":
            return <Icon name="globe" size={props.size} />;
        case "image":
            return <Icon name="image" size={props.size} />;
        case "image_series":
            return <Ionicon name="images-outline" size={props.size} />;
        case "video":
            return <Ionicon name="film-outline" size={props.size} />;
        case "document":
            return <Ionicon name="document-outline" size={props.size} />;
        case "unknown":
            return <Icon name="package" size={props.size} />;
    }
}

/** A byte count in the unit a person reads it in. */
export function artifactSizeText(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 102.4) / 10)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${String(Math.round(bytes / (102.4 * 1024)) / 10)} MB`;
    return `${String(Math.round(bytes / (102.4 * 1024 * 1024)) / 10)} GB`;
}

/** The last segment of a path in an artifact: what the file is called. */
export function artifactFileName(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Who made something and where, said once when the two are the same name — an
 * agent credited by its own conversation's title, or a bot in its own chat.
 */
export function artifactMadeBy(author: string, place: string): string {
    return author === place ? author : `${author} in ${place}`;
}
