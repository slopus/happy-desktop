import { useState } from "react";
import {
    RichTaskList,
    type RichTaskCardModel,
    type RichTaskListRow,
    type RichTaskSubRowModel,
} from "../../src/RichTaskList";
import { ThemeScope } from "../../src/ThemeScope";
import { ioniconNames, type IoniconName } from "../../src/vectorIcons/VectorIcon";
import { ComponentPage, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-333";

const asset = (name: string) => new URL(`../assets/rich-tasks/${name}`, import.meta.url).href;
const PROJECTS: Readonly<Record<string, string>> = {
    agent: asset("proj-happy-agent.webp"),
    desktop: asset("proj-happy-desktop.webp"),
    ios: asset("proj-happy.webp"),
};

/*
 * The "Sidebar sub-rows" proposal's list, one row per line, columns split on
 * " | ". `#` heads a section (`#+` folded). A card is id, title, time, status,
 * icon and signal; its sub-rows follow, indented: id, mark (a project or
 * an Ionicon), label, then "+added -removed", "merged", or "working" and a
 * detail. `~` marks a sub-row the task hid, drawn only while its card is open.
 */
const TABLE = `
# priorities | Priorities
ui-demo | Telegram-style UI demo | now | Planning the work split | architecture | working
  layout | globe-outline | Sidebar sub-rows: layout proposal
  data-model | document-text-outline | data-model.ts
  spec-review | hardware-chip-outline | Spec review | working
onboarding | Onboarding redesign | 4m | Steve and Jordan replied to its story | ux | unread
  install | hardware-chip-outline | Agent install & sign-in | working | which provider first?
  round13 | agent | onboarding-round13 | +2783 -453
  round13-desktop | desktop | onboarding-round13-desktop | +1552 -558
  provider-install | agent | provider-install-signin | +987 -317
~ chat-onboarding | desktop | chat-onboarding | +1504 -554
~ walkthrough | play-outline | Onboarding walkthrough
~ design-review | hardware-chip-outline | Design review | working
ship-boss | SHIP BOSS | 1h | Needs your yes on 1ff04853 to fix preview links | deploy | unread
  readonly-status | agent | readonly-set-status | +53 -15
  happy-polish | desktop | new-happy-polish | merged
~ sidebar-dino | desktop | sidebar-dino | merged
~ onboarding-fallback | desktop | onboarding-fallback | merged
~ prioritizing-gym | agent | prioritizing-gym | merged
ios | iOS Redesign | 1h | Crash fix on main; next build on your ask | swift
~ ios-settings | ios | ios-settings | merged
~ ios-perf-gym | ios | ios-perf-gym | merged
~ ios-scroll | ios | ios-scroll | merged
~ ios-stories | ios | ios-stories | merged
~ ios-parity | ios | ios-parity | merged
~ order-gym | agent | workspace-order-gym | merged
sidebar | Side bar desktop | 17h | On main; release train cutting previews | cleanup
~ story-eval | agent | story-eval-recheck | merged
~ agent-stories | agent | agent-stories | merged
breakage | Onboarding breakage | 1h | Shipped: Agent 0.4.110-preview.14 | crash
~ takeover | hardware-chip-outline | Takeover check | working
~ socket | hardware-chip-outline | Linux socket cleanup | working
~ before-after | image-outline | before-after.png
# small-bugs | Small bugs
iphone | iPhone launch crashes | 1h | On main; iPhone build still needed | crash
  resume-socket | ios | iPhone resume socket fix | merged
diff-stats | Task diff stats | 48m | Needs your OK on the new row layout | code-review | unread
icons | Icon upscaling task | 20m | Upscaling the icon library | design-system | working
#+ side-quests | Side quests
dino | Sidebar dinosaur | 5h | Dinosaur runs on idle | home
#+ later | Later
`;

const FACES = {
    onboarding: [
        { id: "steve", label: "Steve", imageUrl: asset("steve.jpg") },
        { id: "jordan", label: "Jordan", tone: "mint" },
    ],
} as const;

const glyph = (name: string): IoniconName => {
    if (!(ioniconNames as readonly string[]).includes(name)) throw new Error(`No Ionicon ${name}`);
    return name as IoniconName;
};

/** A sub-row's last columns: line totals, "merged", or the working spinner and a detail. */
function trail(value = "", detail?: string): Partial<RichTaskSubRowModel> {
    const totals = /^\+(\d+) -(\d+)$/u.exec(value);
    if (totals) return { changes: { added: Number(totals[1]), removed: Number(totals[2]) } };
    if (value === "merged") return { changes: "merged" };
    return value === "working" ? { working: true, detail } : {};
}

type Section = Extract<RichTaskListRow, { kind: "section" }>;
type Card = RichTaskCardModel & { subRows: RichTaskSubRowModel[] };
const LIST: (Section | Card)[] = [];
for (const line of TABLE.trim().split("\n")) {
    const [head = "", ...rest] = line.split(" | ");
    const id = head.replace(/^[#+~ ]+/u, "");
    const card = LIST.at(-1);
    if (head.startsWith("#"))
        LIST.push({ kind: "section", id, name: rest[0]!, collapsed: head.startsWith("#+") });
    else if (/^[~ ] /u.test(head) && card && !("kind" in card)) {
        const [mark = "", label = "", value, detail] = rest;
        const src = PROJECTS[mark];
        card.subRows.push({
            id: `${card.id}/${id}`,
            mark: src ? { kind: "image", src } : { kind: "glyph", icon: glyph(mark) },
            label,
            ...trail(value, detail),
            ...(head.startsWith("~") ? { dimmed: true } : {}),
        });
    } else {
        const [title = "", time = "", status = "", icon = "", signal] = rest;
        LIST.push({
            id,
            title,
            time,
            status,
            iconSrc: asset(`icon-${icon}.png`),
            ...(id in FACES ? { story: { total: 2, unseen: 1 } } : {}),
            faces: FACES[id as keyof typeof FACES] ?? [],
            signal: signal === "working" || signal === "unread" ? signal : null,
            subRows: [],
            more: 0,
            expanded: false,
        });
    }
}

const toggled = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
};

/** The list as the reader sees it: folded sections, and three shown sub-rows per closed card. */
function Fixture(props: {
    readonly mode: "light" | "dark";
    readonly selection: "inset" | "full";
    readonly expanded?: readonly string[];
}) {
    const [selectedId, setSelectedId] = useState<string | null>("onboarding/install");
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(props.expanded));
    const [folded, setFolded] = useState<ReadonlySet<string>>(
        new Set(LIST.flatMap((row) => ("kind" in row && row.collapsed ? [row.id] : []))),
    );
    const rows: RichTaskListRow[] = [];
    let hidden = false;
    for (const row of LIST) {
        if ("kind" in row) {
            hidden = folded.has(row.id);
            rows.push({ ...row, collapsed: hidden });
        } else if (!hidden) {
            const open = expanded.has(row.id);
            const subRows = open
                ? row.subRows
                : row.subRows.filter((sub) => !sub.dimmed).slice(0, 3);
            const more = row.subRows.length - subRows.length;
            rows.push({ kind: "task", card: { ...row, subRows, more, expanded: open } });
        }
    }
    return (
        <ThemeScope mode={props.mode}>
            {/* The proposal's sidebar column: 304px with its hairline, on the sidebar's ground. */}
            <div
                className="rich-tasks-frame"
                style={{
                    width: 304,
                    padding: "0 0 10px",
                    borderRight: "1px solid var(--divider)",
                    background: "var(--groupped-background)",
                }}
            >
                <RichTaskList
                    onMoreToggle={(id) => setExpanded((current) => toggled(current, id))}
                    onSectionCollapseToggle={(id) => setFolded((current) => toggled(current, id))}
                    onSelect={setSelectedId}
                    rows={rows}
                    selectedId={selectedId}
                    selection={props.selection}
                    workingFrame={0}
                />
            </div>
        </ThemeScope>
    );
}

export function RichTasksPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Rich tasks: three-line cards with the story ring, two status lines and corner B (faces, dot, braille and +k more centred on the last line's x-height), sections, and each card's three most urgent sub-rows."
            title="Rich tasks"
        >
            <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
                <Specimen
                    detail="304px sidebar · inset selection"
                    label="Dark"
                    number="01"
                    stage="surface"
                >
                    <Fixture mode="dark" selection="inset" />
                </Specimen>
                <Specimen
                    detail="304px sidebar · inset selection"
                    label="Light"
                    number="02"
                    stage="surface"
                >
                    <Fixture mode="light" selection="inset" />
                </Specimen>
                <Specimen
                    detail="full-width selection · Onboarding redesign expanded"
                    label="Expanded"
                    number="03"
                    stage="surface"
                >
                    <Fixture expanded={["onboarding"]} mode="dark" selection="full" />
                </Specimen>
            </div>
        </ComponentPage>
    );
}
