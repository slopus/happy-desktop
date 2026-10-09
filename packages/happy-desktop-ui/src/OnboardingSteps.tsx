import { SegmentedProgress, type SegmentedProgressSegment } from "./SegmentedProgress";

/**
 * Setup, end to end, as one flat sequence. Mobile is two ordinary steps rather
 * than a branch: a sequence that nests inside itself has to be read twice to
 * answer where you are.
 */
export type OnboardingStage = "setup" | "subscriptions" | "get-app" | "connect-phone";
/** The same two mobile steps, on their own, for Settings rather than first run. */
export type MobileOnboardingStage = "get-app" | "connect-phone" | "complete";

export type OnboardingStepsProps =
    | {
          readonly scope: "desktop";
          readonly stage: OnboardingStage;
          /**
           * The furthest step setup actually reached. Going back to an earlier
           * step lights that step without unwinding what is already done.
           */
          readonly reached?: OnboardingStage;
          readonly failed?: boolean;
          /** Returns to an earlier step, when that step can be returned to. */
          onStageSelect?(stage: OnboardingStage): void;
      }
    | {
          readonly scope: "mobile";
          readonly stage: MobileOnboardingStage;
          readonly failed?: boolean;
      };

const desktopStages = [
    { id: "setup", label: "Setup" },
    { id: "subscriptions", label: "Subscriptions" },
    { id: "get-app", label: "Get Mobile App" },
    { id: "connect-phone", label: "Link Mobile App" },
] as const satisfies readonly { readonly id: OnboardingStage; readonly label: string }[];
const mobileStages = [
    { id: "get-app", label: "Get Mobile App" },
    { id: "connect-phone", label: "Link Mobile App" },
] as const;

function segments(
    stages: readonly { readonly id: string; readonly label: string }[],
    current: string,
    reached: string,
    complete: boolean,
    failed: boolean,
    onStageSelect?: (stage: string) => void,
): readonly SegmentedProgressSegment[] {
    const currentIndex = stages.findIndex((stage) => stage.id === current);
    const reachedIndex = Math.max(
        currentIndex,
        stages.findIndex((stage) => stage.id === reached),
    );
    return stages.map((stage, index) => {
        const state = complete
            ? ("done" as const)
            : index === currentIndex
              ? failed
                  ? ("failed" as const)
                  : ("running" as const)
              : // Behind the current step, or already passed before someone
                // stepped back to an earlier one: both are finished work.
                index < currentIndex || index <= reachedIndex
                ? ("done" as const)
                : ("pending" as const);
        return {
            ...stage,
            state,
            // A user-paced current step occupies its whole segment; colour,
            // rather than width, places it between completed and untouched.
            ...(state === "running" ? { fraction: 1 } : {}),
            // Only a step already passed can be returned to, and only when the flow
            // says it has somewhere to send you.
            ...(onStageSelect && index < currentIndex
                ? { onSelect: () => onStageSelect(stage.id) }
                : {}),
        };
    });
}

/** One flat sequence of named steps; earlier ones are clickable when re-entrant. */
export function OnboardingSteps(props: OnboardingStepsProps) {
    const complete = props.scope === "mobile" && props.stage === "complete";
    const primary =
        props.scope === "desktop"
            ? segments(
                  desktopStages,
                  props.stage,
                  props.reached ?? props.stage,
                  false,
                  props.failed === true,
                  props.onStageSelect as ((stage: string) => void) | undefined,
              )
            : segments(mobileStages, props.stage, props.stage, complete, props.failed === true);
    return (
        <div className="happy-onboarding-steps" data-happy-desktop-ui="onboarding-steps">
            <SegmentedProgress
                label={props.scope === "desktop" ? "Onboarding steps" : "Mobile setup steps"}
                mode="steps"
                tone="inverse"
                segments={primary}
            />
        </div>
    );
}
