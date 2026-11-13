import type { ReactNode } from "react";
import { AvatarPlaceholder } from "./AvatarPlaceholder";
import { OnboardingHelp } from "./OnboardingHelp";
import { ProfileSetupForm, type ProfileSetupFormProps } from "./ProfileSetupScreen";
import { SegmentedProgress } from "./SegmentedProgress";
import {
    SetupAssistants,
    type SetupAssistantAction,
    type SetupAssistantEntry,
} from "./SetupAssistants";
import { SetupPage, type SetupPageAction, type SetupPageSecondaryAction } from "./SetupPage";
import { TextField } from "./TextField";
import { Button } from "./Button";
import type { ThemeMode } from "./ThemeScope";
import { Icon } from "./Icon";

/** One step in the bar across the top, in the server's order. */
export interface CloudOnboardingStep {
    readonly id: string;
    readonly label: string;
}

/** A way to connect inference, as one column of the row. */
export interface CloudOnboardingInferenceOption {
    readonly id: "claude" | "chatgpt" | "grok";
    /** Connected already, through the team or the reader's own account. */
    readonly connected: boolean;
    /** A sign-in or dialog this option opened is still going. */
    readonly busy?: boolean;
    readonly onSelect?: () => void;
}

export type CloudOnboardingView =
    | ({
          readonly kind: "profile";
          /** `photo` asks only for the picture, from someone who already has a name. */
          readonly ask: "profile" | "photo";
      } & ProfileSetupFormProps)
    | {
          readonly kind: "adminBot";
          /** The server's words for the step; the defaults stand in when it sends none. */
          readonly title: string;
          readonly description: string;
          readonly name: string;
          readonly avatarUrl: string | null;
          readonly placeholderSeed: string;
          readonly busy: boolean;
          readonly error?: string;
          onNameChange(value: string): void;
          /** Enter in the name field. */
          onSubmit(): void;
      }
    | {
          readonly kind: "inference";
          readonly options: readonly CloudOnboardingInferenceOption[];
          /** Every other way in: API keys and custom endpoints. */
          onOtherSelect?(): void;
          readonly error?: string;
      };

export interface CloudOnboardingScreenProps {
    readonly appearance: ThemeMode;
    /** The server, as its rail tile names it. */
    readonly serverLabel?: string;
    readonly steps: readonly CloudOnboardingStep[];
    readonly currentStep: string;
    readonly view: CloudOnboardingView;
    /** The one thing the page asks for. */
    readonly action?: SetupPageAction;
    /** The quiet way past an optional step. */
    readonly secondary?: SetupPageSecondaryAction;
    onExternalOpen?(url: string): void;
}

const INFERENCE: Readonly<
    Record<
        CloudOnboardingInferenceOption["id"],
        {
            readonly name: string;
            readonly mark: SetupAssistantEntry["mark"];
            readonly action: string;
            readonly detail: string;
        }
    >
> = {
    claude: { name: "Claude", mark: "claude", action: "Sign in", detail: "Pro or Max" },
    chatgpt: { name: "ChatGPT", mark: "openai", action: "Sign in", detail: "Plus or Pro" },
    grok: { name: "Grok", mark: "grok", action: "Add key", detail: "xAI API key" },
};

/** The reserved line under a form where a refusal is said, so it never moves the page. */
function Hint(props: { readonly text: string | undefined }) {
    return (
        <p
            className="happy-cloud-onboarding__hint"
            data-tone={props.text ? "attention" : undefined}
            role="status"
        >
            {props.text}
        </p>
    );
}

function inferenceEntry(option: CloudOnboardingInferenceOption): SetupAssistantEntry {
    const known = INFERENCE[option.id];
    const action: SetupAssistantAction = option.connected
        ? { kind: "done", label: "Connected" }
        : {
              kind: "button",
              label: known.action,
              ...(option.busy ? { busy: true } : {}),
              ...(option.onSelect ? { onSelect: option.onSelect } : {}),
          };
    return {
        id: option.id,
        name: known.name,
        mark: known.mark,
        status: option.connected ? "found" : "signed-out",
        detail: known.detail,
        action,
    };
}

function page(
    view: CloudOnboardingView,
    serverLabel: string | undefined,
): { readonly title: string; readonly copy: string; readonly body: ReactNode } {
    const server = serverLabel ?? "your server";
    switch (view.kind) {
        case "profile":
            return view.ask === "photo"
                ? {
                      title: "Add a photo",
                      copy: "So your team can tell you apart at a glance.",
                      body: <ProfileSetupForm {...view} />,
                  }
                : {
                      title: "Create your profile",
                      copy: `This is how your team and agents see you on ${server}.`,
                      body: <ProfileSetupForm {...view} />,
                  };
        case "adminBot":
            return {
                title: view.title || "Name your admin bot",
                copy: `Your admin bot runs ${server} with you.`,
                body: (
                    <div
                        className="happy-cloud-onboarding__admin-bot"
                        data-happy-desktop-ui="cloud-onboarding-admin-bot"
                    >
                        <span className="happy-cloud-onboarding__bot-avatar">
                            {view.avatarUrl ? (
                                <img
                                    alt=""
                                    className="happy-cloud-onboarding__bot-photo"
                                    draggable={false}
                                    src={view.avatarUrl}
                                />
                            ) : (
                                <AvatarPlaceholder
                                    className="happy-cloud-onboarding__bot-photo"
                                    seed={view.placeholderSeed}
                                    side={96}
                                />
                            )}
                            <span className="happy-cloud-onboarding__bot-mark" aria-hidden>
                                <Icon name="shield" size={14} />
                            </span>
                        </span>
                        <TextField
                            aria-label="Admin bot name"
                            autoFocus
                            className="happy-cloud-onboarding__name"
                            disabled={view.busy}
                            fullWidth
                            onSubmit={view.onSubmit}
                            onValueChange={view.onNameChange}
                            placeholder="Chief of Staff"
                            size="large"
                            value={view.name}
                        />
                        <Hint text={view.error} />
                        <div
                            className="happy-cloud-onboarding__note"
                            data-happy-desktop-ui="cloud-onboarding-note"
                        >
                            <span className="happy-cloud-onboarding__note-title">
                                <Icon name="shield" size={14} />
                                Admin bot · expanded capabilities
                            </span>
                            <p className="happy-cloud-onboarding__note-text">{view.description}</p>
                        </div>
                    </div>
                ),
            };
        case "inference":
            return {
                title: "Connect your AI",
                copy: "Sign in to one you already use, or add a key. You can add more later.",
                body: (
                    <div
                        className="happy-cloud-onboarding__inference"
                        data-happy-desktop-ui="cloud-onboarding-inference"
                    >
                        <SetupAssistants assistants={view.options.map(inferenceEntry)} />
                        {view.onOtherSelect ? (
                            <Button
                                className="happy-cloud-onboarding__other"
                                onClick={view.onOtherSelect}
                                size="small"
                                variant="ghost"
                            >
                                Use an API key or a custom provider
                            </Button>
                        ) : null}
                        <Hint text={view.error} />
                    </div>
                ),
            };
    }
}

/**
 * C-345 CloudOnboardingScreen — a Happy Cloud server's onboarding, one gate per
 * page, in the order the server lists them.
 *
 * Every gate is drawn by this one `SetupPage` so the backdrop and the step bar
 * stay mounted while only the words and the body change. Which gate shows,
 * and whether it can be skipped, is the caller's: the server decides, and
 * this component only draws what it decided.
 */
export function CloudOnboardingScreen(props: CloudOnboardingScreenProps) {
    const current = page(props.view, props.serverLabel);
    const currentIndex = props.steps.findIndex((step) => step.id === props.currentStep);
    return (
        <SetupPage
            {...(props.action ? { action: props.action } : {})}
            {...(props.secondary ? { secondary: props.secondary } : {})}
            backdrop={{ appearance: props.appearance, kind: "sky" }}
            className="happy-cloud-onboarding"
            copy={current.copy}
            data-testid="cloud-onboarding-screen"
            help={<OnboardingHelp onExternalOpen={props.onExternalOpen} />}
            // Centred, like the Happy Cloud pages that lead here: a gate's body
            // varies in height, and the centred bands hold it at every size.
            placement="centered"
            steps={
                props.steps.length > 1 ? (
                    <SegmentedProgress
                        label="Setup"
                        mode="steps"
                        segments={props.steps.map((step, index) => ({
                            id: step.id,
                            label: step.label,
                            state:
                                index < currentIndex
                                    ? "done"
                                    : index === currentIndex
                                      ? "running"
                                      : "pending",
                        }))}
                        // The sky follows the appearance, and so does the ink on it.
                        tone="default"
                    />
                ) : undefined
            }
            title={current.title}
            transitionKey={props.currentStep}
        >
            {current.body}
        </SetupPage>
    );
}
