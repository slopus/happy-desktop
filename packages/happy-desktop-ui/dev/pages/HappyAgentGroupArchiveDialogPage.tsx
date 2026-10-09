import type { ReactNode } from "react";
import {
    HappyAgentGroupArchiveDialog,
    type HappyAgentGroupArchiveSubject,
} from "../../src/HappyAgentGroupArchiveDialog";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-286";

/** Gives each fixed overlay a desktop-sized, clipping-safe specimen window. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: "560px",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "760px",
            }}
        >
            {children}
        </div>
    );
}

const handlers = {
    askAgain: true,
    onAskAgainChange: () => undefined,
    onCancel: () => undefined,
    onConfirm: () => undefined,
};

const cleanWorkspace: HappyAgentGroupArchiveSubject = {
    kind: "workspace",
    name: "codex-agent-resource-attribution",
    changes: { status: "clean" },
};

const dirtyWorkspace: HappyAgentGroupArchiveSubject = {
    ...cleanWorkspace,
    name: "sidebar-archive-confirmation",
    changes: { status: "dirty", changedFiles: 7, addedLines: 312, deletedLines: 48 },
};

const uncheckedWorkspace: HappyAgentGroupArchiveSubject = {
    ...cleanWorkspace,
    name: "flaky-network-retries",
    changes: { status: "unknown" },
};

const project: HappyAgentGroupArchiveSubject = {
    kind: "project",
    name: "happy-desktop",
    worktrees: 3,
};

export function HappyAgentGroupArchiveDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Archiving a workspace deletes its worktree folder, so the confirmation names the folder, reports what uncommitted work it still holds, and asks before anything is removed. A project says how many workspaces leave with it."
            title="HappyAgentGroupArchiveDialog"
        >
            <Specimen
                detail="360px · workspace · clean worktree folder"
                label="Workspace, clean"
                number="01"
                stage="app"
            >
                {frame(<HappyAgentGroupArchiveDialog {...handlers} subject={cleanWorkspace} />)}
            </Specimen>

            <Specimen
                detail="360px · workspace · uncommitted changes called out in the summary"
                label="Workspace, uncommitted changes"
                number="02"
                stage="app"
            >
                {frame(<HappyAgentGroupArchiveDialog {...handlers} subject={dirtyWorkspace} />)}
            </Specimen>

            <Specimen
                detail="360px · workspace · change count missing or stale"
                label="Workspace, unchecked"
                number="03"
                stage="app"
            >
                {frame(<HappyAgentGroupArchiveDialog {...handlers} subject={uncheckedWorkspace} />)}
            </Specimen>

            <Specimen
                detail="360px · project · workspaces under it are archived, its checkout stays"
                label="Project"
                number="04"
                stage="app"
            >
                {frame(<HappyAgentGroupArchiveDialog {...handlers} subject={project} />)}
            </Specimen>

            <Specimen
                detail="360px · workspace · Don’t ask again ticked; the caller records it on confirm"
                label="Workspace, don’t ask again"
                number="04b"
                stage="app"
            >
                {frame(
                    <HappyAgentGroupArchiveDialog
                        {...handlers}
                        askAgain={false}
                        subject={cleanWorkspace}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="360px · request in flight · controls inert, dismissal unavailable"
                label="Archiving"
                number="05"
                stage="app"
            >
                {frame(
                    <HappyAgentGroupArchiveDialog
                        {...handlers}
                        subject={dirtyWorkspace}
                        submitting
                    />,
                )}
            </Specimen>

            <Specimen
                detail="360px · host refused · reason stays above the same button"
                label="Error"
                number="06"
                stage="app"
            >
                {frame(
                    <HappyAgentGroupArchiveDialog
                        {...handlers}
                        error="The worktree folder is in use by another process."
                        subject={cleanWorkspace}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="360px · Happy Agent offline · confirmation unavailable with the reason shown"
                label="Unavailable"
                number="07"
                stage="app"
            >
                {frame(
                    <HappyAgentGroupArchiveDialog
                        {...handlers}
                        confirmDisabledReason="This Happy Agent is reconnecting. Try again when it is online."
                        subject={cleanWorkspace}
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
