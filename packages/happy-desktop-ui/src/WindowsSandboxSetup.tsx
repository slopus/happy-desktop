import { OnboardingSteps } from "./OnboardingSteps";
import { SetupPage } from "./SetupPage";
import type { ThemeMode } from "./ThemeScope";

export type WindowsSandboxSetupState = "before" | "waiting" | "unfinished";

export interface WindowsSandboxSetupProps {
    readonly appearance: ThemeMode;
    readonly state: WindowsSandboxSetupState;
    /** Starts explicit setup, or an explicit retry after the previous attempt ended. */
    onContinue(): void;
}

/** The Windows-only step after Subscriptions. Rendering never starts setup. */
export function WindowsSandboxSetup(props: WindowsSandboxSetupProps) {
    const waiting = props.state === "waiting";
    const status = waiting
        ? "Waiting for Windows…"
        : props.state === "unfinished"
          ? "Sandbox setup didn’t finish."
          : "Windows needs administrator permission to set up the sandbox.";
    return (
        <SetupPage
            backdrop={{ appearance: props.appearance, kind: "sky" }}
            className="happy-windows-sandbox"
            data-testid="windows-sandbox-setup"
            transitionKey="windows-sandbox"
            steps={<OnboardingSteps scope="desktop" stage="sandbox" />}
            scene="spider-catching-bug"
            title="Set up a safety net for agents"
            copy="Happy’s sandbox lets agents work with fewer interruptions. Auto review helps catch unintended actions when they request access beyond it."
            status={{ label: status }}
            action={{
                label: props.state === "unfinished" ? "Try again" : "Set up sandbox",
                busy: waiting,
                onSelect: props.onContinue,
            }}
        />
    );
}
