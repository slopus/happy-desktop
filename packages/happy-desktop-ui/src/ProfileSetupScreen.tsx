import { OnboardingHelp } from "./OnboardingHelp";
import { SetupPage } from "./SetupPage";
import { TextField } from "./TextField";
import type { ThemeMode } from "./ThemeScope";

export interface ProfileSetupScreenProps {
    readonly appearance: ThemeMode;
    readonly busy: boolean;
    readonly email: string;
    readonly message?: string;
    readonly name: string;
    /**
     * What is asked: the whole profile, or only the name, where the person's
     * account already gave the email. Defaults to the whole profile.
     */
    readonly ask?: "profile" | "name";
    /** Opens an external page: the host owns how a link leaves the app. */
    onExternalOpen?(url: string): void;
    onNameChange(value: string): void;
    onEmailChange(value: string): void;
    onCreate(): void;
}

/**
 * The profile a remote Happy Agent asks a new team member for before it lets
 * them in. Local setup never asks for one, so this page is not part of the
 * desktop's first-run sequence and draws no step bar.
 */
export function ProfileSetupScreen(props: ProfileSetupScreenProps) {
    const nameOnly = props.ask === "name";
    return (
        <SetupPage
            action={{
                busy: props.busy,
                disabled: !props.name.trim() || !props.email.trim(),
                label: nameOnly ? "Continue" : "Create profile",
                onSelect: props.onCreate,
            }}
            backdrop={{ appearance: props.appearance, kind: "sky" }}
            copy={
                nameOnly
                    ? "Your teammates see it on your work."
                    : "Shown on your commits and messages."
            }
            data-testid="profile-setup-screen"
            help={<OnboardingHelp onExternalOpen={props.onExternalOpen} />}
            scene="disguised-face"
            {...(props.message ? { status: { label: props.message } } : {})}
            title={nameOnly ? "What should your teammates call you?" : "Create your profile"}
            transitionKey="profile-setup"
        >
            <div className="happy-local-onboarding__profile-form">
                <TextField
                    autoFocus
                    fullWidth
                    label="Name"
                    onSubmit={props.onCreate}
                    onValueChange={props.onNameChange}
                    placeholder="Your name"
                    required
                    value={props.name}
                />
                {nameOnly ? null : (
                    <TextField
                        fullWidth
                        label="Git email"
                        onSubmit={props.onCreate}
                        onValueChange={props.onEmailChange}
                        placeholder="you@example.com"
                        required
                        type="email"
                        value={props.email}
                    />
                )}
            </div>
        </SetupPage>
    );
}
