import type { ReactNode } from "react";
import { HappyAgentProjectSettingsDialog } from "../../src/HappyAgentProjectSettingsDialog";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-178";

/**
 * The dialog is fixed to the window it is in, so a specimen gives it one. The
 * archive specimens ask for a taller one: the block is below the fields, and a
 * window too short to hold it would only show the modal's own body scrolling.
 */
function frame(children: ReactNode, height = 560) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: `${String(height)}px`,
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "800px",
            }}
        >
            {children}
        </div>
    );
}

const happy = {
    contents: { sessions: 7, worktrees: 2 },
    location: { displayPath: "~/Developer/happy", path: "/Users/steve/Developer/happy" },
    name: "happy",
} as const;

/** The host has answered and the project states nothing: the machine decides. */
const computeDefault = {
    status: "ready",
    mode: "default",
    image: "",
} as const;

/** The host has answered: two commands from the repository's happy.toml, and no first message. */
const setupCommands = {
    status: "ready",
    setupCommands: ["pnpm install --frozen-lockfile", "pnpm build"],
    initialPromptDraft: "",
} as const;

const setupHandlers = {
    onInitialPromptChange: () => {},
    onInitialPromptSubmit: () => {},
    onSetupFileOpen: () => {},
} as const;

export function HappyAgentProjectSettingsDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="What one project of the local workspace is, what it is set to, and what the daemon takes new values for."
            title="HappyAgentProjectSettingsDialog"
        >
            <Specimen
                detail="480px · identity · editable name · read-only location"
                label="Open"
                number="01"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        draft="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                )}
                <DimensionRule label="modal medium 480px" />
            </Specimen>
            <Specimen detail="draft edited · commit enabled" label="Edited" number="02" stage="app">
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        draft="Happy Desktop"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                )}
            </Specimen>
            <Specimen
                detail="host being told · the field and the commit go inert together"
                label="Saving"
                number="03"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        draft="Happy Desktop"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        submitting
                    />,
                )}
            </Specimen>
            <Specimen
                detail="no worktrees, nothing run yet, long path"
                label="Empty project"
                number="04"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        contents={{ sessions: 0, worktrees: 0 }}
                        draft="renderer-benchmarks"
                        location={{
                            displayPath:
                                "~/Developer/experiments/2026/renderer-benchmarks-and-traces",
                            path: "/Users/steve/Developer/experiments/2026/renderer-benchmarks-and-traces",
                        }}
                        name="renderer-benchmarks"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                )}
            </Specimen>
            <Specimen
                detail="the act that ends the project, below everything the reader came to look at"
                label="Archive offered"
                number="05"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        archive={{}}
                        draft="happy"
                        onArchiveRequest={() => {}}
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    860,
                )}
            </Specimen>
            <Specimen
                detail="the question names the project and says what leaves with it"
                label="Archive confirming"
                number="06"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        archive={{ confirming: true }}
                        draft="happy"
                        onArchiveCancel={() => {}}
                        onArchiveConfirm={() => {}}
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    860,
                )}
            </Specimen>
            <Specimen
                detail="the host is being told and cannot be recalled: the whole dialog goes inert, dismissal included"
                label="Archiving"
                number="07"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        archive={{ confirming: true, submitting: true }}
                        draft="happy"
                        onArchiveCancel={() => {}}
                        onArchiveConfirm={() => {}}
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    860,
                )}
            </Specimen>
            <Specimen
                detail="the host refused and the project came back: the reason and the same button"
                label="Archive failed"
                number="08"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        archive={{
                            confirming: true,
                            error: "The project changed before it could be archived.",
                        }}
                        draft="happy"
                        onArchiveCancel={() => {}}
                        onArchiveConfirm={() => {}}
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    860,
                )}
            </Specimen>
            <Specimen
                detail="the checkout was archived from elsewhere while this was open: the edit stays and the section it can no longer state is dropped"
                label="Project gone"
                number="09"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        draft="happy"
                        name="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                )}
            </Specimen>
            <Specimen
                detail="the row left the list while the archive was still with the host: the operation the reader started is still on screen, still inert, still theirs"
                label="Archiving, row gone"
                number="10"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        archive={{ confirming: true, submitting: true }}
                        draft="happy"
                        name="happy"
                        onArchiveCancel={() => {}}
                        onArchiveConfirm={() => {}}
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    720,
                )}
            </Specimen>
            <Specimen
                detail="the host has answered · the project states nothing and the machine decides"
                label="Compute, machine default"
                number="11"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        compute={computeDefault}
                        draft="happy"
                        onClose={() => {}}
                        onComputeImageChange={() => {}}
                        onComputeModeChange={() => {}}
                        onComputeSubmit={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    780,
                )}
                <DimensionRule label="segmented control · full width of the 480px card body" />
            </Specimen>
            <Specimen
                detail="the host's answer is not in yet: nothing claims to be chosen and nothing can be"
                label="Compute, reading"
                number="12"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        compute={{ status: "loading", mode: "default", image: "" }}
                        draft="happy"
                        onClose={() => {}}
                        onComputeImageChange={() => {}}
                        onComputeModeChange={() => {}}
                        onComputeSubmit={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    780,
                )}
            </Specimen>
            <Specimen
                detail="the project is set to this machine and the reader has not changed it: no pending row"
                label="Compute, this machine"
                number="13"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        compute={{
                            status: "ready",
                            current: { type: "local" },
                            mode: "local",
                            image: "",
                        }}
                        draft="happy"
                        onClose={() => {}}
                        onComputeImageChange={() => {}}
                        onComputeModeChange={() => {}}
                        onComputeSubmit={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    780,
                )}
            </Specimen>
            <Specimen
                detail="the image field appears in the same column · what is set now sits beside the commit that would change it"
                label="Compute, container chosen"
                number="14"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        compute={{
                            status: "ready",
                            current: { type: "local" },
                            mode: "docker",
                            image: "node:22-bookworm",
                        }}
                        draft="happy"
                        onClose={() => {}}
                        onComputeImageChange={() => {}}
                        onComputeModeChange={() => {}}
                        onComputeSubmit={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    820,
                )}
            </Specimen>
            <Specimen
                detail="a long registry reference: the field scrolls it and the line under it truncates rather than growing the row"
                label="Compute, long image"
                number="15"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        compute={{
                            status: "ready",
                            current: {
                                type: "docker",
                                image: "europe-west4-docker.pkg.dev/happy-engineering/agents/happy-agent-toolchain-ubuntu-24-04:2026-07-31",
                            },
                            mode: "docker",
                            image: "europe-west4-docker.pkg.dev/happy-engineering/agents/happy-agent-toolchain-ubuntu-24-04:2026-08-02",
                        }}
                        draft="happy"
                        onClose={() => {}}
                        onComputeImageChange={() => {}}
                        onComputeModeChange={() => {}}
                        onComputeSubmit={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    820,
                )}
            </Specimen>
            <Specimen
                detail="the host is being told: every control in the dialog is inert and the commit says what it is doing"
                label="Compute, applying"
                number="16"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        compute={{
                            status: "ready",
                            current: { type: "local" },
                            mode: "docker",
                            image: "node:22-bookworm",
                            submitting: true,
                        }}
                        draft="happy"
                        onClose={() => {}}
                        onComputeImageChange={() => {}}
                        onComputeModeChange={() => {}}
                        onComputeSubmit={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    820,
                )}
            </Specimen>
            <Specimen
                detail="the host refused: the reason, the choice still in hand, and the same commit"
                label="Compute, not saved"
                number="17"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        compute={{
                            status: "ready",
                            current: { type: "local" },
                            error: "The project changed before its settings could be saved.",
                            mode: "docker",
                            image: "node:22-bookworm",
                        }}
                        draft="happy"
                        onClose={() => {}}
                        onComputeImageChange={() => {}}
                        onComputeModeChange={() => {}}
                        onComputeSubmit={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    880,
                )}
            </Specimen>
            <Specimen
                detail="the setting could not be read: the section says so and offers no choice it cannot ground"
                label="Compute, not read"
                number="18"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        compute={{
                            status: "error",
                            mode: "default",
                            image: "",
                            readError: "The Happy Agent on this machine could not be reached.",
                        }}
                        draft="happy"
                        onClose={() => {}}
                        onComputeImageChange={() => {}}
                        onComputeModeChange={() => {}}
                        onComputeSubmit={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                    />,
                    820,
                )}
            </Specimen>
            <Specimen
                detail="the same section on the dark appearance, pinned so both are reviewed against their real surface"
                label="Compute, dark"
                number="19"
                stage="app"
            >
                <div className="happy-theme-dark" style={{ display: "flex" }}>
                    {frame(
                        <HappyAgentProjectSettingsDialog
                            {...happy}
                            compute={{
                                status: "ready",
                                current: { type: "local" },
                                mode: "docker",
                                image: "node:22-bookworm",
                            }}
                            draft="happy"
                            onClose={() => {}}
                            onComputeImageChange={() => {}}
                            onComputeModeChange={() => {}}
                            onComputeSubmit={() => {}}
                            onDraftChange={() => {}}
                            onSubmit={() => {}}
                        />,
                        820,
                    )}
                </div>
            </Specimen>
            <Specimen
                detail="the same section on the light appearance"
                label="Compute, light"
                number="20"
                stage="app"
            >
                <div className="happy-theme-light" style={{ display: "flex" }}>
                    {frame(
                        <HappyAgentProjectSettingsDialog
                            {...happy}
                            compute={{
                                status: "ready",
                                current: { type: "local" },
                                mode: "docker",
                                image: "node:22-bookworm",
                            }}
                            draft="happy"
                            onClose={() => {}}
                            onComputeImageChange={() => {}}
                            onComputeModeChange={() => {}}
                            onComputeSubmit={() => {}}
                            onDraftChange={() => {}}
                            onSubmit={() => {}}
                        />,
                        820,
                    )}
                </div>
            </Specimen>
            <Specimen
                detail="known Happy Agent offline · local drafts remain editable · rename, compute and archive commits wait for reconnect"
                label="Happy Agent offline"
                number="21"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        archive={{}}
                        compute={{
                            status: "ready",
                            current: { type: "local" },
                            mode: "docker",
                            image: "node:22-bookworm",
                        }}
                        draft="Happy Desktop"
                        onArchiveRequest={() => {}}
                        onClose={() => {}}
                        onComputeImageChange={() => {}}
                        onComputeModeChange={() => {}}
                        onComputeSubmit={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        submitDisabledReason="Happy Agent is offline. Drafts are preserved."
                    />,
                    880,
                )}
            </Specimen>
            <Specimen
                detail="the host has answered · two commands read from happy.toml, shown in a well and not editable · the first message is empty"
                label="Setup, commands"
                number="22"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        {...setupHandlers}
                        draft="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        setup={setupCommands}
                    />,
                    900,
                )}
                <DimensionRule label="commands well · 36px minimum · 20px per command" />
            </Specimen>
            <Specimen
                detail="the file names nothing: the well says so and the note says where to write them"
                label="Setup, no commands"
                number="23"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        {...setupHandlers}
                        draft="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        setup={{ status: "ready", setupCommands: [], initialPromptDraft: "" }}
                    />,
                    900,
                )}
            </Specimen>
            <Specimen
                detail="the host's answer is not in yet: the well says it is reading and the message cannot be edited"
                label="Setup, reading"
                number="24"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        {...setupHandlers}
                        draft="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        setup={{ status: "loading", setupCommands: [], initialPromptDraft: "" }}
                    />,
                    900,
                )}
            </Specimen>
            <Specimen
                detail="a first message written over nothing: what the host holds sits beside the commit that would change it"
                label="Setup, message pending"
                number="25"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        {...setupHandlers}
                        draft="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        setup={{
                            ...setupCommands,
                            initialPromptDraft:
                                "Install dependencies and run the whole test suite. Report what fails before changing anything.",
                        }}
                    />,
                    940,
                )}
            </Specimen>
            <Specimen
                detail="the host holds a message and the reader has not touched it: no pending row"
                label="Setup, message set"
                number="26"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        {...setupHandlers}
                        draft="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        setup={{
                            ...setupCommands,
                            initialPrompt:
                                "Install dependencies and run the whole test suite. Report what fails before changing anything.",
                            initialPromptDraft:
                                "Install dependencies and run the whole test suite. Report what fails before changing anything.",
                        }}
                    />,
                    900,
                )}
            </Specimen>
            <Specimen
                detail="the host is being told: the whole dialog is inert and the commit says what it is doing"
                label="Setup, applying"
                number="27"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        {...setupHandlers}
                        draft="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        setup={{
                            ...setupCommands,
                            initialPromptDraft: "Run pnpm install, then wait for instructions.",
                            submitting: true,
                        }}
                    />,
                    940,
                )}
            </Specimen>
            <Specimen
                detail="the host refused: the reason, the text still in hand, and the same commit"
                label="Setup, not saved"
                number="28"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        {...setupHandlers}
                        draft="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        setup={{
                            ...setupCommands,
                            error: "The project changed before its settings could be saved.",
                            initialPromptDraft: "Run pnpm install, then wait for instructions.",
                        }}
                    />,
                    1000,
                )}
            </Specimen>
            <Specimen
                detail="the settings could not be read: the section says so and offers nothing it cannot ground"
                label="Setup, not read"
                number="29"
                stage="app"
            >
                {frame(
                    <HappyAgentProjectSettingsDialog
                        {...happy}
                        {...setupHandlers}
                        draft="happy"
                        onClose={() => {}}
                        onDraftChange={() => {}}
                        onSubmit={() => {}}
                        setup={{
                            status: "error",
                            setupCommands: [],
                            initialPromptDraft: "",
                            readError: "The Happy Agent on this machine could not be reached.",
                        }}
                    />,
                    940,
                )}
            </Specimen>
            <Specimen
                detail="the whole dialog as the app composes it: compute and setup together, on the dark appearance"
                label="Compute and setup, dark"
                number="30"
                stage="app"
            >
                <div className="happy-theme-dark" style={{ display: "flex" }}>
                    {frame(
                        <HappyAgentProjectSettingsDialog
                            {...happy}
                            {...setupHandlers}
                            archive={{}}
                            compute={computeDefault}
                            draft="happy"
                            onArchiveRequest={() => {}}
                            onClose={() => {}}
                            onComputeImageChange={() => {}}
                            onComputeModeChange={() => {}}
                            onComputeSubmit={() => {}}
                            onDraftChange={() => {}}
                            onSubmit={() => {}}
                            setup={setupCommands}
                        />,
                        1240,
                    )}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
