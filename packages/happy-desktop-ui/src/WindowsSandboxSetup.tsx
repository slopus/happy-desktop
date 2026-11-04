import { Ionicon } from "./vectorIcons/VectorIcon";
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
          ? "That didn’t finish. Try again?"
          : "Windows will ask once. Choose Yes.";
    return (
        <SetupPage
            backdrop={{ appearance: props.appearance, kind: "sky" }}
            className="happy-windows-sandbox"
            data-testid="windows-sandbox-setup"
            transitionKey="windows-sandbox"
            steps={<OnboardingSteps scope="desktop" stage="sandbox" />}
            title="Let Happy work safely on its own"
            copy="Happy keeps agents in a safe space where they can only change your project. Anything riskier gets checked first."
            status={{ label: status }}
            action={{ label: "Set up", busy: waiting, onSelect: props.onContinue }}
        >
            <div
                aria-label="Agents work with your project inside the sandbox. Changes to the rest of your PC need a separate check."
                className="happy-windows-sandbox__diagram"
                role="img"
            >
                <div className="happy-windows-sandbox__boundary" aria-hidden="true">
                    <span className="happy-windows-sandbox__label">Sandbox</span>
                    <span className="happy-windows-sandbox__item">
                        <Ionicon name="terminal-outline" size={20} />
                        <span>Agent + your project</span>
                    </span>
                </div>
                <div className="happy-windows-sandbox__private" aria-hidden="true">
                    <Ionicon name="lock-closed-outline" size={24} />
                    <span>Rest of your PC</span>
                </div>
            </div>
        </SetupPage>
    );
}
