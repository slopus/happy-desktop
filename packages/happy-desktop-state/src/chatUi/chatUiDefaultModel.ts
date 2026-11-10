import type { HappyAgentModelStoreSnapshot } from "../happyAgent/happyAgentModelStore.js";
import type { HappyAgentThinkingLevel } from "../happyAgent/happyAgentTypes.js";

/** One model a new conversation may start on, on the account that serves it. */
export type ChatUiDefaultModelChoice = {
    readonly providerId: string;
    /** The kind of service behind the account, such as `"claude"` or `"codex"`. */
    readonly providerType: string;
    /** The account's friendly name, or its ID when it has none. */
    readonly providerName: string;
    readonly modelId: string;
    readonly modelName: string;
    readonly efforts: readonly HappyAgentThinkingLevel[];
    readonly defaultEffort: HappyAgentThinkingLevel;
};

/** What new conversations start on: an account's model, and the effort it runs at. */
export type ChatUiDefaultModelSelection = {
    readonly providerId: string;
    readonly modelId: string;
    /** Absent, the model's own default effort. */
    readonly effort?: HappyAgentThinkingLevel;
};

/**
 * The default model for new conversations as a `default_model` component
 * draws it: what the connection's model catalog says now. The component
 * changes it with its `set` action; the catalog follows the daemon's
 * configuration, so the answer shows here on every device.
 */
export type ChatUiDefaultModel = {
    /** True until the daemon's catalog has been read. */
    readonly loading: boolean;
    readonly current?: ChatUiDefaultModelSelection;
    /**
     * Every model an enabled, visible account offers in its pickers, in the
     * daemon's order, and the current default even when it is kept out of them.
     */
    readonly choices: readonly ChatUiDefaultModelChoice[];
};

/** The default model before the catalog has been read. */
export const CHAT_UI_DEFAULT_MODEL_LOADING: ChatUiDefaultModel = { loading: true, choices: [] };
const read = new WeakMap<object, ChatUiDefaultModel>();

/** Reads one catalog snapshot, once: the same snapshot answers with the same object. */
export function chatUiDefaultModelRead(models: HappyAgentModelStoreSnapshot): ChatUiDefaultModel {
    if (models.type !== "ready") return CHAT_UI_DEFAULT_MODEL_LOADING;
    const known = read.get(models);
    if (known !== undefined) return known;
    const catalog = models.catalog;
    const value: ChatUiDefaultModel = {
        loading: false,
        current: {
            providerId: catalog.defaultProviderId,
            modelId: catalog.defaultModelId,
            ...(catalog.defaultEffort ? { effort: catalog.defaultEffort } : {}),
        },
        choices: catalog.providers.flatMap((provider) =>
            provider.enabled && !provider.hidden
                ? provider.models
                      .filter(
                          (model) =>
                              !provider.hiddenModels.includes(model.id) ||
                              (provider.id === catalog.defaultProviderId &&
                                  model.id === catalog.defaultModelId),
                      )
                      .map((model) => ({
                          providerId: provider.id,
                          providerType: provider.type,
                          providerName: provider.name ?? provider.id,
                          modelId: model.id,
                          modelName: model.name,
                          efforts: model.thinkingLevels,
                          defaultEffort: model.defaultThinkingLevel,
                      }))
                : [],
        ),
    };
    read.set(models, value);
    return value;
}
