import type { ReactNode } from "react";
import {
    HappyAgentTaskBrowseDialog,
    type HappyAgentTaskBrowseEntry,
} from "../../src/HappyAgentTaskBrowseDialog";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-286";

const PHOTO =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPorvk+ufrTrOp3i6perqx8srHiwY6K2wfKrzNgFT1edokBq+j5srMMWEWvlZ5kwCp6r+QIA1bRp8X7GbCKvi3ezYBV9EvRNgD7aoNVazUeBQAAAABJRU5ErkJggg==";

/** Gives each fixed overlay a desktop-sized, clipping-safe specimen window. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--surface-pressed-overlay)",
                borderRadius: "8px",
                height: "520px",
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
    onJoin: () => undefined,
    onOpen: () => undefined,
};

const TASKS: readonly HappyAgentTaskBrowseEntry[] = [
    {
        id: "task-launch",
        joined: true,
        name: "Ship the launch checklist",
        owner: { imageUrl: PHOTO, name: "Steve Korshakov" },
    },
    {
        id: "task-billing",
        joined: false,
        name: "Fix invoice rounding",
        owner: { name: "Ada Park" },
    },
    {
        id: "task-docs",
        joined: false,
        name: "Rewrite the onboarding guide so it reads well end to end for new members",
        owner: { imageUrl: PHOTO, name: "Grace Lin" },
    },
    { id: "task-orphan", joined: false, name: "Triage nightly failures", owner: {} },
];

/** A standalone Happy Agent: every task is the reader's own, so no owner is shown. */
const STANDALONE_TASKS: readonly HappyAgentTaskBrowseEntry[] = TASKS.map(
    ({ owner: _owner, ...task }) => task,
);

export function HappyAgentTaskBrowseDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Every active task on one Happy Agent, each wearing its owner's face: join one, or open one already joined."
            title="HappyAgentTaskBrowseDialog"
        >
            <Specimen
                detail="480px · team · photo, initials, and generated faces · joined row offers Open"
                label="Default"
                number="01"
                stage="app"
            >
                {frame(<HappyAgentTaskBrowseDialog {...handlers} tasks={TASKS} />)}
            </Specimen>

            <Specimen detail="480px · one join in flight" label="Joining" number="02" stage="app">
                {frame(
                    <HappyAgentTaskBrowseDialog
                        {...handlers}
                        tasks={TASKS.map((task) =>
                            task.id === "task-billing" ? { ...task, joining: true } : task,
                        )}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · the host refused the last join"
                label="Error"
                number="03"
                stage="app"
            >
                {frame(
                    <HappyAgentTaskBrowseDialog
                        {...handlers}
                        error="That task was archived before you joined it."
                        tasks={TASKS}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · Happy Agent offline · Join unavailable"
                label="Unavailable"
                number="04"
                stage="app"
            >
                {frame(
                    <HappyAgentTaskBrowseDialog
                        {...handlers}
                        joinDisabledReason="This Happy Agent is reconnecting. Try again when it is online."
                        tasks={TASKS}
                    />,
                )}
            </Specimen>

            <Specimen
                detail="480px · standalone Happy Agent · no owner face or name"
                label="Standalone"
                number="05"
                stage="app"
            >
                {frame(<HappyAgentTaskBrowseDialog {...handlers} tasks={STANDALONE_TASKS} />)}
            </Specimen>

            <Specimen detail="480px · no active tasks" label="Empty" number="06" stage="app">
                {frame(<HappyAgentTaskBrowseDialog {...handlers} tasks={[]} />)}
            </Specimen>
        </ComponentPage>
    );
}
