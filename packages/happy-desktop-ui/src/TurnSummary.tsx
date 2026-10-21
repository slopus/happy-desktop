import { useRef, useState, type CSSProperties } from "react";
import { partitionComponentProps } from "./componentProps";
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

export interface TurnSummaryProps {
    /** Final assistant text copied by the trailing action. */
    readonly copyText?: string;
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly durationMs?: number;
    /** Tokens consumed by this run. */
    readonly usedTokens?: number;
    /** Conversation context size measured when this run settled. */
    readonly finalContextTokens?: number;
    /**
     * Puts the request a stopped turn was given back in the composer, to be
     * revised and sent again. Offered only on a stopped turn; absent, the
     * footer reads as the outcome alone.
     */
    readonly onEdit?: () => void;
    readonly reason?: "completed" | "steering" | "compaction" | "abort" | "error";
    readonly status: "complete" | "failed" | "steered";
    readonly style?: CSSProperties;
}

/** Formats a final turn duration without allowing its units to split across lines. */
function durationFormat(durationMs: number): string {
    const total = Math.max(0, Math.floor(durationMs / 1_000));
    if (total < 60) return `${total}s`;
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes}m\u00a0${total % 60}s`;
    return `${Math.floor(minutes / 60)}h\u00a0${minutes % 60}m`;
}

const TOKENS = new Intl.NumberFormat("en-US");

/** Exact token detail kept behind the settled row rather than in its resting layout. */
function tokenDetail(usedTokens?: number, finalContextTokens?: number): string | undefined {
    const parts: string[] = [];
    if (usedTokens !== undefined && Number.isFinite(usedTokens))
        parts.push(`Used ${TOKENS.format(Math.max(0, Math.round(usedTokens)))} tokens`);
    if (finalContextTokens !== undefined && Number.isFinite(finalContextTokens))
        parts.push(
            `Final context ${TOKENS.format(Math.max(0, Math.round(finalContextTokens)))} tokens`,
        );
    return parts.length === 0 ? undefined : parts.join(" · ");
}

/**
 * Neutral settled footer for one turn: its duration, led by the final-message
 * copy action on a completed turn or the edit action on a stopped one.
 */
export function TurnSummary(props: TurnSummaryProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "copyText",
        "data-testid",
        "durationMs",
        "usedTokens",
        "finalContextTokens",
        "onEdit",
        "reason",
        "status",
        "style",
    ]);
    const [copied, setCopied] = useState(false);
    const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const reason = local.reason ?? (local.status === "steered" ? "steering" : undefined);
    const [verb, joiner] =
        reason === "steering"
            ? ["Steered", "after"]
            : reason === "compaction"
              ? ["Worked", "for"]
              : reason === "abort"
                ? ["Stopped", "after"]
                : reason === "error" || local.status === "failed"
                  ? ["Failed", "after"]
                  : ["Completed", "in"];
    const label =
        local.durationMs === undefined
            ? verb
            : `${verb} ${joiner}\u00a0${durationFormat(local.durationMs)}`;
    const detail = tokenDetail(local.usedTokens, local.finalContextTokens);
    const copy = async () => {
        try {
            if (local.copyText === undefined) return;
            await navigator.clipboard.writeText(local.copyText);
            setCopied(true);
            if (copiedTimer.current !== undefined) clearTimeout(copiedTimer.current);
            copiedTimer.current = setTimeout(() => {
                copiedTimer.current = undefined;
                setCopied(false);
            }, 1_600);
        } catch {
            // The browser owns clipboard permission; keep the copy affordance retryable.
        }
    };
    return (
        <div
            className={["happy-turn-summary", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="turn-summary"
            data-status={local.status}
            data-testid={local["data-testid"]}
            style={local.style}
        >
            {local.status === "complete" && local.copyText !== undefined ? (
                <button
                    aria-label={copied ? "Final message copied" : "Copy final message"}
                    className="happy-turn-summary__copy"
                    data-copied={copied ? "" : undefined}
                    data-happy-desktop-ui="turn-summary-copy"
                    onClick={() => void copy()}
                    type="button"
                >
                    <Icon name={copied ? "check" : "copy"} size={16} />
                </button>
            ) : null}
            {reason === "abort" && local.onEdit !== undefined ? (
                <Tooltip label="Edit message" placement="top">
                    <button
                        aria-label="Edit message"
                        className="happy-turn-summary__edit"
                        data-happy-desktop-ui="turn-summary-edit"
                        onClick={() => local.onEdit?.()}
                        type="button"
                    >
                        <Icon name="edit" size={16} />
                    </button>
                </Tooltip>
            ) : null}
            <Tooltip className="happy-turn-summary__detail" label={detail} placement="top">
                <span
                    className="happy-turn-summary__label"
                    data-happy-desktop-ui="turn-summary-label"
                >
                    {label}
                </span>
            </Tooltip>
        </div>
    );
}
