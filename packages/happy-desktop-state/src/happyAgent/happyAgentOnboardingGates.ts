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

/** Where a computer on the computer gate stands; a revoked one is left out. */
export type HappyAgentOnboardingComputerStatus = "enrolling" | "online" | "offline" | "draining";

/** A computer the reader's agents could use: one of their own, or one of the team's. */
export interface HappyAgentOnboardingComputer {
    readonly id: string;
    readonly name: string;
    readonly access: "private" | "shared";
    readonly status: HappyAgentOnboardingComputerStatus;
    /** `macos`, `linux` or `windows`, as the computer reported it; null before it did. */
    readonly os: string | null;
    /** False where the server cannot run agents' work, as on Windows. */
    readonly runsWork: boolean;
}

/** One step of a Happy Cloud server's onboarding, as the server decides it. */
export type HappyAgentOnboardingGate = HappyAgentOnboardingGateCommon &
    (
        | { readonly kind: "profile" }
        | { readonly kind: "avatar" }
        | {
              readonly kind: "adminBot";
              readonly botId: string;
              /** The bot's version, sent as `If-Match` when renaming it. */
              readonly version: string;
              readonly name: string;
              readonly avatarUrl: string | null;
              /** The server's own words for this step. */
              readonly title: string;
              readonly description: string;
              /** What the bot can do for the team, a line each; empty when the server sends none. */
              readonly points: readonly string[];
              /** Who may talk to it; empty when the server sends none. */
              readonly note: string;
              /**
               * Whether this reader may talk to it, which decides where they go
               * after the last step; absent from a server that does not say.
               */
              readonly canTalk: boolean | undefined;
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
        | {
              readonly kind: "computer";
              /** One of the reader's own computers is online and runs work. */
              readonly own: boolean;
              /** One of the team's shared computers is online and runs work. */
              readonly shared: boolean;
              /** The reader's own computers and the team's shared ones. */
              readonly computers: readonly HappyAgentOnboardingComputer[];
              /**
               * Whether the reader is an owner, who has nobody to ask; absent
               * from a server that does not say.
               */
              readonly owner: boolean | undefined;
          }
        | { readonly kind: "teammates"; readonly invited: boolean; readonly members: number }
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

const COMPUTER_STATUSES: readonly HappyAgentOnboardingComputerStatus[] = [
    "enrolling",
    "online",
    "offline",
    "draining",
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
                version: textOf(data.version),
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
                points: textsOf(data.points),
                note: textOf(data.note),
                canTalk: typeof data.canTalk === "boolean" ? data.canTalk : undefined,
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
        case "computer":
            return {
                ...common,
                kind: "computer",
                own: data.own === true,
                shared: data.shared === true,
                computers: (Array.isArray(data.computers) ? data.computers : []).flatMap(
                    (entry) => {
                        const computer = recordOf(entry);
                        const computerId = textOf(computer?.id);
                        const status = COMPUTER_STATUSES.find(
                            (value) => value === computer?.status,
                        );
                        if (!computer || computerId === "" || !status) return [];
                        return [
                            {
                                id: computerId,
                                name: textOf(computer.name) || computerId.slice(0, 8),
                                access: computer.access === "shared" ? "shared" : "private",
                                status,
                                os: textOf(computer.os) || null,
                                runsWork: computer.runsWork !== false,
                            } satisfies HappyAgentOnboardingComputer,
                        ];
                    },
                ),
                owner: typeof data.owner === "boolean" ? data.owner : undefined,
            };
        case "teammates":
            return {
                ...common,
                kind: "teammates",
                invited: data.invited === true,
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
 * What `GET /v0/onboarding` says around its gates: whether nothing is left for
 * the reader, absent from a server that predates `finished`, and the owners a
 * member waits on.
 */
export function happyAgentOnboardingSummaryRead(onboarding: unknown): {
    readonly finished: boolean | undefined;
    readonly owners: readonly string[];
} {
    const body = recordOf(onboarding);
    return {
        finished: typeof body?.finished === "boolean" ? body.finished : undefined,
        owners: (Array.isArray(body?.owners) ? body.owners : []).flatMap((owner) => {
            const name = textOf(recordOf(owner)?.name).trim();
            return name ? [name] : [];
        }),
    };
}

/**
 * Whether the reader can stand on this gate: a step of the flow, which the
 * progress bar names and Back returns to whether or not it is finished. A gate
 * that holds them back always is one. Otherwise it is one they can act on and
 * the server can evaluate; an optional gate this client does not know is not.
 */
export function happyAgentOnboardingGateStop(gate: HappyAgentOnboardingGate): boolean {
    if (gate.blocking) return true;
    if (gate.kind === "unknown") return false;
    // An optional photo is asked for on the profile page. Only a required one
    // is a page of its own, for a reader who has a name and no photo.
    if (gate.kind === "avatar" && gate.requirement === "optional") return false;
    return gate.canComplete && gate.status !== "unavailable";
}

/**
 * Whether the flow puts this step in front of the reader on its own: it holds
 * them back, which says why (waiting for an admin, or an update) when they
 * cannot act on it, or it is still open.
 */
export function happyAgentOnboardingGateShown(gate: HappyAgentOnboardingGate): boolean {
    return happyAgentOnboardingGateStop(gate) && (gate.blocking || gate.status === "open");
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
    /**
     * The steps the progress bar names, in the server's order: every gate the
     * reader can stand on, finished or not, so the list is the same after a
     * restart as before it.
     */
    readonly sequence: readonly string[];
    /** The gate on screen, or `undefined` once nothing is left to show. */
    readonly current?: HappyAgentOnboardingGate;
    /** The step Back returns to: the one before the gate on screen. Absent on the first. */
    readonly previous?: string;
    /** A required step is still open, so the server refuses work until it is done. */
    readonly blocked: boolean;
    /** How many steps still ask something of the reader. */
    readonly remaining: number;
    /**
     * The reader left setup to finish later, on this run of the app (`now`) or
     * an earlier one. Steps are still left: what shows in their place is the
     * caller's, by `blocked`. Absent while they are in setup.
     */
    readonly away?: "now" | "earlier";
    readonly stance?: HappyAgentOnboardingGateStance;
    /** The owners' names, for a reader waiting on one of them. */
    readonly owners: readonly string[];
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
    /** The server's `finished`; absent from one that predates it, where the gates decide. */
    readonly finished?: boolean;
    readonly owners?: readonly string[];
    readonly pinned: string | undefined;
    readonly passed: ReadonlySet<string>;
    /** The reader left setup for later, and when. */
    readonly away?: "now" | "earlier";
    readonly pending?: string;
    readonly error?: { readonly gate: string; readonly message: string };
}): HappyAgentOnboardingFlow {
    const { gates } = input;
    const pinned = gates.find((gate) => gate.id === input.pinned);
    // A server that says nothing is left shows nothing new; the gate on
    // screen still stays until the reader leaves it.
    const current =
        pinned ??
        (input.finished === true
            ? undefined
            : (gates.find(
                  (gate) => happyAgentOnboardingGateShown(gate) && !input.passed.has(gate.id),
              ) ??
              // A gate that blocks is shown whether or not it was passed: the server
              // decides, and passing it here was only this client's guess.
              gates.find((gate) => gate.blocking)));
    // The gate on screen is always a step, even one the server stopped offering under it.
    const sequence = gates
        .filter((gate) => happyAgentOnboardingGateStop(gate) || gate.id === current?.id)
        .map((gate) => gate.id);
    const previous = current ? sequence[sequence.indexOf(current.id) - 1] : undefined;
    return {
        gates,
        sequence,
        owners: input.owners ?? [],
        blocked: gates.some((gate) => gate.blocking),
        remaining: gates.filter(happyAgentOnboardingGateShown).length,
        ...(current
            ? {
                  current,
                  stance: happyAgentOnboardingGateStance(current),
                  continuable: !current.blocking,
              }
            : { continuable: false }),
        ...(previous === undefined ? {} : { previous }),
        ...(input.away && current ? { away: input.away } : {}),
        ...(input.pending === undefined ? {} : { pending: input.pending }),
        ...(input.error && input.error.gate === current?.id ? { error: input.error.message } : {}),
    };
}
