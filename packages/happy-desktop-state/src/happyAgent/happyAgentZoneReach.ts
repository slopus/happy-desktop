import type { UserError } from "../types.js";
import { happyAgentImageUrl } from "../utils/happyAgentImageUrl.js";

/** One tool of a plugin installation a zone lists. */
export interface HappyAgentZoneTool {
    /** The tool's own name, without the installation's prefix. */
    readonly name: string;
    readonly description: string;
    /** Whether agents in this zone may use it. A tool starts disabled in every zone. */
    readonly enabled: boolean | null;
    /** How many policies this zone has on this one tool. */
    readonly policyCount: number;
}

/** A plugin installation's picture, addressed by its content. */
export interface HappyAgentZonePluginImage {
    readonly url: string;
}

/** A plugin installation of the team, as a zone lists it or may add it. */
export interface HappyAgentZoneInstallation {
    readonly id: string;
    /** The plugin's ID, such as `stripe`. */
    readonly pluginId: string;
    /** The plugin's name, or its ID where the server didn't name it. */
    readonly name: string;
    /** What the team called this installation, where it has more than one. */
    readonly label: string | null;
    readonly image: HappyAgentZonePluginImage | null;
    /** Whether it is set up; one that is `not_configured` gives agents nothing yet. */
    readonly active: boolean;
}

/** An installation a zone lists, with its tools. */
export interface HappyAgentZonePlugin extends HappyAgentZoneInstallation {
    /** How many policies this zone has on the whole installation. */
    readonly policyCount: number;
    /**
     * Listed from before per-zone tools: the zone enables every tool the
     * installation has or gets. Changing any tool sends the explicit set, and
     * the zone enables only those from then on.
     */
    readonly allTools: boolean;
    /** Why the plugin couldn't list its tools just now; the tools shown are the ones last stored. */
    readonly toolsError: string | null;
    readonly tools: readonly HappyAgentZoneTool[];
}

/** What a policy belongs to: a whole installation in the zone, or one of its tools. */
export type HappyAgentZonePolicyTarget =
    | { readonly kind: "plugin"; readonly installationId: string }
    | { readonly kind: "tool"; readonly installationId: string; readonly tool: string };

/** One of a zone's policies on a plugin or a tool (docs/policies.md §1). */
export interface HappyAgentZonePolicy {
    readonly id: string;
    readonly target: HappyAgentZonePolicyTarget;
    readonly description: string;
    /** The Python program. */
    readonly code: string;
    /** A disabled policy is kept but never runs. */
    readonly enabled: boolean;
    /** What a change sends back as `If-Match`. */
    readonly version: string;
}

/**
 * What a zone may reach, as `GET v0/zones/{id}` answers: the installations
 * it lists, each as `GET v0/plugins/installations` lists it plus its tools,
 * and the policies on them. A server from before phase 2 has no such route,
 * and the page leaves both out.
 */
export type HappyAgentZoneReach =
    | { readonly kind: "reading" }
    | { readonly kind: "unavailable" }
    | {
          readonly kind: "ready";
          readonly plugins: readonly HappyAgentZonePlugin[];
          /**
           * The policies on the zone's plugins and tools; `null` where the
           * server has no policies yet, and the page says nothing about them.
           */
          readonly policies: readonly HappyAgentZonePolicy[] | null;
          /** Every installation of the team, for adding one to the zone. */
          readonly installations: readonly HappyAgentZoneInstallation[];
      };

/** What a policy test reports (docs/policies.md §7); nothing is saved. */
export interface HappyAgentZonePolicyTestResult {
    /** `error`: it doesn't type-check, failed, or hit a limit. */
    readonly verdict: "allow" | "deny" | "error";
    /** The denial's message, or for an error what a user would see. */
    readonly message: string | null;
    /** The type checker's findings, one per line, for code that doesn't type-check. */
    readonly diagnostics: readonly string[];
    /** What the code printed, up to 8 KiB. */
    readonly output: string;
    readonly traceback: string | null;
    readonly durationMs: number;
}

/** A policy's own sub-page: the policy being written, and its test. */
export interface HappyAgentZonePolicyPage {
    /** The policy on the page; absent while a new one is being written. */
    readonly policyId?: string;
    readonly target: HappyAgentZonePolicyTarget;
    readonly description: string;
    readonly code: string;
    readonly enabled: boolean;
    /** Whether the reader changed it since the page opened or last saved. */
    readonly edited: boolean;
    readonly saving: boolean;
    readonly deleting: boolean;
    /** Why the last save or deletion did not go through. */
    readonly error?: UserError;
    /** The type checker's findings on the last save, one per line. */
    readonly diagnostics: readonly string[];
    /** The test's input as JSON text: `user`, `agent`, `action` and `request`. */
    readonly sample: string;
    /** Whether the test pins the clock, and to what RFC 3339 instant. */
    readonly clockPinned: boolean;
    readonly clock: string;
    readonly testing: boolean;
    readonly test?: HappyAgentZonePolicyTestResult;
    /** Why the test could not run, such as input that isn't JSON. */
    readonly testError?: UserError;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function listOf(value: unknown): readonly unknown[] {
    return Array.isArray(value) ? value : [];
}

function textOrNull(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function countOf(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** A target as the API names it: `plugin:{installation}` or `tool:{installation}/{tool}`. */
export function happyAgentZonePolicyTargetKey(target: HappyAgentZonePolicyTarget): string {
    return target.kind === "plugin"
        ? `plugin:${target.installationId}`
        : `tool:${target.installationId}/${target.tool}`;
}

/** The target an API key names, or nothing for one this client can't read. */
export function happyAgentZonePolicyTargetRead(
    value: unknown,
): HappyAgentZonePolicyTarget | undefined {
    if (typeof value === "string") {
        const plugin = /^plugin:(.+)$/u.exec(value);
        if (plugin?.[1]) return { kind: "plugin", installationId: plugin[1] };
        const tool = /^tool:([^/]+)\/(.+)$/u.exec(value);
        if (tool?.[1] && tool[2]) return { kind: "tool", installationId: tool[1], tool: tool[2] };
        return undefined;
    }
    const entry = recordOf(value);
    const installationId = textOrNull(entry?.installationId ?? entry?.installation);
    if (!entry || installationId === null) return undefined;
    const tool = textOrNull(entry.tool);
    return tool === null
        ? { kind: "plugin", installationId }
        : { kind: "tool", installationId, tool };
}

export function happyAgentZonePolicyTargetSame(
    left: HappyAgentZonePolicyTarget,
    right: HappyAgentZonePolicyTarget,
): boolean {
    return happyAgentZonePolicyTargetKey(left) === happyAgentZonePolicyTargetKey(right);
}

export function happyAgentZoneInstallationRead(
    endpoint: string,
    value: unknown,
): HappyAgentZoneInstallation | undefined {
    const entry = recordOf(value);
    const id = textOrNull(entry?.id);
    const pluginId = textOrNull(entry?.plugin);
    if (!entry || id === null || pluginId === null) return undefined;
    const image = recordOf(entry.image);
    const digest = textOrNull(image?.digest);
    return {
        id,
        pluginId,
        name: textOrNull(entry.pluginName) ?? pluginId,
        label: textOrNull(entry.label),
        active: entry.status === "active",
        image:
            digest === null
                ? null
                : {
                      url: happyAgentImageUrl(
                          endpoint,
                          `/v0/plugins/images/${encodeURIComponent(digest)}`,
                          textOrNull(image?.thumbhash) ?? digest,
                      ),
                  },
    };
}

export function happyAgentZonePluginRead(
    endpoint: string,
    value: unknown,
): HappyAgentZonePlugin | undefined {
    const installation = happyAgentZoneInstallationRead(endpoint, value);
    const entry = recordOf(value);
    if (!installation || !entry) return undefined;
    return {
        ...installation,
        policyCount: countOf(entry.policyCount),
        allTools: entry.allTools === true,
        toolsError: textOrNull(entry.toolsError),
        tools: listOf(entry.tools).flatMap((item) => {
            const tool = recordOf(item);
            const name = textOrNull(tool?.name);
            if (!tool || name === null) return [];
            return [
                {
                    name,
                    description: typeof tool.description === "string" ? tool.description : "",
                    enabled:
                        entry.allTools === true ||
                        (typeof tool.enabled === "boolean" ? tool.enabled : null),
                    policyCount: countOf(tool.policyCount),
                },
            ];
        }),
    };
}

export function happyAgentZonePolicyRead(value: unknown): HappyAgentZonePolicy | undefined {
    const entry = recordOf(value);
    const id = textOrNull(entry?.id);
    const target = happyAgentZonePolicyTargetRead(entry?.target);
    if (!entry || id === null || !target || typeof entry.code !== "string") return undefined;
    return {
        id,
        target,
        description: typeof entry.description === "string" ? entry.description : "",
        code: entry.code,
        enabled: entry.enabled !== false,
        version: typeof entry.version === "string" ? entry.version : "",
    };
}

/** Diagnostics as the cluster sends them: a list of lines, or one text. */
export function happyAgentZoneDiagnosticsRead(value: unknown): readonly string[] {
    if (typeof value === "string") return value.split("\n").filter((line) => line.trim() !== "");
    return listOf(value).flatMap((line) => (typeof line === "string" ? [line] : []));
}

/** A test's answer, or nothing for one without a verdict this client knows. */
export function happyAgentZonePolicyTestRead(
    value: unknown,
): HappyAgentZonePolicyTestResult | undefined {
    const entry = recordOf(value);
    const verdictEntry = recordOf(entry?.verdict);
    const verdict = textOrNull(verdictEntry?.kind ?? entry?.verdict);
    if (!entry || (verdict !== "allow" && verdict !== "deny" && verdict !== "error"))
        return undefined;
    return {
        verdict,
        message: textOrNull(verdictEntry?.message ?? entry.message),
        diagnostics: happyAgentZoneDiagnosticsRead(verdictEntry?.diagnostics ?? entry.diagnostics),
        output: typeof entry.output === "string" ? entry.output : "",
        traceback: textOrNull(entry.traceback),
        durationMs: countOf(entry.durationMs),
    };
}

/** A new policy's first draft, which allows everything until it is written. */
export const HAPPY_AGENT_ZONE_POLICY_CODE_START = `# Deny by ending in a message, or with an assert:
# assert request.arguments.get("amount", 0) < 100000, "Refunds over $1,000 need a person."
`;

/**
 * A sample input for a target's test (docs/policies.md §7), which the cluster
 * fills in with the zone's real target: a member's agent calling the tool,
 * or the plugin's first tool.
 */
export function happyAgentZonePolicySample(
    target: HappyAgentZonePolicyTarget,
    plugins: readonly HappyAgentZonePlugin[],
): string {
    const plugin = plugins.find((entry) => entry.id === target.installationId);
    const tool = target.kind === "tool" ? target.tool : (plugin?.tools[0]?.name ?? "");
    return JSON.stringify(
        {
            user: { id: "u_1", roles: ["member"], permissions: [] },
            agent: { id: "a_1", kind: "task", mode: "auto" },
            action: "call",
            request: { tool, arguments: {} },
        },
        null,
        2,
    );
}
