import { HappyAgentApiError, type HappyAgentClient } from "@slopus/happy-agent-client";
import { describe, expect, it } from "vitest";
import {
    happyAgentWorkspaceFileTreeRead,
    type HappyAgentWorkspaceClient,
    type HappyAgentWorkspaceFilesChanged,
} from "./happyAgentClient.js";
import type {
    HappyAgentCompute,
    HappyAgentGroupId,
    HappyAgentSessionId,
    HappyAgentWorkspaceFileTreeEntry,
    HappyAgentWorkspaceFileTreeRead,
    HappyAgentWorkspaceFilesUnavailable,
} from "./happyAgentTypes.js";
import type {
    HappyAgentViewPreferencesDocument,
    HappyAgentViewPreferencesPersistence,
} from "./happyAgentViewPreferences.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

const GROUP = "prj_hackathon" as HappyAgentGroupId;
const OTHER = "prj_elsewhere" as HappyAgentGroupId;

/**
 * A checkout on disk that the test edits, read through the one transport call
 * the all-files tree uses. Each read can be held so a disk change can land
 * while it is in flight.
 */
function checkout() {
    const directories = new Map<string, HappyAgentWorkspaceFileTreeEntry[]>([["", []]]);
    const reads: string[] = [];
    const failing = new Set<string>();
    let unavailable: HappyAgentWorkspaceFilesUnavailable | undefined;
    let held: Array<() => void> | undefined;
    let changed: ((change: HappyAgentWorkspaceFilesChanged) => void) | undefined;
    const entry = (path: string, kind: "file" | "directory"): HappyAgentWorkspaceFileTreeEntry => ({
        kind,
        name: path.slice(path.lastIndexOf("/") + 1),
        path,
    });
    return {
        reads,
        failing,
        /** What the server answers for every directory, until it is cleared. */
        unavailableSet(reason: HappyAgentWorkspaceFilesUnavailable | undefined): void {
            unavailable = reason;
        },
        add(path: string, kind: "file" | "directory" = "file"): void {
            const slash = path.lastIndexOf("/");
            const parent = slash < 0 ? "" : path.slice(0, slash);
            directories.get(parent)!.push(entry(path, kind));
            if (kind === "directory") directories.set(path, []);
        },
        hold(): void {
            held = [];
        },
        release(): void {
            const pending = held ?? [];
            held = undefined;
            for (const resume of pending) resume();
        },
        emit(paths: readonly string[] | null): void {
            changed?.({ groupId: GROUP, paths });
        },
        async read(path: string): Promise<HappyAgentWorkspaceFileTreeRead> {
            reads.push(path);
            // What the folder held when the read reached it, not when it returned.
            const entries = [...(directories.get(path) ?? [])];
            if (held) await new Promise<void>((resume) => held!.push(resume));
            if (failing.has(path)) throw new Error(`cannot read ${path}`);
            if (unavailable !== undefined) return { kind: "unavailable", reason: unavailable };
            return { kind: "page", page: { entries } };
        },
        subscribe(listener: (change: HappyAgentWorkspaceFilesChanged) => void): () => void {
            changed = listener;
            return () => {
                changed = undefined;
            };
        },
    };
}

/**
 * Every collaborator the tree does not exercise answers inertly: a method
 * returns nothing and a store holds nothing, so the workspace store runs its
 * real file-tree code against a client that only knows about the checkout.
 */
function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) =>
            property === "then"
                ? undefined
                : property === Symbol.iterator
                  ? function* () {}
                  : inert(),
        apply: () => undefined,
    });
}

/** The window's storage, which outlives every store that reads and writes it. */
function storage(): HappyAgentViewPreferencesPersistence {
    let document: HappyAgentViewPreferencesDocument | undefined;
    return {
        read: () => document,
        write: (next) => {
            document = next;
        },
    };
}

/**
 * The open conversation's chat, holding only where its tools run. The test
 * moves its compute the way the server would.
 */
function cloudChat(initial: HappyAgentCompute) {
    let compute = initial;
    const listeners = new Set<() => void>();
    let snapshot: unknown;
    const publish = (sessionId: HappyAgentSessionId): void => {
        snapshot = new Proxy(
            { sessionId, compute, ready: false, slashCommands: [] } as Record<PropertyKey, unknown>,
            {
                get: (target, property) => (property in target ? target[property] : inert()),
            },
        );
    };
    return {
        computeUpdate(next: HappyAgentCompute): void {
            compute = next;
            publish((snapshot as { sessionId: HappyAgentSessionId }).sessionId);
            for (const listener of listeners) listener();
        },
        acquire(sessionId: HappyAgentSessionId): Promise<unknown> {
            publish(sessionId);
            const chatStore = new Proxy(
                {
                    get: () => snapshot,
                    subscribe: (listener: () => void) => {
                        listeners.add(listener);
                        return () => listeners.delete(listener);
                    },
                } as Record<PropertyKey, unknown>,
                { get: (target, property) => (property in target ? target[property] : inert()) },
            );
            return Promise.resolve({ store: chatStore, [Symbol.dispose]: () => undefined });
        },
    };
}

function store(
    disk: ReturnType<typeof checkout>,
    viewPreferences: HappyAgentViewPreferencesPersistence = storage(),
    chat?: ReturnType<typeof cloudChat>,
) {
    const loading = { type: "loading" } as const;
    const list = new Proxy(
        {
            projects: loading,
            bots: [],
            tasks: [],
            botsCreating: [],
            archivedSessions: [],
            revision: 0,
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    );
    const client = new Proxy(
        {
            models: {
                get: () => loading,
                load: () => new Promise(() => undefined),
                subscribe: () => () => undefined,
            },
            sessionList: () =>
                new Proxy(
                    { get: () => list, subscribe: () => () => undefined },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            chat: (sessionId: HappyAgentSessionId) =>
                chat ? chat.acquire(sessionId) : new Promise(() => undefined),
            openInTargetsRead: () => new Promise(() => undefined),
            globalSkills: () => ({
                get: () => ({ skills: [] }),
                subscribe: () => () => undefined,
            }),
            workspaceFileTreeRead: (_group: HappyAgentGroupId, path: string) => disk.read(path),
            workspaceFilesSubscribe: (
                listener: (change: HappyAgentWorkspaceFilesChanged) => void,
            ) => disk.subscribe(listener),
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client, { viewPreferences });
    const unsubscribe = workspace.subscribe(() => undefined);
    return {
        workspace,
        unsubscribe,
        names(path = ""): string[] | undefined {
            return workspace
                .get()
                .workspaceFiles?.directories.get(path)
                ?.entries.map((entry) => entry.path);
        },
    };
}

async function settle(): Promise<void> {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

describe("All files follows the checkout on disk", () => {
    it("lists files an agent creates after the tree was first opened empty", async () => {
        // A project made a moment ago in a fresh folder: nothing in it yet.
        const disk = checkout();
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        expect(names()).toEqual([]);
        expect(workspace.get().workspaceFilesLoading).toBe(false);

        disk.add("README.md");
        disk.add("src", "directory");
        disk.emit(["README.md", "src"]);
        // The rows already shown stay on screen while the listing is re-read.
        expect(workspace.get().workspaceFilesLoading).toBe(false);
        await settle();

        expect(names()).toEqual(["README.md", "src"]);
        expect(workspace.get().workspaceFilesLoading).toBe(false);
        unsubscribe();
    });

    it("re-reads only the opened directory that holds the change", async () => {
        const disk = checkout();
        disk.add("src", "directory");
        disk.add("docs", "directory");
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        workspace.fileTreeExpandedUpdate("src", true);
        await settle();
        expect(names("src")).toEqual([]);
        disk.reads.length = 0;

        disk.add("src/index.ts");
        disk.emit(["src/index.ts"]);
        await settle();

        expect(names("src")).toEqual(["src/index.ts"]);
        // `docs` was never opened, so nothing reads it; the root did not change.
        expect(disk.reads).toEqual(["src"]);
        unsubscribe();
    });

    it("reads again when the disk changes while a read is in flight", async () => {
        const disk = checkout();
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();

        disk.hold();
        disk.add("a.txt");
        disk.emit(["a.txt"]);
        await settle();
        // The first refresh is now in flight, and has already read the folder.
        disk.add("b.txt");
        disk.emit(["b.txt"]);
        disk.release();
        await settle();

        expect(names()).toEqual(["a.txt", "b.txt"]);
        unsubscribe();
    });

    it("re-reads everything listed when the change names no paths", async () => {
        const disk = checkout();
        disk.add("src", "directory");
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        workspace.fileTreeExpandedUpdate("src", true);
        await settle();

        disk.add("top.md");
        disk.add("src/deep.ts");
        disk.emit(null);
        await settle();

        expect(names()).toEqual(["src", "top.md"]);
        expect(names("src")).toEqual(["src/deep.ts"]);
        unsubscribe();
    });
});

describe("All files reads the folders it shows open", () => {
    function nested() {
        const disk = checkout();
        disk.add("src", "directory");
        disk.add("src/lib", "directory");
        disk.add("src/lib/index.ts");
        return disk;
    }

    async function leaveOpen(workspace: ReturnType<typeof store>["workspace"]): Promise<void> {
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        workspace.fileTreeExpandedUpdate("src", true);
        await settle();
        workspace.fileTreeExpandedUpdate("src/lib", true);
        await settle();
    }

    it("lists the folders a reload left open without waiting for a hover", async () => {
        const disk = nested();
        const preferences = storage();
        const before = store(disk, preferences);
        await leaveOpen(before.workspace);
        before.unsubscribe();

        const { workspace, names, unsubscribe } = store(disk, preferences);
        workspace.groupOpen(GROUP);
        await settle();

        expect(names("src")).toEqual(["src/lib"]);
        expect(names("src/lib")).toEqual(["src/lib/index.ts"]);
        unsubscribe();
    });

    it("lists them again after the reader visits another checkout and comes back", async () => {
        const disk = nested();
        const { workspace, names, unsubscribe } = store(disk);
        await leaveOpen(workspace);

        workspace.groupOpen(OTHER);
        workspace.fileScopeUpdate(OTHER, "all");
        await settle();
        expect(names("src")).toBeUndefined();
        workspace.groupOpen(GROUP);
        await settle();

        expect(names("src")).toEqual(["src/lib"]);
        expect(names("src/lib")).toEqual(["src/lib/index.ts"]);
        unsubscribe();
    });

    it("lists a folder that appeared while the reader was in another checkout", async () => {
        const disk = checkout();
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        // Opened while the panel showed only the changes, so nothing read it.
        workspace.fileTreeExpandedUpdate("gen", true);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();

        // Away on a checkout showing its changes, this listing still follows
        // the disk, but its open folders are not the ones on screen.
        workspace.groupOpen(OTHER);
        disk.add("gen", "directory");
        disk.add("gen/out.js");
        disk.emit(["gen"]);
        await settle();
        expect(names()).toEqual(["gen"]);
        expect(names("gen")).toBeUndefined();

        workspace.conversationOpen("ses_back" as HappyAgentSessionId, GROUP);
        await settle();

        expect(names("gen")).toEqual(["gen/out.js"]);
        unsubscribe();
    });

    it("lists a folder left open once it appears on disk", async () => {
        const disk = checkout();
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        // Opened while the panel showed only the changes, so nothing read it.
        workspace.fileTreeExpandedUpdate("gen", true);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        expect(names("gen")).toBeUndefined();

        disk.add("gen", "directory");
        disk.add("gen/out.js");
        disk.emit(["gen"]);
        await settle();

        expect(names("gen")).toEqual(["gen/out.js"]);
        unsubscribe();
    });

    it("leaves a folder that failed to read for the reader to retry", async () => {
        const disk = nested();
        const preferences = storage();
        const before = store(disk, preferences);
        await leaveOpen(before.workspace);
        before.unsubscribe();
        disk.failing.add("src");
        disk.reads.length = 0;

        const { workspace, unsubscribe } = store(disk, preferences);
        workspace.groupOpen(GROUP);
        await settle();
        disk.add("top.md");
        disk.emit(["top.md"]);
        await settle();

        expect(workspace.get().workspaceFiles?.directories.get("src")?.error).toBe(true);
        expect(disk.reads).toEqual(["", "src", ""]);
        unsubscribe();
    });
});

describe("All files on a Happy Cloud conversation follows its compute", () => {
    const SESSION = "ses_cloud" as HappyAgentSessionId;
    const POOL: HappyAgentCompute = { kind: "pool", poolId: "pool_1", online: true };

    it("says no compute is attached, without asking the server", async () => {
        const disk = checkout();
        const chat = cloudChat({ kind: "none" });
        const { workspace, unsubscribe } = store(disk, storage(), chat);
        workspace.conversationOpen(SESSION, GROUP);
        await settle();
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();

        const files = workspace.get().workspaceFiles;
        expect(files?.unavailable).toBe("noCompute");
        expect(files?.directories.get("")).toBeUndefined();
        expect(workspace.get().workspaceFilesLoading).toBe(false);
        expect(disk.reads).toEqual([]);
        unsubscribe();
    });

    it("lists the root and the folders left open once compute attaches", async () => {
        const disk = checkout();
        disk.add("src", "directory");
        disk.add("src/index.ts");
        const chat = cloudChat({ kind: "none" });
        const { workspace, names, unsubscribe } = store(disk, storage(), chat);
        workspace.conversationOpen(SESSION, GROUP);
        await settle();
        workspace.fileTreeExpandedUpdate("src", true);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        expect(disk.reads).toEqual([]);

        // Attached, but its machine has not come up yet.
        chat.computeUpdate({ ...POOL, online: false });
        await settle();
        expect(workspace.get().workspaceFiles?.unavailable).toBeUndefined();
        expect(names()).toEqual(["src"]);
        expect(names("src")).toEqual(["src/index.ts"]);
        unsubscribe();
    });

    it("reads again when compute comes online after the server said it had none", async () => {
        const disk = checkout();
        disk.add("README.md");
        disk.unavailableSet("noCompute");
        // The chat arrives saying nothing yet, so the server is asked.
        const chat = cloudChat({ ...POOL, online: false });
        const { workspace, names, unsubscribe } = store(disk, storage(), chat);
        workspace.conversationOpen(SESSION, GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        expect(workspace.get().workspaceFiles?.unavailable).toBe("noCompute");
        expect(workspace.get().workspaceFiles?.directories.get("")).toBeUndefined();

        disk.unavailableSet(undefined);
        chat.computeUpdate(POOL);
        await settle();

        expect(workspace.get().workspaceFiles?.unavailable).toBeUndefined();
        expect(names()).toEqual(["README.md"]);
        unsubscribe();
    });

    it("retries a root that failed while the machine was offline", async () => {
        const disk = checkout();
        disk.add("README.md");
        disk.failing.add("");
        const chat = cloudChat({ ...POOL, online: false });
        const { workspace, names, unsubscribe } = store(disk, storage(), chat);
        workspace.conversationOpen(SESSION, GROUP);
        await settle();
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        expect(workspace.get().workspaceFiles?.directories.get("")?.error).toBe(true);

        disk.failing.delete("");
        chat.computeUpdate(POOL);
        await settle();

        expect(workspace.get().workspaceFiles?.directories.get("")?.error).toBeUndefined();
        expect(names()).toEqual(["README.md"]);
        unsubscribe();
    });

    it("stops listing when compute is taken away", async () => {
        const disk = checkout();
        disk.add("README.md");
        const chat = cloudChat(POOL);
        const { workspace, names, unsubscribe } = store(disk, storage(), chat);
        workspace.conversationOpen(SESSION, GROUP);
        await settle();
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        expect(names()).toEqual(["README.md"]);

        chat.computeUpdate({ kind: "none" });
        await settle();

        expect(workspace.get().workspaceFiles?.unavailable).toBe("noCompute");
        expect(names()).toBeUndefined();
        unsubscribe();
    });

    it("says a server without the route has no files, and does not ask it again", async () => {
        const disk = checkout();
        disk.unavailableSet("unsupported");
        const { workspace, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        expect(workspace.get().workspaceFiles?.unavailable).toBe("unsupported");
        expect(workspace.get().workspaceFilesLoading).toBe(false);

        workspace.fileScopeUpdate(GROUP, "changed");
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        expect(disk.reads).toEqual([""]);
        unsubscribe();
    });
});

describe("Reading a checkout directory names why nothing can be listed", () => {
    const answering = (error: unknown) =>
        happyAgentWorkspaceFileTreeRead(
            {
                getFileTree: () => Promise.reject(error),
            } as unknown as Pick<HappyAgentClient, "getFileTree">,
            GROUP,
            "",
        );

    it("maps the server's no-compute answer, whatever its status", async () => {
        await expect(
            answering(
                new HappyAgentApiError(409, "No compute.", "no_compute", {
                    error: "No compute.",
                    code: "no_compute",
                }),
            ),
        ).resolves.toEqual({ kind: "unavailable", reason: "noCompute" });
    });

    it("maps an unsupported route to a server without files", async () => {
        await expect(
            answering(
                new HappyAgentApiError(501, "Unsupported.", "unsupported", {
                    error: "Unsupported.",
                    code: "unsupported",
                }),
            ),
        ).resolves.toEqual({ kind: "unavailable", reason: "unsupported" });
    });

    it("keeps every other failure a failure", async () => {
        const failure = new HappyAgentApiError(500, "Broken.", "internal", null);
        await expect(answering(failure)).rejects.toBe(failure);
        const offline = new Error("socket closed");
        await expect(answering(offline)).rejects.toBe(offline);
    });
});
