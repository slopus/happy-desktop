import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    happyAgentSettingsStoreCreate,
    managedSettingsStoreCreate,
    serverAddStoreCreate,
    usageAnalyticsStoreCreate,
    type ManagedSettings,
    type ServerSource,
} from "happy-desktop-state";
import { AppHappyAgentSettingsView } from "../../sources/views/AppHappyAgentSettingsView";
import type { AppHappyAgentDirectorySnapshot } from "../../sources/AppHappyAgentView";

// jsdom has no canvas; the offline model-catalog spinner is unrelated here.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/*
 * An organization's managed settings lock what they name: analytics can be
 * turned off and locked, never forced on, Mobile access goes
 * when no way of pairing a phone is left, and the server form adds only the
 * organization's server. Servers is offered only by a host that can add one.
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

function settingsRender(options: {
    readonly section: string;
    readonly managed?: ManagedSettings;
    readonly source?: ServerSource;
}) {
    const managed = managedSettingsStoreCreate();
    if (options.managed) managed.writer.managedSettingsAdopt(options.managed);
    const appearance = appearanceStoreCreate();
    const usageAnalytics = usageAnalyticsStoreCreate();
    const servers = options.source
        ? serverAddStoreCreate({ source: options.source, managed: managed.store })
        : undefined;
    const view = render(
        <AppHappyAgentSettingsView
            appearance={appearance}
            happyAgents={{
                get: () => directory,
                subscribe: () => () => {},
                happyAgentActivate: () => {},
            }}
            managedSettings={managed.store}
            onCategorySelect={() => {}}
            onClose={() => {}}
            section={options.section}
            settings={happyAgentSettingsStoreCreate()}
            usageAnalytics={usageAnalytics}
            {...(servers ? { servers } : {})}
        />,
    );
    return {
        view,
        usageAnalytics,
        dispose() {
            view.unmount();
            servers?.[Symbol.dispose]();
            appearance[Symbol.dispose]();
        },
    };
}

function categoryLabels(container: HTMLElement): string[] {
    return [...container.querySelectorAll("nav button, nav a")].map(
        (item) => item.textContent ?? "",
    );
}

it("locks analytics off when the organization turns it off, keeping the person's own choice", () => {
    const { view, usageAnalytics, dispose } = settingsRender({
        section: "general",
        managed: { analyticsEnabled: false },
    });
    const control = view.getByRole("switch", { name: "Share product analytics" });
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect((control as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByText(/Your organization turned product analytics off/u)).toBeTruthy();
    fireEvent.click(control);
    expect(usageAnalytics.get().usageAnalyticsEnabled).toBe(true);
    dispose();
});

it("never turns analytics on: a policy of true leaves the person's switch working", () => {
    const { view, usageAnalytics, dispose } = settingsRender({
        section: "general",
        managed: { analyticsEnabled: true },
    });
    const control = view.getByRole("switch", { name: "Share product analytics" });
    expect((control as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(control);
    expect(usageAnalytics.get().usageAnalyticsEnabled).toBe(false);
    dispose();
});

it("leaves Mobile access out once the organization turns every way of pairing off", () => {
    const open = settingsRender({ section: "general" });
    expect(
        categoryLabels(open.view.container).some((label) => label.includes("Mobile access")),
    ).toBe(true);
    open.dispose();
    const closed = settingsRender({
        section: "general",
        managed: { hostedRelayEnabled: false, tailcatEnabled: false },
    });
    expect(
        categoryLabels(closed.view.container).some((label) => label.includes("Mobile access")),
    ).toBe(false);
    closed.dispose();
});

it("offers Servers only where a host can add one, and adds only the organization's server", () => {
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
    const { view, dispose } = settingsRender({
        section: "servers",
        managed: { serverUrl: "https://happy.corp.example", allowAdditionalServers: false },
        source,
    });
    const field = view.getByRole("textbox", { name: "Server address" }) as HTMLInputElement;
    expect(field.value).toBe("https://happy.corp.example");
    expect(field.disabled).toBe(true);
    expect(view.getByText("Your organization set this server.")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Add server" }));
    expect(added).toEqual(["https://happy.corp.example"]);
    expect(view.getByText("Contacting the server…")).toBeTruthy();
    dispose();
});
