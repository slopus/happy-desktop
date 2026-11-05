/**
 * What the Happy Agent's search finds, as closed product variants. The
 * wire results are projected here at the state boundary; each keeps its
 * search key, `<type>:<id>`, which is how it is fused with what this
 * window found on its own.
 */

import type { HappyAgentArtifactId } from "../artifacts/artifactTypes.js";
import type {
    HappyAgentGroupId,
    HappyAgentProjectId,
    HappyAgentSessionId,
    HappyAgentWorktreeId,
} from "../happyAgent/happyAgentTypes.js";
import type {
    HappyAgentCalendarEventId,
    HappyAgentSurfaceId,
    HappyAgentSurfaceTodoId,
} from "../surfaces/surfaceTypes.js";
import type { HappyAgentVaultItemId } from "../surfaces/surfaceVaultTypes.js";

interface HappyAgentSearchHitFields {
    /** `<type>:<id>`, the same key a local row for the same thing carries. */
    readonly key: string;
    /** 1-based position in the Happy Agent's own fused list. */
    readonly rank: number;
}

export type HappyAgentSearchHit =
    | (HappyAgentSearchHitFields & {
          readonly type: "vault_file";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly fileId: HappyAgentVaultItemId;
          readonly name: string;
          /** Where it is in its vault, from the root, ending in its own name. */
          readonly path: string;
          readonly kind: "file" | "artifact";
          readonly match: "name" | "content" | "path";
          /** The file inside a vault app holding the text of a content match. */
          readonly innerPath: string | null;
          readonly line: number | null;
          readonly snippet: string | null;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "vault_folder";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly folderId: HappyAgentVaultItemId;
          readonly name: string;
          readonly path: string;
          readonly match: "name" | "path";
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "document";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly name: string;
          readonly match: "name" | "content";
          readonly line: number | null;
          readonly snippet: string | null;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "message";
          /** The conversation it was written in. */
          readonly agentId: HappyAgentSessionId;
          readonly messageId: string;
          /** Who wrote it: a person, or an agent. */
          readonly role: "user" | "agent";
          /** At most 200 characters of the line where a query word first appears. */
          readonly snippet: string;
          readonly createdAt: number;
          /** Where the conversation is, as on its `agent` hit; `null` when unknown. */
          readonly workspaceId: HappyAgentGroupId | null;
          readonly projectId: HappyAgentProjectId | null;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "todo";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly todoId: HappyAgentSurfaceTodoId;
          readonly text: string;
          readonly status: "active" | "completed";
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "calendar_event";
          readonly surfaceId: HappyAgentSurfaceId;
          readonly eventId: HappyAgentCalendarEventId;
          readonly title: string;
          readonly allDay: boolean;
          /** Epoch milliseconds of the next occurrence, or the last one's once the series has ended. */
          readonly start: number;
          /** `content` when the words were in its notes or location rather than its title. */
          readonly match: "name" | "content";
          readonly snippet: string | null;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "artifact";
          readonly artifactId: HappyAgentArtifactId;
          readonly title: string;
          /** The artifact's type as the Happy Agent names it; the set grows. */
          readonly artifactType: string;
          readonly match: "name" | "content";
          readonly snippet: string | null;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "surface";
          readonly surfaceId: HappyAgentSurfaceId;
          /** The catalog's Surface type as the Happy Agent names it; the set grows. */
          readonly surfaceType: string;
          readonly name: string;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "agent";
          readonly agentId: HappyAgentSessionId;
          readonly title: string;
          readonly kind: "chat" | "task" | "subtask" | "bot";
          readonly archived: boolean;
          /** The workspace holding the conversation, a project's own for its root; `null` when unknown. */
          readonly workspaceId: HappyAgentGroupId | null;
          /** The project owning that workspace; `null` for bots, tasks, and their subtasks. */
          readonly projectId: HappyAgentProjectId | null;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "project";
          readonly projectId: HappyAgentProjectId;
          readonly name: string;
          readonly archived: boolean;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "workspace";
          readonly workspaceId: HappyAgentWorktreeId;
          readonly projectId: HappyAgentProjectId;
          readonly name: string;
          readonly archived: boolean;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "user";
          readonly userId: string;
          readonly name: string;
      })
    | (HappyAgentSearchHitFields & {
          readonly type: "skill";
          readonly skillId: string;
          readonly name: string;
          readonly description: string;
      });

/** What the Happy Agent's search has answered for the palette's query. */
export type HappyAgentSearchSnapshot =
    /** Nothing asked, or a Happy Agent without search: the window's own answer stands alone. */
    | { readonly status: "off" }
    | { readonly status: "searching"; readonly query: string }
    | {
          readonly status: "ready";
          /** The trimmed query these hits answer; a palette showing another query shows none of them. */
          readonly query: string;
          readonly hits: readonly HappyAgentSearchHit[];
          /** Some of what it searches missed its time budget, so more may exist. */
          readonly partial: boolean;
      }
    /** The Happy Agent could not answer; the window's own answer stands alone. */
    | { readonly status: "failed"; readonly query: string };
