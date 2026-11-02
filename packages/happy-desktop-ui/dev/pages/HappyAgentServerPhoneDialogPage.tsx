import type { ReactNode } from "react";
import { HappyAgentServerPhoneDialog } from "../../src/pages/settings/HappyAgentServerPhoneDialog";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-334";

/** Contains the fixed overlay inside its window-sized viewport. */
function frame(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                height: "100%",
                overflow: "hidden",
                position: "relative",
                transform: "translateZ(0)",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}

const SPECIMENS = [
    {
        label: "Team server",
        name: "Example Engineering",
        address: "https://happy.example.com/",
        window: { height: 760, width: 1100 },
    },
    {
        label: "Long address · minimum window",
        name: "Happy Robotics Research and Development",
        address: "https://happy.research-and-development.robotics.example.com/teams/platform/",
        window: { height: 640, width: 720 },
    },
] as const;

export function HappyAgentServerPhoneDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The code a phone scans to add one team server from Settings › Servers. It holds the server's instance and address only, so it never expires and is not pairing with this computer."
            title="HappyAgentServerPhoneDialog"
        >
            {SPECIMENS.map((specimen, index) => {
                const number = String(index + 1).padStart(2, "0");
                return (
                    <FullScreenSpecimen
                        detail={`480px card · centered · ${specimen.address}`}
                        key={specimen.label}
                        label={specimen.label}
                        number={number}
                        screen={`${number}-${specimen.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        window={specimen.window}
                    >
                        {frame(
                            <HappyAgentServerPhoneDialog
                                address={specimen.address}
                                code="happy://k3x9q2m7p0a4b8c1d5e6f7g2/server?url=https%3A%2F%2Fhappy.example.com%2F"
                                name={specimen.name}
                                onClose={() => undefined}
                            />,
                        )}
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
