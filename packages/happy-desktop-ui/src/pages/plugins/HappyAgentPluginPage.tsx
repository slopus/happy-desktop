import { useState, type CSSProperties } from "react";
import type {
    HappyAgentPlugin,
    HappyAgentPluginAuthMethod,
    HappyAgentPluginInstallation,
    HappyAgentPluginsSnapshot,
} from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Button } from "../../Button";
import { EmptyState } from "../../EmptyState";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { ScrollArea } from "../../Scrollbar";
import { SecretValueField } from "../../SecretValueField";
import { SegmentedControl } from "../../SegmentedControl";
import { TextField } from "../../TextField";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { ArtifactHeader } from "../artifacts/ArtifactHeader";
import {
    PluginInstallationStatus,
    PluginMark,
    pluginInstallationTitle,
    usePluginAct,
} from "./pluginPresentation";

/** Why a setup was refused: the overall reason and, by field key, what is wrong with each. */
export interface HappyAgentPluginSetupRefusal {
    readonly message: string;
    readonly fields: ReadonlyMap<string, string>;
}

export interface HappyAgentPluginPageProps {
    pluginId: string;
    plugins: HappyAgentPluginsSnapshot;
    onBack?: () => void;
    /** Installs the plugin; rejects with the reason to show. */
    onInstall: (pluginId: string) => Promise<unknown>;
    onRemove: (installationId: string) => Promise<unknown>;
    /**
     * Signs an installation in with a fields method. Resolves to the refusal
     * when the server refused some fields, so each is shown under its field.
     */
    onConfigure: (
        installationId: string,
        methodId: string,
        values: ReadonlyMap<string, string>,
    ) => Promise<HappyAgentPluginSetupRefusal | undefined>;
    /** Starts an OAuth sign-in in the person's browser. */
    onConnect: (installationId: string, methodId: string) => Promise<unknown>;
    onDisconnect: (installationId: string) => Promise<unknown>;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentPluginPage — one plugin: what it is and the tools it gives agents,
 * then each of the team's installations of it, with the way to set each up.
 */
export function HappyAgentPluginPage(props: HappyAgentPluginPageProps) {
    const snapshot = props.plugins;
    const plugin = snapshot.plugins.find((entry) => entry.id === props.pluginId);
    const installations = snapshot.installations.filter(
        (installation) => installation.pluginId === props.pluginId,
    );
    const install = usePluginAct();
    const back = props.onBack ? (
        <Button
            aria-label="Back"
            iconOnly
            onClick={props.onBack}
            size="small"
            title="Back"
            variant="ghost"
        >
            <Ionicon name="arrow-back" size={14} />
        </Button>
    ) : undefined;
    const name = plugin?.name ?? installations[0]?.name ?? props.pluginId;
    return (
        <div
            className={["happy-agent-plugins", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-plugin"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <ArtifactHeader
                className="happy-agent-plugins__header"
                {...(back ? { leading: back } : {})}
                {...(plugin ? { subtitle: `Version ${plugin.version}` } : {})}
                title={name}
            />
            <ScrollArea
                className="happy-agent-plugins__scroll"
                viewportClassName="happy-agent-plugins__scroll-viewport"
            >
                <div className="happy-agent-plugins__content">
                    {snapshot.error ? (
                        <Banner tone="danger" title="Plugins may be out of date">
                            {snapshot.error.message}
                        </Banner>
                    ) : null}
                    {plugin === undefined && installations.length === 0 ? (
                        <EmptyState
                            description={
                                snapshot.loading
                                    ? "Reading the plugins this server offers."
                                    : "This server does not offer this plugin."
                            }
                            icon={snapshot.loading ? "clock" : "plugin"}
                            size="panel"
                            title={snapshot.loading ? "Loading plugin…" : "Plugin not found"}
                        />
                    ) : (
                        <>
                            <section
                                className="happy-agent-plugin__summary"
                                data-happy-desktop-ui="happy-agent-plugin-summary"
                            >
                                <PluginMark
                                    image={plugin?.image ?? installations[0]?.image ?? null}
                                    size="hero"
                                />
                                <div className="happy-agent-plugin__summary-text">
                                    <p className="happy-agent-plugin__description">
                                        {plugin?.description ||
                                            "This server no longer offers this plugin."}
                                    </p>
                                    {install.error ? (
                                        <p className="happy-agent-plugin__error">{install.error}</p>
                                    ) : plugin?.installRefusal ? (
                                        <p className="happy-agent-plugins__note">
                                            {plugin.installRefusal}
                                        </p>
                                    ) : null}
                                </div>
                                {plugin &&
                                snapshot.manage &&
                                (plugin.multiInstance || installations.length === 0) ? (
                                    <Button
                                        disabled={plugin.installRefusal !== null}
                                        loading={install.pending}
                                        onClick={() =>
                                            void install.run(() => props.onInstall(plugin.id))
                                        }
                                        size="small"
                                        variant={installations.length > 0 ? "secondary" : "primary"}
                                    >
                                        {installations.length > 0 ? "Install again" : "Install"}
                                    </Button>
                                ) : null}
                            </section>
                            {snapshot.manage && installations.length > 0 ? (
                                <section className="happy-agent-plugins__section">
                                    <h2 className="happy-agent-plugins__heading">Installed</h2>
                                    <div className="happy-agent-plugins__cards">
                                        {installations.map((installation) => (
                                            <InstallationCard
                                                installation={installation}
                                                key={installation.id}
                                                onConfigure={props.onConfigure}
                                                onConnect={props.onConnect}
                                                onDisconnect={props.onDisconnect}
                                                onRemove={props.onRemove}
                                                plugin={plugin}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ) : null}
                            {snapshot.manage ? null : (
                                <p className="happy-agent-plugins__note">
                                    Only people who manage plugins can install and set them up.
                                </p>
                            )}
                            {plugin && plugin.tools.length > 0 ? (
                                <section className="happy-agent-plugins__section">
                                    <h2 className="happy-agent-plugins__heading">Tools</h2>
                                    <ul className="happy-agent-plugin__tools">
                                        {plugin.tools.map((tool) => (
                                            <li
                                                className="happy-agent-plugin__tool"
                                                key={tool.name}
                                            >
                                                <code className="happy-agent-plugin__tool-name">
                                                    {tool.name}
                                                </code>
                                                <span className="happy-agent-plugin__tool-summary">
                                                    {tool.summary}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ) : null}
                        </>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function InstallationCard(props: {
    readonly installation: HappyAgentPluginInstallation;
    readonly plugin: HappyAgentPlugin | undefined;
    readonly onRemove: HappyAgentPluginPageProps["onRemove"];
    readonly onConfigure: HappyAgentPluginPageProps["onConfigure"];
    readonly onConnect: HappyAgentPluginPageProps["onConnect"];
    readonly onDisconnect: HappyAgentPluginPageProps["onDisconnect"];
}) {
    const installation = props.installation;
    const methods = props.plugin?.authMethods ?? [];
    const [confirming, setConfirming] = useState(false);
    const remove = usePluginAct();
    const disconnect = usePluginAct();
    const signedIn = installation.status === "active" && installation.authMethod !== null;
    return (
        <article
            className="happy-agent-plugin-card"
            data-happy-desktop-ui="happy-agent-plugin-card"
        >
            <header className="happy-agent-plugin-card__header">
                <span className="happy-agent-plugin-card__title">
                    {pluginInstallationTitle(installation)}
                </span>
                <PluginInstallationStatus installation={installation} />
                <span className="happy-agent-plugin-card__actions">
                    {signedIn ? (
                        <Button
                            disabled={!installation.available}
                            loading={disconnect.pending}
                            onClick={() =>
                                void disconnect.run(() => props.onDisconnect(installation.id))
                            }
                            size="small"
                            variant="secondary"
                        >
                            Sign out
                        </Button>
                    ) : null}
                    <Button
                        disabled={!installation.available}
                        loading={remove.pending}
                        onClick={() => setConfirming(true)}
                        size="small"
                        variant="secondary"
                    >
                        Remove
                    </Button>
                </span>
            </header>
            {installation.status === "failed" && installation.error ? (
                <p className="happy-agent-plugin__error">{installation.error}</p>
            ) : null}
            {installation.toolPrefix === null ? null : (
                <p className="happy-agent-plugin-card__meta">
                    Agents call its tools as <code>{installation.toolPrefix}…</code>
                </p>
            )}
            {remove.error || disconnect.error ? (
                <p className="happy-agent-plugin__error">{remove.error ?? disconnect.error}</p>
            ) : null}
            {confirming ? (
                <ModalOverlay onDismiss={() => setConfirming(false)}>
                    <Modal
                        footer={
                            <>
                                <Button onClick={() => setConfirming(false)} variant="ghost">
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => {
                                        setConfirming(false);
                                        void remove.run(() => props.onRemove(installation.id));
                                    }}
                                    variant="danger"
                                >
                                    Remove plugin
                                </Button>
                            </>
                        }
                        onClose={() => setConfirming(false)}
                        size="small"
                        title={`Remove ${pluginInstallationTitle(installation)}?`}
                        tone="danger"
                    >
                        <p className="happy-agent-plugins__note">
                            Its sign-in and everything it stored are deleted, and agents lose the
                            tools and skills it gave them.
                        </p>
                    </Modal>
                </ModalOverlay>
            ) : null}
            {installation.available && !signedIn && methods.length > 0 ? (
                <InstallationSetup
                    installation={installation}
                    methods={methods}
                    onConfigure={props.onConfigure}
                    onConnect={props.onConnect}
                />
            ) : null}
        </article>
    );
}

function InstallationSetup(props: {
    readonly installation: HappyAgentPluginInstallation;
    readonly methods: readonly HappyAgentPluginAuthMethod[];
    readonly onConfigure: HappyAgentPluginPageProps["onConfigure"];
    readonly onConnect: HappyAgentPluginPageProps["onConnect"];
}) {
    const [methodId, setMethodId] = useState(props.methods[0]!.id);
    const method = props.methods.find((entry) => entry.id === methodId) ?? props.methods[0]!;
    const [values, setValues] = useState<ReadonlyMap<string, string>>(new Map());
    const [refusal, setRefusal] = useState<HappyAgentPluginSetupRefusal>();
    const act = usePluginAct();
    const missing =
        method.type === "fields" &&
        method.fields.some((field) => field.required && !(values.get(field.key) ?? "").trim());
    return (
        <div className="happy-agent-plugin-setup" data-happy-desktop-ui="happy-agent-plugin-setup">
            {props.methods.length > 1 ? (
                <SegmentedControl
                    aria-label="How to sign in"
                    onChange={(value) => {
                        setMethodId(value);
                        setRefusal(undefined);
                        act.errorClear();
                    }}
                    segments={props.methods.map((entry) => ({
                        value: entry.id,
                        label: entry.label,
                    }))}
                    size="small"
                    value={method.id}
                />
            ) : null}
            {method.type === "fields" ? (
                method.fields.map((field) => {
                    const common = {
                        error: refusal?.fields.get(field.key),
                        fullWidth: true,
                        label: field.label,
                        onValueChange: (value: string) =>
                            setValues((current) => new Map(current).set(field.key, value)),
                        required: field.required,
                        size: "small" as const,
                        value: values.get(field.key) ?? "",
                        ...(field.help ? { hint: field.help } : {}),
                        ...(field.multiline ? { multiline: true, rows: 4 } : {}),
                    };
                    return field.secret ? (
                        <SecretValueField key={field.key} {...common} />
                    ) : (
                        <TextField key={field.key} {...common} />
                    );
                })
            ) : (
                <p className="happy-agent-plugins__note">
                    Opens {method.label} in your browser. You come back here once it is done.
                </p>
            )}
            {act.error || (refusal && refusal.fields.size === 0) ? (
                <p className="happy-agent-plugin__error">{act.error ?? refusal?.message}</p>
            ) : null}
            <div className="happy-agent-plugin-setup__actions">
                <Button
                    disabled={missing}
                    loading={act.pending}
                    onClick={() =>
                        void act.run(async () => {
                            if (method.type === "oauth") {
                                await props.onConnect(props.installation.id, method.id);
                                return;
                            }
                            const refused = await props.onConfigure(
                                props.installation.id,
                                method.id,
                                values,
                            );
                            setRefusal(refused);
                            if (!refused) setValues(new Map());
                        })
                    }
                    size="small"
                    variant="primary"
                >
                    {method.type === "oauth" ? `Continue with ${method.label}` : "Save"}
                </Button>
            </div>
        </div>
    );
}
