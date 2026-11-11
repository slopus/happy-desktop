import { FormRow } from "../../src/FormRow";
import { HappyAgentSettingsGroup } from "../../src/pages/settings/HappyAgentSettingsShell";
import { IconTile, type IconTileTone } from "../../src/IconTile";
import { Switch } from "../../src/Switch";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-340";

const tones: readonly IconTileTone[] = [
    "gray",
    "blue",
    "indigo",
    "purple",
    "red",
    "orange",
    "green",
    "teal",
];

const row: Record<string, string> = { alignItems: "center", display: "flex", gap: "12px" };
const column: Record<string, string> = { display: "flex", flexDirection: "column", gap: "14px" };
const noop = () => undefined;

export function IconTilePage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="A white glyph on a filled rounded square: the mark that leads a settings category in the column and a settings row in its group."
            title="Icon tile"
        >
            <Specimen
                detail="20px · radius 5 · 14px glyph — a sidebar's glyph lane"
                label="Small — every tone"
                number="01"
                stage="app"
            >
                <div style={column}>
                    <div style={row}>
                        {tones.map((tone) => (
                            <IconTile icon="settings" key={tone} size="small" tone={tone} />
                        ))}
                    </div>
                    <DimensionRule label="20 px square" />
                </div>
            </Specimen>
            <Specimen
                detail="28px · radius 7 · 18px glyph — the head of a settings row"
                label="Medium — every tone"
                number="02"
                stage="app"
            >
                <div style={column}>
                    <div style={row}>
                        {tones.map((tone) => (
                            <IconTile icon="lock" key={tone} tone={tone} />
                        ))}
                        <IconTile ionicon="logo-apple" tone="gray" />
                        <IconTile ionicon="qr-code-outline" tone="green" />
                    </div>
                    <DimensionRule label="28 px square" />
                </div>
            </Specimen>
            <Specimen
                detail="An inset group: rows split by hairlines, the last closed by the card's edge"
                label="In a settings group"
                number="03"
                stage="app"
            >
                <div style={{ width: "560px" }}>
                    <HappyAgentSettingsGroup>
                        <FormRow
                            control={<Switch aria-label="Voice calls" checked onChange={noop} />}
                            description="Adds a phone beside Settings."
                            icon={<IconTile icon="call" tone="orange" />}
                            label="Voice calls"
                        />
                        <FormRow
                            control={
                                <Switch aria-label="Fast mode" checked={false} onChange={noop} />
                            }
                            description="Asks for the priority tier."
                            icon={<IconTile icon="zap" tone="purple" />}
                            label="Fast mode"
                        />
                    </HappyAgentSettingsGroup>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
