import type { WelcomeSlide } from "happy-desktop-ui";

/** The same welcome deck for the main app and each connection's onboarding. */
export const happyAgentWelcomeSlides: readonly WelcomeSlide[] = [
    {
        art: { kind: "logo" },
        copy: "Happy is open source, so anyone can check what it does. Run it on hardware you trust, and reach it from your phone with end-to-end encryption.",
        id: "happy",
        title: "Work with AI as a team. Safely.",
    },
    {
        art: { kind: "scene", name: "alien-monster" },
        copy: "Bring your team into one session with every agent. Anyone can share context, steer the conversation, approve decisions, and take over in real time.",
        id: "team",
        title: "Natively multiplayer",
    },
    {
        art: { kind: "scene", name: "llama" },
        copy: "Let Claude plan, Codex build, and Grok review—or run them side by side and compare. The context stays together across every handoff.",
        id: "mix",
        title: "One harness. Every agent.",
    },
    {
        art: { kind: "scene", name: "wand" },
        copy: "Happy is open source and built to be changed. Run it on your hardware, in your cloud, or in ours—then change Happy to fit your team’s needs.",
        id: "open",
        title: "Yours to run. Yours to change.",
    },
];
