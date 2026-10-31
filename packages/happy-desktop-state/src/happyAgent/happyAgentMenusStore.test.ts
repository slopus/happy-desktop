import { describe, expect, it } from "vitest";
import type { DaemonConfig } from "@slopus/happy-agent-client";
import { fakeHappyAgentDaemonCreate } from "../testing/fakeHappyAgentDaemon.js";
import { happyAgentChiefOfStaffRequestText } from "./happyAgentChiefOfStaffRequest.js";
import {
    happyAgentMenusDerive,
    happyAgentMenusReferencesPreserve,
} from "./happyAgentMenusStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import type { HappyAgentSelection, HappyAgentSessionId } from "./happyAgentTypes.js";

type Providers = DaemonConfig["providers"];

/** The fake daemon's configuration with three accounts of one service. */
function catalogWith(providers: (base: Providers[string]) => Providers) {
    const config = fakeHappyAgentDaemonCreate().configGet();
    const base = Object.values(config.providers)[0]!;
    return happyAgentModelCatalogProject({ ...config, providers: providers(base) });
}

const selectionOn = (providerId: string): HappyAgentSelection => ({
    providerId,
    modelId: "test-model",
    effort: "medium",
    permissionMode: "auto",
});

describe("hidden and unavailable accounts in the pickers", () => {
    it("reads a missing hidden flag as false and lists every visible account", () => {
        const catalog = catalogWith((base) => ({
            main: { ...base, type: "claude" },
            extra: { ...base, type: "claude", hidden: false },
        }));
        expect(catalog.providers.map((provider) => [provider.id, provider.hidden])).toEqual([
            ["main", false],
            ["extra", false],
        ]);
        const menus = happyAgentMenusDerive(catalog, selectionOn("main"));
        expect(menus.modelOptions.map((option) => option.providerId)).toEqual(["main", "extra"]);
        expect(menus.currentAccount).toBe("available");
        expect(menus.currentOption).toBe(menus.modelOptions[0]);
    });

    it("leaves hidden accounts out of the choices", () => {
        const catalog = catalogWith((base) => ({
            main: { ...base, type: "claude" },
            pooled: { ...base, type: "claude", hidden: true },
        }));
        const menus = happyAgentMenusDerive(catalog, selectionOn("main"));
        expect(menus.modelOptions.map((option) => option.providerId)).toEqual(["main"]);
        expect(menus.currentAccount).toBe("available");
    });

    it("keeps a selection on a hidden account, named but not offered", () => {
        const catalog = catalogWith((base) => ({
            main: { ...base, type: "claude" },
            pooled: { ...base, type: "claude", hidden: true },
        }));
        const menus = happyAgentMenusDerive(catalog, selectionOn("pooled"));
        expect(menus.currentProviderId).toBe("pooled");
        expect(menus.currentAccount).toBe("hidden");
        expect(menus.modelOptions.some((option) => option.providerId === "pooled")).toBe(false);
        expect(menus.currentOption).toMatchObject({
            providerId: "pooled",
            modelId: "test-model",
            name: "Test Model",
            disabled: false,
            current: true,
        });
        // Its efforts stay choosable.
        expect(menus.effortOptions.map((option) => option.level)).toEqual([
            "low",
            "medium",
            "high",
        ]);
    });

    it("marks a selection on a switched-off account as disabled", () => {
        const catalog = catalogWith((base) => ({
            main: { ...base, type: "claude" },
            off: { ...base, type: "claude", enabled: false, hidden: true },
        }));
        const menus = happyAgentMenusDerive(catalog, selectionOn("off"));
        expect(menus.currentAccount).toBe("disabled");
        expect(menus.currentOption).toMatchObject({ providerId: "off", disabled: true });
    });

    it("marks a selection on a removed account as missing, still naming its model", () => {
        const catalog = catalogWith((base) => ({ main: { ...base, type: "claude" } }));
        const menus = happyAgentMenusDerive(catalog, selectionOn("gone"));
        expect(menus.currentAccount).toBe("missing");
        expect(menus.currentOption).toMatchObject({
            providerId: "gone",
            modelId: "test-model",
            name: "Test Model",
            disabled: true,
        });
    });

    it("keeps the same snapshot when nothing about the hidden selection changed", () => {
        const catalog = catalogWith((base) => ({
            main: { ...base, type: "claude" },
            pooled: { ...base, type: "claude", hidden: true },
        }));
        const first = happyAgentMenusDerive(catalog, selectionOn("pooled"));
        const again = happyAgentMenusDerive(catalog, selectionOn("pooled"));
        expect(happyAgentMenusReferencesPreserve(first, again)).toBe(first);
    });
});

describe("hidden models in the pickers", () => {
    /** One account offering the test model and a second, `sol`, marked as `hidden`. */
    function catalogWithSol(hidden: boolean | undefined) {
        const config = fakeHappyAgentDaemonCreate().configGet();
        const base = Object.values(config.providers)[0]!;
        return happyAgentModelCatalogProject({
            ...config,
            models: { ...config.models, sol: { ...config.models["test-model"]!, name: "Sol" } },
            providers: {
                main: {
                    ...base,
                    models: [
                        { enabled: true, id: "test-model" },
                        { enabled: true, id: "sol", ...(hidden === undefined ? {} : { hidden }) },
                    ],
                },
            },
        });
    }
    const on = (modelId: string): HappyAgentSelection => ({ ...selectionOn("main"), modelId });

    it("offers a model the daemon does not mark hidden", () => {
        for (const hidden of [undefined, false]) {
            const menus = happyAgentMenusDerive(catalogWithSol(hidden), on("test-model"));
            expect(menus.modelOptions.map((option) => option.modelId)).toEqual([
                "test-model",
                "sol",
            ]);
        }
    });

    it("leaves a hidden model out of the choices", () => {
        const catalog = catalogWithSol(true);
        expect(catalog.providers[0]!.hiddenModels).toEqual(["sol"]);
        const menus = happyAgentMenusDerive(catalog, on("test-model"));
        expect(menus.modelOptions.map((option) => option.modelId)).toEqual(["test-model"]);
    });

    it("keeps a hidden model offered while it is the current selection", () => {
        const menus = happyAgentMenusDerive(catalogWithSol(true), on("sol"));
        expect(menus.modelOptions.map((option) => option.modelId)).toEqual(["test-model", "sol"]);
        expect(menus.currentOption).toMatchObject({ modelId: "sol", current: true });
        expect(menus.currentAccount).toBe("available");
        expect(menus.effortOptions.map((option) => option.level)).toEqual([
            "low",
            "medium",
            "high",
        ]);
    });
});

describe("pools in the pickers", () => {
    it("names a pool's accounts in its failover order, hidden ones included", () => {
        const catalog = catalogWith((base) => ({
            pool: {
                ...base,
                type: "codex",
                name: "Pool",
                pool: { strategy: "round_robin", members: ["codex", "second"] },
            },
            codex: { ...base, type: "codex" },
            second: { ...base, type: "codex", name: "Second", hidden: true },
        }));
        expect(catalog.providers.find((provider) => provider.id === "pool")?.poolMembers).toEqual([
            "codex",
            "second",
        ]);
        expect(catalog.providers.find((provider) => provider.id === "codex")?.poolMembers).toBe(
            undefined,
        );
        const menus = happyAgentMenusDerive(catalog, selectionOn("pool"));
        expect(menus.modelOptions.map((option) => option.providerId)).toEqual(["pool", "codex"]);
        expect(menus.modelOptions[0]!.poolMembers).toEqual([
            { providerId: "codex" },
            { providerId: "second", providerName: "Second" },
        ]);
        expect(menus.modelOptions[1]!.poolMembers).toBeUndefined();
    });
});

describe("Chief of Staff account requests", () => {
    it("labels an unavailable account with its id, model, and conversation", () => {
        const text = happyAgentChiefOfStaffRequestText({
            kind: "accountUnavailable",
            providerId: "claude_extra",
            modelId: "opus-5-5",
            reason: "disabled",
            sessionId: "agent-1" as HappyAgentSessionId,
        });
        expect(text.split("\n\n")[0]).toBe("Troubleshooting: account unavailable (claude_extra)");
        expect(text).toContain("switched off");
        expect(text).toContain("Account: claude_extra, model opus-5-5\nAgent: agent-1");
        expect(text).toContain('Use the "Accounts and models" recipe');
        expect(text).not.toContain("multiple accounts");
        expect(text).not.toMatch(/[~/]\.?[a-z]+\//);
    });

    it("says a removed account is no longer configured", () => {
        const text = happyAgentChiefOfStaffRequestText({
            kind: "accountUnavailable",
            providerId: "grok_api",
            modelId: "grok-4.7",
            reason: "missing",
        });
        expect(text).toContain("no longer configured");
        expect(text).not.toContain("Agent:");
    });

    it("asks to manage connected accounts", () => {
        const text = happyAgentChiefOfStaffRequestText({ kind: "accountsManage" });
        expect(text.split("\n\n")[0]).toBe("Manage connected accounts");
        expect(text).toContain('Use the "Accounts and models" recipe');
        expect(text).not.toContain("multiple accounts");
    });
});
