import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    linuxDesktopDataHome,
    linuxDesktopEntryRender,
    linuxDesktopIntegrate,
} from "./linuxDesktopIntegration";

let root: string;
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "happy-desktop-entry-"));
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function execLine(entry: string | undefined): string | undefined {
    return entry?.split("\n").find((line) => line.startsWith("Exec="));
}

describe("linuxDesktopDataHome", () => {
    it("uses an absolute XDG_DATA_HOME", () => {
        expect(linuxDesktopDataHome({ XDG_DATA_HOME: "/data/home" }, "/home/kim")).toBe(
            "/data/home",
        );
    });

    it("falls back to ~/.local/share when XDG_DATA_HOME is unset, empty, or relative", () => {
        expect(linuxDesktopDataHome({}, "/home/kim")).toBe("/home/kim/.local/share");
        expect(linuxDesktopDataHome({ XDG_DATA_HOME: "" }, "/home/kim")).toBe(
            "/home/kim/.local/share",
        );
        expect(linuxDesktopDataHome({ XDG_DATA_HOME: "data" }, "/home/kim")).toBe(
            "/home/kim/.local/share",
        );
    });
});

describe("linuxDesktopEntryRender", () => {
    it("opens the AppImage with links and carries the marker", () => {
        const entry = linuxDesktopEntryRender("/home/kim/Apps/Happy-2026.11.1-x64.AppImage");
        expect(execLine(entry)).toBe(
            "Exec=/home/kim/Apps/Happy-2026.11.1-x64.AppImage --no-sandbox %U",
        );
        expect(entry).toContain("MimeType=x-scheme-handler/happy-auth;x-scheme-handler/happy;\n");
        expect(entry).toContain("Icon=happy-desktop-electron\n");
        expect(entry).toContain("\nX-Happy-Managed=true\n");
    });

    it("quotes only paths with reserved characters, escaping quotes, backticks, dollars, and backslashes", () => {
        expect(execLine(linuxDesktopEntryRender("/home/kim/My Apps/Happy.AppImage"))).toBe(
            'Exec="/home/kim/My Apps/Happy.AppImage" --no-sandbox %U',
        );
        expect(execLine(linuxDesktopEntryRender(`/tmp/a "b" 'c'/Happy.AppImage`))).toBe(
            `Exec="/tmp/a \\\\"b\\\\" 'c'/Happy.AppImage" --no-sandbox %U`,
        );
        expect(execLine(linuxDesktopEntryRender("/tmp/$HOME`x`/a\\b"))).toBe(
            'Exec="/tmp/\\\\$HOME\\\\`x\\\\`/a\\\\\\\\b" --no-sandbox %U',
        );
    });

    it("refuses relative paths and paths with control characters or percents", () => {
        expect(linuxDesktopEntryRender("Happy.AppImage")).toBeUndefined();
        expect(linuxDesktopEntryRender("/tmp/100%/Happy.AppImage")).toBeUndefined();
        expect(linuxDesktopEntryRender("/tmp/a\nExec=evil")).toBeUndefined();
    });
});

describe("linuxDesktopIntegrate", () => {
    const appImagePath = "/home/kim/Happy.AppImage";

    function entryPath(): string {
        return join(root, "applications", "happy-desktop-electron.desktop");
    }

    function iconCreate(contents: string): string {
        const path = join(root, "source-icon.png");
        writeFileSync(path, contents);
        return path;
    }

    it("writes the entry and icon into the data home", () => {
        const iconPath = iconCreate("png");
        expect(linuxDesktopIntegrate({ appImagePath, dataHome: root, iconPath })).toBe("written");
        expect(readFileSync(entryPath(), "utf8")).toBe(linuxDesktopEntryRender(appImagePath));
        expect(
            readFileSync(
                join(root, "icons", "hicolor", "512x512", "apps", "happy-desktop-electron.png"),
                "utf8",
            ),
        ).toBe("png");
    });

    it("leaves a current entry untouched", () => {
        const iconPath = iconCreate("png");
        linuxDesktopIntegrate({ appImagePath, dataHome: root, iconPath });
        const iconFile = join(
            root,
            "icons",
            "hicolor",
            "512x512",
            "apps",
            "happy-desktop-electron.png",
        );
        // Every write replaces the file by rename, so an untouched file keeps its inode.
        const entryInode = statSync(entryPath()).ino;
        const iconInode = statSync(iconFile).ino;
        expect(linuxDesktopIntegrate({ appImagePath, dataHome: root, iconPath })).toBe("unchanged");
        expect(statSync(entryPath()).ino).toBe(entryInode);
        expect(statSync(iconFile).ino).toBe(iconInode);
    });

    it("rewrites its own entry when the AppImage moved", () => {
        linuxDesktopIntegrate({ appImagePath, dataHome: root, iconPath: undefined });
        const moved = "/home/kim/Downloads/Happy-next.AppImage";
        expect(
            linuxDesktopIntegrate({ appImagePath: moved, dataHome: root, iconPath: undefined }),
        ).toBe("written");
        expect(readFileSync(entryPath(), "utf8")).toBe(linuxDesktopEntryRender(moved));
    });

    it("never touches an entry it did not write", () => {
        mkdirSync(join(root, "applications"));
        const foreign = "[Desktop Entry]\nName=Happy\nExec=/opt/Happy/happy %U\n";
        writeFileSync(entryPath(), foreign);
        const iconPath = iconCreate("png");
        expect(linuxDesktopIntegrate({ appImagePath, dataHome: root, iconPath })).toBe("foreign");
        expect(readFileSync(entryPath(), "utf8")).toBe(foreign);
        expect(() => statSync(join(root, "icons"))).toThrow();
    });

    it("writes nothing for an unsupported path", () => {
        expect(
            linuxDesktopIntegrate({
                appImagePath: "relative",
                dataHome: root,
                iconPath: undefined,
            }),
        ).toBe("unsupportedPath");
        expect(() => statSync(join(root, "applications"))).toThrow();
    });
});
