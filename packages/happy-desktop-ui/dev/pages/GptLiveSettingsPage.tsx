import { useState } from "react";
import { Box } from "../../src/Box";
import { GptLiveSettings } from "../../src/GptLiveSettings";
import { GptLiveSurface } from "../../src/GptLiveSurface";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "P-012b";

export function GptLiveSettingsPage() {
    const [enabled, setEnabled] = useState(false);
    const [voicePanel, setVoicePanel] = useState(false);
    return (
        <ComponentPage
            number={componentNumber}
            title="GPT-Live settings"
            summary="Default-off desktop voice opt-in and explicit window-scoped call controls."
        >
            <Specimen
                label="Off by default · interactive"
                number="01"
                detail="Opt-in only; no recording or connection starts."
            >
                <Box width={680}>
                    <GptLiveSettings enabled={enabled} onEnabledChange={setEnabled} />
                </Box>
            </Specimen>
            <Specimen
                label="Window voice surface · active and exact-text confirmation"
                number="03"
                detail="Stable application frame, persistent End/Mute, explicit human send. Open voice to inspect the staged card."
            >
                <Box width={900} height={420}>
                    <GptLiveSurface
                        state={{
                            gptLiveEnabled: true,
                            status: "active",
                            panelVisible: voicePanel,
                            microphoneMuted: false,
                            confirmationSending: false,
                            transcripts: [
                                {
                                    id: "fragment1",
                                    role: "user",
                                    text: "Draft a review request in this conversation.",
                                },
                            ],
                            confirmation: {
                                actionId: "action1",
                                targetLabel: "Review implementation",
                                connectionLabel: "Development machine",
                                modeLabel: "Auto",
                                text: "Please review the current implementation and report any concrete issues.",
                            },
                        }}
                        onOpen={() => setVoicePanel(true)}
                        onClose={() => setVoicePanel(false)}
                        onStart={() => {}}
                        onEnd={() => setVoicePanel(false)}
                        onAccountSelect={() => {}}
                        onMutedChange={() => {}}
                        onMessageConfirm={() => setVoicePanel(false)}
                        onMessageCancel={() => setVoicePanel(false)}
                    >
                        <Box>Application content stays mounted while voice changes.</Box>
                    </GptLiveSurface>
                </Box>
            </Specimen>
            <Specimen
                label="Opted in · explicit Start still required"
                number="02"
                detail="Enabling the surface never starts a microphone or a call."
            >
                <Box width={680}>
                    <GptLiveSettings enabled onEnabledChange={() => {}} />
                </Box>
            </Specimen>
        </ComponentPage>
    );
}
