import type {
    HandbookCategory,
    HandbookChangeRequestStatus,
    HandbookDocument,
    HandbookRevisionKind,
    HandbookSummarySource,
} from "happy-desktop-state";
import { Avatar } from "../../Avatar";
import type { BadgeVariant } from "../../Badge";
import { initialsOf } from "../surfaces/surfacePresentation";

/** A person as the handbook credits them: their name and face. */
export interface HandbookPerson {
    readonly id: string;
    readonly name: string;
    readonly imageUrl?: string;
}

/** What the owner knows that the pages show: names, faces, and how long ago. */
export interface HandbookLabels {
    /** How long ago, in the window's own words. */
    readonly time: (at: number) => string;
    /** A member by id; someone the team no longer lists is still named. */
    readonly person: (userId: string) => HandbookPerson;
    /** An agent by id, as the window names it. */
    readonly agent: (agentId: string) => string;
}

/** Everyone who may maintain a document, in name order, for the pickers. */
export type HandbookPeople = readonly HandbookPerson[];

export const HANDBOOK_SUMMARY_SOURCE_TEXT = {
    team: "Summarized by the team’s model",
    titles: "Summarized by the title model",
    excerpt: "Summary taken from the text",
} as const satisfies Record<HandbookSummarySource, string>;

export const HANDBOOK_CHANGE_REQUEST_STATUS_TEXT = {
    open: "Open",
    merged: "Merged",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
} as const satisfies Record<HandbookChangeRequestStatus, string>;

export const HANDBOOK_CHANGE_REQUEST_STATUS_VARIANT = {
    open: "accent",
    merged: "success",
    rejected: "danger",
    withdrawn: "neutral",
} as const satisfies Record<HandbookChangeRequestStatus, BadgeVariant>;

export const HANDBOOK_REVISION_KIND_TEXT = {
    create: "Created",
    edit: "Edited",
    changeRequest: "Merged a change request",
} as const satisfies Record<HandbookRevisionKind, string>;

/**
 * Why the reader cannot write in a document they can read, said beside it.
 * The server decides whether they may; this only finds the words.
 */
export function handbookReadOnlyReason(
    document: HandbookDocument,
    category: HandbookCategory | undefined,
): string {
    if (document.deletedAt !== null) return "This document was deleted, so it can’t be edited.";
    if (category?.protected)
        return document.abilities.propose
            ? `${category.name} documents change through change requests. Propose a change to suggest an edit.`
            : `${category.name} documents change through change requests.`;
    return document.abilities.propose
        ? "You can’t edit this document directly. Propose a change to suggest an edit."
        : "You can read this document, but not edit it.";
}

/** A person's small face and name, side by side. */
export function HandbookPersonChip(props: { readonly person: HandbookPerson }) {
    return (
        <span className="happy-handbook-person" data-happy-desktop-ui="handbook-person">
            <Avatar
                initials={initialsOf(props.person.name)}
                {...(props.person.imageUrl ? { imageUrl: props.person.imageUrl } : {})}
                placeholderSeed={props.person.id}
                size="xs"
            />
            <span className="happy-handbook-person__name">{props.person.name}</span>
        </span>
    );
}

export function handbookErrorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}
