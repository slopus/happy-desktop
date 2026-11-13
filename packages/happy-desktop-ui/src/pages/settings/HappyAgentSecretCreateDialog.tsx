import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Switch } from "../../Switch";
import { TextField } from "../../TextField";

export interface HappyAgentSecretVariableDraft {
    readonly id: number;
    readonly name: string;
    readonly value: string;
    /** Already stored on the secret the form changes: its name stays, and an empty value keeps it. */
    readonly stored?: boolean;
    /** What the value is, as the agent asking for it described it. */
    readonly hint?: string;
}

export interface HappyAgentSecretCreateDraft {
    readonly availableToAgents: boolean;
    readonly description: string;
    readonly nextVariableId: number;
    readonly variables: readonly HappyAgentSecretVariableDraft[];
}

/** The secret's own name, which a Gen UI `secret` form asks for. */
export interface HappyAgentSecretNameDraft {
    readonly value: string;
    /** The form changes the secret by this name, so the name is shown but not edited. */
    readonly locked: boolean;
    onChange(value: string): void;
}

export interface HappyAgentSecretCreateDialogProps {
    readonly attempted: boolean;
    /** Opens with a name field; Settings creates secrets without one. */
    readonly name?: HappyAgentSecretNameDraft;
    readonly title?: string;
    readonly submitLabel?: string;
    /** Every new variable needs a value; a stored one may keep its own. */
    readonly valuesRequired?: boolean;
    readonly draft: HappyAgentSecretCreateDraft;
    readonly error?: string;
    readonly submitting: boolean;
    readonly unavailable?: string;
    /** Without it the form does not offer the choice, as when the secret goes to one agent. */
    onAvailableToAgentsChange?(value: boolean): void;
    onClose(): void;
    onDescriptionChange(value: string): void;
    onSubmit(): void;
    onVariableAdd(): void;
    onVariableNameChange(id: number, value: string): void;
    onVariableRemove(id: number): void;
    onVariableValueChange(id: number, value: string): void;
}

const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const SECRET_NAME = /^[a-z][a-z0-9_-]*$/u;
const DESCRIPTION_MAX_LENGTH = 2_000;
const ENVIRONMENT_NAME_MAX_LENGTH = 256;
const ENVIRONMENT_VALUE_MAX_LENGTH = 65_536;
export const HAPPY_AGENT_SECRET_ENVIRONMENT_MAX_VARIABLES = 256;

/** Why a secret name breaks the daemon's naming rules, or nothing when it fits them. */
export function happyAgentSecretNameError(name: string): string | undefined {
    if (name.length < 2 || name.length > 32) return "Use 2 to 32 characters.";
    if (!SECRET_NAME.test(name))
        return "Use lowercase letters, numbers, dashes and underscores, starting with a letter.";
    return undefined;
}

/** True when the complete draft satisfies the daemon's public create contract. */
export function happyAgentSecretCreateDraftValid(
    draft: HappyAgentSecretCreateDraft,
    valuesRequired = false,
): boolean {
    return (
        descriptionError(draft.description) === undefined &&
        draft.variables.length > 0 &&
        draft.variables.length <= HAPPY_AGENT_SECRET_ENVIRONMENT_MAX_VARIABLES &&
        draft.variables.every(
            (variable) =>
                variableNameError(variable.name, draft.variables) === undefined &&
                variableValueError(variable, valuesRequired) === undefined,
        )
    );
}

/** The write-only create form hosted on the standard Settings modal layer. */
export function HappyAgentSecretCreateDialog(props: HappyAgentSecretCreateDialogProps) {
    const disabled = props.submitting || props.unavailable !== undefined;
    return (
        <ModalOverlay
            onDismiss={() => {
                if (!props.submitting) props.onClose();
            }}
        >
            <Modal
                footer={
                    <>
                        <Button disabled={props.submitting} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={props.unavailable !== undefined}
                            loading={props.submitting}
                            onClick={props.onSubmit}
                        >
                            {props.submitLabel ?? "Create secret"}
                        </Button>
                    </>
                }
                icon="lock"
                onClose={props.submitting ? undefined : props.onClose}
                size="medium"
                title={props.title ?? "Create secret"}
            >
                <Box
                    className="happy-agent-secret-create"
                    data-happy-desktop-ui="happy-agent-secret-create"
                >
                    <Banner icon="lock" tone="neutral" title="Values stay hidden">
                        Secret values are sent once and are never returned by Happy Agent or shown
                        in this list.
                    </Banner>
                    {props.unavailable ? (
                        <Banner tone="neutral" title="Happy Agent unavailable">
                            {props.unavailable}
                        </Banner>
                    ) : null}
                    {props.error ? (
                        <Banner tone="danger" title="Secret not saved">
                            {props.error}
                        </Banner>
                    ) : null}
                    {props.name ? (
                        <TextField
                            autoComplete="off"
                            autoFocus={!props.name.locked}
                            disabled={disabled || props.name.locked}
                            error={
                                props.attempted && !props.name.locked
                                    ? happyAgentSecretNameError(props.name.value)
                                    : undefined
                            }
                            fullWidth
                            hint="Agents ask for the secret by this name."
                            label="Name"
                            onSubmit={props.onSubmit}
                            onValueChange={props.name.onChange}
                            placeholder="stripe"
                            value={props.name.value}
                        />
                    ) : null}
                    <TextField
                        autoFocus={props.name === undefined}
                        disabled={disabled}
                        error={
                            props.attempted ? descriptionError(props.draft.description) : undefined
                        }
                        fullWidth
                        label="Description"
                        onSubmit={props.onSubmit}
                        onValueChange={props.onDescriptionChange}
                        placeholder="Production deploy credentials"
                        value={props.draft.description}
                    />
                    <fieldset className="happy-agent-secret-create__environment">
                        <legend>Environment variables</legend>
                        <p>
                            Add the variable names agents receive and the write-only values to store
                            under them.
                        </p>
                        <Box className="happy-agent-secret-create__variables">
                            {props.draft.variables.map((variable) => (
                                <Box
                                    className="happy-agent-secret-create__variable"
                                    data-happy-desktop-ui="happy-agent-secret-create-variable"
                                    key={variable.id}
                                >
                                    <TextField
                                        autoComplete="off"
                                        disabled={disabled || variable.stored === true}
                                        error={
                                            props.attempted
                                                ? variableNameError(
                                                      variable.name,
                                                      props.draft.variables,
                                                  )
                                                : undefined
                                        }
                                        fullWidth
                                        label="Variable name"
                                        onSubmit={props.onSubmit}
                                        onValueChange={(value) =>
                                            props.onVariableNameChange(variable.id, value)
                                        }
                                        placeholder="API_TOKEN"
                                        value={variable.name}
                                    />
                                    <TextField
                                        autoComplete="new-password"
                                        disabled={disabled}
                                        error={
                                            props.attempted
                                                ? variableValueError(
                                                      variable,
                                                      props.valuesRequired === true,
                                                  )
                                                : undefined
                                        }
                                        fullWidth
                                        label="Secret value"
                                        {...(variable.hint ? { hint: variable.hint } : {})}
                                        onSubmit={props.onSubmit}
                                        onValueChange={(value) =>
                                            props.onVariableValueChange(variable.id, value)
                                        }
                                        placeholder={
                                            variable.stored
                                                ? "Keep the stored value"
                                                : "Enter value"
                                        }
                                        type="password"
                                        value={variable.value}
                                    />
                                    <Box className="happy-agent-secret-create__remove">
                                        <Button
                                            aria-label={`Remove ${variable.name || "environment variable"}`}
                                            disabled={
                                                disabled || props.draft.variables.length === 1
                                            }
                                            icon="trash"
                                            iconOnly
                                            onClick={() => props.onVariableRemove(variable.id)}
                                            size="medium"
                                            variant="ghost"
                                        />
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                        <Button
                            disabled={
                                disabled ||
                                props.draft.variables.length >=
                                    HAPPY_AGENT_SECRET_ENVIRONMENT_MAX_VARIABLES
                            }
                            icon="plus"
                            onClick={props.onVariableAdd}
                            size="small"
                            variant="ghost"
                        >
                            Add variable
                        </Button>
                    </fieldset>
                    {props.onAvailableToAgentsChange ? (
                        <FormRow
                            control={
                                <Switch
                                    aria-label="Available to every agent"
                                    checked={props.draft.availableToAgents}
                                    disabled={disabled}
                                    id="happy-agent-secret-create-available"
                                    onChange={props.onAvailableToAgentsChange}
                                />
                            }
                            description="When off, the secret stays stored until scoped access is granted to a project, workspace, or agent."
                            htmlFor="happy-agent-secret-create-available"
                            label="Available to every agent"
                        />
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

function descriptionError(description: string): string | undefined {
    if (description.trim().length === 0) return "Enter a description.";
    if (description.length > DESCRIPTION_MAX_LENGTH)
        return `Use ${String(DESCRIPTION_MAX_LENGTH)} characters or fewer.`;
    return undefined;
}

function variableNameError(
    name: string,
    variables: readonly HappyAgentSecretVariableDraft[],
): string | undefined {
    if (name.length === 0) return "Enter a variable name.";
    if (name.length > ENVIRONMENT_NAME_MAX_LENGTH)
        return `Use ${String(ENVIRONMENT_NAME_MAX_LENGTH)} characters or fewer.`;
    if (!ENVIRONMENT_NAME.test(name))
        return "Use letters, numbers, and underscores, starting with a letter or underscore.";
    if (variables.filter((variable) => variable.name === name).length > 1)
        return "Each variable name must be unique.";
    return undefined;
}

function variableValueError(
    variable: HappyAgentSecretVariableDraft,
    required: boolean,
): string | undefined {
    const value = variable.value;
    if (required && !variable.stored && value.length === 0) return "Enter a value.";
    if (value.includes("\0")) return "Secret values cannot contain a null character.";
    if (value.length > ENVIRONMENT_VALUE_MAX_LENGTH)
        return `Use ${String(ENVIRONMENT_VALUE_MAX_LENGTH)} characters or fewer.`;
    return undefined;
}
