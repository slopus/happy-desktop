import type { ReactNode } from "react";
import { HappyAgentBotSettingsDialog } from "../../src/HappyAgentBotSettingsDialog";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-355";

/** The dialog is fixed to the window it is in, so a specimen gives it one. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: "640px",
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

const INSTRUCTIONS = `You help the design team keep its review queue moving.

- Each morning, list the reviews waiting on someone and who they wait on.
- Draft short, kind nudges; never send one without asking.
- Link every item to its Figma file or pull request.`;

const handlers = {
    onAvatarChoose: () => {},
    onClose: () => {},
    onInstructionsChange: () => {},
    onNameChange: () => {},
    onSubmit: () => {},
} as const;

const reviewer = {
    instructions: INSTRUCTIONS,
    instructionsBytes: new TextEncoder().encode(INSTRUCTIONS).byteLength,
    instructionsMaximumBytes: 32 * 1024,
    name: "Design reviewer",
    nameDraft: "Design reviewer",
    placeholderSeed: "bot_design_reviewer",
} as const;

export function HappyAgentBotSettingsDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A Happy Cloud personal bot's name, picture, and instructions, for a reader the host lets edit them."
            title="HappyAgentBotSettingsDialog"
        >
            <Specimen
                detail="identity · name · instructions with room left"
                label="Open"
                number="01"
                stage="app"
            >
                {frame(<HappyAgentBotSettingsDialog {...reviewer} {...handlers} />)}
            </Specimen>
            <Specimen
                detail="nothing written yet: the placeholder says what goes here"
                label="Empty instructions"
                number="02"
                stage="app"
            >
                {frame(
                    <HappyAgentBotSettingsDialog
                        {...reviewer}
                        {...handlers}
                        instructions=""
                        instructionsBytes={0}
                    />,
                )}
            </Specimen>
            <Specimen
                detail="the host is being told; fields and Save go inert"
                label="Saving"
                number="03"
                stage="app"
            >
                {frame(<HappyAgentBotSettingsDialog {...reviewer} {...handlers} submitting />)}
            </Specimen>
            <Specimen
                detail="the host refused; drafts stay, the reason is stated"
                label="Refused"
                number="04"
                stage="app"
            >
                {frame(
                    <HappyAgentBotSettingsDialog
                        {...reviewer}
                        {...handlers}
                        error="The bot changed somewhere else in the meantime. Try again."
                    />,
                )}
            </Specimen>
        </ComponentPage>
    );
}
