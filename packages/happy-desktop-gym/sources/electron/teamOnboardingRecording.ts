import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { ElectronApplication, Locator, Page } from "playwright";

import { happyAgentRuntimeCreate } from "./happyAgentRuntime.js";
import {
    gymElectronInvisibleAssert,
    gymElectronLaunch,
    gymElectronVideoRecord,
    type GymElectronVideoResult,
} from "./launch.js";
import { electronEntrypointResolve, gymRunPathsCreate } from "./paths.js";
import {
    gymPersonaAnswersCreate,
    gymPersonaDriverCreate,
    gymPersonaTurn,
    type GymPersona,
    type GymPersonaDriver,
} from "./persona.js";
import { linuxDisplayEnvironment } from "./workloads.js";

/** The machine's own Happy Agent has no assistant; the team server brings the AI. */
const NO_PROVIDERS = "[settings]\nhappy_integration = false\nmenu_bar = false\n";
const IDLE_END_MS = 60_000;

/**
 * Someone setting up their team's server: they name its Chief of Staff, keep
 * the free model, describe the first task in words, start it without a
 * machine, and leave the phone for later. Nothing that needs a vendor's, a
 * machine's or a phone's own setup is pressed.
 */
export const GYM_PERSONA_TEAM_OWNER: GymPersona = {
    name: "Olga Petrova",
    email: "olga@acme.example",
    prefers: [
        /^Juno$/u,
        /^Keep the free model/u,
        /^Invite later/u,
        /^Describe the work instead/u,
        /^Start without it/u,
        /^Later$|^Not now/u,
        /^Continue/u,
    ],
    avoids: [
        /sign-in page/iu,
        /^Cancel$/u,
        /^ChatGPT$|^Claude|^API key/u,
        /^It's connected/u,
        /^I've added one/u,
        /^It's added/u,
        /^It's on my phone/u,
    ],
    answers: [
        {
            when: /describe|which work|need done|work on|in a sentence/iu,
            text: "Fix the flaky sign-in test in our web app. It fails about one run in five.",
        },
    ],
    wordsPerMinute: 260,
    charactersPerSecond: 9,
};

/** An admin who joined before the owner set the team up, and does it for them. */
export const GYM_PERSONA_TEAM_ADMIN: GymPersona = {
    ...GYM_PERSONA_TEAM_OWNER,
    name: "Ada Okafor",
    email: "ada@example.com",
    prefers: [/^Atlas$/u, ...GYM_PERSONA_TEAM_OWNER.prefers.slice(1)],
};

/** A teammate who joined with an invite: they take the first task offered and leave the phone for later. */
export const GYM_PERSONA_TEAMMATE: GymPersona = {
    ...GYM_PERSONA_TEAM_OWNER,
    name: "Sam Rivera",
    email: "sam@example.com",
    prefers: [/^Later$|^Not now/u],
    answers: [
        {
            when: /describe|which work|need done|work on|in a sentence/iu,
            text: "I'll pick up the sign-in test fix with the team.",
        },
    ],
};

/** A viewer, who only reads: there is nothing for them to answer. */
export const GYM_PERSONA_VIEWER: GymPersona = {
    ...GYM_PERSONA_TEAM_OWNER,
    name: "Vera Lind",
    email: "vera@example.com",
    prefers: [/^Later$|^Not now/u],
    answers: [],
};

export interface GymTeamOnboardingRecording {
    readonly root: string;
    readonly video: GymElectronVideoResult;
    readonly screenshots: readonly string[];
    readonly turns: number;
    readonly ended: "finished" | "idle" | "limit" | "failed";
    readonly failure?: string;
    /** The invite codes the owner made, with the role each was made for. */
    readonly invites: readonly { readonly role: string; readonly code: string }[];
}

/**
 * How the person reaches the team: a server already listed by its address, or
 * Happy Cloud's Create a team or Join a team, from the welcome or from the
 * rail's "+" once this machine is set up.
 */
export type GymTeamWay =
    | {
          readonly kind: "listed";
          /** The team server, such as `http://127.0.0.1:39310/`. */
          readonly serverUrl: string;
          readonly serverName: string;
      }
    | {
          readonly kind: "cloud";
          readonly from: "welcome" | "rail";
          readonly path: "create" | "join";
          /** The team's name, without the "@". */
          readonly team: string;
          /** Joining only: the invite code, typed on the join page and nowhere else. */
          readonly code?: string;
          /**
           * Where Happy Cloud lives for this run, handed to main as a development
           * run's `HAPPY_CLOUD_ACCOUNTS_URL` and `HAPPY_CLOUD_SERVER_URL`.
           */
          readonly accountsUrl: string;
          readonly serverUrlTemplate: string;
      };

/**
 * Records a person's first run on a team: the desktop starts on this machine's
 * own Happy Agent, already set up. They reach the team the way `way` says,
 * sign in, save the profile the server asks for, and take the onboarding the
 * server runs in a conversation.
 *
 * A sign-in page is a browser page on any real machine. Here the gym catches
 * the page main would open, signs in on it as the given account, and hands
 * main the `happy://oauth/callback` address the page redirects to, as the
 * system would. Nothing in main is replaced but the browser it opens.
 */
export async function gymTeamOnboardingRecord(options: {
    readonly out: string;
    readonly way: GymTeamWay;
    readonly login: string;
    readonly password: string;
    readonly persona?: GymPersona;
    /**
     * The roles to make invite codes for, by name, when the server's invite
     * shows; the owner then says they are done inviting rather than later.
     */
    readonly invites?: readonly string[];
    readonly limitMs?: number;
}): Promise<GymTeamOnboardingRecording> {
    if (extname(options.out) !== ".mkv") throw new Error("The recording is H.264 in a .mkv file.");
    const base = options.persona ?? GYM_PERSONA_TEAM_OWNER;
    const persona: GymPersona =
        options.invites && options.invites.length > 0
            ? {
                  ...base,
                  invites: options.invites,
                  prefers: [/^Done inviting/u, ...base.prefers],
                  avoids: [...base.avoids, /^Invite later/u],
              }
            : base;
    const limitMs = options.limitMs ?? 8 * 60_000;
    const { paths } = await gymRunPathsCreate("smoke");
    // This machine's own Happy Agent counts as already in use, so the take is
    // the team server's onboarding alone.
    await mkdir(join(paths.happyHome, "agent"), { recursive: true });
    await writeFile(join(paths.happyHome, "agent", "onboarding-v0"), "");
    const runtime = await happyAgentRuntimeCreate(paths, undefined, NO_PROVIDERS);
    const screenshots: string[] = [];
    const shot = async (page: Page, label: string) => {
        const path = join(
            dirname(options.out),
            `${basename(options.out, ".mkv")}-${String(screenshots.length + 1).padStart(2, "0")}-${label}.png`,
        );
        await page.screenshot({ path }).catch(() => undefined);
        screenshots.push(path);
    };
    try {
        const way = options.way;
        await runtime.client.profileNameSet(persona.name);
        if (way.kind === "listed") await runtime.client.serverAdd(way.serverUrl, way.serverName);
        const entrypoint = electronEntrypointResolve(paths.workspaceRoot);
        const app = await gymElectronLaunch({
            args: [`--user-data-dir=${paths.electronUserData}`, entrypoint.main],
            cwd: paths.workspaceRoot,
            env: {
                ...runtime.environment,
                ...linuxDisplayEnvironment(),
                HAPPY_DESKTOP_GYM_ELECTRON_USER_DATA: paths.electronUserData,
                ...(way.kind === "cloud"
                    ? {
                          HAPPY_CLOUD_ACCOUNTS_URL: way.accountsUrl,
                          HAPPY_CLOUD_SERVER_URL: way.serverUrlTemplate,
                      }
                    : {}),
            },
            executablePath: entrypoint.executable,
            timeout: 60_000,
        });
        try {
            await browserCatch(app);
            const page = await app.firstWindow();
            await page.waitForLoadState("domcontentloaded");
            await gymElectronInvisibleAssert(app);
            const welcome = page.locator('[data-happy-desktop-ui="welcome-screen"]');
            await welcome.waitFor({ state: "visible", timeout: 45_000 });
            await page.evaluate(() => document.fonts.ready);
            const video = await gymElectronVideoRecord(page, { path: options.out, codec: "h264" });
            const driver = await gymPersonaDriverCreate(page, persona);
            let turns = 0;
            const answers = gymPersonaAnswersCreate();
            let ended: GymTeamOnboardingRecording["ended"] = "limit";
            let failure: string | undefined;
            let recorded: GymElectronVideoResult;
            try {
                await driver.read(await welcome.innerText());
                await shot(page, "welcome");
                if (way.kind === "listed") {
                    await driver.press(welcome.locator(".happy-welcome-screen__action").first());
                    // This machine is already set up, so the interface follows,
                    // with the team server in the rail, signed out.
                    const server = page.locator(
                        `button.happy-connections__item[aria-label^="${way.serverName}"]`,
                    );
                    await server.waitFor({ state: "visible", timeout: 60_000 });
                    await driver.pause(1_500, 2_200);
                    await shot(page, "interface");
                    await driver.press(server);
                    const signIn = page.getByRole("button", { name: /^Sign in/u }).first();
                    await signIn.waitFor({ state: "visible", timeout: 60_000 });
                    await driver.pause(1_500, 2_200);
                    await shot(page, "signed-out");
                    await driver.press(signIn);
                    await browserSignIn(app, driver, options.login, options.password);
                    await driver.pause(2_000, 2_600);
                    await shot(page, "signed-in");
                } else {
                    await cloudTeamReach(app, page, driver, way, options, shot);
                }
                await profileSave(page, driver, persona);
                const started = Date.now();
                let idleSince = Date.now();
                let focusSeen = false;
                while (Date.now() - started < limitMs) {
                    const focused = await onboardingFocused(page);
                    focusSeen ||= focused;
                    if (await onboardingFinished(page, { focused, focusSeen })) {
                        ended = "finished";
                        await driver.pause(1_500, 2_000);
                        await shot(page, "finished");
                        await driver.pause(6_000, 7_000);
                        break;
                    }
                    if (await gymPersonaTurn(page, persona, driver, answers)) {
                        turns += 1;
                        idleSince = Date.now();
                        await driver.pause(1_200, 1_800);
                        await shot(page, `turn-${String(turns)}`);
                        continue;
                    }
                    // A reply being written, or tools still running under it.
                    const streaming =
                        (await page
                            .locator('[data-happy-desktop-ui="message"][aria-busy="true"]')
                            .count()) > 0 ||
                        (await page
                            .getByRole("button", { name: "Stop the agent" })
                            .first()
                            .isVisible()
                            .catch(() => false));
                    if (streaming) idleSince = Date.now();
                    if (Date.now() - idleSince > IDLE_END_MS) {
                        ended = "idle";
                        break;
                    }
                    await driver.pause(400, 700);
                }
                await shot(page, "end");
            } catch (error) {
                ended = "failed";
                failure = error instanceof Error ? error.message : String(error);
                await shot(page, "failed");
                await writeFile(
                    join(dirname(options.out), `${basename(options.out, ".mkv")}-failed.html`),
                    await page.content().catch(() => ""),
                );
            } finally {
                recorded = await video.stop();
            }
            return {
                root: paths.root,
                video: recorded,
                screenshots,
                turns,
                ended,
                invites: answers.invites,
                ...(failure === undefined ? {} : { failure }),
            };
        } finally {
            await app.close().catch(() => undefined);
        }
    } finally {
        await runtime.stop();
    }
}

/** Whether onboarding holds the window in focus chat. */
async function onboardingFocused(page: Page): Promise<boolean> {
    return (await page.locator('[data-happy-desktop-ui="app-shell"][data-focus]').count()) > 0;
}

/**
 * Whether onboarding has finished, as the window shows it, with nothing
 * streaming: focus chat let the window go, or the model's `finish_onboarding`
 * call is drawn, or a flow finished at once (a viewer's welcome) left a
 * message in an unfocused window. The gym holds no token for the team server
 * to read the flow itself.
 */
async function onboardingFinished(
    page: Page,
    focus: { readonly focused: boolean; readonly focusSeen: boolean },
): Promise<boolean> {
    const streaming = await page
        .locator('[data-happy-desktop-ui="message"][aria-busy="true"]')
        .count();
    if (streaming > 0) return false;
    if (focus.focusSeen && !focus.focused) return true;
    if (
        await page
            .getByText("Finish onboarding", { exact: true })
            .first()
            .isVisible()
            .catch(() => false)
    )
        return true;
    return (
        !focus.focused &&
        (await page
            .locator('[data-happy-desktop-ui="message"]:not([data-own])')
            .first()
            .isVisible()
            .catch(() => false))
    );
}

/**
 * Reaches a Happy Cloud team the way a person would: Create a team or Join a
 * team on the welcome, or from the rail's "+" once this machine is set up;
 * Happy Cloud's sign-in in the browser; then the team's name, and for joining
 * the invite code, on the team's page; until the page lets the window go.
 */
async function cloudTeamReach(
    app: ElectronApplication,
    page: Page,
    driver: GymPersonaDriver,
    way: Extract<GymTeamWay, { kind: "cloud" }>,
    account: { readonly login: string; readonly password: string },
    shot: (page: Page, label: string) => Promise<void>,
): Promise<void> {
    const label = way.path === "create" ? "Create a team" : "Join a team";
    const welcome = page.locator('[data-happy-desktop-ui="welcome-screen"]');
    if (way.from === "welcome") {
        await driver.press(welcome.getByRole("button", { name: label, exact: true }));
    } else {
        await driver.press(welcome.locator(".happy-welcome-screen__action").first());
        const add = page.getByRole("button", { name: "Add a team", exact: true });
        await add.waitFor({ state: "visible", timeout: 60_000 });
        await driver.pause(1_500, 2_200);
        await shot(page, "interface");
        await driver.press(add);
        const item = page
            .locator('[data-testid="connection-menu"]')
            .getByText(label, { exact: true });
        await item.waitFor({ state: "visible", timeout: 10_000 });
        await driver.pause(500, 900);
        await driver.press(item);
    }
    const screen = page.locator('[data-happy-desktop-ui="team-setup-screen"]');
    await screen.waitFor({ state: "visible", timeout: 30_000 });
    await driver.pause(1_200, 1_800);
    await shot(page, "signing-in");
    await browserSignIn(app, driver, account.login, account.password);
    if (way.path === "create") {
        const name = screen.getByRole("textbox", { name: "Team name" });
        await name.waitFor({ state: "visible", timeout: 30_000 });
        await driver.read(await screen.innerText());
        await driver.type(name, way.team);
        const create = screen.getByRole("button", { name: "Create team", exact: true });
        await expectEnabled(create, 20_000);
        await driver.pause(600, 1_000);
        await shot(page, "team-named");
        await driver.press(create);
    } else {
        if (way.code === undefined) throw new Error("Joining a team takes an invite code.");
        const team = screen.getByRole("textbox", { name: "Team", exact: true });
        await team.waitFor({ state: "visible", timeout: 30_000 });
        await driver.read(await screen.innerText());
        await driver.type(team, way.team);
        await driver.pause(400, 800);
        await driver.type(screen.getByRole("textbox", { name: "Invite code" }), way.code);
        const join = screen.getByRole("button", { name: "Join team", exact: true });
        await expectEnabled(join, 20_000);
        await driver.pause(600, 1_000);
        await shot(page, "invite-entered");
        await driver.press(join);
    }
    await screen.waitFor({ state: "hidden", timeout: 90_000 });
    await driver.pause(1_500, 2_200);
    await shot(page, "team-opened");
}

async function expectEnabled(target: Locator, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await target.isEnabled().catch(() => false))) {
        if (Date.now() > deadline) throw new Error("The page's button never became available.");
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
}

/**
 * Signs in on the sign-in page main just opened in the browser, as the account,
 * and hands main the address it redirects to. The browser tab a person would see
 * is not recorded; its sign-in takes them a few seconds.
 */
async function browserSignIn(
    app: ElectronApplication,
    driver: GymPersonaDriver,
    login: string,
    password: string,
): Promise<void> {
    const authorization = await browserOpened(app, 30_000);
    const callback = await devSignIn(authorization, login, password);
    await driver.pause(2_500, 3_500);
    await app.evaluate(({ app: electronApp }, url) => {
        electronApp.emit("open-url", { preventDefault: () => undefined }, url);
    }, callback);
}

/** Keeps the pages main would open in the person's browser, rather than opening them. */
async function browserCatch(app: ElectronApplication): Promise<void> {
    await app.evaluate(({ shell }) => {
        const opened: string[] = [];
        (globalThis as { gymOpened?: string[] }).gymOpened = opened;
        shell.openExternal = async (url: string) => {
            opened.push(url);
        };
    });
}

async function browserOpened(app: ElectronApplication, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        // Each page is taken once, so a later sign-in waits for its own.
        const found = await app.evaluate(() => {
            const opened = (globalThis as { gymOpened?: string[] }).gymOpened ?? [];
            const index = opened.findIndex((url) => url.includes("/authorize"));
            return index < 0 ? undefined : opened.splice(index, 1)[0];
        });
        if (found !== undefined) return found;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Main opened no sign-in page.");
}

/**
 * Signs in on the sign-in page main opened, as its password form would, and
 * answers with the address it redirects the browser to. The form carries the
 * page's own request, and both the development page's field names and Happy
 * Cloud accounts' hidden test-account form.
 */
async function devSignIn(authorization: string, login: string, password: string): Promise<string> {
    const url = new URL(authorization);
    const form = new URLSearchParams(url.searchParams);
    form.set("username", login);
    form.set("login", login);
    form.set("password", password);
    form.set("action", "password");
    const response = await fetch(`${url.origin}${url.pathname}`, {
        method: "POST",
        body: form,
        redirect: "manual",
    });
    const location = response.headers.get("location");
    if (location === null || !location.startsWith("happy://oauth/callback"))
        throw new Error(`The sign-in page answered ${String(response.status)} without a callback.`);
    return location;
}

/**
 * Takes the profile the server asks a new member for, when it asks. The
 * window's welcome was already read, so the server never shows its own.
 */
async function profileSave(page: Page, driver: GymPersonaDriver, persona: GymPersona) {
    const profile = page.locator('[data-testid="profile-setup-screen"]');
    // A profile taken from the account never asks: the conversation shows instead.
    const conversation = page.locator('[data-happy-desktop-ui="message"]').first();
    const shown = await profile
        .or(conversation)
        .first()
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => profile.isVisible())
        .catch(() => false);
    if (!shown) return;
    await driver.pause(800, 1_400);
    const name = profile.getByRole("textbox", { name: "Name" });
    const email = profile.getByRole("textbox", { name: "Git email" });
    // A sign-in that knew them fills these in already.
    if ((await name.inputValue()).trim() === "") await driver.type(name, persona.name);
    if ((await email.inputValue()).trim() === "") await driver.type(email, persona.email);
    await driver.pause(400, 800);
    await driver.press(profile.getByRole("button", { name: "Create profile" }));
}
