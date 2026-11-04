import { formatHappyMarkdownLink, isKnownHappyReferenceKind } from "@slopus/happy-agent-client";
import type { HappyAgentTeammate } from "../happyAgentConnection/types.js";
import type { ComposerMention } from "../modules/composer/composerState.js";
import type { HappyAgentSurfaceCatalogSnapshot } from "../surfaces/surfaceCatalogStore.js";
import type { HappyAgentSessionListSnapshot } from "./happyAgentSessionListStore.js";
import type { HappyAgentSessionId } from "./happyAgentTypes.js";

/** How many people, how many Surfaces, and how many chats one `@` token offers at most. */
const MENTION_PLACES_LIMIT = 5;

/**
 * The people, Surfaces, and chats an `@` token names, before the files it
 * does: the reader's teammates, those already in this chat first, then their
 * own Surfaces, then the bots, tasks, and project chats in their list, each
 * written as the `happy://` link that names it, labelled with its name so the
 * words read on any surface that cannot look it up. The chat the draft is
 * written in is not offered to itself.
 *
 * Surfaces are offered once the reference grammar knows them; until then a
 * reference to one would read as unavailable everywhere it was shown, so
 * none is offered.
 */
export function happyAgentMentionPlaces(input: {
    readonly query: string;
    readonly list: HappyAgentSessionListSnapshot;
    readonly catalog: HappyAgentSurfaceCatalogSnapshot | undefined;
    readonly conversationId: HappyAgentSessionId;
    /** The other people on the team, held by the connection from its bootstrap. */
    readonly teammates: readonly HappyAgentTeammate[];
    /** The people already in this chat: its owner and whoever has written in it. */
    readonly present?: ReadonlySet<string>;
}): readonly ComposerMention[] {
    const needle = input.query.trim().toLowerCase();
    const matches = (name: string) => name.toLowerCase().includes(needle);
    const present = input.present ?? new Set<string>();
    const people: ComposerMention[] = input.teammates
        .filter((teammate) => matches(teammate.name))
        // Stable, so each group keeps the team's name order.
        .sort((a, b) => Number(present.has(b.id)) - Number(present.has(a.id)))
        .slice(0, MENTION_PLACES_LIMIT)
        .map((teammate) => ({
            id: `user:${teammate.id}`,
            label: teammate.name,
            ...(teammate.role === undefined ? {} : { detail: teammate.role }),
            subject: {
                kind: "person",
                ...(teammate.imageUrl === undefined ? {} : { imageUrl: teammate.imageUrl }),
            },
            insertion: formatHappyMarkdownLink(
                { type: "reference", reference: { kind: "user", id: teammate.id } },
                teammate.name,
            ),
        }));
    const surfaceKind = "surface";
    const surfaces: ComposerMention[] =
        input.catalog === undefined || !isKnownHappyReferenceKind(surfaceKind)
            ? []
            : input.catalog.joined
                  // An artifact, bot, or task kept among the Surfaces is
                  // mentioned as itself, not as the Surface pointing at it.
                  .filter((surface) => surface.target === undefined && matches(surface.name))
                  .slice(0, MENTION_PLACES_LIMIT)
                  .map((surface) => ({
                      id: `surface:${surface.id}`,
                      label: surface.name,
                      subject: { kind: "surface", type: surface.type },
                      insertion: formatHappyMarkdownLink(
                          { type: "reference", reference: { kind: surfaceKind, id: surface.id } },
                          surface.name,
                      ),
                  }));
    const chats: ComposerMention[] = [];
    const chatAdd = (
        agentId: string,
        label: string,
        owner: "bot" | "task" | "conversation",
        detail?: string,
    ): void => {
        if (chats.length >= MENTION_PLACES_LIMIT) return;
        if (agentId === input.conversationId || !matches(label)) return;
        chats.push({
            id: `agent:${agentId}`,
            label,
            ...(detail === undefined ? {} : { detail }),
            subject: { kind: "agent", owner },
            insertion: formatHappyMarkdownLink(
                { type: "reference", reference: { kind: "agent", id: agentId } },
                label,
            ),
        });
    };
    for (const bot of input.list.bots) chatAdd(bot.conversation.id, bot.name, "bot");
    for (const task of input.list.tasks) chatAdd(task.conversation.id, task.name, "task");
    if (input.list.projects.type === "ready")
        for (const project of input.list.projects.value) {
            for (const conversation of project.conversations)
                chatAdd(conversation.id, conversation.title, "conversation", project.name);
            for (const worktree of project.worktrees)
                for (const conversation of worktree.conversations)
                    chatAdd(conversation.id, conversation.title, "conversation", worktree.name);
        }
    return [...people, ...surfaces, ...chats];
}
