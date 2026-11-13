/* The cover is a screenshot of the published report, at ordinary page scale. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const fontRoot = resolve(
    import.meta.dirname,
    "../../../../../packages/happy-desktop-ui/node_modules/@fontsource-variable",
);
const font = readFileSync(join(fontRoot, "figtree/files/figtree-latin-wght-normal.woff2")).toString(
    "base64",
);
export const coverIcons = [];
const table = (heads, rows) =>
    `<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const section = (title, text) => `<h2>${title}</h2><p>${text}</p>`;
const badge = (text, tone = "green") => `<span class="badge ${tone}">${text}</span>`;

const reports = {
    perf: {
        kind: "Performance investigation",
        title: "Task list, 3× faster",
        owner: "List cache · Scoteezy",
        lead: "Caching the task list query cuts first paint from 420 ms to 140 ms on a 10,000-task workspace. The cache stays current through the existing difference stream.",
        body: () => `${section("First paint · median of 20 cold starts", "Same workspace, same machine, renderer restarted between runs.")}
            <div class="chart"><div><span>Before</span><i style="width:100%;background:#62626a"></i><b>420 ms</b></div><div><span>Cached</span><i style="width:33.3%;background:#58ba91"></i><b>140 ms</b></div></div>
            ${table(
                ["Measurement", "Before", "Cached", "Change"],
                [
                    ["First paint", "420 ms", "140 ms", "−67%"],
                    ["List query", "312 ms", "38 ms", "−88%"],
                    ["Heap after idle", "86 MB", "88 MB", "+2 MB"],
                ],
            )}
            ${section("What changed", "The first snapshot reuses the materialized list. Membership changes invalidate the affected rows; ordinary progress updates preserve row identity.")}
            <footer>Chromium · 10,000 tasks · local team server · warmed filesystem</footer>`,
    },
    review: {
        kind: "Code review",
        title: "Message retry queue",
        owner: "Message Retry Queue · Kirill",
        lead: "The queue preserves message order and retries interrupted uploads. One medium finding remains before this is ready to merge.",
        body: () => `<div class="verdict">${badge("Changes requested", "amber")}<span>0 high · 1 medium · 2 low</span><code>7e2c91a</code></div>
            ${section("M1 · Keep one idempotency key across upload retries", "If the connection drops after the server accepts an upload, retrying with a new key can deliver the same message twice. Retain the original key until the send resolves.")}
            ${table(
                ["File", "Added", "Removed", "Review"],
                [
                    ["sync/RetryQueue.ts", "+48", "−12", "One finding"],
                    ["sync/upload.ts", "+9", "−3", "Read"],
                    ["sync/RetryQueue.test.ts", "+61", "—", "Read"],
                ],
            )}
            ${section("Validation", "Ordering, cancellation and reconnect behavior pass. Add the accepted-but-disconnected case, then rerun the focused queue checks.")}
            <footer>Reviewed against the current diff · three files · no high severity findings</footer>`,
    },
    progress: {
        kind: "Progress report",
        title: "Team server sign-in",
        owner: "Team Servers · Steve",
        lead: "Agent sign-in is merged. Desktop sessions are in review; iOS server codes follow once the desktop contract is settled.",
        body: () => `${table(
            ["Workstream", "Status", "Next step"],
            [
                ["Agent sign-in", badge("Merged"), "Included on main"],
                [
                    "Desktop sessions",
                    badge("In review", "amber"),
                    "Resolve session lifetime feedback",
                ],
                ["iOS server codes", badge("Next", "muted"), "Use the approved sign-in contract"],
            ],
        )}
            ${section("Since the last update", "The agent now connects with an authenticated session and restores it after reconnecting. The desktop branch handles expired credentials and switching team servers.")}
            ${section("Current gate", "The desktop review needs a clear lifetime for sessions when a server is removed. Steve is checking that the UI and agent agree before the mobile work starts.")}
            <footer>8 updates · Team Servers · implementation in progress</footer>`,
    },
    qa: {
        kind: "QA receipt",
        title: "Desktop preview",
        owner: "Desktop QA · Kirill",
        lead: "Install, sign in, open a shared task and update the preview on all three desktop platforms. The complete path passes on clean test machines.",
        body: () => `${table(
            ["Scenario", "macOS", "Windows", "Linux"],
            [
                ["Install and launch", "Pass", "Pass", "Pass"],
                ["Sign in to team server", "Pass", "Pass", "Pass"],
                ["Open a shared task", "Pass", "Pass", "Pass"],
                ["Receive a teammate message", "Pass", "Pass", "Pass"],
                ["Update and reopen", "Pass", "Pass", "Pass"],
            ],
        )}
            ${section("Receipt", "Each machine started with a fresh profile. Signing and installer checks pass, the shared task receives live messages, and the preview reopens after updating.")}
            <footer>Clean profiles · signed preview builds · no blocking findings</footer>`,
    },
    screenshot: {
        kind: "UI change",
        title: "Steadier unread dots",
        owner: "Sidebar Unread Dots · Scoteezy",
        lead: "Unread dots now sit on the task picture. A task name keeps its place when a new message arrives or the conversation is marked read.",
        body: () => `<div class="screens">${["read", "unread"].map((state) => `<figure><figcaption>${state === "read" ? "Read" : "Unread"}</figcaption><img src="data:image/png;base64,${readFileSync(join(import.meta.dirname, "shots", `rows-${state}.png`)).toString("base64")}"></figure>`).join("")}</div>
            ${section("What to look for", "The label and its baseline are identical in both states. Only the small marker on the picture changes; the row, hover controls and neighboring tasks stay still.")}
            ${table(
                ["State change", "Label position", "Row identity"],
                [
                    ["Read → unread", "Preserved", "Preserved"],
                    ["Unread → read", "Preserved", "Preserved"],
                ],
            )}`,
    },
    design: {
        kind: "Design draft",
        title: "Bot permissions",
        owner: "Bot Permissions · Steve",
        lead: "A team bot is a shared conversation. Members can read and write by default, while owners can restrict who changes the bot’s settings.",
        body: () => `${table(
            ["Capability", "Member", "Owner", "Bot"],
            [
                ["Read the conversation", "Allowed", "Allowed", "Allowed"],
                ["Send a message", "Allowed", "Allowed", "Allowed"],
                ["Change settings", "Owner’s switch", "Allowed", "—"],
            ],
        )}
            ${section("Proposed behavior", "Keep joining a bot as simple as opening its conversation. Show the current access policy in settings, with a clear owner-only option for changing instructions and connected tools.")}
            ${section("Open question", "Should the owner-only switch apply to every setting, or only instructions and tools? The draft recommends one policy so the control stays understandable.")}
            <footer>Draft v5 · permissions are enforced by the server</footer>`,
    },
    mobile: {
        kind: "Release status",
        title: "Mobile preview",
        owner: "Mobile preview · Kirill",
        lead: "The iOS build is waiting for TestFlight review. Android is available to the internal track while the team checks sign-in and shared conversations.",
        body: () => `${table(
            ["Platform", "Distribution", "Status"],
            [
                ["iOS", "TestFlight", badge("In review", "amber")],
                ["Android", "Internal track", badge("Available")],
            ],
        )}
            ${section("Latest build", "Both builds include the current team server sign-in flow, task membership and live messages. The release notes cover reconnect behavior and the shared bot conversation.")}
            ${section("Before widening the preview", "Complete the clean-install receipt, confirm notification delivery with the app backgrounded, and check that existing sessions survive an update.")}
            <footer>14 updates · staged preview · release checks in progress</footer>`,
    },
};

function reportPage(key) {
    const report = reports[key];
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${report.title}</title><style>
        @font-face{font-family:Figtree;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:300 900}
        *{box-sizing:border-box}html,body{margin:0}body{width:1152px;height:648px;overflow:hidden;padding:38px 58px;background:#1c1c1e;color:#e9e9ed;font:400 15px/1.5 Figtree,system-ui,sans-serif;display:flex;flex-direction:column;font-variant-numeric:tabular-nums}
        header{display:flex;align-items:center;justify-content:space-between;color:#8f9098;font-size:13px;padding-bottom:16px;border-bottom:1px solid #323237}
        h1{font-size:30px;line-height:1.2;font-weight:650;letter-spacing:-.025em;margin:22px 0 12px}h2{font-size:16px;font-weight:600;margin:20px 0 7px}p{margin:0;color:#bfc0c8;max-width:960px}.lead{font-size:16px;line-height:1.55;margin-bottom:18px;max-width:980px}
        table{width:100%;border-collapse:collapse;font-size:14px;text-align:left;margin:8px 0}th{color:#92939e;font-weight:500;background:#242427}th,td{padding:10px 14px;border-bottom:1px solid #333338}td:first-child{font-weight:500}td:not(:first-child){color:#bfc0c8}
        .badge{display:inline-block;padding:3px 9px;border-radius:5px;font-size:12px;background:#294236;color:#8cdbaf}.amber{background:#443a29;color:#dfc18a}.muted{background:#333339;color:#b4b4be}.verdict{display:flex;gap:18px;align-items:center;color:#92939e;font-size:13px;margin-bottom:6px}.verdict code{margin-left:auto;font-size:12px}
        .chart{display:flex;flex-direction:column;gap:12px;max-width:850px;margin:17px 0 22px}.chart>div{display:flex;align-items:center;gap:14px}.chart span{width:60px;flex:none;color:#a4a5af;font-size:13px}.chart i{height:17px;border-radius:3px}.chart b{font-size:14px;font-weight:500;white-space:nowrap}
        footer{color:#797a85;font-size:12px;margin-top:22px;padding-top:12px;border-top:1px solid #323237}.screens{display:flex;gap:20px;max-width:750px}.screens figure{flex:1;margin:4px 0 0}.screens img{display:block;width:100%;border:1px solid #38383d;border-radius:6px}.screens figcaption{font-size:12px;color:#999aa5;margin-bottom:8px}
        </style><body><header><span>${report.kind}</span><span>${report.owner}</span></header><h1>${report.title}</h1><p class="lead">${report.lead}</p><main>${report.body()}</main></body></html>`;
}

export const covers = {
    perf: {
        title: "Task list, 3× faster",
        summary:
            "With 10,000 tasks, the sidebar's first paint drops from 420 ms to 140 ms by caching the list query.",
        html: () => reportPage("perf"),
    },
    review: {
        title: "Review: message retry queue",
        summary:
            "Commit 7e2c91a passes with one medium finding: a retried send can arrive twice if the upload is cut off.",
        html: () => reportPage("review"),
    },
    progress: {
        title: "Team server sign-in: progress",
        summary:
            "The agent's sign-in is merged. The desktop's sessions are next, then iOS server codes.",
        html: () => reportPage("progress"),
    },
    qa: {
        title: "Desktop preview: QA",
        summary: "Install, sign in, open a team task, and update, on macOS, Windows and Linux.",
        html: () => reportPage("qa"),
    },
    screenshot: {
        title: "Sidebar: steadier unread dots",
        summary:
            "Unread dots sit on the row's picture, so a task's name doesn't move when one appears.",
        html: () => reportPage("screenshot"),
    },
    design: {
        title: "Draft: bot permissions",
        summary:
            "Who can read, write to and change a team bot: members by default, with an owner-only switch for settings.",
        html: () => reportPage("design"),
    },
    mobile: {
        title: "Mobile preview: status",
        summary: "iOS is in TestFlight review. Android is on the internal track.",
        html: () => reportPage("mobile"),
    },
};

export const coverPage = (key) => covers[key].html();
export const coverFile = (key) => join(import.meta.dirname, "covers", `${key}.webp`);
