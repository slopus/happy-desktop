import { type ReactNode } from "react";
import { CodeBlock, CodeBlockFrame, codeBlockLanguage } from "../../src/CodeBlock";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-174";

const typescript = `import { CodeBlock } from "happy-desktop-ui";

/** One renderer for every piece of code the product shows. */
export function Snippet(props: { text: string }) {
    return <CodeBlock lang="typescript" text={props.text} />;
}
`;

const shell = `# Rebuild the desktop app and open the blueprint
pnpm --filter happy-desktop-app build
pnpm --filter happy-desktop-ui dev --open '#code-block'
`;

const plain = `Not every block names a language, and a block that names
one nobody has heard of is still a block. Both read as text.`;

function frame(children: ReactNode, width = 720) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                overflow: "hidden",
                padding: "12px",
                width: `${width}px`,
            }}
        >
            {children}
        </div>
    );
}

export function CodeBlockPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Code with syntax highlighting, wherever code is read: the source face of the file viewer and every fenced block in a document. A Markdown frame adds one top-right copy action without covering the code or its scrollbar. Colors follow the surrounding theme through color-scheme, so there is no appearance prop to thread."
            title="CodeBlock"
        >
            <Specimen
                detail="Language from the file name · numbered lines"
                label="File"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {frame(<CodeBlock lineNumbers name="Snippet.tsx" text={typescript} />)}
                    <DimensionRule label="12 px type · 20 px line · 720 px region" />
                </div>
            </Specimen>

            <Specimen
                detail="Language from a Markdown fence · no gutter"
                label="Fence"
                number="02"
                stage="surface"
            >
                {frame(
                    <CodeBlockFrame text={shell}>
                        <CodeBlock lang={codeBlockLanguage("bash")} text={shell} />
                    </CodeBlockFrame>,
                )}
            </Specimen>

            <Specimen
                detail="An unlabelled or unknown fence reads as text rather than failing"
                label="Plain"
                number="03"
                stage="surface"
            >
                {frame(<CodeBlock lang={codeBlockLanguage("pseudocode")} text={plain} />)}
            </Specimen>

            <Specimen
                detail="The same block on the dark face — one renderer, no appearance prop"
                label="Dark"
                number="04"
                stage="surface"
            >
                <div className="happy-theme-dark" style={{ borderRadius: "10px" }}>
                    {frame(<CodeBlock lineNumbers name="Snippet.tsx" text={typescript} />)}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
