import { describe, expect, it } from "vitest";
import { localAppsDetect, type LocalAppsFileSystem } from "./localApps";

function plist(identifier: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
    <key>CFBundleName</key>
    <string>App</string>
    <key>CFBundleIdentifier</key>
    <string>${identifier}</string>
</dict></plist>`;
}

/** Directories end in `/` or `\`; files map to their contents. */
function fileSystemCreate(
    entries: Record<string, string>,
    failing: readonly string[] = [],
): LocalAppsFileSystem & { readonly read: string[] } {
    const read: string[] = [];
    const normalized = new Map(
        Object.entries(entries).map(([path, contents]) => [
            path.replace(/[\\/]$/u, ""),
            {
                contents,
                directory: /[\\/]$/u.test(path),
            },
        ]),
    );
    return {
        read,
        async stat(path) {
            if (failing.includes(path))
                throw Object.assign(new Error("denied"), { code: "EACCES" });
            const entry = normalized.get(path);
            if (!entry) throw Object.assign(new Error("missing"), { code: "ENOENT" });
            return {
                isDirectory: () => entry.directory,
                isFile: () => !entry.directory,
                size: entry.contents.length,
            };
        },
        async readFile(path) {
            read.push(path);
            const entry = normalized.get(path);
            if (!entry || entry.directory) throw new Error("missing");
            return entry.contents;
        },
    };
}

describe("macOS", () => {
    const environment = { HOME: "/Users/alice" };

    it("recognizes each app by its bundle identifier, in either Applications folder", async () => {
        const fileSystem = fileSystemCreate({
            "/Applications/Claude.app/": "",
            "/Applications/Claude.app/Contents/Info.plist": plist("com.anthropic.claudefordesktop"),
            "/Users/alice/Applications/ChatGPT.app/": "",
            "/Users/alice/Applications/ChatGPT.app/Contents/Info.plist": plist("com.openai.codex"),
            "/Applications/Antigravity IDE.app/": "",
            "/Applications/Antigravity IDE.app/Contents/Info.plist": plist(
                "com.google.antigravity-ide",
            ),
            "/Users/alice/.local/bin/agy": "binary",
        });
        await expect(
            localAppsDetect({ environment, fileSystem, path: "/usr/bin", platform: "darwin" }),
        ).resolves.toEqual({
            agyCli: true,
            antigravityApp: true,
            claudeDesktop: true,
            codexDesktop: true,
        });
        // Only Info.plist files are ever opened.
        expect(fileSystem.read.every((path) => path.endsWith("/Contents/Info.plist"))).toBe(true);
    });

    it("does not count ChatGPT Classic as the Codex app", async () => {
        const fileSystem = fileSystemCreate({
            "/Applications/ChatGPT.app/": "",
            "/Applications/ChatGPT.app/Contents/Info.plist": plist("com.openai.chat"),
        });
        await expect(
            localAppsDetect({ environment, fileSystem, path: "", platform: "darwin" }),
        ).resolves.toEqual({
            agyCli: false,
            antigravityApp: false,
            claudeDesktop: false,
            codexDesktop: false,
        });
    });

    it("finds agy on the PATH, and says unknown when a bundle cannot be read", async () => {
        const fileSystem = fileSystemCreate(
            {
                "/opt/tools/agy": "binary",
                "/Applications/Claude.app/": "",
                // A binary plist has no XML key to read.
                "/Applications/Claude.app/Contents/Info.plist": "bplist00",
            },
            ["/Applications/Antigravity.app"],
        );
        await expect(
            localAppsDetect({
                environment,
                fileSystem,
                path: "relative:/usr/bin:/opt/tools",
                platform: "darwin",
            }),
        ).resolves.toEqual({
            agyCli: true,
            antigravityApp: null,
            claudeDesktop: null,
            codexDesktop: false,
        });
    });
});

describe("Windows", () => {
    const environment = {
        LOCALAPPDATA: "C:\\Users\\alice\\AppData\\Local",
        USERPROFILE: "C:\\Users\\alice",
    };

    it("finds the MSIX packages and agy, and leaves Antigravity unknown", async () => {
        const fileSystem = fileSystemCreate({
            "C:\\Users\\alice\\AppData\\Local\\Packages\\Claude_pzs8sxrjxfjjc\\": "",
            "C:\\Users\\alice\\AppData\\Local\\Packages\\OpenAI.Codex_2p2nqsd0c76g0\\": "",
            "C:\\Users\\alice\\AppData\\Local\\agy\\bin\\agy.exe": "binary",
        });
        await expect(
            localAppsDetect({
                environment,
                fileSystem,
                path: "C:\\Windows",
                platform: "win32",
            }),
        ).resolves.toEqual({
            agyCli: true,
            antigravityApp: null,
            claudeDesktop: true,
            codexDesktop: true,
        });
        expect(fileSystem.read).toEqual([]);
    });

    it("finds the older Squirrel install of Claude", async () => {
        const fileSystem = fileSystemCreate({
            "C:\\Users\\alice\\AppData\\Local\\AnthropicClaude\\Claude.exe": "binary",
        });
        await expect(
            localAppsDetect({ environment, fileSystem, path: "", platform: "win32" }),
        ).resolves.toEqual({
            agyCli: false,
            antigravityApp: null,
            claudeDesktop: true,
            codexDesktop: false,
        });
    });

    it("finds agy on the PATH, and says unknown without LOCALAPPDATA", async () => {
        const fileSystem = fileSystemCreate({ "C:\\Tools\\agy.exe": "binary" });
        await expect(
            localAppsDetect({
                environment: {},
                fileSystem,
                path: "C:\\Windows;C:\\Tools",
                platform: "win32",
            }),
        ).resolves.toEqual({
            agyCli: true,
            antigravityApp: null,
            claudeDesktop: null,
            codexDesktop: null,
        });
    });
});

describe("Linux and elsewhere", () => {
    it("reports only agy on Linux", async () => {
        const fileSystem = fileSystemCreate({ "/home/alice/.local/bin/agy": "binary" });
        await expect(
            localAppsDetect({
                environment: { HOME: "/home/alice" },
                fileSystem,
                path: "/usr/bin",
                platform: "linux",
            }),
        ).resolves.toEqual({
            agyCli: true,
            antigravityApp: null,
            claudeDesktop: null,
            codexDesktop: null,
        });
    });

    it("knows nothing on another OS", async () => {
        await expect(
            localAppsDetect({ fileSystem: fileSystemCreate({}), platform: "freebsd" }),
        ).resolves.toEqual({
            agyCli: null,
            antigravityApp: null,
            claudeDesktop: null,
            codexDesktop: null,
        });
    });

    it("answers unknown when the look runs out of time", async () => {
        const fileSystem: LocalAppsFileSystem = {
            stat: () => new Promise(() => undefined),
            readFile: () => new Promise(() => undefined),
        };
        await expect(
            localAppsDetect({
                environment: { HOME: "/Users/alice" },
                fileSystem,
                platform: "darwin",
                timeoutMs: 10,
            }),
        ).resolves.toEqual({
            agyCli: null,
            antigravityApp: null,
            claudeDesktop: null,
            codexDesktop: null,
        });
    });
});
