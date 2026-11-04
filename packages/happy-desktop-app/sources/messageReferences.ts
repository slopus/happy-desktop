import {
    happyAgentBotSubtasks,
    happyReferencePlaceholder,
    type ConversationSummary,
    type HappyAgentArtifactId,
    type HappyAgentArtifactPeopleStore,
    type HappyAgentArtifactTitlesSnapshot,
    type HappyAgentArtifactTitlesStore,
    type HappyAgentGroupId,
    type HappyAgentSessionListSnapshot,
    type HappyAgentSurfaceCatalogSnapshot,
    type HappyAgentSurfaceId,
    type HappyReference,
    type SubagentSummary,
} from "happy-desktop-state";
import type { MessageReferences, MessageReferenceView } from "happy-desktop-ui";

const TITLES_EMPTY: HappyAgentArtifactTitlesSnapshot = new Map();

/** A titles store with nothing behind it, for a Happy Agent that keeps no artifacts. */
export const artifactTitlesStoreNoop: HappyAgentArtifactTitlesStore = {
    get: () => TITLES_EMPTY,
    subscribe: () => () => undefined,
    request: () => undefined,
    [Symbol.dispose]: () => undefined,
};

/** What an artifact reads as until its title has been read. */
export const ARTIFACT_READING: MessageReferenceView = {
    type: "link",
    label: "artifact",
    busy: false,
    reading: true,
};

/** One agent, workspace, or project a reference can name, as the list shows it. */
interface ReferenceEntity {
    readonly label: string;
    readonly busy: boolean;
    /** The group the entity is opened through. */
    readonly groupId: HappyAgentGroupId;
    /** The conversation it opens on; absent opens the group where it was left. */
    readonly agentId?: string;
}

/** Every agent, workspace, and project the reader's list holds, by the id a tag names. */
export interface MessageReferenceEntities {
    readonly agents: ReadonlyMap<string, ReferenceEntity>;
    readonly workspaces: ReadonlyMap<string, ReferenceEntity>;
    readonly projects: ReadonlyMap<string, ReferenceEntity>;
}

const ENTITIES_EMPTY: MessageReferenceEntities = {
    agents: new Map(),
    workspaces: new Map(),
    projects: new Map(),
};

/**
 * Doing work right now. A scheduled wait or an open question is the agent
 * deliberately not working, so neither shimmers the reference.
 */
function agentBusy(conversation: ConversationSummary): boolean {
    return conversation.activity === "running";
}

const entitiesCache = new WeakMap<HappyAgentSessionListSnapshot, MessageReferenceEntities>();

/**
 * The agents, workspaces, and projects a reference can open, read out of the
 * session list the sidebar already draws. What the list does not hold —
 * archived, not visible to this reader, or a delegated subagent — is not
 * something the window can open, and its reference stays inert. Cached per
 * list snapshot, so an unchanged list keeps one index and one identity.
 */
export function messageReferenceEntities(
    list: HappyAgentSessionListSnapshot | undefined,
): MessageReferenceEntities {
    if (list === undefined) return ENTITIES_EMPTY;
    const cached = entitiesCache.get(list);
    if (cached) return cached;
    const agents = new Map<string, ReferenceEntity>();
    const workspaces = new Map<string, ReferenceEntity>();
    const projects = new Map<string, ReferenceEntity>();
    const agentAdd = (
        conversation: ConversationSummary,
        groupId: HappyAgentGroupId,
        label = conversation.title,
    ) =>
        agents.set(conversation.id, {
            label,
            busy: agentBusy(conversation),
            groupId,
            agentId: conversation.id,
        });
    for (const project of list.projects.type === "ready" ? list.projects.value : []) {
        projects.set(project.id, {
            label: project.name,
            busy: project.lifecycle.phase === "creating",
            groupId: project.id,
        });
        for (const conversation of project.conversations) agentAdd(conversation, project.id);
        for (const worktree of project.worktrees) {
            workspaces.set(worktree.id, {
                label: worktree.name,
                busy: worktree.lifecycle.phase === "creating",
                groupId: worktree.id,
            });
            for (const conversation of worktree.conversations) agentAdd(conversation, worktree.id);
        }
    }
    // A bot's or task's own agent is called by the bot's or task's name, and
    // so is the workspace it is opened through.
    for (const owner of [...list.bots, ...list.tasks]) {
        agentAdd(owner.conversation, owner.workspaceId, owner.name);
        workspaces.set(owner.workspaceId, {
            label: owner.name,
            busy: false,
            groupId: owner.workspaceId,
            agentId: owner.conversation.id,
        });
    }
    for (const subtask of happyAgentBotSubtasks([...list.bots, ...list.tasks])) {
        agentAdd(subtask.conversation, subtask.workspaceId);
        if (!workspaces.has(subtask.workspaceId))
            workspaces.set(subtask.workspaceId, {
                label: subtask.conversation.title,
                busy: false,
                groupId: subtask.workspaceId,
                agentId: subtask.conversation.id,
            });
    }
    const entities = { agents, workspaces, projects };
    entitiesCache.set(list, entities);
    return entities;
}

/** The Surfaces a reference can name, by ID, and where opening one goes. */
export interface MessageReferenceSurfaces {
    readonly names: ReadonlyMap<string, string>;
    readonly open: (surfaceId: HappyAgentSurfaceId) => void;
}

const surfaceNamesCache = new WeakMap<
    HappyAgentSurfaceCatalogSnapshot,
    ReadonlyMap<string, string>
>();

/**
 * What each Surface the reader can see is called, read out of the catalog the
 * sidebar already draws. A Surface it does not hold — deleted, or not visible
 * to this reader — stays inert. Cached per catalog snapshot.
 */
export function messageReferenceSurfaceNames(
    catalog: HappyAgentSurfaceCatalogSnapshot,
): ReadonlyMap<string, string> {
    const cached = surfaceNamesCache.get(catalog);
    if (cached) return cached;
    const names = new Map(catalog.surfaces.map((surface) => [surface.id, surface.name]));
    surfaceNamesCache.set(catalog, names);
    return names;
}

function inert(reference: HappyReference): MessageReferenceView {
    return { type: "text", label: happyReferencePlaceholder(reference) };
}

function artifactView(
    reference: HappyReference,
    titles: HappyAgentArtifactTitlesSnapshot,
    store: HappyAgentArtifactTitlesStore,
): MessageReferenceView {
    const artifactId = reference.id as HappyAgentArtifactId;
    const artifact = titles.get(artifactId);
    if (artifact === undefined) {
        // Recording what is wanted publishes nothing in this call; the read
        // answers later through the subscription.
        store.request([artifactId]);
        return ARTIFACT_READING;
    }
    if (artifact.type === "missing") return inert(reference);
    // Always the current title: a pinned version only decides what opens.
    const title = artifact.title.trim();
    // A deleted artifact serves nothing, so it is named and not offered.
    if (artifact.status === "deleted")
        return { type: "text", label: title || happyReferencePlaceholder(reference) };
    // Artifacts have no busy state.
    return { type: "link", label: title || "Untitled artifact", busy: false };
}

function entityOf(
    reference: HappyReference,
    entities: MessageReferenceEntities,
): ReferenceEntity | undefined {
    switch (reference.kind) {
        case "agent":
            return entities.agents.get(reference.id);
        case "workspace":
            return entities.workspaces.get(reference.id);
        case "project":
            return entities.projects.get(reference.id);
        default:
            // Services stay inert until the window has somewhere to open one.
            return undefined;
    }
}

/**
 * The live side of the Happy references a transcript shows: what each one
 * reads as in the current store snapshots, and where opening it goes.
 *
 * Built from immutable snapshots, so a new snapshot is a new value and the
 * transcript re-renders and re-sizes the rows that name what changed.
 */
export function messageReferencesCreate(input: {
    /** The instance references resolve against; a link naming another resolves to nothing. */
    readonly instanceId?: string | undefined;
    readonly titles: HappyAgentArtifactTitlesSnapshot;
    readonly titlesStore: HappyAgentArtifactTitlesStore;
    readonly entities: MessageReferenceEntities;
    /**
     * The agents this conversation delegated to. The window does not open
     * them, so a reference to one is named rather than offered.
     */
    readonly subagents?: readonly SubagentSummary[];
    /** Opens one artifact: its latest version, or the one a reference pinned. */
    readonly onArtifactOpen?: (artifactId: HappyAgentArtifactId, version?: number) => void;
    /** Opens a group on one of its conversations, or where it was left. */
    readonly onGroupOpen?: (groupId: HappyAgentGroupId, agentId?: string) => void;
    /** The Surfaces a reference can name; absent, every one stays inert. */
    readonly surfaces?: MessageReferenceSurfaces;
    /** The names of the people a message can mention, and how to read one not known yet. */
    readonly people?: HappyAgentArtifactPeopleStore;
}): MessageReferences {
    const peopleNames = input.people?.get();
    return {
        ...(input.instanceId === undefined ? {} : { instanceId: input.instanceId }),
        view(reference) {
            if (reference.kind === "user") {
                // A person is named, not opened: a teammate as their tag, in
                // the name their profile carries now.
                const person = input.people?.person(reference.id);
                if (person !== undefined)
                    return {
                        type: "person",
                        label: `@${person.name}`,
                        name: person.name,
                        ...(person.imageUrl === undefined ? {} : { imageUrl: person.imageUrl }),
                        ...(person.role === undefined ? {} : { role: person.role }),
                        self: person.self,
                    };
                const name = peopleNames?.get(reference.id);
                if (name === undefined) input.people?.userNameRequest(reference.id);
                return { type: "text", label: name === undefined ? "@…" : `@${name}` };
            }
            if (reference.kind === "surface") {
                const name = input.surfaces?.names.get(reference.id);
                if (name === undefined) return inert(reference);
                return { type: "link", label: name.trim() || "Untitled", busy: false };
            }
            if (reference.kind === "artifact")
                return input.onArtifactOpen === undefined
                    ? inert(reference)
                    : artifactView(reference, input.titles, input.titlesStore);
            const entity = entityOf(reference, input.entities);
            if (entity === undefined && reference.kind === "agent") {
                const subagent = input.subagents?.find((one) => one.id === reference.id);
                const name = subagent?.description.trim();
                if (name) return { type: "text", label: name };
            }
            if (entity === undefined || input.onGroupOpen === undefined) return inert(reference);
            return {
                type: "link",
                label: entity.label.trim() || `Untitled ${reference.kind}`,
                busy: entity.busy,
            };
        },
        open(reference) {
            if (reference.kind === "surface") {
                if (input.surfaces?.names.has(reference.id))
                    input.surfaces.open(reference.id as HappyAgentSurfaceId);
                return;
            }
            if (reference.kind === "artifact") {
                input.onArtifactOpen?.(reference.id as HappyAgentArtifactId, reference.version);
                return;
            }
            const entity = entityOf(reference, input.entities);
            if (entity !== undefined) input.onGroupOpen?.(entity.groupId, entity.agentId);
        },
    };
}
