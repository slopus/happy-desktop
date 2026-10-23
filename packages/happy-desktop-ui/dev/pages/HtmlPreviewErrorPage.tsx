import { type ReactNode } from "react";
import type { HtmlPreviewFailure } from "../../src/htmlPreview";
import { HtmlPreviewError } from "../../src/HtmlPreviewError";
import { HtmlPreviewFrame } from "../../src/HtmlPreviewFrame";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-239";

/* The preview origin is an opaque local name derived from the document's own
   folder; only the path in it names the reader's file, which is why that is the
   only part of an address the failure ever shows. */
const source = "http://8f3a1c62d4b95e07a1c3f5d6e7b8a9c0.localhost/docs/release-notes.html";

function region(children: ReactNode, height = 300, width = 720) {
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                height: `${height}px`,
                overflow: "hidden",
                position: "relative",
                width: `${width}px`,
            }}
        >
            {children}
        </div>
    );
}

function specimen(failure: HtmlPreviewFailure) {
    return region(<HtmlPreviewError failure={failure} />);
}

export function HtmlPreviewErrorPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="What a preview region says instead of a page. One host-reported failure becomes a short title, a line of plain explanation, and the engine's own detail underneath. It carries no control: a preview reloads when the file behind it changes."
            title="HTML preview error"
        >
            <Specimen
                detail="Happy asked where to publish the file and got no answer — the file is fine, its page has nowhere to load from"
                label="No address"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {specimen({
                        kind: "address-unavailable",
                        path: "docs/release-notes.html",
                        detail: "The workspace is no longer connected.",
                    })}
                    <DimensionRule label="720 × 300 px region · sheet fills it whole · 24 px padding" />
                </div>
            </Specimen>

            <Specimen
                detail="No path and no host detail — the words stand alone rather than an empty detail line appearing"
                label="No address, nothing else known"
                number="02"
                stage="surface"
            >
                {specimen({ kind: "address-unavailable" })}
            </Specimen>

            <Specimen
                detail="The preview server answered 404: renamed, deleted, or a file a page cannot load"
                label="Nothing served there"
                number="03"
                stage="surface"
            >
                {specimen({ kind: "load-failed", source, status: 404 })}
            </Specimen>

            <Specimen
                detail="The file is past the size a preview will pull into a page"
                label="Too large"
                number="04"
                stage="surface"
            >
                {specimen({ kind: "load-failed", source, status: 413 })}
            </Specimen>

            <Specimen
                detail="Any other status from the server Happy publishes the document through"
                label="Server error"
                number="05"
                stage="surface"
            >
                {specimen({
                    kind: "load-failed",
                    source,
                    status: 500,
                    description: "Internal Server Error",
                })}
            </Specimen>

            <Specimen
                detail="The load never committed — the local server did not answer at all"
                label="Not being served"
                number="06"
                stage="surface"
            >
                {specimen({
                    kind: "load-failed",
                    source,
                    code: -102,
                    description: "ERR_CONNECTION_REFUSED",
                })}
            </Specimen>

            <Specimen
                detail="The published address no longer resolves"
                label="Address gone"
                number="07"
                stage="surface"
            >
                {specimen({
                    kind: "load-failed",
                    source,
                    code: -105,
                    description: "ERR_NAME_NOT_RESOLVED",
                })}
            </Specimen>

            <Specimen
                detail="An engine failure with no case of its own still shows exactly what the engine said"
                label="Unrecognised engine failure"
                number="08"
                stage="surface"
            >
                {specimen({
                    kind: "load-failed",
                    source,
                    code: -352,
                    description: "ERR_BLOCKED_BY_RESPONSE",
                })}
            </Specimen>

            <Specimen
                detail="The process drawing the page ended while it was on screen"
                label="Renderer gone"
                number="09"
                stage="surface"
            >
                {specimen({ kind: "renderer-gone", source, detail: "crashed" })}
            </Specimen>

            <Specimen
                detail="A build with no engine at all — the document is readable as source and nothing is pending"
                label="No engine"
                number="10"
                stage="surface"
            >
                {specimen({ kind: "unsupported" })}
            </Specimen>

            <Specimen
                detail="A renderer newer than the app around it — the app cannot yet serve this file as a page, and its source stays a toggle away"
                label="App outdated"
                number="11"
                stage="surface"
            >
                {specimen({ kind: "app-outdated" })}
            </Specimen>

            <Specimen
                detail="Inside the frame: the failure covers the region the page would occupy"
                label="In the preview frame"
                number="12"
                stage="surface"
            >
                {region(
                    <HtmlPreviewFrame
                        failure={{ kind: "load-failed", source, status: 404 }}
                        source={source}
                    />,
                    240,
                )}
            </Specimen>
        </ComponentPage>
    );
}
