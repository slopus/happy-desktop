import type { ReactNode } from "react";
import { HappyAgentProjectCloneDialog } from "../../src/HappyAgentProjectCloneDialog";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-256";

/** Gives each fixed overlay a desktop-sized, clipping-safe specimen window. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: "420px",
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
    onClose: () => undefined,
    onRepositoryChange: () => undefined,
    onSubmit: () => undefined,
};

export function HappyAgentProjectCloneDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Cloning a GitHub repository onto one Happy Agent: paste a GitHub URL or write owner/repository, then let that Happy Agent create the checkout. A Happy Agent on a computer of the reader's own also opens a folder already there, written as its path in the same field."
            title="HappyAgentProjectCloneDialog"
        >
            <Specimen
                detail="480px · blank GitHub repository · Clone project disabled"
                label="Default"
                number="01"
                stage="app"
            >
                {frame(<HappyAgentProjectCloneDialog {...handlers} repository="" />)}
            </Specimen>

            <Specimen
                detail="480px · request in flight · controls inert"
                label="Cloning"
                number="02"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectCloneDialog
                        {...handlers}
                        repository="anthropics/claude-code"
                        submitting
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · clone error remains beside the retained repository"
                label="Error"
                number="03"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectCloneDialog
                        {...handlers}
                        error="GitHub could not find a repository at that address."
                        repository="octo-org/missing-project"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · Happy Agent offline · clear reason shown and submission unavailable"
                label="Unavailable"
                number="04"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectCloneDialog
                        {...handlers}
                        repository="owner/project"
                        submitDisabledReason="This Happy Agent is reconnecting. Try again when it is online."
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · Happy Agent on the reader's own computer · folder or repository, Clone project disabled"
                label="Folder offered"
                number="05"
                stage="app"
            >
                {frame(<HappyAgentProjectCloneDialog {...handlers} folderOffered repository="" />)}
            </Specimen>

            <Specimen
                detail="480px · draft names a folder · primary action opens it"
                label="Folder named"
                number="06"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectCloneDialog
                        {...handlers}
                        folderNamed
                        folderOffered
                        repository="~/Projects/app"
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · folder being opened · controls inert"
                label="Opening"
                number="07"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectCloneDialog
                        {...handlers}
                        folderNamed
                        folderOffered
                        repository="~/Projects/app"
                        submitting
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · folder error remains beside the retained path"
                label="Folder error"
                number="08"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectCloneDialog
                        {...handlers}
                        error="There is no folder at ~/Projects/missing."
                        folderNamed
                        folderOffered
                        repository="~/Projects/missing"
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
