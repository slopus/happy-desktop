import { HappyAgentApiError } from "@slopus/happy-agent-client";
import { UserError } from "../types.js";
import type {
    HappyAgentAvatarImage,
    HappyAgentPermissionMode,
    HappyAgentThinkingLevel,
} from "./happyAgentTypes.js";

/** Normalizes any thrown transport value into a displayable `UserError`. */
export function happyAgentUserError(error: unknown): UserError {
    if (error instanceof UserError) return error;
    if (error instanceof Error) return new UserError(error.message, undefined, error);
    return new UserError(String(error), undefined, error);
}

/**
 * Why an action did not complete, as a closed kind rather than its words: the
 * daemon answered and refused, the request never reached it, or anything else.
 */
export type HappyAgentActionFailure = "refused" | "offline" | "unknown";

/** How one reader-initiated action ended. */
export type HappyAgentActionResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly failure: HappyAgentActionFailure };

export const HAPPY_AGENT_ACTION_OK: HappyAgentActionResult = { ok: true };

/**
 * Classifies a thrown value by walking its cause chain. A daemon refusal is
 * the client's typed error; a request the browser could not deliver at all
 * surfaces from `fetch` as a `TypeError`, which is the platform's own contract.
 */
export function happyAgentActionFailed(error: unknown): HappyAgentActionResult {
    for (let current = error; current instanceof Error; current = current.cause) {
        if (current instanceof HappyAgentApiError) return { ok: false, failure: "refused" };
        if (current instanceof TypeError) return { ok: false, failure: "offline" };
    }
    return { ok: false, failure: "unknown" };
}

/**
 * Returns `next` but reuses each element reference from `previous` when it is
 * deep-equal, so unchanged rows keep their identity across reconciles and the
 * UI can skip re-rendering them. Falls back to `next` unchanged when the whole
 * array is deep-equal.
 */
export function referencesPreserve<T>(previous: readonly T[], next: readonly T[]): readonly T[] {
    if (previous === next) return previous;
    let changed = previous.length !== next.length;
    const merged: T[] = Array.from({ length: next.length });
    for (let index = 0; index < next.length; index++) {
        const before = previous[index];
        const after = next[index]!;
        if (before !== undefined && deepEqual(before, after)) {
            merged[index] = before;
        } else {
            merged[index] = after;
            changed = true;
        }
    }
    return changed ? merged : previous;
}

/** Structural equality for the closed, serialization-safe projection trees. */
export function deepEqual(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
        return false;
    }
    if (
        left instanceof Error &&
        right instanceof Error &&
        (left.name !== right.name || left.message !== right.message)
    )
        return false;
    const leftArray = Array.isArray(left);
    const rightArray = Array.isArray(right);
    if (leftArray !== rightArray) return false;
    if (leftArray && rightArray) {
        if (left.length !== right.length) return false;
        for (let index = 0; index < left.length; index++) {
            if (!deepEqual(left[index], right[index])) return false;
        }
        return true;
    }
    const leftKeys = Object.keys(left as Record<string, unknown>);
    const rightKeys = Object.keys(right as Record<string, unknown>);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
        if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
        if (
            !deepEqual(
                (left as Record<string, unknown>)[key],
                (right as Record<string, unknown>)[key],
            )
        ) {
            return false;
        }
    }
    return true;
}

const THINKING_LABELS: Record<HappyAgentThinkingLevel, string> = {
    off: "Off",
    on: "On",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra High",
    max: "Maximum",
    ultra: "Ultra",
};

export function happyAgentThinkingLabel(level: HappyAgentThinkingLevel): string {
    return THINKING_LABELS[level];
}

const PERMISSION_LABELS: Record<HappyAgentPermissionMode, string> = {
    auto: "Auto",
    workspace_write: "Workspace write",
    read_only: "Read only",
    full_access: "Full access",
};

export function happyAgentPermissionLabel(mode: HappyAgentPermissionMode): string {
    return PERMISSION_LABELS[mode];
}

/** Display names for the provider types the daemon configures. */
const SERVICE_NAMES: Readonly<Record<string, string>> = {
    anthropic: "Anthropic",
    bedrock: "Amazon Bedrock",
    claude: "Claude",
    "claude-code": "Claude Code",
    claude_code: "Claude Code",
    codex: "Codex",
    grok: "Grok",
    openai: "OpenAI",
    openai_compatible: "OpenAI-compatible",
    "openai-compatible": "OpenAI-compatible",
    xai: "xAI",
};

/**
 * The service a provider type names, as the model picker labels it. A type
 * without a known display name is shown as the configured key, titled.
 */
export function happyAgentServiceName(type: string): string {
    return (
        SERVICE_NAMES[type] ??
        type
            .split(/[_-]/)
            .filter(Boolean)
            .map((part) => part[0]!.toUpperCase() + part.slice(1))
            .join(" ")
    );
}

/**
 * Bytes per base64 chunk. Divisibility by three means each chunk can be encoded
 * independently without padding in the middle of the joined result.
 */
const BASE64_CHUNK = 0x6000;

/**
 * A picture being sent to the host, as a URL this client can already draw. It
 * is what an optimistic row shows while the upload is in flight: the bytes are
 * in hand, so the face need not wait for the host to serve them back.
 */
export function happyAgentAvatarImageDataUrl(image: HappyAgentAvatarImage): string {
    const bytes = new Uint8Array(image.data);
    const encoded: string[] = [];
    for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
        encoded.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK))));
    }
    return `data:${image.contentType};base64,${encoded.join("")}`;
}
