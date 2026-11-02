import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    happyAgentSettingsStoreCreate,
    serverAddStoreCreate,
    type ServerSource,
} from "happy-desktop-state";
import { AppHappyAgentSettingsView } from "../../sources/views/AppHappyAgentSettingsView";
import type { AppHappyAgentDirectorySnapshot } from "../../sources/AppHappyAgentView";

// jsdom has no canvas; the offline model-catalog spinner is unrelated here.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/*
 * Settings offers Servers only on a host that can add one, and the form adds
 * the address the person typed, whatever the local connection is doing.
 */

const directory: AppHappyAgentDirectorySnapshot = {
    happyAgents: [
        {
            id: "local",
            label: "Local",
            status: "disconnected",
            projects: [],
            bots: [],
            projectsStatus: "loading",
        },
    ],
};

function settingsRender(options: { readonly section: string; readonly source?: ServerSource }) {
    const appearance = appearanceStoreCreate();
    const add = options.source ? serverAddStoreCreate({ source: options.source }) : undefined;
    const servers = add
        ? { add, directory: { get: () => directory, subscribe: () => () => {} } }
        : undefined;
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
            section={options.section}
            settings={happyAgentSettingsStoreCreate()}
            {...(servers ? { servers } : {})}
        />,
    );
    return {
        view,
        dispose() {
            view.unmount();
            add?.[Symbol.dispose]();
            appearance[Symbol.dispose]();
        },
    };
}

function categoryLabels(container: HTMLElement): string[] {
    return [...container.querySelectorAll("nav button, nav a")].map(
        (item) => item.textContent ?? "",
    );
}

it("offers Servers only where a host can add one, and adds the typed address", () => {
    const without = settingsRender({ section: "general" });
    expect(categoryLabels(without.view.container).some((label) => label.includes("Servers"))).toBe(
        false,
    );
    without.dispose();

    const added: string[] = [];
    const source: ServerSource = {
        serverAdd(url) {
            added.push(url);
            return new Promise(() => undefined);
        },
        serverSignIn: () => Promise.resolve(),
    };
    const { view, dispose } = settingsRender({ section: "servers", source });
    expect(categoryLabels(view.container).some((label) => label.includes("Servers"))).toBe(true);
    const field = view.getByRole("textbox", { name: "Server address" }) as HTMLInputElement;
    expect(field.disabled).toBe(false);
    fireEvent.input(field, { target: { value: "happy.example.com/" } });
    fireEvent.click(view.getByRole("button", { name: "Add server" }));
    expect(added).toEqual(["https://happy.example.com"]);
    expect(view.getByText("Contacting the server…")).toBeTruthy();
    dispose();
});
