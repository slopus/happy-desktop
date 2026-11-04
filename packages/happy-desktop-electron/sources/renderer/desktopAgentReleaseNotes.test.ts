import type {
    AppHappyAgentDaemonSnapshot,
    AppHappyAgentDaemonStore,
    AppHappyAgentDaemonVersion,
} from "happy-desktop-app";
import { describe, expect, it } from "vitest";
import {
    RELEASE_NOTES_CHANGELOG_URL,
    RELEASE_NOTES_OVERFLOW_THRESHOLD,
    releaseNotesParse,
    releaseNotesProject,
    releaseNotesRange,
    releaseNotesUrl,
    type ReleaseNotesFile,
} from "./desktopAgentReleaseNotes";
import { desktopAgentReleaseNotesStoreCreate } from "./desktopAgentReleaseNotesStore";

/** The files the release process wrote for v0.4.103 to v0.4.106, as committed. */
const FILES: Readonly<Record<string, string>> = {
    "0.4.103": "## Features\n\n- Teammates join Surfaces automatically\n",
    "0.4.104-preview.1":
        "## Features\n\n- Self-organizing Spaces sidebar\n- Token totals per activity\n\n## Fixes\n\n- Archived work leaves the sidebar\n",
    "0.4.104-preview.2":
        "## Features\n\n- Surfaces appear in Spaces\n\n## Fixes\n\n- Joined Surfaces stay in Spaces\n",
    "0.4.104":
        "## Features\n\n- Self-organizing Spaces sidebar\n- Viewed images appear in chat\n\n## Fixes\n\n- Failure switch menu stays current\n",
    "0.4.105-preview.1":
        "## Features\n\n- MCP servers can ask approval\n- Surface mentions become links\n\n## Fixes\n\n- Bot chats show progress replies\n",
    "0.4.105-preview.2": "## Fixes\n\n- Updated bundled Bun runtime\n",
    "0.4.105-preview.3":
        "## Features\n\n- Artifacts match the app's look\n\n## Fixes\n\n- No freezes with many MCP tools\n- Runs no longer appear stuck\n",
    "0.4.105-preview.6":
        "## Features\n\n- Sidebar keeps your manual changes\n- Better names for new work\n\n## Fixes\n\n- No crash loop after downgrade\n- Search finds files in big folders\n",
    "0.4.105":
        "## Features\n\n- MCP servers can ask approval\n- Sidebar keeps your manual changes\n\n## Fixes\n\n- No freezes with many MCP tools\n",
    "0.4.106-preview.1":
        "## Features\n\n- Agent messages explain themselves\n- Answered questions stay in chat\n",
    "0.4.106-preview.2": "## Features\n\n- New work appears instantly\n",
    "0.4.106-preview.3":
        "## Fixes\n\n- Reliable task and bot names\n- Hostile replies cannot freeze chat\n",
    "0.4.106-preview.4":
        "## Features\n\n- Widgets in the sidebar\n\n## Fixes\n\n- Sidebar edits no longer collide\n",
    "0.4.106-preview.5":
        "## Features\n\n- Sidebar sorts work by topic\n- Distractions fold out of sight\n",
    "0.4.106":
        "## Features\n\n- Sidebar sorts work by topic\n- New work appears instantly\n\n## Fixes\n\n- Reliable task and bot names\n",
};

/** The daemon's catalog for a preview reader: every tag, newest first. */
const PREVIEW_CATALOG = [
    "0.4.106",
    "0.4.106-preview.5",
    "0.4.106-preview.4",
    "0.4.106-preview.3",
    "0.4.106-preview.2",
    "0.4.106-preview.1",
    "0.4.105",
    "0.4.105-preview.6",
    "0.4.105-preview.3",
    "0.4.105-preview.2",
    "0.4.105-preview.1",
    "0.4.104",
    "0.4.104-preview.2",
    "0.4.104-preview.1",
    "0.4.103",
    "0.4.102",
];
/** The same catalog as the host gives a stable reader: previews filtered out. */
const STABLE_CATALOG = PREVIEW_CATALOG.filter((version) => !version.includes("-"));

const PARSED = new Map<string, ReleaseNotesFile>(
    Object.entries(FILES).map(([version, text]) => [version, releaseNotesParse(text)]),
);

function project(catalog: readonly string[], from: string, to: string) {
    const range = releaseNotesRange(catalog, from, to);
    if (!range) throw new Error("no range");
    return releaseNotesProject({ files: PARSED, from, range, to });
}

describe("releaseNotesParse", () => {
    it("reads both sections across the formatter's blank lines", () => {
        expect(releaseNotesParse(FILES["0.4.106"]!)).toEqual({
            features: ["Sidebar sorts work by topic", "New work appears instantly"],
            fixes: ["Reliable task and bot names"],
            thanks: [],
        });
    });

    it("reads a file with only one section", () => {
        expect(releaseNotesParse(FILES["0.4.105-preview.2"]!)).toEqual({
            features: [],
            fixes: ["Updated bundled Bun runtime"],
            thanks: [],
        });
    });

    it("ignores everything that is not a top-level bullet of a known section", () => {
        const text = [
            "# Happy Agent 0.4.106",
            "Intro prose that is not a bullet.",
            "- A bullet before any section",
            "## Features",
            "-",
            "- Real feature  with   spaces ",
            "  - Nested bullet",
            "* Star bullet",
            "## Breaking changes",
            "- Not a feature",
            "### fixes",
            "+ Plus bullet\r",
            "- Control\u0007character",
        ].join("\n");
        expect(releaseNotesParse(text)).toEqual({
            features: ["Real feature with spaces", "Star bullet"],
            fixes: ["Plus bullet", "Controlcharacter"],
            thanks: [],
        });
    });

    it("caps bullet length and count", () => {
        const long = "word ".repeat(40);
        const many = Array.from({ length: 12 }, (_, index) => `- Fix ${index}`).join("\n");
        const parsed = releaseNotesParse(`## Features\n- ${long}\n## Fixes\n${many}`);
        expect(parsed.features[0]!.length).toBeLessThanOrEqual(64);
        expect(parsed.features[0]!.endsWith("…")).toBe(true);
        expect(parsed.fixes).toHaveLength(6);
    });

    it("reads nothing from an empty or unrelated file", () => {
        expect(releaseNotesParse("")).toEqual({ features: [], fixes: [], thanks: [] });
        expect(releaseNotesParse("<html>404: Not Found</html>")).toEqual({
            features: [],
            fixes: [],
            thanks: [],
        });
    });
});

describe("releaseNotesUrl", () => {
    it("names the tag's file and refuses anything that is not a version", () => {
        expect(releaseNotesUrl("0.4.106-preview.5")).toBe(
            "https://raw.githubusercontent.com/slopus/happy-agent/main/release-notes/v0.4.106-preview.5.md",
        );
        expect(releaseNotesUrl("../../main")).toBeUndefined();
        expect(releaseNotesUrl("0.4.106+local.1")).toBeUndefined();
    });
});

describe("releaseNotesRange", () => {
    it("takes only stable tags on a stable catalog", () => {
        expect(releaseNotesRange(STABLE_CATALOG, "0.4.102", "0.4.106")).toEqual([
            "0.4.106",
            "0.4.105",
            "0.4.104",
            "0.4.103",
        ]);
    });

    it("takes stable and preview tags on a preview catalog", () => {
        const range = releaseNotesRange(PREVIEW_CATALOG, "0.4.102", "0.4.106");
        expect(range).toHaveLength(15);
        expect(range?.[0]).toBe("0.4.106");
        expect(range?.at(-1)).toBe("0.4.103");
    });

    it("excludes the installed version and includes the target", () => {
        expect(releaseNotesRange(PREVIEW_CATALOG, "0.4.106-preview.4", "0.4.106")).toEqual([
            "0.4.106",
            "0.4.106-preview.5",
        ]);
    });

    it("stops at a target older than the newest release", () => {
        expect(releaseNotesRange(STABLE_CATALOG, "0.4.103", "0.4.105")).toEqual([
            "0.4.105",
            "0.4.104",
        ]);
    });

    it("counts a repeated tag once", () => {
        expect(releaseNotesRange(["0.4.106", "0.4.106", "0.4.105"], "0.4.105", "0.4.106")).toEqual([
            "0.4.106",
        ]);
    });

    it("has no range when an end is unknown or the target is not newer", () => {
        expect(releaseNotesRange(STABLE_CATALOG, "0.4.90", "0.4.106")).toBeUndefined();
        expect(releaseNotesRange(STABLE_CATALOG, "0.4.102", "0.4.107")).toBeUndefined();
        expect(releaseNotesRange(STABLE_CATALOG, "0.4.106", "0.4.106")).toBeUndefined();
        expect(releaseNotesRange(STABLE_CATALOG, "0.4.106", "0.4.105")).toBeUndefined();
    });
});

describe("releaseNotesProject", () => {
    it("lists one release as written", () => {
        expect(project(STABLE_CATALOG, "0.4.105", "0.4.106")).toEqual({
            changelogUrl: RELEASE_NOTES_CHANGELOG_URL,
            features: {
                items: ["Sidebar sorts work by topic", "New work appears instantly"],
                total: 2,
            },
            fixes: { items: ["Reliable task and bot names"], total: 1 },
            from: "0.4.105",
            kind: "list",
            releaseCount: 1,
            to: "0.4.106",
        });
    });

    it("merges several releases newest first and caps the list at five", () => {
        expect(project(STABLE_CATALOG, "0.4.102", "0.4.106")).toMatchObject({
            features: {
                items: [
                    "Sidebar sorts work by topic",
                    "New work appears instantly",
                    "MCP servers can ask approval",
                    "Sidebar keeps your manual changes",
                    "Self-organizing Spaces sidebar",
                ],
                total: 7,
            },
            fixes: {
                items: [
                    "Reliable task and bot names",
                    "No freezes with many MCP tools",
                    "Failure switch menu stays current",
                ],
                total: 3,
            },
            kind: "list",
            releaseCount: 4,
        });
    });

    it("drops a stable release's repeats of its previews, keeping the first appearance", () => {
        const notes = project(PREVIEW_CATALOG, "0.4.102", "0.4.106");
        if (notes?.kind !== "list") throw new Error("expected a list");
        expect(notes.releaseCount).toBe(15);
        expect(notes.features.total).toBe(16);
        expect(notes.features.items).toEqual([
            "Sidebar sorts work by topic",
            "New work appears instantly",
            "Distractions fold out of sight",
            "Widgets in the sidebar",
            "Agent messages explain themselves",
        ]);
        expect(notes.fixes.total).toBe(12);
        expect(notes.fixes.items).toEqual([
            "Reliable task and bot names",
            "Sidebar edits no longer collide",
            "Hostile replies cannot freeze chat",
            "No freezes with many MCP tools",
            "No crash loop after downgrade",
        ]);
    });

    it("lists a fixes-only release with no features", () => {
        expect(project(PREVIEW_CATALOG, "0.4.105-preview.1", "0.4.105-preview.2")).toMatchObject({
            features: { items: [], total: 0 },
            fixes: { items: ["Updated bundled Bun runtime"], total: 1 },
        });
    });

    it("has no notes when no release in range has any", () => {
        expect(
            releaseNotesProject({
                files: new Map(),
                from: "0.4.106",
                range: ["0.4.107"],
                to: "0.4.107",
            }),
        ).toBeUndefined();
    });

    it("lists up to the threshold and points at the changelog past it", () => {
        const versions = (count: number) => Array.from({ length: count }, (_, i) => `1.0.${i}`);
        const files = new Map(
            versions(RELEASE_NOTES_OVERFLOW_THRESHOLD + 1).map((version) => [
                version,
                { features: [`Feature ${version}`], fixes: [], thanks: [] },
            ]),
        );
        const at = releaseNotesProject({
            files,
            from: "0.9.0",
            range: versions(RELEASE_NOTES_OVERFLOW_THRESHOLD),
            to: "1.0.0",
        });
        expect(at).toMatchObject({ kind: "list", releaseCount: 20 });
        const past = releaseNotesProject({
            files,
            from: "0.9.0",
            range: versions(RELEASE_NOTES_OVERFLOW_THRESHOLD + 1),
            to: "1.0.0",
        });
        expect(past).toEqual({
            changelogUrl: RELEASE_NOTES_CHANGELOG_URL,
            from: "0.9.0",
            kind: "overflow",
            releaseCount: 21,
            to: "1.0.0",
        });
    });
});

describe("desktopAgentReleaseNotesStoreCreate", () => {
    function daemonStore(initial: Partial<AppHappyAgentDaemonSnapshot>) {
        const listeners = new Set<() => void>();
        let snapshot: AppHappyAgentDaemonSnapshot = {
            install: { phase: "idle" },
            managed: true,
            operation: "idle",
            runtime: "ready",
            updateAvailable: false,
            versions: [],
            ...initial,
        };
        const store = {
            get: () => snapshot,
            subscribe(listener: () => void) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        } as unknown as AppHappyAgentDaemonStore;
        return {
            listeners,
            set(next: Partial<AppHappyAgentDaemonSnapshot>) {
                snapshot = { ...snapshot, ...next };
                for (const listener of listeners) listener();
            },
            store,
        };
    }
    const catalog = (versions: readonly string[]): AppHappyAgentDaemonVersion[] =>
        versions.map((version) => ({
            downloaded: false,
            prerelease: version.includes("-"),
            version,
        }));

    function fakeFetch(answers: Readonly<Record<string, string | number | Error>>) {
        const requested: string[] = [];
        const pending: (() => void)[] = [];
        const fetch = (url: string) => {
            requested.push(url);
            const version = /\/v([^/]+)\.md$/u.exec(url)![1]!;
            const answer = answers[version] ?? 404;
            return new Promise<Response>((resolve, reject) => {
                pending.push(() =>
                    answer instanceof Error
                        ? reject(answer)
                        : resolve(
                              typeof answer === "number"
                                  ? new Response("Not found", { status: answer })
                                  : new Response(answer),
                          ),
                );
            });
        };
        const settle = async () => {
            for (const resolve of pending.splice(0)) resolve();
            await new Promise((resolve) => setTimeout(resolve, 0));
        };
        return { fetch, requested, settle };
    }

    it("reads nothing until subscribed and publishes once every release has answered", async () => {
        const daemon = daemonStore({
            installedVersion: "0.4.102",
            readyVersion: "0.4.106",
            versions: catalog(STABLE_CATALOG),
        });
        const network = fakeFetch(FILES);
        const store = desktopAgentReleaseNotesStoreCreate({
            daemon: daemon.store,
            fetch: network.fetch,
        });
        expect(network.requested).toEqual([]);
        let notified = 0;
        const stop = store.subscribe(() => (notified += 1));
        expect(network.requested).toHaveLength(4);
        expect(store.get()).toBeUndefined();
        await network.settle();
        expect(store.get()).toMatchObject({ kind: "list", releaseCount: 4, to: "0.4.106" });
        expect(notified).toBe(1);
        // A daemon report that changes nothing about the range reads nothing again.
        daemon.set({ message: "Checked" });
        expect(network.requested).toHaveLength(4);
        expect(notified).toBe(1);
        stop();
        expect(daemon.listeners.size).toBe(0);
    });

    it("publishes no notes when every file is missing or unreadable", async () => {
        const daemon = daemonStore({
            installedVersion: "0.4.104",
            readyVersion: "0.4.106",
            versions: catalog(STABLE_CATALOG),
        });
        const network = fakeFetch({ "0.4.105": 500, "0.4.106": new Error("offline") });
        const store = desktopAgentReleaseNotesStoreCreate({
            daemon: daemon.store,
            fetch: network.fetch,
        });
        store.subscribe(() => undefined);
        await network.settle();
        expect(store.get()).toBeUndefined();
    });

    it("reads no files for a range past the threshold", () => {
        const versions = Array.from({ length: 30 }, (_, i) => `0.5.${29 - i}`);
        const daemon = daemonStore({
            installedVersion: "0.5.0",
            readyVersion: "0.5.29",
            versions: catalog(versions),
        });
        const network = fakeFetch({});
        const store = desktopAgentReleaseNotesStoreCreate({
            daemon: daemon.store,
            fetch: network.fetch,
        });
        store.subscribe(() => undefined);
        expect(network.requested).toEqual([]);
        expect(store.get()).toMatchObject({ kind: "overflow", releaseCount: 29 });
    });

    it("starts reading while the update is still downloading", () => {
        const daemon = daemonStore({
            availableVersion: "0.4.106",
            installedVersion: "0.4.105",
            operation: "downloading",
            updateAvailable: true,
            versions: catalog(STABLE_CATALOG),
        });
        const network = fakeFetch(FILES);
        const store = desktopAgentReleaseNotesStoreCreate({
            daemon: daemon.store,
            fetch: network.fetch,
        });
        store.subscribe(() => undefined);
        expect(network.requested).toEqual([releaseNotesUrl("0.4.106")]);
    });
});
