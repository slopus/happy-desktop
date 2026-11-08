import type {
    HappyAgentGitCredential,
    HappyAgentRepositoriesSnapshot,
    HappyAgentRepositoriesStore,
    HappyAgentRepository,
} from "happy-desktop-state";
import {
    HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC,
    HappyAgentRepositoriesSettings,
    HappyAgentRepositoryAddDialog,
    HappyAgentRepositoryDialog,
    type HappyAgentRepositoryCheck,
    type HappyAgentRepositoryCredentialOption,
} from "happy-desktop-ui";

/** Settings › Repositories on Happy Cloud, composed from its store. */
export function AppRepositoriesSettings(props: {
    readonly snapshot: HappyAgentRepositoriesSnapshot;
    readonly store: HappyAgentRepositoriesStore;
}) {
    const { snapshot, store } = props;
    const add = snapshot.add;
    const open = snapshot.open;
    const opened = open
        ? snapshot.repositories.find((repository) => repository.id === open.repositoryId)
        : undefined;
    return (
        <>
            <HappyAgentRepositoriesSettings
                loading={snapshot.loading}
                {...(snapshot.error ? { error: snapshot.error.message } : {})}
                manage={snapshot.manage}
                onAdd={() => store.addOpen()}
                onOpen={(repositoryId) => store.repositoryOpen(repositoryId)}
                repositories={snapshot.repositories.map((repository) => ({
                    id: repository.id,
                    name: repository.name,
                    location: `${repository.host}/${repository.path}`,
                    ...(repository.defaultBranch
                        ? { defaultBranch: repository.defaultBranch }
                        : {}),
                    access:
                        repository.lastCheck === null
                            ? "unchecked"
                            : repository.lastCheck.ok === false
                              ? "failed"
                              : "reachable",
                }))}
            />
            {add ? (
                <HappyAgentRepositoryAddDialog
                    check={
                        add.checking
                            ? { state: "checking" }
                            : add.check
                              ? checkView(add.check, undefined)
                              : { state: "unchecked" }
                    }
                    credentialId={add.credentialId ?? HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC}
                    credentials={add.credentials.map(credentialOption)}
                    {...(add.error ? { error: add.error.message } : {})}
                    name={add.name}
                    onCheck={() => store.addCheck()}
                    onClose={() => store.addClose()}
                    onCredentialChange={(credentialId) =>
                        store.addCredentialUpdate(credentialIdOf(credentialId))
                    }
                    onNameChange={(name) => store.addNameUpdate(name)}
                    onSubmit={() => store.addSubmit()}
                    onUrlChange={(url) => store.addUrlUpdate(url)}
                    submitting={add.submitting}
                    url={add.url}
                />
            ) : null}
            {open && opened ? (
                <HappyAgentRepositoryDialog
                    branches={branchesOf(snapshot, opened)}
                    check={
                        open.checking
                            ? { state: "checking" }
                            : opened.lastCheck
                              ? checkView(opened.lastCheck, opened)
                              : { state: "unchecked" }
                    }
                    checkAllowed={snapshot.checkAllowed}
                    credentialId={
                        opened.credentialId ?? HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC
                    }
                    credentials={open.credentials.map(credentialOption)}
                    {...(opened.defaultBranch ? { defaultBranch: opened.defaultBranch } : {})}
                    {...(open.error ? { error: open.error.message } : {})}
                    key={opened.id}
                    manage={snapshot.manage}
                    name={opened.name}
                    onCheck={() => store.repositoryCheck()}
                    onClose={() => store.repositoryClose()}
                    onCredentialChange={(credentialId) =>
                        store.repositoryCredentialUpdate(credentialIdOf(credentialId))
                    }
                    onDefaultBranchChange={(branch) => store.repositoryDefaultBranchUpdate(branch)}
                    onDelete={() => store.repositoryDelete()}
                    onNameSave={(name) => store.repositoryNameSave(name)}
                    saving={open.saving}
                    url={opened.url}
                />
            ) : null}
        </>
    );
}

/** The branches read for a repository, or its default one until they are. */
export function branchesOf(
    snapshot: HappyAgentRepositoriesSnapshot,
    repository: HappyAgentRepository,
): readonly string[] {
    const names = snapshot.branches.get(repository.id)?.names ?? [];
    if (names.length > 0) return names;
    return repository.defaultBranch ? [repository.defaultBranch] : [];
}

function credentialIdOf(value: string): string | null {
    return value === HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC ? null : value;
}

function credentialOption(
    credential: HappyAgentGitCredential,
): HappyAgentRepositoryCredentialOption {
    return {
        id: credential.id,
        label:
            credential.hosts.length > 0
                ? `${credential.name} · ${credential.hosts.join(", ")}`
                : credential.name,
    };
}

/** What a check found, in the words the dialogs show. */
function checkView(
    check: NonNullable<HappyAgentRepository["lastCheck"]>,
    repository: HappyAgentRepository | undefined,
): HappyAgentRepositoryCheck {
    if (check.ok === false)
        return {
            state: "failed",
            title: "Can't reach it",
            message: check.error?.message || "The repository couldn't be reached.",
        };
    const when = checkedWhen(check.checkedAt);
    if (check.ok === null)
        return {
            state: "partial",
            summary: `SSH is checked by the first checkout · ${when}`,
        };
    const branch = check.defaultBranch ?? repository?.defaultBranch;
    return {
        state: "ok",
        summary: [
            branch ? `Default branch ${branch}` : undefined,
            check.branches === null
                ? undefined
                : check.branches === 1
                  ? "1 branch"
                  : `${String(check.branches)} branches`,
            when,
        ]
            .filter(Boolean)
            .join(" · "),
    };
}

function checkedWhen(at: number): string {
    if (at <= 0) return "checked";
    const minutes = Math.round((Date.now() - at) / 60_000);
    if (minutes < 1) return "checked just now";
    if (minutes < 60) return `checked ${String(minutes)} min ago`;
    return `checked ${new Date(at).toLocaleDateString([], { month: "short", day: "numeric" })}`;
}
