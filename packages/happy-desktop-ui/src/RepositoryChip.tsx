import { Icon } from "./Icon";

/** The repository a cloud subtask works in, and its checkout. */
export type RepositoryChipRepository =
    | { readonly kind: "none" }
    | {
          readonly kind: "bound";
          readonly name: string;
          readonly branch: string;
          readonly checkout: "pending" | "ready" | "failed";
          /** Why the checkout failed. */
          readonly error?: string;
      };

export type RepositoryChipProps = {
    readonly repository: RepositoryChipRepository;
};

function textOf(repository: RepositoryChipRepository): string {
    if (repository.kind === "none") return "No repository";
    const where = `${repository.name} · ${repository.branch}`;
    if (repository.checkout === "pending") return `${where} · checking out`;
    if (repository.checkout === "failed") return `${where} · checkout failed`;
    return where;
}

/**
 * C-338 RepositoryChip — the repository a cloud subtask works in, beside the
 * compute chip in the composer's control row. The subtask is started in it, so
 * the chip only says where it is and how its checkout went.
 */
export function RepositoryChip(props: RepositoryChipProps) {
    const repository = props.repository;
    return (
        <span
            className="happy-repository-chip"
            data-checkout={repository.kind === "none" ? undefined : repository.checkout}
            data-happy-desktop-ui="repository-chip"
            data-kind={repository.kind}
            title={
                repository.kind === "none"
                    ? "This conversation works in no repository."
                    : repository.checkout === "failed" && repository.error
                      ? repository.error
                      : `Works in ${repository.name}, branch ${repository.branch}`
            }
        >
            <Icon name="repository" size={14} />
            <span className="happy-repository-chip__label">{textOf(repository)}</span>
        </span>
    );
}
