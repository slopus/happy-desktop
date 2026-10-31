import type { CSSProperties, ReactNode } from "react";
import { AppShell } from "../../src/AppShell";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { Sidebar, type SidebarSection } from "../../src/Sidebar";
import {
    HappyAgentSettingsShell,
    type HappyAgentSettingsCategory,
} from "../../src/pages/settings/HappyAgentSettingsShell";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "P-018";

const noop = () => undefined;

const connections: readonly ConnectionShellItem[] = [
    { id: "local", label: "This Mac", local: true, status: "connected" },
    { id: "work", label: "Work", local: false, status: "connected" },
    { id: "lab", label: "Lab", local: false, status: "connected" },
];

const sections: SidebarSection[] = [
    {
        action: { icon: "plus", label: "Create bot" },
        id: "bots",
        label: "Bots",
        items: ["Chief of Staff", "Growth", "Release notes", "Support triage"].map((label) => ({
            icon: "chat" as const,
            id: label,
            kind: "agent" as const,
            label,
        })),
    },
    {
        action: { icon: "plus", label: "Add project" },
        id: "projects",
        label: "Projects",
        items: [
            "Happy Desktop",
            "Website",
            "Docs",
            "Mobile",
            "Server",
            "Design system",
            "Analytics",
            "Infra",
            "Marketing",
            "Billing",
            "Support",
            "Research",
            "Hiring",
            "Legal",
        ].map((label) => ({
            id: label,
            initials: label.slice(0, 1),
            kind: "project" as const,
            label,
        })),
    },
];

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General" },
    { icon: "users", id: "account", label: "Account" },
    { icon: "lock", id: "secrets", label: "Secrets" },
    { icon: "mobile", id: "mobile-access", label: "Mobile access" },
];

/** Fixture-only stand-in for the native macOS traffic lights: 14px at x 14…68, y 13. */
function TrafficLights() {
    const dot = (background: string): CSSProperties => ({
        background,
        borderRadius: "50%",
        height: "14px",
        width: "14px",
    });
    return (
        <span
            aria-hidden="true"
            style={{
                display: "flex",
                gap: "6px",
                left: "14px",
                pointerEvents: "none",
                position: "absolute",
                top: "13px",
                zIndex: 10,
            }}
        >
            <i style={dot("#ff5f57")} />
            <i style={dot("#febc2e")} />
            <i style={dot("#28c840")} />
        </span>
    );
}

/**
 * The window's top-left corner at 100% scale: a 720 × 640 window clipped to
 * `crop`, with the traffic lights drawn when the window is not full screen.
 */
function Corner(props: {
    readonly children: ReactNode;
    readonly crop: { readonly width: number; readonly height: number };
    readonly fullScreen: boolean;
    readonly screen: string;
}) {
    return (
        <div
            data-screen={props.screen}
            style={{
                ...props.crop,
                border: "1px solid var(--divider)",
                overflow: "hidden",
                position: "relative",
            }}
        >
            <div style={{ display: "flex", height: 640, width: 720 }}>{props.children}</div>
            {props.fullScreen ? null : <TrafficLights />}
        </div>
    );
}

function Workspace(props: { readonly fullScreen: boolean; readonly rail: boolean }) {
    const shell = (
        <AppShell
            connectionRail={props.rail}
            sidebar={
                <Sidebar
                    activeItemId="Growth"
                    brand={props.fullScreen && !props.rail}
                    onCompose={noop}
                    onItemSelect={noop}
                    onSectionAction={noop}
                    sections={sections}
                />
            }
            sidebarCollapsible
            windowControls
            windowFullScreen={props.fullScreen}
        >
            <p style={{ padding: 16 }}>The workspace.</p>
        </AppShell>
    );
    if (!props.rail) return shell;
    return (
        <ConnectionShell items={connections} onSelect={noop} selectedId="local" windowControls>
            <ConnectionSurface active>{shell}</ConnectionSurface>
        </ConnectionShell>
    );
}

function Settings(props: { readonly rail: boolean; readonly width: number }) {
    const shell = (
        <HappyAgentSettingsShell
            activeCategoryId="mobile-access"
            categories={categories}
            connectionRail={props.rail}
            description="This Happy Agent's connection to Happy Mobile"
            onCategorySelect={noop}
            onClose={noop}
            sidebarWidth={props.width}
            title="Mobile access"
            windowControls
        >
            <p>Settings body.</p>
        </HappyAgentSettingsShell>
    );
    if (!props.rail) return shell;
    return (
        <ConnectionShell items={connections} onSelect={noop} selectedId="local" windowControls>
            <ConnectionSurface active>{shell}</ConnectionSurface>
        </ConnectionShell>
    );
}

/** Scrolls the sidebar list under its header once mounted, as a reader would. */
function scrolledRef(element: HTMLDivElement | null) {
    const viewport = element?.querySelector(".happy-sidebar__body-viewport");
    if (viewport) viewport.scrollTop = 72;
}

export function WindowSafeAreaPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The macOS traffic lights' zone and the band every top-left header keeps clear of it, windowed and in full screen, with and without a connection rail."
            title="Window safe area"
        >
            <Specimen
                detail="The rail's first tile and the sidebar's first row, windowed and in full screen."
                label="Rail top"
                number="01"
                stage="surface"
            >
                <Corner
                    crop={{ width: 440, height: 220 }}
                    fullScreen={false}
                    screen="01-rail-windowed"
                >
                    <Workspace fullScreen={false} rail />
                </Corner>
                <Corner crop={{ width: 440, height: 220 }} fullScreen screen="02-rail-full-screen">
                    <Workspace fullScreen rail />
                </Corner>
            </Specimen>
            <Specimen
                detail="Without a rail the sidebar heading holds the lights' lane; full screen gives it to the product mark."
                label="Sidebar top"
                number="02"
                stage="surface"
            >
                <Corner
                    crop={{ width: 440, height: 220 }}
                    fullScreen={false}
                    screen="03-sidebar-windowed"
                >
                    <Workspace fullScreen={false} rail={false} />
                </Corner>
                <Corner
                    crop={{ width: 440, height: 220 }}
                    fullScreen
                    screen="04-sidebar-full-screen"
                >
                    <Workspace fullScreen rail={false} />
                </Corner>
            </Specimen>
            <Specimen
                detail="A 720px window: the column at its 220px minimum alone and beside a rail, then widened so the header has no room for its description."
                label="Settings at its narrowest"
                number="03"
                stage="surface"
            >
                <Corner
                    crop={{ width: 720, height: 160 }}
                    fullScreen={false}
                    screen="05-settings-narrow"
                >
                    <Settings rail={false} width={220} />
                </Corner>
                <Corner
                    crop={{ width: 720, height: 160 }}
                    fullScreen={false}
                    screen="06-settings-narrow-rail"
                >
                    <Settings rail width={220} />
                </Corner>
                <Corner
                    crop={{ width: 720, height: 160 }}
                    fullScreen={false}
                    screen="07-settings-narrow-header"
                >
                    <Settings rail width={360} />
                </Corner>
            </Specimen>
            <Specimen
                detail="No hairline under the header; once rows scroll beneath it, a 16px fade in the sidebar's tone."
                label="Sidebar scroll edge"
                number="04"
                stage="surface"
            >
                <Corner
                    crop={{ width: 440, height: 240 }}
                    fullScreen={false}
                    screen="08-fade-at-top"
                >
                    <Workspace fullScreen={false} rail={false} />
                </Corner>
                <div ref={scrolledRef}>
                    <Corner
                        crop={{ width: 440, height: 240 }}
                        fullScreen={false}
                        screen="09-fade-scrolled"
                    >
                        <Workspace fullScreen={false} rail={false} />
                    </Corner>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
