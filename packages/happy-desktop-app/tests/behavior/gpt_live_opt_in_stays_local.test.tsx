import { act, fireEvent, render, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    experimentsStoreCreate,
    gptLiveStoreCreate,
    happyAgentSettingsStoreCreate,
    happyAgentVoiceSettingsStoreCreate,
    type GptLiveDocument,
} from "happy-desktop-state";
import { fakeHappyAgentDaemonCreate } from "happy-desktop-state/testing";
import {
    AppHappyAgentSettingsView,
    happyAgentSettingsCategoryExists,
} from "../../sources/views/AppHappyAgentSettingsView";
import type { AppHappyAgentDirectorySnapshot } from "../../sources/AppHappyAgentView";

// jsdom has no canvas. The unrelated offline model-catalog spinner is covered
// by its own browser tests; the real GPT-Live settings tree remains mounted.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

it("shows Voice settings while calls are off and moves the experiment with the one calls switch", async () => {
    let document: GptLiveDocument | undefined = { gptLiveEnabled: true };
    const persistence = {
        read: () => document,
        write: (next: GptLiveDocument) => {
            document = next;
        },
    };
    const experiments = experimentsStoreCreate();
    const gptLive = gptLiveStoreCreate(persistence, undefined, experiments);
    const daemon = fakeHappyAgentDaemonCreate();
    const config = daemon.configGet();
    daemon.configSet({
        ...config,
        voice: {
            controller: { providerId: null, modelId: null, effort: null, fastMode: false },
            effectiveController: {
                providerId: "test-provider",
                modelId: "test-model",
                effort: "low",
                serviceTier: null,
                speed: "ultrafast",
                speeds: ["regular", "ultrafast"],
                notice: null,
            },
            defaultSystemPrompt: "Built-in prompt.",
            systemPromptOverride: null,
            effectiveSystemPrompt: "Built-in prompt.",
        },
    });
    const voiceSettings = happyAgentVoiceSettingsStoreCreate({ client: daemon.client });
    const connected = { connection: "connected", daemon: "ready", attempt: 0 };
    const loading = { type: "loading" };
    const directory = {
        happyAgents: [
            {
                id: "local",
                name: "This Mac",
                status: "connected",
                session: {
                    connection: { get: () => connected, subscribe: () => () => {} },
                    models: { get: () => loading, subscribe: () => () => {} },
                    workspace: {},
                    voiceSettings,
                },
            },
        ],
    } as unknown as AppHappyAgentDirectorySnapshot;
    const appearance = appearanceStoreCreate();
    const settings = happyAgentSettingsStoreCreate();
    const defaults = settings.get();
    let section = "general";
    let view: ReturnType<typeof render>;
    const screen = () => (
        <AppHappyAgentSettingsView
            appearance={appearance}
            experiments={experiments}
            gptLive={gptLive}
            happyAgents={{
                get: () => directory,
                subscribe: () => () => {},
                happyAgentActivate: () => {},
            }}
            onCategorySelect={(next) => {
                section = next;
                view.rerender(screen());
            }}
            onClose={() => {}}
            section={section}
            settings={settings}
        />
    );
    view = render(screen());
    expect(view.getByRole("button", { name: "Voice" })).toBeTruthy();
    expect(view.queryByRole("switch", { name: "Enable GPT-Live voice" })).toBeNull();
    expect(gptLive.get().gptLiveEnabled).toBe(false);
    expect(happyAgentSettingsCategoryExists("voice")).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "Voice" }));
    await act(async () => {
        await vi.waitFor(() => expect(voiceSettings.get().loading).toBe(false));
    });
    expect(
        view.getByRole("switch", { name: "Enable GPT-Live voice" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(view.getByRole("combobox", { name: "Voice account" })).toBeTruthy();
    expect(
        view.getByRole("textbox", { name: "Voice prompt" }).getAttribute("value") ??
            (view.getByRole("textbox", { name: "Voice prompt" }) as HTMLTextAreaElement).value,
    ).toBe("Built-in prompt.");
    // Calls take the fastest speed the account offers; one it lacks cannot be chosen.
    const speed = view.getByRole("group", { name: "Speed" });
    expect(
        within(speed).getByRole("button", { name: "Ultrafast" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(within(speed).getByRole("button", { name: "Fast" }).hasAttribute("disabled")).toBe(true);
    expect(view.getByText("Test Model")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Experimental" }));
    expect(view.queryByRole("switch", { name: "Voice calls" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Voice" }));
    const control = view.getByRole("switch", { name: "Enable GPT-Live voice" });
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(view.getByText("Adds a phone beside Settings.")).toBeTruthy();
    fireEvent.click(control);
    expect(experiments.get().voice).toBe(true);
    expect(gptLive.get().gptLiveEnabled).toBe(true);
    expect(gptLiveStoreCreate(persistence).get().gptLiveEnabled).toBe(true);
    expect(view.getByRole("switch", { name: "Enable GPT-Live voice" })).toBe(control);
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(settings.get()).toBe(defaults);
    fireEvent.click(control);
    expect(gptLive.get().gptLiveEnabled).toBe(false);
    expect(gptLiveStoreCreate(persistence).get().gptLiveEnabled).toBe(false);
    expect(experiments.get().voice).toBe(false);
    expect(view.getByRole("button", { name: "Voice" })).toBeTruthy();
    view.unmount();
    voiceSettings[Symbol.dispose]();
    appearance[Symbol.dispose]();
});
