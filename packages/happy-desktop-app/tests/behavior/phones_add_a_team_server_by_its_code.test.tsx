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

vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/*
 * A phone adds a team server only by scanning the code this computer shows for
 * it in Settings › Servers. The code names the server's instance and HTTPS
 * address and holds no credential; a server without both offers no code.
 * Settings opens inside one connection, whose own directory names only itself,
 * so the servers are listed from the window's whole directory.
 */

const TEAM = "k3x9q2m7p0a4b8c1d5e6f7g2";
const entry = (patch: Partial<AppHappyAgentDirectorySnapshot["happyAgents"][number]>) => ({
    id: "local",
    label: "Local",
    status: "connected" as const,
    projects: [],
    bots: [],
    projectsStatus: "ready" as const,
    ...patch,
});
const directory: AppHappyAgentDirectorySnapshot = {
    happyAgents: [
        entry({}),
        entry({
            id: "connection:team",
            label: "Example Engineering",
            serverUrl: "https://happy.example.com/",
            instanceId: TEAM,
        }),
        entry({
            id: "connection:local-test",
            label: "Local test server",
            serverUrl: "http://localhost:8080/",
            instanceId: "m1n2b3v4c5x6z7l8k9j0h1g2",
        }),
        // Reached through Happy Cloud, not added by address: not listed here.
        entry({ id: "connection:cloud", label: "Cloud team", instanceId: TEAM }),
    ],
};

it("shows each server's phone code, only where a phone can use it", () => {
    const source: ServerSource = {
        serverAdd: () => new Promise(() => undefined),
        serverSignIn: () => Promise.resolve(),
    };
    const add = serverAddStoreCreate({ source });
    const servers = {
        add,
        directory: { get: () => directory, subscribe: () => () => {} },
    };
    const own: AppHappyAgentDirectorySnapshot = {
        activeHappyAgentId: "local",
        happyAgents: [directory.happyAgents[0]!],
    };
    const appearance = appearanceStoreCreate();
    const view = render(
        <AppHappyAgentSettingsView
            appearance={appearance}
            happyAgents={{
                get: () => own,
                subscribe: () => () => {},
                happyAgentActivate: () => {},
            }}
            onCategorySelect={() => {}}
            onClose={() => {}}
            section="servers"
            servers={servers}
            settings={happyAgentSettingsStoreCreate()}
        />,
    );
    expect(view.getByText("Example Engineering")).toBeTruthy();
    expect(view.getByText("Local test server")).toBeTruthy();
    expect(view.queryByText("Cloud team")).toBeNull();
    // Only the HTTPS server with a known instance has a code.
    const connect = view.getAllByRole("button", { name: "Connect a phone" });
    expect(connect).toHaveLength(1);
    fireEvent.click(connect[0]!);
    const dialog = view.getByTestId("happy-agent-server-phone");
    expect(dialog.textContent).toContain("Add Example Engineering on a phone");
    expect(view.getByLabelText("QR code to add Example Engineering on a phone")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Done" }));
    expect(view.queryByTestId("happy-agent-server-phone")).toBeNull();
    view.unmount();
    add[Symbol.dispose]();
    appearance[Symbol.dispose]();
});
