import { LiquidMetalMark } from "../../src/LiquidMetalMark";
import { OnboardingSky } from "../../src/OnboardingSky";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-340";

const sizes = [160, 128, 96] as const;

/** Each size with its rule; held on Paper's frame 0 so the page is screenshot-safe. */
function Sizes() {
    return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "32px" }}>
            {sizes.map((size) => (
                <div
                    key={size}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "8px",
                    }}
                >
                    <LiquidMetalMark moving={false} size={size} />
                    <DimensionRule label={`${size}px`} />
                </div>
            ))}
        </div>
    );
}

export function LiquidMetalMarkPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The Happy Cloud mark, a cloud with the Happy H cut out of it, in Paper's Liquid Metal. A WebGL 2 square that draws nothing around the cloud, so it sits on any surface; the cloud fills its width. It moves at the display's rate, and holds still with reduced motion, off screen, or in a hidden window. Shown here on frame 0."
            title="Liquid metal mark"
        >
            <Specimen
                detail="160px, 128px and 96px: the desktop stage and the phone apps' tablet and phone art squares (each slide draws the cloud 1.3× its square)"
                label="Sizes"
                number="01"
                stage="surface"
            >
                <Sizes />
            </Specimen>

            <Specimen
                detail="over the onboarding sky in the dark appearance, where the Happy Cloud welcome shows it"
                label="Over the sky"
                number="02"
                stage="surface"
            >
                <ThemeScope mode="dark">
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            width: "640px",
                            height: "280px",
                            overflow: "clip",
                        }}
                    >
                        <OnboardingSky appearance="dark" />
                        <div style={{ display: "flex", position: "relative" }}>
                            <Sizes />
                        </div>
                    </div>
                </ThemeScope>
            </Specimen>
        </ComponentPage>
    );
}
