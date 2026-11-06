import type { ReactNode } from "react";
import { CloudConnectDialog, type CloudConnectView } from "../../src/CloudConnectDialog";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-336";

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

const WINDOW = { height: 760, width: 1100 } as const;
const noop = () => undefined;

const SPECIMENS: readonly {
    readonly label: string;
    readonly detail: string;
    readonly view: CloudConnectView;
}[] = [
    { label: "Confirm", detail: "Cancel or Connect", view: { kind: "confirm" } },
    {
        label: "Connecting",
        detail: "the host Happy Agent is adding the cloud server",
        view: { kind: "connecting" },
    },
    {
        label: "Failed",
        detail: "the host refused or could not reach the cloud",
        view: { kind: "failed", message: "Happy Cloud isn’t reachable right now." },
    },
];

export function CloudConnectDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The sidebar's + asks before it adds Happy Cloud. Connect adds the cloud server and opens its sign-in."
            title="CloudConnectDialog"
        >
            {SPECIMENS.map((specimen, index) => {
                const number = String(index + 1).padStart(2, "0");
                return (
                    <FullScreenSpecimen
                        detail={`480px card · centered · ${specimen.detail}`}
                        key={specimen.label}
                        label={specimen.label}
                        number={number}
                        screen={`${number}-${specimen.label.toLowerCase()}`}
                        window={WINDOW}
                    >
                        {frame(
                            <CloudConnectDialog
                                onCancel={noop}
                                onConnect={noop}
                                view={specimen.view}
                            />,
                        )}
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
