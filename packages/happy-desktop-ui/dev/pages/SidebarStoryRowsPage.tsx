import { useState, type ComponentProps } from "react";
import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { clayIconMark, happyIconMark, type ClayIconSlug } from "../../src/clayIcons";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen } from "../kit";

export const componentNumber = "C-009b";

/** A project's picture, as the daemon hands one over: a square image. */
const projectPicture = (from: string, to: string, letter: string) =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="40" height="40" fill="url(#g)"/><text x="20" y="27" font-family="-apple-system,Helvetica,Arial" font-size="20" font-weight="600" fill="#fff" text-anchor="middle">${letter}</text></svg>`,
    )}`;
const DESKTOP = projectPicture("#6d5dfc", "#b26cf6", "D");
const AGENT = projectPicture("#0f9d7a", "#4cc38a", "A");

const top = (
    id: string,
    label: string,
    slug: ClayIconSlug,
    story: SidebarItem["story"],
    extra: Partial<SidebarItem> = {},
): SidebarItem => ({
    id,
    kind: "project",
    label,
    imageMark: clayIconMark(slug),
    ...extra,
    story,
});

/** A row nested under another, as the window draws it: one compact line. */
const nested = (
    id: string,
    label: string,
    depth: number,
    extra: Partial<SidebarItem> = {},
): SidebarItem => ({
    id,
    kind: "agent",
    label,
    depth,
    // The project's picture, initials or home glyph; else the agent glyph.
    ...((extra.imageUrl ?? extra.initials ?? extra.icon) ? {} : { icon: "agents" as const }),
    story: {},
    ...extra,
});

const list: SidebarItem[] = [
    {
        id: "happy",
        kind: "project",
        label: "Happy",
        imageMark: happyIconMark(),
        story: {
            subtitle: "Both Pool previews are out, and the onboarding helpers only look around",
            time: "now",
            ring: { total: 3, unseen: 0 },
        },
    },
    top("polish", "Sidebar polish", "wip", {
        changeStats: { added: 1284, deleted: 312 },
        subtitle: "Porting the chosen row into the stem-cell sidebar, then the shift check",
        time: "now",
        signal: "working",
        ring: { total: 3, unseen: 2 },
    }),
    top("signing", "Windows signing", "pull-request", {
        subtitle: "Ready for your review: the installer is signed and notarized",
        time: "5m",
        signal: "unread",
    }),
    top("release", "Desktop release 0.42", "project-kickoff", {
        subtitle: "Shipped to preview; production waits on the crash triage",
        draft: "Let's hold production until Steve has tried the preview on Windows and the crash",
        time: "2h",
    }),
    top("cleanup", "Composer cleanup", "cleanup", {
        changeStats: { added: 42, deleted: 9 },
        time: "Tue",
        signal: "working",
    }),
    top("new", "Topic icon expansion", "design-system", { time: "10/12" }),
];

const tree: SidebarItem[] = [
    top(
        "release",
        "Desktop release 0.42",
        "project-kickoff",
        {
            subtitle: "Coordinating the signing and the release notes",
            time: "2m",
            signal: "working",
        },
        { collapsed: false },
    ),
    nested("signing", "Windows signing", 1, {
        imageUrl: DESKTOP,
        collapsed: false,
        changeStats: { added: 120, deleted: 8 },
        story: { signal: "working" },
    }),
    nested("verify", "Verify the signature", 2, {
        imageUrl: DESKTOP,
        changeStats: { added: 14, deleted: 3 },
        story: { signal: "unread" },
    }),
    // A project without a picture is named by its initials.
    nested("notary", "Notary log reader", 2, { initials: "N" }),
    nested("notes", "Release notes", 1, {
        imageUrl: AGENT,
        changeStats: { added: 42, deleted: 0 },
        story: { signal: "unread" },
    }),
    // The home project wears its glyph; work in no project, the agent glyph.
    nested("home", "Tidy the downloads folder", 1, { icon: "home" }),
    nested("check", "Crash report triage", 1, { story: { signal: "working" } }),
    top("polish", "Sidebar polish", "wip", {
        subtitle: "Waiting on review",
        time: "1h",
    }),
    top("cleanup", "Composer cleanup", "cleanup", { subtitle: "On main", time: "Mon" }),
];

const headers: SidebarItem[] = [
    {
        id: "desktop",
        kind: "section",
        label: "Desktop",
        collapsed: false,
        action: { icon: "plus", label: "New work in Desktop" },
    },
    top("polish", "Sidebar polish", "wip", { subtitle: "On main", time: "Tue" }),
    top("signing", "Windows signing", "pull-request", {
        subtitle: "Ready for your review",
        time: "Mon",
        signal: "unread",
    }),
    {
        id: "finished",
        kind: "section",
        label: "Finished",
        collapsed: true,
        action: { icon: "plus", label: "New work in Finished" },
    },
    top("hidden", "Hidden work", "wip", {}),
];

const LONG_TITLE =
    "Investigate why the Windows installer loses its signature after notarization on the release branch builds only";
const LONG_STATUS =
    "Rebuilt the installer twice; the signature survives locally but the notary service strips it, so I am comparing the two manifests line by line";

const narrow: SidebarItem[] = [
    top("long", LONG_TITLE, "pull-request", {
        subtitle: LONG_STATUS,
        time: "10/12",
        signal: "unread",
    }),
    top(
        "tree",
        "Desktop release 0.42",
        "project-kickoff",
        { subtitle: LONG_STATUS, time: "now", signal: "working" },
        { collapsed: false },
    ),
    nested("long-child", LONG_TITLE, 1, {
        imageUrl: DESKTOP,
        changeStats: { added: 12840, deleted: 977 },
        story: { signal: "unread" },
    }),
    nested("short-child", "Release notes", 1, {
        imageUrl: AGENT,
        changeStats: { added: 42, deleted: 3 },
        story: { signal: "working" },
    }),
    top("short", "Composer cleanup", "cleanup", { subtitle: "On main", time: "Tue" }),
];

const scenes = { list, tree, headers } as const;

/** The sidebar as a window holds it: a click selects the row. */
function SelectingSidebar(
    props: Omit<ComponentProps<typeof Sidebar>, "activeItemId" | "onItemSelect">,
) {
    const [active, setActive] = useState("signing");
    return <Sidebar {...props} activeItemId={active} onItemSelect={setActive} />;
}

export function SidebarStoryRowsPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Sidebar story rows"
            summary="Telegram-measured 64px chat cards: title and time, then the lines the work changed and up to two status lines, a draft on the last line, a resting dinosaur when there is nothing to say, and one corner signal; compact nested rows with deltas; section headings."
        >
            {[
                { width: 1100, height: 760 },
                { width: 720, height: 640 },
            ].flatMap((window) =>
                (Object.keys(scenes) as (keyof typeof scenes)[]).map((scene, index) => (
                    <FullScreenSpecimen
                        key={`${window.width}-${scene}`}
                        number={String(index + 1).padStart(2, "0")}
                        label={scene}
                        detail="Light and dark · actual sidebar components"
                        screen={`${String(index + 1).padStart(2, "0")}-${scene}-${window.width}x${window.height}`}
                        window={window}
                    >
                        <div style={{ display: "flex", height: "100%", gap: 24, padding: 24 }}>
                            {(["light", "dark"] as const).map((mode) => (
                                <ThemeScope key={mode} mode={mode}>
                                    <SelectingSidebar
                                        style={{ width: 320 }}
                                        foldControlPlacement="trailing"
                                        foldControlReveal="hover"
                                        itemFoldControls={false}
                                        onItemAction={() => {}}
                                        onItemCollapseToggle={() => {}}
                                        onSectionAction={() => {}}
                                        onSectionCollapseToggle={() => {}}
                                        sections={[
                                            {
                                                id: "work",
                                                label: "Work",
                                                collapsed: false,
                                                action: { icon: "plus", label: "New work" },
                                                items: scenes[scene],
                                            },
                                            {
                                                id: "older",
                                                label: "Older",
                                                collapsed: true,
                                                action: { icon: "plus", label: "New older work" },
                                                items: [
                                                    {
                                                        id: "old",
                                                        kind: "agent",
                                                        label: "Archived",
                                                        story: {},
                                                    },
                                                ],
                                            },
                                        ]}
                                    />
                                </ThemeScope>
                            ))}
                        </div>
                    </FullScreenSpecimen>
                )),
            )}
            <FullScreenSpecimen
                number="04"
                label="narrow"
                detail="A 240px sidebar: long names, statuses and deltas end in an ellipsis"
                screen="04-narrow-720x640"
                window={{ width: 720, height: 640 }}
            >
                <div style={{ display: "flex", height: "100%", gap: 24, padding: 24 }}>
                    {(["light", "dark"] as const).map((mode) => (
                        <ThemeScope key={mode} mode={mode}>
                            <Sidebar
                                style={{ width: 240 }}
                                activeItemId=""
                                itemFoldControls={false}
                                onItemSelect={() => {}}
                                sections={[{ id: "work", items: narrow }]}
                            />
                        </ThemeScope>
                    ))}
                </div>
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
