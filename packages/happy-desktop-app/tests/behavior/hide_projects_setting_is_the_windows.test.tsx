import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    happyAgentSettingsStoreCreate,
    projectsVisibilityStoreCreate,
    type ProjectsVisibilityDocument,
} from "happy-desktop-state";
import { AppHappyAgentSettingsView } from "../../sources/views/AppHappyAgentSettingsView";
import type { AppHappyAgentDirectorySnapshot } from "../../sources/AppHappyAgentView";

// jsdom has no canvas; the offline model-catalog spinner is unrelated here.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/* Hiding the Projects section is a General setting kept by the window — the
 * same place the experiments switch is kept — so it is offered and saved with
 * no machine connected at all, and never touches a machine's settings. */

it("saves Hide projects in the window's own record without asking any Happy Agent", () => {
    let stored: ProjectsVisibilityDocument | undefined;
    const persistence = {
        read: () => stored,
        write: (next: ProjectsVisibilityDocument) => {
            stored = next;
        },
    };
    const projectsVisibility = projectsVisibilityStoreCreate(persistence);
    const directory: AppHappyAgentDirectorySnapshot = { happyAgents: [] };
    const appearance = appearanceStoreCreate();
    const settings = happyAgentSettingsStoreCreate();
    const defaults = settings.get();
    const view = render(
        <AppHappyAgentSettingsView
            appearance={appearance}
            happyAgents={{
                get: () => directory,
                subscribe: () => () => {},
                happyAgentActivate: () => {},
            }}
            onCategorySelect={() => {}}
            onClose={() => {}}
            projectsVisibility={projectsVisibility}
            section="general"
            settings={settings}
        />,
    );
    const control = view.getByRole("switch", { name: "Hide projects" });
    expect(control.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(control);
    expect(projectsVisibility.get().projectsHidden).toBe(true);
    expect(view.getByRole("switch", { name: "Hide projects" }).getAttribute("aria-checked")).toBe(
        "true",
    );
    // A window opened later reads the same choice back.
    expect(projectsVisibilityStoreCreate(persistence).get().projectsHidden).toBe(true);
    // No machine's settings were touched.
    expect(settings.get()).toBe(defaults);

    fireEvent.click(view.getByRole("switch", { name: "Hide projects" }));
    expect(stored).toEqual({ projectsHidden: false });
    view.unmount();
    appearance[Symbol.dispose]();
});
