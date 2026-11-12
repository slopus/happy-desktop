import { OnboardingSky } from "../../src/OnboardingSky";
import { ThemeScope } from "../../src/ThemeScope";
import { WelcomeDeck, type WelcomeSlide } from "../../src/WelcomeDeck";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-276";

/*
 * Placeholder slides. The words belong to whichever surface carries the deck;
 * these exist so the page shows a logo slide, a scene slide, and a slide whose
 * copy is long enough to prove the dots below it do not move.
 */
const brand: WelcomeSlide = {
    id: "happy",
    art: { kind: "logo" },
    title: "Happy",
    copy: "The desktop where your agents work beside you.",
};
const cloud: WelcomeSlide = {
    id: "cloud",
    art: { kind: "cloud" },
    title: "Happy Cloud",
    copy: "A hardened, high-performance control plane for your agents, hosted by Happy.",
};
const agents: WelcomeSlide = {
    id: "agents",
    art: { kind: "scene", name: "robot" },
    title: "Agents that stay",
    copy: "Start a session, close the lid, come back to finished work.",
};
const build: WelcomeSlide = {
    id: "build",
    art: { kind: "scene", name: "wand" },
    title: "Build it here",
    copy: "The screen you wish existed is one you can make from inside the app.",
};
const clear: WelcomeSlide = {
    id: "clear",
    art: { kind: "scene", name: "sparkles" },
    title: "Nothing left over",
    copy: "Finished work closes itself.",
};
/* Deliberately three wrapped lines against the one-line slide above it. */
const long: WelcomeSlide = {
    id: "long",
    art: { kind: "scene", name: "owl" },
    title: "Everything you left running",
    copy: "Sessions on this machine and on every machine your Happy Agent is peered with come back to the same window, in the same order you left them, whether they finished while you were watching or overnight.",
};

/** The measured column both hosts give the deck, so every specimen wraps the same way. */
function DeckFrame(props: { readonly children: React.ReactNode; readonly width?: number }) {
    const width = props.width ?? 520;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: `${width}px` }}>
            <div style={{ display: "flex", width: `${width}px` }}>{props.children}</div>
            <DimensionRule label={`${width}px deck column`} />
        </div>
    );
}

/** The sky presentation is only honest over the picture it is tinted for. */
function SkyFrame(props: { readonly children: React.ReactNode }) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                width: "640px",
                height: "440px",
                padding: "40px",
                overflow: "clip",
            }}
        >
            <OnboardingSky appearance="dark" />
            <div style={{ display: "flex", position: "relative", width: "100%" }}>
                {props.children}
            </div>
        </div>
    );
}

export function WelcomeDeckPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The slide deck two surfaces share: a 160px art stage, a 32px title, a slogan on a 400px measure, and a row of dot controls. It advances itself every 15s and wraps; a dot or an arrow key restarts the clock, and a reader who asked for reduced motion never sees it move. The words are the caller's; the layout, the timing, and the promise that nothing below it shifts are the deck's."
            title="Welcome deck"
        >
            <Specimen
                detail="opens on the logo slide · 120px mark inside the 160px stage, 32px title, 400px slogan measure, 20px dot boxes with 8px marks"
                label="First slide"
                number="01"
                stage="surface"
            >
                <DeckFrame>
                    <WelcomeDeck label="Welcome slides" slides={[brand, agents, build, clear]} />
                </DeckFrame>
            </Specimen>

            <Specimen
                detail="the same deck rotated so it opens on a Lottie slide · the scene and the smaller mark share one 160px stage, so both start their words at the same y"
                label="Scene slide"
                number="02"
                stage="surface"
            >
                <DeckFrame>
                    <WelcomeDeck label="Welcome slides" slides={[agents, build, clear, brand]} />
                </DeckFrame>
            </Specimen>

            <Specimen
                detail="a one-line slogan against a three-line one, in identical frames · the words are a one-cell stack sized to the deck's longest slide, so the dots hold the same y in both"
                label="Long copy does not move the dots"
                number="03"
                stage="surface"
            >
                <div style={{ display: "flex", gap: "24px" }}>
                    <DeckFrame>
                        <WelcomeDeck
                            label="Welcome slides"
                            slides={[clear, brand, agents, build]}
                        />
                    </DeckFrame>
                    <DeckFrame>
                        <WelcomeDeck label="Welcome slides" slides={[long, brand, agents, build]} />
                    </DeckFrame>
                </div>
            </Specimen>

            <Specimen
                detail="a single-slide deck drops the dot row entirely — one dot is not a position, and a control that cannot choose anything is noise"
                label="One slide"
                number="04"
                stage="surface"
            >
                <DeckFrame>
                    <WelcomeDeck label="Welcome slides" slides={[brand]} />
                </DeckFrame>
            </Specimen>

            <Specimen
                detail={`tint="sky" · white words over one of the brand paintings, and position reads as a single 20px capsule inside 28px hit boxes rather than a row of theme-coloured beads`}
                label="Sky tint"
                number="05"
                stage="surface"
            >
                <ThemeScope mode="dark">
                    <SkyFrame>
                        <WelcomeDeck
                            label="Welcome slides"
                            slides={[agents, build, clear]}
                            tint="sky"
                        />
                    </SkyFrame>
                </ThemeScope>
            </Specimen>

            <Specimen
                detail={`the Happy Cloud welcome's first slide · the liquid metal cloud (C-340) in a 208px square, 1.3× the 160px stage on its centre; it spills only sideways, so its title sits where every other slide's does`}
                label="Cloud slide"
                number="06"
                stage="surface"
            >
                <ThemeScope mode="dark">
                    <SkyFrame>
                        <WelcomeDeck
                            label="Happy Cloud"
                            slides={[cloud, agents, clear]}
                            tint="sky"
                        />
                    </SkyFrame>
                </ThemeScope>
            </Specimen>
        </ComponentPage>
    );
}
