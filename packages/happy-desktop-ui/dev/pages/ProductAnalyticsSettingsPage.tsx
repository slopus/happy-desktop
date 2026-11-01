import {
    DataDisclosure,
    HappyAgentProductAnalyticsSettings,
    HappyAgentSettingsShell,
    type HappyAgentSettingsCategory,
} from "../../src";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-016";

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General" },
    { icon: "users", id: "account", label: "Account" },
    { icon: "code", id: "debug", label: "Dev tools" },
];

const noop = () => undefined;

function PrivacyScreen(props: { readonly enabled: boolean }) {
    return (
        <HappyAgentSettingsShell
            activeCategoryId="general"
            categories={categories}
            description="How this window looks and what a new session starts with"
            onCategorySelect={noop}
            onClose={noop}
            title="General"
        >
            <HappyAgentProductAnalyticsSettings enabled={props.enabled} onChange={noop} />
        </HappyAgentSettingsShell>
    );
}

export function ProductAnalyticsSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The General settings switch for product analytics, with examples of what is sent beside what is never sent."
            title="Product analytics settings"
        >
            <FullScreenSpecimen
                detail="On, the default, at the window Happy opens at"
                label="Privacy — on"
                number="01"
                screen="01-on-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <PrivacyScreen enabled />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Off, at the minimum window"
                label="Privacy — off"
                number="02"
                screen="02-off-720x640"
                window={{ width: 720, height: 640 }}
            >
                <PrivacyScreen enabled={false} />
            </FullScreenSpecimen>
            <div className="specimen-grid">
                <Specimen
                    detail="two groups · wrap below 504px"
                    label="Data disclosure"
                    number="D-01"
                    stage="surface"
                >
                    <div style={{ display: "flex", width: "560px", padding: "24px" }}>
                        <DataDisclosure
                            groups={[
                                {
                                    kind: "shared",
                                    title: "What we send",
                                    items: ["A conversation was created", "The app version"],
                                },
                                {
                                    kind: "withheld",
                                    title: "What we never send",
                                    items: ["Your messages", "File paths", "Folder names"],
                                },
                            ]}
                        />
                    </div>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
