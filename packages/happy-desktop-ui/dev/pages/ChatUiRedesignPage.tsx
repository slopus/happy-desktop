import type { ReactNode } from "react";
import type {
    ConversationMediaItem,
    HappyAgentDefaultModelSnapshot,
    ProviderCli,
} from "happy-desktop-state";
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
import { UiImages, type UiImagesLayout } from "../../src/ui/UiImages";
import { UiProviderSignIn } from "../../src/ui/UiLiveWidgets";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import {
    complaintConnect,
    complaintCreateProfile,
    generatedLandscape,
    generatedPortrait,
    readWide,
    readWideSecond,
    thumbnails,
} from "./conversationMediaLayoutFixtures";
import { Agent, ChatColumn, Person, Replies, Stage } from "./ProviderSignInDirectionsPage";
import { CLAUDE_TWO, CODEX_ONE, GROK_MISSING } from "./providerSignInFixtures";

/*
 * PROTOTYPE — chat UI onboarding experiment. Every chat UI component in the
 * redesigned language, each in the reply that would show it, in the order the
 * walkthrough plays them. Fixture data only.
 */
export const componentNumber = "C-338r";

const STILL = 0;
const NOW = 1_762_700_000_000;

const asset = (name: string) => new URL(`../assets/${name}`, import.meta.url).href;

const picture = (
    name: string,
    width: number,
    height: number,
    url: string,
): ConversationMediaItem => ({
    kind: "image",
    name,
    mimeType: "image/webp",
    size: 0,
    width,
    height,
    url,
});

const DESKTOP = picture("desktop.webp", 960, 540, asset("crop-landscape.webp"));
const PHONE = picture("phone.webp", 480, 640, asset("crop-portrait.webp"));
const COVER = picture("launch.webp", 1600, 900, asset("feed-cover-launch.webp"));

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

const images = (
    items: readonly ConversationMediaItem[],
    captions: readonly string[],
    layout: UiImagesLayout,
) => <UiImages captions={captions} items={items} layout={layout} onItemOpen={() => undefined} />;

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
        id: "02-images-hero",
        label: "Images · one hero",
        height: 560,
        body: () => (
            <Agent body="The launch cover, final:">
                {images([COVER], ["Launch cover · 1600 × 900"], "hero")}
            </Agent>
        ),
    },
    {
        id: "03-images-hero-portrait",
        label: "Images · a tall hero",
        height: 600,
        body: () => (
            <Agent body="A tall one keeps its shape and sits on the reply's edge:">
                {images([generatedPortrait], ["Ridge at night"], "hero")}
            </Agent>
        ),
    },
    {
        id: "04-images-compare",
        label: "Images · before and after",
        height: 420,
        body: () => (
            <Agent body="Before and after the spacing pass:">
                {images([readWide, readWideSecond], ["Before", "After"], "compare")}
            </Agent>
        ),
    },
    {
        id: "05-images-compare-mixed",
        label: "Images · two shapes compared",
        height: 470,
        body: () => (
            <Agent body="The same screen on desktop and on a phone, at one height:">
                {images([DESKTOP, PHONE], ["Desktop", "Phone"], "compare")}
            </Agent>
        ),
    },
    {
        id: "06-images-grid",
        label: "Images · a grid of four",
        height: 600,
        body: () => (
            <Agent body="Four directions for the header art. Which one?">
                {images(
                    thumbnails.slice(0, 4),
                    ["1 · Warm", "2 · Coast", "3 · Lilac", "4 · Meadow"],
                    "grid",
                )}
            </Agent>
        ),
    },
    {
        id: "07-images-grid-three",
        label: "Images · a grid of three",
        height: 400,
        body: () => (
            <Agent body="The three onboarding screens as they are now:">
                {images(
                    [complaintCreateProfile, complaintConnect, generatedLandscape],
                    ["Create profile", "Connect harnesses", "Welcome art"],
                    "grid",
                )}
            </Agent>
        ),
    },
    {
        id: "08-images-strip",
        label: "Images · a strip of twelve",
        height: 330,
        body: () => (
            <Agent body="All twelve renders, small. Open any to see it full size.">
                {images(
                    [...thumbnails, ...thumbnails],
                    [...thumbnails, ...thumbnails].map((_, index) => `Render ${String(index + 1)}`),
                    "strip",
                )}
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
        id: "18-provider-sign-in-today",
        label: "Provider sign-in on today's contract",
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
    {
        id: "19-quick-replies",
        label: "Quick replies, with what each is about",
        height: 360,
        body: () => (
            <>
                <Agent body="Which AI should I work with? You already have a couple." />
                <Replies
                    options={[
                        { text: "Add another Codex account", about: CODEX_ONE },
                        { text: "Add another Claude Code account", about: CLAUDE_TWO },
                        { text: "Set up Grok", about: GROK_MISSING },
                        "That's all for now",
                    ]}
                />
                <Person body="That's all for now" suggested />
            </>
        ),
    },
];

export function ChatUiRedesignPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="PROTOTYPE. Every chat UI component in one language: a hairline frame, one 58px row per thing, the words on the reply's edge and its controls ending on one edge. Images lay out as a hero, a comparison, a grid or a strip. Fixture data."
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
