import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
    appearanceStoreCreate,
    experimentsStoreCreate,
    gptLiveStoreCreate,
    happyAgentSettingsStoreCreate,
    type GptLiveDocument,
} from "happy-desktop-state";
import {
    AppHappyAgentSettingsView,
    happyAgentSettingsCategoryExists,
} from "../../sources/views/AppHappyAgentSettingsView";
import type { AppHappyAgentDirectorySnapshot } from "../../sources/AppHappyAgentView";

// jsdom has no canvas. The unrelated offline model-catalog spinner is covered
// by its own browser tests; the real GPT-Live settings tree remains mounted.
vi.mock("../../../happy-desktop-ui/src/Spinner", () => ({ Spinner: () => null }));

it("reveals the entire Experimental category only after opting in and keeps saved voice hidden while off", () => {
    let document: GptLiveDocument | undefined = { gptLiveEnabled: true };
    const persistence = {
        read: () => document,
        write: (next: GptLiveDocument) => {
            document = next;
        },
    };
    const experiments = experimentsStoreCreate();
    const gptLive = gptLiveStoreCreate(persistence, undefined, experiments);
    const directory: AppHappyAgentDirectorySnapshot = { happyAgents: [] };
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
    expect(view.queryByRole("button", { name: "Experimental" })).toBeNull();
    expect(view.queryByRole("switch", { name: "Enable GPT-Live voice" })).toBeNull();
    expect(gptLive.get().gptLiveEnabled).toBe(false);
    expect(happyAgentSettingsCategoryExists("experimental", false)).toBe(false);
    section = "experimental";
    view.rerender(screen());
    expect(view.queryByRole("switch", { name: "Enable GPT-Live voice" })).toBeNull();
    fireEvent.click(view.getByRole("switch", { name: "Enable experimental features" }));
    expect(view.getByRole("button", { name: "Experimental" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Experimental" }));
    const control = view.getByRole("switch", { name: "Enable GPT-Live voice" });
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(view.getByText("Choose an account, then explicitly start a call")).toBeTruthy();
    fireEvent.click(control);
    expect(gptLive.get().gptLiveEnabled).toBe(true);
    expect(gptLiveStoreCreate(persistence).get().gptLiveEnabled).toBe(true);
    expect(view.getByRole("switch", { name: "Enable GPT-Live voice" })).toBe(control);
    expect(settings.get()).toBe(defaults);
    fireEvent.click(control);
    expect(gptLive.get().gptLiveEnabled).toBe(false);
    expect(gptLiveStoreCreate(persistence).get().gptLiveEnabled).toBe(false);
    expect(experiments.get().experimentalFeaturesEnabled).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "General" }));
    expect(view.queryByRole("switch", { name: "Enable GPT-Live voice" })).toBeNull();
    fireEvent.click(view.getByRole("switch", { name: "Enable experimental features" }));
    expect(view.queryByRole("button", { name: "Experimental" })).toBeNull();
    view.unmount();
    appearance[Symbol.dispose]();
});
