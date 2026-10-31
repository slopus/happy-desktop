import { ClayIcon, clayIconSlugs } from "../../src/ClayIcon";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-332";
const grid = { display: "flex", flexWrap: "wrap", gap: "12px", width: "760px" } as const;
export function ClayIconPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The clay library a task wears as its picture, by the slug the naming job picks. An unknown slug falls back to the row's avatar tile."
            title="Clay icon"
        >
            {[40, 20].map((size, index) => (
                <Specimen
                    detail={`${clayIconSlugs.length} slugs · ${size}px · @40 and @64 rasters`}
                    key={size}
                    label={size === 40 ? "Card disc" : "Row mark lane"}
                    number={`0${index + 1}`}
                    stage="surface"
                >
                    <div style={grid}>
                        {clayIconSlugs.map((slug) => (
                            <span key={slug} title={slug}>
                                <ClayIcon label={slug} size={size} slug={slug} />
                            </span>
                        ))}
                    </div>
                </Specimen>
            ))}
            <Specimen detail="unknown slug · no slug" label="Fallback" number="03" stage="surface">
                <div style={grid}>
                    <ClayIcon label="Retired slug" size={40} slug="retired-slug" />
                    <ClayIcon label="No icon yet" size={20} slug={null} />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
