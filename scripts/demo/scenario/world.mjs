/*
 * The scripted world the demo scenario seeds.
 *
 * Everything on screen in a demo comes from here: the project, its files, the
 * worktrees, and every conversation. The content is written to read like real
 * engineering work — it is inspired by the shape of real sessions, but no real
 * session data is used. That is the whole contract: demos never point a camera
 * at anyone's actual work.
 *
 * A session's turns are keyed by a marker the seeder embeds in each user
 * message, `[dg:<session>:<turn>]`. The inference gateway looks the marker up
 * here and answers with the scripted blocks, so the daemon persists this
 * history through exactly the code paths a real conversation uses — real runs,
 * real tool executions, real durable storage.
 */

/** The demo project's repository, written file by file before `git init`. */
export const repository = {
    name: "happy-desktop",
    avatar: "assets/projects/happy-desktop.png",
    files: {
        "package.json": `${JSON.stringify(
            {
                name: "atlas",
                version: "2.4.1",
                private: true,
                type: "module",
                scripts: {
                    build: "tsc -p tsconfig.json",
                    test: "vitest run",
                    start: "node dist/server.js",
                    soak: "node scripts/soak.mjs",
                },
            },
            null,
            4,
        )}\n`,
        "README.md": [
            "# Happy Desktop",
            "",
            "The desktop home for Happy projects, worktrees, and long-running agents.",
            "This fixture keeps a small billing example beside the real product-style",
            "What’s New surface used by the update demo.",
            "",
            "## Layout",
            "",
            "- `src/server.ts` — HTTP entry point",
            "- `src/retry.ts` — the outbound delivery retry queue",
            "- `src/report/billing.ts` — report aggregation",
            "- `scripts/soak.mjs` — the ingest soak check (run before shipping ingest changes)",
            "",
        ].join("\n"),
        "packages/happy-desktop-ui/src/WhatsNew.tsx": [
            "export interface WhatsNewItem {",
            "    readonly title: string;",
            "    readonly body: string;",
            "    readonly sticker?: string;",
            "}",
            "",
            "export const whatsNewItems: readonly WhatsNewItem[] = [",
            "    {",
            '        title: "Updates that wait for your work",',
            '        body: "Happy lets active tools and replies finish before installing.",',
            "    },",
            "];",
            "",
        ].join("\n"),
        "scripts/inspect-whats-new.mjs": [
            'import { access, mkdir, readFile } from "node:fs/promises";',
            "",
            "const pause = (ms) => new Promise((settle) => setTimeout(settle, ms));",
            'const page = await readFile("packages/happy-desktop-ui/src/WhatsNew.tsx", "utf8");',
            'console.log("what’s-new: reading the current release card");',
            "await pause(2200);",
            'console.log(`what’s-new: ${page.split("\\n").length} lines, one card, no sticker`);',
            "await pause(2200);",
            'console.log("sticker: design/sticker-candidates/rocket-dino.png  768×768  transparent PNG");',
            "await pause(2200);",
            'console.log("plan: add the asset under public/whats-new and reference it from the card");',
            'await mkdir(".demo", { recursive: true });',
            'console.log("assets: checking image references and layout constraints");',
            "for (;;) {",
            '    try { await access(".demo/inspect-release"); break; } catch {}',
            "    await pause(240);",
            "}",
            'console.log("checked: the sticker fits the release card; ready to apply");',
            "",
        ].join("\n"),
        "scripts/install-whats-new-sticker.mjs": [
            'import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";',
            "",
            "const pause = (ms) => new Promise((settle) => setTimeout(settle, ms));",
            'const component = "packages/happy-desktop-ui/src/WhatsNew.tsx";',
            'const target = "packages/happy-desktop-ui/public/whats-new/rocket-dino.png";',
            'console.log("asset: preparing rocket-dino.png");',
            'await mkdir("packages/happy-desktop-ui/public/whats-new", { recursive: true });',
            "await pause(250);",
            'await copyFile("design/sticker-candidates/rocket-dino.png", target);',
            'console.log("asset: copied transparent PNG into the What’s New bundle");',
            "await pause(300);",
            'const source = await readFile(component, "utf8");',
            "const next = source.replace(",
            '    /body: "Happy lets active tools and replies finish before installing\\.",/u,',
            "    [",
            '        "body: \\"Happy lets active tools and replies finish before installing.\\",",',
            '        "        sticker: \\"/whats-new/rocket-dino.png\\",",',
            '    ].join("\\n"),',
            ");",
            'if (next === source) throw new Error("The What’s New card no longer matches the demo fixture.");',
            'await writeFile(component, next, "utf8");',
            'console.log("code: wired the sticker into WhatsNew.tsx");',
            "await pause(250);",
            'console.log("done: What’s New now ships the rocket dino card");',
            "",
        ].join("\n"),
        "src/server.ts": [
            'import { createServer } from "node:http";',
            'import { billingReport } from "./report/billing.js";',
            "",
            "const port = Number(process.env.PORT ?? 8080);",
            "",
            "createServer(async (request, response) => {",
            '    if (request.url === "/health") {',
            '        response.writeHead(200, { "content-type": "text/plain" });',
            '        response.end("ok");',
            "        return;",
            "    }",
            '    if (request.url?.startsWith("/reports/billing")) {',
            "        const report = await billingReport();",
            '        response.writeHead(200, { "content-type": "application/json" });',
            "        response.end(JSON.stringify(report));",
            "        return;",
            "    }",
            "    response.writeHead(404);",
            "    response.end();",
            "}).listen(port);",
            "",
        ].join("\n"),
        "src/retry.ts": [
            "export interface RetryPolicy {",
            "    readonly attempts: number;",
            "    readonly baseDelayMs: number;",
            "    readonly maxDelayMs: number;",
            "}",
            "",
            "export function backoffDelay(policy: RetryPolicy, attempt: number): number {",
            "    const exponential = policy.baseDelayMs * 2 ** attempt;",
            "    const jitter = Math.random() * policy.baseDelayMs;",
            "    return Math.min(policy.maxDelayMs, exponential + jitter);",
            "}",
            "",
        ].join("\n"),
        "src/report/billing.ts": [
            "export interface BillingLine {",
            "    readonly accountId: string;",
            "    readonly meter: string;",
            "    readonly quantity: number;",
            "    readonly unitCents: number;",
            "}",
            "",
            "export async function billingReport(): Promise<{ lines: BillingLine[] }> {",
            "    // Aggregation is stubbed while the ingest pipeline is migrated.",
            "    return { lines: [] };",
            "}",
            "",
        ].join("\n"),
        "test/retry.test.ts": [
            'import { describe, expect, it } from "vitest";',
            'import { backoffDelay } from "../src/retry.js";',
            "",
            'describe("backoffDelay", () => {',
            '    it("caps the delay at the policy maximum", () => {',
            "        const policy = { attempts: 8, baseDelayMs: 100, maxDelayMs: 3000 };",
            "        expect(backoffDelay(policy, 12)).toBeLessThanOrEqual(3000);",
            "    });",
            "});",
            "",
        ].join("\n"),
        // The long-running check the update video's live turn asks for. It
        // genuinely runs for about half a minute, prints honest progress, and
        // must not be interrupted mid-flight — exactly the kind of work an
        // update used to kill.
        "scripts/soak.mjs": [
            "/*",
            " * Ingest soak check: replays a synthetic day of usage events through the",
            " * aggregation windows and verifies the per-account invariants hold in",
            " * every window. Run it before shipping anything that touches ingest.",
            " */",
            "",
            "const windows = 12;",
            "const eventsPerWindow = 20_000;",
            "",
            "function sleep(ms) {",
            "    return new Promise((settle) => setTimeout(settle, ms));",
            "}",
            "",
            "function windowReplay(index) {",
            "    let credit = 0n;",
            "    let debit = 0n;",
            "    for (let event = 0; event < eventsPerWindow; event += 1) {",
            "        const quantity = BigInt(1 + ((index * 31 + event * 17) % 97));",
            "        credit += quantity;",
            "        debit += quantity;",
            "    }",
            "    return credit === debit;",
            "}",
            "",
            "const startedAt = Date.now();",
            "console.log(",
            "    `soak: replaying ${windows * eventsPerWindow} events across ${windows} windows`,",
            ");",
            "for (let index = 0; index < windows; index += 1) {",
            "    const windowStartedAt = Date.now();",
            "    const clean = windowReplay(index);",
            "    // Pace each window like the real ingest replay: the pipeline is",
            "    // throttled to the meter store's write budget.",
            "    await sleep(560 + (index % 3) * 90);",
            "    const seconds = ((Date.now() - windowStartedAt) / 1000).toFixed(1);",
            '    const label = String(index + 1).padStart(2, "0");',
            "    console.log(",
            '        `soak: window ${label}/${windows}  ${eventsPerWindow} events  ${clean ? "ok" : "VIOLATION"}  (${seconds}s)`,',
            "    );",
            "    if (!clean) process.exit(1);",
            "}",
            "const total = ((Date.now() - startedAt) / 1000).toFixed(1);",
            "console.log(",
            "    `soak: all windows clean — ${windows * eventsPerWindow} events, 0 invariant violations (${total}s)`,",
            ");",
            "",
        ].join("\n"),
    },
    binaryFiles: {
        "design/sticker-candidates/rocket-dino.png": "demos/resume/assets/rocket-dino.png",
    },
    dirtyFiles: {
        "notes/update-design.md": [
            "# Update surface notes",
            "",
            "- Keep the update affordance compact until someone opens it.",
            "- Never interrupt a running tool or an inference response.",
            "- Restore the exact conversation after the daemon reconnects.",
            "",
        ].join("\n"),
    },
};

/** Other real Git projects that make the demo world feel lived in. */
export const backgroundRepositories = [
    {
        name: "travel-vibes",
        avatar: "assets/projects/travel-vibes.png",
        files: {
            "README.md": "# travel-vibes\n\nA visual trip planner for places worth lingering in.\n",
            "src/itinerary.ts": 'export const days = ["Kyoto", "Naoshima", "Osaka"];\n',
        },
        dirtyFiles: {
            "notes/kyoto-food.md": "- monk’s breakfast\n- market lunch\n- tiny listening bar\n",
            "src/itinerary.ts": 'export const days = ["Kyoto", "Naoshima", "Osaka", "Koyasan"];\n',
        },
    },
    {
        name: "happy",
        avatar: "assets/projects/happy.png",
        files: {
            "README.md": "# happy\n\nA joyful place to work with people and agents.\n",
            "src/invite.ts": 'export const inviteLabel = "Invite a friend";\n',
        },
        dirtyFiles: {
            "src/invite.ts":
                'export const inviteLabel = "Bring a friend";\nexport const inviteConfetti = true;\n',
        },
    },
    {
        name: "bra1hndump",
        avatar: "assets/projects/bra1hndump.png",
        files: {
            "README.md": "# bra1hndump\n\nNotes, fragments, images, and useful little accidents.\n",
            "src/constellation.ts": "export const constellationRadius = 180;\n",
        },
        dirtyFiles: {
            "ideas/soft-search.md": "Search should feel like remembering, not querying.\n",
            "ideas/ambient-links.md": "Let related notes glow before drawing a hard edge.\n",
            "src/constellation.ts":
                "export const constellationRadius = 220;\nexport const ambientLinks = true;\n",
        },
    },
];

/** Worktrees created beside the project checkout. Sessions live on these. */
export const worktrees = ["csv-export", "cold-start"];

/**
 * Every conversation in the world, in sidebar order (most recent first is the
 * app's concern; the seeder simply creates them in this order).
 *
 * `turns` is what the user said; `responses` is what the model scripted for
 * each turn, as gateway content blocks. A turn with a `toolCall` gets the
 * daemon's follow-up inference answered by the next entry in `responses` for
 * the same turn (`after` blocks).
 */
export const sessions = [
    {
        id: "whats-new-sticker",
        worktree: null,
        title: "Add a sticker to What’s New",
        recap: "Scoped the release card and found the right place for a playful visual.",
        turns: [
            {
                user: "The update-safety card on What’s New feels a little dry. Find the smallest clean place to add some personality, but don’t change it yet.",
                response: {
                    thinking:
                        "The card data already owns optional visual metadata, and its public asset directory is the natural boundary. A sticker belongs on the card, not inside update behavior.",
                    text: [
                        "The clean seam is the card data in [packages/happy-desktop-ui/src/WhatsNew.tsx](packages/happy-desktop-ui/src/WhatsNew.tsx).",
                        "",
                        "I’d add one optional `sticker` path to the update-safety card and put the image under `packages/happy-desktop-ui/public/whats-new/`. That keeps the personality in the release surface and leaves the updater itself completely untouched.",
                        "",
                        "There’s already a transparent rocket-dino candidate in `design/sticker-candidates/`. I haven’t modified anything yet.",
                    ].join("\n"),
                },
            },
        ],
    },
    {
        id: "retry-test",
        worktree: null,
        title: "Fix the flaky retry backoff test",
        recap: "Found the unseeded jitter, made the delay deterministic under test, and re-ran the suite.",
        turns: [
            {
                user: "The retry backoff test fails maybe one run in ten on CI. Can you find out why and fix it properly, not by loosening the assertion?",
                response: {
                    thinking:
                        "The test asserts an exact delay but backoffDelay adds Math.random() jitter. One run in ten failing suggests the jitter occasionally pushes the value over the asserted bound. The right fix is injecting the random source, not widening the assertion.",
                    text: [
                        "Looking at [src/retry.ts](src/retry.ts), the problem is on the jitter line:",
                        "",
                        "```ts",
                        "const jitter = Math.random() * policy.baseDelayMs;",
                        "```",
                        "",
                        "`backoffDelay` reads `Math.random()` directly, so the test is asserting against a value that is different on every run. It usually passes because the assertion only checks the cap — but when `attempt` is small the jitter alone can cross the asserted bound.",
                        "",
                        "Let me confirm by running the suite a few times before touching anything.",
                    ].join("\n"),
                    tool: {
                        name: "Bash",
                        arguments: {
                            command: "grep -n 'Math.random' src/retry.ts",
                            description: "Inspect the retry jitter source",
                        },
                    },
                    after: {
                        text: [
                            "Confirmed — the only nondeterminism is that one `Math.random()` call.",
                            "",
                            "The clean fix is to make the random source part of `RetryPolicy` with a default, so production behavior is unchanged and the test can pass a seeded source:",
                            "",
                            "```ts",
                            "export interface RetryPolicy {",
                            "    readonly attempts: number;",
                            "    readonly baseDelayMs: number;",
                            "    readonly maxDelayMs: number;",
                            "    readonly random?: () => number;",
                            "}",
                            "```",
                            "",
                            "Then `backoffDelay` uses `policy.random ?? Math.random`. The test provides `random: () => 0.5` and asserts the exact delay for every attempt, which is a stronger test than the cap check it replaces.",
                        ].join("\n"),
                    },
                },
            },
            {
                user: "Good analysis. Apply it and show me the test passing.",
                response: {
                    thinking:
                        "Apply the interface change, thread the random source through backoffDelay, tighten the test to exact values with a seeded source, then run vitest.",
                    text: "Applying the change to [src/retry.ts](src/retry.ts) and tightening [test/retry.test.ts](test/retry.test.ts) to assert exact delays with a seeded source.",
                    tool: {
                        name: "Bash",
                        arguments: {
                            command:
                                "printf 'RUN  test/retry.test.ts\\n  \\u2713 caps the delay at the policy maximum\\n  \\u2713 is exact under a seeded random source\\n\\nTest Files  1 passed (1)\\n     Tests  2 passed (2)\\n'",
                            description: "Run the retry tests",
                        },
                    },
                    after: {
                        text: [
                            "Done. Both tests pass, and the new one is deterministic:",
                            "",
                            "- `backoffDelay` now reads `policy.random ?? Math.random`, so production behavior is byte-for-byte what it was.",
                            "- The test asserts the exact delay for attempts 0 through 8 under `random: () => 0.5`.",
                            "",
                            "The flake was never the backoff being wrong — it was the test asserting a value the code never promised to produce twice.",
                        ].join("\n"),
                    },
                },
            },
        ],
    },
    {
        id: "csv-export",
        worktree: "csv-export",
        title: "CSV export for billing reports",
        recap: "Added a CSV projection beside the JSON report and wired it to /reports/billing.csv.",
        turns: [
            {
                user: "Finance wants the monthly billing report as CSV, not JSON. Add an export beside the existing endpoint — same lines, same order, header row first.",
                response: {
                    thinking:
                        "billingReport() already produces the lines. A CSV projection should live in its own module so the report shape stays owned by billing.ts, and the server routes /reports/billing.csv to it.",
                    text: [
                        "The report shape in [src/report/billing.ts](src/report/billing.ts) already has everything the CSV needs, so this is a projection, not a second report.",
                        "",
                        "I'll add `src/report/csv.ts` with a `billingCsv()` that renders the header row and one line per `BillingLine`, and route `/reports/billing.csv` to it in [src/server.ts](src/server.ts).",
                    ].join("\n"),
                    tool: {
                        name: "Bash",
                        arguments: {
                            command:
                                "printf 'Applied patch to src/report/csv.ts and src/server.ts\\n'",
                            description: "Add the billing CSV endpoint",
                        },
                    },
                    after: {
                        text: [
                            "Added [src/report/csv.ts](src/report/csv.ts) with the projection. The header row is a constant, the lines render in report order, and the route can stream the string as `text/csv`.",
                            "",
                            "Next I'd wire `/reports/billing.csv` in the server and add a test asserting the header and one rendered line — say the word and I'll do both.",
                        ].join("\n"),
                    },
                },
            },
        ],
    },
    {
        id: "cold-start",
        worktree: "cold-start",
        title: "Trace the slow cold start",
        recap: "Profiled startup, found the synchronous report warm-up, and proposed deferring it behind the first request.",
        turns: [
            {
                user: "Cold starts went from about 300ms to over 2 seconds somewhere in the last month. Profile it and tell me where the time actually goes before we guess.",
                response: {
                    thinking:
                        "Rather than bisecting a month of commits, measure first: time the import graph and the server's listen callback separately. The likely suspect is work moving from first-request to import time.",
                    text: [
                        "Measuring before guessing. I'll time two things separately: how long the import graph takes to evaluate, and how long `listen` takes once imports are done — that split says whether the regression is module-load work or server setup.",
                    ].join("\n"),
                    tool: {
                        name: "Bash",
                        arguments: {
                            command:
                                "printf 'import graph      1840ms\\n  src/report/billing.ts  1795ms\\n  src/server.ts            31ms\\n  src/retry.ts              4ms\\nlisten() ready       12ms\\n'",
                            description: "Profile the cold-start path",
                        },
                    },
                    after: {
                        text: [
                            "The time is in one place:",
                            "",
                            "| Phase | Cost |",
                            "| --- | --- |",
                            "| `src/report/billing.ts` import | **1795ms** |",
                            "| every other module combined | 35ms |",
                            "| `listen()` | 12ms |",
                            "",
                            "The billing module is doing its aggregation warm-up at import time — it builds the meter lookup table eagerly, and that table now covers a month of new meters. Nothing about serving `/health` needs it.",
                            "",
                            "The fix I'd make: defer the warm-up behind the first call to `billingReport()` with a memoized promise. Cold start returns to ~300ms, the first report request pays the 1.8s once, and every later request is unchanged.",
                        ].join("\n"),
                    },
                },
            },
            {
                user: "That table is exactly what I needed. Write the deferral up as a small plan I can drop into the issue before we implement it.",
                response: {
                    thinking:
                        "A short three-step plan: memoized lazy init, health-path guarantee, and a startup-time regression test. Keep it pasteable.",
                    text: [
                        "Here's the plan, sized for the issue:",
                        "",
                        "**1. Defer the warm-up.** Move the meter-table build inside `billingReport()` behind a memoized promise. Import time drops to milliseconds; the first report request pays the build exactly once.",
                        "",
                        "**2. Guarantee the health path.** Add a test asserting that importing `src/server.ts` and serving `/health` never touches the billing module. That's the invariant the regression broke.",
                        "",
                        "**3. Hold the line.** Add a startup-time check to CI: fail if evaluating the import graph exceeds 500ms. Cheap to run, and it turns the next silent regression into a red build.",
                        "",
                        "Ready to implement whenever you want — step 1 is a ten-line change.",
                    ].join("\n"),
                },
            },
        ],
    },
    {
        id: "viewer-shortcuts",
        worktree: null,
        title: "Keyboard shortcuts for the file viewer",
        recap: "Mapped j/k row movement and enter-to-open onto the file list, following the existing shortcut registry.",
        turns: [
            {
                user: "Add j/k to move through the file list and enter to open the selected file. Follow whatever shortcut conventions the codebase already has.",
                response: {
                    thinking:
                        "Find the existing shortcut registry first so the new bindings live where every other binding lives, then map j/k to selection movement and enter to the open action.",
                    text: [
                        "There's already a shortcut registry, so this is three registrations, not an event listener:",
                        "",
                        "- `j` — selection down one row",
                        "- `k` — selection up one row",
                        "- `enter` — open the selected file",
                        "",
                        "The registrations are scoped to the file list's focus, so typing in the search field or the composer never triggers them. The open action reuses the exact handler a click on the row calls — one code path, keyboard and mouse.",
                        "",
                        "Both bindings show up in the shortcut help panel automatically since they go through the registry.",
                    ].join("\n"),
                },
            },
        ],
    },
    {
        id: "vite-8",
        worktree: null,
        title: "Upgrade the build to Vite 8",
        recap: "Bumped Vite, fixed the two plugin API changes, verified dev server and production build.",
        turns: [
            {
                user: "Upgrade us to Vite 8. Tell me what actually changes for our config before you touch anything.",
                response: {
                    thinking:
                        "Vite 8's notable changes for this config: the plugin transformIndexHtml ordering and the environment API replacing some server hooks. The config here is small, so the diff should be two plugin call sites.",
                    text: [
                        "Two things in our config are affected:",
                        "",
                        "1. **`transformIndexHtml` ordering** — the `enforce` field is replaced by `order`, same values, new name. One-line change in our HTML plugin.",
                        "2. **Server hooks** — our dev middleware registers through `configureServer`, which is unchanged, but the connect instance moves under `server.middlewares` typing that's now stricter. Our usage already matches it.",
                        "",
                        "Nothing else in the config touches an API that moved. The dependency bump plus the one rename should be the whole diff — I'll run the dev server and a production build to verify both paths.",
                    ].join("\n"),
                },
            },
        ],
    },
];

/**
 * Looks a scripted turn up by the user's words.
 *
 * The seeder sends each turn's text verbatim, so the words themselves are the
 * key — nothing machine-readable rides in the visible message. Containment
 * rather than equality, because the daemon frames messages differently per
 * request kind (title generation wraps them in an explanatory line); every
 * turn's text is long and distinctive enough that containment cannot collide.
 */
export function turnFind(userText) {
    const candidate = normalize(userText);
    for (const session of sessions) {
        for (const turn of session.turns) {
            if (candidate.includes(normalize(turn.user))) return { session, turn };
        }
    }
    return undefined;
}

function normalize(text) {
    return text.replace(/\s+/gu, " ").trim();
}
