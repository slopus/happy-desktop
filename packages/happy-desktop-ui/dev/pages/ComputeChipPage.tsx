import { ComposerFooterBar } from "../../src/ConversationDock";
import { ComputeChip } from "../../src/ComputeChip";
import { ContextMeter } from "../../src/ContextMeter";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-337";
export function ComputeChipPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Where a cloud conversation's shell, file and git tools run, in the composer's control row. Every cloud conversation starts with no machine; the agent attaches a pool or one machine when the work needs it. The chip is read-only text: the agent, not the chip, changes it."
            title="Compute chip"
        >
            <Specimen
                detail="no machine yet · a pool, online · one machine, online · one machine, offline · a computer, online · a computer, offline"
                label="States"
                number="01"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: "12px",
                    }}
                >
                    <ComputeChip compute={{ kind: "none" }} />
                    <ComputeChip compute={{ kind: "pool", label: "Lab machines", online: true }} />
                    <ComputeChip compute={{ kind: "runner", label: "build-1", online: true }} />
                    <ComputeChip compute={{ kind: "runner", label: "build-2", online: false }} />
                    <ComputeChip
                        compute={{ kind: "computer", label: "Build farm", online: true }}
                    />
                    <ComputeChip compute={{ kind: "computer", label: "laptop", online: false }} />
                </div>
            </Specimen>
            <Specimen
                detail="in the composer's control row, before the context meter"
                label="In the composer row"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <ComposerFooterBar
                        leading={<span style={{ fontSize: 12 }}>Auto</span>}
                        trailing={
                            <>
                                <ComputeChip
                                    compute={{ kind: "pool", label: "Lab machines", online: true }}
                                />
                                <ContextMeter totalTokens={500_000} usedTokens={1_300} />
                            </>
                        }
                    />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
