import { useState } from "react";
import type { ComposerSnapshot } from "happy-desktop-state";
import { Sidebar } from "../../src/Sidebar";
import { SidebarFooter } from "../../src/SidebarFooter";
import {
    SidebarConnectionAction,
    type SidebarConnectionActionProps,
} from "../../src/SidebarConnectionAction";
import { SidebarUpdateAction } from "../../src/SidebarUpdateAction";
import { ThemeScope } from "../../src/ThemeScope";
import { Button } from "../../src/Button";
import { AppShell } from "../../src/AppShell";
import { ConversationDock } from "../../src/ConversationDock";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

export const componentNumber = "C-289";
const noop = () => undefined;
const composer: ComposerSnapshot = {
    scopeId: "connection-status",
    text: "Keep my draft while the agent reconnects.",
    attachments: [],
    revision: 0,
    submission: { status: "idle" },
    focused: false,
    capabilities: { shellMode: false, commands: [], mentions: false },
    mentionCandidates: [],
    agentUserIds: [],
};
const location = "Happy Agent on this Mac";
const states: readonly {
    name: string;
    outage?: SidebarConnectionActionProps["outage"];
    location?: string;
}[] = [
    {
        name: "reconnecting",
        outage: {
            status: "reconnecting",
            explanation: "Trying to reach your agent. Your work stays open.",
            action: { label: "Restart", onSelect: noop },
        },
    },
    {
        name: "draining",
        outage: {
            status: "draining",
            explanation: "Waiting for running work to finish. Restart now interrupts it.",
            action: { label: "Restart now", onSelect: noop },
        },
    },
    {
        name: "restarting",
        outage: {
            status: "restarting",
            explanation: "The agent is restarting. Your work stays open.",
        },
    },
    {
        name: "failed",
        outage: {
            status: "failed",
            explanation: "Happy Agent exited with code 1.",
            action: { label: "Restart", onSelect: noop },
        },
    },
    {
        name: "failed-long",
        outage: {
            status: "failed",
            explanation:
                "Command failed: happy-agent start --daemon. Error: listen EADDRINUSE: address already in use /Users/kirill/.happy/agent.sock. Another process is still listening on this socket.",
            action: { label: "Restart", onSelect: noop },
        },
    },
    { name: "connected" },
    {
        name: "remote",
        location: "Happy Agent on Build server in the development office",
        outage: {
            status: "reconnecting",
            explanation: "Trying to reach this agent. Your work stays open.",
        },
    },
];

function StatusFooter(props: {
    state: (typeof states)[number];
    open: boolean;
    update?: boolean;
    updateOpen?: boolean;
}) {
    return (
        <SidebarFooter
            actions={
                <>
                    <SidebarConnectionAction
                        location={props.state.location ?? location}
                        outage={props.state.outage}
                        defaultOpen={props.open}
                    />
                    {props.update ? (
                        <SidebarUpdateAction
                            action="refresh"
                            defaultOpen={props.updateOpen}
                            onAction={noop}
                            status="downloaded"
                            subject="application"
                            version="2026.11.1-preview.1"
                        />
                    ) : null}
                </>
            }
            onSettingsOpen={noop}
            theme={{ mode: "light", appearance: "light", onModeSelect: noop }}
        />
    );
}

function RecoveryFixture() {
    const [outage, setOutage] = useState(states[0].outage);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Button onClick={() => setOutage(states[0].outage)} size="small">
                Reset outage
            </Button>
            <div
                style={{
                    display: "flex",
                    alignItems: "end",
                    width: 264,
                    height: 180,
                    position: "relative",
                }}
            >
                <SidebarFooter
                    actions={
                        <SidebarConnectionAction
                            location={location}
                            outage={
                                outage
                                    ? {
                                          ...outage,
                                          action: {
                                              label: "Recover",
                                              onSelect: () => setOutage(undefined),
                                          },
                                      }
                                    : undefined
                            }
                        />
                    }
                    onSettingsOpen={noop}
                />
            </div>
        </div>
    );
}

export function ConnectionStatusPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Connection status"
            summary="Temporary footer marks at the left, permanent controls at the right. Each connection card stays 236 × 126, including recovery. Long verbatim failures scroll inside three lines. Restart is manual; Restart now uses the existing kill while draining. The interactive specimen's Recover action simulates the connection returning."
        >
            <Specimen
                label="Recovery without dismissal"
                detail="Open the connection mark, then choose Recover. The same open card shows Connected until you dismiss it. Reset outage starts again."
                number="01"
                stage="surface"
            >
                <RecoveryFixture />
            </Specimen>
            <Specimen
                label="Every state"
                detail="The same 236 × 126 frame for every state; the final tiles show the closed footer and both temporary marks."
                number="02"
                stage="surface"
            >
                <ThemeScope mode="light">
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                        {[
                            ...states.map((state) => ({ state, open: true })),
                            { state: states[0], open: false },
                            { state: states[0], open: true, update: true },
                            { state: states[0], open: false, update: true, updateOpen: true },
                        ].map((fixture, index) => (
                            <div
                                key={index}
                                data-screen={`state-${index}-${fixture.state.name}`}
                                data-connection-fixture={`${index}-${fixture.state.name}`}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    width: 288,
                                    height: 212,
                                }}
                            >
                                <Sidebar
                                    title={fixture.state.name}
                                    activeItemId=""
                                    sections={[]}
                                    footer={<StatusFooter {...fixture} />}
                                    onItemSelect={noop}
                                    style={{ height: "100%", width: "100%" }}
                                />
                            </div>
                        ))}
                    </div>
                </ThemeScope>
            </Specimen>
            {(
                [
                    { width: 1100, height: 760 },
                    { width: 720, height: 640 },
                ] as const
            ).map((size) => (
                <FullScreenSpecimen
                    key={size.width}
                    label={`Connection states · ${size.width} × ${size.height}`}
                    number={String(size.width)}
                    detail="The sidebar keeps its card while the offline draft remains editable."
                    screen={`all-states-${size.width}x${size.height}`}
                    window={size}
                >
                    <AppShell
                        sidebarDefaultWidth={288}
                        sidebar={
                            <Sidebar
                                title="This Mac"
                                activeItemId=""
                                sections={[]}
                                footer={<StatusFooter state={states[0]} open update />}
                                onItemSelect={noop}
                            />
                        }
                    >
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "flex-end",
                                height: "100%",
                                padding: 16,
                            }}
                        >
                            <ConversationDock
                                composer={composer}
                                onComposerSend={noop}
                                onComposerValueChange={noop}
                                notice={["Agent is offline. You can keep editing your draft."]}
                                submitDisabled
                            />
                        </div>
                    </AppShell>
                </FullScreenSpecimen>
            ))}
        </ComponentPage>
    );
}
