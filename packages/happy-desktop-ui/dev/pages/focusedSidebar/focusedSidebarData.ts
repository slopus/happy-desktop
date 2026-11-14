import type { SidebarFace } from "../../../src/FocusedSidebar";
import type { LiveFeedItem } from "../../../src/LiveFeed";
import type { HappyAgentFeedActor } from "../../../src/pages/feed/feedPresentation";

/*
 * The focused sidebar prototype's content: this installation's real bots,
 * tasks, Surfaces and artifacts as of 14 Nov 2026, read through list_bots,
 * list_teammates, list_surfaces, list_artifacts and the tasks' own histories.
 * The reader is Kirill; the teammate is Steve.
 *
 * What is real: every name, ID, artifact title and quoted line. What is
 * inferred, and said so in the write-up: which bots count as background bots
 * that may doze (the server has no such flag), a task's name where no Surface
 * names it (taken from its artifacts), who started a task, each row's unread,
 * working and needs-input state, and every time of day.
 */

const asset = (name: string) => new URL(`../../assets/live-feed/${name}`, import.meta.url).href;

export const KIRILL_ID = "ppvlf3ttno2lgzczrm5sjg9i";
export const STEVE_ID = "eyjiodabnhnh5nyzrpzc6aml";

const kirillFace: SidebarFace = { initials: "KD", imageUrl: asset("kirill.webp") };
const steveFace: SidebarFace = { initials: "SK", imageUrl: asset("steve.webp") };

export const steve: HappyAgentFeedActor = {
    key: `user-${STEVE_ID}`,
    name: "Steve",
    face: { type: "human", initials: "SK", imageUrl: asset("steve.webp") },
};

/** An agent at work, named by the task it works in. */
function agentOf(id: string, name: string): HappyAgentFeedActor {
    return { key: `agent-${id}`, name, face: { type: "agent", initials: "", placeholderSeed: id } };
}

/* ---- Bots ---------------------------------------------------------------- */

export interface DemoBot {
    /** The bot's real ID, which also picks its placeholder face, as the app does. */
    readonly id: string;
    readonly name: string;
    /**
     * A background bot: it watches something and mostly has nothing to say, so
     * it may doze. Inferred from its name and Kirill's brief; a conversational
     * bot never dozes by itself.
     */
    readonly background: boolean;
    readonly asleep: boolean;
    readonly working?: boolean;
    readonly unread?: boolean;
}

export const DEMO_BOTS: readonly DemoBot[] = [
    { id: "l8mtl8njqs8f5xpv6d94xtw5", name: "Chief of Staff", background: false, asleep: false },
    { id: "amty15w9316ji9toigrvk92e", name: "Roadmap", background: false, asleep: false },
    {
        id: "a8ox24ug2o5jpwct17zkyhrl",
        name: "Growth Hacking",
        background: false,
        asleep: false,
        unread: true,
    },
    { id: "mfuigngqiofvlcxmyos7n9aj", name: "Launch Plan", background: false, asleep: false },
    {
        id: "gmwcwe4h63rqs5rt4bpby0cs",
        name: "Desktop & Agent Releases",
        background: true,
        asleep: false,
        working: true,
    },
    { id: "smvogq2ds0qwen307vijeg90", name: "Disk Sweeper", background: true, asleep: true },
    { id: "uzqhssr8qd5j2e053jbfxieu", name: "Product Health", background: true, asleep: true },
    {
        id: "vmvxeivm610nps12o1lanwe7",
        name: "Digital Ocean Watcher",
        background: true,
        asleep: true,
    },
    { id: "o87dour4wln3kyijy6l2as7q", name: "Mobile Releases", background: true, asleep: true },
    {
        id: "githubcomm30302f56dc397caa",
        name: "GitHub Communications",
        background: true,
        asleep: true,
    },
    { id: "gsc2be55b11a817a1e75600", name: "Marketing Website", background: true, asleep: true },
];

/** The bot the demo sends to sleep, and the one it wakes. */
export const DOZING_BOT = "gmwcwe4h63rqs5rt4bpby0cs";
export const WAKING_BOT = "smvogq2ds0qwen307vijeg90";

export function botFace(bot: Pick<DemoBot, "id" | "name">): SidebarFace {
    return { initials: bot.name.slice(0, 1), placeholderSeed: bot.id };
}

/* ---- Tasks --------------------------------------------------------------- */

export type DemoTaskActivity = "idle" | "working" | "awaitingInput";

export interface DemoTask {
    readonly id: string;
    readonly name: string;
    /** Whose task it is: the reader's own, or a teammate's the reader follows. */
    readonly owner: "kirill" | "steve";
    readonly priority: boolean;
    readonly activity: DemoTaskActivity;
    readonly unread?: boolean;
}

/** The reader's own order, as a drag would leave it. Sorting keeps it within each band. */
export const DEMO_TASKS: readonly DemoTask[] = [
    {
        id: "wmw24z24z1kra9thv75pcswb",
        name: "New iteration of stories / feed",
        owner: "kirill",
        priority: true,
        activity: "working",
    },
    {
        id: "mmwcvrm393g4por2aqu5pw2v",
        name: "Tailcat Connection and Sync Benchmarking",
        owner: "kirill",
        priority: true,
        activity: "awaitingInput",
        unread: true,
    },
    {
        id: "imw1gxm6l219edvoidnd75jy",
        name: "Windows preview builds",
        owner: "kirill",
        priority: false,
        activity: "working",
    },
    {
        id: "emwepvc1k0vm7q59sev9s8rn",
        name: "Happy Gateway: one sign-in",
        owner: "kirill",
        priority: true,
        activity: "idle",
    },
    {
        id: "cmwei604u714273sdytyz3me",
        name: "Happy Desktop open PR triage",
        owner: "kirill",
        priority: false,
        activity: "awaitingInput",
    },
    {
        id: "lmw7koqat320uxi3eyepadn4",
        name: "Encrypted mobile pairing links",
        owner: "steve",
        priority: false,
        activity: "idle",
    },
    {
        id: "gmwczbhz711i7bodmphov39d",
        name: "Happy-agent host slowness",
        owner: "kirill",
        priority: false,
        activity: "idle",
    },
];

/** A teammate's task the reader does not follow yet: Follow on its feed line brings it in. */
export const FOLLOWABLE_TASKS: readonly DemoTask[] = [
    {
        id: "ymwe8r65t0rc52wid0ff6luw",
        name: "HappyUI component library",
        owner: "steve",
        priority: false,
        activity: "working",
    },
    {
        id: "jbwqez4dww6l7zgqd94816z1",
        name: "Happy Cloud",
        owner: "steve",
        priority: false,
        activity: "idle",
    },
];

export function taskFace(task: Pick<DemoTask, "owner">): SidebarFace {
    return task.owner === "kirill" ? kirillFace : steveFace;
}

/* ---- Pins ---------------------------------------------------------------- */

export type DemoPinKind = "bot" | "task" | "surface" | "artifact" | "project" | "place";

export interface DemoPin {
    readonly id: string;
    readonly kind: DemoPinKind;
    readonly label: string;
    readonly face: SidebarFace;
    /** A todo list's open todos, as its row counts them today. */
    readonly count?: number;
    readonly badge?: number;
    readonly unread?: boolean;
}

export const PIN_ARTIFACTS = "place:artifacts";
export const PIN_INBOX = "place:inbox";

/**
 * What the reader pinned, in their order. The first few are tiles where a
 * version has tiles. A pinned bot or task leaves its section: nothing is
 * listed twice.
 */
export const DEMO_PINS: readonly DemoPin[] = [
    {
        id: "bot:l8mtl8njqs8f5xpv6d94xtw5",
        kind: "bot",
        label: "Chief of Staff",
        face: { initials: "C", placeholderSeed: "l8mtl8njqs8f5xpv6d94xtw5" },
    },
    {
        id: PIN_INBOX,
        kind: "place",
        label: "Inbox",
        face: { initials: "I", icon: "bell", tint: "orange" },
        badge: 2,
    },
    {
        id: PIN_ARTIFACTS,
        kind: "place",
        label: "Artifacts",
        face: { initials: "A", icon: "doc", tint: "purple" },
    },
    {
        id: "project:happy-desktop",
        kind: "project",
        label: "happy-desktop",
        face: { initials: "H", placeholderSeed: "xmtv7wnbg0310tvx6kee4ey5" },
        unread: true,
    },
    {
        id: "surface:gr6ppjqex098haumtekkwcsz",
        kind: "surface",
        label: "Happy Cluster",
        face: { initials: "H", icon: "tasks", tint: "green" },
        count: 7,
    },
    {
        id: "artifact:syoxuqs57qeq2hqusagkq6rc",
        kind: "artifact",
        label: "What's left: Tailcat + attachments, Nov 14",
        face: { initials: "W", icon: "doc", tint: "blue" },
    },
];

/* ---- More: what the focused sidebar no longer lists by default ---------- */

export interface DemoPlace {
    readonly id: string;
    readonly label: string;
    readonly face: SidebarFace;
    readonly depth?: number;
}

/** The machine's projects, as the Projects section lists them today. */
export const DEMO_PROJECTS: readonly DemoPlace[] = [
    {
        id: "project:happy",
        label: "happy",
        face: { initials: "H", placeholderSeed: "kmtv7un9n02wnqolmrx8fz6c" },
    },
    {
        id: "project:happy-agent",
        label: "happy-agent",
        face: { initials: "H", placeholderSeed: "tmtv7ui3302vvd6y2lk75qil" },
    },
    {
        id: "project:happy-cluster",
        label: "happy-cluster",
        face: { initials: "H", placeholderSeed: "rru0hqtlowdrseht89s2ybtp" },
    },
];

/** Surfaces on the installation the reader has not pinned: reachable from Search. */
export const DEMO_SURFACES: readonly DemoPlace[] = [
    {
        id: "surface:jmvfuvkhj00192986majfk3b",
        label: "Interesting Libraries",
        face: { initials: "I", icon: "doc", tint: "blue" },
    },
    {
        id: "surface:ymva9cb8j0014l0pxjol12ed",
        label: "Happy Native",
        face: { initials: "H", icon: "tasks", tint: "green" },
    },
    {
        id: "surface:pmvij3fjk001mwxh3l2at3cp",
        label: "System Monitor",
        face: { initials: "S", icon: "pulse", tint: "teal" },
    },
];

/* ---- Activity feed ------------------------------------------------------- */

/**
 * Who receives an item:
 * - `team` reaches everyone: new work a teammate started.
 * - `cared` reaches readers whose task it is, or who follow it: finished work,
 *   milestones, posts and new artifacts.
 * - `mention` always reaches the reader it names.
 * - `below` never reaches the feed region: real events under the bar.
 */
export type DemoGate = "team" | "cared" | "mention" | "below";

export interface DemoEvent {
    readonly gate: DemoGate;
    /** The task it belongs to. */
    readonly taskId: string;
    /** When it really happened on this server, UTC; View all tells this time. */
    readonly realAt: number;
    /** Where it came from on this server. */
    readonly source: string;
    /** For a `below` event, why it stays out. */
    readonly why?: string;
    readonly item: Omit<LiveFeedItem, "at" | "follow" | "leaving">;
}

const tailcat = agentOf("smwcvrm393g6ap19uyzp8bhq", "Tailcat sync");
const triage = agentOf("dmwei604u7162r2xl46h6wtt", "PR triage");
const gateway = agentOf("cmwepvc1k0vone776vyuuc2e", "Happy Gateway");
const pairing = agentOf("amw7koqat322kcg8iywwr7sg", "Pairing links");
const slowness = agentOf("omwczbhz711koildn8fjahq9", "Host slowness");
const mobile = agentOf("dqu8e3v0jvthdvd0ui9kfvg8", "Mobile release");

/** On screen from the start, as if they had just come in. */
export const DEMO_SEED: readonly DemoEvent[] = [
    {
        gate: "team",
        taskId: "ymwe8r65t0rc52wid0ff6luw",
        realAt: Date.parse("2026-11-12T20:10:00Z"),
        source: 'task ymwe8r65t0rc52wid0ff6luw, first message ("Lets design HappyUI…")',
        item: {
            id: "seed-happyui",
            tier: "line",
            actor: steve,
            verb: "started",
            title: "HappyUI component library",
            subject: "task",
        },
    },
    {
        gate: "cared",
        taskId: "mmwcvrm393g4por2aqu5pw2v",
        realAt: Date.parse("2026-11-14T08:25:00Z"),
        source: "artifact syoxuqs57qeq2hqusagkq6rc (14 Nov 08:25), agent smwcvrm393g6ap19uyzp8bhq",
        item: {
            id: "seed-ios-preview",
            tier: "milestone",
            actor: tailcat,
            verb: "shipped",
            title: "Tailcat sync",
            subject: "task",
            detail: "iOS preview is out to testers",
        },
    },
];

export const DEMO_SCRIPT: readonly DemoEvent[] = [
    {
        gate: "mention",
        taskId: "mmwcvrm393g4por2aqu5pw2v",
        realAt: Date.parse("2026-11-14T08:26:00Z"),
        source: "artifact syoxuqs57qeq2hqusagkq6rc summary, agent smwcvrm393g6ap19uyzp8bhq",
        item: {
            id: "e-mention-android",
            tier: "mention",
            actor: tailcat,
            verb: "mentioned",
            title: "Tailcat Connection and Sync Benchmarking",
            place: "Tailcat Connection and Sync Benchmarking",
            subject: "task",
            detail: "Android build 161 needs only Kirill's OK to ship.",
        },
    },
    {
        gate: "cared",
        taskId: "cmwei604u714273sdytyz3me",
        realAt: Date.parse("2026-11-14T09:38:00Z"),
        source: "artifact gygag43njv6tvj4dvdvjig94 (14 Nov 09:38), agent dmwei604u7162r2xl46h6wtt",
        item: {
            id: "e-pr-triage",
            tier: "card",
            actor: triage,
            verb: "published",
            title: "Happy Desktop open PR triage",
            subject: "artifact",
            artifactType: "html",
        },
    },
    {
        gate: "team",
        taskId: "jbwqez4dww6l7zgqd94816z1",
        realAt: Date.parse("2026-11-10T08:40:00Z"),
        source: "task jbwqez4dww6l7zgqd94816z1, created by Steve (Surface amwbngdy1001k62aj2sh3mrv)",
        item: {
            id: "e-happy-cloud",
            tier: "line",
            actor: steve,
            verb: "started",
            title: "Happy Cloud",
            subject: "task",
        },
    },
    {
        gate: "cared",
        taskId: "npvvcr4tkxiaqvhd8qs2q0mc",
        realAt: Date.parse("2026-11-04T07:21:00Z"),
        source: "agent dqu8e3v0jvthdvd0ui9kfvg8, post_story (4 Nov 07:21), story-migrate-v10.jpg",
        item: {
            id: "e-ios-migration",
            tier: "post",
            actor: mobile,
            verb: "posted",
            title: "Mobile release & direct connection",
            subject: "task",
            detail: "iPhone migration screens now explain servers and Chief of Staff",
            media: { kind: "image", url: asset("ios-migration-screens.webp"), shape: "square" },
        },
    },
    {
        gate: "cared",
        taskId: "gmwczbhz711i7bodmphov39d",
        realAt: Date.parse("2026-11-12T23:49:00Z"),
        source: "artifact wrixwroo1jzhwwj4tpgmrtd9 (12 Nov 23:49), agent omwczbhz711koildn8fjahq9",
        item: {
            id: "e-sqlite-fix",
            tier: "milestone",
            actor: slowness,
            verb: "fixed",
            title: "Host slowness",
            subject: "task",
            detail: "The disk sync on every commit is fixed on main",
        },
    },
    {
        gate: "below",
        taskId: "mmwcvrm393g4por2aqu5pw2v",
        realAt: Date.parse("2026-11-13T22:20:00Z"),
        source: "artifact gaxdesdm6xb39alfeapiwi5w v3 (13 Nov 22:20)",
        why: "A third version of a status page already announced: versions are not news",
        item: {
            id: "e-sync-status-v3",
            tier: "card",
            actor: tailcat,
            verb: "updated",
            title: "Sync work: what's still unmerged or unreleased",
            subject: "artifact",
            artifactType: "html",
        },
    },
    {
        gate: "cared",
        taskId: "lmw7koqat320uxi3eyepadn4",
        realAt: Date.parse("2026-11-14T05:57:00Z"),
        source: "artifact lmegl4caalhhgrlxovv1re17 (14 Nov 05:57), agent amw7koqat322kcg8iywwr7sg",
        item: {
            id: "e-pairing-architecture",
            tier: "card",
            actor: pairing,
            verb: "published",
            title: "Encrypted mobile pairing links: architecture",
            subject: "artifact",
            artifactType: "html",
        },
    },
    {
        gate: "cared",
        taskId: "emwepvc1k0vm7q59sev9s8rn",
        realAt: Date.parse("2026-11-14T06:48:00Z"),
        source: "artifact ag7npotfp76qddkd7d6oantz (14 Nov 06:48), agent cmwepvc1k0vone776vyuuc2e",
        item: {
            id: "e-gateway",
            tier: "card",
            actor: gateway,
            verb: "published",
            title: "Happy Gateway — one sign-in for assistants, phones and every linked install",
            subject: "artifact",
            artifactType: "html",
        },
    },
];

/** What Disk Sweeper wakes up to say, from the host-slowness report's open items. */
export const WAKE_NOTE = "Workspace disk is 87% full. About 2 TB can be freed.";
