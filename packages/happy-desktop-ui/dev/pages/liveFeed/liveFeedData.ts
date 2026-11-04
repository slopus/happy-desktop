import type { LiveFeedItem } from "../../../src/LiveFeed";
import type { HappyAgentFeedActor } from "../../../src/pages/feed/feedPresentation";

/*
 * The prototype's script: real events from this installation between 3 Nov
 * 22:40 and 4 Nov 13:00 UTC, in their real order, replayed in about half a
 * minute. The reader is Steve; the teammate is Kirill. Titles, captions, and
 * quotes are verbatim; the media are the frames those agents actually posted.
 * Each event names its source so the write-up can map it back.
 */

const asset = (name: string) => new URL(`../../assets/live-feed/${name}`, import.meta.url).href;

export const kirill: HappyAgentFeedActor = {
    key: "user-ppvlf3ttno2lgzczrm5sjg9i",
    name: "Kirill",
    face: { type: "human", initials: "KD", imageUrl: asset("kirill.webp") },
};

export const READER = { name: "Steve", imageUrl: asset("steve.webp") } as const;

/** An agent at work, named by the task it works in. */
function agentOf(id: string, name: string): HappyAgentFeedActor {
    return { key: `agent-${id}`, name, face: { type: "agent", initials: "", placeholderSeed: id } };
}

/**
 * The tasks items belong to, and whether Steve follows each when the script
 * starts. He is in the mobile release chat (he replied there), so he follows
 * it; following Stories fixes is assumed for the demo; the rest he does not.
 */
export const DEMO_TASKS = [
    { id: "imw1gxm6l219edvoidnd75jy", label: "Windows preview builds", following: false },
    { id: "wmw24z24z1kra9thv75pcswb", label: "New iteration of stories / feed", following: false },
    {
        id: "npvvcr4tkxiaqvhd8qs2q0mc",
        label: "Mobile release & direct connection",
        following: true,
    },
    { id: "jmvz49d421ne1jnfxj39ve6n", label: "Stories fixes", following: true },
    { id: "uzqhssr8qd5j2e053jbfxieu", label: "Product Health", following: true },
] as const;

export type DemoTaskId = (typeof DEMO_TASKS)[number]["id"];

/**
 * Who receives an item:
 * - `team` reaches everyone: new work a teammate started.
 * - `followed` reaches readers who follow its task: posts and new artifacts.
 * - `mention` always reaches the reader it names, whatever they follow.
 * - `below` never reaches the stream: real events under the bar, kept so the
 *   page can list what was left out and why.
 */
export type DemoGate = "team" | "followed" | "mention" | "below";

export interface DemoEvent {
    /** When it arrives, in ms after Play. */
    readonly at: number;
    /** When it really happened on this server, UTC; the full Feed tells this time. */
    readonly realAt: number;
    readonly gate: DemoGate;
    /** The task, bot, or Surface it belongs to. */
    readonly taskId: DemoTaskId;
    /** Whether hovering it offers Follow: items that announce a task do. */
    readonly followable: boolean;
    /** Where it came from on this server: agent, message, artifact. */
    readonly source: string;
    /** For a `below` event, why it stays out. */
    readonly why?: string;
    readonly item: Omit<LiveFeedItem, "at" | "follow" | "leaving" | "unread">;
}

const windows = agentOf("smw1gxm6l21bq9auhrkfb230", "Windows preview builds");
const mobile = agentOf("dqu8e3v0jvthdvd0ui9kfvg8", "Mobile release & direct connection");
const migrate = agentOf("gmqmyep9wcprtjxsnpt3cqna", "/migrate page wording");
const stories = agentOf("fmvz49d421ng01obou1vf24h", "Stories fixes");
const productHealth = agentOf("f35phpwokufti8k5yy5qq0qk", "Product Health");

/** On screen before Play, as if they had just come in. */
export const DEMO_SEED: readonly DemoEvent[] = [
    {
        at: 0,
        realAt: Date.parse("2026-11-03T21:10:00Z"),
        gate: "team",
        taskId: "imw1gxm6l219edvoidnd75jy",
        followable: true,
        source: "task imw1gxm6l219edvoidnd75jy, first message by Kirill",
        item: {
            id: "seed-windows",
            tier: "line",
            actor: kirill,
            verb: "started",
            title: "Windows preview builds",
            subject: "task",
        },
    },
];

export const DEMO_SCRIPT: readonly DemoEvent[] = [
    {
        at: 1_500,
        realAt: Date.parse("2026-11-03T22:42:00Z"),
        gate: "followed",
        taskId: "jmvz49d421ne1jnfxj39ve6n",
        followable: true,
        source: "agent fmvz49d421ng01obou1vf24h, post_story (3 Nov), stories-open-step.mp4",
        item: {
            id: "e-stories-instant",
            tier: "post",
            actor: stories,
            verb: "posted",
            title: "Stories fixes",
            subject: "task",
            detail: "Stories now open instantly and grow out of their ring",
            media: {
                kind: "video",
                url: asset("stories-open-instantly.webm"),
                posterUrl: asset("stories-open-instantly-poster.webp"),
                durationMs: 9_000,
                shape: "landscape",
            },
        },
    },
    {
        at: 5_000,
        realAt: Date.parse("2026-11-04T07:21:00Z"),
        gate: "followed",
        taskId: "npvvcr4tkxiaqvhd8qs2q0mc",
        followable: true,
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
        at: 9_000,
        realAt: Date.parse("2026-11-04T10:20:00Z"),
        gate: "followed",
        taskId: "imw1gxm6l219edvoidnd75jy",
        followable: true,
        source: "artifact a58b8igiehv03qhhtdrvbzml (4 Nov 10:20), agent sdzku5dtuso5jz4k6szoyppo",
        item: {
            id: "e-contributors",
            tier: "card",
            actor: windows,
            verb: "published",
            title: "Contributors to thank — release cycle after v0.4.113",
            subject: "artifact",
            artifactType: "html",
        },
    },
    {
        at: 12_000,
        realAt: Date.parse("2026-11-04T10:48:00Z"),
        gate: "mention",
        taskId: "npvvcr4tkxiaqvhd8qs2q0mc",
        followable: false,
        source: "agent dqu8e3v0jvthdvd0ui9kfvg8, reply to Steve (message 106)",
        item: {
            id: "e-mention-relay",
            tier: "mention",
            actor: mobile,
            verb: "replied to",
            title: "Mobile release & direct connection",
            place: "Mobile release & direct connection",
            subject: "task",
            detail: "Fair point. The diagram says the new path skips a relay, but direct connections still go through one.",
        },
    },
    {
        at: 15_000,
        realAt: Date.parse("2026-11-04T10:55:00Z"),
        gate: "below",
        taskId: "npvvcr4tkxiaqvhd8qs2q0mc",
        followable: false,
        source: "agent gmqmyep9wcprtjxsnpt3cqna (message 107)",
        why: "Folded into the mention above: the same correction, minutes later, in the same chat",
        item: {
            id: "e-mention-migrate",
            tier: "mention",
            actor: migrate,
            verb: "mentioned",
            title: "Mobile release & direct connection",
            place: "Mobile release & direct connection",
            subject: "task",
            detail: "I've fixed the connection wording on /migrate, following Steve's correction.",
        },
    },
    {
        at: 17_000,
        realAt: Date.parse("2026-11-04T11:04:00Z"),
        gate: "followed",
        taskId: "npvvcr4tkxiaqvhd8qs2q0mc",
        followable: true,
        source: "artifact b0qn42kzbow8tzulcmayh69i (4 Nov 11:04), agent dqu8e3v0jvthdvd0ui9kfvg8",
        item: {
            id: "e-mobile-checklist",
            tier: "card",
            actor: mobile,
            verb: "published",
            title: "Mobile release and direct-connection migration checklist",
            subject: "artifact",
            artifactType: "markdown",
        },
    },
    {
        at: 21_000,
        realAt: Date.parse("2026-11-04T11:39:00Z"),
        gate: "followed",
        taskId: "imw1gxm6l219edvoidnd75jy",
        followable: true,
        source: "artifact e3x3vjg3g9xr140z3yatcgb7 (4 Nov 11:39), agent smw1gxm6l21bq9auhrkfb230",
        item: {
            id: "e-whats-left",
            tier: "card",
            actor: windows,
            verb: "published",
            title: "What's left: Windows previews, fixes and stable releases",
            subject: "artifact",
            artifactType: "html",
        },
    },
    {
        at: 23_000,
        realAt: Date.parse("2026-11-04T12:13:00Z"),
        gate: "below",
        taskId: "npvvcr4tkxiaqvhd8qs2q0mc",
        followable: false,
        source: "artifact u7jhc7l8y5la50y6tyrlogpr v4 (4 Nov 12:13)",
        why: "A fourth version of a page already announced: versions are not news",
        item: {
            id: "e-rollout-v4",
            tier: "card",
            actor: mobile,
            verb: "updated",
            title: "Direct-connection rollout",
            subject: "artifact",
            artifactType: "html",
        },
    },
    {
        at: 24_000,
        realAt: Date.parse("2026-11-04T09:18:00Z"),
        gate: "below",
        taskId: "uzqhssr8qd5j2e053jbfxieu",
        followable: false,
        source: "artifact olcvjarua400hvwfwqptbeym v5 (4 Nov 09:18)",
        why: "A dashboard bot refreshing its own page: a routine version bump",
        item: {
            id: "e-product-health",
            tier: "card",
            actor: productHealth,
            verb: "updated",
            title: "Product Health",
            subject: "artifact",
            artifactType: "html",
        },
    },
    {
        at: 26_000,
        realAt: Date.parse("2026-11-04T13:00:00Z"),
        gate: "team",
        taskId: "wmw24z24z1kra9thv75pcswb",
        followable: true,
        source: "agent wmw24z24z1kra9thv75pcswb, first message by Kirill (4 Nov ~13:00)",
        item: {
            id: "e-feed-iteration",
            tier: "line",
            actor: kirill,
            verb: "started",
            title: "New iteration of stories / feed",
            subject: "task",
        },
    },
];
