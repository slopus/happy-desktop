import {
    HappyAgentServerSettings,
    type HappyAgentServerSettingsProps,
} from "../../src/pages/settings/HappyAgentServerSettings";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-332";
const noop = () => undefined;
const handlers = { onAdd: noop, onCancel: noop, onUrlChange: noop };
const cases: readonly (HappyAgentServerSettingsProps & { readonly label: string })[] = [
    { label: "Empty", url: "", phase: { kind: "editing" }, ...handlers },
    {
        label: "Address typed",
        url: "https://happy.example.com",
        phase: { kind: "editing" },
        ...handlers,
    },
    {
        label: "Not HTTPS",
        url: "http://happy.example.com",
        phase: { kind: "editing" },
        urlError: "Servers are reached over HTTPS. Use an https:// address.",
        ...handlers,
    },
    {
        label: "Contacting",
        url: "https://happy.example.com",
        phase: { kind: "adding" },
        ...handlers,
    },
    {
        label: "Signing in",
        url: "https://happy.example.com",
        phase: { kind: "signingIn", host: "login.example.com" },
        ...handlers,
    },
    {
        label: "Sign-in failed",
        url: "https://happy.example.com",
        phase: { kind: "editing" },
        error: "The sign-in page said the request was not allowed (access_denied).",
        ...handlers,
    },
    {
        label: "Set by the organization",
        url: "https://happy.corp.example",
        phase: { kind: "editing" },
        locked: true,
        ...handlers,
    },
    {
        label: "Adding refused",
        url: "",
        phase: { kind: "editing" },
        refused: true,
        ...handlers,
    },
    {
        label: "Offline",
        url: "",
        phase: { kind: "editing" },
        unavailable: "The local Happy Agent is reconnecting.",
        ...handlers,
    },
];

export function HappyAgentServerSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Server settings"
            summary="Adding a team server by its HTTPS address, signed in through the browser. Managed settings can preset the address or refuse adding one."
        >
            {cases.map(({ label, ...props }, index) => (
                <Specimen
                    key={label}
                    label={label}
                    detail="Address field with its one action, then progress or the failure"
                    number={String(index + 1).padStart(2, "0")}
                    stage="surface"
                >
                    <div
                        data-screen={`${String(index + 1).padStart(2, "0")}-${label.toLowerCase().replaceAll(" ", "-")}`}
                        style={{ display: "flex", flexDirection: "column", width: 640 }}
                    >
                        <HappyAgentServerSettings {...props} />
                    </div>
                </Specimen>
            ))}
        </ComponentPage>
    );
}
