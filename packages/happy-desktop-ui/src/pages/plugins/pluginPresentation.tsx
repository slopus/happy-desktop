import { useState } from "react";
import type {
    HappyAgentCustomPlugin,
    HappyAgentPluginImage,
    HappyAgentPluginInstallation,
    HappyAgentPluginInstallationStatus,
    HappyAgentPluginsSnapshot,
} from "happy-desktop-state";
import { Banner } from "../../Banner";
import { Icon } from "../../Icon";
import { thumbhashDataUrl } from "../../thumbhashDataUrl";

/** A plugin's picture over its ThumbHash, or the plugin glyph when it has none. */
export function PluginMark(props: {
    readonly image: HappyAgentPluginImage | null;
    /** `badge` is a 16 px mark beside a name in running text. */
    readonly size: "badge" | "row" | "hero";
}) {
    const placeholder = props.image?.thumbhash
        ? thumbhashDataUrl(props.image.thumbhash)
        : undefined;
    return (
        <span
            aria-hidden="true"
            className="happy-agent-plugin-mark"
            data-happy-desktop-ui="happy-agent-plugin-mark"
            data-size={props.size}
            {...(placeholder ? { style: { backgroundImage: `url("${placeholder}")` } } : {})}
        >
            {props.image ? (
                <img
                    alt=""
                    className="happy-agent-plugin-mark__image"
                    draggable={false}
                    src={props.image.url}
                />
            ) : (
                <Icon
                    name="plugin"
                    size={props.size === "hero" ? 24 : props.size === "badge" ? 12 : 16}
                />
            )}
        </span>
    );
}

const STATUS_LABEL: Record<HappyAgentPluginInstallationStatus, string> = {
    active: "Ready",
    installing: "Installing…",
    failed: "Failed",
    notConfigured: "Needs setup",
    methodUnavailable: "Needs setup again",
};

/** An installation's state as a dot and a word. */
export function PluginInstallationStatus(props: {
    readonly installation: HappyAgentPluginInstallation;
}) {
    const status = props.installation.status;
    const disabled = props.installation.enabled === false;
    const tone =
        !props.installation.available || disabled
            ? "muted"
            : status === "active"
              ? "ready"
              : status === "installing"
                ? "muted"
                : status === "failed"
                  ? "failed"
                  : "attention";
    return (
        <span className="happy-agent-plugin-status" data-tone={tone}>
            <span aria-hidden="true" className="happy-agent-plugin-status__dot" />
            {!props.installation.available
                ? "Unavailable"
                : disabled
                  ? "Disabled"
                  : STATUS_LABEL[status]}
        </span>
    );
}

/** Readers who can install but not manage zones get a note, not the setup sheet. */
export function PluginZoneSetupNotice(props: {
    readonly plugins: HappyAgentPluginsSnapshot;
    readonly onDismiss?: (() => void) | undefined;
}) {
    const setup = props.plugins.zoneSetup;
    if (setup?.kind !== "notice") return null;
    const name = props.plugins.plugins.find((plugin) => plugin.id === setup.pluginId)?.name;
    return (
        <Banner
            tone="info"
            title={name ? `${name} installed` : "Plugin installed"}
            {...(props.onDismiss ? { onDismiss: props.onDismiss } : {})}
        >
            Someone who manages zones must enable its tools before agents can use them.
        </Banner>
    );
}

/**
 * What a feature plugin is, said wherever one is installed or uninstalled: the
 * person's own, and uninstalling it keeps everything.
 */
export const FEATURE_PLUGIN_NOTE =
    "Just for you, in every team you belong to. Uninstalling hides it for you and deletes nothing: what your team made with it stays, other members keep using it, and installing it again brings everything back.";

/** "Only you · 8 skills": who sees a custom plugin, and how many skills it gives agents. */
export function customPluginMeta(plugin: HappyAgentCustomPlugin): string {
    const count = plugin.skills.length;
    return [
        customPluginAudience(plugin),
        count === 0 ? "No skills" : `${String(count)} ${count === 1 ? "skill" : "skills"}`,
    ].join(" · ");
}

export function customPluginAudience(plugin: HappyAgentCustomPlugin): string {
    return plugin.owner === "team" ? "Shared with the team" : "Only you";
}

/** How one installation is named: the plugin name, with its label when the person gave one. */
export function pluginInstallationTitle(installation: HappyAgentPluginInstallation): string {
    return installation.label ? `${installation.name} · ${installation.label}` : installation.name;
}

/**
 * Runs one promise-returning act from a control, holding it pending until it
 * settles and keeping the reason it was refused. Local to the control: the
 * store owns what the act changes.
 */
export function usePluginAct(): {
    readonly pending: boolean;
    readonly error: string | undefined;
    run(act: () => Promise<unknown>): Promise<boolean>;
    errorClear(): void;
} {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    return {
        pending,
        error,
        async run(act) {
            if (pending) return false;
            setPending(true);
            setError(undefined);
            try {
                await act();
                return true;
            } catch (refusal) {
                setError(refusal instanceof Error ? refusal.message : String(refusal));
                return false;
            } finally {
                setPending(false);
            }
        },
        errorClear: () => setError(undefined),
    };
}
