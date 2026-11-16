import type {
    ConversationErrorAssistance,
    ConversationFailure,
    ConversationFailureResolution,
    ConversationPoolMemberFailure,
    ConversationRetrying,
} from "happy-desktop-state";
import { conversationErrorAssistanceText } from "./conversationErrorAssistanceText";
import type { ConversationSwitchTarget } from "./conversationSwitchTargets";
import { localMoment, type LocalTimeZone } from "./localTime";

/**
 * Everything a failure card says, written here from the failure's kind and
 * typed fields so it can be translated. The daemon's `message` is read only
 * for a kind this client does not know. The card and its exact row geometry
 * share these functions.
 */

/** One run of the card's message: prose, or a command the reader can copy. */
export type ConversationFailureSegment =
    | { readonly kind: "text"; readonly text: string }
    | { readonly kind: "code"; readonly text: string };

/**
 * The clock a card tells a reset time on: the viewer's own zone unless pinned.
 * `now` is the owner's surface clock; without it the time carries its date.
 */
export interface ConversationFailureClock {
    readonly now?: number;
    readonly zone?: LocalTimeZone;
}

const text = (value: string): ConversationFailureSegment => ({ kind: "text", text: value });

function until(resetsAt: number | null, clock: ConversationFailureClock): string {
    return resetsAt === null ? "" : ` until ${localMoment(resetsAt, clock.now, clock.zone)}`;
}

/** One sentence for an account a pool set aside, after the sentence before it. */
function poolMemberMessage(
    member: ConversationPoolMemberFailure,
    clock: ConversationFailureClock,
): readonly ConversationFailureSegment[] {
    const name = member.provider.label;
    switch (member.reason) {
        case "signin_missing":
            return member.command === null
                ? [text(` ${name} isn't signed in.`)]
                : [
                      text(` ${name} isn't signed in: run `),
                      { kind: "code", text: member.command },
                      text("."),
                  ];
        case "usage_limit":
            return [text(` ${name} is out of usage${until(member.resetsAt, clock)}.`)];
        case "rate_limited":
            return [text(` ${name} is rate-limited.`)];
        case "provider_unavailable":
            return [text(` ${name} is overloaded.`)];
        case "network":
            return [text(` ${name} couldn't be reached.`)];
        case "other":
            return [text(` ${name} couldn't be used.`)];
    }
}

/** The card's message line, without its action. */
export function conversationFailureMessage(
    failure: ConversationFailure,
    clock: ConversationFailureClock,
): readonly ConversationFailureSegment[] {
    switch (failure.kind) {
        case "signin_missing":
            return failure.command === null || failure.product === null
                ? [
                      text(
                          `${failure.provider.label} couldn't authenticate. Check its sign-in settings, then retry.`,
                      ),
                  ]
                : [
                      text(`${failure.product} isn't signed in. Run `),
                      { kind: "code", text: failure.command },
                      text(", then retry."),
                  ];
        case "usage_limit":
            return [
                text(
                    `${failure.provider.vendorName} usage limit reached${until(failure.resetsAt, clock)}.`,
                ),
            ];
        case "no_account_available":
            // A daemon that names the accounts it set aside says why for each,
            // so a signed-out one is not mistaken for a spent one.
            return failure.members === undefined || failure.members.length === 0
                ? [
                      text(
                          `Every account in “${failure.poolName}” is out of usage${until(failure.resetsAt, clock)}.`,
                      ),
                  ]
                : [
                      text(`No account in “${failure.poolName}” can take this turn.`),
                      ...failure.members.flatMap((member) => poolMemberMessage(member, clock)),
                  ];
        case "rate_limited":
            return [text(`${failure.provider.vendorName} is rate-limited. Try again in a minute.`)];
        case "provider_unavailable":
            return [
                text(
                    `${failure.provider.vendorName} is overloaded right now. Try again in a moment.`,
                ),
            ];
        case "network":
            return [
                text(
                    `Couldn't reach ${failure.provider.vendorName}. Check your connection, then retry.`,
                ),
            ];
        case "context_too_long":
            return [
                text(
                    `This conversation is too long for ${failure.modelName ?? failure.modelId}, even after a reset.`,
                ),
            ];
        case "provider_disabled":
            return [
                text(
                    `${failure.provider.label} is turned off. Turn it on in Settings, then retry.`,
                ),
            ];
        case "internal":
            return [text(`Something went wrong: ${failure.detail}`)];
        case "unknown":
            return [text(failure.message)];
    }
}

/** The action on the message line: New chat once a reset has already failed, otherwise Retry. */
export function conversationFailureLineAction(failure: ConversationFailure): "retry" | "newChat" {
    return failure.kind === "context_too_long" ? "newChat" : "retry";
}

const LINE_ACTION_LABEL = { retry: "Retry", newChat: "New chat" } as const;

/** "account · model", as a switch target names itself. */
export function conversationFailureTargetLabel(target: {
    readonly providerLabel: string;
    readonly modelId: string;
    readonly modelName?: string;
}): string {
    return `${target.providerLabel} · ${target.modelName ?? target.modelId}`;
}

/** What the split button's main segment does, in full: its tooltip. */
export function conversationFailureSwitchLabel(target: ConversationSwitchTarget): string {
    return `Switch to ${conversationFailureTargetLabel(target)} and continue`;
}

/** The split button's main segment as it reads on the message line: the account alone. */
export function conversationFailureSwitchShortLabel(target: ConversationSwitchTarget): string {
    return `Switch to ${target.providerLabel}`;
}

/**
 * The targets in list order, cut where their service changes, each part named
 * by its service as the model picker names it.
 */
export function conversationFailureTargetGroups(
    targets: readonly ConversationSwitchTarget[],
): readonly {
    readonly group: string;
    readonly label: string;
    readonly targets: readonly ConversationSwitchTarget[];
}[] {
    const groups: { group: string; label: string; targets: ConversationSwitchTarget[] }[] = [];
    for (const target of targets) {
        const last = groups.at(-1);
        if (last?.group === target.service) last.targets.push(target);
        else groups.push({ group: target.service, label: target.serviceLabel, targets: [target] });
    }
    return groups;
}

/** The stable identity of a target, for the picked one to be remembered by. */
export function conversationFailureTargetKey(
    target: Pick<ConversationSwitchTarget, "providerId" | "modelId">,
): string {
    return `${target.providerId}\u0000${target.modelId}`;
}

/** The muted line a card keeps once it has been acted on. */
export function conversationFailureResolutionText(
    resolution: ConversationFailureResolution,
): string {
    switch (resolution.action) {
        case "retried":
            return "Retried";
        case "switched":
            return `Switched to ${conversationFailureTargetLabel(resolution)}`;
        case "handled":
            return "Handled";
    }
}

/** What a failure card shows besides its message, shared with its exact row geometry. */
export interface ConversationFailureCardLayout {
    /** The message's own button, first after it. */
    readonly lineAction?: { readonly label: string };
    /** The switch split button's targets, when switching is offered. */
    readonly switchTargets?: readonly ConversationSwitchTarget[];
    readonly assistance?: ReturnType<typeof conversationErrorAssistanceText>;
    /** The muted record of what was done, in place of the actions. */
    readonly resolution?: string;
}

/**
 * Which buttons a card carries. A resolved card records what was done and
 * offers nothing; one the conversation has moved past offers only Ask Chief of
 * Staff. Otherwise the switch is offered when the live catalog has another
 * account to move to, between the message's own action and Ask Chief of Staff.
 */
export function conversationFailureCardLayout(
    failure: ConversationFailure,
    options: {
        readonly current: boolean;
        readonly actions: {
            readonly retry: boolean;
            readonly newChat: boolean;
            readonly switch: boolean;
        };
        /** Every account the failed turn could continue on, from the live catalog. */
        readonly targets?: readonly ConversationSwitchTarget[];
        readonly assistance?: ConversationErrorAssistance;
    },
): ConversationFailureCardLayout {
    if (failure.resolution !== undefined)
        return { resolution: conversationFailureResolutionText(failure.resolution) };
    const assistance = options.assistance
        ? conversationErrorAssistanceText(options.assistance)
        : undefined;
    if (!options.current) return assistance ? { assistance } : {};
    const switchTargets =
        options.actions.switch && options.targets !== undefined && options.targets.length > 0
            ? options.targets
            : undefined;
    const action = conversationFailureLineAction(failure);
    const lineAction = (action === "retry" ? options.actions.retry : options.actions.newChat)
        ? { label: LINE_ACTION_LABEL[action] }
        : undefined;
    return {
        ...(lineAction ? { lineAction } : {}),
        ...(switchTargets ? { switchTargets } : {}),
        ...(assistance ? { assistance } : {}),
    };
}

/** The working line while the provider retries on its own, or after a context reset. */
export function conversationRetryingLabel(retrying: ConversationRetrying): string {
    const count = `(${String(retrying.attempt)}/${String(retrying.maxAttempts)})`;
    switch (retrying.kind) {
        case "context_too_long":
            return "Context full — resetting, then retrying…";
        case "provider_unavailable":
            return `${retrying.vendorName} is overloaded — retrying ${count}…`;
        case "rate_limited":
            return `${retrying.vendorName} is rate-limited — retrying ${count}…`;
        case "network":
            return `Couldn't reach ${retrying.vendorName} — retrying ${count}…`;
        default:
            return `${retrying.vendorName} — retrying ${count}…`;
    }
}
