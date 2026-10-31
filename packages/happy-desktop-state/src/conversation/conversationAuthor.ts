/**
 * Render-ready stable identity shared by every denormalized surface occurrence,
 * promoted out of the identity module so a conversation entry can name its
 * author without depending on a separate account catalog. `kind` carries the
 * person/agent distinction the renderer needs; a session can synthesize the
 * machine owner and the active agent directly.
 */
export interface ConversationAuthor {
    readonly agentRole?: "default";
    readonly id: string;
    readonly userId?: string;
    readonly avatar?: { readonly thumbhash: string };
    readonly displayName: string;
    readonly username: string;
    readonly kind: "human" | "agent";
    readonly photoFileId?: string;
    /** Already-safe display URL for an inline profile photo. */
    readonly imageUrl?: string;
    /**
     * The session this author speaks for, when the author is another session
     * rather than a person or this session's own agent. A surface renders it as
     * a generated mark keyed by the session, so a message that arrived from
     * elsewhere is recognizable as coming from that particular elsewhere.
     */
    readonly sessionId?: string;
}
