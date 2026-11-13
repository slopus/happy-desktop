import { Suspense, use, useState } from "react";
import type { GenUiAction } from "../../src/genUi/genUiRender";
import { GenUiRenderView } from "../../src/genUi/GenUiRenderView";
import {
    GEN_UI_SCREEN_WIDTH,
    GenUiScreen,
    genUiFixtureRead,
    genUiFixtures,
    type GenUiFixture,
} from "../genUiFixtures";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-342";

type Reported = (elementKey: string, action: GenUiAction) => void;

function Fixture(props: { fixture: GenUiFixture; index: number; onAction: Reported }) {
    const { fixture } = props;
    const document = fixture.document;
    const failed = "error" in document;
    return (
        <Specimen
            detail={failed ? `Could not read: ${document.error}` : (document.fallback ?? "")}
            label={fixture.name}
            number={String(props.index + 1).padStart(2, "0")}
            stage="surface"
        >
            {failed ? null : (
                <GenUiScreen name={fixture.name}>
                    <GenUiRenderView
                        document={document}
                        fileUrl={fixture.fileUrl}
                        onAction={props.onAction}
                        still
                    />
                </GenUiScreen>
            )}
        </Specimen>
    );
}

function Fixtures(props: { picked: readonly GenUiFixture[]; onAction: Reported }) {
    const fixtures = props.picked.length > 0 ? props.picked : use(genUiFixtures);
    return fixtures.map((fixture, index) => (
        <Fixture
            fixture={fixture}
            index={index}
            key={`${index}-${fixture.name}`}
            onAction={props.onAction}
        />
    ));
}

export function GenUiPage() {
    const [picked, setPicked] = useState<readonly GenUiFixture[]>([]);
    const [reported, setReported] = useState("No action yet");
    return (
        <ComponentPage
            number={componentNumber}
            title="Gen UI"
            summary="A Gen UI render document, as the daemon compiles it, drawn from its primitives as part of a reply. Actions are reported, not run: the last one shows above the documents. Shows the built-in reference documents, or any documents named with ?documents=<directory URL> (listed by its index.json) or ?document=<URL>, or picked below."
            width={GEN_UI_SCREEN_WIDTH + 96}
        >
            <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span>Render local documents</span>
                <input
                    accept=".json,application/json"
                    multiple
                    onChange={(event) => {
                        const files = [...(event.currentTarget.files ?? [])].sort((left, right) =>
                            left.name.localeCompare(right.name),
                        );
                        void Promise.all(
                            files.map(async (file) =>
                                genUiFixtureRead(
                                    file.name.replace(/(\.render)?\.json$/u, ""),
                                    await file.text(),
                                ),
                            ),
                        ).then(setPicked);
                    }}
                    type="file"
                />
            </label>
            <p>{`Last action: ${reported}`}</p>
            <Suspense fallback={<p>Loading documents…</p>}>
                <Fixtures
                    onAction={(elementKey, action) =>
                        setReported(`${elementKey} → ${JSON.stringify(action)}`)
                    }
                    picked={picked}
                />
            </Suspense>
        </ComponentPage>
    );
}
