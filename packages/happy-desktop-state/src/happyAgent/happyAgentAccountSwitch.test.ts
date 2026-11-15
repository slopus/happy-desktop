import { describe, expect, it } from "vitest";
import { happyAgentAccountSwitchTarget } from "./happyAgentAccountSwitch.js";
import type { HappyAgentProviderUsageEntry } from "./happyAgentProviderUsageStore.js";
import type {
    HappyAgentModel,
    HappyAgentModelCatalog,
    HappyAgentModelProvider,
} from "./happyAgentTypes.js";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

const OPUS: HappyAgentModel = {
    id: "anthropic/opus-5-5",
    name: "Opus 5.5",
    serviceTierOptions: [],
    thinkingLevels: ["low", "medium", "high"],
    defaultThinkingLevel: "medium",
};
const FABLE: HappyAgentModel = { ...OPUS, id: "anthropic/fable-5-1", name: "Fable 5.1" };

function provider(
    id: string,
    overrides: Partial<HappyAgentModelProvider> = {},
): HappyAgentModelProvider {
    return {
        id,
        type: "claude",
        models: [OPUS, FABLE],
        hiddenModels: [],
        enabled: true,
        hidden: false,
        ...overrides,
    } as HappyAgentModelProvider;
}

function catalog(...providers: HappyAgentModelProvider[]): HappyAgentModelCatalog {
    return {
        defaultModelId: OPUS.id,
        defaultProviderId: "claude",
        models: [OPUS, FABLE],
        providers,
    };
}

function spent(providerId: string, resetsAt = NOW + HOUR): HappyAgentProviderUsageEntry {
    return {
        providerId,
        usage: {
            capturedAt: NOW,
            exhausted: true,
            weekly: { usedPercent: 100, resetsAt },
        },
    };
}

function used(providerId: string, usedPercent: number): HappyAgentProviderUsageEntry {
    return {
        providerId,
        usage: { capturedAt: NOW, weekly: { usedPercent, resetsAt: NOW + HOUR } },
    };
}

const target = (
    usage: readonly HappyAgentProviderUsageEntry[],
    providers = catalog(provider("claude"), provider("claude_work"), provider("claude_home")),
    preferredProviderId?: string,
    modelId = OPUS.id,
) =>
    happyAgentAccountSwitchTarget({
        catalog: providers,
        providerId: "claude",
        modelId,
        usage,
        ...(preferredProviderId === undefined ? {} : { preferredProviderId }),
        now: NOW,
    })?.providerId;

describe("account switch target", () => {
    it("offers nothing while the conversation's account has usage left", () => {
        expect(target([used("claude", 99), used("claude_work", 10)])).toBeUndefined();
        expect(target([])).toBeUndefined();
    });

    it("offers nothing once the spent account's reset has passed", () => {
        expect(target([spent("claude", NOW - 1), used("claude_work", 10)])).toBeUndefined();
    });

    it("moves a spent account to the one with the most of its week left", () => {
        expect(target([spent("claude"), used("claude_work", 60), used("claude_home", 20)])).toBe(
            "claude_home",
        );
    });

    it("prefers the account picked last, which other conversations already moved to", () => {
        expect(
            target(
                [spent("claude"), used("claude_work", 60), used("claude_home", 20)],
                undefined,
                "claude_work",
            ),
        ).toBe("claude_work");
    });

    it("never offers a picked-last account that is spent itself", () => {
        expect(
            target(
                [spent("claude"), spent("claude_work"), used("claude_home", 90)],
                undefined,
                "claude_work",
            ),
        ).toBe("claude_home");
    });

    it("only offers an account of the same service that serves the same model", () => {
        const providers = catalog(
            provider("claude"),
            provider("codex", { type: "codex" }),
            provider("claude_fable", { models: [FABLE] }),
            provider("claude_hidden_model", { hiddenModels: [OPUS.id] }),
            provider("claude_off", { enabled: false }),
            provider("claude_hidden", { hidden: true }),
            provider("claude_signed_out"),
        );
        const usage = [
            spent("claude"),
            { providerId: "claude_signed_out", signIn: "signed_out" as const },
        ];
        expect(target(usage, providers)).toBeUndefined();
        expect(target(usage, catalog(...providers.providers, provider("claude_ok")))).toBe(
            "claude_ok",
        );
    });

    it("says when the spent account starts over, once every full window has", () => {
        const switched = (usage: readonly HappyAgentProviderUsageEntry[]) =>
            happyAgentAccountSwitchTarget({
                catalog: catalog(provider("claude"), provider("claude_work")),
                providerId: "claude",
                modelId: OPUS.id,
                usage,
                now: NOW,
            });
        expect(switched([spent("claude"), used("claude_work", 10)])).toEqual({
            fromProviderId: "claude",
            fromResetsAt: NOW + HOUR,
            providerId: "claude_work",
        });
        expect(
            switched([
                {
                    providerId: "claude",
                    usage: {
                        capturedAt: NOW,
                        exhausted: true,
                        fiveHour: { usedPercent: 100, resetsAt: NOW + HOUR },
                        weekly: { usedPercent: 100, resetsAt: NOW + 30 * HOUR },
                    },
                },
            ])?.fromResetsAt,
        ).toBe(NOW + 30 * HOUR);
        // Spent, with no reset given: no moment is claimed.
        expect(
            switched([{ providerId: "claude", usage: { capturedAt: NOW, exhausted: true } }]),
        ).toEqual({ fromProviderId: "claude", providerId: "claude_work" });
    });

    it("takes an account with a reading before one without", () => {
        expect(target([spent("claude"), used("claude_home", 95)])).toBe("claude_home");
    });
});
