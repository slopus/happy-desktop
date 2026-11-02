import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    happyAgentSettingsStoreCreate,
    serverAddStoreCreate,
    type HappyAgentChiefOfStaffRequest,
} from "happy-desktop-state";
import { AppHappyAgentSettingsView } from "../../sources/views/AppHappyAgentSettingsView";
import type { AppHappyAgentDirectorySnapshot } from "../../sources/AppHappyAgentView";

// jsdom has no canvas; the offline model-catalog spinner is unrelated here.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

/*
 * Settings offers Servers only on a host that can sign in to one. The Chief of
 * Staff adds servers, so the form hands it the address the person typed, and
 * each listed server can be signed in to or handed back for removal.
 */

const directoryWantingSignIn: AppHappyAgentDirectorySnapshot = {
    happyAgents: [
        {
            id: "local",
            label: "Local",
            status: "disconnected",
            projects: [],
            bots: [],
            projectsStatus: "loading",
        },
        {
            id: "connection:team",
            remoteId: "team",
            label: "Example Engineering",
            status: "error",
            message: "Sign in to this server to use it.",
            serverUrl: "https://happy.example.com/",
            signIn: { phase: "required", reason: "first" },
            projects: [],
            bots: [],
            projectsStatus: "loading",
        },
    ],
};

function settingsRender(options: {
    readonly section: string;
    readonly directory?: AppHappyAgentDirectorySnapshot;
    readonly chiefOfStaffAsk?: (request: HappyAgentChiefOfStaffRequest) => Promise<void>;
    readonly signIn?: (id: string) => void;
    readonly signInCancel?: (id: string) => void;
}) {
    const directory = options.directory ?? directoryWantingSignIn;
    const appearance = appearanceStoreCreate();
    const add = options.chiefOfStaffAsk
        ? serverAddStoreCreate({ chiefOfStaffAsk: options.chiefOfStaffAsk })
        : undefined;
    const servers = add
        ? {
              add,
              directory: { get: () => directory, subscribe: () => () => {} },
              signIn: options.signIn ?? (() => undefined),
              signInCancel: options.signInCancel ?? (() => undefined),
          }
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

it("offers Servers only where a host can sign in, and hands the typed address to the Chief of Staff", () => {
    const without = settingsRender({ section: "general" });
    expect(categoryLabels(without.view.container).some((label) => label.includes("Servers"))).toBe(
        false,
    );
    without.dispose();

    const asked: HappyAgentChiefOfStaffRequest[] = [];
    const signedIn: string[] = [];
    const { view, dispose } = settingsRender({
        section: "servers",
        chiefOfStaffAsk(request) {
            asked.push(request);
            return new Promise(() => undefined);
        },
        signIn: (id) => signedIn.push(id),
    });
    expect(categoryLabels(view.container).some((label) => label.includes("Servers"))).toBe(true);
    // The team server the host lists wants its first sign-in.
    fireEvent.click(view.getByRole("button", { name: "Sign in" }));
    expect(signedIn).toEqual(["connection:team"]);
    fireEvent.click(view.getByRole("button", { name: "Remove Example Engineering" }));
    expect(asked).toEqual([
        {
            kind: "serverRemove",
            connectionId: "team",
            name: "Example Engineering",
            url: "https://happy.example.com/",
        },
    ]);
    dispose();

    const adding = settingsRender({
        section: "servers",
        chiefOfStaffAsk(request) {
            asked.push(request);
            return new Promise(() => undefined);
        },
    });
    const field = adding.view.getByRole("textbox", { name: "Server address" }) as HTMLInputElement;
    expect(field.disabled).toBe(false);
    fireEvent.input(field, { target: { value: "happy.example.com/" } });
    fireEvent.click(adding.view.getByRole("button", { name: "Ask Chief of Staff" }));
    expect(asked.at(-1)).toEqual({ kind: "serverAdd", url: "https://happy.example.com" });
    expect(field.disabled).toBe(true);
    adding.dispose();
});

it("stops a sign-in whose browser is open", () => {
    const team = directoryWantingSignIn.happyAgents[1]!;
    const cancelled: string[] = [];
    const { view, dispose } = settingsRender({
        section: "servers",
        directory: {
            happyAgents: [
                directoryWantingSignIn.happyAgents[0]!,
                { ...team, signIn: { phase: "browser", host: "sso.example.com" } },
            ],
        },
        chiefOfStaffAsk: () => new Promise(() => undefined),
        signInCancel: (id) => cancelled.push(id),
    });
    expect(view.getByText("Finish signing in at sso.example.com in your browser.")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Sign in" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Cancel signing in to Example Engineering" }));
    expect(cancelled).toEqual(["connection:team"]);
    dispose();
});
