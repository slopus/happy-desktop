import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Checkbox } from "../../Checkbox";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";

/** The wire protocol a team's own provider speaks. */
export type HappyAgentCustomProviderProtocolId =
    | "openai_responses"
    | "openai_chat"
    | "anthropic_messages";

export const HAPPY_AGENT_CUSTOM_PROVIDER_PROTOCOL_LABELS: Record<
    HappyAgentCustomProviderProtocolId,
    string
> = {
    openai_responses: "OpenAI Responses",
    openai_chat: "OpenAI Chat Completions",
    anthropic_messages: "Anthropic Messages",
};

/** The protocols Happy Cloud serves today; the others are stored but offer nothing. */
const OFFERED: ReadonlySet<HappyAgentCustomProviderProtocolId> = new Set(["openai_responses"]);

export function happyAgentCustomProviderProtocolOffered(
    protocol: HappyAgentCustomProviderProtocolId,
): boolean {
    return OFFERED.has(protocol);
}

export interface HappyAgentCustomProviderModelValues {
    readonly id: string;
    readonly name: string;
    /** Tokens; the server chooses one when absent. */
    readonly contextWindow: number | null;
    readonly images: boolean;
}

/** A team's own provider, as the dialog shows and sends it. */
export interface HappyAgentCustomProviderValues {
    readonly providerId: string;
    readonly name: string;
    readonly baseUrl: string;
    readonly protocol: HappyAgentCustomProviderProtocolId;
    readonly promptCacheKey: boolean;
    readonly models: readonly HappyAgentCustomProviderModelValues[];
}

export interface HappyAgentCustomProviderDialogProps {
    /** The provider being edited; absent while a new one is added. */
    readonly providerId?: string;
    /** What the server stores for the provider being edited, once read. */
    readonly values?: HappyAgentCustomProviderValues;
    readonly loading: boolean;
    readonly saving: boolean;
    readonly removing: boolean;
    /** Why reading, saving, or removing was refused. */
    readonly error?: string;
    onSave: (values: HappyAgentCustomProviderValues) => void;
    onRemove?: () => void;
    onClose: () => void;
}

/**
 * Adds or edits a provider of the team's own: an endpoint that speaks a known
 * protocol, and the models it serves. Its keys are added on its card like any
 * team key, so nothing secret passes through here.
 */
export function HappyAgentCustomProviderDialog(props: HappyAgentCustomProviderDialogProps) {
    const busy = props.saving || props.removing;
    const close = (): void => {
        if (!busy) props.onClose();
    };
    return (
        <ModalOverlay onDismiss={close}>
            {props.providerId !== undefined && props.values === undefined ? (
                <Modal
                    footer={
                        <Button onClick={close} variant="ghost">
                            Close
                        </Button>
                    }
                    icon="globe"
                    onClose={close}
                    size="large"
                    title="Edit provider"
                >
                    <Box
                        className="happy-agent-custom-provider__form"
                        data-happy-desktop-ui="happy-agent-custom-provider"
                    >
                        {props.error ? (
                            <Banner tone="danger" title="Provider unavailable">
                                {props.error}
                            </Banner>
                        ) : (
                            <Box className="happy-agent-settings__pending">
                                <Spinner size={16} />
                                <span>Reading the provider…</span>
                            </Box>
                        )}
                    </Box>
                </Modal>
            ) : (
                <HappyAgentCustomProviderForm {...props} onClose={close} />
            )}
        </ModalOverlay>
    );
}

interface ModelDraft {
    /** Local row key; a model's own ID is what the person types. */
    readonly key: number;
    readonly id: string;
    readonly name: string;
    readonly contextWindow: string;
    readonly images: boolean;
}

interface Draft {
    readonly providerId: string;
    /** Whether the ID still follows the name, until the person types their own. */
    readonly providerIdFollows: boolean;
    readonly name: string;
    readonly baseUrl: string;
    readonly protocol: HappyAgentCustomProviderProtocolId;
    readonly promptCacheKey: boolean;
    readonly models: readonly ModelDraft[];
    readonly nextKey: number;
    /** Why the form can't be sent, shown once the person tries. */
    readonly invalid?: string;
    readonly confirmingRemove: boolean;
}

const PROVIDER_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u;

function providerIdFrom(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, "-")
        .replace(/^-+|-+$/gu, "")
        .slice(0, 40)
        .replace(/-+$/u, "");
}

function draftOf(values: HappyAgentCustomProviderValues | undefined): Draft {
    const models = (
        values?.models ?? [{ id: "", name: "", contextWindow: null, images: false }]
    ).map(
        (model, key): ModelDraft => ({
            key,
            id: model.id,
            name: model.name,
            contextWindow: model.contextWindow === null ? "" : String(model.contextWindow),
            images: model.images,
        }),
    );
    return {
        providerId: values?.providerId ?? "",
        providerIdFollows: values === undefined,
        name: values?.name ?? "",
        baseUrl: values?.baseUrl ?? "",
        protocol: values?.protocol ?? "openai_responses",
        promptCacheKey: values?.promptCacheKey ?? false,
        models,
        nextKey: models.length,
        confirmingRemove: false,
    };
}

/** The values to send, or the first reason they can't be sent. */
function valuesOf(draft: Draft): HappyAgentCustomProviderValues | string {
    const name = draft.name.trim();
    if (!name) return "Give the provider a name.";
    if (!PROVIDER_ID.test(draft.providerId))
        return "The ID takes lowercase letters, digits and dashes, and starts and ends with a letter or digit.";
    const baseUrl = draft.baseUrl.trim();
    if (!/^https:\/\/\S+$/u.test(baseUrl)) return "The base URL is a public HTTPS address.";
    if (draft.models.length === 0) return "Add the models this provider serves.";
    const seen = new Set<string>();
    const models: HappyAgentCustomProviderModelValues[] = [];
    for (const model of draft.models) {
        const id = model.id.trim();
        if (!id) return "Every model needs the ID the endpoint knows it by.";
        if (seen.has(id)) return `${id} is listed twice.`;
        seen.add(id);
        const window = model.contextWindow.trim();
        const contextWindow = window === "" ? null : Number(window);
        if (contextWindow !== null && (!Number.isInteger(contextWindow) || contextWindow <= 0))
            return `The context window of ${id} is a whole number of tokens.`;
        models.push({ id, name: model.name.trim() || id, contextWindow, images: model.images });
    }
    return {
        providerId: draft.providerId,
        name,
        baseUrl,
        protocol: draft.protocol,
        promptCacheKey: draft.protocol === "anthropic_messages" ? false : draft.promptCacheKey,
        models,
    };
}

function HappyAgentCustomProviderForm(props: HappyAgentCustomProviderDialogProps) {
    const [draft, setDraft] = useState<Draft>(() => draftOf(props.values));
    const editing = props.providerId !== undefined;
    const busy = props.saving || props.removing;
    const update = (change: Partial<Draft>): void => {
        const { invalid: _cleared, ...rest } = draft;
        setDraft({ ...rest, ...change });
    };
    const modelUpdate = (key: number, change: Partial<ModelDraft>): void =>
        update({
            models: draft.models.map((model) =>
                model.key === key ? { ...model, ...change } : model,
            ),
        });
    const submit = (): void => {
        if (busy) return;
        const values = valuesOf(draft);
        if (typeof values === "string") setDraft({ ...draft, invalid: values });
        else props.onSave(values);
    };
    const message = draft.invalid ?? props.error;
    const protocolOptions = (
        Object.keys(
            HAPPY_AGENT_CUSTOM_PROVIDER_PROTOCOL_LABELS,
        ) as HappyAgentCustomProviderProtocolId[]
    ).map((protocol) => ({
        value: protocol,
        label: OFFERED.has(protocol)
            ? HAPPY_AGENT_CUSTOM_PROVIDER_PROTOCOL_LABELS[protocol]
            : `${HAPPY_AGENT_CUSTOM_PROVIDER_PROTOCOL_LABELS[protocol]} (not served yet)`,
        disabled: !OFFERED.has(protocol) && protocol !== props.values?.protocol,
    }));
    const footer = draft.confirmingRemove ? (
        <>
            <span className="happy-agent-custom-provider__confirm">
                Remove {props.values?.name}? Agents on its models stop working.
            </span>
            <Button
                disabled={busy}
                onClick={() => update({ confirmingRemove: false })}
                variant="ghost"
            >
                Keep
            </Button>
            <Button loading={props.removing} onClick={props.onRemove} variant="danger">
                Remove provider
            </Button>
        </>
    ) : (
        <>
            {editing && props.onRemove ? (
                <Button
                    className="happy-agent-custom-provider__remove"
                    disabled={busy}
                    icon="trash"
                    onClick={() => update({ confirmingRemove: true })}
                    variant="ghost"
                >
                    Remove
                </Button>
            ) : null}
            <Button disabled={busy} onClick={props.onClose} variant="ghost">
                Cancel
            </Button>
            <Button disabled={props.removing} loading={props.saving} onClick={submit}>
                {editing ? "Save" : "Add provider"}
            </Button>
        </>
    );
    return (
        <Modal
            footer={footer}
            icon="globe"
            onClose={busy ? undefined : props.onClose}
            size="large"
            title={editing ? `Edit ${props.values?.name ?? "provider"}` : "Add a provider"}
        >
            <Box
                className="happy-agent-custom-provider__form"
                data-happy-desktop-ui="happy-agent-custom-provider"
            >
                {message ? (
                    <Banner tone="danger" title={editing ? "Not saved" : "Not added"}>
                        {message}
                    </Banner>
                ) : null}
                <Box className="happy-agent-custom-provider__pair">
                    <TextField
                        autoFocus={!editing}
                        disabled={busy}
                        fullWidth
                        label="Name"
                        onValueChange={(name) =>
                            update(
                                draft.providerIdFollows
                                    ? { name, providerId: providerIdFrom(name) }
                                    : { name },
                            )
                        }
                        placeholder="Acme vLLM"
                        value={draft.name}
                    />
                    <TextField
                        disabled={busy || editing}
                        fullWidth
                        hint={
                            editing
                                ? "The ID can't change."
                                : "Used in model names. It can't change later."
                        }
                        label="ID"
                        onValueChange={(providerId) =>
                            update({ providerId, providerIdFollows: false })
                        }
                        placeholder="acme"
                        value={draft.providerId}
                    />
                </Box>
                <TextField
                    disabled={busy}
                    fullWidth
                    hint="A public HTTPS address, for example https://llm.example.com/v1"
                    label="Base URL"
                    onValueChange={(baseUrl) => update({ baseUrl })}
                    placeholder="https://llm.example.com/v1"
                    value={draft.baseUrl}
                />
                <Select
                    disabled={busy}
                    fullWidth
                    hint={
                        OFFERED.has(draft.protocol)
                            ? "How Happy talks to the endpoint."
                            : "Happy Cloud doesn’t serve this protocol yet, so the provider offers no models."
                    }
                    label="Protocol"
                    onValueChange={(protocol) =>
                        update({ protocol: protocol as HappyAgentCustomProviderProtocolId })
                    }
                    options={protocolOptions}
                    value={draft.protocol}
                />
                {draft.protocol === "anthropic_messages" ? null : (
                    <Checkbox
                        checked={draft.promptCacheKey}
                        disabled={busy}
                        label="Send a prompt cache key, for endpoints that route cached prompts by it"
                        onChange={(promptCacheKey) => update({ promptCacheKey })}
                    />
                )}
                <Box className="happy-agent-custom-provider__models">
                    <span className="happy-agent-custom-provider__models-title">Models</span>
                    {draft.models.map((model) => (
                        <Box
                            className="happy-agent-custom-provider__model"
                            data-happy-desktop-ui="happy-agent-custom-provider-model"
                            key={model.key}
                        >
                            <TextField
                                aria-label="Model ID"
                                disabled={busy}
                                onValueChange={(id) => modelUpdate(model.key, { id })}
                                placeholder="Model ID, for example qwen-3"
                                value={model.id}
                            />
                            <TextField
                                aria-label="Model name"
                                disabled={busy}
                                onValueChange={(name) => modelUpdate(model.key, { name })}
                                placeholder="Name"
                                value={model.name}
                            />
                            <TextField
                                aria-label="Context window"
                                disabled={busy}
                                onValueChange={(contextWindow) =>
                                    modelUpdate(model.key, { contextWindow })
                                }
                                placeholder="Context, 128000"
                                value={model.contextWindow}
                            />
                            <Checkbox
                                checked={model.images}
                                disabled={busy}
                                label="Images"
                                onChange={(images) => modelUpdate(model.key, { images })}
                            />
                            <Button
                                aria-label={`Remove ${model.id || "this model"}`}
                                disabled={busy}
                                icon="trash"
                                onClick={() =>
                                    update({
                                        models: draft.models.filter(
                                            (entry) => entry.key !== model.key,
                                        ),
                                    })
                                }
                                size="small"
                                variant="ghost"
                            />
                        </Box>
                    ))}
                    <Box className="happy-agent-custom-provider__models-add">
                        <Button
                            disabled={busy}
                            icon="plus"
                            onClick={() =>
                                update({
                                    models: [
                                        ...draft.models,
                                        {
                                            key: draft.nextKey,
                                            id: "",
                                            name: "",
                                            contextWindow: "",
                                            images: false,
                                        },
                                    ],
                                    nextKey: draft.nextKey + 1,
                                })
                            }
                            size="small"
                            variant="secondary"
                        >
                            Add model
                        </Button>
                    </Box>
                </Box>
            </Box>
        </Modal>
    );
}
