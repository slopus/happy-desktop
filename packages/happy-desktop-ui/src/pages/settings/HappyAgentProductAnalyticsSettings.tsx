import { DataDisclosure, type DataDisclosureGroup } from "../../DataDisclosure";
import { FormRow } from "../../FormRow";
import { Switch } from "../../Switch";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** What product analytics sends and, above all, what it never sends. */
const PRODUCT_ANALYTICS_DISCLOSURE: readonly DataDisclosureGroup[] = [
    {
        kind: "shared",
        title: "Examples of what we send",
        items: [
            "Happy opened, and how many times",
            "Which setup step you reached, how long setup took, and which step failed if it did (a fixed code such as download failed or timed out, never the error message)",
            "Which subscriptions are signed in, and whether you copied a setup command (never the command)",
            "A conversation, project, workspace, or bot was created",
            "A message was sent, with its model and effort level, and whether it went to a bot or a subtask",
            "A one-way code that tells two accounts of one provider apart, never the account itself",
            "App and Happy Agent versions, the operating system and its version number, and the chip type (Apple silicon/ARM or Intel/AMD)",
        ],
    },
    {
        kind: "withheld",
        title: "What we never send",
        items: [
            "Your messages, prompts, or anything an agent writes",
            "Files, file paths, or folder names",
            "Project, repository, branch, workspace, or bot names",
            "Your name, email address, or computer name",
            "Error messages, logs, or anything else a failure says about your machine",
            "Screen recordings, clicks, keystrokes, or page addresses",
        ],
    },
];

export interface HappyAgentProductAnalyticsSettingsProps {
    readonly enabled: boolean;
    readonly onChange: (enabled: boolean) => void;
}

/**
 * The switch for product analytics, with what it sends beside what
 * it never sends, so the choice is made knowing both.
 */
export function HappyAgentProductAnalyticsSettings(props: HappyAgentProductAnalyticsSettingsProps) {
    return (
        <HappyAgentSettingsSection title="Privacy">
            <FormRow
                control={
                    <Switch
                        aria-label="Share product analytics"
                        checked={props.enabled}
                        id="happy-agent-settings-product-analytics"
                        onChange={props.onChange}
                        size="small"
                    />
                }
                description="Helps us see where setup gets stuck and which features people use. Events are tied to a random ID for this installation, not to you. Our analytics provider, PostHog, receives your IP address with each event and may keep it; we turn off its location lookup and don't use your IP."
                htmlFor="happy-agent-settings-product-analytics"
                label="Share product analytics"
            />
            <DataDisclosure
                data-testid="happy-agent-settings-product-analytics-disclosure"
                groups={PRODUCT_ANALYTICS_DISCLOSURE}
            />
        </HappyAgentSettingsSection>
    );
}
