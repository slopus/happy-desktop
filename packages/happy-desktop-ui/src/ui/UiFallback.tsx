/**
 * A chat UI component this build doesn't draw, as the one line the server
 * wrote for it, such as "Sign in to Claude in Happy on your computer".
 */
export function UiFallback(props: { readonly text: string }) {
    return (
        <div
            className="happy-chat-ui happy-chat-ui__fallback"
            data-happy-desktop-ui="chat-ui-fallback"
        >
            {props.text}
        </div>
    );
}
