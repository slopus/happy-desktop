import type { ReactNode } from "react";
import { OnboardingSteps } from "./OnboardingSteps";
import { SetupPage, type SetupPageProps } from "./SetupPage";
import type { ThemeMode } from "./ThemeScope";

export type WindowsSandboxSetupState = "before" | "waiting" | "unfinished";

export interface WindowsSandboxSetupProps {
    readonly appearance: ThemeMode;
    readonly state: WindowsSandboxSetupState;
    /** Onboarding's own step bar, when it is drawn inside the full sequence. */
    readonly steps?: ReactNode;
    /** Pinned bottom-right, the way the rest of setup carries it. */
    readonly help?: ReactNode;
    /** Pinned top-left: whose setup this is. */
    readonly identity?: ReactNode;
    /** Starts explicit setup, or an explicit retry after the previous attempt ended. */
    onContinue(): void;
}

/** The Windows-only step after Subscriptions. Rendering never starts setup. */
export function WindowsSandboxSetup(props: WindowsSandboxSetupProps) {
    return <SetupPage {...windowsSandboxSetupPage(props)} />;
}

/**
 * The same step as a setup page, for a flow that draws every step with one
 * retained `SetupPage` so its sky and step bar stay put between steps.
 */
export function windowsSandboxSetupPage(props: WindowsSandboxSetupProps): SetupPageProps {
    const waiting = props.state === "waiting";
    const status = waiting
        ? "Waiting for Windows…"
        : props.state === "unfinished"
          ? "Sandbox setup didn’t finish."
          : "Windows needs administrator permission to set up the sandbox.";
    return {
        action: {
            busy: waiting,
            label: props.state === "unfinished" ? "Try again" : "Set up sandbox",
            onSelect: props.onContinue,
        },
        backdrop: { appearance: props.appearance, kind: "sky" },
        className: "happy-windows-sandbox",
        copy: "Happy’s sandbox lets agents work with fewer interruptions. Auto review helps catch unintended actions when they request access beyond it.",
        "data-testid": "windows-sandbox-setup",
        ...(props.help ? { help: props.help } : {}),
        ...(props.identity ? { identity: props.identity } : {}),
        scene: "spider-catching-bug",
        status: { label: status },
        steps: props.steps ?? <OnboardingSteps scope="desktop" stage="sandbox" />,
        title: "Set up a safety net for agents",
        transitionKey: "windows-sandbox",
    };
}
