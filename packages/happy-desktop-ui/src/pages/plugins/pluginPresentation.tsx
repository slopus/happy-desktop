import { useState } from "react";
import type {
    HappyAgentPluginImage,
    HappyAgentPluginInstallation,
    HappyAgentPluginInstallationStatus,
} from "happy-desktop-state";
import { Icon } from "../../Icon";
import { thumbhashDataUrl } from "../../thumbhashDataUrl";

/** A plugin's picture over its ThumbHash, or the plugin glyph when it has none. */
export function PluginMark(props: {
    readonly image: HappyAgentPluginImage | null;
    readonly size: "row" | "hero";
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
                <Icon name="plugin" size={props.size === "hero" ? 24 : 16} />
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
    const tone = !props.installation.available
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
            {props.installation.available ? STATUS_LABEL[props.installation.status] : "Unavailable"}
        </span>
    );
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
