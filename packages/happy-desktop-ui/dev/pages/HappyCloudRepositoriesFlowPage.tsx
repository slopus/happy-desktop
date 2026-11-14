import { happyLogoBlackUrl } from "../../src/assets";
import type { ReactNode } from "react";
import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
    type ConversationToolCall,
} from "happy-desktop-state";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import {
    ComposerFooterBar,
    ComputeChip,
    ContextMeter,
    HAPPY_AGENT_REPOSITORY_CREDENTIAL_NONE,
    HappyAgentRepositoriesSettings,
    HappyAgentRepositoryAddDialog,
    HappyAgentRepositoryDeleteDialog,
    HappyAgentRepositoryDialog,
    HappyAgentSettingsShell,
    RepositoryChip,
    type HappyAgentRepositoryCheck,
    type HappyAgentRepositoryDialogProps,
    type HappyAgentRepositoryPlugin,
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

/**
 * A plugin picture as the plugins store hands it over: an address and its
 * ThumbHash. Bundled so nothing loads over the network.
 */
const GITHUB_PLUGIN_IMAGE = {
    url: new URL("../assets/plugin-github-repositories.webp", import.meta.url).href,
    thumbhash: "1QcSBwAKhod2h3hyioeYR5eI96SkM5QA",
};

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
        id: "web",
        name: "web",
        location: "github.com/acme/web",
        defaultBranch: "main",
        access: "reachable",
        plugin: { name: "GitHub", image: GITHUB_PLUGIN_IMAGE, status: "active" },
    },
    {
        id: "api",
        name: "api",
        location: "github.com/acme/api",
        defaultBranch: "main",
        access: "failed",
        plugin: { name: "GitHub", image: GITHUB_PLUGIN_IMAGE, status: "missing" },
    },
    {
        id: "docs",
        name: "docs",
        location: "github.com/acme/docs",
        defaultBranch: "main",
        access: "reachable",
        plugin: { name: "GitHub", image: GITHUB_PLUGIN_IMAGE, status: "suspended" },
    },
    {
        id: "infra",
        name: "infra",
        location: "gitlab.acme.dev/platform/infra",
        defaultBranch: "trunk",
        access: "failed",
    },
];

/** The team's `git_credential` secrets from Settings › Secrets, labelled by name and server. */
const credentials = [
    { id: "ghpat1", label: "slopus deploy token · github.com" },
    { id: "acme-deploy", label: "Acme deploy token · github.com" },
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

function Add(props: {
    check: HappyAgentRepositoryCheck;
    credentialId?: string;
    none?: boolean;
    error?: string;
}) {
    return (
        <HappyAgentRepositoryAddDialog
            check={props.check}
            credentialId={props.credentialId ?? HAPPY_AGENT_REPOSITORY_CREDENTIAL_NONE}
            ssh={false}
            credentials={props.none ? [] : credentials}
            {...(props.none ? { onSecretsOpen: noop } : {})}
            {...(props.error ? { error: props.error } : {})}
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
    ssh: false,
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

const githubApp: HappyAgentRepositoryPlugin = {
    name: "GitHub",
    image: GITHUB_PLUGIN_IMAGE,
    detail: "GitHub App · acme",
    status: "active",
    onOpen: noop,
};

/** A repository the GitHub plugin added and signs in for, with nothing to pick. */
const managed: HappyAgentRepositoryDialogProps = {
    ...detail,
    name: "web",
    url: "https://github.com/acme/web.git",
    credentialId: HAPPY_AGENT_REPOSITORY_CREDENTIAL_NONE,
    credentials: [],
    plugin: githubApp,
};

/** A repository's own picture, as the server serves it: Happy's, for its own repository. */
const REPOSITORY_PICTURE = happyLogoBlackUrl;

const chips: readonly { label: string; repositories: readonly RepositoryChipRepository[] }[] = [
    {
        label: "checking out",
        repositories: [{ name: "rig", branch: "juno/fix-login", checkout: "pending" }],
    },
    {
        label: "ready",
        repositories: [{ name: "rig", branch: "juno/fix-login", checkout: "ready" }],
    },
    {
        label: "two checkouts: one changed, with its picture, and one read-only",
        repositories: [
            {
                name: "happy-agent",
                branch: "happy/juno",
                checkout: "ready",
                avatarUrl: REPOSITORY_PICTURE,
                changes: { files: 4, added: 128, deleted: 37 },
            },
            {
                name: "design-system",
                branch: "happy/juno",
                checkout: "ready",
                readOnly: true,
            },
        ],
    },
];

/* A checkout that failed is told on the tool call that ran it, in the
   transcript, and never as a chip: the composer row shows only what is checked
   out or still checking out. */

const CHECKOUT_ERROR = "The branch, tag or commit to start from does not exist in happy.";

function message(id: string, sender: ConversationAuthor, text: string): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "checkout",
            sequence: id,
            changePts: id,
            sender,
            text,
            ...(sender.kind === "agent" ? { generationStatus: "complete" as const } : {}),
            attachments: [],
            reactions: [],
            createdAt: "2026-11-13T19:34:00.000Z",
        },
    };
}

function checkoutCall(
    id: string,
    presentation: Extract<ConversationToolCall["presentation"], { type: "checkout" }>,
): ConversationEntry {
    const failed = presentation.status === "failed";
    return {
        kind: "agentActivity",
        id,
        sequence: id,
        activity: {
            kind: "tool",
            tool: {
                toolCallId: id,
                toolName: "checkout_repository",
                arguments: {
                    description: "Check out happy",
                    repository: "happy",
                    branch: "happy/test-pr-workflow",
                },
                status: failed ? "failed" : "success",
                failed,
                presentation,
                summary: "Check out happy",
                summaryKind: "description",
            },
        },
    };
}

const FAILED_CHECKOUT = checkoutCall("t1", {
    type: "checkout",
    repository: "happy",
    branch: "happy/test-pr-workflow",
    folder: "happy",
    status: "failed",
    error: CHECKOUT_ERROR,
});

const FAILED_TRANSCRIPT: readonly ConversationEntry[] = [
    message(
        "u1",
        happyAgentOwnerAuthor,
        "Check out happy on happy/test-pr-workflow and run its tests.",
    ),
    FAILED_CHECKOUT,
    message(
        "a1",
        agentAuthor,
        "The checkout failed: release, the branch I started from, does not exist in happy. Which branch should it start from?",
    ),
];

const RETRIED_TRANSCRIPT: readonly ConversationEntry[] = [
    ...FAILED_TRANSCRIPT,
    message("u2", happyAgentOwnerAuthor, "Start it from main."),
    checkoutCall("t2", {
        type: "checkout",
        repository: "happy",
        branch: "happy/test-pr-workflow",
        folder: "happy",
        status: "ready",
    }),
    message("a2", agentAuthor, "Checked out at /workspace/happy, from main."),
];

const composer: ComposerSnapshot = {
    scopeId: "checkout",
    text: "",
    attachments: [],
    revision: 0,
    submission: { status: "idle" },
    focused: false,
    capabilities: { shellMode: false, commands: [], mentions: true },
    mentionCandidates: [],
    agentUserIds: [],
};

/** A cloud task's chat, its composer row holding the chips for what is checked out. */
function Transcript(props: {
    entries: readonly ConversationEntry[];
    repositories: readonly RepositoryChipRepository[];
}) {
    return (
        <div
            style={{
                display: "flex",
                flex: "1 1 auto",
                minHeight: 0,
                background: "var(--surface)",
            }}
        >
            <ConversationView
                agentAuthor={agentAuthor}
                conversationId="checkout"
                dock={
                    <ConversationDock
                        composer={composer}
                        composerFooterControl={
                            <ComposerFooterBar
                                leading={<span style={{ fontSize: 12 }}>Auto</span>}
                                trailing={
                                    <>
                                        {props.repositories.map((repository) => (
                                            <RepositoryChip
                                                key={repository.name}
                                                repository={repository}
                                            />
                                        ))}
                                        <ComputeChip
                                            compute={{
                                                kind: "computer",
                                                label: "build-01",
                                                online: true,
                                            }}
                                        />
                                    </>
                                }
                            />
                        }
                        composerPlaceholder="Message Happy…"
                        onComposerSend={noop}
                        onComposerValueChange={noop}
                        running={false}
                    />
                }
                entries={props.entries}
                onRequestAnswer={noop}
                running={false}
                style={{ flex: "1 1 auto", minWidth: 0 }}
                viewerId={happyAgentOwnerAuthor.id}
            />
        </div>
    );
}

export function HappyCloudRepositoriesFlowPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A Happy Cloud server's repositories: the list, adding one and checking access, one repository's detail, deleting it, what a viewer sees, a repository a plugin manages, and the read-only chip for the repository a task's agent attached, beside the compute chip."
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
                detail="no git credential in Settings › Secrets covers the URL"
                number="05"
                screen="05-add-no-credential"
            >
                <List manage />
                <Add
                    check={{
                        state: "failed",
                        title: "Can't reach it",
                        message:
                            "github.com asked for a credential: acme/web is private. Add a git credential in Settings › Secrets, then check again.",
                    }}
                    none
                />
            </Screen>
            <Screen
                detail="an SSH repository: it needs a pinned SSH credential; the first checkout proves the rest"
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
                    credentialId="infra-key"
                    credentials={[{ id: "infra-key", label: "Infra deploy key · gitlab.acme.dev" }]}
                    name="infra"
                    onCheck={noop}
                    onClose={noop}
                    onCredentialChange={noop}
                    onNameChange={noop}
                    onSubmit={noop}
                    onUrlChange={noop}
                    submitting={false}
                    ssh
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
                detail="checking out · checked out · two checkouts, one with the lines it changed and its picture, one read-only · each beside the compute chip, one chip per checkout"
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
                                        {chip.repositories.map((repository) => (
                                            <RepositoryChip
                                                key={repository.name}
                                                repository={repository}
                                            />
                                        ))}
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
            <Screen
                detail="added by the GitHub plugin: who signs in, and no credential to pick"
                number="12"
                screen="12-plugin-managed"
            >
                <List manage />
                <HappyAgentRepositoryDialog {...managed} />
            </Screen>
            <Screen
                detail="added by the GitHub plugin, whose credential is gone: no method or account, and no second refusal box"
                number="13"
                screen="13-plugin-missing"
            >
                <List manage />
                <HappyAgentRepositoryDialog
                    {...managed}
                    check={{
                        state: "failed",
                        title: "Can't reach it",
                        message: "github.com refused the request: no credential applies.",
                    }}
                    name="api"
                    plugin={{
                        name: "GitHub",
                        image: GITHUB_PLUGIN_IMAGE,
                        status: "missing",
                        onOpen: noop,
                    }}
                    url="https://github.com/acme/api.git"
                />
            </Screen>
            <Screen
                detail="added by the GitHub plugin, seen by a viewer"
                number="14"
                screen="14-plugin-viewer"
            >
                <List manage={false} />
                <HappyAgentRepositoryDialog
                    {...managed}
                    check={{ state: "unchecked" }}
                    checkAllowed={false}
                    manage={false}
                    plugin={{
                        name: "GitHub",
                        image: null,
                        detail: "Personal access token",
                        status: "active",
                    }}
                />
            </Screen>
            <Screen
                detail="adding one pinned to a git credential the reader's role may not use"
                number="15"
                screen="15-add-secret-refused"
            >
                <List manage />
                <Add
                    check={{ state: "unchecked" }}
                    credentialId="acme-deploy"
                    error="Your role can't use this credential. Pick another, or ask whoever manages it in Settings › Secrets to let your role use it."
                />
            </Screen>
            <Screen
                detail="added by the GitHub plugin, whose installation GitHub suspended"
                number="16"
                screen="16-plugin-suspended"
            >
                <List manage />
                <HappyAgentRepositoryDialog
                    {...managed}
                    check={{
                        state: "failed",
                        title: "Can't reach it",
                        message: "github.com refused the request.",
                    }}
                    name="docs"
                    plugin={{ ...githubApp, status: "suspended", account: "acme" }}
                    url="https://github.com/acme/docs.git"
                />
            </Screen>
            <FullScreenSpecimen
                detail="the tool call that ran it says why; the composer row shows no chip for it"
                label="A checkout failed, in the transcript"
                number="17"
                screen="17-checkout-failed-1100x760"
                window={WINDOWS[0]}
            >
                <Transcript entries={FAILED_TRANSCRIPT} repositories={[]} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="the failed call stays as history; the retry checks it out and its chip appears"
                label="Retried after a fix"
                number="18"
                screen="18-checkout-retried-1100x760"
                window={WINDOWS[0]}
            >
                <Transcript
                    entries={RETRIED_TRANSCRIPT}
                    repositories={[
                        { name: "happy", branch: "happy/test-pr-workflow", checkout: "ready" },
                    ]}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
