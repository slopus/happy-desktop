import { useState } from "react";
import {
    HappyAgentTaskSettings,
    type HappyAgentTaskSettingsProps,
} from "../../src/pages/settings/HappyAgentTaskSettings";
import { HappyAgentConnectionSettingsSection } from "../../src/pages/settings/HappyAgentConnectionSettingsSection";
import { HappyAgentSettingsShell } from "../../src/pages/settings/HappyAgentSettingsShell";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

export const componentNumber = "C-306";
const noop = () => undefined;
const cases: readonly (HappyAgentTaskSettingsProps & { readonly label: string })[] = [
    { label: "Reading", connectionLabel: "Design team", status: "loading", onAutoJoinChange: noop },
    {
        label: "Default on",
        connectionLabel: "Design team",
        status: "ready",
        autoJoinEnabled: true,
        onAutoJoinChange: noop,
    },
    {
        label: "Opted out",
        connectionLabel: "Design team",
        status: "ready",
        autoJoinEnabled: false,
        onAutoJoinChange: noop,
    },
    {
        label: "Saving",
        connectionLabel: "Design team",
        status: "ready",
        autoJoinEnabled: false,
        saving: true,
        onAutoJoinChange: noop,
    },
    {
        label: "Save refused",
        connectionLabel: "Design team",
        status: "ready",
        autoJoinEnabled: true,
        saveError: "Your preference could not be saved. Try changing it again.",
        onAutoJoinChange: noop,
    },
    {
        label: "Offline",
        connectionLabel: "Design team",
        status: "ready",
        autoJoinEnabled: true,
        unavailable: "This connection is reconnecting. Your last preference is shown.",
        onAutoJoinChange: noop,
    },
    {
        label: "Read failed",
        connectionLabel: "Design team",
        status: "loading",
        error: "Your preference could not be read. Retrying automatically.",
        onAutoJoinChange: noop,
    },
    {
        label: "User settings unavailable",
        connectionLabel: "Design team",
        status: "unsupported",
        onAutoJoinChange: noop,
    },
];

function InteractiveTaskSettings() {
    const [enabled, setEnabled] = useState(true);
    return (
        <HappyAgentTaskSettings
            autoJoinEnabled={enabled}
            connectionLabel="Design team"
            onAutoJoinChange={setEnabled}
            status="ready"
        />
    );
}

export function HappyAgentTaskSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Task settings"
            summary="A per-user task autojoin preference on each connection, on by default."
        >
            {[1100, 720].map((width) => (
                <FullScreenSpecimen
                    key={width}
                    detail="Each connection keeps the person's preference"
                    label={`Tasks settings ${width} × 760`}
                    number={String(width)}
                    screen={`tasks-${width}x760`}
                    window={{ width, height: 760 }}
                >
                    <HappyAgentSettingsShell
                        activeCategoryId="tasks"
                        categories={[
                            { icon: "settings", id: "general", label: "General", tone: "gray" },
                            { icon: "check-circle", id: "tasks", label: "Tasks", tone: "teal" },
                            { icon: "users", id: "account", label: "Account", tone: "blue" },
                        ]}
                        description="Which tasks you automatically join on each connection"
                        onCategorySelect={noop}
                        onClose={noop}
                        title="Tasks"
                    >
                        <InteractiveTaskSettings />
                        <HappyAgentTaskSettings
                            autoJoinEnabled={false}
                            connectionLabel="Engineering team"
                            onAutoJoinChange={noop}
                            status="ready"
                        />
                    </HappyAgentSettingsShell>
                </FullScreenSpecimen>
            ))}
            {cases.map(({ label, ...props }, index) => (
                <Specimen
                    key={label}
                    detail="Standard task preference row"
                    label={label}
                    number={String(index + 1).padStart(2, "0")}
                    stage="surface"
                >
                    <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
                        <HappyAgentConnectionSettingsSection
                            connectionLabel={props.connectionLabel}
                        >
                            <HappyAgentTaskSettings {...props} />
                        </HappyAgentConnectionSettingsSection>
                    </div>
                </Specimen>
            ))}
        </ComponentPage>
    );
}
