import { Avatar } from "./Avatar";

/** The Happy Agent being set up, as its own picture shows it. */
export interface OnboardingNodeIdentity {
    readonly name: string;
    /** The installation's own picture. Absent, it wears its placeholder. */
    readonly imageUrl?: string;
    /** What picks the placeholder, and its live shader under Animated avatars. */
    readonly placeholderSeed: string;
}

/**
 * Whose setup this is, drawn as the connection rail's tile for it: the same
 * 36px square with the rail's corners, so the picture is already where it
 * will stand once setup hands over to the workspace.
 */
export function OnboardingNode(props: { readonly node: OnboardingNodeIdentity }) {
    const { node } = props;
    return (
        <Avatar
            aria-label={node.name}
            title={node.name}
            initials={node.name.slice(0, 1).toUpperCase()}
            placeholderSeed={node.placeholderSeed}
            size="md"
            style={{ width: 36, height: 36, borderRadius: 10 }}
            type="agent"
            {...(node.imageUrl ? { imageUrl: node.imageUrl } : {})}
        />
    );
}
