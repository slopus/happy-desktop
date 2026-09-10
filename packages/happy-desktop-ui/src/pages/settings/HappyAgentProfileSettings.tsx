import { Avatar } from "../../Avatar";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export interface HappyAgentProfileSettingsProps {
    /** The name in the field, which is the stored one until it is edited. */
    readonly name: string;
    readonly email: string;
    readonly imageUrl?: string;
    /** True while the fields differ from what this machine has stored. */
    readonly dirty?: boolean;
    readonly loading?: boolean;
    readonly saving?: boolean;
    /** Why the profile could not be read at all. */
    readonly error?: string;
    /** Why the last save was refused. */
    readonly saveError?: string;
    /** Why the profile cannot currently be saved. */
    readonly unavailable?: string;
    onNameChange(value: string): void;
    onEmailChange(value: string): void;
    onRevert(): void;
    onSave(): void;
}

const initials = (name: string): string =>
    name
        .trim()
        .split(/\s+/u)
        .slice(0, 2)
        .map((part) => part[0] ?? "")
        .join("")
        .toLocaleUpperCase();

/**
 * The Profile category: the one identity this machine authors work as, edited
 * where it is shown. There is no list and no separate editor — the fields are
 * the profile, and a save is offered only once they differ from what is stored.
 *
 * The fields are ordinary settings rows rather than a bordered card. Every other
 * category in this window is a block of hairline-separated rows, and a card here
 * made the profile look like an object sitting inside settings instead of a part
 * of them. What remains above the rows is the identity itself — the avatar, the
 * name, and the email — which is a summary of who this
 * machine is, not a control.
 *
 * The block carries no title of its own. The category header directly above it
 * already reads "Profile", and a second heading saying the same word was the
 * only thing between it and the first field.
 */
export function HappyAgentProfileSettings(props: HappyAgentProfileSettingsProps) {
    const blocked = props.unavailable !== undefined;
    return (
        <HappyAgentSettingsSection>
            {props.unavailable ? <Banner tone="warning">{props.unavailable}</Banner> : null}
            {props.error ? (
                <Banner tone="danger" title="Profile unavailable">
                    {props.error}
                </Banner>
            ) : null}
            {props.loading ? (
                <Box className="happy-agent-settings__pending">
                    <Spinner size={16} />
                    <span>Reading the profile…</span>
                </Box>
            ) : (
                <form
                    className="happy-agent-profile"
                    data-happy-desktop-ui="happy-agent-profile"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!blocked) props.onSave();
                    }}
                >
                    <Box className="happy-agent-profile__identity">
                        <Avatar
                            imageUrl={props.imageUrl}
                            initials={initials(props.name) || "?"}
                            size="lg"
                        />
                        <Box className="happy-agent-profile__naming">
                            <Box className="happy-agent-profile__line">
                                <span className="happy-agent-profile__name">
                                    {props.name.trim() === "" ? "Unnamed" : props.name}
                                </span>
                            </Box>
                            <span className="happy-agent-profile__status">
                                {props.email.trim() === "" ? "No Git email yet" : props.email}
                            </span>
                        </Box>
                    </Box>
                    {props.saveError ? (
                        <Banner tone="danger" title="Not saved">
                            {props.saveError}
                        </Banner>
                    ) : null}
                    <FormRow
                        control={
                            <TextField
                                className="happy-agent-profile__field"
                                disabled={blocked}
                                onValueChange={props.onNameChange}
                                placeholder="Your name"
                                size="medium"
                                value={props.name}
                            />
                        }
                        description="Shown on work this machine authors"
                        label="Name"
                    />
                    <FormRow
                        control={
                            <TextField
                                className="happy-agent-profile__field"
                                disabled={blocked}
                                onValueChange={props.onEmailChange}
                                placeholder="you@example.com"
                                size="medium"
                                type="email"
                                value={props.email}
                            />
                        }
                        description="The Git author address on every commit made here"
                        label="Git email"
                    />
                    {/* No saved-state line: both controls are disabled until
                        the fields differ from what is stored, so the pair
                        already says whether there is anything unsaved, and Save
                        carries its own spinner while the write is in flight. */}
                    <Box className="happy-agent-profile__actions">
                        <Button
                            disabled={!props.dirty || props.saving}
                            onClick={props.onRevert}
                            size="small"
                            variant="ghost"
                        >
                            Revert
                        </Button>
                        <Button
                            disabled={blocked || !props.dirty}
                            loading={props.saving}
                            size="small"
                            type="submit"
                            variant="primary"
                        >
                            Save
                        </Button>
                    </Box>
                </form>
            )}
        </HappyAgentSettingsSection>
    );
}
