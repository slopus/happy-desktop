import { useState } from "react";
import { Button } from "../../src/Button";
import { Sidebar } from "../../src/Sidebar";
import { SidebarErrorNotice } from "../../src/SidebarErrorNotice";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ThemeScope } from "../../src/ThemeScope";
import { AppShell } from "../../src/AppShell";
import type { SidebarSection } from "../../src/Sidebar";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

export const componentNumber = "C-350";
const noop = () => undefined;
const messages: readonly { name: string; message: string }[] = [
    {
        name: "leave",
        message:
            "Could not leave “UTM Windows Login Help”. Happy Agent is draining and no longer accepts mutations.",
    },
    { name: "short", message: "Could not move “Release notes”. Not allowed." },
    {
        name: "long",
        message:
            "Could not archive “Quarterly planning”. Only the task's owner or an administrator of this server may archive it. Ask them to archive it, or leave the task to take it out of your own list. The task stays listed for everyone else until then.",
    },
];

const tasks: SidebarSection[] = [
    {
        id: "tasks",
        label: "Tasks",
        items: [
            { id: "utm", kind: "agent", label: "UTM Windows Login Help", initials: "KS" },
            { id: "release", kind: "agent", label: "Release notes", initials: "KS" },
            { id: "planning", kind: "agent", label: "Quarterly planning", initials: "SK" },
        ],
    },
];

function NoticeSidebar(props: {
    message?: string;
    onDismiss?: () => void;
    sections?: SidebarSection[];
    title: string;
}) {
    return (
        <Sidebar
            title={props.title}
            activeItemId=""
            sections={props.sections ?? []}
            footer={
                <SidebarFooter
                    actions={
                        <SidebarErrorNotice
                            message={props.message}
                            onDismiss={props.onDismiss ?? noop}
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

function DismissFixture() {
    const [message, setMessage] = useState<string | undefined>(messages[0].message);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Button onClick={() => setMessage(messages[0].message)} size="small">
                Refuse again
            </Button>
            <div style={{ display: "flex", flexDirection: "column", width: 288, height: 240 }}>
                <NoticeSidebar
                    message={message}
                    onDismiss={() => setMessage(undefined)}
                    title="Dismiss"
                />
            </div>
        </div>
    );
}

export function SidebarErrorNoticePage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Sidebar error notice"
            summary="A refused sidebar act — leaving, moving, archiving or renaming a row — is said once in a card on the footer row, as wide as the row, with a warning glyph and a dismiss control. Long reasons scroll inside four lines."
        >
            <Specimen
                label="Dismiss"
                detail="Dismiss puts the notice away; Refuse again brings it back."
                number="01"
                stage="surface"
            >
                <DismissFixture />
            </Specimen>
            <Specimen
                label="Messages"
                detail="A short, a typical and a long refusal."
                number="02"
                stage="surface"
            >
                <ThemeScope mode="light">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                        {messages.map((fixture) => (
                            <div
                                key={fixture.name}
                                data-screen={`notice-${fixture.name}`}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    width: 288,
                                    height: 240,
                                }}
                            >
                                <NoticeSidebar message={fixture.message} title={fixture.name} />
                            </div>
                        ))}
                    </div>
                </ThemeScope>
            </Specimen>
            <FullScreenSpecimen
                label="In the window · 1100 × 760"
                number="03"
                detail="The notice stands on the footer row over the sidebar's last rows; the list itself does not move."
                screen="window-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <AppShell
                    sidebarDefaultWidth={288}
                    sidebar={
                        <NoticeSidebar
                            message={messages[0].message}
                            sections={tasks}
                            title="This Mac"
                        />
                    }
                >
                    <div />
                </AppShell>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
