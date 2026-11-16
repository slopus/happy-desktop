import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

/**
 * The header control that moves a previewed file out of the side panel and
 * into a tab of the main content — the same move as a double click on its row
 * in the Files listing. It wears the glyph the main content's own drop zone
 * wears, so "over there" reads the same whether the file is dragged or sent.
 *
 * Shared by every file header a preview can wear (FileEditor, ChangedFileDiff,
 * FilePreview), so the control looks and sits the same whatever the file is.
 */
export function FileOpenInTabButton(props: { onClick: () => void; label?: string }) {
    const label = props.label ?? "Open in tab";
    return (
        <Tooltip align="end" label={label} placement="bottom">
            <Button
                aria-label={label}
                data-happy-desktop-ui="file-open-in-tab"
                data-testid="file-open-in-tab"
                icon="panel-collapse"
                iconOnly
                onClick={() => props.onClick()}
                size="small"
                variant="ghost"
            />
        </Tooltip>
    );
}
