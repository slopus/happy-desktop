import { afterEach, describe, expect, it, vi } from "vitest";
import type { HappyAgentClient } from "@slopus/happy-agent-client";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import {
    happyAgentVoiceSettingsStoreCreate,
    type HappyAgentVoiceSettings,
} from "./happyAgentVoiceSettingsStore.js";

const DEFAULT_PROMPT = "You are Happy's voice.";

type Patch = {
    readonly voice: {
        readonly controller?: Partial<HappyAgentVoiceSettings["controller"]>;
        readonly systemPrompt?: string | null;
    };
};

/**
 * A machine holding voice settings the way the contract describes them: a
 * prompt equal to the default is no override, `null` restores a default, and
 * every write answers with the whole configuration.
 */
function machine(inheritedPrompt: string | null = null) {
    const base = fakeHappyAgentDaemonCreate().configGet();
    const providerId = base.defaults.providerId;
    let controller: HappyAgentVoiceSettings["controller"] = {
        providerId: null,
        modelId: null,
        effort: null,
        speed: null,
    };
    let override: string | null = null;
    const config = () => ({
        ...base,
        voice: {
            controller,
            effectiveController: {
                providerId: controller.providerId ?? providerId,
                modelId: controller.modelId ?? base.defaults.modelId,
                effort: controller.effort ?? "low",
                serviceTier: "priority" as const,
                // Unset takes the fastest the plan offers.
                speed: controller.speed ?? ("ultrafast" as const),
                speeds: ["regular", "fast", "ultrafast"] as const,
                notice: null,
            },
            defaultSystemPrompt: DEFAULT_PROMPT,
            systemPromptOverride: override ?? inheritedPrompt,
            effectiveSystemPrompt: override ?? inheritedPrompt ?? DEFAULT_PROMPT,
        },
    });
    const patches: Patch[] = [];
    const reads = { count: 0 };
    let refuse: string | undefined;
    const client = {
        getConfig: vi.fn(async () => {
            reads.count++;
            return { config: config() };
        }),
        patchConfig: vi.fn(async (patch: Patch) => {
            patches.push(patch);
            if (refuse) throw new Error(refuse);
            if (patch.voice.controller) {
                const next = patch.voice.controller;
                controller = {
                    providerId:
                        next.providerId === undefined ? controller.providerId : next.providerId,
                    modelId: next.modelId === undefined ? controller.modelId : next.modelId,
                    effort: next.effort === undefined ? controller.effort : next.effort,
                    speed: next.speed === undefined ? controller.speed : next.speed,
                };
            }
            if (patch.voice.systemPrompt !== undefined)
                override =
                    patch.voice.systemPrompt === null || patch.voice.systemPrompt === DEFAULT_PROMPT
                        ? null
                        : patch.voice.systemPrompt;
            return { config: config() };
        }),
    } as unknown as Pick<HappyAgentClient, "getConfig" | "patchConfig">;
    return {
        client,
        patches,
        reads,
        modelId: base.defaults.modelId,
        refuseWith(message: string | undefined) {
            refuse = message;
        },
    };
}

afterEach(() => vi.useRealTimers());

describe("Voice settings", () => {
    it("removes a runtime prompt override and restores the inherited custom machine prompt", async () => {
        const m = machine("Configured in the machine file.");
        const store = happyAgentVoiceSettingsStoreCreate({ client: m.client });
        const stop = store.subscribe(() => {});
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        store.promptDraftUpdate("Runtime prompt.");
        store.promptSave();
        await vi.waitFor(() =>
            expect(store.get().settings?.effectiveSystemPrompt).toBe("Runtime prompt."),
        );
        store.promptReset();
        await vi.waitFor(() =>
            expect(store.get().settings?.effectiveSystemPrompt).toBe(
                "Configured in the machine file.",
            ),
        );
        expect(store.get().settings?.systemPromptOverride).toBe("Configured in the machine file.");
        expect(m.patches.at(-1)).toEqual({ voice: { systemPrompt: null } });
        stop();
        store[Symbol.dispose]();
    });

    it("reads nothing until watched, then shows the machine's settings and the picker on the controller in effect", async () => {
        const m = machine();
        const store = happyAgentVoiceSettingsStoreCreate({ client: m.client });
        expect(store.get()).toMatchObject({ loading: true, saving: false });
        expect(m.reads.count).toBe(0);
        const stop = store.subscribe(() => {});
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        expect(store.get().settings).toMatchObject({
            controller: { providerId: null, modelId: null, speed: null },
            effectiveSystemPrompt: DEFAULT_PROMPT,
            systemPromptOverride: null,
        });
        expect(store.get().menus).toMatchObject({ currentModelId: m.modelId });
        stop();
        store[Symbol.dispose]();
    });

    it("writes the controller choice and speed, and shows only what the machine answers", async () => {
        const m = machine();
        const store = happyAgentVoiceSettingsStoreCreate({ client: m.client });
        const stop = store.subscribe(() => {});
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        store.controllerModelUpdate({ providerId: "codex", modelId: m.modelId, effort: "high" });
        expect(store.get().saving).toBe(true);
        expect(store.get().settings?.controller.providerId).toBeNull();
        await vi.waitFor(() => expect(store.get().saving).toBe(false));
        expect(m.patches[0]).toEqual({
            voice: { controller: { providerId: "codex", modelId: m.modelId, effort: "high" } },
        });
        expect(store.get().settings?.controller).toMatchObject({
            providerId: "codex",
            effort: "high",
        });
        expect(store.get().settings?.effectiveController.speed).toBe("ultrafast");
        store.controllerSpeedUpdate("fast");
        await vi.waitFor(() => expect(store.get().settings?.controller.speed).toBe("fast"));
        expect(m.patches[1]).toEqual({ voice: { controller: { speed: "fast" } } });
        expect(store.get().settings?.effectiveController.speed).toBe("fast");
        store.controllerSpeedUpdate(null);
        await vi.waitFor(() => expect(store.get().settings?.controller.speed).toBeNull());
        expect(m.patches[2]).toEqual({ voice: { controller: { speed: null } } });
        stop();
        store[Symbol.dispose]();
    });

    it("keeps prompt edits local until Save, drops them on Cancel, and resets by removing the saved prompt", async () => {
        const m = machine();
        const store = happyAgentVoiceSettingsStoreCreate({ client: m.client });
        const stop = store.subscribe(() => {});
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        store.promptDraftUpdate("Be brief.");
        expect(store.get().promptDraft).toBe("Be brief.");
        store.promptDraftCancel();
        expect(store.get().promptDraft).toBeUndefined();
        expect(m.patches).toEqual([]);

        store.promptDraftUpdate("Be brief.");
        store.promptSave();
        await vi.waitFor(() =>
            expect(store.get().settings?.systemPromptOverride).toBe("Be brief."),
        );
        expect(store.get().promptDraft).toBeUndefined();
        expect(store.get().settings?.effectiveSystemPrompt).toBe("Be brief.");
        expect(m.patches).toEqual([{ voice: { systemPrompt: "Be brief." } }]);

        store.promptReset();
        await vi.waitFor(() => expect(store.get().settings?.systemPromptOverride).toBeNull());
        // The default is never written: reset sends null.
        expect(m.patches[1]).toEqual({ voice: { systemPrompt: null } });
        expect(m.patches.some((patch) => patch.voice.systemPrompt === DEFAULT_PROMPT)).toBe(false);
        stop();
        store[Symbol.dispose]();
    });

    it("keeps a refused prompt in the editor with the machine's reason", async () => {
        const m = machine();
        const store = happyAgentVoiceSettingsStoreCreate({ client: m.client });
        const stop = store.subscribe(() => {});
        await vi.waitFor(() => expect(store.get().loading).toBe(false));
        m.refuseWith("The prompt is too long.");
        store.promptDraftUpdate("x".repeat(10));
        store.promptSave();
        await vi.waitFor(() =>
            expect(store.get().saveError?.message).toBe("The prompt is too long."),
        );
        expect(store.get().promptDraft).toBe("x".repeat(10));
        expect(store.get().saving).toBe(false);
        expect(store.get().settings?.systemPromptOverride).toBeNull();
        stop();
        store[Symbol.dispose]();
    });

    it("polls only while watched", async () => {
        vi.useFakeTimers();
        const m = machine();
        const store = happyAgentVoiceSettingsStoreCreate({ client: m.client });
        const stop = store.subscribe(() => {});
        await vi.advanceTimersByTimeAsync(0);
        expect(m.reads.count).toBe(1);
        await vi.advanceTimersByTimeAsync(4_000);
        expect(m.reads.count).toBe(2);
        stop();
        await vi.advanceTimersByTimeAsync(20_000);
        expect(m.reads.count).toBe(2);
        store[Symbol.dispose]();
    });
});
