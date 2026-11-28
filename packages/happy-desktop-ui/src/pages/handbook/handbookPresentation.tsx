import { Avatar } from "../../Avatar";
import { initialsOf } from "../surfaces/surfacePresentation";

/** Someone the handbook credits: an editor, a reviewer, whoever applied a revision. */
export interface HappyAgentHandbookPerson {
    readonly id: string;
    readonly name: string;
    readonly imageUrl?: string;
}

/** Two versions of an item's text to compare, as their Markdown, once both are read. */
export type HappyAgentHandbookComparisonView =
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly before: string; readonly after: string }
    | { readonly kind: "error"; readonly message: string };

/** The faces drawn before the rest become `+N`. */
const FACES = 3;

/**
 * HandbookFaces — the people behind a change, as a small overlapping row of
 * faces, the first three drawn and the rest counted. Every name is in its
 * label, so a reader who cannot see the faces hears who they are.
 */
export function HandbookFaces(props: {
    readonly people: readonly HappyAgentHandbookPerson[];
    readonly "data-testid"?: string;
}) {
    if (props.people.length === 0) return null;
    const shown = props.people.slice(0, FACES);
    const rest = props.people.length - shown.length;
    return (
        <span
            aria-label={handbookNames(props.people)}
            className="happy-handbook-faces"
            data-happy-desktop-ui="handbook-faces"
            data-testid={props["data-testid"]}
            role="img"
        >
            {shown.map((person) => (
                <Avatar
                    aria-hidden
                    className="happy-handbook-faces__face"
                    initials={initialsOf(person.name)}
                    key={person.id}
                    size="xs"
                    {...(person.imageUrl === undefined ? {} : { imageUrl: person.imageUrl })}
                />
            ))}
            {rest > 0 ? (
                <span aria-hidden className="happy-handbook-faces__more">
                    +{String(rest)}
                </span>
            ) : null}
        </span>
    );
}

/** "Kirill", "Kirill and Steve", "Kirill, Steve and Ana". */
export function handbookNames(people: readonly HappyAgentHandbookPerson[]): string {
    const names = people.map((person) => person.name);
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}
