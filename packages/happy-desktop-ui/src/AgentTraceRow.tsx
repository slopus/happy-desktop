import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
import { agentTraceMetaStats, agentTraceMetaTitle } from "./agentTraceMeta";
export type AgentTraceRowKind =
    | "reasoning"
    | "response"
    | "tool"
    | "subagent"
    | "terminal"
    | "status";
export type AgentTraceRowStatus = "running" | "complete" | "failed";
export interface AgentTraceRowProps {
    readonly className?: string;
    readonly "data-testid"?: string;
    readonly style?: CSSProperties;
    readonly status: AgentTraceRowStatus;
    /** Latest meaningful activity while running. */
    readonly kind?: AgentTraceRowKind;
    readonly title?: string;
    readonly detail?: string;
    readonly entryCount: number;
    /** Tool invocations when known (shown beside “View traces” in the message meta row). */
    readonly toolCallCount?: number;
    /** Turn token total when the producer reports it. */
    readonly totalTokens?: number;
    /** The trace panel is currently showing this turn. */
    readonly open?: boolean;
    readonly onOpen?: () => void;
    /**
     * Clicking closes the trace again rather than opening a panel, so an open row
     * offers to hide it. Owners that only ever open a panel leave this off.
     */
    readonly toggles?: boolean;
    /** Accessible name, default "Agent activity". */
    readonly label?: string;
    /** A compact metadata link placed beside an assistant name. */
    readonly variant?: "meta" | "row";
}
const KIND_ICONS: Record<AgentTraceRowKind, IconName> = {
    reasoning: "spark",
    response: "check-circle",
    tool: "terminal",
    subagent: "branch",
    terminal: "terminal",
    status: "check-circle",
};
/** Existing Icon glyph for a trace activity kind (shared with AgentTracePanel). */
export function agentTraceKindIcon(kind: AgentTraceRowKind): IconName {
    return KIND_ICONS[kind];
}

/**
 * C-067 AgentTraceRow — a compact, single-line 28px button row rendered inside
 * an assistant message. While the turn runs it shows only the latest activity:
 * a static accent dot (no animation), the kind glyph, a title, and mono detail
 * when that detail is not already visible elsewhere — no counter churn. Once
 * the turn completes or fails it reads as a "View traces" link row with the
 * step count — "Hide traces" while open, when the owner made it a toggle.
 * Clicking fires `onOpen`; `aria-expanded` reflects whether the trace is
 * currently shown. Props only — no local state, timers,
 * or animation.
 */
export function AgentTraceRow(props: AgentTraceRowProps) {
    const [local] = partitionComponentProps(props, [
        "className",
        "data-testid",
        "style",
        "status",
        "kind",
        "title",
        "detail",
        "entryCount",
        "toolCallCount",
        "totalTokens",
        "open",
        "onOpen",
        "toggles",
        "label",
        "variant",
    ]);
    const running = () => local.status === "running";
    const meta = () => local.variant === "meta";
    const stats = () => agentTraceMetaStats(local.toolCallCount, local.totalTokens);
    const linkLabel = () => agentTraceMetaTitle(local.toggles && local.open);
    return (
        <button
            aria-expanded={local.open === true ? "true" : "false"}
            aria-label={
                local.label ??
                (meta() && stats()
                    ? `${linkLabel()}, ${stats()}`
                    : meta()
                      ? linkLabel()
                      : "Agent activity")
            }
            className={["happy-agent-trace-row", local.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="agent-trace-row"
            data-status={local.status}
            data-variant={meta() ? "meta" : "row"}
            data-testid={local["data-testid"]}
            onClick={() => local.onOpen?.()}
            style={local.style}
            type="button"
        >
            <span
                aria-hidden="true"
                className="happy-agent-trace-row__dot"
                data-happy-desktop-ui="agent-trace-row-dot"
            />
            {!meta() && running() && local.kind !== undefined
                ? ((kind) => (
                      <span
                          aria-hidden="true"
                          className="happy-agent-trace-row__icon"
                          data-happy-desktop-ui="agent-trace-row-icon"
                      >
                          <Icon name={agentTraceKindIcon(kind)} size={14} />
                      </span>
                  ))(local.kind)
                : null}
            <span
                className="happy-agent-trace-row__title"
                data-happy-desktop-ui="agent-trace-row-title"
            >
                <span data-happy-desktop-ui="agent-trace-row-title-label">
                    {meta() ? linkLabel() : running() ? (local.title ?? "Working") : linkLabel()}
                </span>
            </span>
            {meta() && stats() ? (
                <>
                    <span
                        aria-hidden="true"
                        className="happy-agent-trace-row__meta-separator"
                        data-happy-desktop-ui="agent-trace-row-meta-separator"
                    />
                    <span
                        className="happy-agent-trace-row__meta-stats"
                        data-happy-desktop-ui="agent-trace-row-meta-stats"
                    >
                        <span data-happy-desktop-ui="agent-trace-row-meta-stats-label">
                            {stats()}
                        </span>
                    </span>
                </>
            ) : null}
            {!meta() && running() && local.detail !== undefined ? (
                <span
                    className="happy-agent-trace-row__detail"
                    data-happy-desktop-ui="agent-trace-row-detail"
                >
                    {local.detail}
                </span>
            ) : null}
            {!meta() && !running() ? (
                <span
                    className="happy-agent-trace-row__count"
                    data-happy-desktop-ui="agent-trace-row-count"
                >
                    {`${local.entryCount} steps`}
                </span>
            ) : null}
        </button>
    );
}
