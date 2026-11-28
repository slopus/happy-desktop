import { AssistantMark } from "./AssistantMark";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Ionicon } from "./vectorIcons/VectorIcon";

/** The providers Happy Cloud onboarding's AI step offers, in the order it lists them: plans first. */
export type CloudOnboardingProvider = "chatgpt" | "claude" | "xai" | "bedrock" | "custom";

/** One provider's row. */
export interface CloudOnboardingProviderRow {
    readonly id: CloudOnboardingProvider;
    /** How many accounts of it are connected, the reader's and the team's. */
    readonly accounts: number;
    /** Opens the provider's dialog. The row and its "Add another" open the same form. */
    readonly onOpen?: () => void;
}

const ROWS: Readonly<
    Record<CloudOnboardingProvider, { readonly name: string; readonly offer: string }>
> = {
    chatgpt: { name: "ChatGPT", offer: "Your ChatGPT plan, or an OpenAI API key" },
    claude: { name: "Claude", offer: "Your Claude plan, or an Anthropic API key" },
    xai: { name: "xAI", offer: "An xAI API key, for Grok" },
    bedrock: { name: "Amazon Bedrock", offer: "AWS keys, billed to your AWS account" },
    custom: { name: "Custom endpoint", offer: "Any server that speaks OpenAI’s API" },
};

/** The provider's name, as its row and its dialog say it. */
export function cloudOnboardingProviderName(provider: CloudOnboardingProvider): string {
    return ROWS[provider].name;
}

/** A provider's mark: the vendor's own where there is one, a glyph otherwise. */
export function CloudOnboardingProviderMark(props: {
    readonly provider: CloudOnboardingProvider;
    readonly size: number;
}) {
    switch (props.provider) {
        case "chatgpt":
            return <AssistantMark name="openai" size={props.size} tone="brand" />;
        case "claude":
            return <AssistantMark name="claude" size={props.size} tone="brand" />;
        case "xai":
            return <AssistantMark name="grok" size={props.size} tone="brand" />;
        case "bedrock":
            return <Ionicon name="cloud-outline" size={props.size} />;
        case "custom":
            return <Ionicon name="code-slash-outline" size={props.size} />;
    }
}

function accountCount(count: number): string {
    return count === 1 ? "1 account" : `${String(count)} accounts`;
}

/**
 * C-371 CloudOnboardingProviderRows — the AI step's body: one row per
 * provider, plans first. Every row opens its provider's dialog. A row with
 * accounts says how many and offers another in a slot every row reserves, so
 * no row changes height or width. Under 700px of window the rows are 52px
 * with 4px between them, so all five fit the step's 280px.
 */
export function CloudOnboardingProviderRows(props: {
    readonly rows: readonly CloudOnboardingProviderRow[];
}) {
    return (
        <div
            className="happy-cloud-provider-rows"
            data-happy-desktop-ui="cloud-onboarding-provider-rows"
        >
            {props.rows.map((row) => {
                const known = ROWS[row.id];
                const connected = row.accounts > 0;
                return (
                    <div
                        className="happy-cloud-provider-row"
                        data-connected={connected ? "true" : undefined}
                        data-happy-desktop-ui="cloud-onboarding-provider-row"
                        data-provider={row.id}
                        key={row.id}
                    >
                        <button
                            aria-label={
                                connected
                                    ? `${known.name}, ${accountCount(row.accounts)}`
                                    : known.name
                            }
                            className="happy-cloud-provider-row__open"
                            disabled={!row.onOpen}
                            onClick={row.onOpen}
                            type="button"
                        >
                            <span aria-hidden className="happy-cloud-provider-row__mark">
                                <CloudOnboardingProviderMark provider={row.id} size={24} />
                            </span>
                            <span className="happy-cloud-provider-row__text">
                                <span className="happy-cloud-provider-row__name">{known.name}</span>
                                {connected ? (
                                    <span className="happy-cloud-provider-row__line" data-tone="ok">
                                        <Icon name="check" size={14} />
                                        {accountCount(row.accounts)}
                                    </span>
                                ) : (
                                    <span className="happy-cloud-provider-row__line">
                                        {known.offer}
                                    </span>
                                )}
                            </span>
                        </button>
                        <span className="happy-cloud-provider-row__slot">
                            {connected && row.onOpen ? (
                                <Button
                                    data-happy-desktop-ui="cloud-onboarding-provider-add-another"
                                    icon="plus"
                                    onClick={row.onOpen}
                                    size="small"
                                    variant="secondary"
                                    width={112}
                                >
                                    Add another
                                </Button>
                            ) : null}
                        </span>
                        <span aria-hidden className="happy-cloud-provider-row__chevron">
                            <Icon name="chevron-right" size={14} />
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
