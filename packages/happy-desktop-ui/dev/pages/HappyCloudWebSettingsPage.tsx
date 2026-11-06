import { HappyAgentSettingsShell, HappyCloudWebSettings } from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "P-012e";

const noop = () => {};

export function HappyCloudWebSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The cloud web app's session in Account settings: switch server, or sign out."
            title="Happy Cloud web settings"
        >
            <FullScreenSpecimen
                detail="1100 × 760 browser window at https://acme.happybases.com/"
                label="Happy Cloud"
                number="01"
                screen="01-happy-cloud-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <div style={{ display: "flex", contain: "layout paint" }}>
                    <HappyAgentSettingsShell
                        activeCategoryId="account"
                        categories={[
                            { id: "general", icon: "settings", label: "General" },
                            { id: "account", icon: "users", label: "Account" },
                        ]}
                        description="Your profile and Happy Cloud session"
                        onCategorySelect={noop}
                        onClose={noop}
                        title="Account"
                    >
                        <HappyCloudWebSettings
                            onServerSwitch={noop}
                            onSignOut={noop}
                            serverName="acme"
                        />
                    </HappyAgentSettingsShell>
                </div>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
