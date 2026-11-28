import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { TextField } from "../../TextField";

/**
 * How an API key signs requests to an endpoint of its own: as its vendor
 * does, as `Authorization: Bearer`, as `x-api-key`, or not at all.
 */
export type HappyAgentProviderAuth = "default" | "bearer" | "x-api-key" | "none";

/** One header an API key adds to every request to its endpoint. The value is a secret. */
export interface HappyAgentProviderHeader {
    readonly name: string;
    readonly value: string;
}

/** A header row while it is typed; `id` keeps its fields in place as rows come and go. */
export interface HappyAgentProviderHeaderRow extends HappyAgentProviderHeader {
    readonly id: number;
}

/** The vendor an endpoint of a key's own speaks for, as the fields word it. */
export interface HappyAgentProviderEndpointVendor {
    readonly name: string;
    /** Its own API, the placeholder of an empty endpoint. */
    readonly official: string;
    /** How it signs its own requests: `Authorization: Bearer` or `x-api-key`. */
    readonly signs: "bearer" | "x-api-key";
}

const SIGNS: Record<HappyAgentProviderEndpointVendor["signs"], string> = {
    bearer: "Authorization: Bearer",
    "x-api-key": "x-api-key",
};

function authOptions(vendor: HappyAgentProviderEndpointVendor) {
    return [
        { value: "default", label: `As ${vendor.name} does (${SIGNS[vendor.signs]})` },
        { value: "bearer", label: "Authorization: Bearer <token>" },
        { value: "x-api-key", label: "x-api-key: <token>" },
        { value: "none", label: "No token" },
    ];
}

function authOf(value: string): HappyAgentProviderAuth {
    return value === "bearer" || value === "x-api-key" || value === "none" ? value : "default";
}

/** How an API key signs requests to its endpoint. */
export function HappyAgentProviderAuthSelect(props: {
    readonly vendor: HappyAgentProviderEndpointVendor;
    readonly value: HappyAgentProviderAuth;
    readonly disabled?: boolean;
    onChange: (auth: HappyAgentProviderAuth) => void;
}) {
    return (
        <Select
            disabled={props.disabled === true}
            fullWidth
            label="Auth"
            onValueChange={(value) => props.onChange(authOf(value))}
            options={authOptions(props.vendor)}
            value={props.value}
        />
    );
}

/** The headers as they are sent: rows without a name dropped. */
export function happyAgentProviderHeadersOf(
    rows: readonly HappyAgentProviderHeaderRow[],
): readonly HappyAgentProviderHeader[] {
    return rows
        .filter((row) => row.name.trim() !== "")
        .map((row) => ({ name: row.name.trim(), value: row.value }));
}

/** Whether every named header has its value. */
export function happyAgentProviderHeadersComplete(
    rows: readonly HappyAgentProviderHeaderRow[],
): boolean {
    return rows.every((row) => row.name.trim() === "" || row.value.trim() !== "");
}

/**
 * Headers added to every request to the endpoint, one row each: its name,
 * its value masked, and a way to take it out. None show until one is added.
 */
export function HappyAgentProviderHeadersEditor(props: {
    readonly rows: readonly HappyAgentProviderHeaderRow[];
    readonly disabled?: boolean;
    onChange: (rows: readonly HappyAgentProviderHeaderRow[]) => void;
}) {
    const disabled = props.disabled === true;
    const update = (id: number, change: Partial<HappyAgentProviderHeader>): void =>
        props.onChange(props.rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
    const add = (): void =>
        props.onChange([
            ...props.rows,
            { id: Math.max(0, ...props.rows.map((row) => row.id)) + 1, name: "", value: "" },
        ]);
    return (
        <Box
            className="happy-agent-provider-headers"
            data-happy-desktop-ui="happy-agent-provider-headers"
        >
            {props.rows.length > 0 ? (
                <span className="happy-agent-provider-add__label">Headers</span>
            ) : null}
            {props.rows.map((row) => (
                <Box className="happy-agent-provider-headers__row" key={row.id}>
                    <TextField
                        aria-label="Header name"
                        autoComplete="off"
                        disabled={disabled}
                        fullWidth
                        onValueChange={(name) => update(row.id, { name })}
                        placeholder="X-Header"
                        value={row.name}
                    />
                    <TextField
                        aria-label={`${row.name || "Header"} value`}
                        autoComplete="off"
                        disabled={disabled}
                        fullWidth
                        onValueChange={(value) => update(row.id, { value })}
                        placeholder="Value"
                        type="password"
                        value={row.value}
                    />
                    <Button
                        aria-label={`Remove ${row.name || "header"}`}
                        disabled={disabled}
                        icon="close"
                        iconOnly
                        onClick={() =>
                            props.onChange(props.rows.filter((other) => other.id !== row.id))
                        }
                        size="small"
                        variant="ghost"
                    />
                </Box>
            ))}
            <Box className="happy-agent-provider-headers__add">
                <Button disabled={disabled} icon="plus" onClick={add} size="small" variant="ghost">
                    Add header
                </Button>
            </Box>
        </Box>
    );
}

/** A token's connection as it is stored, which the editor starts from. */
export interface HappyAgentProviderConnection {
    /** Its own endpoint; the vendor's own API when absent. */
    readonly url?: string;
    readonly auth: HappyAgentProviderAuth;
    /** The headers it sends, by name: their values never come back. */
    readonly headerNames: readonly string[];
}

/** What the editor saves. `headers` only when they were replaced; `secret` only when typed. */
export interface HappyAgentProviderConnectionChange {
    readonly baseUrl: string;
    readonly auth: HappyAgentProviderAuth;
    readonly headers?: readonly HappyAgentProviderHeader[];
    readonly secret?: string;
}

/**
 * One token's endpoint, auth and headers, in a dialog over its provider.
 * Stored header values are never shown: they are kept, or replaced as a
 * whole set. A token that took no key asks for one before it signs again.
 */
export function HappyAgentProviderConnectionDialog(props: {
    readonly vendor: HappyAgentProviderEndpointVendor;
    readonly connection: HappyAgentProviderConnection;
    /** The token it is for, such as "Backup key". */
    readonly subject: string;
    readonly busy: boolean;
    readonly error?: { readonly title: string; readonly message: string };
    onClose: () => void;
    onSave: (change: HappyAgentProviderConnectionChange) => void;
}) {
    const stored = props.connection;
    const [baseUrl, setBaseUrl] = useState(stored.url ?? "");
    const [auth, setAuth] = useState<HappyAgentProviderAuth>(stored.auth);
    const [secret, setSecret] = useState("");
    // Undefined while the stored headers are kept.
    const [rows, setRows] = useState<readonly HappyAgentProviderHeaderRow[] | undefined>(undefined);
    const busy = props.busy;
    const custom = baseUrl.trim() !== "";
    const keyNeeded = custom && auth !== "none" && stored.auth === "none";
    const complete =
        (!keyNeeded || secret.trim() !== "") &&
        (rows === undefined || happyAgentProviderHeadersComplete(rows));
    const close = (): void => {
        if (!busy) props.onClose();
    };
    const save = (): void => {
        if (busy || !complete) return;
        props.onSave({
            baseUrl,
            auth: custom ? auth : "default",
            ...(custom && rows !== undefined ? { headers: happyAgentProviderHeadersOf(rows) } : {}),
            ...(keyNeeded ? { secret } : {}),
        });
    };
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                busy={busy}
                footer={
                    <Button disabled={!complete && !busy} loading={busy} onClick={save}>
                        Save
                    </Button>
                }
                frame="anchored"
                icon="link"
                onClose={close}
                size="medium"
                subheader={
                    <span className="happy-agent-provider-add__subject">{props.subject}</span>
                }
                title="Connection"
            >
                <Box
                    className="happy-agent-provider-add"
                    data-happy-desktop-ui="happy-agent-ai-provider-connection"
                >
                    {props.error ? (
                        <Banner tone="danger" title={props.error.title}>
                            {props.error.message}
                        </Banner>
                    ) : null}
                    <TextField
                        autoComplete="off"
                        autoFocus
                        disabled={busy}
                        fullWidth
                        hint={`A proxy or gateway that speaks ${props.vendor.name}’s API. Leave empty for ${props.vendor.name} itself.`}
                        label="Endpoint"
                        onSubmit={save}
                        onValueChange={setBaseUrl}
                        placeholder={props.vendor.official}
                        value={baseUrl}
                    />
                    {custom ? (
                        <>
                            <HappyAgentProviderAuthSelect
                                disabled={busy}
                                onChange={setAuth}
                                value={auth}
                                vendor={props.vendor}
                            />
                            {keyNeeded ? (
                                <TextField
                                    autoComplete="off"
                                    disabled={busy}
                                    fullWidth
                                    label="Token"
                                    onSubmit={save}
                                    onValueChange={setSecret}
                                    type="password"
                                    value={secret}
                                />
                            ) : null}
                            {rows === undefined && stored.headerNames.length > 0 ? (
                                <Box className="happy-agent-provider-headers__stored">
                                    <span className="happy-agent-provider-add__hint">
                                        {`Sends ${stored.headerNames.join(", ")}; values hidden.`}
                                    </span>
                                    <Button
                                        disabled={busy}
                                        onClick={() =>
                                            setRows(
                                                stored.headerNames.map((name, index) => ({
                                                    id: index + 1,
                                                    name,
                                                    value: "",
                                                })),
                                            )
                                        }
                                        size="small"
                                        variant="ghost"
                                    >
                                        Replace headers
                                    </Button>
                                </Box>
                            ) : (
                                <HappyAgentProviderHeadersEditor
                                    disabled={busy}
                                    onChange={setRows}
                                    rows={rows ?? []}
                                />
                            )}
                        </>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
