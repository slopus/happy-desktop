import { useState } from "react";
import {
    HappyAgentSurfaceSettings,
    type HappyAgentSurfaceSettingsProps,
} from "../../src/pages/settings/HappyAgentSurfaceSettings";
import { HappyAgentConnectionSettingsSection } from "../../src/pages/settings/HappyAgentConnectionSettingsSection";
import { HappyAgentSettingsShell } from "../../src/pages/settings/HappyAgentSettingsShell";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

export const componentNumber = "C-307";
const noop = () => undefined;
const cases: readonly (HappyAgentSurfaceSettingsProps & { readonly label: string })[] = [
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

function InteractiveSurfaceSettings() {
    const [enabled, setEnabled] = useState(true);
    return (
        <HappyAgentSurfaceSettings
            autoJoinEnabled={enabled}
            connectionLabel="Design team"
            onAutoJoinChange={setEnabled}
            status="ready"
        />
    );
}

export function HappyAgentSurfaceSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Surface settings"
            summary="A per-user Surface autojoin preference on each connection, on by default."
        >
            {[
                { width: 1100, height: 760 },
                { width: 720, height: 640 },
            ].map(({ width, height }) => (
                <FullScreenSpecimen
                    key={width}
                    detail="Each connection keeps the person's preference"
                    label={`Surfaces settings ${width} × ${height}`}
                    number={String(width)}
                    screen={`surfaces-${width}x${height}`}
                    window={{ width, height }}
                >
                    <HappyAgentSettingsShell
                        activeCategoryId="surfaces"
                        categories={[
                            { icon: "settings", id: "general", label: "General", tone: "gray" },
                            {
                                group: "Team",
                                icon: "check-circle",
                                id: "tasks",
                                label: "Tasks",
                                tone: "teal",
                            },
                            {
                                group: "Team",
                                icon: "files",
                                id: "surfaces",
                                label: "Shared",
                                tone: "purple",
                            },
                            { icon: "users", id: "account", label: "Account", tone: "blue" },
                        ]}
                        description="Which shared documents, todo lists and calendars you automatically join"
                        onCategorySelect={noop}
                        onClose={noop}
                        title="Shared"
                    >
                        <InteractiveSurfaceSettings />
                        <HappyAgentSurfaceSettings
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
                    detail="Standard Surface preference row"
                    label={label}
                    number={String(index + 1).padStart(2, "0")}
                    stage="surface"
                >
                    <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
                        <HappyAgentConnectionSettingsSection
                            connectionLabel={props.connectionLabel}
                        >
                            <HappyAgentSurfaceSettings {...props} />
                        </HappyAgentConnectionSettingsSection>
                    </div>
                </Specimen>
            ))}
        </ComponentPage>
    );
}
