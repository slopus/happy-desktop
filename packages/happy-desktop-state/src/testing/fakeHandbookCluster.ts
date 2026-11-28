import * as Y from "yjs";
import {
    HappyCloudRequestRefusal,
    type HappyCloudRequest,
} from "../happyAgent/happyAgentProviderCredentials.js";

/*
 * A Happy Cloud server's handbook held in memory, answering `/v0/handbook`
 * as the contract in task_618/handbook-design.md (sections 6 and "Contract
 * changes") says. A draft's text is a Yjs text named `markdown` standing in
 * for the editor's blocks, so a seq's Markdown is that text as of the seq.
 */

export interface FakeHandbookCall {
    readonly method: string;
    readonly path: string;
    readonly body: unknown;
}

interface FakeEntry {
    readonly seq: number;
    readonly userId: string;
    readonly createdAt: number;
    readonly update: Uint8Array;
    readonly markdown: string;
}

interface FakeRevision {
    readonly revision: number;
    readonly seq: number;
    readonly title: string;
    readonly description: string;
    readonly alwaysInContext: boolean;
    readonly appliedBy: string;
    readonly appliedAt: number;
    readonly contributors: readonly string[];
    readonly changesetId: string;
    readonly note: string | null;
    readonly markdown: string;
}

interface FakeFolder {
    readonly id: string;
    parentId: string | null;
    name: string;
    icon: string | null;
    order: string;
    readonly createdBy: string;
    readonly createdAt: number;
    updatedAt: number;
}

const FOLDER_DEPTH_MAX = 4;

interface FakeItem {
    readonly id: string;
    folderId: string | null;
    title: string;
    description: string;
    alwaysInContext: boolean;
    order: string;
    readonly createdBy: string;
    readonly createdAt: number;
    updatedAt: number;
    removedAt: number | null;
    readonly doc: Y.Doc;
    readonly entries: FakeEntry[];
    readonly revisions: FakeRevision[];
}

export interface FakeHandbookCluster {
    readonly request: HappyCloudRequest;
    readonly calls: FakeHandbookCall[];
    /** Adds an item as someone else would, with `text` as its first draft change. */
    itemAdd(input: {
        readonly id: string;
        readonly title: string;
        readonly text?: string;
        readonly alwaysInContext?: boolean;
        readonly by?: string;
        readonly folderId?: string;
    }): void;
    /** Adds a folder as someone else would. */
    folderAdd(input: {
        readonly id: string;
        readonly name: string;
        readonly parentId?: string;
        readonly icon?: string;
    }): void;
    /** Where an item lives now; `null` for the root. */
    folderOf(itemId: string): string | null;
    /** A folder as the cluster holds it, or undefined once deleted. */
    folder(
        folderId: string,
    ): { readonly parentId: string | null; readonly name: string } | undefined;
    /** Someone writes in a draft: the whole text becomes `text`, as one change. */
    draftWrite(itemId: string, text: string, by?: string): number;
    /** Applies an item at its current draft, as someone else would. */
    applyNow(itemId: string, by?: string): void;
    draftText(itemId: string): string;
    /** The permissions the reader is granted. */
    granted: string[];
    /** The next request to the route is refused or never answered. */
    refuseNext(method: string, pathStart: string, status: number, body: unknown): void;
    failNext(method: string, pathStart: string): void;
    advance(milliseconds: number): void;
    /** The cluster's clock, which stamps every change and apply. */
    now(): number;
}

const SESSION_GAP_MS = 5 * 60 * 1_000;

export function fakeHandbookClusterCreate(
    options: { readonly viewerId?: string } = {},
): FakeHandbookCluster {
    const viewerId = options.viewerId ?? "u_viewer";
    const items = new Map<string, FakeItem>();
    const folders = new Map<string, FakeFolder>();
    const calls: FakeHandbookCall[] = [];
    const mutations = new Map<string, unknown>();
    const faults: { method: string; path: string; status?: number; body?: unknown }[] = [];
    let clock = 1_000_000;
    let changesets = 0;
    let order = 0;

    const textOf = (doc: Y.Doc): string => doc.getText("markdown").toString();

    const write = (item: FakeItem, text: string, by: string): number => {
        const before = Y.encodeStateVector(item.doc);
        const yText = item.doc.getText("markdown");
        item.doc.transact(() => {
            yText.delete(0, yText.length);
            yText.insert(0, text);
        });
        return entryAdd(item, Y.encodeStateAsUpdate(item.doc, before), by);
    };

    const entryAdd = (item: FakeItem, update: Uint8Array, by: string): number => {
        const seq = item.entries.length + 1;
        item.entries.push({
            seq,
            userId: by,
            createdAt: clock,
            update,
            markdown: textOf(item.doc),
        });
        item.updatedAt = clock;
        return seq;
    };

    const markdownAt = (item: FakeItem, seq: number): string =>
        seq <= 0 ? "" : (item.entries[Math.min(seq, item.entries.length) - 1]?.markdown ?? "");

    const appliedOf = (item: FakeItem) => item.revisions.at(-1);

    const pendingOf = (item: FakeItem): boolean => {
        const applied = appliedOf(item);
        if (!applied) return true;
        return (
            markdownAt(item, item.entries.length) !== applied.markdown ||
            item.title !== applied.title ||
            item.description !== applied.description ||
            item.alwaysInContext !== applied.alwaysInContext
        );
    };

    const wireItem = (item: FakeItem) => {
        const applied = appliedOf(item);
        const pending = pendingOf(item);
        const after = applied?.seq ?? 0;
        return {
            id: item.id,
            title: item.title,
            description: item.description,
            alwaysInContext: item.alwaysInContext,
            order: item.order,
            folderId: item.folderId,
            createdBy: item.createdBy,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            lastEditorUserId: item.entries.at(-1)?.userId ?? null,
            draftSeq: item.entries.length,
            pending,
            pendingUserIds: pending
                ? [...new Set(item.entries.filter((e) => e.seq > after).map((e) => e.userId))]
                : [],
            applied: applied
                ? {
                      revision: applied.revision,
                      seq: applied.seq,
                      appliedBy: applied.appliedBy,
                      appliedAt: applied.appliedAt,
                  }
                : null,
            removedAt: item.removedAt,
        };
    };

    const wireRevision = (revision: FakeRevision) => {
        const { markdown: _text, ...rest } = revision;
        return rest;
    };

    const apply = (
        item: FakeItem,
        seq: number,
        by: string,
        changesetId: string,
        note: string | null,
    ) => {
        const previous = appliedOf(item);
        const after = previous?.seq ?? 0;
        item.revisions.push({
            revision: (previous?.revision ?? 0) + 1,
            seq,
            title: item.title,
            description: item.description,
            alwaysInContext: item.alwaysInContext,
            appliedBy: by,
            appliedAt: clock,
            contributors: [
                ...new Set(
                    item.entries.filter((e) => e.seq > after && e.seq <= seq).map((e) => e.userId),
                ),
            ],
            changesetId,
            note,
            markdown: markdownAt(item, seq),
        });
    };

    const itemAdd: FakeHandbookCluster["itemAdd"] = (input) => {
        const item: FakeItem = {
            id: input.id,
            folderId: input.folderId ?? null,
            title: input.title,
            description: "",
            alwaysInContext: input.alwaysInContext ?? false,
            order: `a${String((order += 1)).padStart(4, "0")}`,
            createdBy: input.by ?? viewerId,
            createdAt: clock,
            updatedAt: clock,
            removedAt: null,
            doc: new Y.Doc(),
            entries: [],
            revisions: [],
        };
        items.set(item.id, item);
        if (input.text !== undefined) write(item, input.text, input.by ?? viewerId);
    };

    const folderAdd: FakeHandbookCluster["folderAdd"] = (input) => {
        folders.set(input.id, {
            id: input.id,
            parentId: input.parentId ?? null,
            name: input.name,
            icon: input.icon ?? null,
            order: `a${String((order += 1)).padStart(4, "0")}`,
            createdBy: viewerId,
            createdAt: clock,
            updatedAt: clock,
        });
    };

    const depthOf = (folderId: string | null): number => {
        let depth = 0;
        for (let id = folderId; id !== null; id = folders.get(id)?.parentId ?? null) depth += 1;
        return depth;
    };

    const heightOf = (folderId: string): number =>
        1 +
        Math.max(
            0,
            ...[...folders.values()]
                .filter((folder) => folder.parentId === folderId)
                .map((folder) => heightOf(folder.id)),
        );

    const siblingNamed = (parentId: string | null, name: string, except?: string): boolean =>
        [...folders.values()].some(
            (folder) =>
                folder.parentId === parentId &&
                folder.id !== except &&
                folder.name.toLowerCase() === name.toLowerCase(),
        );

    const folderRoute = (
        method: string,
        id: string | undefined,
        body: Record<string, unknown>,
        remember: (answer: unknown) => unknown,
    ): unknown => {
        if (!fake.granted.includes("handbook.edit")) refuse(403, "forbidden", "No.");
        if (id === undefined) {
            if (method !== "POST") return refuse(404, "not_found", "Not found.");
            const parentId = typeof body.parentId === "string" ? body.parentId : null;
            const name = String(body.name ?? "").trim();
            if (name.length === 0 || name.length > 100 || name.includes("/"))
                refuse(400, "bad_request", "Bad name.");
            if (parentId !== null && !folders.has(parentId))
                refuse(404, "not_found", "No such folder.");
            if (depthOf(parentId) + 1 > FOLDER_DEPTH_MAX) refuse(400, "bad_request", "Too deep.");
            if (siblingNamed(parentId, name)) refuse(409, "conflict", "Name taken.");
            const folderId =
                typeof body.id === "string" ? body.id : `hf_${String(folders.size + 1)}`;
            folderAdd({
                id: folderId,
                name,
                ...(parentId === null ? {} : { parentId }),
                ...(typeof body.icon === "string" ? { icon: body.icon } : {}),
            });
            return remember({ folder: { ...folders.get(folderId)! } });
        }
        const folder = folders.get(decodeURIComponent(id));
        if (!folder) return refuse(404, "not_found", "No such folder.");
        if (method === "DELETE") {
            const holds =
                [...folders.values()].some((entry) => entry.parentId === folder.id) ||
                [...items.values()].some((item) => item.folderId === folder.id);
            if (holds) refuse(409, "not_empty", "Not empty.");
            folders.delete(folder.id);
            return {};
        }
        const name = typeof body.name === "string" ? body.name.trim() : folder.name;
        const parentId =
            body.parentId === undefined ? folder.parentId : (body.parentId as string | null);
        if (parentId !== folder.parentId) {
            if (parentId !== null && !folders.has(parentId))
                refuse(404, "not_found", "No such folder.");
            for (let at = parentId; at !== null; at = folders.get(at)?.parentId ?? null)
                if (at === folder.id) refuse(400, "bad_request", "Into itself.");
            if (depthOf(parentId) + heightOf(folder.id) > FOLDER_DEPTH_MAX)
                refuse(400, "bad_request", "Too deep.");
        }
        if (name.length === 0 || name.length > 100 || name.includes("/"))
            refuse(400, "bad_request", "Bad name.");
        if (siblingNamed(parentId, name, folder.id)) refuse(409, "conflict", "Name taken.");
        folder.name = name;
        folder.parentId = parentId;
        if (body.icon !== undefined) folder.icon = body.icon as string | null;
        folder.updatedAt = clock;
        return remember({ folder: { ...folder } });
    };

    const sessionsOf = (item: FakeItem) => {
        const cuts = new Set(item.revisions.map((revision) => revision.seq));
        const sessions: {
            fromSeq: number;
            toSeq: number;
            actor: { userId: string; agentId: null };
            startedAt: number;
            endedAt: number;
            changes: number;
            appliedRevision: number | null;
        }[] = [];
        for (const entry of item.entries) {
            const last = sessions.at(-1);
            if (
                last &&
                last.actor.userId === entry.userId &&
                entry.createdAt - last.endedAt <= SESSION_GAP_MS &&
                !cuts.has(last.toSeq)
            ) {
                last.toSeq = entry.seq;
                last.endedAt = entry.createdAt;
                last.changes += 1;
            } else
                sessions.push({
                    fromSeq: entry.seq,
                    toSeq: entry.seq,
                    actor: { userId: entry.userId, agentId: null },
                    startedAt: entry.createdAt,
                    endedAt: entry.createdAt,
                    changes: 1,
                    appliedRevision: null,
                });
        }
        for (const session of sessions)
            session.appliedRevision =
                item.revisions.find((revision) => revision.seq === session.toSeq)?.revision ?? null;
        return sessions.reverse();
    };

    const refuse = (status: number, code: string, message: string, extra: object = {}): never => {
        throw new HappyCloudRequestRefusal(message, code, status, {
            error: { code, message },
            ...extra,
        });
    };

    const itemFor = (id: string | undefined): FakeItem => {
        const item = id === undefined ? undefined : items.get(decodeURIComponent(id));
        if (!item) return refuse(404, "not_found", "No such item.");
        return item;
    };

    const writable = (item: FakeItem): void => {
        if (item.removedAt !== null) refuse(409, "removed", "This item was removed.");
    };

    const route = (method: string, path: string, body: Record<string, unknown>): unknown => {
        const url = new URL(path, "https://cluster.test/");
        const parts = url.pathname.split("/").filter(Boolean);
        const query = url.searchParams;
        const mutationId = typeof body.mutationId === "string" ? body.mutationId : undefined;
        if (mutationId !== undefined && mutations.has(mutationId)) return mutations.get(mutationId);
        const remember = (answer: unknown): unknown => {
            if (mutationId !== undefined) mutations.set(mutationId, answer);
            return answer;
        };
        if (parts[1] === "permissions") return { permissions: [], granted: fake.granted };
        if (parts[1] !== "handbook") return refuse(404, "not_found", "Not found.");
        if (parts.length === 2) {
            if (method === "GET")
                return {
                    folders: [...folders.values()].map((folder) => ({ ...folder })),
                    items: [...items.values()].map(wireItem),
                    cursor: null,
                };
            if (!fake.granted.includes("handbook.edit")) refuse(403, "forbidden", "No.");
            const id = typeof body.id === "string" ? body.id : `hb_${String(items.size + 1)}`;
            if (typeof body.folderId === "string" && !folders.has(body.folderId))
                refuse(404, "not_found", "No such folder.");
            itemAdd({
                ...(typeof body.folderId === "string" ? { folderId: body.folderId } : {}),
                id,
                title: String(body.title),
                ...(typeof body.text === "string" ? { text: body.text } : {}),
            });
            return remember({ item: wireItem(items.get(id)!) });
        }
        if (parts[2] === "folders") return folderRoute(method, parts[3], body, remember);
        if (parts[2] === "apply") {
            if (!fake.granted.includes("handbook.apply")) refuse(403, "forbidden", "No.");
            const requested = (body.items as { id: string; baseSeq: number }[]).map((entry) => ({
                item: itemFor(entry.id),
                baseSeq: entry.baseSeq,
            }));
            for (const { item, baseSeq } of requested) {
                if (item.removedAt !== null)
                    refuse(409, "removed", "Removed.", { itemId: item.id });
                if (baseSeq > item.entries.length) refuse(400, "bad_request", "baseSeq is ahead.");
                if (baseSeq < (appliedOf(item)?.seq ?? 0))
                    refuse(409, "stale", "Newer edits were applied.", { itemId: item.id });
            }
            const changesetId = `cs_${String((changesets += 1))}`;
            const note = typeof body.note === "string" ? body.note : null;
            const applied: { itemId: string; revision: number; removed: boolean }[] = [];
            for (const { item, baseSeq } of requested) {
                const current = appliedOf(item);
                if (current && current.seq === baseSeq && !pendingOf(item)) continue;
                apply(item, baseSeq, viewerId, changesetId, note);
                applied.push({
                    itemId: item.id,
                    revision: appliedOf(item)!.revision,
                    removed: false,
                });
            }
            return remember({
                changeset:
                    applied.length === 0
                        ? null
                        : {
                              id: changesetId,
                              appliedBy: viewerId,
                              appliedAt: clock,
                              note,
                              items: applied,
                          },
            });
        }
        const item = itemFor(parts[2]);
        const rest = parts[3];
        if (rest === undefined) {
            if (method === "PATCH") {
                // A removed item may still move, so the folder it is in can be emptied.
                const moveOnly = Object.keys(body).every((key) =>
                    ["folderId", "order", "mutationId"].includes(key),
                );
                if (!moveOnly) writable(item);
                if (typeof body.title === "string") item.title = body.title;
                if (typeof body.description === "string") item.description = body.description;
                if (typeof body.alwaysInContext === "boolean")
                    item.alwaysInContext = body.alwaysInContext;
                if (body.folderId !== undefined) {
                    const folderId = body.folderId as string | null;
                    if (folderId !== null && !folders.has(folderId))
                        refuse(404, "not_found", "No such folder.");
                    item.folderId = folderId;
                }
                item.updatedAt = clock;
                return remember({ item: wireItem(item) });
            }
            const seqQuery = query.get("seq");
            const revisionQuery = query.get("revision");
            const revision =
                revisionQuery === null
                    ? seqQuery === null
                        ? appliedOf(item)
                        : undefined
                    : item.revisions.find((entry) => entry.revision === Number(revisionQuery));
            if (revisionQuery !== null && !revision) refuse(404, "not_found", "No such revision.");
            if (seqQuery !== null)
                return {
                    item: wireItem(item),
                    markdown: markdownAt(item, Number(seqQuery)),
                    revision: null,
                    seq: Number(seqQuery),
                };
            return {
                item: wireItem(item),
                markdown: revision?.markdown ?? null,
                revision: revision?.revision ?? null,
                seq: revision?.seq ?? null,
            };
        }
        switch (rest) {
            case "state": {
                const vector = query.get("stateVector");
                const update =
                    vector === null
                        ? Y.encodeStateAsUpdate(item.doc)
                        : Y.encodeStateAsUpdate(item.doc, base64Decode(vector));
                return {
                    seq: item.entries.length,
                    update: base64Encode(update),
                    stateVector: base64Encode(Y.encodeStateVector(item.doc)),
                };
            }
            case "updates": {
                writable(item);
                Y.applyUpdate(item.doc, base64Decode(String(body.update)));
                return remember({
                    seq: entryAdd(item, base64Decode(String(body.update)), viewerId),
                });
            }
            case "subscribe":
                return { seq: item.entries.length };
            case "unsubscribe":
            case "presence":
                return {};
            case "sessions": {
                const limit = Number(query.get("limit") ?? 50);
                const before = query.get("beforeSeq");
                const all = sessionsOf(item).filter(
                    (session) => before === null || session.toSeq < Number(before),
                );
                const page = all.slice(0, limit);
                return {
                    sessions: page,
                    nextBeforeSeq: all.length > limit ? (page.at(-1)?.fromSeq ?? null) : null,
                };
            }
            case "revisions": {
                const number = parts[4];
                if (number !== undefined) {
                    const revision = item.revisions.find(
                        (entry) => entry.revision === Number(number),
                    );
                    if (!revision) return refuse(404, "not_found", "No such revision.");
                    return {
                        ...wireRevision(revision),
                        markdown: revision.markdown,
                        changeset: null,
                    };
                }
                const after = Number(query.get("afterRevision") ?? 0);
                const limit = Number(query.get("limit") ?? 50);
                const all = item.revisions.filter((entry) => entry.revision > after);
                const page = all.slice(0, limit);
                return {
                    revisions: page.map(wireRevision),
                    nextAfterRevision: all.length > limit ? (page.at(-1)?.revision ?? null) : null,
                };
            }
            case "restore": {
                writable(item);
                const text =
                    typeof body.revision === "number"
                        ? (item.revisions.find((entry) => entry.revision === body.revision)
                              ?.markdown ?? "")
                        : markdownAt(item, Number(body.seq));
                if (text === textOf(item.doc)) return remember({ seq: item.entries.length });
                return remember({ seq: write(item, text, viewerId) });
            }
            case "discard": {
                writable(item);
                const text = appliedOf(item)?.markdown ?? "";
                if (text === textOf(item.doc)) return remember({ seq: item.entries.length });
                return remember({ seq: write(item, text, viewerId) });
            }
            case "remove": {
                writable(item);
                item.removedAt = clock;
                return remember({ changeset: { id: `cs_${String((changesets += 1))}` } });
            }
        }
        return refuse(404, "not_found", "Not found.");
    };

    const fake: FakeHandbookCluster = {
        calls,
        granted: ["handbook.edit", "handbook.apply"],
        async request(method, path, body) {
            calls.push({ method, path, body });
            await Promise.resolve();
            const fault = faults.findIndex(
                (entry) => entry.method === method && path.startsWith(entry.path),
            );
            if (fault !== -1) {
                const [entry] = faults.splice(fault, 1);
                if (entry!.status === undefined)
                    throw new Error("Happy couldn't reach the server.");
                throw new HappyCloudRequestRefusal(
                    "Refused.",
                    undefined,
                    entry!.status,
                    entry!.body,
                );
            }
            return route(method, path, (body ?? {}) as Record<string, unknown>);
        },
        itemAdd,
        folderAdd,
        folderOf(itemId) {
            return itemFor(itemId).folderId;
        },
        folder(folderId) {
            const folder = folders.get(folderId);
            return folder ? { parentId: folder.parentId, name: folder.name } : undefined;
        },
        draftWrite(itemId, text, by = viewerId) {
            return write(itemFor(itemId), text, by);
        },
        applyNow(itemId, by = viewerId) {
            const item = itemFor(itemId);
            apply(item, item.entries.length, by, `cs_${String((changesets += 1))}`, null);
        },
        draftText(itemId) {
            return textOf(itemFor(itemId).doc);
        },
        refuseNext(method, path, status, body) {
            faults.push({ method, path, status, body });
        },
        failNext(method, path) {
            faults.push({ method, path });
        },
        advance(milliseconds) {
            clock += milliseconds;
        },
        now: () => clock,
    };
    return fake;
}

function base64Encode(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}
