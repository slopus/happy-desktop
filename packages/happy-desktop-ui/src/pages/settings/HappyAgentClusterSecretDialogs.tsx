import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Checkbox } from "../../Checkbox";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { SegmentedControl } from "../../SegmentedControl";
import { TextField } from "../../TextField";
import {
    gitValueDraft,
    HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT,
    HAPPY_AGENT_CLUSTER_SECRET_TYPES,
    HAPPY_AGENT_CLUSTER_SECRET_USE_TEXT,
    happyAgentClusterSecretCreateErrors,
    happyAgentClusterSecretCreateInput,
    happyAgentClusterSecretDescriptionError,
    happyAgentClusterSecretDraftCreate,
    happyAgentClusterSecretMaterial,
    happyAgentClusterSecretNameError,
    happyAgentClusterSecretValueDraftOf,
    happyAgentClusterSecretValueErrors,
    type HappyAgentClusterGitMethod,
    type HappyAgentClusterGitOperation,
    type HappyAgentClusterSecretCreateDraft,
    type HappyAgentClusterSecretCreateInput,
    type HappyAgentClusterSecretErrors,
    type HappyAgentClusterSecretOwner,
    type HappyAgentClusterSecretType,
    type HappyAgentClusterSecretUpdateInput,
    type HappyAgentClusterSecretValueDraft,
} from "./happyAgentClusterSecretDraft";
import type { HappyAgentClusterSecretRow } from "./HappyAgentClusterSecretSettings";

const OWNER_TEXT: Record<HappyAgentClusterSecretOwner, string> = { team: "Team", me: "Only me" };
const OWNER_HINT: Record<HappyAgentClusterSecretOwner, string> = {
    team: "The team’s secret. Its access follows each role’s rule.",
    me: "Yours alone. Only runs you start can use it, and nobody else sees it.",
};
const VALUES_HIDDEN =
    "Values are sent once and can’t be read back, by you or anyone else. They never appear in this list.";

function messageOf(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

export interface HappyAgentClusterSecretCreateDialogProps {
    /** The owners the reader's role may create for; the first is chosen first. */
    readonly owners: readonly HappyAgentClusterSecretOwner[];
    /** Opens on a filled form instead of the type picker, for restored and fixture state. */
    readonly initialDraft?: HappyAgentClusterSecretCreateDraft;
    readonly initialAttempted?: boolean;
    readonly unavailable?: string;
    onClose(): void;
    /** Creates the secret; rejects with the reason to show. */
    onSubmit(input: HappyAgentClusterSecretCreateInput): Promise<void>;
}

/** A new secret: its type first, then the form for that type. */
export function HappyAgentClusterSecretCreateDialog(
    props: HappyAgentClusterSecretCreateDialogProps,
) {
    const owner = props.owners[0] ?? "team";
    const [type, setType] = useState<HappyAgentClusterSecretType>("endpoint");
    const [draft, setDraft] = useState(props.initialDraft);
    const [attempted, setAttempted] = useState(props.initialAttempted ?? false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string>();
    const close = () => {
        if (!submitting) props.onClose();
    };
    const change = (next: HappyAgentClusterSecretCreateDraft) => {
        setDraft(next);
        setError(undefined);
    };
    const errors: HappyAgentClusterSecretErrors = draft
        ? happyAgentClusterSecretCreateErrors(draft)
        : new Map();
    const submit = () => {
        if (draft === undefined || submitting) return;
        setAttempted(true);
        if (errors.size > 0 || props.unavailable !== undefined) return;
        setSubmitting(true);
        setError(undefined);
        void Promise.resolve()
            .then(() => props.onSubmit(happyAgentClusterSecretCreateInput(draft)))
            .then(
                () => {
                    // The value leaves with the form.
                    setDraft(undefined);
                    props.onClose();
                },
                (reason: unknown) => {
                    setSubmitting(false);
                    setError(messageOf(reason));
                },
            );
    };
    const disabled = submitting || props.unavailable !== undefined;
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                footer={
                    draft === undefined ? (
                        <>
                            <Button onClick={props.onClose} variant="ghost">
                                Cancel
                            </Button>
                            <Button
                                disabled={props.unavailable !== undefined}
                                onClick={() =>
                                    change(happyAgentClusterSecretDraftCreate(type, owner))
                                }
                            >
                                Continue
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                disabled={submitting}
                                onClick={() => {
                                    setDraft(undefined);
                                    setAttempted(false);
                                    setError(undefined);
                                }}
                                variant="ghost"
                            >
                                Back
                            </Button>
                            <Button
                                disabled={props.unavailable !== undefined}
                                loading={submitting}
                                onClick={submit}
                            >
                                Create secret
                            </Button>
                        </>
                    )
                }
                icon={draft ? HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[draft.shape.type].icon : "lock"}
                onClose={submitting ? undefined : props.onClose}
                size="medium"
                title={
                    draft
                        ? `New ${HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[draft.shape.type].label.toLowerCase()}`
                        : "New secret"
                }
            >
                <Box
                    className="happy-agent-cluster-secret-form"
                    data-happy-desktop-ui="happy-agent-cluster-secret-create"
                >
                    {props.unavailable ? (
                        <Banner tone="neutral" title="Happy Cloud unavailable">
                            {props.unavailable}
                        </Banner>
                    ) : null}
                    {draft === undefined ? (
                        <Box
                            aria-label="Type"
                            className="happy-agent-cluster-secret-types"
                            role="radiogroup"
                        >
                            {HAPPY_AGENT_CLUSTER_SECRET_TYPES.map((candidate) => (
                                <button
                                    aria-checked={type === candidate}
                                    className="happy-agent-cluster-secret-type"
                                    data-happy-desktop-ui="happy-agent-cluster-secret-type"
                                    key={candidate}
                                    onClick={() => setType(candidate)}
                                    onDoubleClick={() =>
                                        change(happyAgentClusterSecretDraftCreate(candidate, owner))
                                    }
                                    role="radio"
                                    type="button"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="happy-agent-cluster-secret-type__radio"
                                    />
                                    <span className="happy-agent-cluster-secret-type__text">
                                        <span className="happy-agent-cluster-secret-type__label">
                                            {HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[candidate].label}
                                        </span>
                                        <span className="happy-agent-cluster-secret-type__description">
                                            {
                                                HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[candidate]
                                                    .description
                                            }
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </Box>
                    ) : (
                        <>
                            {error ? (
                                <Banner tone="danger" title="Secret not created">
                                    {error}
                                </Banner>
                            ) : null}
                            {props.owners.length > 1 ? (
                                <Box className="happy-agent-cluster-secret-form__field">
                                    <SegmentedControl
                                        aria-label="Owner"
                                        disabled={disabled}
                                        onChange={(value) =>
                                            change({
                                                ...draft,
                                                owner: value === "me" ? "me" : "team",
                                            })
                                        }
                                        segments={props.owners.map((value) => ({
                                            value,
                                            label: OWNER_TEXT[value],
                                        }))}
                                        size="small"
                                        value={draft.owner}
                                    />
                                    <span className="happy-agent-cluster-secret-form__hint">
                                        {OWNER_HINT[draft.owner]}
                                    </span>
                                </Box>
                            ) : (
                                <span className="happy-agent-cluster-secret-form__hint">
                                    {OWNER_HINT[draft.owner]}
                                </span>
                            )}
                            <TextField
                                autoFocus
                                disabled={disabled}
                                error={attempted ? errors.get("name") : undefined}
                                fullWidth
                                label="Name"
                                onSubmit={submit}
                                onValueChange={(name) => change({ ...draft, name })}
                                placeholder={NAME_PLACEHOLDER[draft.shape.type]}
                                value={draft.name}
                            />
                            <TextField
                                disabled={disabled}
                                error={attempted ? errors.get("description") : undefined}
                                fullWidth
                                label="Description"
                                onSubmit={submit}
                                onValueChange={(description) => change({ ...draft, description })}
                                placeholder="Optional"
                                value={draft.description}
                            />
                            <ShapeFields
                                attempted={attempted}
                                disabled={disabled}
                                draft={draft}
                                errors={errors}
                                onChange={change}
                                onSubmit={submit}
                            />
                            <span className="happy-agent-cluster-secret-form__hint">
                                {VALUES_HIDDEN}
                            </span>
                        </>
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

const NAME_PLACEHOLDER: Record<HappyAgentClusterSecretType, string> = {
    endpoint: "Stripe API",
    git_credential: "GitLab deploy token",
    ssh_key: "Bastion",
    environment: "Sentry",
};

interface ShapeFieldsProps {
    readonly attempted: boolean;
    readonly disabled: boolean;
    readonly draft: HappyAgentClusterSecretCreateDraft;
    readonly errors: HappyAgentClusterSecretErrors;
    onChange(draft: HappyAgentClusterSecretCreateDraft): void;
    onSubmit(): void;
}

/** The metadata and value fields of one type's form. */
function ShapeFields(props: ShapeFieldsProps) {
    const { draft, disabled } = props;
    const shape = draft.shape;
    const error = (key: string) => (props.attempted ? props.errors.get(key) : undefined);
    const value = (next: HappyAgentClusterSecretValueDraft, nextId = draft.nextId) =>
        props.onChange({ ...draft, value: next, nextId });
    const valueFields = (
        <ValueFields
            attempted={props.attempted}
            disabled={disabled}
            errors={props.errors}
            nextId={draft.nextId}
            onChange={value}
            onSubmit={props.onSubmit}
            value={draft.value}
        />
    );
    switch (shape.type) {
        case "endpoint":
            return (
                <>
                    <fieldset className="happy-agent-cluster-secret-form__group">
                        <legend>Targets</legend>
                        <p>
                            Requests to these hosts get the headers below. A path limits it further.
                        </p>
                        {shape.targets.map((target) => (
                            <Box className="happy-agent-cluster-secret-form__row" key={target.id}>
                                <TextField
                                    autoComplete="off"
                                    disabled={disabled}
                                    error={error(`target.${String(target.id)}.host`)}
                                    fullWidth
                                    label="Host"
                                    onSubmit={props.onSubmit}
                                    onValueChange={(host) =>
                                        props.onChange({
                                            ...draft,
                                            shape: {
                                                ...shape,
                                                targets: shape.targets.map((item) =>
                                                    item.id === target.id
                                                        ? { ...item, host }
                                                        : item,
                                                ),
                                            },
                                        })
                                    }
                                    placeholder="api.stripe.com"
                                    value={target.host}
                                />
                                <TextField
                                    autoComplete="off"
                                    disabled={disabled}
                                    error={error(`target.${String(target.id)}.path`)}
                                    fullWidth
                                    label="Path"
                                    onSubmit={props.onSubmit}
                                    onValueChange={(path) =>
                                        props.onChange({
                                            ...draft,
                                            shape: {
                                                ...shape,
                                                targets: shape.targets.map((item) =>
                                                    item.id === target.id
                                                        ? { ...item, path }
                                                        : item,
                                                ),
                                            },
                                        })
                                    }
                                    placeholder="Any"
                                    value={target.path}
                                />
                                <RemoveButton
                                    disabled={disabled || shape.targets.length === 1}
                                    label={`Remove ${target.host || "target"}`}
                                    onRemove={() =>
                                        props.onChange({
                                            ...draft,
                                            shape: {
                                                ...shape,
                                                targets: shape.targets.filter(
                                                    (item) => item.id !== target.id,
                                                ),
                                            },
                                        })
                                    }
                                />
                            </Box>
                        ))}
                        <AddButton
                            disabled={disabled || shape.targets.length >= 16}
                            label="Add host"
                            onAdd={() =>
                                props.onChange({
                                    ...draft,
                                    nextId: draft.nextId + 1,
                                    shape: {
                                        ...shape,
                                        targets: [
                                            ...shape.targets,
                                            { id: draft.nextId, host: "", path: "" },
                                        ],
                                    },
                                })
                            }
                        />
                    </fieldset>
                    <fieldset className="happy-agent-cluster-secret-form__group">
                        <legend>Headers</legend>
                        <p>The proxy sets each header to its prefix followed by the value.</p>
                        {valueFields}
                    </fieldset>
                    <UsesField
                        disabled={disabled}
                        fixed="egress"
                        mcp={shape.mcp}
                        onMcpChange={(mcp) =>
                            props.onChange({ ...draft, shape: { ...shape, mcp } })
                        }
                    />
                </>
            );
        case "ssh_key":
            return (
                <>
                    <TextField
                        autoComplete="off"
                        disabled={disabled}
                        error={error("hosts")}
                        fullWidth
                        hint="Separate hosts with commas. *.prod.acme.dev matches its subdomains."
                        label="Hosts"
                        onSubmit={props.onSubmit}
                        onValueChange={(hosts) =>
                            props.onChange({ ...draft, shape: { ...shape, hosts } })
                        }
                        placeholder="bastion.acme.dev, *.prod.acme.dev"
                        value={shape.hosts}
                    />
                    {valueFields}
                </>
            );
        case "git_credential":
            return (
                <>
                    <TextField
                        autoComplete="off"
                        disabled={disabled}
                        error={error("server")}
                        fullWidth
                        hint="One server. The credential works nowhere else."
                        label="Server"
                        onSubmit={props.onSubmit}
                        onValueChange={(server) =>
                            props.onChange({ ...draft, shape: { ...shape, server } })
                        }
                        placeholder="gitlab.com"
                        value={shape.server}
                    />
                    <Box className="happy-agent-cluster-secret-form__field">
                        <span className="happy-agent-cluster-secret-form__label">Method</span>
                        <SegmentedControl
                            aria-label="Method"
                            disabled={disabled}
                            onChange={(next) => {
                                const method = GIT_METHODS.find((candidate) => candidate === next);
                                if (method === undefined) return;
                                props.onChange({
                                    ...draft,
                                    shape: {
                                        ...shape,
                                        method,
                                        operations:
                                            method === "ssh_key"
                                                ? shape.operations
                                                : shape.operations.filter(
                                                      (operation) => operation !== "sign",
                                                  ),
                                    },
                                    value: gitValueDraft(method),
                                });
                            }}
                            segments={[
                                { value: "token", label: "Token" },
                                { value: "password", label: "Password" },
                                { value: "ssh_key", label: "SSH key" },
                            ]}
                            size="small"
                            value={shape.method}
                        />
                    </Box>
                    {shape.method === "ssh_key" ? null : (
                        <TextField
                            autoComplete="off"
                            disabled={disabled}
                            error={error("username")}
                            fullWidth
                            hint={
                                shape.method === "token"
                                    ? "Optional. Without one, the token is sent as a bearer token."
                                    : undefined
                            }
                            label="Username"
                            onSubmit={props.onSubmit}
                            onValueChange={(username) =>
                                props.onChange({ ...draft, shape: { ...shape, username } })
                            }
                            placeholder={shape.method === "token" ? "oauth2" : "deploy"}
                            value={shape.username}
                        />
                    )}
                    {valueFields}
                    <TextField
                        autoComplete="off"
                        disabled={disabled}
                        fullWidth
                        hint="Separate with commas. Empty means every repository on the server."
                        label="Repositories"
                        onSubmit={props.onSubmit}
                        onValueChange={(repos) =>
                            props.onChange({ ...draft, shape: { ...shape, repos } })
                        }
                        placeholder="acme/infra/*"
                        value={shape.repos}
                    />
                    <fieldset className="happy-agent-cluster-secret-form__group">
                        <legend>Operations</legend>
                        <Box className="happy-agent-cluster-secret-form__checks">
                            {GIT_OPERATIONS.map((operation) => (
                                <Checkbox
                                    checked={shape.operations.includes(operation)}
                                    disabled={
                                        disabled ||
                                        (operation === "sign" && shape.method !== "ssh_key")
                                    }
                                    key={operation}
                                    label={GIT_OPERATION_TEXT[operation]}
                                    onChange={(checked) =>
                                        props.onChange({
                                            ...draft,
                                            shape: {
                                                ...shape,
                                                operations: GIT_OPERATIONS.filter((candidate) =>
                                                    candidate === operation
                                                        ? checked
                                                        : shape.operations.includes(candidate),
                                                ),
                                            },
                                        })
                                    }
                                />
                            ))}
                        </Box>
                        {error("operations") ? (
                            <span className="happy-agent-cluster-secret-form__error">
                                {error("operations")}
                            </span>
                        ) : null}
                    </fieldset>
                </>
            );
        case "environment":
            return (
                <>
                    <fieldset className="happy-agent-cluster-secret-form__group">
                        <legend>Variables</legend>
                        <p>The names agents and MCP servers receive, with their values.</p>
                        {valueFields}
                    </fieldset>
                    <UsesField
                        disabled={disabled}
                        fixed="environment"
                        mcp={shape.mcp}
                        onMcpChange={(mcp) =>
                            props.onChange({ ...draft, shape: { ...shape, mcp } })
                        }
                    />
                </>
            );
    }
}

const GIT_METHODS: readonly HappyAgentClusterGitMethod[] = ["token", "password", "ssh_key"];
const GIT_OPERATIONS: readonly HappyAgentClusterGitOperation[] = ["read", "write", "sign"];
const GIT_OPERATION_TEXT: Record<HappyAgentClusterGitOperation, string> = {
    read: "Read",
    write: "Write",
    sign: "Sign commits",
};

function UsesField(props: {
    readonly disabled: boolean;
    readonly fixed: "egress" | "environment";
    readonly mcp: boolean;
    onMcpChange(mcp: boolean): void;
}) {
    return (
        <fieldset className="happy-agent-cluster-secret-form__group">
            <legend>Used by</legend>
            <Box className="happy-agent-cluster-secret-form__checks">
                <Checkbox
                    checked
                    disabled
                    label={HAPPY_AGENT_CLUSTER_SECRET_USE_TEXT[props.fixed]}
                />
                <Checkbox
                    checked={props.mcp}
                    disabled={props.disabled}
                    label={HAPPY_AGENT_CLUSTER_SECRET_USE_TEXT.mcp}
                    onChange={props.onMcpChange}
                />
            </Box>
        </fieldset>
    );
}

function RemoveButton(props: {
    readonly disabled: boolean;
    readonly label: string;
    onRemove(): void;
}) {
    return (
        <Box className="happy-agent-cluster-secret-form__remove">
            <Button
                aria-label={props.label}
                disabled={props.disabled}
                icon="trash"
                iconOnly
                onClick={props.onRemove}
                size="medium"
                variant="ghost"
            />
        </Box>
    );
}

function AddButton(props: { readonly disabled: boolean; readonly label: string; onAdd(): void }) {
    return (
        <Box className="happy-agent-cluster-secret-form__add">
            <Button
                disabled={props.disabled}
                icon="plus"
                onClick={props.onAdd}
                size="small"
                variant="ghost"
            >
                {props.label}
            </Button>
        </Box>
    );
}

interface ValueFieldsProps {
    readonly attempted: boolean;
    readonly disabled: boolean;
    readonly errors: HappyAgentClusterSecretErrors;
    /** Present when header names come from the secret and cannot change. */
    readonly fixedHeaders?: boolean;
    readonly nextId: number;
    readonly value: HappyAgentClusterSecretValueDraft;
    onChange(value: HappyAgentClusterSecretValueDraft, nextId?: number): void;
    onSubmit(): void;
}

/** The write-only value fields, by the shape the value takes. */
function ValueFields(props: ValueFieldsProps) {
    const { value, disabled } = props;
    const error = (key: string) => (props.attempted ? props.errors.get(key) : undefined);
    switch (value.kind) {
        case "headers":
            return (
                <>
                    {value.headers.map((header) => {
                        const update = (change: Partial<typeof header>) =>
                            props.onChange({
                                ...value,
                                headers: value.headers.map((item) =>
                                    item.id === header.id ? { ...item, ...change } : item,
                                ),
                            });
                        return props.fixedHeaders ? (
                            <TextField
                                autoComplete="new-password"
                                disabled={disabled}
                                error={error(`header.${String(header.id)}.value`)}
                                fullWidth
                                hint={header.prefix ? `Sent after “${header.prefix}”.` : undefined}
                                key={header.id}
                                label={`${header.name} value`}
                                onSubmit={props.onSubmit}
                                onValueChange={(next) => update({ value: next })}
                                placeholder="Enter the new value"
                                type="password"
                                value={header.value}
                            />
                        ) : (
                            <Box className="happy-agent-cluster-secret-form__row" key={header.id}>
                                <TextField
                                    autoComplete="off"
                                    disabled={disabled}
                                    error={error(`header.${String(header.id)}.name`)}
                                    fullWidth
                                    label="Header"
                                    onSubmit={props.onSubmit}
                                    onValueChange={(name) => update({ name })}
                                    placeholder="Authorization"
                                    value={header.name}
                                />
                                <TextField
                                    autoComplete="off"
                                    disabled={disabled}
                                    error={error(`header.${String(header.id)}.prefix`)}
                                    fullWidth
                                    label="Prefix"
                                    onSubmit={props.onSubmit}
                                    onValueChange={(prefix) => update({ prefix })}
                                    placeholder="None"
                                    value={header.prefix}
                                />
                                <TextField
                                    autoComplete="new-password"
                                    disabled={disabled}
                                    error={error(`header.${String(header.id)}.value`)}
                                    fullWidth
                                    label="Value"
                                    onSubmit={props.onSubmit}
                                    onValueChange={(next) => update({ value: next })}
                                    placeholder="Enter value"
                                    type="password"
                                    value={header.value}
                                />
                                <RemoveButton
                                    disabled={disabled || value.headers.length === 1}
                                    label={`Remove ${header.name || "header"}`}
                                    onRemove={() =>
                                        props.onChange({
                                            ...value,
                                            headers: value.headers.filter(
                                                (item) => item.id !== header.id,
                                            ),
                                        })
                                    }
                                />
                            </Box>
                        );
                    })}
                    {props.fixedHeaders ? null : (
                        <AddButton
                            disabled={disabled || value.headers.length >= 8}
                            label="Add header"
                            onAdd={() =>
                                props.onChange(
                                    {
                                        ...value,
                                        headers: [
                                            ...value.headers,
                                            { id: props.nextId, name: "", prefix: "", value: "" },
                                        ],
                                    },
                                    props.nextId + 1,
                                )
                            }
                        />
                    )}
                </>
            );
        case "key":
            return (
                <>
                    <TextField
                        autoComplete="off"
                        disabled={disabled}
                        error={error("privateKey")}
                        fullWidth
                        label="Private key"
                        multiline
                        onValueChange={(privateKey) => props.onChange({ ...value, privateKey })}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        rows={5}
                        value={value.privateKey}
                    />
                    <TextField
                        autoComplete="new-password"
                        disabled={disabled}
                        fullWidth
                        hint="Only if the key has one."
                        label="Passphrase"
                        onSubmit={props.onSubmit}
                        onValueChange={(passphrase) => props.onChange({ ...value, passphrase })}
                        placeholder="Optional"
                        type="password"
                        value={value.passphrase}
                    />
                </>
            );
        case "password":
            return (
                <TextField
                    autoComplete="new-password"
                    disabled={disabled}
                    error={error("password")}
                    fullWidth
                    label="Password"
                    onSubmit={props.onSubmit}
                    onValueChange={(password) => props.onChange({ ...value, password })}
                    placeholder="Enter password"
                    type="password"
                    value={value.password}
                />
            );
        case "token":
            return (
                <TextField
                    autoComplete="new-password"
                    disabled={disabled}
                    error={error("token")}
                    fullWidth
                    label="Token"
                    onSubmit={props.onSubmit}
                    onValueChange={(token) => props.onChange({ ...value, token })}
                    placeholder="Enter token"
                    type="password"
                    value={value.token}
                />
            );
        case "variables":
            return (
                <>
                    {value.variables.map((variable) => {
                        const update = (change: Partial<typeof variable>) =>
                            props.onChange({
                                ...value,
                                variables: value.variables.map((item) =>
                                    item.id === variable.id ? { ...item, ...change } : item,
                                ),
                            });
                        return (
                            <Box className="happy-agent-cluster-secret-form__row" key={variable.id}>
                                <TextField
                                    autoComplete="off"
                                    disabled={disabled}
                                    error={error(`variable.${String(variable.id)}.name`)}
                                    fullWidth
                                    label="Variable name"
                                    onSubmit={props.onSubmit}
                                    onValueChange={(name) => update({ name })}
                                    placeholder="SENTRY_DSN"
                                    value={variable.name}
                                />
                                {/* Multi-line: a password field drops the line breaks of a pasted certificate. */}
                                <TextField
                                    autoComplete="off"
                                    disabled={disabled}
                                    error={error(`variable.${String(variable.id)}.value`)}
                                    fullWidth
                                    label="Value"
                                    multiline
                                    onValueChange={(next) => update({ value: next })}
                                    placeholder="Enter value"
                                    rows={2}
                                    value={variable.value}
                                />
                                <RemoveButton
                                    disabled={disabled || value.variables.length === 1}
                                    label={`Remove ${variable.name || "variable"}`}
                                    onRemove={() =>
                                        props.onChange({
                                            ...value,
                                            variables: value.variables.filter(
                                                (item) => item.id !== variable.id,
                                            ),
                                        })
                                    }
                                />
                            </Box>
                        );
                    })}
                    <AddButton
                        disabled={disabled || value.variables.length >= 256}
                        label="Add variable"
                        onAdd={() =>
                            props.onChange(
                                {
                                    ...value,
                                    variables: [
                                        ...value.variables,
                                        { id: props.nextId, name: "", value: "" },
                                    ],
                                },
                                props.nextId + 1,
                            )
                        }
                    />
                </>
            );
    }
}

export interface HappyAgentClusterSecretEditDialogProps {
    readonly secret: HappyAgentClusterSecretRow;
    /** Opens with the value fields shown, for restored and fixture state. */
    readonly initialReplacing?: boolean;
    readonly unavailable?: string;
    onClose(): void;
    /** Saves what changed against `version`, the one the form stands on; rejects with the reason to show. */
    onSave(version: string, input: HappyAgentClusterSecretUpdateInput): Promise<void>;
    /** Asks to delete the secret at the version the form stands on. */
    onDeleteOpen(version: string): void;
}

/**
 * One secret: what it is, what the reader may do with it, and, for a manager,
 * its name, description and a replacement value.
 */
export function HappyAgentClusterSecretEditDialog(props: HappyAgentClusterSecretEditDialogProps) {
    const secret = props.secret;
    const manage = secret.access.manage;
    const [name, setName] = useState(secret.name);
    const [description, setDescription] = useState(secret.description);
    const [value, setValue] = useState<HappyAgentClusterSecretValueDraft | undefined>(() =>
        props.initialReplacing ? happyAgentClusterSecretValueDraftOf(secret) : undefined,
    );
    const [nextId, setNextId] = useState(1_000);
    const [attempted, setAttempted] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string>();
    /*
     * The secret as the form was opened. Saving and deleting send its version,
     * so a change someone made meanwhile is refused instead of overwritten.
     * After a refusal the form stands on the secret as it is shown then.
     */
    const [base, setBase] = useState(secret);
    const [rebase, setRebase] = useState(false);
    if (rebase) {
        setRebase(false);
        setBase(secret);
    }
    const changedMeanwhile = !rebase && base.version !== secret.version;
    const errors = new Map<string, string>(value ? happyAgentClusterSecretValueErrors(value) : []);
    const nameError = happyAgentClusterSecretNameError(name);
    const descriptionError = happyAgentClusterSecretDescriptionError(description);
    if (nameError) errors.set("name", nameError);
    if (descriptionError) errors.set("description", descriptionError);
    const close = () => {
        if (!saving) props.onClose();
    };
    const save = () => {
        if (saving) return;
        setAttempted(true);
        if (errors.size > 0 || props.unavailable !== undefined) return;
        const input: HappyAgentClusterSecretUpdateInput = {
            ...(name.trim() === base.name ? {} : { name: name.trim() }),
            ...(description.trim() === base.description ? {} : { description: description.trim() }),
            ...(value ? { material: happyAgentClusterSecretMaterial(value) } : {}),
        };
        if (Object.keys(input).length === 0) {
            props.onClose();
            return;
        }
        setSaving(true);
        setError(undefined);
        void Promise.resolve()
            .then(() => props.onSave(base.version, input))
            .then(
                () => {
                    setValue(undefined);
                    props.onClose();
                },
                (reason: unknown) => {
                    setSaving(false);
                    setError(messageOf(reason));
                    setRebase(true);
                },
            );
    };
    const disabled = saving || props.unavailable !== undefined;
    const text = HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[secret.type];
    return (
        <ModalOverlay onDismiss={value === undefined ? close : undefined}>
            <Modal
                footer={
                    manage ? (
                        <>
                            <Button disabled={saving} onClick={props.onClose} variant="ghost">
                                Cancel
                            </Button>
                            <Button
                                disabled={props.unavailable !== undefined}
                                loading={saving}
                                onClick={save}
                            >
                                Save
                            </Button>
                        </>
                    ) : (
                        <Button onClick={props.onClose} variant="ghost">
                            Done
                        </Button>
                    )
                }
                icon={text.icon}
                onClose={saving ? undefined : props.onClose}
                size="large"
                title={secret.name}
            >
                <Box
                    className="happy-agent-cluster-secret-form"
                    data-happy-desktop-ui="happy-agent-cluster-secret-edit"
                >
                    {props.unavailable ? (
                        <Banner tone="neutral" title="Happy Cloud unavailable">
                            {props.unavailable}
                        </Banner>
                    ) : null}
                    {error ? (
                        <Banner tone="danger" title="Not saved">
                            {error}
                        </Banner>
                    ) : changedMeanwhile && manage ? (
                        <Banner tone="neutral" title="Changed since you opened it">
                            Someone changed this secret. Saving shows you their change first.
                        </Banner>
                    ) : null}
                    <Box
                        className="happy-agent-cluster-secret-facts"
                        data-happy-desktop-ui="happy-agent-cluster-secret-facts"
                    >
                        {secretFacts(secret).map(([label, fact]) => (
                            <Box className="happy-agent-cluster-secret-facts__row" key={label}>
                                <span className="happy-agent-cluster-secret-facts__label">
                                    {label}
                                </span>
                                <span className="happy-agent-cluster-secret-facts__value">
                                    {fact}
                                </span>
                            </Box>
                        ))}
                    </Box>
                    {manage ? (
                        <>
                            <TextField
                                disabled={disabled}
                                error={attempted ? errors.get("name") : undefined}
                                fullWidth
                                label="Name"
                                onSubmit={save}
                                onValueChange={(next) => {
                                    setName(next);
                                    setError(undefined);
                                }}
                                value={name}
                            />
                            <TextField
                                disabled={disabled}
                                error={attempted ? errors.get("description") : undefined}
                                fullWidth
                                label="Description"
                                onSubmit={save}
                                onValueChange={(next) => {
                                    setDescription(next);
                                    setError(undefined);
                                }}
                                placeholder="Optional"
                                value={description}
                            />
                            <fieldset className="happy-agent-cluster-secret-form__group">
                                <legend>Value</legend>
                                {value === undefined ? (
                                    <Box className="happy-agent-cluster-secret-form__value">
                                        <span className="happy-agent-cluster-secret-form__hint">
                                            Set {secret.updatedAt}. Nobody can read it back.
                                        </span>
                                        <Button
                                            disabled={disabled}
                                            onClick={() =>
                                                setValue(
                                                    happyAgentClusterSecretValueDraftOf(secret),
                                                )
                                            }
                                            size="small"
                                            variant="secondary"
                                        >
                                            Replace value
                                        </Button>
                                    </Box>
                                ) : (
                                    <>
                                        <p>
                                            {secret.type === "environment"
                                                ? "The new variables replace every variable in the bundle."
                                                : "The new value replaces the old one everywhere it is used."}
                                        </p>
                                        <ValueFields
                                            attempted={attempted}
                                            disabled={disabled}
                                            errors={errors}
                                            fixedHeaders
                                            nextId={nextId}
                                            onChange={(next, id) => {
                                                setValue(next);
                                                if (id !== undefined) setNextId(id);
                                                setError(undefined);
                                            }}
                                            onSubmit={save}
                                            value={value}
                                        />
                                        <Box className="happy-agent-cluster-secret-form__add">
                                            <Button
                                                disabled={saving}
                                                onClick={() => setValue(undefined)}
                                                size="small"
                                                variant="ghost"
                                            >
                                                Keep the current value
                                            </Button>
                                        </Box>
                                    </>
                                )}
                            </fieldset>
                            <Box className="happy-agent-cluster-secret-form__danger">
                                <Box className="happy-agent-cluster-secret-form__danger-text">
                                    <span className="happy-agent-cluster-secret-form__label">
                                        Delete this secret
                                    </span>
                                    <span className="happy-agent-cluster-secret-form__hint">
                                        Every agent and workspace it was given to loses it.
                                    </span>
                                </Box>
                                <Button
                                    disabled={disabled}
                                    onClick={() => props.onDeleteOpen(base.version)}
                                    size="small"
                                    variant="danger"
                                >
                                    Delete…
                                </Button>
                            </Box>
                        </>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

/** The read-only facts of a secret, as label and text pairs. */
function secretFacts(secret: HappyAgentClusterSecretRow): readonly (readonly [string, string])[] {
    const facts: [string, string][] = [
        ["Type", HAPPY_AGENT_CLUSTER_SECRET_TYPE_TEXT[secret.type].label],
        ["Owner", secret.owner === "me" ? "Only you" : "Team"],
    ];
    if (!secret.access.manage && secret.description)
        facts.push(["Description", secret.description]);
    switch (secret.type) {
        case "endpoint":
            facts.push(
                [
                    "Targets",
                    secret.public.targets
                        .map((target) =>
                            [
                                target.host,
                                target.ports?.length ? `:${target.ports.join(", :")}` : "",
                                target.pathPrefixes?.length === 1
                                    ? target.pathPrefixes[0]
                                    : target.pathPrefixes?.length
                                      ? ` ${target.pathPrefixes.join(", ")}`
                                      : "",
                                target.methods?.length ? ` (${target.methods.join(", ")})` : "",
                            ].join(""),
                        )
                        .join("; "),
                ],
                [
                    "Headers",
                    secret.public.algorithm.headers
                        .map((header) =>
                            header.prefix
                                ? `${header.name} (${header.prefix.trim()} …)`
                                : header.name,
                        )
                        .join(", "),
                ],
            );
            break;
        case "ssh_key":
            facts.push(
                ["Hosts", secret.public.hosts.join(", ")],
                ["Fingerprint", secret.public.fingerprint],
            );
            break;
        case "git_credential": {
            const method = secret.public.method;
            facts.push(
                [
                    "Server",
                    secret.public.port === undefined
                        ? secret.public.server
                        : `${secret.public.server}:${String(secret.public.port)}`,
                ],
                [
                    "Method",
                    method.kind === "ssh_key"
                        ? `SSH key ${method.fingerprint}`
                        : method.kind === "password"
                          ? `Password for ${method.username}`
                          : method.username
                            ? `Token for ${method.username}`
                            : "Bearer token",
                ],
                [
                    "Repositories",
                    secret.public.repos?.length
                        ? secret.public.repos.join(", ")
                        : "Every repository",
                ],
                [
                    "Operations",
                    secret.public.operations
                        .map((operation) => GIT_OPERATION_TEXT[operation])
                        .join(", "),
                ],
            );
            break;
        }
        case "environment":
            facts.push(["Variables", secret.public.variables.join(", ")]);
            break;
    }
    facts.push(
        ["Used by", secret.uses.map((use) => HAPPY_AGENT_CLUSTER_SECRET_USE_TEXT[use]).join(", ")],
        ["You can", accessText(secret.access)],
    );
    return facts;
}

export function accessText(access: HappyAgentClusterSecretRow["access"]): string {
    const can = [
        access.use ? "use it in your runs" : undefined,
        access.manage ? "change and delete it" : undefined,
        access.attach ? "give it to agents" : undefined,
    ].filter((item) => item !== undefined);
    if (can.length === 0) return "See it, but not use it";
    const text = can.length === 1 ? can[0]! : `${can.slice(0, -1).join(", ")} and ${can.at(-1)!}`;
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface HappyAgentClusterSecretDeleteDialogProps {
    readonly name: string;
    onClose(): void;
    /** Deletes it; rejects with the reason to show. */
    onDelete(): Promise<void>;
}

/** Confirms deleting a secret and says who loses it. */
export function HappyAgentClusterSecretDeleteDialog(
    props: HappyAgentClusterSecretDeleteDialogProps,
) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const submit = () => {
        if (busy) return;
        setBusy(true);
        setError(undefined);
        void props.onDelete().then(
            () => props.onClose(),
            (reason: unknown) => {
                setBusy(false);
                setError(messageOf(reason));
            },
        );
    };
    return (
        <ModalOverlay
            onDismiss={() => {
                if (!busy) props.onClose();
            }}
        >
            <Modal
                footer={
                    <>
                        <Button disabled={busy} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button loading={busy} onClick={submit} variant="danger">
                            Delete secret
                        </Button>
                    </>
                }
                onClose={busy ? undefined : props.onClose}
                size="small"
                title={`Delete ${props.name}?`}
                tone="danger"
            >
                <Box
                    className="happy-agent-cluster-secret-form"
                    data-happy-desktop-ui="happy-agent-cluster-secret-delete"
                >
                    <p className="happy-agent-cluster-secret-form__hint">
                        Every agent and workspace it was given to loses it at once. This can’t be
                        undone.
                    </p>
                    {error ? (
                        <Banner tone="danger" title="Not deleted">
                            {error}
                        </Banner>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
