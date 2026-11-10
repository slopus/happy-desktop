import {
    MobileDirectPairingPanel,
    type MobileDirectConnectorState,
} from "../../src/MobileDirectConnection";
import { UiPhoneApp } from "../../src/ui/UiPhoneApp";
import { ComponentPage, Specimen } from "../kit";

/*
 * PROTOTYPE — chat UI onboarding experiment. The phone components as the
 * chat drew them before the redesign, kept only so the experiment's
 * before/after stills cover them. Fixture data only.
 */
export const componentNumber = "C-338z";

const NOW = 1_762_700_000_000;

const ready = (
    pairing: Partial<
        NonNullable<Extract<MobileDirectConnectorState, { kind: "ready" }>["connector"]["pairing"]>
    > | null,
): MobileDirectConnectorState => ({
    kind: "ready",
    connector: {
        status: "open",
        error: null,
        devices: [],
        pairing:
            pairing === null
                ? null
                : {
                      id: "pairing-1",
                      status: "waiting",
                      qr: null,
                      expiresAt: NOW + 272_000,
                      device: null,
                      emoji: null,
                      desktopConfirmed: false,
                      mobileConfirmed: false,
                      error: null,
                      ...pairing,
                  },
    },
});

const PAIRS: readonly [string, string, MobileDirectConnectorState][] = [
    ["C-338z2", "Phone pair, start (before)", ready(null)],
    [
        "C-338z3",
        "Phone pair, the code (before)",
        ready({ qr: "happy-pair:fixture-not-a-real-code-0123456789abcdef" }),
    ],
    [
        "C-338z4",
        "Phone pair, the emoji (before)",
        ready({
            status: "verifying",
            device: { name: "Ada's iPhone", platform: "ios" },
            emoji: ["🦊", "🌵", "🎈", "🍋"],
        }),
    ],
];

export function ChatUiBeforePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="PROTOTYPE. The phone components as the chat drew them before the redesign, for the experiment's before/after stills."
            title="Chat UI before"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="before"
                    label="Phone app (before)"
                    number="C-338z1"
                    stage="surface"
                >
                    <div className="happy-chat-ui" style={{ padding: "24px", width: "600px" }}>
                        <UiPhoneApp />
                    </div>
                </Specimen>
                {PAIRS.map(([number, label, connector]) => (
                    <Specimen
                        detail="before"
                        key={number}
                        label={label}
                        number={number}
                        stage="surface"
                    >
                        <div
                            className="happy-chat-action happy-chat-action__phone-pair"
                            style={{ margin: "24px", height: "204px", width: "360px" }}
                        >
                            <MobileDirectPairingPanel
                                codeSize={204}
                                connector={connector}
                                density="compact"
                                now={NOW}
                                onConfirm={() => undefined}
                                onReject={() => undefined}
                                onStart={() => undefined}
                            />
                        </div>
                    </Specimen>
                ))}
            </div>
        </ComponentPage>
    );
}
