import type { CSSProperties, ReactNode } from "react";
import type { HappyAgentSurfaceReferenceKind } from "happy-desktop-state";
import { EmptyState } from "../../EmptyState";
import {
    HappyAgentSurfaceHeader,
    type HappyAgentSurfaceChatToggle,
} from "./HappyAgentSurfaceHeader";
import { surfaceTypeIcon, type HappyAgentSurfaceView } from "./surfacePresentation";

/** What a reference Surface's page can say about what it points at. */
export type HappyAgentSurfaceReferenceView =
    /** Not resolved for this reader yet; it will be in a moment. */
    | { readonly phase: "resolving" }
    | {
          readonly phase: "available";
          readonly kind: HappyAgentSurfaceReferenceKind;
          /** The target's own, current name. */
          readonly name: string;
          /** A task the reader is not in is joined before it can be opened. */
          readonly action: "open" | "join";
      }
    | { readonly phase: "unavailable"; readonly kind: HappyAgentSurfaceReferenceKind };

export interface HappyAgentSurfaceReferencePageProps {
    /** Who else is looking at the Surface, for its header; see `HappyAgentSurfaceHeader`. */
    viewers?: ReactNode;
    surface: HappyAgentSurfaceView;
    reference: HappyAgentSurfaceReferenceView;
    /** Opens the target where it always opens, or joins the task first. */
    onOpen: () => void;
    /** The Surface's shared chat, toggled from the header. */
    chat?: HappyAgentSurfaceChatToggle;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

const OPEN_LABELS = {
    artifact: "Open artifact",
    bot: "Open chat",
    task: "Open chat",
} as const satisfies Record<HappyAgentSurfaceReferenceKind, string>;

const GONE = {
    artifact: "It was deleted, or you can’t see it. It stays here in case it comes back.",
    bot: "It was archived, or you can’t see it. It stays here in case it comes back.",
    task: "It was archived, or you can’t see it. It stays here in case it comes back.",
} as const satisfies Record<HappyAgentSurfaceReferenceKind, string>;

/**
 * HappyAgentSurfaceReferencePage — an artifact, bot, or task kept among the
 * Surfaces, when opening its row did not go straight to it: it has not been
 * resolved yet, it is a task the reader is not in, or it is no longer there
 * for them. Opening an available one goes where it always opens — the
 * artifact viewer, or the bot's or task's own chat — so this page never
 * stands in for that.
 *
 * A target that is gone is said quietly, not as a failure: the Surface keeps
 * its place and its name, and comes back to life if the target does.
 */
export function HappyAgentSurfaceReferencePage(props: HappyAgentSurfaceReferencePageProps) {
    const reference = props.reference;
    const body = () => {
        switch (reference.phase) {
            case "resolving":
                return null;
            case "available":
                return (
                    <EmptyState
                        action={{
                            label:
                                reference.action === "join"
                                    ? "Join task"
                                    : OPEN_LABELS[reference.kind],
                            onClick: props.onOpen,
                        }}
                        {...(reference.action === "join"
                            ? {
                                  description:
                                      "You’re not in this task yet. Joining puts it in your Tasks and opens its chat.",
                              }
                            : {})}
                        icon={surfaceTypeIcon({ kind: reference.kind })}
                        size="panel"
                        title={reference.name}
                    />
                );
            case "unavailable":
                return (
                    <EmptyState
                        description={GONE[reference.kind]}
                        icon={surfaceTypeIcon({ kind: reference.kind })}
                        size="panel"
                        title={`${props.surface.name} isn’t available`}
                    />
                );
        }
    };
    return (
        <div
            className={["happy-agent-surface-reference", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-surface-reference"
            data-phase={reference.phase}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <HappyAgentSurfaceHeader
                viewers={props.viewers}
                {...(props.chat ? { chat: props.chat } : {})}
                surface={props.surface}
            />
            <div className="happy-agent-surface-reference__body">{body()}</div>
        </div>
    );
}
