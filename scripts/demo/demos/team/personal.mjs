import { execFile as execFileCallback } from "node:child_process";
import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { happyAgentClientCreate } from "../../../../packages/happy-desktop-gym/sources/electron/index.ts";
import * as world from "./world.mjs";

const execFile = promisify(execFileCallback);

/*
 * Kirill's own computer: a standalone Happy Agent beside the gym's team
 * daemon, the one the window runs on. Its roster names one server connection
 * by URL, Happy Core, so the window's rail has exactly two servers: this one
 * and the team's. The window signs in to Happy Core with the gym's token for
 * Kirill (`HAPPY_DEMO_SERVER_CREDENTIALS`, attached by the demo's
 * server-sign-in patch) instead of the browser sign-in page.
 */

async function until(read, label, timeout = 60000) {
    const deadline = Date.now() + timeout;
    for (;;) {
        const value = await Promise.resolve()
            .then(read)
            .catch(() => undefined);
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`Team demo: timed out waiting for ${label}.`);
        await new Promise((settle) => setTimeout(settle, 250));
    }
}

/** A person's own picture, uploaded through the profile API like the app's crop dialog. */
export async function photoSet(client, file) {
    const data = await readFile(world.assetPath(file));
    const { profile } = await client.getProfile();
    if (profile.photo) return;
    await client.setProfilePhoto(
        { contentType: file.endsWith(".png") ? "image/png" : "image/jpeg", data },
        { ifMatch: profile.version },
    );
}

/**
 * Asks this computer's Chief of Staff, off camera, to wear a picture. The
 * screenplay answers with the Chief's real `set_node_avatar`, from a copy of
 * the image in the Chief's own folder.
 */
export async function nodeAvatarSet(client, file, mode) {
    const { config } = await client.getConfig();
    if (config.node?.avatar) return;
    const { bots } = await client.listBots();
    const chief = bots.find((bot) => bot.isAdmin && bot.status === "active");
    if (!chief) throw new Error("This computer has no Chief of Staff to set its picture.");
    const folder =
        chief.compute?.path ??
        (await client.getWorkspace(chief.workspaceId)).workspace.compute.path;
    const image = join(folder, `node-picture-${file}`);
    await copyFile(world.assetPath(file), image);
    await client.sendMessage(chief.agentId ?? chief.agent?.id, {
        id: cuid(),
        text: `Use ${image} as this computer's picture.`,
        mode,
    });
    await until(
        async () => (await client.getConfig()).config.node?.avatar,
        "the computer's picture",
        90000,
    );
}

export function cuid() {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let value = "m";
    for (let index = 0; index < 23; index += 1)
        value += alphabet[Math.floor(Math.random() * alphabet.length)];
    return value;
}

/** Starts Kirill's computer and returns what the stage needs to run the window on it. */
export async function personalOpen(gym) {
    const root = join(gym.paths.root, "personal");
    const p = {
        root,
        happyHome: join(root, "h"),
        home: join(root, "home"),
        tmp: join(root, "tmp"),
        projects: join(root, "projects"),
        workspaces: join(root, "ws"),
        socketPath: join(root, "h", "agent", "server.sock"),
        tokenPath: join(root, "h", "agent", "token"),
        config: join(root, "Happy", "Config", "happy.toml"),
    };
    for (const directory of [p.happyHome, p.home, p.tmp, p.projects, p.workspaces])
        await mkdir(directory, { recursive: true });
    await mkdir(join(root, "Happy", "Config"), { recursive: true });
    await mkdir(join(p.happyHome, "agent"), { recursive: true });
    const signIn = gym.memberSignIn(world.kirill);
    await writeFile(
        p.config,
        [
            "[settings]",
            "happy_integration = false",
            "",
            "[node]",
            `name = ${JSON.stringify(world.personalName)}`,
            "",
            "[feature.mobile_connector]",
            "enabled = false",
            "",
            `[connections.${world.connectionId}]`,
            `name = ${JSON.stringify(world.team.node)}`,
            `url = ${JSON.stringify(signIn.url)}`,
            "",
        ].join("\n"),
    );
    const command = join(gym.paths.bin, "happy-agent");
    const env = {
        HAPPY_HOME_DIR: p.happyHome,
        HOME: p.home,
        LANG: "C.UTF-8",
        LOGNAME: "happy-demo-gym",
        PATH: `${gym.paths.bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
        SHELL: "/bin/zsh",
        TERM: "xterm-256color",
        USER: "happy-demo-gym",
        HAPPY_AGENT_PROJECTS_DIRECTORY: p.projects,
        HAPPY_AGENT_SERVER_SOCKET_PATH: p.socketPath,
        HAPPY_AGENT_SERVER_TOKEN_PATH: p.tokenPath,
        HAPPY_AGENT_WORKSPACES_DIRECTORY: p.workspaces,
        HAPPY_GYM_INFERENCE_URL: gym.gateway.url,
        HAPPY_GYM_TOKEN: gym.gateway.token,
        OPENAI_API_KEY: "demo-gym-placeholder",
        TMPDIR: p.tmp,
    };
    await execFile(command, ["stop"], { cwd: root, env, timeout: 15000 }).catch(() => undefined);
    await unlink(p.socketPath).catch(() => undefined);
    // Written after the previous lifetime stopped: a stopping daemon persists its own.
    await writeFile(
        join(p.happyHome, "agent", "runtime.toml"),
        [
            "[providers.gym]",
            'type = "codex"',
            "enabled = false",
            "",
            "[providers.codex]",
            'type = "codex"',
            `include_models = ${JSON.stringify(world.models.codex)}`,
            "enabled = true",
            "auto_enable = true",
            "",
        ].join("\n"),
    );
    await execFile(command, ["start"], { cwd: root, env, timeout: 30000 });
    const token = await until(
        async () => (await readFile(p.tokenPath, "utf8")).trim(),
        "Kirill's computer's token",
        30000,
    );
    const client = await happyAgentClientCreate(p.socketPath, token);
    await until(async () => (await client.getHealth()).ready, "Kirill's computer to be ready");
    process.stdout.write(`  personal     ${world.personalName}, ${p.socketPath}\n`);

    const { profile } = await client.getProfile();
    if (profile.name !== "Kirill" || profile.email === null)
        await client.updateProfile(
            { name: "Kirill", email: "kirill@happy.example", mutationId: randomUUID() },
            { ifMatch: profile.version },
        );
    await photoSet(client, "kirill.jpg");
    if (!(await client.getOnboarding()).completed) await client.completeOnboarding();
    await nodeAvatarSet(client, "kirill.jpg", world.seedMode);

    return {
        client,
        paths: p,
        viteEnvironment: {
            HAPPY_HOME_DIR: p.happyHome,
            HAPPY_AGENT_SERVER_SOCKET_PATH: p.socketPath,
            HAPPY_AGENT_SERVER_TOKEN_PATH: p.tokenPath,
            HAPPY_DEMO_SERVER_CREDENTIALS: JSON.stringify({
                [world.connectionId]: { accessToken: signIn.accessToken, serverUrl: signIn.url },
            }),
        },
        async close() {
            await execFile(command, ["stop"], { cwd: root, env, timeout: 15000 }).catch(
                () => undefined,
            );
        },
    };
}
