import { HappyAgentPasswordSettings, HappyAgentSettingsShell } from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "P-012d";

const noop = () => {};

function PasswordSettingsSpecimen(props: {
    readonly label: string;
    readonly detail: string;
    readonly number: string;
    readonly screen?: string;
    readonly window?: { readonly width: number; readonly height: number };
    readonly available: boolean;
}) {
    return (
        <FullScreenSpecimen
            detail={props.detail}
            label={props.label}
            number={props.number}
            screen={props.screen}
            window={props.window ?? { width: 720, height: 640 }}
        >
            <div style={{ display: "flex", contain: "layout paint" }}>
                <HappyAgentSettingsShell
                    activeCategoryId="passwords"
                    categories={[
                        { id: "general", icon: "settings", label: "General", tone: "gray" },
                        {
                            group: "Agents",
                            id: "passwords",
                            icon: "lock",
                            label: "Passwords",
                            tone: "red",
                        },
                    ]}
                    description="Saved logins from your browsers"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Passwords"
                >
                    <HappyAgentPasswordSettings available={props.available} />
                </HappyAgentSettingsShell>
            </div>
        </FullScreenSpecimen>
    );
}

export function HappyAgentPasswordSettingsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The one-sentence promise about logins saved in the person's browsers."
            title="Passwords settings"
        >
            <PasswordSettingsSpecimen
                available
                detail="1100 × 760 desktop window on macOS or Windows"
                label="Saved logins"
                number="01"
                screen="01-passwords-1100x760"
                window={{ width: 1100, height: 760 }}
            />
            <PasswordSettingsSpecimen
                available
                detail="720 × 640 minimum desktop window"
                label="Saved logins — minimum desktop"
                number="02"
                screen="01-passwords-720x640"
            />
            <PasswordSettingsSpecimen
                available={false}
                detail="A host that reads no saved logins, such as Linux"
                label="Unavailable"
                number="03"
            />
        </ComponentPage>
    );
}
