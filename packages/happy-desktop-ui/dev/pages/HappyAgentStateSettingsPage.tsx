import {
    HappyAgentStateSettings,
    type HappyAgentStateDocument,
} from "../../src/pages/settings/HappyAgentStateSettings";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-277";

/* Real snapshot shapes, trimmed to what fits a specimen. The point of the panel
   is that a value appears exactly as its store holds it, so the fixtures are
   printed the way the app prints them rather than prettified by hand. */
const cloud = JSON.stringify(
    {
        authorizationCompleting: false,
        authorizationStarting: false,
        disconnecting: false,
        environment: "production",
        status: "connected",
        user: { email: "steve@korshakov.com", id: "user_01M0VHKVABK55EDXXTTN41FS28" },
    },
    null,
    2,
);

const profile = JSON.stringify(
    {
        dirty: false,
        email: "steve@korshakov.com",
        loading: false,
        name: "Steve Korshakov",
        saving: false,
    },
    null,
    2,
);

/* One line long enough to prove the value scrolls sideways rather than
   re-flowing: pretty-printed JSON that wraps is harder to read than one that
   does not. */
const instructions = JSON.stringify(
    {
        bytes: 184,
        dirty: true,
        draft: "Prefer the smallest diff that solves the problem, and never reformat a file you did not otherwise change in the same commit.",
        saving: false,
        stored: { type: "ready" },
    },
    null,
    2,
);

const documents: readonly HappyAgentStateDocument[] = [
    {
        description: "WorkOS account authentication",
        id: "cloud",
        label: "Cloud",
        value: cloud,
    },
    {
        description: "The identity this machine authors work as",
        id: "profile",
        label: "Profile",
        value: profile,
    },
    {
        description: "Machine-wide AGENTS.md, as stored and as drafted",
        id: "instructions",
        label: "Instructions",
        value: instructions,
    },
];

export function HappyAgentStateSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Every live store snapshot the settings window holds, printed verbatim under Dev Tools. Each document is one store's own value serialized by its owner: nothing is summarized, relabelled, or filtered, so a state question is answered by reading rather than by inferring it from what the ordinary screens happen to render. Each panel is bounded at 320px and copyable whole."
            title="Raw state"
        >
            <Specimen
                detail="three stores · 40px header carrying the store name, its one-line description, and a copy control · 320px bounded scrollport in the mono face"
                label="Several stores"
                number="01"
                stage="surface"
            >
                <div style={{ display: "flex", width: "720px" }}>
                    <HappyAgentStateSettings documents={documents} />
                </div>
            </Specimen>

            <Specimen
                detail="one store · the value keeps its own indentation and scrolls sideways instead of re-flowing"
                label="One store"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", width: "560px" }}>
                    <HappyAgentStateSettings documents={documents.slice(0, 1)} />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
