import type {
    ConversationEntry,
    HappyAgentArtifactId,
    HappyAgentInlineArtifactsSnapshot,
} from "happy-desktop-state";
import { artifactPageAppModeStyle } from "../../src/artifactPageHost";

/**
 * A tiny canvas game written the way an agent writes an app-mode artifact: it
 * declares itself an app, sizes itself to the viewport, keeps its score clear
 * of the host's insets, and takes the pointer, touch, and the keyboard. It
 * draws one still frame until it is started, so a capture is the same every
 * time.
 */
export const ARCADE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="happy-page-mode" content="app">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Paddle</title>
<style>
:root { color-scheme: dark; }
body { background: #0d1117; color: #e6edf3; font-family: sans-serif; touch-action: none; user-select: none; }
canvas { display: block; width: 100%; height: 100%; }
.score {
    position: fixed;
    top: calc(16px + var(--happy-app-inset-top, 0px));
    right: calc(20px + var(--happy-app-inset-right, 0px));
    font-size: 15px;
    font-weight: 600;
    opacity: 0.8;
}
</style>
</head>
<body>
<canvas id="court"></canvas>
<div class="score" id="score">Score 0</div>
<script>
const court = document.getElementById("court");
const scoreLabel = document.getElementById("score");
const context = court.getContext("2d");
let width = 0;
let height = 0;
let playing = false;
let score = 0;
let paddle = 0.5;
let ball = { x: 0.5, y: 0.4, vx: 0.32, vy: 0.42 };
let last = 0;

function resize() {
    const ratio = window.devicePixelRatio || 1;
    width = court.clientWidth;
    height = court.clientHeight;
    court.width = Math.round(width * ratio);
    court.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
}

function draw() {
    context.fillStyle = "#0d1117";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(230, 237, 243, 0.08)";
    context.setLineDash([6, 10]);
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    context.setLineDash([]);
    const paddleWidth = Math.max(96, width * 0.16);
    context.fillStyle = "#58a6ff";
    context.beginPath();
    context.roundRect(paddle * width - paddleWidth / 2, height - 40, paddleWidth, 12, 6);
    context.fill();
    context.fillStyle = "#f0883e";
    context.beginPath();
    context.arc(ball.x * width, ball.y * height, 10, 0, Math.PI * 2);
    context.fill();
    if (!playing) {
        context.fillStyle = "#e6edf3";
        context.textAlign = "center";
        context.font = "600 28px sans-serif";
        context.fillText("Paddle", width / 2, height / 2 - 48);
        context.font = "16px sans-serif";
        context.fillStyle = "rgba(230, 237, 243, 0.7)";
        context.fillText("Click, tap, or press Space to start", width / 2, height / 2 - 16);
    }
}

function step(now) {
    if (!playing) return;
    const elapsed = Math.min(0.05, (now - last) / 1000);
    last = now;
    ball.x += ball.vx * elapsed;
    ball.y += ball.vy * elapsed;
    if (ball.x < 0.01 || ball.x > 0.99) ball.vx = -ball.vx;
    if (ball.y < 0.02) ball.vy = Math.abs(ball.vy);
    const paddleHalf = Math.max(96, width * 0.16) / 2 / width;
    if (ball.y * height > height - 50 && Math.abs(ball.x - paddle) < paddleHalf && ball.vy > 0) {
        ball.vy = -Math.abs(ball.vy) * 1.04;
        score += 1;
        scoreLabel.textContent = "Score " + score;
    }
    if (ball.y > 1.05) {
        playing = false;
        ball = { x: 0.5, y: 0.4, vx: 0.32, vy: 0.42 };
    }
    draw();
    requestAnimationFrame(step);
}

function start() {
    if (playing) return;
    playing = true;
    score = 0;
    scoreLabel.textContent = "Score 0";
    last = performance.now();
    requestAnimationFrame(step);
}

court.addEventListener("pointermove", (event) => { paddle = event.clientX / width; draw(); });
court.addEventListener("pointerdown", (event) => { paddle = event.clientX / width; start(); });
window.addEventListener("keydown", (event) => {
    if (event.key === " ") start();
    if (event.key === "ArrowLeft") paddle = Math.max(0, paddle - 0.05);
    if (event.key === "ArrowRight") paddle = Math.min(1, paddle + 0.05);
    draw();
});
window.addEventListener("resize", resize);
resize();
</script>
</body>
</html>`;

/**
 * The game as the host's guest would show it: the app-mode rules the host
 * inserts and the attribute it sets on the root, written into the document,
 * since Blueprint has no guest to insert them into.
 */
export const ARCADE_HOSTED_HTML = ARCADE_HTML.replace(
    "<html>",
    '<html data-happy-page-mode="app">',
).replace("<head>", `<head><style>${artifactPageAppModeStyle()}</style>`);

/**
 * What the host's guest would run for the game. Blueprint has no guest, so it
 * runs the page in a frame of its own, with the app-mode rules the host would
 * insert written into it.
 */
export function ArcadeStandIn() {
    return (
        <iframe
            sandbox="allow-scripts"
            srcDoc={ARCADE_HOSTED_HTML}
            style={{ display: "flex", flex: "1 1 0%", width: "100%", border: 0 }}
            title="Paddle"
        />
    );
}

export const ARCADE_ID = "arcade" as HappyAgentArtifactId;

/** The call that made the game, as the transcript holds it. */
export const arcadeEntry: ConversationEntry = {
    kind: "agentActivity",
    id: "arcade-create",
    sequence: "arcade-create",
    activity: {
        kind: "tool",
        tool: {
            toolCallId: "arcade-create",
            toolName: "create_artifact",
            arguments: { title: "Paddle", type: "html" },
            status: "success",
            failed: false,
            presentation: {
                type: "artifact",
                artifactId: ARCADE_ID,
                version: 1,
                artifactType: "html",
                title: "Paddle",
                shows: "latest",
            },
        },
    },
};

/** The game as the transcript's artifact store holds it: an app. */
export const arcadeInline: HappyAgentInlineArtifactsSnapshot = new Map([
    [
        ARCADE_ID,
        {
            type: "ready",
            title: "Paddle",
            status: "active",
            artifactType: "html",
            latestVersion: 1,
            display: null,
            pageMode: "app",
        },
    ],
]);
