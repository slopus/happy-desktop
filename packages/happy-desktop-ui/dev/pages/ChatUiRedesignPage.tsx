import type { ReactNode } from "react";
import type { HappyAgentDefaultModelSnapshot, ProviderCli } from "happy-desktop-state";
import type { MobileDirectConnectorState } from "../../src/MobileDirectConnection";
import {
    UiComputeJoinRows,
    UiDefaultModelRow,
    UiFileTreeList,
    UiGithubRow,
    UiInviteRow,
    UiPhoneAppCard,
    UiPhonePairCard,
} from "../../src/ui/UiCards";
import { UiProviderSignIn } from "../../src/ui/UiLiveWidgets";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { Agent, ChatColumn, Stage } from "./chatUiSpecimen";

/*
 * PROTOTYPE — chat UI onboarding experiment. Every chat UI component in the
 * redesigned language, each in the reply that would show it, in the order the
 * walkthrough plays them. Fixture data only.
 */
export const componentNumber = "C-338r";

const STILL = 0;
const NOW = 1_762_700_000_000;

const MODELS: HappyAgentDefaultModelSnapshot = {
    loading: false,
    current: { providerId: "codex", modelId: "openai/gpt-6.1-sol", effort: "medium" },
    choices: [
        {
            providerId: "codex",
            providerName: "Codex",
            modelId: "openai/gpt-6.1-sol",
            modelName: "GPT-6.1 Sol",
            efforts: ["low", "medium", "high", "xhigh"],
            defaultEffort: "medium",
        },
        {
            providerId: "claude",
            providerName: "Claude Code",
            modelId: "anthropic/opus-5-5",
            modelName: "Opus 5.5",
            efforts: ["low", "medium", "high"],
            defaultEffort: "medium",
        },
    ],
};

const connector = (
    pairing: Partial<
        NonNullable<Extract<MobileDirectConnectorState, { kind: "ready" }>["connector"]["pairing"]>
    > | null,
    devices: readonly string[] = [],
): MobileDirectConnectorState => ({
    kind: "ready",
    connector: {
        status: "open",
        error: null,
        devices: devices.map((name, index) => ({
            id: `phone-${String(index)}`,
            name,
            platform: "ios",
            createdAt: NOW - 86_400_000,
            lastSeenAt: NOW,
        })),
        pairing:
            pairing === null
                ? null
                : {
                      id: "pairing-1",
                      status: "waiting",
                      qr: null,
                      expiresAt: NOW + 272_000,
                      device: null,
                      emoji: null,
                      desktopConfirmed: false,
                      mobileConfirmed: false,
                      error: null,
                      ...pairing,
                  },
    },
});

const CODEX_CLI: ProviderCli = {
    id: "codex",
    name: "Codex",
    vendor: "OpenAI",
    website: "https://openai.com/codex",
    providerId: "codex",
    installation: {
        status: "installed",
        path: "/Users/you/.local/bin/codex",
        version: "0.61.0",
        source: "standalone",
        desktopApp: null,
    },
    installer: {
        command: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
        sourceUrl: "https://chatgpt.com/codex/install.sh",
        sourceHost: "chatgpt.com",
        vendorSite: "https://openai.com/codex",
    },
    commands: { run: "codex", signIn: "codex login" },
    signIn: { status: "signed_out", account: null, methods: ["browser", "device"] },
    operation: null,
    version: "1",
    updatedAt: 0,
};

/** Later states of the same component, under the first, as the chat would show them in turn. */
function Then(props: { readonly children: ReactNode }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {props.children}
        </div>
    );
}

const act = () => new Promise<never>(() => undefined);
const control = { act, allowed: () => true };

type Screen = {
    readonly id: string;
    readonly label: string;
    readonly height: number;
    readonly body: () => ReactNode;
};

const SCREENS: readonly Screen[] = [
    {
        id: "01-file-tree",
        label: "File tree",
        height: 380,
        body: () => (
            <Agent body="Here's what I changed in **weather-cli**:">
                <UiFileTreeList
                    entries={[
                        {
                            path: "weather-cli/src/index.ts",
                            status: "modified",
                            note: "reads --units",
                        },
                        {
                            path: "weather-cli/src/forecast.ts",
                            status: "added",
                            note: "the 5-day fetch",
                        },
                        { path: "weather-cli/src/ui/table.ts", status: "added" },
                        { path: "weather-cli/src/legacy.ts", status: "deleted" },
                        { path: "weather-cli/package.json", status: "modified" },
                        { path: "weather-cli/README.md" },
                    ]}
                />
            </Agent>
        ),
    },
    {
        id: "09-default-model",
        label: "Default model",
        height: 230,
        body: () => (
            <Agent body="New chats will start on this model. Change it here any time.">
                <UiDefaultModelRow onChange={() => undefined} state={MODELS} />
            </Agent>
        ),
    },
    {
        id: "10-phone-app",
        label: "Phone app",
        height: 320,
        body: () => (
            <Agent body="Get Happy on your phone first:">
                <UiPhoneAppCard />
            </Agent>
        ),
    },
    {
        id: "11-phone-pair",
        label: "Phone pair · start",
        height: 320,
        body: () => (
            <Agent body="Then pair it with this computer:">
                <UiPhonePairCard connector={connector(null)} now={NOW} onStart={() => undefined} />
            </Agent>
        ),
    },
    {
        id: "12-phone-pair-code",
        label: "Phone pair · the code",
        height: 320,
        body: () => (
            <Agent body="Then pair it with this computer:">
                <UiPhonePairCard
                    connector={connector({})}
                    now={NOW}
                    onCancel={() => undefined}
                    qr="happy-pair:fixture-not-a-real-code-0123456789abcdef"
                />
            </Agent>
        ),
    },
    {
        id: "13-phone-pair-emoji",
        label: "Phone pair · compare the emoji",
        height: 320,
        body: () => (
            <Agent body="Then pair it with this computer:">
                <UiPhonePairCard
                    connector={connector({
                        status: "verifying",
                        device: { name: "Ada's iPhone", platform: "ios" },
                        emoji: ["🦊", "🌵", "🎈", "🍋"],
                    })}
                    now={NOW}
                    onCancel={() => undefined}
                    onConfirm={() => undefined}
                />
            </Agent>
        ),
    },
    {
        id: "14-phone-pair-done",
        label: "Phone pair · paired",
        height: 320,
        body: () => (
            <Agent body="Then pair it with this computer:">
                <UiPhonePairCard
                    connector={connector({
                        status: "completed",
                        device: { name: "Ada's iPhone", platform: "ios" },
                    })}
                    now={NOW}
                />
            </Agent>
        ),
    },
    {
        id: "15-invite",
        label: "Team · invite",
        height: 330,
        body: () => (
            <Agent body="Invite your teammates:">
                <Then>
                    <UiInviteRow
                        creating={false}
                        loading={false}
                        manage
                        onCreate={() => undefined}
                        owner
                        roles={[
                            { id: "admin", name: "Admin" },
                            { id: "member", name: "Member" },
                        ]}
                    />

                    <UiInviteRow
                        created={{
                            code: "K7Q-29F",
                            detail: "joins acme as Member · expires in 7 days",
                            message: "Join acme on Happy: K7Q-29F",
                        }}
                        creating={false}
                        loading={false}
                        manage
                        onCreatedDismiss={() => undefined}
                        owner
                        roles={[{ id: "member", name: "Member" }]}
                    />
                </Then>
            </Agent>
        ),
    },
    {
        id: "16-github",
        label: "Team · GitHub",
        height: 360,
        body: () => (
            <Agent body="Link GitHub so I can open pull requests as you:">
                <Then>
                    <UiGithubRow busy={false} onStart={() => undefined} usable />

                    <UiGithubRow
                        busy={false}
                        device={{ userCode: "WDJB-MJHT", uri: "https://github.com/login/device" }}
                        onPageOpen={() => undefined}
                        spinnerFrame={STILL}
                        usable
                    />
                    <UiGithubRow busy={false} connectedAs="ada-lovelace" usable />
                </Then>
            </Agent>
        ),
    },
    {
        id: "17-compute-join",
        label: "Team · add a machine",
        height: 360,
        body: () => (
            <Agent body="Add a build machine to the pool:">
                <Then>
                    <UiComputeJoinRows
                        busy={false}
                        machines={{
                            loading: false,
                            machines: [{ id: "n1", name: "mac-mini-studio", status: "online" }],
                        }}
                        onCreate={() => undefined}
                        pool="Build machines"
                        usable
                    />

                    <UiComputeJoinRows
                        busy={false}
                        commands={[
                            "curl -fsSL https://acme.example/join.sh | sh -s -- --token ••••••••",
                        ]}
                        machines={{
                            loading: false,
                            machines: [{ id: "n1", name: "mac-mini-studio", status: "online" }],
                        }}
                        pool="Build machines"
                        usable
                    />
                    <UiComputeJoinRows
                        busy={false}
                        machines={{
                            loading: false,
                            machines: [
                                { id: "n1", name: "mac-mini-studio", status: "online" },
                                { id: "n2", name: "linux-builder-2", status: "enrolling" },
                            ],
                        }}
                        pool="Build machines"
                        spinnerFrame={STILL}
                        usable
                    />
                </Then>
            </Agent>
        ),
    },
    {
        id: "18-provider-sign-in",
        label: "Provider sign-in",
        height: 300,
        body: () => (
            <Agent body="Sign in to Codex and I'll take it from there:">
                <Then>
                    <UiProviderSignIn cli={CODEX_CLI} control={control} provider="codex" />

                    <UiProviderSignIn
                        cli={{
                            ...CODEX_CLI,
                            signIn: {
                                status: "signed_in",
                                account: { email: "ada@example.com", plan: "Pro" },
                                methods: ["browser"],
                            },
                        }}
                        control={control}
                        provider="codex"
                    />
                </Then>
            </Agent>
        ),
    },
];

export function ChatUiRedesignPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="PROTOTYPE. Every chat UI component in one language: a hairline frame, one 58px row per thing, the words on the reply's edge and its controls ending on one edge. Media, quick replies and the gradual sign-in are on C-338x. Fixture data."
            title="Chat UI redesign"
        >
            <div className="specimen-grid">
                {SCREENS.map((screen) => (
                    <FullScreenSpecimen
                        detail={screen.id}
                        key={screen.id}
                        label={screen.label}
                        number={`${componentNumber}-${screen.id.slice(0, 2)}`}
                        screen={screen.id}
                        window={{ width: 760, height: screen.height }}
                    >
                        <Stage>
                            <ChatColumn>{screen.body()}</ChatColumn>
                        </Stage>
                    </FullScreenSpecimen>
                ))}
            </div>
        </ComponentPage>
    );
}
