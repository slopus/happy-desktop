import { useState } from "react";
import {
    HAPPY_AGENT_VAULT_RETENTION_PRESETS,
    UserError,
    type HappyAgentSurfaceId,
    type HappyAgentVaultActivity,
    type HappyAgentVaultActor,
    type HappyAgentVaultContent,
    type HappyAgentVaultCrumb,
    type HappyAgentVaultFile,
    type HappyAgentVaultItem,
    type HappyAgentVaultItemId,
    type HappyAgentVaultHistory,
    type HappyAgentVaultPreview,
    type HappyAgentVaultSearchResult,
    type HappyAgentVaultSnapshot,
    type HappyAgentVaultUpload,
    type HappyAgentVaultVersion,
} from "happy-desktop-state";
import {
    HappyAgentVaultSurfacePage,
    type HappyAgentVaultSurfacePageProps,
} from "../../src/pages/surfaces/vault/HappyAgentVaultSurfacePage";
import { HappyAgentSurfaceCreateDialog } from "../../src/pages/surfaces/HappyAgentSurfaceCreateDialog";
import type { HappyAgentSurfaceView } from "../../src/pages/surfaces/surfacePresentation";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-032";

/*
 * Every fixture is fixed in time and place, so the page is screenshot-safe:
 * Berlin, on Wednesday 14 October 2026 at 10:40. Pictures are inline SVG, so
 * nothing is fetched.
 */
const ZONE = { locale: "en-GB", timeZone: "Europe/Berlin" };
const NOW = Date.UTC(2026, 9, 14, 8, 40);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SURFACE_ID = "surface-studio" as HappyAgentSurfaceId;

const STUDIO: HappyAgentSurfaceView = {
    name: "Studio",
    type: { kind: "vault" },
    creator: { name: "Steve Korshakov" },
    members: [
        { key: "u1", name: "Steve Korshakov" },
        { key: "u2", name: "Ada Park" },
        { key: "u3", name: "Grace Lin" },
    ],
};

const YOU: HappyAgentVaultActor = { userId: "u1", agentId: null };
const ADA: HappyAgentVaultActor = { userId: "u2", agentId: null };
const AGENT: HappyAgentVaultActor = { userId: "u1", agentId: "agent-research" };

/** A picture drawn inline: a sky, a hill, and a sun in the given hues. */
function picture(sky: string, hill: string, sun: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><rect width="480" height="320" fill="${sky}"/><circle cx="360" cy="96" r="44" fill="${sun}"/><path d="M0 240 Q120 150 240 220 T480 200 V320 H0 Z" fill="${hill}"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const PICTURES = [
    picture("#9ec9f0", "#3f7d4e", "#ffd25a"),
    picture("#f4b8a0", "#7a4f8c", "#fff1c1"),
    picture("#1f2a4d", "#2e3b60", "#f2f2f2"),
    picture("#cfe8d5", "#5d8f6b", "#f7a541"),
    picture("#ffe0b3", "#c0703a", "#ffffff"),
    picture("#b8d4ff", "#47668f", "#ffe680"),
];

const id = (value: string) => value as HappyAgentVaultItemId;

let clock = NOW;
/** Each fixture item was changed a little earlier than the one before it. */
function earlier(step: number): number {
    clock -= step;
    return clock;
}

function folder(
    itemId: string,
    name: string,
    parentId: string | null,
    updatedAt: number,
): HappyAgentVaultItem {
    return {
        kind: "folder",
        id: id(itemId),
        surfaceId: SURFACE_ID,
        parentId: parentId === null ? null : id(parentId),
        name,
        createdAt: updatedAt - 30 * DAY,
        createdBy: YOU,
        updatedAt,
        updatedBy: YOU,
        deletedAt: null,
        version: `r-${itemId}`,
    };
}

function file(
    itemId: string,
    name: string,
    parentId: string | null,
    size: number,
    mediaType: string,
    updatedAt: number,
    by: HappyAgentVaultActor = YOU,
    latestVersion = 1,
): HappyAgentVaultItem {
    return {
        kind: "file",
        id: id(itemId),
        surfaceId: SURFACE_ID,
        parentId: parentId === null ? null : id(parentId),
        name,
        createdAt: updatedAt - 10 * DAY,
        createdBy: by,
        updatedAt,
        updatedBy: by,
        deletedAt: null,
        version: `r-${itemId}`,
        latestVersion,
        size,
        sha256: `sha-${itemId}`,
        mediaType,
    };
}

function site(
    itemId: string,
    name: string,
    parentId: string | null,
    type: "html" | "markdown",
    updatedAt: number,
): HappyAgentVaultItem {
    return {
        kind: "artifact",
        id: id(itemId),
        surfaceId: SURFACE_ID,
        parentId: parentId === null ? null : id(parentId),
        name,
        createdAt: updatedAt - 5 * DAY,
        createdBy: AGENT,
        updatedAt,
        updatedBy: AGENT,
        deletedAt: null,
        version: `r-${itemId}`,
        latestVersion: 3,
        size: 48_213,
        artifact: {
            type,
            entry: type === "html" ? "index.html" : "index.md",
            fileCount: 4,
        },
    };
}

const ITEMS: readonly HappyAgentVaultItem[] = [
    folder("brand", "Brand", null, earlier(2 * HOUR)),
    folder("photos", "Photos", null, earlier(3 * HOUR)),
    folder("reports", "Reports", null, earlier(DAY)),
    folder("sites", "Sites", null, earlier(2 * DAY)),
    file("readme", "README.md", null, 2_310, "text/markdown", NOW - 25 * 60_000, ADA, 6),
    file("roadmap", "roadmap.txt", null, 1_204, "text/plain", earlier(HOUR), YOU, 4),
    file("budget", "budget.csv", null, 18_402, "text/csv", earlier(5 * DAY)),
    file("logo", "logo.png", null, 84_120, "image/png", earlier(6 * DAY), ADA),
    file(
        "deck",
        "Pitch deck final final.pptx",
        null,
        12_480_120,
        "application/octet-stream",
        earlier(9 * DAY),
    ),
    folder("q3", "Q3", "reports", earlier(HOUR)),
    file(
        "summary",
        "Q3 summary.pdf",
        "reports",
        1_245_002,
        "application/pdf",
        earlier(DAY),
        AGENT,
        2,
    ),
    file("notes", "notes.md", "reports", 4_100, "text/markdown", earlier(DAY)),
    file("revenue", "revenue.json", "q3", 3_410, "application/json", earlier(DAY)),
    site("launch", "launch.artifact", "sites", "html", earlier(DAY)),
    site("handbook", "handbook.artifact", "sites", "markdown", earlier(DAY)),
    file("palette", "palette.css", "brand", 2_048, "text/css", earlier(DAY)),
    file("wordmark", "wordmark.svg", "brand", 6_022, "image/svg+xml", earlier(DAY)),
    ...Array.from({ length: 64 }, (_, index) =>
        file(
            `photo-${String(index + 1)}`,
            `IMG_${String(4100 + index)}.jpg`,
            "photos",
            2_400_000 + index * 13_337,
            "image/jpeg",
            NOW - (index + 1) * 7 * HOUR,
            index % 3 === 0 ? ADA : YOU,
        ),
    ),
];

const THUMBNAILS = new Map(
    ITEMS.filter((entry) => entry.kind === "file" && entry.mediaType.startsWith("image/")).map(
        (entry, index) => [entry.id, PICTURES[index % PICTURES.length]!],
    ),
);

function childrenOf(items: readonly HappyAgentVaultItem[]) {
    const children = new Map<HappyAgentVaultItemId | null, HappyAgentVaultItem[]>();
    for (const entry of items) {
        const list = children.get(entry.parentId) ?? [];
        list.push(entry);
        children.set(entry.parentId, list);
    }
    for (const list of children.values())
        list.sort(
            (left, right) =>
                Number(right.kind === "folder") - Number(left.kind === "folder") ||
                left.name.localeCompare(right.name),
        );
    return children;
}

const CHILDREN = childrenOf(ITEMS);
const ITEM_MAP = new Map(ITEMS.map((entry) => [entry.id, entry]));
const item = (itemId: string) => ITEM_MAP.get(id(itemId))!;
const fileOf = (itemId: string): HappyAgentVaultFile => {
    const held = item(itemId);
    if (held.kind === "folder") throw new Error(`${itemId} is a folder.`);
    return held;
};

function crumbsOf(folderId: HappyAgentVaultItemId | null): HappyAgentVaultCrumb[] {
    const crumbs: HappyAgentVaultCrumb[] = [];
    for (let at = folderId; at !== null; at = ITEM_MAP.get(at)?.parentId ?? null)
        crumbs.unshift({ id: at, name: ITEM_MAP.get(at)!.name });
    return [{ id: null, name: "Vault" }, ...crumbs];
}

function pathOf(itemId: string): string {
    return `/${crumbsOf(id(itemId))
        .slice(1)
        .map((crumb) => crumb.name)
        .join("/")}`;
}

function vaultOf(
    folderId: string | null,
    overrides: Partial<HappyAgentVaultSnapshot> = {},
): HappyAgentVaultSnapshot {
    const folder = folderId === null ? null : id(folderId);
    return {
        surfaceId: SURFACE_ID,
        status: "ready",
        items: ITEM_MAP,
        children: CHILDREN,
        location: { kind: "folder", folderId: folder },
        crumbs: crumbsOf(folder),
        listing: CHILDREN.get(folder) ?? [],
        sort: { key: "name", order: "asc" },
        layout: "list",
        treeShown: true,
        treeExpanded: new Set(
            folder === null ? [] : crumbsOf(folder).flatMap((c) => (c.id ? [c.id] : [])),
        ),
        search: { query: "", answer: null },
        trash: { status: "loading" },
        uploads: [],
        settings: {
            status: "ready",
            retention: { ...HAPPY_AGENT_VAULT_RETENTION_PRESETS.timeMachine, trashDays: 30 },
        },
        people: new Map([
            ["u1", { name: "Steve Korshakov", photo: null }],
            ["u2", { name: "Ada Park", photo: null }],
        ]),
        agents: new Map([["agent-research", "Research agent"]]),
        ...overrides,
    };
}

const ROADMAP_TEXT = `Studio roadmap
==============

October
- Ship the vault browser on desktop
- Retention presets: Time Machine, Keep everything, Last 10
- Drag and drop between folders

November
- Mobile clients
- Share links to a file or a folder
`;

const VERSIONS: readonly HappyAgentVaultVersion[] = [4, 3, 2, 1].map((number) => ({
    fileId: id("roadmap"),
    number,
    size: 1_204 - (4 - number) * 180,
    sha256: `sha-roadmap-${String(number)}`,
    artifact: null,
    pinned: number === 2,
    restoredFrom: number === 3 ? 1 : null,
    createdAt: NOW - (4 - number) * 26 * HOUR - HOUR,
    actor: number === 4 ? YOU : number === 3 ? AGENT : ADA,
    source: number === 3 ? "tool" : "api",
}));

const activityFields = (n: number, actor: HappyAgentVaultActor) => ({
    id: `a-${String(n)}`,
    itemId: id("roadmap"),
    at: NOW - n * 13 * HOUR,
    actor,
    source: "api" as const,
});

const ACTIVITY: readonly HappyAgentVaultActivity[] = [
    { ...activityFields(1, YOU), kind: "version_created", number: 4, restoredFrom: null },
    { ...activityFields(2, ADA), kind: "pinned", number: 2 },
    {
        ...activityFields(3, YOU),
        kind: "moved",
        fromParentId: id("reports"),
        toParentId: null,
        fromName: "roadmap.txt",
        toName: "roadmap.txt",
    },
    { ...activityFields(4, AGENT), kind: "version_created", number: 3, restoredFrom: 1 },
    {
        ...activityFields(5, ADA),
        kind: "moved",
        fromParentId: id("reports"),
        toParentId: id("reports"),
        fromName: "plan.txt",
        toName: "roadmap.txt",
    },
    { ...activityFields(6, YOU), kind: "deleted" },
    { ...activityFields(7, YOU), kind: "restored", parentId: id("reports"), name: "plan.txt" },
    {
        ...activityFields(8, ADA),
        kind: "created",
        parentId: id("reports"),
        name: "plan.txt",
        copiedFrom: null,
    },
];

const HISTORY: HappyAgentVaultHistory = {
    status: "ready",
    versions: VERSIONS,
    activity: ACTIVITY,
    hasMore: true,
    loadingMore: false,
};

function previewOf(
    itemId: string,
    content: HappyAgentVaultContent,
    overrides: Partial<HappyAgentVaultPreview> = {},
): HappyAgentVaultPreview {
    const shown = item(itemId);
    return {
        itemId: id(itemId),
        ...(shown.kind === "folder" ? {} : { file: shown, versionShown: shown.latestVersion }),
        path: pathOf(itemId),
        inTrash: false,
        content,
        panel: "preview",
        history: itemId === "roadmap" ? HISTORY : { status: "loading" },
        ...overrides,
    };
}

const HANDBOOK_FILES = new Map([
    ["index.md", "data:text/markdown,"],
    ["images/team.svg", PICTURES[3]!],
]);

const HANDBOOK = `# Studio handbook

How the studio works, kept by the research agent and read by everyone.

![The team at the offsite](images/team.svg)

## Where things live

- **Brand** holds the logo, the palette, and the wordmark.
- **Reports** holds every quarter's summary.
- **Sites** holds the pages we publish.

Ask in the vault's chat when something is missing.
`;

const LAUNCH_HTML = `<!doctype html><html><head><style>
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: #1d1d1f; background: #fbfaf7; }
header { padding: 48px 32px; background: linear-gradient(135deg, #ffd25a, #f4b8a0); }
h1 { margin: 0 0 8px; font-size: 32px; }
main { padding: 24px 32px; }
.cards { display: flex; gap: 16px; }
.card { flex: 1; padding: 16px; border-radius: 12px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
</style></head><body><header><h1>Launch week</h1><p>Five days, five releases.</p></header>
<main><div class="cards"><div class="card"><strong>Monday</strong><p>Vaults</p></div><div class="card"><strong>Tuesday</strong><p>Retention</p></div><div class="card"><strong>Wednesday</strong><p>Search</p></div></div></main>
<script>document.body.dataset.ran = "yes";</script></body></html>`;

const SEARCH_RESULTS: readonly HappyAgentVaultSearchResult[] = [
    { match: "name", item: item("roadmap"), path: "/roadmap.txt" },
    { match: "name", item: item("reports"), path: "/Reports" },
    { match: "name", item: item("revenue"), path: "/Reports/Q3/revenue.json" },
    {
        match: "content",
        item: fileOf("notes"),
        path: "/Reports/notes.md",
        innerPath: null,
        line: 12,
        snippet: "Revenue grew 18% in Q3; the roadmap moves mobile clients to November.",
    },
    {
        match: "content",
        item: fileOf("handbook"),
        path: "/Sites/handbook.artifact",
        innerPath: "index.md",
        line: 9,
        snippet: "- **Reports** holds every quarter's summary and the roadmap for the next one.",
    },
    {
        match: "content",
        item: fileOf("readme"),
        path: "/README.md",
        innerPath: null,
        line: 3,
        snippet: "See roadmap.txt for what ships when.",
    },
];

const trashed = (source: HappyAgentVaultItem, deletedAt: number): HappyAgentVaultItem => ({
    ...source,
    deletedAt,
});

const TRASH_ITEMS = [
    { item: trashed(item("budget"), NOW - 2 * HOUR), path: "/budget.csv" },
    {
        item: trashed(folder("old", "Old drafts", "reports", NOW - 4 * DAY), NOW - DAY),
        path: "/Reports/Old drafts",
    },
    { item: trashed(item("palette"), NOW - 6 * DAY), path: "/Brand/palette.css" },
    { item: trashed(item("launch"), NOW - 12 * DAY), path: "/Sites/launch.artifact" },
];

const UPLOADS: readonly HappyAgentVaultUpload[] = [
    {
        id: "up-1",
        kind: "file",
        name: "storyboard.mov",
        folderId: null,
        size: 84_000_000,
        sent: 31_500_000,
        phase: "sending",
    },
    {
        id: "up-2",
        kind: "file",
        name: "IMG_5001.jpg",
        folderId: null,
        size: 3_100_000,
        sent: 0,
        phase: "waiting",
    },
    {
        id: "up-3",
        kind: "file",
        name: "contract.pdf",
        folderId: null,
        size: 412_000,
        sent: 412_000,
        phase: "placing",
    },
    {
        id: "up-4",
        kind: "file",
        name: "minutes.md",
        folderId: null,
        size: 2_200,
        sent: 2_200,
        phase: "done",
        itemId: id("notes"),
    },
    {
        id: "up-5",
        kind: "file",
        name: "raw-footage.zip",
        folderId: null,
        size: 920_000_000,
        sent: 120_000_000,
        phase: "failed",
        error: new UserError("The connection to the Happy Agent was lost."),
        retryable: true,
    },
    {
        id: "up-6",
        kind: "artifact",
        name: "launch.artifact",
        folderId: id("sites"),
        size: 1_840_000,
        sent: 1_840_000,
        phase: "placing",
    },
    {
        id: "up-7",
        kind: "artifact",
        name: "photos.artifact",
        folderId: null,
        size: 12_000_000,
        sent: 12_000_000,
        phase: "failed",
        error: new UserError("The artifact has no artifact.json at its root."),
        retryable: false,
    },
];

const noop = () => undefined;
const handlers: Omit<HappyAgentVaultSurfacePageProps, "surface" | "vault" | "now"> = {
    zone: ZONE,
    viewer: { userId: "u1" },
    thumbnailOf: (item) => THUMBNAILS.get(item.id),
    onItemDownload: () => Promise.resolve(),
    onFolderOpen: noop,
    onTrashShow: noop,
    onLayoutChange: noop,
    onSortChange: noop,
    onTreeShownChange: noop,
    onTreeFolderExpandedChange: noop,
    onItemSelect: noop,
    onItemOpen: noop,
    onPreviewClose: noop,
    onPreviewPanelChange: noop,
    onPreviewVersionSelect: noop,
    onHistoryMoreLoad: noop,
    onVersionRestore: noop,
    onVersionPinnedChange: noop,
    onSearchQueryChange: noop,
    onDialogOpen: noop,
    onDialogClose: noop,
    onFolderCreate: noop,
    onItemRename: noop,
    onItemMove: noop,
    onItemDelete: noop,
    onTrashRestore: noop,
    onFilesUpload: noop,
    onUploadRetry: noop,
    onUploadDismiss: noop,
    onRetentionChange: noop,
    onFailureDismiss: noop,
};

/** The page in a frame that holds its dialogs' fixed overlay, so each specimen keeps its own. */
function Page(props: { vault: HappyAgentVaultSnapshot }) {
    return (
        <div style={FRAME}>
            <HappyAgentVaultSurfacePage
                {...handlers}
                now={NOW}
                surface={STUDIO}
                vault={props.vault}
            />
        </div>
    );
}

const FRAME = {
    display: "flex",
    height: "100%",
    position: "relative",
    transform: "translateZ(0)",
    width: "100%",
} as const;

/**
 * The page with its own navigation live over the fixed fixtures: opening
 * folders, selecting, the layout and tree switches, and sorting redraw at once.
 */
function LivePage() {
    const [folderId, setFolderId] = useState<HappyAgentVaultItemId | null>(null);
    const [selectedId, setSelectedId] = useState<HappyAgentVaultItemId>();
    const [layout, setLayout] = useState<"list" | "grid">("list");
    const [treeShown, setTreeShown] = useState(true);
    const [expanded, setExpanded] = useState<ReadonlySet<HappyAgentVaultItemId>>(new Set());
    const [sort, setSort] = useState<HappyAgentVaultSnapshot["sort"]>({
        key: "name",
        order: "asc",
    });
    const base = vaultOf(folderId);
    const listing = [...base.listing].sort((left, right) => {
        const folders = Number(right.kind === "folder") - Number(left.kind === "folder");
        if (folders !== 0) return folders;
        const size = (item: HappyAgentVaultItem) => (item.kind === "folder" ? 0 : item.size);
        const by =
            sort.key === "name"
                ? left.name.localeCompare(right.name)
                : sort.key === "size"
                  ? size(left) - size(right)
                  : left.updatedAt - right.updatedAt;
        return sort.order === "asc" ? by : -by;
    });
    return (
        <HappyAgentVaultSurfacePage
            {...handlers}
            now={NOW}
            onItemOpen={(itemId) => {
                if (ITEM_MAP.get(itemId)?.kind === "folder") setFolderId(itemId);
            }}
            onItemSelect={setSelectedId}
            onFolderOpen={setFolderId}
            onLayoutChange={setLayout}
            onSortChange={setSort}
            onTreeFolderExpandedChange={(itemId, open) => {
                const next = new Set(expanded);
                if (open) next.add(itemId);
                else next.delete(itemId);
                setExpanded(next);
            }}
            onTreeShownChange={setTreeShown}
            surface={STUDIO}
            vault={{
                ...base,
                layout,
                listing,
                sort,
                treeExpanded: expanded,
                treeShown,
                ...(selectedId === undefined ? {} : { selectedId }),
            }}
        />
    );
}

const WINDOW = { width: 1100, height: 760 };

export function HappyAgentVaultBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="A shared vault Surface: a breadcrumb and the folder's contents as rows or tiles, a folder tree, search across names and text, the Trash, the preview of a file or site with its version history, uploads, and the vault's settings."
            title="HappyAgentVault"
        >
            <FullScreenSpecimen
                detail="The vault's root with the tree open, as a list of folders first, then files. Opening folders, selecting, sorting by a column heading, the layout switch, and the tree toggle are live here."
                label="Folder, list"
                number="01"
                screen="01-list-1100x760"
                window={WINDOW}
            >
                <LivePage />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Photos as tiles with their thumbnails, the tree hidden. Sixty-four pictures, of which only the rows on screen exist."
                label="Folder, grid"
                number="02"
                screen="02-grid-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf("photos", {
                        layout: "grid",
                        treeShown: false,
                        selectedId: id("photo-3"),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Reports › Q3 opened from the tree, which shows the open folders down to it."
                label="Tree"
                number="03"
                screen="03-tree-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf("q3", {
                        treeExpanded: new Set([id("reports"), id("q3"), id("sites")]),
                        selectedId: id("revenue"),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="“roadmap” found in three names, then in lines of text inside a file and a site, with more matches than were returned."
                label="Search"
                number="04"
                screen="04-search-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, {
                        search: {
                            query: "roadmap",
                            answer: { status: "ready", results: SEARCH_RESULTS, truncated: true },
                        },
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The Trash: what was deleted, where it was, and when, each with Restore. Its time limit comes from the vault's settings."
                label="Trash"
                number="05"
                screen="05-trash-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, {
                        location: { kind: "trash" },
                        crumbs: [{ id: null, name: "Vault" }],
                        trash: { status: "ready", items: TRASH_ITEMS },
                        selectedId: id("palette"),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A picture open beside its folder."
                label="Preview, image"
                number="06"
                screen="06-image-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, {
                        selectedId: id("logo"),
                        preview: previewOf("logo", { type: "url", url: PICTURES[0]! }),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A text file, numbered and highlighted, with its size and Download."
                label="Preview, text"
                number="07"
                screen="07-text-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, {
                        selectedId: id("roadmap"),
                        preview: previewOf("roadmap", { type: "text", text: ROADMAP_TEXT }),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A Markdown site, its picture resolved from the site's own files. Source is a click away."
                label="Preview, Markdown site"
                number="08"
                screen="08-markdown-site-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf("sites", {
                        selectedId: id("handbook"),
                        preview: previewOf("handbook", {
                            type: "markdownArtifact",
                            entryPath: "index.md",
                            text: HANDBOOK,
                            files: HANDBOOK_FILES,
                        }),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="An HTML site drawn from its own files where no page can run, with the note that its scripts are not run."
                label="Preview, static site"
                number="09"
                screen="09-static-site-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf("sites", {
                        selectedId: id("launch"),
                        preview: previewOf("launch", {
                            type: "htmlArtifact",
                            entryPath: "index.html",
                            page: {
                                kind: "static",
                                reason: { type: "no-guest" },
                                text: LAUNCH_HTML,
                                assets: new Map(),
                                omitted: [],
                            },
                            pageMode: "page",
                        }),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Version 2 of four picked in the history: the pane says so, with the way back to the newest."
                label="Older version"
                number="10"
                screen="10-older-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, {
                        selectedId: id("roadmap"),
                        preview: previewOf(
                            "roadmap",
                            { type: "text", text: ROADMAP_TEXT.split("\n").slice(0, 8).join("\n") },
                            { versionSelected: 2, versionShown: 2 },
                        ),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The file's versions, who made each and when, the pinned one, and one restored from an earlier; then what happened to it. Older records follow on request."
                label="History"
                number="11"
                screen="11-history-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, {
                        selectedId: id("roadmap"),
                        preview: previewOf(
                            "roadmap",
                            { type: "text", text: ROADMAP_TEXT },
                            { panel: "history" },
                        ),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Uploads in every phase: sending, waiting, finishing, done, and failed with Retry."
                label="Uploads"
                number="12"
                screen="12-uploads-1100x760"
                window={WINDOW}
            >
                <Page vault={vaultOf(null, { uploads: UPLOADS })} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A change the Happy Agent refused, until dismissed; and the quiet note while the vault is read again."
                label="Failure"
                number="13"
                screen="13-failure-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf("reports", {
                        failure: new UserError(
                            "“Q3 summary.pdf” could not be moved: Brand already has a file with that name.",
                        ),
                        error: new UserError("The Happy Agent did not answer."),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="New folder, over the folder it is made in."
                label="New folder"
                number="14"
                screen="14-folder-dialog-1100x760"
                window={WINDOW}
            >
                <Page vault={vaultOf("reports", { dialog: { kind: "folderCreate" } })} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Renaming a file, its current name filled in."
                label="Rename"
                number="15"
                screen="15-rename-dialog-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, {
                        selectedId: id("roadmap"),
                        dialog: { kind: "rename", itemId: id("roadmap"), name: "roadmap.txt" },
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Renaming an artifact without its .artifact suffix: the field says why, and Rename waits."
                label="Rename artifact"
                number="15b"
                screen="15b-rename-artifact-dialog-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf("sites", {
                        selectedId: id("launch"),
                        dialog: { kind: "rename", itemId: id("launch"), name: "launch" },
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The vault's settings on the default Time Machine policy. Choosing Custom opens the rules; the Trash keeps items for 30 days."
                label="Settings"
                number="16"
                screen="16-settings-1100x760"
                window={WINDOW}
            >
                <Page vault={vaultOf(null, { dialog: { kind: "settings" } })} />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A custom policy: every version for 3 days, one a day after 3 days, one a week after 60, at most 50 versions; the Trash keeps items for 14 days."
                label="Settings, custom"
                number="17"
                screen="17-settings-custom-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, {
                        dialog: { kind: "settings" },
                        settings: {
                            status: "ready",
                            retention: {
                                maxVersions: 50,
                                maxAgeDays: null,
                                keepAllDays: 3,
                                thinning: [
                                    { afterDays: 3, everyDays: 1 },
                                    { afterDays: 60, everyDays: 7 },
                                ],
                                trashDays: 14,
                            },
                        },
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="Before the tree has been read once."
                label="Loading"
                number="18"
                screen="18-loading-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, {
                        status: "loading",
                        items: new Map(),
                        children: new Map(),
                        listing: [],
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="A vault just made: nothing in it yet."
                label="Empty vault"
                number="19"
                screen="19-empty-1100x760"
                window={WINDOW}
            >
                <Page
                    vault={vaultOf(null, { items: new Map(), children: new Map(), listing: [] })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="At the minimum window: the tree, the listing, and a preview share it; the narrow listing drops its Kind column."
                label="Minimum window"
                number="20"
                screen="20-preview-720x640"
                window={{ width: 720, height: 640 }}
            >
                <Page
                    vault={vaultOf(null, {
                        selectedId: id("logo"),
                        preview: previewOf("logo", { type: "url", url: PICTURES[0]! }),
                    })}
                />
            </FullScreenSpecimen>

            <FullScreenSpecimen
                detail="The Happy Agent has no such vault."
                label="Missing"
                number="21"
                screen="21-missing-720x640"
                window={{ width: 720, height: 640 }}
            >
                <Page vault={vaultOf(null, { status: "missing" })} />
            </FullScreenSpecimen>

            <Specimen
                detail="The + menu’s New vault: a name and, if wanted, a picture. Shown in a window-sized frame, which holds the dialog’s fixed overlay."
                label="New vault"
                number="22"
            >
                <div
                    style={{
                        background: "var(--groupped-background)",
                        height: "480px",
                        overflow: "hidden",
                        position: "relative",
                        transform: "translateZ(0)",
                        width: "720px",
                    }}
                >
                    <HappyAgentSurfaceCreateDialog kind="vault" onClose={noop} onSubmit={noop} />
                </div>
            </Specimen>
        </ComponentPage>
    );
}
