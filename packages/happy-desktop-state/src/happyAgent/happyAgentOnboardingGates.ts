import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";

/** Whose step a gate is: each member's own, or done once for the whole server. */
export type HappyAgentOnboardingGateScope = "member" | "server";
export type HappyAgentOnboardingGateRequirement = "optional" | "required";
/** `unavailable`: the server cannot evaluate the gate yet. */
export type HappyAgentOnboardingGateStatus = "done" | "open" | "skipped" | "unavailable";

interface HappyAgentOnboardingGateCommon {
    /** The server's gate ID; for an `unknown` gate, the ID this client does not know. */
    readonly id: string;
    readonly scope: HappyAgentOnboardingGateScope;
    readonly requirement: HappyAgentOnboardingGateRequirement;
    readonly status: HappyAgentOnboardingGateStatus;
    /** Holds the reader back until it is done. */
    readonly blocking: boolean;
    /** False when the reader's role cannot complete this server gate. */
    readonly canComplete: boolean;
}

export interface HappyAgentOnboardingPluginGateEntry {
    readonly id: string;
    readonly name: string;
    readonly required: boolean;
    readonly active: boolean;
}

/** One step of a Happy Cloud server's onboarding, as the server decides it. */
export type HappyAgentOnboardingGate = HappyAgentOnboardingGateCommon &
    (
        | { readonly kind: "profile" }
        | { readonly kind: "avatar" }
        | {
              readonly kind: "adminBot";
              readonly botId: string;
              readonly name: string;
              readonly avatarUrl: string | null;
              /** The server's own words for this step. */
              readonly title: string;
              readonly description: string;
          }
        | {
              readonly kind: "inference";
              /** The connections the team or reader already has, by provider. */
              readonly connected: readonly string[];
              /** Whether conversations already run on the operator's free model. */
              readonly freeModel: boolean;
          }
        | {
              readonly kind: "plugins";
              /** Plugin IDs that must have an active installation. */
              readonly required: readonly string[];
              readonly plugins: readonly HappyAgentOnboardingPluginGateEntry[];
          }
        | { readonly kind: "teammates"; readonly invites: number; readonly members: number }
        | {
              readonly kind: "mobileApp";
              readonly registered: boolean;
              readonly appStoreUrl: string | null;
              readonly playStoreUrl: string | null;
          }
        | { readonly kind: "paymentMethod" }
        | { readonly kind: "payment" }
        /** A gate this client predates. Blocking, it asks for an update; otherwise it is passed over. */
        | { readonly kind: "unknown" }
    );

export type HappyAgentOnboardingGateKind = HappyAgentOnboardingGate["kind"];

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function textOf(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function urlOf(value: unknown): string | null {
    return typeof value === "string" && value.startsWith("https://") ? value : null;
}

function countOf(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function textsOf(value: unknown): readonly string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [];
}

const STATUSES: readonly HappyAgentOnboardingGateStatus[] = [
    "done",
    "open",
    "skipped",
    "unavailable",
];

function gateRead(value: unknown, endpoint: string): HappyAgentOnboardingGate | undefined {
    const gate = recordOf(value);
    const id = textOf(gate?.id);
    if (!gate || id === "") return undefined;
    // `off` gates are omitted by the server; anything else unrecognised is the stricter reading.
    const requirement = gate.requirement === "optional" ? "optional" : "required";
    const status = STATUSES.find((status) => status === gate.status) ?? "open";
    const common: HappyAgentOnboardingGateCommon = {
        id,
        scope: gate.scope === "member" ? "member" : "server",
        requirement,
        status,
        blocking:
            typeof gate.blocking === "boolean"
                ? gate.blocking
                : requirement === "required" && (status === "open" || status === "unavailable"),
        canComplete: gate.canComplete !== false,
    };
    const data = recordOf(gate.data) ?? {};
    switch (id) {
        case "profile":
        case "avatar":
        case "paymentMethod":
        case "payment":
            return { ...common, kind: id };
        case "adminBot": {
            const botId = textOf(data.botId);
            const avatar = recordOf(data.avatar);
            const thumbhash = textOf(avatar?.thumbhash) || textOf(avatar?.digest);
            return {
                ...common,
                kind: "adminBot",
                botId,
                name: textOf(data.name),
                avatarUrl:
                    botId !== "" && thumbhash !== ""
                        ? happyAgentImageUrl(
                              endpoint,
                              `/v0/bots/${encodeURIComponent(botId)}/avatar`,
                              thumbhash,
                          )
                        : null,
                title: textOf(data.title),
                description: textOf(data.description),
            };
        }
        case "inference":
            return {
                ...common,
                kind: "inference",
                connected: textsOf(data.connected),
                freeModel: data.freeModel === true,
            };
        case "plugins":
            return {
                ...common,
                kind: "plugins",
                required: textsOf(data.required),
                plugins: (Array.isArray(data.plugins) ? data.plugins : []).flatMap((entry) => {
                    const plugin = recordOf(entry);
                    const pluginId = textOf(plugin?.id);
                    return plugin && pluginId !== ""
                        ? [
                              {
                                  id: pluginId,
                                  name: textOf(plugin.name) || pluginId,
                                  required: plugin.required === true,
                                  active: plugin.active === true,
                              },
                          ]
                        : [];
                }),
            };
        case "teammates":
            return {
                ...common,
                kind: "teammates",
                invites: countOf(data.invites),
                members: countOf(data.members),
            };
        case "mobileApp":
            return {
                ...common,
                kind: "mobileApp",
                registered: data.registered === true,
                appStoreUrl: urlOf(data.appStoreUrl),
                playStoreUrl: urlOf(data.playStoreUrl),
            };
        default:
            return { ...common, kind: "unknown" };
    }
}

/**
 * The gates of `GET /v0/onboarding`, in the server's order, or `undefined`
 * from a server that has no gates (a Happy Agent, or a Happy Cloud server from
 * before them).
 */
export function happyAgentOnboardingGatesRead(
    onboarding: unknown,
    endpoint: string,
): readonly HappyAgentOnboardingGate[] | undefined {
    const gates = recordOf(onboarding)?.gates;
    if (!Array.isArray(gates)) return undefined;
    return gates.flatMap((gate) => {
        const read = gateRead(gate, endpoint);
        return read ? [read] : [];
    });
}

/**
 * Whether the flow puts this gate on screen: one the reader can act on that is
 * still open, or one that holds them back, which says why (waiting for an
 * admin, or an update) when they cannot act on it. An optional gate this
 * client does not know is passed over.
 */
export function happyAgentOnboardingGateShown(gate: HappyAgentOnboardingGate): boolean {
    if (gate.blocking) return true;
    if (gate.kind === "unknown") return false;
    return gate.canComplete && gate.status === "open";
}

/** What the reader can do about the gate on screen. */
export type HappyAgentOnboardingGateStance =
    /** Act on it. */
    | "act"
    /** It holds them back, and only someone else can complete it. */
    | "waitForAdmin"
    /** It holds them back, and only a newer client can show it. */
    | "update"
    /** The server cannot evaluate it yet. */
    | "unavailable";

export function happyAgentOnboardingGateStance(
    gate: HappyAgentOnboardingGate,
): HappyAgentOnboardingGateStance {
    if (gate.kind === "unknown") return "update";
    if (gate.status === "unavailable") return "unavailable";
    if (!gate.canComplete && gate.status !== "done") return "waitForAdmin";
    return "act";
}

/** The flow a reader walks through, derived from the server's gates and where they are. */
export interface HappyAgentOnboardingFlow {
    /** Every gate, in the server's order. */
    readonly gates: readonly HappyAgentOnboardingGate[];
    /** The gates the progress bar names: every one shown since this flow began, in order. */
    readonly sequence: readonly string[];
    /** The gate on screen, or `undefined` once nothing is left to show. */
    readonly current?: HappyAgentOnboardingGate;
    readonly stance?: HappyAgentOnboardingGateStance;
    /** Whether Continue may leave the current gate: it is done, or it is optional. */
    readonly continuable: boolean;
    /** The gate whose skip, rename or continue the server has not answered yet. */
    readonly pending?: string;
    /** Why the last action on the current gate was refused. */
    readonly error?: string;
}

/**
 * Where the flow stands. The gate on screen stays there after it turns done,
 * until the reader continues, so a step that finishes in the background still
 * says so before it goes.
 */
export function happyAgentOnboardingFlowDerive(input: {
    readonly gates: readonly HappyAgentOnboardingGate[];
    readonly pinned: string | undefined;
    readonly passed: ReadonlySet<string>;
    readonly sequence: readonly string[];
    readonly pending?: string;
    readonly error?: { readonly gate: string; readonly message: string };
}): HappyAgentOnboardingFlow {
    const { gates } = input;
    const pinned = gates.find((gate) => gate.id === input.pinned);
    const current =
        pinned ??
        gates.find((gate) => happyAgentOnboardingGateShown(gate) && !input.passed.has(gate.id)) ??
        // A gate that blocks is shown whether or not it was passed: the server
        // decides, and passing it here was only this client's guess.
        gates.find((gate) => gate.blocking);
    const known = new Set(gates.map((gate) => gate.id));
    const sequence = input.sequence.filter((id) => known.has(id));
    for (const gate of gates)
        if (happyAgentOnboardingGateShown(gate) && !sequence.includes(gate.id))
            sequence.push(gate.id);
    const order = new Map(gates.map((gate, index) => [gate.id, index]));
    sequence.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
    return {
        gates,
        sequence,
        ...(current
            ? {
                  current,
                  stance: happyAgentOnboardingGateStance(current),
                  continuable: !current.blocking,
              }
            : { continuable: false }),
        ...(input.pending === undefined ? {} : { pending: input.pending }),
        ...(input.error && input.error.gate === current?.id ? { error: input.error.message } : {}),
    };
}
