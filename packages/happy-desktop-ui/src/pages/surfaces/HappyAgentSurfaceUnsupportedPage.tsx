import type { CSSProperties, ReactNode } from "react";
import { EmptyState } from "../../EmptyState";
import { HappyAgentSurfaceHeader } from "./HappyAgentSurfaceHeader";
import type { HappyAgentSurfaceView } from "./surfacePresentation";

export interface HappyAgentSurfaceUnsupportedPageProps {
    surface: HappyAgentSurfaceView;
    /** Who else is looking at it, for its header. */
    viewers?: ReactNode;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
}

/**
 * HappyAgentSurfaceUnsupportedPage — a Surface whose type this version of
 * Happy has no view for. It is still the same Surface everywhere else: its
 * header carries its name and members, and its sidebar row joins and leaves
 * it. Only its content is replaced, by a plain statement of why it is not
 * shown, and nothing is guessed in its place.
 */
export function HappyAgentSurfaceUnsupportedPage(props: HappyAgentSurfaceUnsupportedPageProps) {
    const type = props.surface.type.kind === "unsupported" ? props.surface.type.type : "todo";
    return (
        <div
            className={["happy-agent-surface-unsupported", props.className]
                .filter(Boolean)
                .join(" ")}
            data-happy-desktop-ui="happy-agent-surface-unsupported"
            data-testid={props["data-testid"]}
            style={props.style}
        >
            <HappyAgentSurfaceHeader surface={props.surface} viewers={props.viewers} />
            <div className="happy-agent-surface-unsupported__body">
                <EmptyState
                    description={`It is a “${type}”, which this version of Happy can’t show yet. Its members and its place in the sidebar work as usual.`}
                    icon="package"
                    size="panel"
                    title="Can’t show this yet"
                />
            </div>
        </div>
    );
}
