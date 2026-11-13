import { useState } from "react";
import type { HappyAgentGenUiSource } from "happy-desktop-state";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { ModalOverlay } from "../ModalOverlay";
import {
    HappyAgentClusterSecretCreateDialog,
    HappyAgentClusterSecretEditDialog,
} from "../pages/settings/HappyAgentClusterSecretDialogs";
import {
    happyAgentClusterSecretDraftFromPrefill,
    type HappyAgentClusterSecretCreateInput,
    type HappyAgentClusterSecretOwner,
    type HappyAgentClusterSecretUpdateInput,
} from "../pages/settings/happyAgentClusterSecretDraft";
import type { HappyAgentClusterSecretRow } from "../pages/settings/HappyAgentClusterSecretSettings";
import { WindowOverlay } from "../WindowOverlay";
import {
    genUiRenderParseText,
    type GenUiAction,
    type GenUiActionType,
    type GenUiClusterSecretPrefill,
} from "./genUiRender";
import {
    GenUiRenderView,
    type GenUiActionHandler,
    type GenUiRenderViewProps,
} from "./GenUiRenderView";

/* An address that never loads: a picture the version does not hold shows the
   failed placeholder rather than asking the app's own origin for the path. */
const MISSING_FILE = "data:,";

/* What only the agent that wrote a version can be sent; without one they never run. */
const ORIGIN_BOUND: ReadonlySet<GenUiActionType> = new Set(["message", "secret", "cluster_secret"]);

/** Where a `cluster_secret` form is opened and saved, as the application reads it. */
export interface GenUiClusterSecretHost {
    /** Rejects with the reason to show, such as a named secret the reader cannot see. */
    formOpen(
        source: HappyAgentGenUiSource,
        element: string,
        secretId: string | undefined,
    ): Promise<GenUiClusterSecretForm>;
}

/** One opening of a cluster secret form; every save from it is one click. */
export interface GenUiClusterSecretForm {
    readonly owners: readonly HappyAgentClusterSecretOwner[];
    /** The secret a change-mode action names; nothing when the action creates one. */
    readonly secret: HappyAgentClusterSecretRow | undefined;
    create(input: HappyAgentClusterSecretCreateInput): Promise<void>;
    update(version: string, input: HappyAgentClusterSecretUpdateInput): Promise<void>;
}

type SecretForm = {
    readonly elementKey: string;
    readonly prefill: GenUiClusterSecretPrefill;
    readonly opened: { readonly form: GenUiClusterSecretForm } | { readonly error: string };
    readonly finish: (saved: boolean) => void;
};

/**
 * A `gen_ui` artifact version: the render document the daemon compiled, drawn
 * against the other files of the same version, so a picture can never come
 * from another version than the document naming it.
 *
 * It runs the secret forms itself: a `cluster_secret` button opens the
 * Settings secret form filled with what the agent suggested, every field
 * editable and every value typed by the person. Saving it is the button's
 * action finishing, and a saved form is never offered again.
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
    /** Opens and saves `cluster_secret` forms; without it they are not served. */
    readonly clusterSecrets?: GenUiClusterSecretHost;
}) {
    const document = genUiRenderParseText(props.render);
    const [form, setForm] = useState<SecretForm | null>(null);
    const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
    const source = props.source;
    const clusterSecrets = props.clusterSecrets;
    const supported =
        props.actionsSupported &&
        new Set(
            [...props.actionsSupported].filter(
                (type) =>
                    (source?.origin === true || !ORIGIN_BOUND.has(type)) &&
                    (type !== "cluster_secret" || clusterSecrets !== undefined),
            ),
        );
    const act = (elementKey: string, action: GenUiAction) => {
        if (action.type !== "cluster_secret") return props.onAction?.(elementKey, action);
        if (!clusterSecrets || !source) return;
        return new Promise<void>((resolve, reject) => {
            const finish = (saved: boolean) => {
                setForm(null);
                if (!saved) {
                    reject(new Error("The secret form was closed."));
                    return;
                }
                setSettled((current) => new Set([...current, elementKey]));
                resolve();
            };
            const open = (opened: SecretForm["opened"]) =>
                setForm({ elementKey, prefill: action.secret, opened, finish });
            clusterSecrets.formOpen(source, elementKey, action.secret.id).then(
                (opened) => open({ form: opened }),
                (reason: unknown) =>
                    open({ error: reason instanceof Error ? reason.message : String(reason) }),
            );
        });
    };
    return (
        <>
            <GenUiRenderView
                {...(supported ? { actionsSupported: supported } : {})}
                document={document}
                fileUrl={(path) => props.files.get(path) ?? MISSING_FILE}
                onAction={act}
                settled={settled}
            />
            {form ? (
                <WindowOverlay>
                    <GenUiSecretFormView form={form} />
                </WindowOverlay>
            ) : null}
        </>
    );
}

function GenUiSecretFormView(props: { form: SecretForm }) {
    const { prefill, opened, finish } = props.form;
    const error =
        "error" in opened
            ? opened.error
            : opened.form.secret === undefined && opened.form.owners.length === 0
              ? "Your role can’t add secrets to this cluster."
              : undefined;
    if (error !== undefined || "error" in opened)
        return (
            <ModalOverlay onDismiss={() => finish(false)}>
                <Modal
                    footer={<Button onClick={() => finish(false)}>Close</Button>}
                    icon="lock"
                    onClose={() => finish(false)}
                    size="small"
                    title="This form can’t open"
                >
                    {error}
                </Modal>
            </ModalOverlay>
        );
    const { form } = opened;
    const secret = form.secret;
    if (secret)
        return (
            <HappyAgentClusterSecretEditDialog
                {...(prefill.description === undefined
                    ? {}
                    : { initialDescription: prefill.description })}
                initialName={prefill.name}
                /* An agent asks to change a secret most often because its value
                   went stale, so the form opens on a new value; keeping the
                   current one is a click away. */
                initialReplacing
                onClose={() => finish(false)}
                onSave={async (version, input) => {
                    await form.update(version, input);
                    finish(true);
                }}
                secret={secret}
            />
        );
    const draft = happyAgentClusterSecretDraftFromPrefill(prefill);
    const owner = form.owners.includes(draft.owner) ? draft.owner : (form.owners[0] ?? draft.owner);
    return (
        <HappyAgentClusterSecretCreateDialog
            initialDraft={{ ...draft, owner }}
            onClose={() => finish(false)}
            onSubmit={async (input) => {
                await form.create(input);
                finish(true);
            }}
            owners={form.owners}
        />
    );
}
