import { ChangeStats } from "./ChangeStats";
import { changeCountLabel } from "./countText";
import { Icon } from "./Icon";

/** A repository a cloud task's agent checked out, and how that went. */
export interface RepositoryChipRepository {
    readonly name: string;
    readonly branch: string;
    readonly checkout: "pending" | "ready" | "failed";
    /** Why the checkout failed. */
    readonly error?: string;
    /** Its picture; the repository glyph stands in without one. */
    readonly avatarUrl?: string;
    /** The agent may read it but not push to it. */
    readonly readOnly?: boolean;
    /** What the agent changed in it, once Git has counted; nothing changed draws no counts. */
    readonly changes?: {
        readonly files: number;
        readonly added: number;
        readonly deleted: number;
    };
}

export type RepositoryChipProps = {
    readonly repository: RepositoryChipRepository;
};

function titleOf(repository: RepositoryChipRepository): string {
    if (repository.checkout === "failed" && repository.error) return repository.error;
    const where = `Works in ${repository.name}, branch ${repository.branch}`;
    const access = repository.readOnly ? ", read-only" : "";
    const changes = repository.changes;
    if (!changes || changes.files === 0) return `${where}${access}`;
    const files = `${String(changes.files)} ${changes.files === 1 ? "file" : "files"} changed`;
    return `${where}${access}. ${files}, ${changeCountLabel(changes.added, changes.deleted)}`;
}

function textOf(repository: RepositoryChipRepository): string {
    const where = `${repository.name} · ${repository.branch}`;
    if (repository.checkout === "pending") return `${where} · checking out`;
    if (repository.checkout === "failed") return `${where} · checkout failed`;
    return where;
}

/**
 * C-338 RepositoryChip — one repository a cloud task's agent checked out,
 * beside the compute chip in the composer's control row, one chip each. The
 * agent chooses them, so the chip is read-only: where the work is, whether the
 * agent may push, how its checkout went and the lines it changed there, as a
 * Happy Agent's checkout row shows them. Shown only once one is attached.
 */
export function RepositoryChip(props: RepositoryChipProps) {
    const repository = props.repository;
    const changes = repository.changes;
    return (
        <span
            className="happy-repository-chip"
            data-checkout={repository.checkout}
            data-happy-desktop-ui="repository-chip"
            title={titleOf(repository)}
        >
            {repository.avatarUrl ? (
                <img
                    alt=""
                    className="happy-repository-chip__avatar"
                    height={14}
                    src={repository.avatarUrl}
                    width={14}
                />
            ) : (
                <Icon name="repository" size={14} />
            )}
            <span className="happy-repository-chip__label">{textOf(repository)}</span>
            {repository.readOnly ? (
                <span aria-label="Read-only" className="happy-repository-chip__lock" role="img">
                    <Icon name="lock" size={12} />
                </span>
            ) : null}
            {repository.checkout === "ready" &&
            changes &&
            (changes.added > 0 || changes.deleted > 0) ? (
                <ChangeStats added={changes.added} deleted={changes.deleted} />
            ) : null}
        </span>
    );
}
