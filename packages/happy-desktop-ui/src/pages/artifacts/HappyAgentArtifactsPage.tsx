import type { CSSProperties } from "react";
import {
    HAPPY_AGENT_ARTIFACT_TYPES,
    happyAgentArtifactTypeLabel,
    type HappyAgentArtifactCatalogSnapshot,
    type HappyAgentArtifactId,
    type HappyAgentArtifactSourceKind,
    type HappyAgentArtifactType,
} from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { ScrollArea } from "../../Scrollbar";
import { Select, type SelectOption } from "../../Select";
import { Switch } from "../../Switch";
import type {
    HappyAgentArtifactLabels,
    HappyAgentArtifactSourceChoice,
} from "./artifactPresentation";
import { ArtifactHeader } from "./ArtifactHeader";
import { HappyAgentArtifactRow } from "./HappyAgentArtifactRow";

type KnownType = Exclude<HappyAgentArtifactType, "unknown">;

export interface HappyAgentArtifactsPageProps {
    /** The catalog as its store holds it: the list, the filter, and how reading it is going. */
    catalog: HappyAgentArtifactCatalogSnapshot;
    labels: HappyAgentArtifactLabels;
    /** The places the catalog can be narrowed to, in the order they are offered. */
    sources: readonly HappyAgentArtifactSourceChoice[];
    onTypeChange: (type: KnownType | undefined) => void;
    onSourceChange: (
        source: { readonly kind: HappyAgentArtifactSourceKind; readonly id?: string } | undefined,
    ) => void;
    onDeletedShownChange: (shown: boolean) => void;
    /** Reads the next page of older artifacts. */
    onLoadMore: () => void;
    onArtifactOpen: (artifactId: HappyAgentArtifactId) => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

const ANY = "";

const TYPE_OPTIONS: SelectOption[] = [
    { value: ANY, label: "Any type" },
    ...HAPPY_AGENT_ARTIFACT_TYPES.map((type) => ({
        value: type,
        label: happyAgentArtifactTypeLabel(type),
    })),
];

/**
 * HappyAgentArtifactsPage — every artifact a Happy Agent's agents and people
 * have published, newest first, narrowed by type, by where it was made, and by
 * whether the deleted ones stay listed.
 *
 * It renders the catalog it is handed and reports each choice upward; the list
 * changes when the owner's store does, which it does on its own as artifacts
 * are made, changed, and deleted.
 */
export function HappyAgentArtifactsPage(props: HappyAgentArtifactsPageProps) {
    const catalog = props.catalog;
    const sourceIndex =
        catalog.source === undefined
            ? -1
            : props.sources.findIndex(
                  (choice) =>
                      choice.kind === catalog.source?.kind && choice.id === catalog.source.id,
              );
    const sourceOptions: SelectOption[] = [
        { value: ANY, label: "Anywhere" },
        ...props.sources.map((choice, index) => ({ value: String(index), label: choice.label })),
    ];
    const filtered = catalog.type !== undefined || catalog.source !== undefined;
    const count = catalog.artifacts.length;
    return (
        <div
            className={["happy-agent-artifacts", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-artifacts"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-agent-artifacts__header"
                subtitle={
                    catalog.loading
                        ? "Loading…"
                        : `${String(count)}${catalog.hasMore ? "+" : ""} ${count === 1 && !catalog.hasMore ? "artifact" : "artifacts"}`
                }
                title="Artifacts"
            />
            <div
                className="happy-agent-artifacts__filters"
                data-happy-desktop-ui="happy-agent-artifacts-filters"
            >
                <Select
                    aria-label="Type"
                    data-testid="happy-agent-artifacts-type"
                    onValueChange={(value) =>
                        props.onTypeChange(value === ANY ? undefined : (value as KnownType))
                    }
                    options={TYPE_OPTIONS}
                    size="small"
                    value={catalog.type ?? ANY}
                />
                <Select
                    aria-label="Made in"
                    data-testid="happy-agent-artifacts-source"
                    onValueChange={(value) => {
                        const choice = value === ANY ? undefined : props.sources[Number(value)];
                        props.onSourceChange(
                            choice === undefined
                                ? undefined
                                : {
                                      kind: choice.kind,
                                      ...(choice.id === undefined ? {} : { id: choice.id }),
                                  },
                        );
                    }}
                    options={sourceOptions}
                    size="small"
                    value={sourceIndex === -1 ? ANY : String(sourceIndex)}
                />
                <Switch
                    checked={catalog.deletedShown}
                    label="Show deleted"
                    onChange={props.onDeletedShownChange}
                    size="small"
                />
            </div>
            <ScrollArea
                className="happy-agent-artifacts__scroll"
                data-happy-desktop-ui="happy-agent-artifacts-scroll"
                viewportClassName="happy-agent-artifacts__scroll-viewport"
            >
                <div className="happy-agent-artifacts__content">
                    {catalog.error ? (
                        <Banner tone="danger" title="Artifacts may be out of date">
                            {catalog.error.message}
                        </Banner>
                    ) : null}
                    {count === 0 ? (
                        <EmptyState
                            // The tickets belong to the settled absence only:
                            // while the catalog is still being read nothing is
                            // known yet, and a filter that matched nothing is a
                            // miss, which keeps its glyph.
                            animation={catalog.loading || filtered ? undefined : "tickets"}
                            description={
                                catalog.loading
                                    ? "Reading what this Happy Agent has published."
                                    : filtered
                                      ? "Nothing published matches these filters."
                                      : "When an agent publishes finished work, it is kept here with every version."
                            }
                            icon={catalog.loading ? "clock" : "package"}
                            size="panel"
                            title={
                                catalog.loading
                                    ? "Loading artifacts…"
                                    : filtered
                                      ? "No matching artifacts"
                                      : "No artifacts yet"
                            }
                        />
                    ) : (
                        <div
                            className="happy-agent-artifacts__list"
                            data-happy-desktop-ui="happy-agent-artifacts-list"
                            role="list"
                        >
                            {catalog.artifacts.map((artifact) => (
                                <div
                                    className="happy-agent-artifacts__item"
                                    key={artifact.id}
                                    role="listitem"
                                >
                                    <HappyAgentArtifactRow
                                        artifact={artifact}
                                        density="page"
                                        labels={props.labels}
                                        onOpen={props.onArtifactOpen}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                    {catalog.hasMore ? (
                        <div className="happy-agent-artifacts__more">
                            <Button
                                loading={catalog.loadingMore}
                                onClick={props.onLoadMore}
                                size="small"
                                variant="secondary"
                            >
                                Show older artifacts
                            </Button>
                        </div>
                    ) : null}
                </div>
            </ScrollArea>
        </div>
    );
}
