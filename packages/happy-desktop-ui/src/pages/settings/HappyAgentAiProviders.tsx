import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { Icon } from "../../Icon";
import { IconTile, type IconTileProps } from "../../IconTile";
import { SegmentedControl } from "../../SegmentedControl";
import { Spinner } from "../../Spinner";
import {
    HappyAgentAiProviderSheet,
    type HappyAgentAiProviderSheetProps,
} from "./HappyAgentAiProviderSheet";
import {
    HappyAgentProviderAddDialog,
    type HappyAgentProviderAddDialogProps,
} from "./HappyAgentProviderAddDialog";
import { HappyAgentSettingsGroup, HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** Whose providers the list shows: the team's, or the reader's own. */
export type HappyAgentAiProvidersScope = "team" | "private";

/** One provider someone added: what conversations can run on. */
export interface HappyAgentAiProviderRow {
    readonly id: string;
    readonly name: string;
    /** Its vendor's mark, or a house glyph for a provider of several vendors. */
    readonly tile: IconTileProps;
    /** How many tokens it holds and whether it serves, already worded: "2 tokens". */
    readonly meta: string;
    /** The dot by `meta`: serving, a token needing attention, or nothing serving. */
    readonly tone: "ok" | "warning" | "danger" | "off";
}

export interface HappyAgentAiProvidersProps {
    readonly scope: HappyAgentAiProvidersScope;
    /** The providers of `scope`, only those someone added. */
    readonly providers: readonly HappyAgentAiProviderRow[];
    /** True until the first answer. */
    readonly loading?: boolean;
    /** Why the list could not be read. */
    readonly error?: string;
    /** Why the last change to a token was refused. */
    readonly saveError?: string;
    /** The add dialog, while it is open. */
    readonly add?: HappyAgentProviderAddDialogProps;
    /** One provider's sheet, while it is open. */
    readonly detail?: HappyAgentAiProviderSheetProps;
    onScopeChange: (scope: HappyAgentAiProvidersScope) => void;
    onProviderOpen: (providerId: string) => void;
    /** Opens the add dialog; absent where the reader may add nothing. */
    onAdd?: () => void;
}

const EMPTY_TITLES: Record<HappyAgentAiProvidersScope, string> = {
    team: "No team providers yet",
    private: "No personal providers yet",
};

const EMPTY_DESCRIPTIONS: Record<HappyAgentAiProvidersScope, string> = {
    team: "Add an API key or a subscription for everyone on the team to run on.",
    private: "Add your own API key or subscription to run on your own account.",
};

/**
 * Settings › Inference on Happy Cloud: a short list of the providers the
 * team or the reader added, one row each with its vendor's mark and how many
 * tokens it holds, the team's first. A row opens the provider's own sheet;
 * nothing is edited in the list.
 */
export function HappyAgentAiProviders(props: HappyAgentAiProvidersProps) {
    return (
        <HappyAgentSettingsSection
            description="What your conversations run on. Open a provider to see its tokens."
            rows="cards"
            title="Providers"
        >
            <Box
                className="happy-agent-ai-providers"
                data-happy-desktop-ui="happy-agent-ai-providers"
            >
                <Box className="happy-agent-ai-providers__actions">
                    <SegmentedControl
                        aria-label="Whose providers"
                        onChange={(scope) =>
                            props.onScopeChange(scope === "private" ? "private" : "team")
                        }
                        segments={[
                            { value: "team", label: "Team" },
                            { value: "private", label: "Personal" },
                        ]}
                        size="small"
                        value={props.scope}
                    />
                    {props.onAdd ? (
                        <Button icon="plus" onClick={props.onAdd} size="small" variant="secondary">
                            Add provider
                        </Button>
                    ) : null}
                </Box>
                {props.saveError ? (
                    <Banner tone="danger" title="Not changed">
                        {props.saveError}
                    </Banner>
                ) : null}
                {props.error ? (
                    <Banner tone="danger" title="Providers unavailable">
                        {props.error}
                    </Banner>
                ) : props.loading ? (
                    <Box className="happy-agent-settings__pending">
                        <Spinner size={16} />
                        <span>Reading the providers…</span>
                    </Box>
                ) : props.providers.length === 0 ? (
                    <EmptyState
                        description={EMPTY_DESCRIPTIONS[props.scope]}
                        icon="spark"
                        size="inline"
                        title={EMPTY_TITLES[props.scope]}
                        {...(props.onAdd
                            ? {
                                  action: {
                                      label: "Add provider",
                                      icon: "plus",
                                      onClick: props.onAdd,
                                  },
                              }
                            : {})}
                    />
                ) : (
                    <HappyAgentSettingsGroup>
                        {props.providers.map((row) => (
                            <Box
                                className="happy-agent-provider-list__item"
                                data-happy-desktop-ui="happy-agent-ai-provider"
                                key={row.id}
                            >
                                <button
                                    aria-label={`${row.name}, ${row.meta}`}
                                    className="happy-agent-provider-list__row"
                                    onClick={() => props.onProviderOpen(row.id)}
                                    type="button"
                                >
                                    <IconTile {...row.tile} />
                                    <span className="happy-agent-provider-list__text">
                                        <span className="happy-agent-provider-list__name">
                                            {row.name}
                                        </span>
                                        <span
                                            className="happy-agent-provider-list__line"
                                            data-tone={row.tone}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="happy-agent-provider-list__dot"
                                                data-tone={row.tone}
                                            />
                                            <span className="happy-agent-provider-list__line-text">
                                                {row.meta}
                                            </span>
                                        </span>
                                    </span>
                                    <Icon name="chevron-right" size={14} />
                                </button>
                            </Box>
                        ))}
                    </HappyAgentSettingsGroup>
                )}
            </Box>
            {props.add ? <HappyAgentProviderAddDialog {...props.add} /> : null}
            {props.detail ? <HappyAgentAiProviderSheet {...props.detail} /> : null}
        </HappyAgentSettingsSection>
    );
}
