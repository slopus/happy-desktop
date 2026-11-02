import {
    HappyAgentServerSettings,
    type HappyAgentServerRow,
    type HappyAgentServerSettingsProps,
} from "../../src/pages/settings/HappyAgentServerSettings";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-332";
const noop = () => undefined;
const SERVER_CODE =
    "happy://k3x9q2m7p0a4b8c1d5e6f7g2/server?url=https%3A%2F%2Fhappy.example.com%2F";
const base = {
    chiefOfStaffName: "Chief of Staff",
    onAdd: noop,
    onRemove: noop,
    onSignIn: noop,
    onSignInCancel: noop,
    onUrlChange: noop,
    phase: { kind: "editing" },
    url: "",
} as const;
const engineering = (signIn: HappyAgentServerRow["signIn"]): HappyAgentServerRow => ({
    id: "connection:happy-example-com",
    name: "Example Engineering",
    address: "https://happy.example.com/",
    signIn,
    phoneCode: SERVER_CODE,
});
const cases: readonly (HappyAgentServerSettingsProps & { readonly label: string })[] = [
    { label: "Empty", ...base },
    { label: "Address typed", ...base, url: "https://happy.example.com" },
    {
        label: "Not HTTPS",
        ...base,
        url: "http://happy.example.com",
        urlError: "Servers are reached over HTTPS. Use an https:// address.",
    },
    { label: "Asking", ...base, url: "https://happy.example.com", phase: { kind: "asking" } },
    {
        label: "Couldn't ask",
        ...base,
        url: "https://happy.example.com",
        error: "Chief of Staff is not available on this Happy Agent.",
    },
    {
        label: "Signed in",
        ...base,
        servers: [
            engineering({ kind: "signedIn" }),
            {
                // A loopback test server, or one whose instance is not known
                // yet, has no code a phone could use.
                id: "connection:localhost",
                name: "Local test server",
                address: "http://localhost:8080/",
                signIn: { kind: "signedIn" },
            },
        ],
    },
    {
        label: "Just added",
        ...base,
        servers: [engineering({ kind: "required", message: "Sign in to this server to use it." })],
    },
    {
        label: "Signing in",
        ...base,
        servers: [engineering({ kind: "browser", host: "login.example.com" })],
    },
    {
        label: "Sign-in ended",
        ...base,
        servers: [
            engineering({
                kind: "required",
                message: "Your sign-in to this server ended. Sign in again.",
            }),
        ],
    },
    {
        label: "Sign-in failed",
        ...base,
        servers: [
            engineering({
                kind: "failed",
                message: "The sign-in page said the request was not allowed.",
            }),
        ],
    },
    {
        label: "Offline",
        ...base,
        servers: [engineering({ kind: "signedIn" })],
        unavailable: "The local Happy Agent is reconnecting.",
    },
];

export function HappyAgentServerSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Server settings"
            summary="Team servers: asking the Chief of Staff to add one, and signing in to each in the browser."
        >
            {cases.map(({ label, ...props }, index) => (
                <Specimen
                    key={label}
                    label={label}
                    detail="The servers listed with their sign-in, then the address the Chief of Staff is asked to add"
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
