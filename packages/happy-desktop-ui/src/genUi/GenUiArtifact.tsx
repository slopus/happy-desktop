import { genUiRenderParseText } from "./genUiRender";
import {
    GenUiRenderView,
    type GenUiActionHandler,
    type GenUiRenderViewProps,
} from "./GenUiRenderView";

/* An address that never loads: a picture the version does not hold shows the
   failed placeholder rather than asking the app's own origin for the path. */
const MISSING_FILE = "data:,";

/**
 * A `gen_ui` artifact version: the render document the daemon compiled, drawn
 * against the other files of the same version, so a picture can never come
 * from another version than the document naming it.
 */
export function GenUiArtifact(props: {
    /** The text of the version's `.genui/render.json`. */
    readonly render: string;
    /** Every file of the version by path, at the address it is served from. */
    readonly files: ReadonlyMap<string, string>;
    readonly onAction?: GenUiActionHandler;
    readonly actionsSupported?: GenUiRenderViewProps["actionsSupported"];
}) {
    const document = genUiRenderParseText(props.render);
    return (
        <GenUiRenderView
            {...(props.actionsSupported ? { actionsSupported: props.actionsSupported } : {})}
            document={document}
            fileUrl={(path) => props.files.get(path) ?? MISSING_FILE}
            {...(props.onAction ? { onAction: props.onAction } : {})}
        />
    );
}
