import { useState } from "react";
import type { GptLiveSnapshot } from "happy-desktop-state";
import { Box } from "../../src/Box";
import { GptLiveSettings } from "../../src/GptLiveSettings";
import { GptLivePhone } from "../../src/GptLivePhone";
import { SidebarFooter } from "../../src/SidebarFooter";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "P-012b";
const base: GptLiveSnapshot = {
    gptLiveEnabled: true,
    status: "idle",
    panelVisible: false,
    microphoneMuted: false,
    transcripts: [],
};
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
            summary="A phone beside Settings; the account lives in Experimental settings."
        >
            <Specimen
                label="Experimental settings"
                number="01"
                detail="One opt-in and one account."
            >
                <Box width={680}>
                    <GptLiveSettings
                        enabled={enabled}
                        onEnabledChange={setEnabled}
                        accounts={accounts}
                        accountId={accountId}
                        onAccountSelect={setAccountId}
                    />
                </Box>
            </Specimen>
            {(["idle", "connecting", "active", "error"] as const).map((status, index) => (
                <Specimen
                    key={status}
                    label={status}
                    number={String(index + 2).padStart(2, "0")}
                    detail="Phone immediately before Settings, 28 × 28 px."
                >
                    <Box width={300} data-voice-state={status}>
                        <SidebarFooter
                            appearance="light"
                            onAppearanceToggle={() => {}}
                            onSettingsOpen={() => {}}
                            voice={
                                <GptLivePhone
                                    state={{
                                        ...base,
                                        status,
                                        ...(status === "error"
                                            ? { error: "Microphone access was denied." }
                                            : {}),
                                    }}
                                    onStart={() => {}}
                                    onEnd={() => {}}
                                />
                            }
                        />
                    </Box>
                </Specimen>
            ))}
            <Specimen
                label="Selected account"
                number="06"
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
