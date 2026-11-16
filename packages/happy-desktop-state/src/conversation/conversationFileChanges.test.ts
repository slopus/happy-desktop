import { expect, it } from "vitest";
import type {
    ConversationDiffLine,
    ConversationEntry,
    ConversationFileDiff,
} from "./conversationEntry.js";
import { conversationFileChanges, conversationFileDiff } from "./conversationFileChanges.js";

function edit(kind: ConversationFileDiff["kind"], text: string): ConversationEntry {
    return {
        kind: "agentActivity",
        id: kind,
        sequence: "1",
        activity: {
            kind: "tool",
            tool: {
                toolCallId: kind,
                toolName: "apply_patch",
                arguments: {},
                status: "success",
                failed: false,
                presentation: {
                    type: "fileDiff",
                    files: [
                        {
                            path: "removed.txt",
                            kind,
                            hunks: [
                                {
                                    oldStart: 1,
                                    newStart: 1,
                                    lines: [{ kind: kind === "add" ? "add" : "delete", text }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
    };
}

it("keeps a preexisting deleted file and its before content in Changes", () => {
    const entries = [edit("delete", "original")];
    expect(conversationFileChanges(entries)).toEqual([
        { path: "removed.txt", added: 0, deleted: 1 },
    ]);
    expect(conversationFileDiff(entries, "removed.txt")).toMatchObject({
        kind: "delete",
        added: 0,
        deleted: 1,
        hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: "delete", text: "original" }] }],
    });
});

it("cancels a file created and then deleted in the conversation", () => {
    const entries = [edit("add", "new"), edit("delete", "new")];
    expect(conversationFileChanges(entries)).toEqual([]);
    expect(conversationFileDiff(entries, "removed.txt")).toMatchObject({
        added: 0,
        deleted: 0,
        hunks: [],
    });
});

const cwd = "/Users/steve/Happy/Tasks/task_66";

function patchEdit(
    path: string,
    kind: ConversationFileDiff["kind"],
    lines: readonly ConversationDiffLine[],
    workdir?: string,
): ConversationEntry {
    return {
        kind: "agentActivity",
        id: `${path}:${kind}`,
        sequence: "1",
        activity: {
            kind: "tool",
            tool: {
                toolCallId: `${path}:${kind}`,
                toolName: "apply_patch",
                arguments: {
                    patch: "*** Begin Patch\n*** End Patch",
                    ...(workdir === undefined ? {} : { workdir }),
                },
                status: "success",
                failed: false,
                presentation: {
                    type: "fileDiff",
                    files: [{ path, kind, hunks: [{ oldStart: 1, newStart: 1, lines }] }],
                },
            },
        },
    };
}

it("composes historical relative patches and resolved presentations as one file, including diff lookup", () => {
    const path = `${cwd}/.context/task-status.md`;
    const entries = [
        patchEdit("./.context/task-status.md", "add", [{ kind: "add", text: "draft" }]),
        patchEdit(path, "update", [
            { kind: "delete", text: "draft" },
            { kind: "add", text: "done" },
        ]),
    ];
    expect(conversationFileChanges(entries, cwd)).toEqual([{ path, added: 1, deleted: 0 }]);
    expect(conversationFileDiff(entries, path, cwd)).toMatchObject({
        path,
        added: 1,
        deleted: 0,
        hunks: [{ lines: [{ kind: "add", text: "done" }] }],
    });
    expect(
        conversationFileChanges(
            [
                ...entries,
                patchEdit(".context/task-status.md", "delete", [{ kind: "delete", text: "done" }]),
            ],
            cwd,
        ),
    ).toEqual([]);
});

it("keeps the same relative filename in different explicit workdirs separate", () => {
    const entries = [
        patchEdit("same.txt", "add", [{ kind: "add", text: "first directory" }], "/a"),
        patchEdit("same.txt", "add", [{ kind: "add", text: "second directory" }], "/b"),
    ];
    expect(conversationFileChanges(entries, cwd)).toEqual([
        { path: "/a/same.txt", added: 1, deleted: 0 },
        { path: "/b/same.txt", added: 1, deleted: 0 },
    ]);
    for (const [path, text] of [
        ["/a/same.txt", "first directory"],
        ["/b/same.txt", "second directory"],
    ]) {
        expect(conversationFileDiff(entries, path!, cwd)).toMatchObject({
            path,
            hunks: [{ lines: [{ kind: "add", text }] }],
        });
    }
});

it("resolves relative workdirs and parent segments without confusing neighboring task roots", () => {
    const entries = [
        patchEdit("status.md", "add", [{ kind: "add", text: "local" }], "./.context"),
        patchEdit(`${cwd}/.context/status.md`, "update", [{ kind: "add", text: "next" }]),
        patchEdit("../task_660/report.md", "add", [{ kind: "add", text: "external" }]),
    ];
    expect(conversationFileChanges(entries, cwd)).toEqual([
        { path: `${cwd}/.context/status.md`, added: 2, deleted: 0 },
        { path: "/Users/steve/Happy/Tasks/task_660/report.md", added: 1, deleted: 0 },
    ]);
});

it("does not invent a home or cwd for unresolved historical paths", () => {
    const entries = [
        patchEdit("same.txt", "add", [{ kind: "add", text: "a" }], "~/a"),
        patchEdit("same.txt", "add", [{ kind: "add", text: "b" }], "~/b"),
        patchEdit("/Users/steve/a/same.txt", "add", [{ kind: "add", text: "known" }]),
        patchEdit("same.txt", "add", [{ kind: "add", text: "unknown" }]),
    ];
    expect(conversationFileChanges(entries)).toEqual([
        { path: "~/a/same.txt", added: 1, deleted: 0 },
        { path: "~/b/same.txt", added: 1, deleted: 0 },
        { path: "/Users/steve/a/same.txt", added: 1, deleted: 0 },
        { path: "same.txt", added: 1, deleted: 0 },
    ]);
});

it("does not use a synthetic Docker display path as a historical operation directory", () => {
    const entries = [
        patchEdit("same.txt", "add", [{ kind: "add", text: "unknown default" }]),
        patchEdit("same.txt", "add", [{ kind: "add", text: "relative override" }], "subdir"),
        patchEdit("same.txt", "add", [{ kind: "add", text: "known override" }], "/workspace"),
    ];
    expect(conversationFileChanges(entries, "/docker/image:tag")).toEqual([
        { path: "same.txt", added: 1, deleted: 0 },
        { path: "subdir/same.txt", added: 1, deleted: 0 },
        { path: "/workspace/same.txt", added: 1, deleted: 0 },
    ]);
});

it("keeps literal POSIX backslashes distinct from directory separators", () => {
    const entries = [
        patchEdit("a\\b.txt", "add", [{ kind: "add", text: "one filename" }]),
        patchEdit("a/b.txt", "add", [{ kind: "add", text: "nested file" }]),
    ];
    expect(conversationFileChanges(entries, cwd)).toEqual([
        { path: `${cwd}/a\\b.txt`, added: 1, deleted: 0 },
        { path: `${cwd}/a/b.txt`, added: 1, deleted: 0 },
    ]);
    expect(conversationFileDiff(entries, `${cwd}/a\\b.txt`, cwd)).toMatchObject({
        hunks: [{ lines: [{ kind: "add", text: "one filename" }] }],
    });
});

it("normalizes relative Windows separators only after an authoritative drive cwd is known", () => {
    const entries = [
        patchEdit("src\\same.txt", "add", [{ kind: "add", text: "old" }]),
        patchEdit("C:\\task\\src\\same.txt", "update", [
            { kind: "delete", text: "old" },
            { kind: "add", text: "new" },
        ]),
    ];
    expect(conversationFileChanges(entries, "C:\\task")).toEqual([
        { path: "C:/task/src/same.txt", added: 1, deleted: 0 },
    ]);
    expect(conversationFileDiff(entries, "C:/task/src/same.txt", "C:\\task")).toMatchObject({
        hunks: [{ lines: [{ kind: "add", text: "new" }] }],
    });
    const unc = "//server/share/../same.txt";
    expect(
        conversationFileChanges(
            [patchEdit(unc, "add", [{ kind: "add", text: "unresolved share traversal" }])],
            cwd,
        ),
    ).toEqual([{ path: unc, added: 1, deleted: 0 }]);
});
