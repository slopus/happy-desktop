import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    fileOpen,
    fileOpenApplicationsChoose,
    fileOpenApplicationsRead,
    fileOpenCheck,
} from "./openIn";

/* Opening a file a chat was shown launches another application, so the host
 * takes only a plain document by its real name and bytes, and hands it only to
 * an application this Mac offered for it that does not run what it opens. */

let directory: string;
beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "happy-file-open-"));
});
afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

async function file(name: string, mode = 0o644): Promise<string> {
    const path = join(directory, name);
    await writeFile(path, "x");
    await chmod(path, mode);
    return path;
}

describe("fileOpenCheck", () => {
    it("takes documents, pictures, sounds, and recordings", async () => {
        for (const name of ["sales-report.xlsx", "notes.PDF", "chart.png", "clip.mov", "a.csv"])
            await expect(fileOpenCheck(await file(name))).resolves.toMatch(/\/[^/]+$/u);
    });

    it("refuses macro documents, pages, scripts, installers, and every unknown kind", async () => {
        for (const name of [
            "book.xlsm",
            "letter.docm",
            "deck.pptm",
            "page.html",
            "page.htm",
            "icon.svg",
            "run.command",
            "run.sh",
            "shell.terminal",
            "setup.pkg",
            "disk.dmg",
            "tool.jar",
            "macro.scpt",
            "site.webloc",
            "data.xyz",
        ])
            await expect(fileOpenCheck(await file(name)), name).rejects.toThrow(
                /\.[a-z]+ file is not opened from Happy/u,
            );
        await expect(fileOpenCheck(await file("Makefile"))).rejects.toThrow(
            "A file without a type is not opened from Happy.",
        );
    });

    it("refuses an executable document, a folder, and a bundle", async () => {
        await expect(fileOpenCheck(await file("report.pdf", 0o755))).rejects.toThrow(
            "An executable file is not opened from Happy.",
        );
        await mkdir(join(directory, "folder.pdf"));
        await expect(fileOpenCheck(join(directory, "folder.pdf"))).rejects.toThrow(
            "Only a file can be opened, not a folder or a bundle.",
        );
        await mkdir(join(directory, "Tool.app", "Contents"), { recursive: true });
        await expect(fileOpenCheck(join(directory, "Tool.app"))).rejects.toThrow(
            "Only a file can be opened, not a folder or a bundle.",
        );
    });

    it("reads the kind from the file a link points at, not the link's name", async () => {
        const script = await file("run.command", 0o644);
        await symlink(script, join(directory, "sales-report.xlsx"));
        await expect(fileOpenCheck(join(directory, "sales-report.xlsx"))).rejects.toThrow(
            "A .command file is not opened from Happy.",
        );
        const sheet = await file("real.xlsx");
        await symlink(sheet, join(directory, "link.xlsx"));
        await expect(fileOpenCheck(join(directory, "link.xlsx"))).resolves.toMatch(/real\.xlsx$/u);
    });

    it("refuses a relative path and a file that is not there", async () => {
        await expect(fileOpenCheck("sales-report.xlsx")).rejects.toThrow(
            "Only a file on this Mac can be opened.",
        );
        await expect(fileOpenCheck(join(directory, "gone.xlsx"))).rejects.toThrow(
            "That file is not on this Mac.",
        );
    });
});

describe("fileOpenApplicationsChoose", () => {
    const at = (name: string, bundleId: string, path = `/Applications/${name}.app`) => ({
        name: `${name}.app`,
        bundleId,
        path,
    });

    it("never offers an application that runs, builds, scripts, or unpacks what it opens", () => {
        const refused = [
            at("Terminal", "com.apple.Terminal"),
            at("iTerm", "com.googlecode.iterm2"),
            at("Script Editor", "com.apple.ScriptEditor2"),
            at("Automator", "com.apple.Automator"),
            at("Installer", "com.apple.installer"),
            at("Archive Utility", "com.apple.archiveutility"),
            at("Xcode", "com.apple.dt.Xcode"),
            at("Shortcuts", "com.apple.shortcuts"),
        ];
        expect(
            fileOpenApplicationsChoose(
                [
                    ...refused,
                    at("TextEdit", "com.apple.TextEdit"),
                    at("tool", "x.tool", "/usr/bin/tool"),
                ],
                "/Applications/Terminal.app",
            ),
        ).toEqual([
            {
                id: "com.apple.TextEdit",
                name: "TextEdit",
                isDefault: false,
                path: "/Applications/TextEdit.app",
            },
        ]);
    });

    it("offers one entry per application, the copy a double-click uses, the default first", () => {
        const chosen = fileOpenApplicationsChoose(
            [
                at("Numbers", "com.apple.Numbers", "/Volumes/Old/Numbers.app"),
                at("Codex", "com.openai.codex"),
                at("Numbers", "com.apple.Numbers"),
                at("Bare", "", "/Applications/Bare.app"),
                at("Bare", "", "/Users/me/Applications/Bare.app"),
                at("Atlas", "com.example.atlas"),
            ],
            "/Applications/Numbers.app",
        );
        expect(chosen.map(({ id, name, isDefault }) => [id, name, isDefault])).toEqual([
            ["com.apple.Numbers", "Numbers", true],
            ["com.example.atlas", "Atlas", false],
            ["/Applications/Bare.app", "Bare", false],
            ["/Users/me/Applications/Bare.app", "Bare", false],
            ["com.openai.codex", "Codex", false],
        ]);
        expect(chosen[0]!.path).toBe("/Applications/Numbers.app");
    });

    it("offers at most eight", () => {
        const many = Array.from({ length: 12 }, (_, index) =>
            at(`App ${String(index).padStart(2, "0")}`, `com.example.app${String(index)}`),
        );
        const chosen = fileOpenApplicationsChoose(many, "/Applications/App 11.app");
        expect(chosen).toHaveLength(8);
        expect(chosen[0]!.name).toBe("App 11");
        expect(chosen[1]!.name).toBe("App 00");
    });
});

describe.runIf(process.platform === "darwin")("on this Mac", () => {
    it("lists applications without launching one, and none for a kind it refuses", async () => {
        const applications = await fileOpenApplicationsRead(await file("notes.txt"));
        expect(applications.length).toBeGreaterThan(0);
        expect(
            applications.filter((application) => application.isDefault).length,
        ).toBeLessThanOrEqual(1);
        for (const application of applications)
            expect(Object.keys(application).sort()).toEqual(["id", "isDefault", "name"]);
        expect(await fileOpenApplicationsRead(await file("run.command"))).toEqual([]);
        expect(await fileOpenApplicationsRead(await file("run.sh"))).toEqual([]);
        expect(await fileOpenApplicationsRead(await file("report.pdf", 0o755))).toEqual([]);
    });

    it("opens only in an application it offered, and never in a hidden-window run", async () => {
        const notes = await file("notes.txt");
        const [offered] = await fileOpenApplicationsRead(notes);
        await expect(fileOpen(notes, "com.apple.Terminal")).rejects.toThrow(
            "Happy does not open this file in that application.",
        );
        await expect(
            fileOpen(notes, "/System/Applications/Utilities/Terminal.app"),
        ).rejects.toThrow("Happy does not open this file in that application.");
        await expect(fileOpen(await file("run.command"), offered!.id)).rejects.toThrow(
            "A .command file is not opened from Happy.",
        );
        const hidden = process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN;
        process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN = "1";
        try {
            await expect(fileOpen(notes, offered!.id)).rejects.toThrow(
                "A hidden-window run cannot open a file in another application.",
            );
        } finally {
            if (hidden === undefined) delete process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN;
            else process.env.HAPPY_DESKTOP_WINDOWS_HIDDEN = hidden;
        }
    });
});
