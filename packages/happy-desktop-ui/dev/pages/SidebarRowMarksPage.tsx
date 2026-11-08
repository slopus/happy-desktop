import type { HappyAgentSurfaceType } from "happy-desktop-state";
import { Sidebar, type SidebarItem, type SidebarSection } from "../../src/Sidebar";
import { ThemeScope } from "../../src/ThemeScope";
import { surfaceSidebarMark } from "../../src/pages/surfaces/surfacePresentation";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-030";

const noop = () => undefined;

/** A Surface's row as the app lists it, by type alone. */
function surface(id: string, label: string, type: HappyAgentSurfaceType): SidebarItem {
    return { id, kind: "project", label, ...surfaceSidebarMark(type) };
}

/**
 * Every fixed and typed row the app's sidebar draws, in the app's order:
 * Artifacts and Feed head the first group, the reader's Surfaces follow, one
 * of each type, then Bots, Tasks, and Projects with the home project.
 */
const SECTIONS: readonly SidebarSection[] = [
    {
        id: "top",
        items: [
            { icon: "doc", id: "artifacts", kind: "project", label: "Artifacts", tint: "purple" },
            { icon: "feed", id: "feed", kind: "project", label: "Activity", tint: "red" },
            surface("todo", "Groceries", { kind: "todo" }),
            surface("document", "Launch notes", { kind: "document" }),
            surface("calendar", "Family calendar", { kind: "calendar" }),
            surface("monitor", "Build machine", { kind: "system_monitor" }),
            surface("chat", "Weekend plans", { kind: "chat" }),
            surface("artifact", "Launch spec", { kind: "artifact" }),
            surface("task", "Rewrite onboarding guide", { kind: "task" }),
            surface("unsupported", "Retro board", { kind: "unsupported", type: "board" }),
        ],
    },
    {
        id: "bots",
        label: "Bots",
        items: [
            {
                id: "chief",
                kind: "agent",
                label: "Olga’s Chief of Staff",
                placeholderSeed: "chief",
                private: true,
            },
            { id: "notes", kind: "agent", label: "Release notes", placeholderSeed: "notes" },
        ],
    },
    {
        id: "tasks",
        label: "Tasks",
        items: [
            {
                id: "task-docs",
                kind: "project",
                label: "Rewrite onboarding guide",
                placeholderSeed: "task-docs",
            },
        ],
    },
    {
        id: "projects",
        label: "Projects",
        items: [
            {
                icon: "home",
                id: "home",
                kind: "project",
                label: "Home",
                initials: "H",
                tint: "blue",
            },
            {
                id: "desktop",
                kind: "project",
                label: "happy-desktop",
                placeholderSeed: "desktop",
            },
            { depth: 1, id: "desktop-sidebar", kind: "workspace", label: "sidebar-icons" },
        ],
    },
];

const WINDOW = { width: 300, height: 760 };

/**
 * The sidebar's row marks, in both appearances, so a change to what any row
 * wears is reviewed against every other row at once.
 */
export function SidebarRowMarksPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Every fixed and typed sidebar row the app draws, light and dark. Each viewport is named for `pnpm blueprint:screens`."
            title="Sidebar row marks"
        >
            {(["light", "dark"] as const).map((appearance, index) => (
                <FullScreenSpecimen
                    key={appearance}
                    detail={`${String(WINDOW.width)} × ${String(WINDOW.height)} · ${appearance}`}
                    label={`Sidebar, ${appearance}`}
                    number={String(index + 1).padStart(2, "0")}
                    screen={`${appearance}-${String(WINDOW.width)}x${String(WINDOW.height)}`}
                    window={WINDOW}
                >
                    <ThemeScope mode={appearance}>
                        <div
                            style={{
                                background: "var(--groupped-background)",
                                display: "flex",
                                height: "100%",
                                width: "100%",
                            }}
                        >
                            <Sidebar
                                activeItemId="todo"
                                onItemSelect={noop}
                                sections={[...SECTIONS]}
                            />
                        </div>
                    </ThemeScope>
                </FullScreenSpecimen>
            ))}
        </ComponentPage>
    );
}
