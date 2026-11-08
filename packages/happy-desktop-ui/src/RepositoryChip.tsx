import { Icon } from "./Icon";

/** The repository a cloud task's agent attached, and its checkout. */
export interface RepositoryChipRepository {
    readonly name: string;
    readonly branch: string;
    readonly checkout: "pending" | "ready" | "failed";
    /** Why the checkout failed. */
    readonly error?: string;
}

export type RepositoryChipProps = {
    readonly repository: RepositoryChipRepository;
};

function textOf(repository: RepositoryChipRepository): string {
    const where = `${repository.name} · ${repository.branch}`;
    if (repository.checkout === "pending") return `${where} · checking out`;
    if (repository.checkout === "failed") return `${where} · checkout failed`;
    return where;
}

/**
 * C-338 RepositoryChip — the repository a cloud task's agent attached, beside
 * the compute chip in the composer's control row. The agent chooses it, so the
 * chip is read-only: where the work is and how its checkout went. Shown only
 * once a repository is attached.
 */
export function RepositoryChip(props: RepositoryChipProps) {
    const repository = props.repository;
    return (
        <span
            className="happy-repository-chip"
            data-checkout={repository.checkout}
            data-happy-desktop-ui="repository-chip"
            title={
                repository.checkout === "failed" && repository.error
                    ? repository.error
                    : `Works in ${repository.name}, branch ${repository.branch}`
            }
        >
            <Icon name="repository" size={14} />
            <span className="happy-repository-chip__label">{textOf(repository)}</span>
        </span>
    );
}
