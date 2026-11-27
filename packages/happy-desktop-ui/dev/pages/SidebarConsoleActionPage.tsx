import { useState } from "react";
import { Button } from "../../src/Button";
import { Sidebar } from "../../src/Sidebar";
import { SidebarConsoleAction, type ConsoleWatchEntry } from "../../src/SidebarConsoleAction";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-356";
const noop = () => undefined;

const entries: readonly ConsoleWatchEntry[] = [
    {
        count: 1,
        id: 5,
        level: "error",
        source: "request",
        text: "PUT http://127.0.0.1:4317/v1/settings failed: 409 Conflict",
    },
    {
        count: 3,
        id: 4,
        level: "warning",
        source: "console",
        text: "A tool call has a presentation this build does not know: surface.vault.write",
    },
    {
        count: 1,
        id: 3,
        level: "error",
        source: "uncaught",
        text: "TypeError: Cannot read properties of undefined (reading 'session') at happyAgentConnection.ts:643:21",
    },
    {
        count: 1,
        id: 2,
        level: "error",
        source: "rejection",
        text: "Error: The debugger action failed.",
    },
    {
        count: 1,
        id: 1,
        level: "error",
        source: "resource",
        text: "<img> failed to load http://127.0.0.1:4317/v1/avatars/missing.png",
    },
];

function ConsoleSidebar(props: {
    defaultOpen?: boolean;
    entries: readonly ConsoleWatchEntry[];
    errorCount: number;
    onClear?: () => void;
    title: string;
    warningCount: number;
}) {
    return (
        <Sidebar
            title={props.title}
            activeItemId=""
            sections={[]}
            footer={
                <SidebarFooter
                    actions={
                        <SidebarConsoleAction
                            defaultOpen={props.defaultOpen}
                            entries={props.entries}
                            errorCount={props.errorCount}
                            onClear={props.onClear ?? noop}
                            warningCount={props.warningCount}
                        />
                    }
                    onSettingsOpen={noop}
                    theme={{ mode: "light", appearance: "light", onModeSelect: noop }}
                />
            }
            onItemSelect={noop}
            style={{ height: "100%", width: "100%" }}
        />
    );
}

function ClearFixture() {
    const [shown, setShown] = useState(true);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Button onClick={() => setShown(true)} size="small">
                Log again
            </Button>
            <div style={{ display: "flex", flexDirection: "column", width: 288, height: 440 }}>
                <ConsoleSidebar
                    defaultOpen
                    entries={shown ? entries : []}
                    errorCount={shown ? 4 : 0}
                    onClear={() => setShown(false)}
                    title="Clear"
                    warningCount={shown ? 3 : 0}
                />
            </div>
        </div>
    );
}

export function SidebarConsoleActionPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Sidebar console action"
            summary="A preview-build footer mark counting the errors and warnings that reached the console. Absent while the console is clean; opened, it lists the newest entries on the footer marks' card."
        >
            <Specimen
                label="Open"
                detail="Clear empties the list and removes the mark; Log again brings it back."
                number="01"
                stage="surface"
            >
                <ClearFixture />
            </Specimen>
            <Specimen
                label="Marks"
                detail="Errors, warnings only, and a clean console, which shows nothing."
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                    {[
                        { name: "errors", errorCount: 12, warningCount: 3 },
                        { name: "warnings", errorCount: 0, warningCount: 2 },
                        { name: "clean", errorCount: 0, warningCount: 0 },
                    ].map((fixture) => (
                        <div
                            key={fixture.name}
                            data-screen={`console-${fixture.name}`}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                width: 288,
                                height: 120,
                            }}
                        >
                            <ConsoleSidebar
                                entries={entries}
                                errorCount={fixture.errorCount}
                                title={fixture.name}
                                warningCount={fixture.warningCount}
                            />
                        </div>
                    ))}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
