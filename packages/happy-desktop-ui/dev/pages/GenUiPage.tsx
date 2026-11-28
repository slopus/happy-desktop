import { Suspense, use, useState } from "react";
import type { GenUiAction } from "../../src/genUi/genUiRender";
import { genUiRenderParse } from "../../src/genUi/genUiRender";
import { GenUiRenderView } from "../../src/genUi/GenUiRenderView";
import {
    GEN_UI_SCREEN_WIDTH,
    GenUiScreen,
    genUiFixtureRead,
    genUiFixtures,
    type GenUiFixture,
} from "../genUiFixtures";
import { ComponentPage, Specimen } from "../kit";
import { ConversationView } from "../../src/ConversationView";
import { genUiMessageEntry } from "../genUiMessageFixture";

export const componentNumber = "C-342";

const github = { type: "plugin", plugin: { id: "github" } } as const;
const linear = { type: "plugin", plugin: { id: "linear" } } as const;

/** A plugin button and a plugin choice, each before and after its setup was reported. */
const pluginSetup = genUiRenderParse({
    genuiRender: 1,
    root: "root",
    elements: {
        root: { type: "box", props: { gap: "items" }, children: ["buttons", "choices"] },
        buttons: {
            type: "box",
            props: { role: "actions", direction: "row" },
            children: ["connect", "connected"],
        },
        connect: { type: "button", props: { label: "Connect GitHub", action: github } },
        connected: { type: "button", props: { label: "Connect Linear", action: linear } },
        choices: {
            type: "box",
            props: { divide: "inset" },
            children: ["choice", "chosen"],
        },
        choice: { type: "press", props: { role: "item", action: github }, children: ["github"] },
        chosen: { type: "press", props: { role: "item", action: linear }, children: ["linear"] },
        github: { type: "text", props: { role: "item", spans: [{ text: "GitHub" }] } },
        linear: { type: "text", props: { role: "item", spans: [{ text: "Linear" }] } },
    },
});
const PLUGIN_REPORTED: ReadonlySet<string> = new Set(["connected", "chosen"]);

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
            <Specimen
                label="Direct message"
                detail="A gen_ui tool result without an artifact catalog or file lookup."
                number="00"
                stage="surface"
            >
                <div style={{ display: "flex", height: 400, width: GEN_UI_SCREEN_WIDTH }}>
                    <ConversationView
                        conversationId="blueprint-direct-gen-ui"
                        entries={[genUiMessageEntry]}
                        dock={null}
                        genUi={{
                            actionsSupported: new Set(["message", "open", "copy", "plugin"]),
                            onAction: (key, action) =>
                                setReported(`${key} → ${JSON.stringify(action)}`),
                        }}
                    />
                </div>
            </Specimen>
            <Specimen
                label="Plugin set up"
                detail="A plugin button and choice before and after the host reported the plugin set up: done, and still opening the plugin's page."
                number="00b"
                stage="surface"
            >
                <GenUiScreen name="plugin-setup">
                    <GenUiRenderView
                        document={pluginSetup}
                        fileUrl={(path) => path}
                        onAction={(key, action) =>
                            setReported(`${key} → ${JSON.stringify(action)}`)
                        }
                        reported={PLUGIN_REPORTED}
                        still
                    />
                </GenUiScreen>
            </Specimen>
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
