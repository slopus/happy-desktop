import { expect, it } from "vitest";
import type { HappyAgentProjectGroup } from "happy-desktop-state";
import type { SidebarItem } from "happy-desktop-ui";
import { rowMenuItems } from "../../sources/AppHappyAgentView";

/* The row a workspace stands for in the sidebar starts the next session there
 * from its menu, without opening the workspace and finding its tab strip's "+"
 * first, as does a project's row, the home project's included. */

const PROJECT = {
    id: "prj_app",
    name: "app",
    kind: "regular",
    path: "/Users/happy/app",
    displayPath: "~/app",
    conversations: [],
    worktrees: [{ id: "wt_fix", name: "fix", path: "/Users/happy/app-fix", conversations: [] }],
} as unknown as HappyAgentProjectGroup;
const HOME = {
    ...PROJECT,
    id: "prj_home",
    kind: "home",
    worktrees: [],
} as unknown as HappyAgentProjectGroup;

const row = (id: string) => ({ id }) as SidebarItem;
const menuOf = (id: string) =>
    rowMenuItems([PROJECT, HOME], [], [], row(id), true, undefined, false).flatMap((item) =>
        item.kind === "item" ? [item.label] : ["—"],
    );

it("offers a new session first on a workspace's, a project's, and home's row", () => {
    expect(menuOf("wt_fix")).toEqual([
        "New session",
        "—",
        "Rename workspace",
        "—",
        "Archive workspace",
    ]);
    expect(menuOf("prj_app")[0]).toBe("New session");
    expect(menuOf("prj_home")).toEqual(["New session"]);
});

/* The row offers what the strip's "+" offers, and withholds it where "+" is
 * disabled: a checkout still being prepared takes no second session, and one
 * that failed, is going, or lost its folder takes none at all. */
it("withholds a new session where the checkout cannot take one", () => {
    const refused = (lifecycle: unknown, writeRefusal: string) =>
        ({
            ...PROJECT,
            id: "prj_refused",
            lifecycle,
            writeRefusal,
            worktrees: [
                {
                    id: "wt_refused",
                    name: "refused",
                    path: "/Users/happy/app-refused",
                    conversations: [],
                    lifecycle,
                    writeRefusal,
                },
            ],
        }) as unknown as HappyAgentProjectGroup;
    for (const [lifecycle, writeRefusal] of [
        [{ phase: "creating" }, "This workspace is still being created."],
        [{ phase: "failed" }, "This workspace could not be created."],
        [{ phase: "missing" }, "This workspace's folder is no longer on disk."],
        [{ phase: "ready" }, "This workspace is being removed."],
    ] as const)
        for (const id of ["wt_refused", "prj_refused"]) {
            const first = rowMenuItems(
                [refused(lifecycle, writeRefusal)],
                [],
                [],
                row(id),
                true,
                undefined,
                false,
            )[0];
            expect(first).toMatchObject({ label: "New session", disabled: true });
        }
    const ready = rowMenuItems([PROJECT], [], [], row("wt_fix"), true, undefined, false)[0];
    expect(ready).toMatchObject({ label: "New session" });
    expect(ready).not.toMatchObject({ disabled: true });
});
