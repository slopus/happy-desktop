import type { ReactNode } from "react";
import { HappyAgentAccountSettings } from "../../src/pages/settings/HappyAgentAccountSettings";
import { HappyAgentServerConnectSettings } from "../../src/pages/settings/HappyAgentServerConnectSettings";
import { HappyAgentServerPhoneSettings } from "../../src/pages/settings/HappyAgentServerPhoneSettings";
import {
    HappyAgentSettingsShell,
    type HappyAgentSettingsCategory,
} from "../../src/pages/settings/HappyAgentSettingsShell";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-353";

const noop = () => undefined;
const WINDOW = { width: 1100, height: 760 } as const;
/** The enterprise test server's own code, as its health and roster name it. */
const CODE = "happy://iihxypnnrwxxnqhrdnpap3g4/server?url=https%3A%2F%2F164-90-149-4.sslip.io%2F";
const SERVER = "164-90-149-4.sslip.io";

const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { icon: "bell", id: "sharing", label: "Notifications", tone: "red" },
    { icon: "mobile", id: "mobile-access", label: "Mobile access", tone: "green" },
    { group: "Agents", icon: "doc", id: "instructions", label: "Instructions", tone: "purple" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
];

/** One settings category in the settings window, at the window Happy opens at. */
function Screen(props: {
    readonly number: string;
    readonly screen: string;
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly children: ReactNode;
}) {
    return (
        <FullScreenSpecimen
            detail={props.description}
            label={props.label}
            number={props.number}
            screen={props.screen}
            window={WINDOW}
        >
            <HappyAgentSettingsShell
                activeCategoryId={props.id}
                categories={categories}
                description={props.description}
                onCategorySelect={noop}
                onClose={noop}
                title={categories.find((category) => category.id === props.id)!.label}
            >
                {props.children}
            </HappyAgentSettingsShell>
        </FullScreenSpecimen>
    );
}

/**
 * C-353 Team server settings — a team server reached by its address: the
 * Account row on this computer that starts connecting to one, and the code a
 * phone scans to add that server.
 */
export function HappyAgentServerSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Team server settings"
            summary="A team server reached by its address: the Account row that starts connecting to one, and the code a phone scans to add it."
        >
            <Screen
                description="Your name, photo and Happy account"
                id="account"
                label="This computer › Account"
                number="01"
                screen="01-account-connect-server"
            >
                <HappyAgentServerConnectSettings onConnect={noop} />
                <HappyAgentAccountSettings
                    onConnect={noop}
                    onDisconnect={noop}
                    status="disconnected"
                />
            </Screen>
            <Screen
                description="Use Happy on your phone with this server"
                id="mobile-access"
                label="Team server › Mobile access"
                number="02"
                screen="02-server-phone-code"
            >
                <HappyAgentServerPhoneSettings code={CODE} serverName={SERVER} />
            </Screen>
            <Screen
                description="Use Happy on your phone with this server"
                id="mobile-access"
                label="Team server › Mobile access, signed out"
                number="03"
                screen="03-server-phone-waiting"
            >
                <HappyAgentServerPhoneSettings
                    serverName={SERVER}
                    waiting="Sign in to this server first. Its code appears once you have."
                />
            </Screen>
        </ComponentPage>
    );
}
