import { Banner } from "./Banner";
import { Button } from "./Button";
import {
    HappyAgentRepositoryBranchPicker,
    type HappyAgentRepositoryBranchPickerRepository,
} from "./HappyAgentRepositoryBranchPicker";
import { TextField } from "./TextField";

export type HappyAgentCreateSubtaskPageProps = {
    /** The task the subtask belongs to. */
    readonly taskName: string;
    /** The chosen name. Blank, the server names it from its first message. */
    readonly name: string;
    readonly repositories: readonly HappyAgentRepositoryBranchPickerRepository[];
    /** The repository it starts in; absent, none. */
    readonly repositoryId?: string;
    /** The chosen repository's branches, once read. */
    readonly branches: readonly string[];
    readonly branchesLoading?: boolean;
    /** The branch to work on; absent, one of its own from the default branch. */
    readonly branch?: string;
    /** True while the subtask is being made: the surface stays up and inert. */
    readonly submitting?: boolean;
    /** A refused creation, stated here rather than thrown away. */
    readonly error?: string;
    /** Why a subtask cannot be made right now. */
    readonly submitDisabledReason?: string;
    onNameChange: (name: string) => void;
    onRepositoryChange: (repositoryId: string | undefined) => void;
    onBranchChange: (branch: string | undefined) => void;
    /** Makes the subtask without saying anything to it. */
    onSubmit: () => void;
};

/**
 * C-339 HappyAgentCreateSubtaskPage — starting a subtask of a cloud task: its
 * name and the repository and branch it works in, standing in the body of the
 * conversation it is about to become, over that conversation's composer, as
 * a new task's page does.
 */
export function HappyAgentCreateSubtaskPage(props: HappyAgentCreateSubtaskPageProps) {
    const submitting = props.submitting === true;
    const submittable = !submitting && props.submitDisabledReason === undefined;
    const submit = () => {
        if (submittable) props.onSubmit();
    };
    return (
        <div className="happy-agent-create-task" data-happy-desktop-ui="happy-agent-create-subtask">
            <header className="happy-agent-create-task__header">
                <h1 className="happy-agent-create-task__title">New subtask</h1>
                <p className="happy-agent-create-task__lede">
                    {`A piece of “${props.taskName}” with a conversation and a sandbox of its own. Start it in a repository to work on its code.`}
                </p>
            </header>
            <div className="happy-agent-create-task__below">
                <HappyAgentRepositoryBranchPicker
                    {...(props.branch === undefined ? {} : { branch: props.branch })}
                    branches={props.branches}
                    {...(props.branchesLoading ? { branchesLoading: true } : {})}
                    disabled={submitting}
                    onBranchChange={props.onBranchChange}
                    onRepositoryChange={props.onRepositoryChange}
                    repositories={props.repositories}
                    {...(props.repositoryId === undefined
                        ? {}
                        : { repositoryId: props.repositoryId })}
                />
                <div className="happy-agent-create-task__row">
                    <TextField
                        aria-label="Name"
                        className="happy-agent-create-task__name"
                        disabled={submitting}
                        fullWidth
                        onSubmit={submit}
                        onValueChange={props.onNameChange}
                        placeholder="Name, generated if left blank"
                        value={props.name}
                    />
                    <Button
                        className="happy-agent-create-task__create"
                        disabled={!submittable}
                        onClick={submit}
                        title={props.submitDisabledReason}
                        variant="secondary"
                    >
                        {submitting ? "Creating…" : "Create"}
                    </Button>
                </div>
                {props.submitDisabledReason ? (
                    <p className="happy-agent-create-task__reason">{props.submitDisabledReason}</p>
                ) : null}
                {props.error ? <Banner tone="danger">{props.error}</Banner> : null}
            </div>
        </div>
    );
}
