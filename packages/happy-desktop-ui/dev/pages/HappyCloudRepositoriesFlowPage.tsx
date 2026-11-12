import type { ReactNode } from "react";
import {
    ComposerFooterBar,
    ComputeChip,
    ContextMeter,
    HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC,
    HappyAgentRepositoriesSettings,
    HappyAgentRepositoryAddDialog,
    HappyAgentRepositoryDeleteDialog,
    HappyAgentRepositoryDialog,
    HappyAgentSettingsShell,
    RepositoryChip,
    type HappyAgentRepositoryCheck,
    type HappyAgentRepositoryDialogProps,
    type HappyAgentRepositoryRow,
    type HappyAgentSettingsCategory,
    type RepositoryChipRepository,
} from "../../src";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-040";

/** The settings categories a Happy Cloud server lists. */
const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { group: "Agents", icon: "globe", id: "providers", label: "Inference", tone: "indigo" },
    { group: "Agents", icon: "zap", id: "usage", label: "Usage", tone: "teal" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { group: "Team", icon: "users", id: "members", label: "Members", tone: "orange" },
    { group: "Team", icon: "repository", id: "repositories", label: "Repositories", tone: "gray" },
];

const noop = () => undefined;
const resolved = () => Promise.resolve();

const repositories: readonly HappyAgentRepositoryRow[] = [
    {
        id: "rig",
        name: "rig",
        location: "github.com/slopus/rig",
        defaultBranch: "main",
        access: "reachable",
    },
    {
        id: "happy-desktop",
        name: "happy-desktop",
        location: "github.com/slopus/happy-desktop",
        defaultBranch: "main",
        access: "reachable",
    },
    {
        id: "infra",
        name: "infra",
        location: "gitlab.acme.dev/platform/infra",
        defaultBranch: "trunk",
        access: "failed",
    },
];

const credentials = [
    { id: "ghpat1", label: "slopus deploy token · github.com/slopus" },
    { id: "ghapp", label: "Acme GitHub app · github.com" },
];

/** The window Happy opens at, and its minimum. */
const WINDOWS = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
] as const;

/** One screen of the settings window on Repositories, at both review window sizes. */
function Screen(props: { number: string; screen: string; detail: string; children: ReactNode }) {
    return WINDOWS.map((window) => (
        <FullScreenSpecimen
            detail={props.detail}
            key={window.width}
            label={`Settings — Repositories, ${String(window.width)} × ${String(window.height)}`}
            number={props.number}
            screen={`${props.screen}-${String(window.width)}x${String(window.height)}`}
            window={window}
        >
            {/* The overlay is fixed; the transform keeps a dialog inside its screen. */}
            <div style={{ display: "flex", transform: "translateZ(0)" }}>
                <HappyAgentSettingsShell
                    activeCategoryId="repositories"
                    categories={categories}
                    description="The code your team works on"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Repositories"
                >
                    {props.children}
                </HappyAgentSettingsShell>
            </div>
        </FullScreenSpecimen>
    ));
}

function List(props: { manage: boolean; empty?: boolean }) {
    return (
        <HappyAgentRepositoriesSettings
            loading={false}
            manage={props.manage}
            onAdd={noop}
            onOpen={noop}
            repositories={props.empty ? [] : repositories}
        />
    );
}

function Add(props: { check: HappyAgentRepositoryCheck; credentialId?: string; none?: boolean }) {
    return (
        <HappyAgentRepositoryAddDialog
            check={props.check}
            credentialId={props.credentialId ?? HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC}
            credentials={props.none ? [] : credentials}
            name="web"
            onCheck={noop}
            onClose={noop}
            onCredentialChange={noop}
            onNameChange={noop}
            onSubmit={noop}
            onUrlChange={noop}
            submitting={false}
            url="https://github.com/acme/web.git"
        />
    );
}

const detail: HappyAgentRepositoryDialogProps = {
    name: "rig",
    url: "https://github.com/slopus/rig.git",
    defaultBranch: "main",
    branches: ["main", "release", "next"],
    credentialId: "ghpat1",
    credentials,
    check: { state: "ok", summary: "Reachable · 12 branches · checked 4 minutes ago" },
    manage: true,
    checkAllowed: true,
    saving: false,
    onCheck: noop,
    onClose: noop,
    onCredentialChange: noop,
    onDefaultBranchChange: noop,
    onDelete: resolved,
    onNameSave: noop,
};

const chips: readonly { label: string; repository: RepositoryChipRepository }[] = [
    {
        label: "checking out",
        repository: { name: "rig", branch: "juno/fix-login", checkout: "pending" },
    },
    {
        label: "ready",
        repository: { name: "rig", branch: "juno/fix-login", checkout: "ready" },
    },
    {
        label: "failed",
        repository: {
            name: "rig",
            branch: "juno/fix-login",
            checkout: "failed",
            error: "You have no git credential for github.com/slopus.",
        },
    },
];

export function HappyCloudRepositoriesFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A Happy Cloud server's repositories: the list, adding one and checking access, one repository's detail, deleting it, what a viewer sees, and the read-only chip for the repository a task's agent attached, beside the compute chip."
            title="Happy Cloud repositories flow"
            width={WINDOWS[0].width + 96}
        >
            <Screen detail="no repositories yet, seen by a member" number="01" screen="01-empty">
                <List empty manage />
            </Screen>
            <Screen detail="the team's repositories" number="02" screen="02-list">
                <List manage />
            </Screen>
            <Screen
                detail="adding one: URL, credential, a passing check, its name"
                number="03"
                screen="03-add-checked"
            >
                <List manage />
                <Add
                    check={{
                        state: "ok",
                        summary: "Reachable · default branch main · 12 branches",
                    }}
                />
            </Screen>
            <Screen detail="the check was refused" number="04" screen="04-add-refused">
                <List manage />
                <Add
                    check={{
                        state: "failed",
                        title: "Access refused",
                        message:
                            "github.com refused the slopus deploy token. It may have expired, or it can't read acme/web.",
                    }}
                    credentialId="ghpat1"
                />
            </Screen>
            <Screen
                detail="no credential applies, and none is shared"
                number="05"
                screen="05-add-no-credential"
            >
                <List manage />
                <Add
                    check={{
                        state: "failed",
                        title: "No credential for github.com",
                        message:
                            "Neither you nor the team has a git credential for github.com/acme. Add one in Settings › Secrets, then check again.",
                    }}
                    none
                />
            </Screen>
            <Screen
                detail="an SSH repository: the credential applies; the first checkout proves the rest"
                number="06"
                screen="06-add-ssh"
            >
                <List manage />
                <HappyAgentRepositoryAddDialog
                    check={{
                        state: "partial",
                        summary:
                            "A credential applies. The first checkout confirms access over SSH.",
                    }}
                    credentialId={HAPPY_AGENT_REPOSITORY_CREDENTIAL_AUTOMATIC}
                    credentials={credentials}
                    name="infra"
                    onCheck={noop}
                    onClose={noop}
                    onCredentialChange={noop}
                    onNameChange={noop}
                    onSubmit={noop}
                    onUrlChange={noop}
                    submitting={false}
                    url="git@gitlab.acme.dev:platform/infra.git"
                />
            </Screen>
            <Screen
                detail="one repository: rename, default branch, credential, check access"
                number="07"
                screen="07-detail"
            >
                <List manage />
                <HappyAgentRepositoryDialog {...detail} />
            </Screen>
            <Screen detail="deleting it" number="08" screen="08-delete">
                <List manage />
                <HappyAgentRepositoryDeleteDialog name="rig" onClose={noop} onDelete={resolved} />
            </Screen>
            <Screen detail="seen by a viewer: no adding" number="09" screen="09-viewer-list">
                <List manage={false} />
            </Screen>
            <Screen
                detail="seen by a viewer: read-only, no check"
                number="10"
                screen="10-viewer-detail"
            >
                <List manage={false} />
                <HappyAgentRepositoryDialog
                    {...detail}
                    check={{ state: "unchecked" }}
                    checkAllowed={false}
                    manage={false}
                />
            </Screen>
            <Specimen
                detail="checking out · checked out · checkout failed, each beside the compute chip · shown once the agent attached a repository"
                label="Repository chip in the composer row"
                number="11"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {chips.map((chip) => (
                        <div key={chip.label} style={{ display: "flex", width: "640px" }}>
                            <ComposerFooterBar
                                leading={<span style={{ fontSize: 12 }}>Auto</span>}
                                trailing={
                                    <>
                                        <RepositoryChip repository={chip.repository} />
                                        <ComputeChip
                                            compute={{
                                                kind: "computer",
                                                label: "build-01",
                                                online: true,
                                            }}
                                        />
                                        <ContextMeter totalTokens={500_000} usedTokens={5_900} />
                                    </>
                                }
                            />
                        </div>
                    ))}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
