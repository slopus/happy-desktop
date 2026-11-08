import { Select } from "./Select";

/** One of the team's repositories new work may start in. */
export interface HappyAgentRepositoryBranchPickerRepository {
    readonly id: string;
    readonly name: string;
    /** Where a branch of its own starts from. */
    readonly defaultBranch?: string;
}

export type HappyAgentRepositoryBranchPickerProps = {
    readonly repositories: readonly HappyAgentRepositoryBranchPickerRepository[];
    /** The repository chosen; absent, none. */
    readonly repositoryId?: string;
    /** The chosen repository's branches, once read. */
    readonly branches: readonly string[];
    /** True while those branches are being read. */
    readonly branchesLoading?: boolean;
    /** The branch to work on; absent, one of its own from the default branch. */
    readonly branch?: string;
    readonly disabled?: boolean;
    onRepositoryChange: (repositoryId: string | undefined) => void;
    onBranchChange: (branch: string | undefined) => void;
};

const NONE = "";

/**
 * C-340 HappyAgentRepositoryBranchPicker — which of the team's repositories
 * new work starts in, and on which branch: an existing branch, or one of its
 * own made from the default branch. Two native selects; the branch one is
 * inert until a repository is chosen.
 */
export function HappyAgentRepositoryBranchPicker(props: HappyAgentRepositoryBranchPickerProps) {
    const chosen = props.repositories.find((repository) => repository.id === props.repositoryId);
    const own = chosen?.defaultBranch
        ? `New branch from ${chosen.defaultBranch}`
        : "New branch of its own";
    const listed =
        props.branch === undefined || props.branches.includes(props.branch)
            ? props.branches
            : [props.branch, ...props.branches];
    return (
        <>
            <Select
                aria-label="Repository"
                disabled={props.disabled}
                fullWidth
                onValueChange={(value) =>
                    props.onRepositoryChange(value === NONE ? undefined : value)
                }
                options={[
                    { value: NONE, label: "No repository" },
                    ...props.repositories.map((repository) => ({
                        value: repository.id,
                        label: repository.name,
                    })),
                ]}
                value={props.repositoryId ?? NONE}
            />
            {/* Always there, so choosing a repository moves nothing. */}
            <Select
                aria-label="Branch"
                disabled={props.disabled === true || chosen === undefined}
                fullWidth
                onValueChange={(value) => props.onBranchChange(value === NONE ? undefined : value)}
                options={
                    chosen
                        ? [
                              {
                                  value: NONE,
                                  label: props.branchesLoading ? `${own} · reading branches…` : own,
                              },
                              ...listed.map((branch) => ({ value: branch, label: branch })),
                          ]
                        : [{ value: NONE, label: "No branch" }]
                }
                value={chosen ? (props.branch ?? NONE) : NONE}
            />
        </>
    );
}
