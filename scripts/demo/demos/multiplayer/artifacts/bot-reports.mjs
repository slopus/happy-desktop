/* Original inline reports for the three recurring-work bot conversations. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const font = readFileSync(
    resolve(
        import.meta.dirname,
        "../../../../../packages/happy-desktop-ui/node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
    ),
).toString("base64");
const table = (heads, rows) =>
    `<table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
export const botReports = [
    {
        username: "desktop_releases",
        name: "Desktop Releases",
        key: "releases",
        prompt: "Keep an eye on the next preview. How are the builds?",
        reply: "macOS is signed and notarized. Windows is building; Linux passed. I'll post the preview when all three are green.",
        tail: "The release receipt is below. Next check: the Windows installer.",
        title: "Next preview · build receipt",
        kind: "Desktop Releases · recurring release check",
        body: () =>
            `<p>One preview, three platforms. Signing and installation checks run before publication.</p>${table(
                ["Platform", "Build", "Signing / checks", "Elapsed"],
                [
                    ["macOS", '<b class="green">Ready</b>', "Signed & notarized", "8m 42s"],
                    ["Windows", '<b class="amber">Building</b>', "Installer compiling", "6m 18s"],
                    ["Linux", '<b class="green">Passed</b>', "AppImage smoke check", "4m 51s"],
                ],
            )}<footer>Publication waits for all three · next check in 2 minutes</footer>`,
    },
    {
        username: "growth",
        name: "Growth",
        key: "growth",
        prompt: "How did signups look this week?",
        reply: "1,284 signups this week, up 18%. Most of the lift came from desktop installs. Friday held after the launch spike.",
        tail: "Next check: retention for the desktop cohort on Monday.",
        title: "Weekly signups",
        kind: "Growth · weekly product read",
        body: () =>
            `<div class="metrics"><span><b>1,284</b> this week</span><span><b class="green">+18%</b> vs 1,088 last week</span></div><div class="bars">${[142, 156, 171, 183, 246, 198, 188].map((n, i) => `<div><small>${n}</small><i style="height:${(n / 246) * 100}px"></i><small>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</small></div>`).join("")}</div><footer>Desktop installs: 762 (+24%) · Direct & referral: 522 (+10%)</footer>`,
    },
    {
        username: "product_health",
        name: "Product Health",
        key: "health",
        prompt: "Anything we should pick up before the next preview?",
        reply: "Crash-free sessions are at 99.94%. Two issues need a look before the next preview; neither is blocking sign-in.",
        tail: "Both issues are assigned for the next preview check.",
        title: "Product health · last 7 days",
        kind: "Product Health · recurring quality check",
        body: () =>
            `<div class="metrics"><span><b class="green">99.94%</b> crash-free sessions</span><span><b>42,618</b> sessions sampled</span></div>${table(
                ["Issue", "Sessions", "Priority", "Owner"],
                [
                    ["Retry after interrupted upload", "14", "Medium", "Steve"],
                    ["Notification delivery after sleep", "9", "Low", "Scoteezy"],
                    ["Sign-in failures", "0", '<span class="green">Clear</span>', "—"],
                ],
            )}<p>Crash-free: 99.92% → 99.94%. No new high-priority regression.</p>`,
    },
];
export const botReportFile = (key) => join(import.meta.dirname, "bot-reports", `${key}.webp`);
export function botReportPage(report) {
    return `<!doctype html><html><meta charset="utf-8"><style>
    @font-face{font-family:Figtree;src:url(data:font/woff2;base64,${font});font-weight:300 900}
    *{box-sizing:border-box}body{margin:0;width:900px;height:430px;padding:26px 34px;background:#1c1c1e;color:#e9e9ed;font:15px/1.5 Figtree;display:flex;flex-direction:column;font-variant-numeric:tabular-nums}header{color:#93949f;font-size:12px;padding-bottom:12px;border-bottom:1px solid #34343b}h1{font-size:25px;font-weight:650;letter-spacing:-.025em;margin:15px 0 12px}p{color:#bfc0c8;margin:0 0 15px}.metrics{display:flex;gap:35px;margin-bottom:14px;color:#bfc0c8}.metrics b{font-size:24px;color:#eee;margin-right:5px;font-weight:600}.green{color:#72c7a2!important}.amber{color:#dbbc79}table{border-collapse:collapse;width:100%;text-align:left;font-size:14px;margin:10px 0 12px}th{font-weight:500;color:#93949f;background:#252529}td,th{padding:10px 12px;border-bottom:1px solid #34343b}td{color:#c4c4cc}td b{font-weight:500}footer{font-size:12px;color:#868792;margin-top:16px}.bars{display:flex;gap:18px;height:143px;align-items:flex-end;margin:0 15px 2px}.bars>div{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px}.bars i{display:block;width:100%;background:#63bc9b;border-radius:3px 3px 0 0}.bars small{font-size:11px;color:#b4b5bd}
    </style><body><header>${report.kind}</header><h1>${report.title}</h1>${report.body()}</body></html>`;
}
