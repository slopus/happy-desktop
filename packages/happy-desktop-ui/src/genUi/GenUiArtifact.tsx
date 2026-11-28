import { useState } from "react";
import type { HappyAgentGenUiSource } from "happy-desktop-state";
import { WindowOverlay } from "../WindowOverlay";
import { genUiRenderParseText, type GenUiAction, type GenUiActionType } from "./genUiRender";
import {
    GenUiRenderView,
    type GenUiActionHandler,
    type GenUiRenderViewProps,
} from "./GenUiRenderView";
import {
    GenUiSecretFormView,
    type GenUiClusterSecretHost,
    type GenUiSecretFormOpen,
    type GenUiSecretHost,
} from "./GenUiSecretForms";

export type {
    GenUiClusterSecretForm,
    GenUiClusterSecretHost,
    GenUiSecretForm,
    GenUiSecretHost,
} from "./GenUiSecretForms";

/**
 * Where a `plugin` element opens its plugin's page. From a version with a live
 * origin agent the tap names that element, so a setup seen after it is
 * reported to the agent; `reported` names the elements of a version for which
 * that already happened.
 */
export interface GenUiPluginHost {
    open(
        pluginId: string,
        tap: { readonly source: HappyAgentGenUiSource; readonly element: string } | undefined,
    ): void;
    reported(source: HappyAgentGenUiSource): ReadonlySet<string>;
}

const NONE_REPORTED: ReadonlySet<string> = new Set();

/* An address that never loads: a picture the version does not hold shows the
   failed placeholder rather than asking the app's own origin for the path. */
const MISSING_FILE = "data:,";

/* What only the agent that wrote a version can be sent; without one they never run. */
const ORIGIN_BOUND: ReadonlySet<GenUiActionType> = new Set(["message", "secret", "cluster_secret"]);

function messageOf(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

/**
 * A `gen_ui` artifact version: the render document the daemon compiled, drawn
 * against the other files of the same version, so a picture can never come
 * from another version than the document naming it.
 *
 * It runs the secret forms itself: a `secret` or `cluster_secret` button opens
 * the Settings secret form filled with what the agent suggested, every field
 * editable and every value typed by the person. Saving it is the button's
 * action finishing, and a saved form is never offered again. A `plugin`
 * button opens its plugin's page; once the host reports the plugin set up for
 * it, it is drawn done and still opens the page.
 */
export function GenUiArtifact(props: {
    /** The text of the version's `.genui/render.json`. */
    readonly render: string;
    /** Every file of the version by path, at the address it is served from. */
    readonly files: ReadonlyMap<string, string>;
    /** The version the document was read from; without it nothing is sent to an agent. */
    readonly source?: HappyAgentGenUiSource;
    readonly onAction?: GenUiActionHandler;
    readonly actionsSupported?: GenUiRenderViewProps["actionsSupported"];
    /** Opens and saves a Happy Agent's `secret` forms; without it they are not served. */
    readonly secrets?: GenUiSecretHost;
    /** Opens and saves `cluster_secret` forms; without it they are not served. */
    readonly clusterSecrets?: GenUiClusterSecretHost;
    /** Opens a `plugin` element's page and reports its setup; without it the action goes to `onAction`. */
    readonly plugins?: GenUiPluginHost;
}) {
    const document = genUiRenderParseText(props.render);
    const [form, setForm] = useState<GenUiSecretFormOpen | null>(null);
    const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
    const { source, secrets, clusterSecrets, plugins } = props;
    const supported =
        props.actionsSupported &&
        new Set(
            [...props.actionsSupported].filter(
                (type) =>
                    (source?.origin === true || !ORIGIN_BOUND.has(type)) &&
                    (type !== "secret" || secrets !== undefined) &&
                    (type !== "cluster_secret" || clusterSecrets !== undefined),
            ),
        );
    /* Holds the button pressed while its form is open: saved settles it for good, closed lets it go. */
    const formRun = (
        elementKey: string,
        show: (finish: (saved: boolean) => void) => void,
    ): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            show((saved) => {
                setForm(null);
                if (!saved) {
                    reject(new Error("The secret form was closed."));
                    return;
                }
                setSettled((current) => new Set([...current, elementKey]));
                resolve();
            });
        });
    const act = (elementKey: string, action: GenUiAction) => {
        if (action.type === "secret") {
            if (!secrets || !source) return;
            const prefill = action.secret;
            return formRun(elementKey, (finish) => {
                secrets.formOpen(source, elementKey, prefill.id).then(
                    (opened) =>
                        setForm({ type: "secret", prefill, opened: { form: opened }, finish }),
                    (reason: unknown) =>
                        setForm({
                            type: "secret",
                            prefill,
                            opened: { error: messageOf(reason) },
                            finish,
                        }),
                );
            });
        }
        if (action.type === "cluster_secret") {
            if (!clusterSecrets || !source) return;
            const prefill = action.secret;
            return formRun(elementKey, (finish) => {
                clusterSecrets.formOpen(source, elementKey, prefill.id).then(
                    (opened) =>
                        setForm({
                            type: "cluster_secret",
                            prefill,
                            opened: { form: opened },
                            finish,
                        }),
                    (reason: unknown) =>
                        setForm({
                            type: "cluster_secret",
                            prefill,
                            opened: { error: messageOf(reason) },
                            finish,
                        }),
                );
            });
        }
        if (action.type === "plugin" && plugins) {
            plugins.open(
                action.plugin.id,
                source?.origin === true ? { source, element: elementKey } : undefined,
            );
            return;
        }
        return props.onAction?.(elementKey, action);
    };
    return (
        <>
            <GenUiRenderView
                {...(supported ? { actionsSupported: supported } : {})}
                document={document}
                fileUrl={(path) => props.files.get(path) ?? MISSING_FILE}
                onAction={act}
                reported={source && plugins ? plugins.reported(source) : NONE_REPORTED}
                settled={settled}
            />
            {form ? (
                <WindowOverlay>
                    <GenUiSecretFormView open={form} />
                </WindowOverlay>
            ) : null}
        </>
    );
}
