import { Banner } from "../../Banner";
import { DataDisclosure, type DataDisclosureGroup } from "../../DataDisclosure";
import { FormRow } from "../../FormRow";
import { Switch } from "../../Switch";
import { HappyAgentSettingsGroup, HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** What product analytics sends and, above all, what it never sends. */
const PRODUCT_ANALYTICS_DISCLOSURE: readonly DataDisclosureGroup[] = [
    {
        kind: "shared",
        title: "Examples of what we send",
        items: [
            "Happy opened, and how many Happy Agents it is connected to (up to 3 or more)",
            "Which setup step you reached, roughly how long setup took, and which step failed if it did (a fixed code such as download failed or timed out, never the error message)",
            "Which subscriptions are signed in when you continue past them",
            "How you paired a phone, and whether pairing finished, failed (a fixed reason), or was cancelled",
            "A conversation, project, workspace, bot, or task was created, and whether that worked",
            "A message was sent, with its model family (such as Claude Opus or GPT, never the exact model), the kind of provider, the effort level, whether it went to a bot or a subtask, and whether it had an attachment",
            "Errors you saw: a failed reply's kind (such as usage limit), which button you pressed on it (Retry, Switch, New chat, or Ask Chief of Staff), a lost connection to Happy Agent and how long it lasted, and a conversation, file, or update that failed to load (a fixed code only)",
            "App and Happy Agent version numbers, the operating system and its version number, and the chip type (Apple silicon/ARM or Intel/AMD)",
        ],
    },
    {
        kind: "withheld",
        title: "What we never send",
        items: [
            "Your messages, prompts, or anything an agent writes",
            "The exact model, or which provider account you used",
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
    /** The host refused to keep the last choice, so the next launch may not know it. */
    readonly saveFailed?: boolean;
    readonly onChange: (enabled: boolean) => void;
}

/**
 * The switch for product analytics, with what it sends beside what
 * it never sends, so the choice is made knowing both.
 */
export function HappyAgentProductAnalyticsSettings(props: HappyAgentProductAnalyticsSettingsProps) {
    return (
        <HappyAgentSettingsSection rows="cards" title="Privacy">
            <HappyAgentSettingsGroup>
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
                    description="Helps us see where setup gets stuck, which errors people hit, and which features they use. Events are tied to a random ID for this installation, not to you; turning this off deletes it, and turning it back on starts a new one. Our analytics provider, PostHog, receives your IP address with each event and may keep it; we turn off its location lookup and don't use your IP."
                    htmlFor="happy-agent-settings-product-analytics"
                    label="Share product analytics"
                />
                <DataDisclosure
                    data-testid="happy-agent-settings-product-analytics-disclosure"
                    groups={PRODUCT_ANALYTICS_DISCLOSURE}
                />
            </HappyAgentSettingsGroup>
            {props.saveFailed ? (
                <Banner tone="danger" title="Choice not saved">
                    {props.enabled
                        ? "Analytics is on in this window, but Happy could not save that, so it may be off after a restart."
                        : "Analytics is off in this window, but Happy could not save that, so it may be back on after a restart. Try switching it again."}
                </Banner>
            ) : null}
        </HappyAgentSettingsSection>
    );
}
