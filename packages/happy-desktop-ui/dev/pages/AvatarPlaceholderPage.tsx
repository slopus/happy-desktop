import { Avatar, type AvatarSize } from "../../src/Avatar";
import {
    AVATAR_PLACEHOLDER_COUNT,
    avatarPlaceholderIndex,
} from "../../src/avatarShader/avatarShader";
import { Sidebar, type SidebarItem } from "../../src/Sidebar";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-335";

const SIZES: readonly { size: AvatarSize; dimension: number }[] = [
    { size: "xs", dimension: 20 },
    { size: "sm", dimension: 28 },
    { size: "md", dimension: 36 },
    { size: "lg", dimension: 44 },
];

/** A seed for every placeholder, found once, so the wall shows each of the 200 by its own pick. */
const WALL: readonly string[] = (() => {
    const seeds = Array.from<string | undefined>({ length: AVATAR_PLACEHOLDER_COUNT });
    let found = 0;
    for (let n = 0; found < AVATAR_PLACEHOLDER_COUNT; n += 1) {
        const seed = `placeholder-${n}`;
        const index = avatarPlaceholderIndex(seed);
        if (seeds[index] !== undefined) continue;
        seeds[index] = seed;
        found += 1;
    }
    return seeds as string[];
})();

const NAMES = [
    "Researcher",
    "Release captain",
    "Inbox triage",
    "Design reviewer",
    "Night shift",
    "Changelog",
    "Bug hunter",
    "Docs gardener",
];

const BOT_ITEMS: SidebarItem[] = [
    {
        id: "chief",
        kind: "project",
        label: "Happy",
        icon: "home",
        initials: "H",
    },
    ...NAMES.map(
        (label, index): SidebarItem => ({
            id: `bot-${index}`,
            kind: "project",
            label,
            initials: label.slice(0, 1),
            placeholderSeed: `bot-${index}`,
            ...(index === 2 ? { status: "working" as const } : {}),
            ...(index === 4 ? { unread: true } : {}),
        }),
    ),
];

const PROJECT_ITEMS: SidebarItem[] = [
    ...["happy-desktop", "happy-agent", "website"].map(
        (label): SidebarItem => ({
            id: `project-${label}`,
            kind: "project",
            label,
            initials: label.slice(0, 1).toUpperCase(),
            placeholderSeed: `project-${label}`,
        }),
    ),
    {
        id: "subtask",
        kind: "workspace",
        depth: 1,
        label: "Fix the release notes",
        contextAvatars: [
            {
                id: "project-website",
                label: "Project: website",
                initials: "W",
                placeholderSeed: "project-website",
            },
        ],
    },
];

export function AvatarPlaceholderPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The picture a person, bot, task, or project without one of its own wears: one of the 200 shader avatars from shaders.craftedstudios.co, picked by a hash of its ID exactly as the phone picks it, and drawn live by that package's shader. Every placeholder on the page shares one WebGL context and one compiled program, in a worker; only those on screen move, at most 32, at 20 frames a second, and nothing runs while the window is hidden. Reduced motion, or WebGL drawn in software, holds each on its first frame, the still the phone ships. Until that frame arrives a placeholder shows a gradient of its own colours."
            title="AvatarPlaceholder"
        >
            <Specimen
                detail="Avatar with placeholderSeed and no picture · circle for a person, rounded square for an agent · rows run at twice the package's speed, larger ones at one and a half"
                label="Sizes"
                number="01"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    {(["human", "agent"] as const).map((type) => (
                        <div
                            key={type}
                            style={{ display: "flex", alignItems: "flex-end", gap: "24px" }}
                        >
                            {SIZES.map((entry) => (
                                <div
                                    key={entry.size}
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: "10px",
                                    }}
                                >
                                    <Avatar
                                        initials="AI"
                                        placeholderSeed={`${type}-${entry.size}`}
                                        size={entry.size}
                                        type={type}
                                    />
                                    <DimensionRule label={`${type} ${entry.dimension}`} />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                detail="A picture or a glyph outranks the placeholder; the placeholder outranks initials"
                label="Precedence"
                number="02"
                stage="app"
            >
                <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                    <Avatar initials="IM" placeholderSeed="precedence" size="lg" type="agent" />
                    <Avatar
                        icon="home"
                        initials="HM"
                        placeholderSeed="precedence"
                        size="lg"
                        tone="brand"
                        type="agent"
                    />
                    <Avatar initials="IN" size="lg" type="agent" />
                </div>
            </Specimen>

            <Specimen
                detail="Bots and projects without pictures, and a subtask's project mark, as the sidebar draws them"
                label="In the sidebar"
                number="03"
                stage="chrome"
            >
                <div style={{ display: "flex", height: 600, width: 280 }}>
                    <Sidebar
                        activeItemId="bot-1"
                        onItemSelect={() => {}}
                        sections={[
                            { id: "bots", items: BOT_ITEMS, label: "Bots" },
                            { id: "projects", items: PROJECT_ITEMS, label: "Projects" },
                        ]}
                        title="Placeholders"
                    />
                </div>
            </Specimen>

            <Specimen
                detail="All 200, five effects of 40 in the site's order: linear, radial, thermal, topography, plasma · past 32 on screen the largest keep moving and the rest hold"
                label="The wall"
                number="04"
                stage="app"
            >
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", width: 20 * 36 - 8 }}>
                    {WALL.map((seed) => (
                        <Avatar
                            key={seed}
                            initials=""
                            placeholderSeed={seed}
                            size="sm"
                            type="agent"
                        />
                    ))}
                </div>
            </Specimen>
        </ComponentPage>
    );
}
