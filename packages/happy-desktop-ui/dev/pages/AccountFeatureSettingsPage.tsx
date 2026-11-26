import {
    HappyAgentAccountFeatureSettings,
    HappyAgentSettingsShell,
    type HappyAgentAccountFeatureRow,
    type HappyAgentSettingsCategory,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-049";

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { group: "Team", icon: "users", id: "members", label: "Members", tone: "orange" },
];

const noop = () => undefined;

function pipelines(enabled: boolean, saving?: boolean): readonly HappyAgentAccountFeatureRow[] {
    return [
        {
            description: "Pipelines in the sidebar, and the runs agents start.",
            enabled,
            icon: "pipeline",
            id: "pipelines",
            label: "Pipelines",
            tone: "teal",
            ...(saving ? { saving } : {}),
        },
    ];
}

function AccountScreen(props: {
    readonly features: readonly HappyAgentAccountFeatureRow[];
    readonly error?: string;
    readonly disabled?: boolean;
}) {
    return (
        <HappyAgentSettingsShell
            activeCategoryId="account"
            categories={categories}
            description="Your name, photo, and the features you use"
            onCategorySelect={noop}
            onClose={noop}
            title="Account"
        >
            <HappyAgentAccountFeatureSettings
                features={props.features}
                {...(props.error ? { error: props.error } : {})}
                {...(props.disabled ? { disabled: true } : {})}
                onFeatureChange={noop}
            />
        </HappyAgentSettingsShell>
    );
}

export function AccountFeatureSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The Account settings switches that turn a feature on or off for the person in every team, starting with Pipelines."
            title="Account feature settings"
        >
            <FullScreenSpecimen
                detail="Pipelines on, the default, at the window Happy opens at"
                label="Features — on"
                number="01"
                screen="01-on-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <AccountScreen features={pipelines(true)} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Pipelines off, at the minimum window"
                label="Features — off"
                number="02"
                screen="02-off-720x640"
                window={{ width: 720, height: 640 }}
            >
                <AccountScreen features={pipelines(false)} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Turned off and sent; the server has not answered"
                label="Features — saving"
                number="03"
                screen="03-saving-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <AccountScreen features={pipelines(false, true)} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The server refused the switch; Pipelines stay as they were"
                label="Features — not switched"
                number="04"
                screen="04-failed-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <AccountScreen error="The server is busy. Try again." features={pipelines(true)} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The server is offline, so nothing can be switched"
                label="Features — unavailable"
                number="05"
                screen="05-unavailable-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <AccountScreen disabled features={pipelines(true)} />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
