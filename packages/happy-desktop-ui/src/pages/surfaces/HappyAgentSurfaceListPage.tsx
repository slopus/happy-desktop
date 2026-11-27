import type { CSSProperties } from "react";
import type { HappyAgentSurfaceSection, HappyAgentSurfaceType } from "happy-desktop-state";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import type { IconName } from "../../Icon";
import { ScrollArea } from "../../Scrollbar";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import { SurfaceAvatar, type HappyAgentSurfacePicture } from "./surfacePresentation";

/** One Surface as its section's list shows it. */
export interface HappyAgentSurfaceListItem {
    readonly id: string;
    readonly name: string;
    readonly type: HappyAgentSurfaceType;
    readonly image?: HappyAgentSurfacePicture;
    /** How many todos a list holds open, once counted; absent for a document. */
    readonly count?: number;
}

export interface HappyAgentSurfaceListPageProps {
    section: HappyAgentSurfaceSection;
    /** The section's Surfaces, in the order they are listed. */
    items: readonly HappyAgentSurfaceListItem[];
    /** The catalog has not been read yet, so an empty list means nothing yet. */
    loading?: boolean;
    onOpen: (id: string) => void;
    /** Opens the form that makes a new one; absent where none can be made. */
    onCreate?: () => void;
    /** Why nothing can be made right now, such as the Happy Agent being away. */
    createDisabledReason?: string;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/** Each section's title, the words for its Surfaces, and its glyph. */
const SECTIONS: Record<
    HappyAgentSurfaceSection,
    {
        title: string;
        one: string;
        many: string;
        create: string;
        empty: string;
        description: string;
        icon: IconName;
    }
> = {
    documents: {
        title: "Documents",
        one: "document",
        many: "documents",
        create: "New document",
        empty: "No documents yet",
        description: "Documents written here, by people or agents, are listed here.",
        icon: "doc",
    },
    todos: {
        title: "TODOs",
        one: "todo list",
        many: "todo lists",
        create: "New todo list",
        empty: "No todo lists yet",
        description: "Todo lists made here, by people or agents, are listed here.",
        icon: "tasks",
    },
};

/**
 * HappyAgentSurfaceListPage — every document, or every todo list, on one
 * Happy Agent, under the section's header with the action that makes a new
 * one. A row opens its Surface; a todo list says how many of its todos are
 * still open.
 *
 * It lists the items in the order it is handed them and reports each pick
 * upward; the owner decides where the Surface opens.
 */
export function HappyAgentSurfaceListPage(props: HappyAgentSurfaceListPageProps) {
    const copy = SECTIONS[props.section];
    const count = props.items.length;
    return (
        <div
            className={["happy-agent-surface-list", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-surface-list"
            data-section={props.section}
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-agent-surface-list__header"
                subtitle={
                    props.loading && count === 0
                        ? "Loading…"
                        : `${String(count)} ${count === 1 ? copy.one : copy.many}`
                }
                title={copy.title}
                {...(props.onCreate
                    ? {
                          trailing: (
                              <Button
                                  data-testid="happy-agent-surface-list-create"
                                  disabled={props.createDisabledReason !== undefined}
                                  icon="plus"
                                  onClick={props.onCreate}
                                  size="small"
                                  title={props.createDisabledReason}
                                  variant="ghost"
                              >
                                  {copy.create}
                              </Button>
                          ),
                      }
                    : {})}
            />
            <ScrollArea
                className="happy-agent-surface-list__scroll"
                viewportClassName="happy-agent-surface-list__scroll-viewport"
            >
                <div className="happy-agent-surface-list__content">
                    {count === 0 ? (
                        <EmptyState
                            description={
                                props.loading
                                    ? "Reading what this Happy Agent keeps."
                                    : copy.description
                            }
                            icon={props.loading ? "clock" : copy.icon}
                            size="panel"
                            title={props.loading ? "Loading…" : copy.empty}
                        />
                    ) : (
                        <div
                            className="happy-agent-surface-list__list"
                            data-happy-desktop-ui="happy-agent-surface-list-rows"
                            role="list"
                        >
                            {props.items.map((item) => (
                                <div
                                    className="happy-agent-surface-list__item"
                                    key={item.id}
                                    role="listitem"
                                >
                                    <button
                                        className="happy-agent-surface-list-row"
                                        data-happy-desktop-ui="happy-agent-surface-list-row"
                                        onClick={() => props.onOpen(item.id)}
                                        type="button"
                                    >
                                        <SurfaceAvatar
                                            {...(item.image ? { image: item.image } : {})}
                                            size="sm"
                                            type={item.type}
                                        />
                                        <span className="happy-agent-surface-list-row__name">
                                            {item.name}
                                        </span>
                                        {item.count !== undefined && item.count > 0 ? (
                                            <span
                                                aria-label={`${String(item.count)} open`}
                                                className="happy-agent-surface-list-row__count"
                                            >
                                                {item.count}
                                            </span>
                                        ) : null}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
