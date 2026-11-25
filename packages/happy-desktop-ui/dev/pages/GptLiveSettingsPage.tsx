import { useState } from "react";
import { Box } from "../../src/Box";
import { GptLiveSettings } from "../../src/GptLiveSettings";
import { GptLivePhone, type GptLivePhoneStatus } from "../../src/GptLivePhone";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "P-012b";
/**
 * Each phone state, with the message its tooltip carries and its specimen
 * number. A call that connects or runs is the status bar's (`GptLiveCallBar`).
 */
const phones: readonly { status: GptLivePhoneStatus; number: string; message?: string }[] = [
    { status: "idle", number: "03" },
    { status: "ended", number: "04", message: "Microphone access was denied." },
];
const accounts = [
    {
        id: "subscription",
        label: "Codex subscription",
        providerId: "codex",
        kind: "subscription" as const,
    },
    { id: "api", label: "OpenAI API", providerId: "openai", kind: "api" as const },
];

export function GptLiveSettingsPage() {
    const [enabled, setEnabled] = useState(false);
    const [accountId, setAccountId] = useState("subscription");
    return (
        <ComponentPage
            number={componentNumber}
            title="Voice"
            summary="A phone beside Settings; the account is chosen in Voice settings."
        >
            <Specimen label="Voice settings" number="01" detail="One opt-in and one account.">
                <Box width={680}>
                    <GptLiveSettings
                        enabled={enabled}
                        onEnabledChange={setEnabled}
                        accounts={accounts}
                        accountId={accountId}
                        onAccountSelect={setAccountId}
                        accountsVisible
                    />
                </Box>
            </Specimen>
            <Specimen
                label="Calls unavailable"
                number="02"
                detail="Settings stay visible before experimental opt-in."
            >
                <Box width={680}>
                    <GptLiveSettings
                        enabled={false}
                        onEnabledChange={() => {}}
                        accountsVisible
                        accounts={accounts}
                        accountId="subscription"
                        callsUnavailable="Enable experimental features in General to turn on voice calls."
                    />
                </Box>
            </Specimen>
            {phones.map((phone) => (
                <Specimen
                    key={phone.status}
                    label={phone.status}
                    number={phone.number}
                    detail="Phone immediately before Settings, 28 × 28 px."
                >
                    <Box width={300} data-voice-state={phone.status}>
                        <SidebarFooter
                            onSettingsOpen={() => {}}
                            voice={
                                <GptLivePhone
                                    status={phone.status}
                                    {...(phone.message ? { message: phone.message } : {})}
                                    onStart={() => {}}
                                />
                            }
                        />
                    </Box>
                </Specimen>
            ))}
            <Specimen
                label="Selected account"
                number="05"
                detail="API billing appears as one short line."
            >
                <Box width={680}>
                    <GptLiveSettings
                        enabled
                        onEnabledChange={() => {}}
                        accounts={accounts}
                        accountId="api"
                        onAccountSelect={() => {}}
                    />
                </Box>
            </Specimen>
        </ComponentPage>
    );
}
