import type { HappyAgentClient } from "@slopus/happy-agent-client";
import type { UserError } from "../types.js";
import type { HappyAgentModelStore, HappyAgentModelStoreSnapshot } from "./happyAgentModelStore.js";
import { happyAgentModelCatalogProject } from "./happyAgentProject.js";
import { happyAgentUserError } from "./happyAgentSupport.js";
import type { HappyAgentThinkingLevel } from "./happyAgentTypes.js";

/** One model a new conversation may start on, on the account that serves it. */
export type HappyAgentDefaultModelChoice = {
    readonly providerId: string;
    /** The account's friendly name, or its ID when it has none. */
    readonly providerName: string;
    readonly modelId: string;
    readonly modelName: string;
    readonly efforts: readonly HappyAgentThinkingLevel[];
    readonly defaultEffort: HappyAgentThinkingLevel;
};

export type HappyAgentDefaultModelSelection = {
    readonly providerId: string;
    readonly modelId: string;
    /** Omitted, the model's own default effort. */
    readonly effort?: HappyAgentThinkingLevel;
};

export type HappyAgentDefaultModelSnapshot = {
    /** True until the daemon's catalog has been read. */
    readonly loading: boolean;
    /** What new conversations start on, as the daemon last confirmed it. */
    readonly current?: HappyAgentDefaultModelSelection;
    /** Every model an enabled, visible account offers, in the daemon's order. */
    readonly choices: readonly HappyAgentDefaultModelChoice[];
    /** A change asked for here that the daemon has not answered yet. */
    readonly saving?: HappyAgentDefaultModelSelection;
    /** Why the last change was refused. Cleared by the next attempt. */
    readonly saveError?: UserError;
};

/**
 * The default model for new conversations, as `<figure data-setting="default-model">`
 * draws it (happy-agent API.md): read from the connection's model catalog,
 * changed through `PATCH /v0/config` `defaults`. The change is the daemon's
 * durable configuration, so the figure shows it as saving until the daemon
 * answers, and then shows what the daemon answered.
 */
export interface HappyAgentDefaultModelStore {
    get(): HappyAgentDefaultModelSnapshot;
    subscribe(listener: () => void): () => void;
    defaultModelUpdate(selection: HappyAgentDefaultModelSelection): void;
    [Symbol.dispose](): void;
}

export type HappyAgentDefaultModelStoreDeps = {
    readonly client: Pick<HappyAgentClient, "patchConfig">;
    /** The connection's one catalog authority, which every answer here replaces. */
    readonly models: HappyAgentModelStore;
};

export function happyAgentDefaultModelStoreCreate(
    deps: HappyAgentDefaultModelStoreDeps,
): HappyAgentDefaultModelStore {
    const listeners = new Set<() => void>();
    let disposed = false;
    let saving: HappyAgentDefaultModelSelection | undefined;
    let saveError: UserError | undefined;
    let modelsStop: (() => void) | undefined;
    let derivedFrom: HappyAgentModelStoreSnapshot | undefined;
    let derived: Omit<HappyAgentDefaultModelSnapshot, "saving" | "saveError"> = {
        loading: true,
        choices: [],
    };
    let snapshot: HappyAgentDefaultModelSnapshot = derived;

    const derive = (): HappyAgentDefaultModelSnapshot => {
        const models = deps.models.get();
        if (models !== derivedFrom) {
            derivedFrom = models;
            derived =
                models.type === "ready" ? catalogRead(models) : { loading: true, choices: [] };
        }
        const next: HappyAgentDefaultModelSnapshot = {
            ...derived,
            ...(saving ? { saving } : {}),
            ...(saveError ? { saveError } : {}),
        };
        if (
            next.loading !== snapshot.loading ||
            next.current !== snapshot.current ||
            next.choices !== snapshot.choices ||
            next.saving !== snapshot.saving ||
            next.saveError !== snapshot.saveError
        )
            snapshot = next;
        return snapshot;
    };

    const publish = () => {
        derive();
        for (const listener of listeners) listener();
    };

    return {
        get: derive,
        subscribe(listener) {
            if (disposed) return () => undefined;
            listeners.add(listener);
            if (!modelsStop) {
                modelsStop = deps.models.subscribe(publish);
                void deps.models.load().catch(() => undefined);
            }
            return () => {
                listeners.delete(listener);
                if (listeners.size !== 0) return;
                modelsStop?.();
                modelsStop = undefined;
            };
        },
        defaultModelUpdate(selection) {
            if (disposed || saving) return;
            saving = selection;
            saveError = undefined;
            publish();
            void deps.client
                .patchConfig({
                    defaults: {
                        providerId: selection.providerId,
                        modelId: selection.modelId,
                        ...(selection.effort ? { effort: selection.effort } : {}),
                    },
                })
                .then(
                    (response) => {
                        if (disposed) return;
                        saving = undefined;
                        deps.models.catalogChanged(happyAgentModelCatalogProject(response.config));
                        publish();
                    },
                    (error: unknown) => {
                        if (disposed) return;
                        saving = undefined;
                        saveError = happyAgentUserError(error);
                        publish();
                    },
                );
        },
        [Symbol.dispose]() {
            disposed = true;
            modelsStop?.();
            modelsStop = undefined;
            listeners.clear();
        },
    };
}

function catalogRead(
    models: Extract<HappyAgentModelStoreSnapshot, { type: "ready" }>,
): Omit<HappyAgentDefaultModelSnapshot, "saving" | "saveError"> {
    const catalog = models.catalog;
    const choices = catalog.providers.flatMap((provider) =>
        provider.enabled && !provider.hidden
            ? provider.models.map((model) => ({
                  providerId: provider.id,
                  providerName: provider.name ?? provider.id,
                  modelId: model.id,
                  modelName: model.name,
                  efforts: model.thinkingLevels,
                  defaultEffort: model.defaultThinkingLevel,
              }))
            : [],
    );
    return {
        loading: false,
        current: {
            providerId: catalog.defaultProviderId,
            modelId: catalog.defaultModelId,
            ...(catalog.defaultEffort ? { effort: catalog.defaultEffort } : {}),
        },
        choices,
    };
}
