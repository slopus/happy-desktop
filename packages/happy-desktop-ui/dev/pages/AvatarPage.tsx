import { Avatar, type AvatarSize, type AvatarTint, type ToneName } from "../../src/Avatar";
import type { IconName } from "../../src/Icon";
import { happyLogoBlackUrl } from "../../src/assets";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-004";
const FIXTURE_IMAGE =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPorvk+ufrTrOp3i6perqx8srHiwY6K2wfKrzNgFT1edokBq+j5srMMWEWvlZ5kwCp6r+QIA1bRp8X7GbCKvi3ezYBV9EvRNgD7aoNVazUeBQAAAABJRU5ErkJggg==";
const SIZES: Array<{
    dimension: number;
    initials: string;
    size: AvatarSize;
}> = [
    { size: "xs", dimension: 20, initials: "MJ" },
    { size: "sm", dimension: 28, initials: "SK" },
    { size: "md", dimension: 36, initials: "ST" },
    { size: "lg", dimension: 44, initials: "AR" },
];
const TONES: ToneName[] = ["violet", "ember", "mint", "ocean", "rose", "amber", "slate", "brand"];
/** Each tile hue on the glyph the sidebar gives it. */
const TINTS: ReadonlyArray<{ tint: AvatarTint; icon: IconName }> = [
    { tint: "blue", icon: "doc" },
    { tint: "green", icon: "tasks" },
    { tint: "orange", icon: "tasks" },
    { tint: "indigo", icon: "agents" },
    { tint: "purple", icon: "doc" },
    { tint: "red", icon: "calendar" },
    { tint: "teal", icon: "pulse" },
];
const row: Record<string, string> = {
    display: "flex",
    alignItems: "flex-end",
    gap: "24px",
};
const cell: Record<string, string> = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
};
export function AvatarPage() {
    return (
        <ComponentPage
            number={componentNumber}
            title="Avatar"
            summary="Identity mark for humans (circle) and agents (rounded square) with tone gradients, presence, and image variant."
        >
            <Specimen
                number="01"
                label="Human sizes"
                detail="Circle · 20 / 28 / 36 / 44 · initials 8 / 10 / 12 / 14 px, 700"
                stage="app"
            >
                <div style={row}>
                    {SIZES.map((entry) => (
                        <div key={entry.size} style={cell}>
                            <Avatar initials={entry.initials} size={entry.size} tone="violet" />
                            <DimensionRule label={`${entry.dimension}`} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                number="01A"
                label="Initials calibration"
                detail="Shared cap baseline · O is the balanced optical reference · content-shaped centroids remain distinct"
                stage="app"
            >
                <div style={row}>
                    {["O", "ST", "MJ", "AI", "A"].map((initials) => (
                        <Avatar
                            key={initials}
                            initials={initials}
                            size="md"
                            tone={initials === "O" ? "ocean" : "slate"}
                        />
                    ))}
                </div>
            </Specimen>

            <Specimen
                number="02"
                label="Agent sizes"
                detail="Rounded square · radius 6 / 7 / 9 / 10 by size"
                stage="app"
            >
                <div style={row}>
                    {SIZES.map((entry) => (
                        <div key={entry.size} style={cell}>
                            <Avatar initials="AI" size={entry.size} tone="mint" type="agent" />
                            <DimensionRule label={`${entry.dimension}`} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                number="03"
                label="Tone gradients"
                detail="Theme identity tones · default slate"
                stage="app"
            >
                <div style={row}>
                    {TONES.map((tone) => (
                        <div key={tone} style={cell}>
                            <Avatar
                                initials={tone.slice(0, 2).toUpperCase()}
                                size="md"
                                tone={tone}
                            />
                            <DimensionRule label={tone} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                number="03A"
                label="Tinted glyph tiles"
                detail="A glyph in its hue on the same hue very light, as the phone's home rows draw them · 20 and 36"
                stage="app"
            >
                <div style={row}>
                    {TINTS.map((entry) => (
                        <div key={entry.tint} style={cell}>
                            <Avatar
                                icon={entry.icon}
                                initials=""
                                size="xs"
                                tint={entry.tint}
                                type="agent"
                            />
                            <Avatar
                                icon={entry.icon}
                                initials=""
                                size="md"
                                tint={entry.tint}
                                type="agent"
                            />
                            <DimensionRule label={entry.tint} />
                        </div>
                    ))}
                </div>
            </Specimen>

            <Specimen
                number="04"
                label="Presence"
                detail="Online dot 8px (10px on lg) · 2px app-colored ring · −1px overhang"
                stage="app"
            >
                <div style={row}>
                    {SIZES.map((entry) => (
                        <div key={entry.size} style={cell}>
                            <Avatar
                                initials={entry.initials}
                                size={entry.size}
                                tone="ocean"
                                online
                            />
                            <DimensionRule label={entry.size} />
                        </div>
                    ))}
                    <div style={cell}>
                        <Avatar initials="AI" size="md" tone="rose" type="agent" online />
                        <DimensionRule label="agent" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                number="05"
                label="Image variant"
                detail="Portrait images cover the box and inherit its radius · the Happy brand mark has no avatar rounding and keeps 1px internal padding"
                stage="app"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div style={row}>
                        {SIZES.map((entry) => (
                            <div key={entry.size} style={cell}>
                                <Avatar
                                    imageUrl={FIXTURE_IMAGE}
                                    initials={entry.initials}
                                    size={entry.size}
                                    online={entry.size === "md"}
                                />
                                <DimensionRule label={entry.size} />
                            </div>
                        ))}
                        <div style={cell}>
                            <Avatar imageUrl={FIXTURE_IMAGE} initials="AI" size="lg" type="agent" />
                            <DimensionRule label="agent lg" />
                        </div>
                    </div>
                    <div style={row}>
                        {SIZES.map((entry) => (
                            <div key={entry.size} style={cell}>
                                <Avatar
                                    imageTheme="brand"
                                    imageUrl={happyLogoBlackUrl}
                                    initials="H"
                                    size={entry.size}
                                    type="agent"
                                />
                                <DimensionRule label={`brand ${entry.size}`} />
                            </div>
                        ))}
                    </div>
                </div>
            </Specimen>

            <Specimen
                number="05A"
                label="Glyph variant"
                detail="Glyph 12 / 16 / 18 / 20 replaces initials for a place, not a person"
                stage="app"
            >
                <div style={row}>
                    {SIZES.map((entry) => (
                        <div key={entry.size} style={cell}>
                            <Avatar
                                icon="home"
                                initials={entry.initials}
                                size={entry.size}
                                tone="brand"
                                type="agent"
                            />
                            <DimensionRule label={entry.size} />
                        </div>
                    ))}
                    <div style={cell}>
                        <Avatar
                            icon="home"
                            imageUrl={FIXTURE_IMAGE}
                            initials="HM"
                            size="lg"
                            type="agent"
                        />
                        <DimensionRule label="image wins" />
                    </div>
                </div>
            </Specimen>

            <Specimen
                number="06"
                label="In context"
                detail="Facepile overlap −6px with chrome ring · humans and agents mixed"
                stage="chrome"
            >
                <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
                    <div style={{ display: "flex" }}>
                        {[
                            { initials: "MJ", tone: "ember" as ToneName },
                            { initials: "SK", tone: "violet" as ToneName },
                            { initials: "AR", tone: "ocean" as ToneName },
                        ].map((member, index) => (
                            <Avatar
                                key={member.initials}
                                initials={member.initials}
                                size="xs"
                                tone={member.tone}
                                style={{
                                    marginLeft: index === 0 ? "0" : "-6px",
                                    boxShadow: "0 0 0 2px var(--header-background)",
                                }}
                            />
                        ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Avatar initials="CX" size="xs" tone="brand" type="agent" online />
                        <span
                            style={{
                                color: "var(--text-secondary)",
                                font: "500 13px/16px var(--happy-font-ui)",
                            }}
                        >
                            Codex
                        </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Avatar initials="MJ" size="sm" tone="ember" online />
                        <span
                            style={{
                                color: "var(--text-secondary)",
                                font: "500 13px/16px var(--happy-font-ui)",
                            }}
                        >
                            Maya Johnson
                        </span>
                    </div>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
