import { SegmentedProgress, type SegmentedProgressSegment } from "./SegmentedProgress";

/**
 * Setup, end to end, as one flat sequence. Mobile is two ordinary steps rather
 * than a branch: a sequence that nests inside itself has to be read twice to
 * answer where you are.
 */
export type OnboardingStage = "setup" | "subscriptions" | "sandbox" | "get-app" | "connect-phone";
/** The same two mobile steps, on their own, for Settings rather than first run. */
export type MobileOnboardingStage = "get-app" | "connect-phone" | "complete";

export type OnboardingStepsProps =
    | {
          readonly scope: "desktop";
          readonly stage: OnboardingStage;
          /** Native readiness decides whether this Windows-only step is in the flow. */
          readonly sandbox?: boolean;
          /**
           * The furthest step setup actually reached. After going back, the
           * steps between here and there stay faint like any step ahead: the
           * bar shows where you are, and `selectable` says where you can go.
           */
          readonly reached?: OnboardingStage;
          readonly failed?: boolean;
          /**
           * The steps the flow can send you to from here, behind or ahead.
           * Absent, every finished step before the current one.
           */
          readonly selectable?: readonly OnboardingStage[];
          /** Goes to a step the bar offers. */
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
    { id: "sandbox", label: "Sandbox" },
    { id: "get-app", label: "Get Mobile App" },
    { id: "connect-phone", label: "Link Mobile App" },
] as const satisfies readonly {
    readonly id: OnboardingStage;
    readonly label: string;
}[];
const mobileStages = [
    { id: "get-app", label: "Get Mobile App" },
    { id: "connect-phone", label: "Link Mobile App" },
] as const;

function segments(
    stages: readonly { readonly id: string; readonly label: string }[],
    current: string,
    complete: boolean,
    failed: boolean,
    selectable?: readonly string[],
    onStageSelect?: (stage: string) => void,
): readonly SegmentedProgressSegment[] {
    const currentIndex = stages.findIndex((stage) => stage.id === current);
    return stages.map((stage, index) => {
        // The bar says where you are. A step ahead of this one is drawn ahead
        // even when it was reached before someone stepped back: drawing it
        // finished would put the strongest ink on a step you are not on.
        const state = complete
            ? ("done" as const)
            : index === currentIndex
              ? failed
                  ? ("failed" as const)
                  : ("running" as const)
              : index < currentIndex
                ? ("done" as const)
                : ("pending" as const);
        const offered =
            index !== currentIndex &&
            (selectable
                ? selectable.includes(stage.id)
                : // Native sandbox setup is completed once, not a revisitable form.
                  stage.id !== "sandbox" && index < currentIndex);
        return {
            ...stage,
            state,
            // A user-paced current step occupies its whole segment; colour,
            // rather than width, places it between completed and untouched.
            ...(state === "running" ? { fraction: 1 } : {}),
            // Only where the flow says it has somewhere to send you.
            ...(onStageSelect && offered ? { onSelect: () => onStageSelect(stage.id) } : {}),
        };
    });
}

/** One flat sequence of named steps; earlier ones are clickable when re-entrant. */
export function OnboardingSteps(props: OnboardingStepsProps) {
    const complete = props.scope === "mobile" && props.stage === "complete";
    const primary =
        props.scope === "desktop"
            ? segments(
                  desktopStages.filter(
                      (stage) =>
                          stage.id !== "sandbox" || props.sandbox || props.stage === "sandbox",
                  ),
                  props.stage,
                  false,
                  props.failed === true,
                  props.selectable,
                  props.onStageSelect as ((stage: string) => void) | undefined,
              )
            : segments(mobileStages, props.stage, complete, props.failed === true);
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
