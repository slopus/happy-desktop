import type { ConversationEntry } from "happy-desktop-state";
import {
    composerModelAccountModel,
    type ComposerModelAccountUsage,
    type ComposerModelControlProps,
    type ComposerModelUsage,
} from "./ComposerModelControl";

/**
 * Where a failure card's switch reads its choices: the same services,
 * selection, and usage watch the conversation's model picker is given, so the
 * two never disagree about which accounts there are or how much each has left.
 */
export type ConversationSwitchSource = Pick<
    ComposerModelControlProps,
    "services" | "selection" | "usageWatch"
>;

/** One account a failed turn can continue on, with the model it would continue on there. */
export interface ConversationSwitchTarget {
    /** The service the account belongs to, which the list groups by. */
    readonly service: string;
    readonly serviceLabel: string;
    readonly providerId: string;
    /** The account's name, as the picker names it. */
    readonly providerLabel: string;
    readonly modelId: string;
    readonly modelName: string;
    /** The account's live usage; absent while it has no reading. */
    readonly usage?: ComposerModelAccountUsage;
}

/**
 * The account the conversation's current failure ran on, which its switch
 * never offers back. Whether any other account is usable is the picker's
 * usage alone, never what earlier failures in the transcript said.
 */
export function conversationSwitchFailedProvider(
    transcript: readonly ConversationEntry[],
    currentFailureId: string | undefined,
): string | undefined {
    for (const entry of transcript) {
        if (entry.kind !== "notice" || entry.variant === "compute" || entry.id !== currentFailureId)
            continue;
        const failure = entry.failure;
        return failure !== undefined && "provider" in failure ? failure.provider.id : undefined;
    }
    return undefined;
}

/**
 * Every account besides the selected one and the one the failed turn ran on,
 * each on the model the picker would move to on it: the selected model where
 * the account offers it, otherwise its top model, with the picker's own usage
 * for it. The selected service comes first, then the others in catalog order,
 * accounts in the order the picker lists them.
 */
export function conversationSwitchTargets(
    source: ConversationSwitchSource,
    usage: ComposerModelUsage | undefined,
    failedProviderId?: string,
): readonly ConversationSwitchTarget[] {
    const selection = source.selection;
    const services = [
        ...source.services.filter((service) => service.id === selection?.service),
        ...source.services.filter((service) => service.id !== selection?.service),
    ];
    return services.flatMap((service) =>
        service.accounts.flatMap((account): ConversationSwitchTarget[] => {
            if (account.id === selection?.account || account.id === failedProviderId) return [];
            const model = composerModelAccountModel(account, selection?.model);
            if (model === undefined) return [];
            const accountUsage = usage?.accounts.get(account.id);
            return [
                {
                    service: service.id,
                    serviceLabel: service.label,
                    providerId: account.id,
                    providerLabel: account.label,
                    modelId: model.id,
                    modelName: model.label,
                    ...(accountUsage === undefined ? {} : { usage: accountUsage }),
                },
            ];
        }),
    );
}

/** Whether an account cannot be used until a window starts over. */
function blocked(usage: ComposerModelAccountUsage | undefined): boolean {
    return (
        usage?.limit !== undefined ||
        [usage?.week, usage?.session].some((window) => (window?.usedPercent ?? 0) >= 100)
    );
}

/**
 * The target the main button offers before another is picked: an account that
 * is not spent, on the failed turn's own service before any other, one with a
 * reading before one without, and then the one with the most of its week left.
 * Ties keep list order. When every account is spent, the first.
 */
export function conversationSwitchTargetPreferred(
    targets: readonly ConversationSwitchTarget[],
    selectedService: string | undefined,
): ConversationSwitchTarget | undefined {
    const rank = (target: ConversationSwitchTarget): readonly number[] => {
        const window = target.usage?.week ?? target.usage?.session;
        return [
            blocked(target.usage) ? 1 : 0,
            target.service === selectedService ? 0 : 1,
            window === undefined ? 1 : 0,
            window?.usedPercent ?? 0,
        ];
    };
    let best: { target: ConversationSwitchTarget; rank: readonly number[] } | undefined;
    for (const target of targets) {
        const candidate = { target, rank: rank(target) };
        if (best === undefined) best = candidate;
        else {
            const at = candidate.rank.findIndex((value, index) => value !== best!.rank[index]);
            if (at >= 0 && candidate.rank[at]! < best.rank[at]!) best = candidate;
        }
    }
    return best?.target;
}
