import type { ReactNode } from "react";
import { HappyLinkNoticeDialog, type HappyLinkNoticeView } from "../../src/HappyLinkNoticeDialog";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-333";

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
    readonly view: HappyLinkNoticeView;
    readonly servers: boolean;
}[] = [
    {
        label: "Unknown server",
        detail: "no connection is the server the link names · Servers to add it",
        view: { kind: "unknownServer" },
        servers: true,
    },
    {
        label: "Unknown server · no Servers",
        detail: "a window that cannot add servers offers only OK",
        view: { kind: "unknownServer" },
        servers: false,
    },
    {
        label: "Unreachable",
        detail: "the server is known but did not come online within a minute",
        view: { kind: "unreachable", label: "Example Engineering" },
        servers: false,
    },
    {
        label: "Unsupported",
        detail: "a link with no server, or one Happy for desktop does not open",
        view: { kind: "unsupported" },
        servers: false,
    },
];

export function HappyLinkNoticeDialogPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="Why a Happy link from a browser or another app was not opened. A link opens only on the server it names, so the notice never offers another one."
            title="HappyLinkNoticeDialog"
        >
            {SPECIMENS.map((specimen, index) => {
                const number = String(index + 1).padStart(2, "0");
                const slug = specimen.label
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "");
                return (
                    <FullScreenSpecimen
                        detail={`480px card · centered · ${specimen.detail}`}
                        key={specimen.label}
                        label={specimen.label}
                        number={number}
                        screen={`${number}-${slug}`}
                        window={WINDOW}
                    >
                        {frame(
                            <HappyLinkNoticeDialog
                                onClose={noop}
                                view={specimen.view}
                                {...(specimen.servers ? { onServersOpen: noop } : {})}
                            />,
                        )}
                    </FullScreenSpecimen>
                );
            })}
        </ComponentPage>
    );
}
