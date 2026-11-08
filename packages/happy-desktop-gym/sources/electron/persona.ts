import type { Locator, Page } from "playwright";

/**
 * A made-up person a recording follows: who they say they are, which of a
 * reply's buttons they reach for, and what they type when a reply asks them
 * something. Every value is fixture data.
 */
export interface GymPersona {
    readonly name: string;
    readonly email: string;
    /** Button labels this person reaches for first, in order, when a reply offers several. */
    readonly prefers: readonly RegExp[];
    /** Labels this person never presses, such as anything that opens a vendor's sign-in page. */
    readonly avoids: readonly RegExp[];
    /** What they type when the composer is open and the last reply matches. */
    readonly answers: readonly { readonly when: RegExp; readonly text: string }[];
    /** How fast they read a reply before acting on it. */
    readonly wordsPerMinute: number;
    /** How fast they type, in characters per second. */
    readonly charactersPerSecond: number;
    /**
     * The roles this person makes an invite code for, by their names, in
     * order, when a reply shows a live invite. Absent, they make none.
     */
    readonly invites?: readonly string[];
    /**
     * What this person ticks on each checklist they submit, in order: the rows
     * whose label matches are ticked and the rest are not. Past the last
     * entry, or absent, they keep what is ticked already.
     */
    readonly ticks?: readonly (readonly RegExp[])[];
    /**
     * This person types an answer rather than pressing a button whenever the
     * composer takes one. Where it doesn't, they try it once, read why, and press.
     */
    readonly typesFirst?: boolean;
}

/** Someone new to Happy, setting it up on their own computer. */
export const GYM_PERSONA_NEW_USER: GymPersona = {
    name: "Alex Rivera",
    email: "alex@example.com",
    prefers: [
        /^Claude/u,
        /^Codex|^ChatGPT/u,
        /^Continue|^Next|^Let's go|^Get started/u,
        /^Skip/u,
        /^Later|^Not now|^Maybe later/u,
    ],
    avoids: [/sign-in page/iu, /^Cancel$/u],
    answers: [
        { when: /name|call you|email/iu, text: "I'm Alex Rivera, alex@example.com" },
        { when: /project/iu, text: "Let's skip the project for now." },
        { when: /phone/iu, text: "Not now, thanks." },
    ],
    wordsPerMinute: 260,
    charactersPerSecond: 9,
};

/**
 * Someone setting Happy up on a computer they already work on: Git knows
 * them, and they let their Chief of Staff look at their recent work and pick
 * the first task from it. They can't pair a phone in a recording, so the
 * phone waits.
 */
export const GYM_PERSONA_WORKER: GymPersona = {
    ...GYM_PERSONA_NEW_USER,
    prefers: [
        /^Claude/u,
        /^Look at my recent work/u,
        /^Later$|^Pair later|^Not now|^Maybe later/u,
        /^Continue|^Next|^Let's go|^Get started/u,
    ],
    avoids: [...GYM_PERSONA_NEW_USER.avoids, /^Skip for now$/u, /^Something else$/u],
    // Git says who they are, and every question has a button they press.
    answers: [],
};

/**
 * Someone whose first AI doesn't answer: they choose a key that turns out to
 * be bad, read why, and choose the sign-in that works.
 */
export const GYM_PERSONA_RECOVERS: GymPersona = {
    ...GYM_PERSONA_NEW_USER,
    ticks: [[/^OpenAI API key/u], [/^Claude Code token/u]],
};

/**
 * Someone who would rather type than press: every question they can answer in
 * words, they answer in words.
 */
export const GYM_PERSONA_TYPIST: GymPersona = {
    ...GYM_PERSONA_NEW_USER,
    typesFirst: true,
    answers: [
        { when: /phone/iu, text: "Not now, thanks. Maybe later." },
        {
            when: /recent(ly)? work|projects you|Git history|working on/iu,
            text: "Skip that for now.",
        },
        { when: /name and email|your name|call you/iu, text: "I'm Alex Rivera, alex@example.com" },
        {
            when: /goal|task|anything else|ready/iu,
            text: "That's all for now, I'm done setting up.",
        },
    ],
};

/**
 * Drives a hidden window the way a person would: it reads before it acts,
 * moves the pointer to a control before pressing it, and types one character
 * at a time. Input goes into the page as CDP events; the machine's own cursor
 * and keyboard are never touched. A drawn cursor follows the pointer so a
 * recording shows where each press lands.
 */
export interface GymPersonaDriver {
    /** Waits as long as reading `text` takes this person. */
    read(text: string): Promise<void>;
    /** A short, slightly uneven pause, as between two decisions. */
    pause(minMs: number, maxMs: number): Promise<void>;
    press(target: Locator): Promise<void>;
    type(target: Locator, text: string): Promise<void>;
}

export async function gymPersonaDriverCreate(
    page: Page,
    persona: GymPersona,
    options: { readonly seed?: number; readonly cursor?: boolean } = {},
): Promise<GymPersonaDriver> {
    let state = options.seed ?? 0x2f6b_1d3a;
    // Seeded, so two recordings of one persona move and wait alike.
    const random = (): number => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return state / 0x1_0000_0000;
    };
    const between = (min: number, max: number) => min + (max - min) * random();
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const viewport = await page.evaluate(() => ({ x: window.innerWidth, y: window.innerHeight }));
    let pointer = { x: viewport.x / 2, y: viewport.y * 0.66 };
    if (options.cursor !== false) await cursorInstall(page, pointer);
    const moveTo = async (x: number, y: number): Promise<void> => {
        const distance = Math.hypot(x - pointer.x, y - pointer.y);
        // Roughly Fitts: a longer reach takes longer, never instant.
        const steps = Math.max(8, Math.round(distance / 14));
        await page.mouse.move(x, y, { steps });
        pointer = { x, y };
    };
    const press = async (target: Locator): Promise<void> => {
        await target.scrollIntoViewIfNeeded();
        const box = await target.boundingBox();
        if (!box) throw new Error("The control to press is not on screen.");
        // Somewhere inside the control, not its exact centre.
        await moveTo(
            box.x + box.width * between(0.35, 0.65),
            box.y + box.height * between(0.4, 0.6),
        );
        await sleep(between(180, 420));
        await page.mouse.down();
        await sleep(between(60, 120));
        await page.mouse.up();
    };
    return {
        read: (text) => {
            const words = text.trim().split(/\s+/u).filter(Boolean).length;
            return sleep(Math.min(9_000, 700 + (words / persona.wordsPerMinute) * 60_000));
        },
        pause: (minMs, maxMs) => sleep(between(minMs, maxMs)),
        press,
        async type(target, text) {
            await press(target);
            await sleep(between(250, 500));
            for (const character of text) {
                await page.keyboard.type(character);
                const base = 1_000 / persona.charactersPerSecond;
                // A space or punctuation is a small breath.
                await sleep(base * between(0.6, 1.5) + (/[\s,.]/u.test(character) ? base : 0));
            }
        },
    };
}

/** A drawn arrow that follows the page's pointer, for recordings only. */
async function cursorInstall(page: Page, at: { x: number; y: number }): Promise<void> {
    await page.evaluate(({ x, y }) => {
        if (document.getElementById("gym-persona-cursor")) return;
        const cursor = document.createElement("div");
        cursor.id = "gym-persona-cursor";
        cursor.style.cssText = [
            "position:fixed",
            "left:0",
            "top:0",
            "width:18px",
            "height:18px",
            "pointer-events:none",
            "z-index:2147483647",
            "transition:transform 40ms linear",
            "clip-path:polygon(0 0, 0 100%, 30% 72%, 52% 100%, 66% 92%, 44% 66%, 82% 66%)",
            "background:#111",
            "filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)",
        ].join(";");
        cursor.style.transform = `translate(${String(x)}px, ${String(y)}px)`;
        document.documentElement.append(cursor);
        window.addEventListener(
            "mousemove",
            (event) => {
                cursor.style.transform = `translate(${String(event.clientX)}px, ${String(event.clientY)}px)`;
            },
            { capture: true, passive: true },
        );
    }, at);
}

/** What the open conversation offers to act on right now. */
export type GymChatOffer =
    | { readonly kind: "buttons"; readonly block: Locator; readonly labels: readonly string[] }
    | { readonly kind: "code"; readonly block: Locator }
    | { readonly kind: "checklist"; readonly block: Locator }
    | { readonly kind: "composer"; readonly composer: Locator; readonly prompt: string }
    | { readonly kind: "none" };

/** A table is drawn inside its checklist, so the checklist stands for both. */
const LIVE_BLOCK = [
    '[data-happy-desktop-ui="chat-action-buttons"]:not([data-locked])',
    '[data-happy-desktop-ui="chat-action-checklist"]:not([data-locked])',
    '[data-happy-desktop-ui="chat-action-code"]:not([data-locked])',
].join(", ");

/**
 * Reads the conversation on screen the way the person would: the newest block
 * that still takes a press, or the composer when it is open and the last reply
 * asks for something this persona has an answer to.
 */
export async function gymChatOfferRead(
    page: Page,
    persona: GymPersona,
    answers: GymPersonaAnswers = gymPersonaAnswersCreate(),
): Promise<GymChatOffer> {
    if (persona.typesFirst) {
        const typed = await composerOffer(page, persona, answers);
        if (typed) return typed;
    }
    const blocks = page.locator(LIVE_BLOCK);
    const count = await blocks.count();
    for (let index = count - 1; index >= 0; index--) {
        const block = blocks.nth(index);
        if (!(await block.isVisible().catch(() => false))) continue;
        const kind = await block.getAttribute("data-happy-desktop-ui");
        const enabled = block.locator("button:not([disabled])");
        if ((await enabled.count()) === 0 && kind !== "chat-action-code") continue;
        if (kind === "chat-action-code") return { kind: "code", block };
        if (kind === "chat-action-checklist") return { kind: "checklist", block };
        return { kind: "buttons", block, labels: await enabled.allInnerTexts() };
    }
    return (await composerOffer(page, persona, answers)) ?? { kind: "none" };
}

/** The open composer, when the last reply asks something this person still has an answer to. */
async function composerOffer(
    page: Page,
    persona: GymPersona,
    answers: GymPersonaAnswers,
): Promise<GymChatOffer | undefined> {
    const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
    if (
        !(await composer.isVisible().catch(() => false)) ||
        !(await composer.isEnabled().catch(() => false))
    )
        return undefined;
    // Nothing is asked while a reply is still being written or its tools run.
    if ((await page.locator('[data-happy-desktop-ui="message"][aria-busy="true"]').count()) > 0)
        return undefined;
    if (
        await page
            .getByRole("button", { name: "Stop the agent" })
            .first()
            .isVisible()
            .catch(() => false)
    )
        return undefined;
    const replies = page.locator('[data-happy-desktop-ui="message"]:not([data-own])');
    const last = (await replies.count()) > 0 ? await replies.last().innerText() : "";
    if (persona.answers.some((answer) => answer.when.test(last) && !answers.typed.has(answer.text)))
        return { kind: "composer", composer, prompt: last };
    return undefined;
}

/** How many times one label may be pressed in a run: a question can come back, a loop cannot. */
const LABEL_PRESSES_MAX = 3;

/**
 * What this person has said in a run: how often they pressed each label, and
 * what they typed. A label pressed `LABEL_PRESSES_MAX` times is not pressed
 * again, so a person who cannot finish a step tries the others and then stops
 * rather than circling, while "Not now" still answers each optional question.
 */
export type GymPersonaAnswers = {
    readonly presses: Map<string, number>;
    readonly typed: Set<string>;
    /** The invite codes made so far, with the role each was made for. */
    readonly invites: { readonly role: string; readonly code: string }[];
    /** How many checklists this person has submitted. */
    checklists: number;
    /** Whether a person who types first has already found the composer closed. */
    composerTried: boolean;
};

export function gymPersonaAnswersCreate(): GymPersonaAnswers {
    return {
        presses: new Map(),
        typed: new Set(),
        invites: [],
        checklists: 0,
        composerTried: false,
    };
}

/**
 * Makes the next invite this person wants in the live invite figure on screen:
 * picks its role, creates the code, reads it and copies it, as they would to
 * send it on. Answers whether there was one to make.
 */
async function gymPersonaInvite(
    page: Page,
    persona: GymPersona,
    driver: GymPersonaDriver,
    answers: GymPersonaAnswers,
): Promise<boolean> {
    const role = persona.invites?.[answers.invites.length];
    if (role === undefined) return false;
    const figure = page.locator('[data-happy-desktop-ui="chat-figure-invite"]').last();
    if (!(await figure.isVisible().catch(() => false))) return false;
    const code = figure.locator(".happy-chat-figure__invite-code");
    const another = figure.getByRole("button", { name: "Make another" });
    // A code still showing from the last invite is put away first.
    if (await code.isVisible().catch(() => false)) {
        if (!(await another.isEnabled().catch(() => false))) return false;
        await driver.press(another);
    }
    const create = figure.getByRole("button", { name: "Create invite code" });
    if (!(await create.isEnabled().catch(() => false))) return false;
    await driver.read(await figure.innerText());
    const picker = figure.getByRole("combobox", { name: "Role for the invite" });
    await picker.selectOption({ label: role });
    await driver.pause(400, 800);
    await driver.press(create);
    await code.waitFor({ state: "visible", timeout: 20_000 });
    answers.invites.push({ role, code: (await code.innerText()).trim() });
    await driver.read(await figure.innerText());
    await driver.press(figure.getByRole("button", { name: "Copy invite code" }));
    return true;
}

/** The label this persona presses among `labels`, or undefined when none suits them. */
export function gymPersonaChoice(
    persona: GymPersona,
    labels: readonly string[],
    answers: GymPersonaAnswers = gymPersonaAnswersCreate(),
    /** The button the reply recommends, by index, if one. */
    emphasized?: number,
): number | undefined {
    const allowed = labels
        .map((label, index) => ({ label: label.trim(), index }))
        .filter(
            ({ label }) =>
                (answers.presses.get(label) ?? 0) < LABEL_PRESSES_MAX &&
                !persona.avoids.some((pattern) => pattern.test(label)),
        );
    for (const pattern of persona.prefers) {
        const found = allowed.find(({ label }) => pattern.test(label));
        if (found) return found.index;
    }
    // Nothing they reach for: what the reply recommends, then the first.
    return allowed.find(({ index }) => index === emphasized)?.index ?? allowed[0]?.index;
}

/**
 * Takes one turn in the conversation on screen: reads what is offered and acts
 * on it at this person's pace. Answers whether there was anything to do.
 */
export async function gymPersonaTurn(
    page: Page,
    persona: GymPersona,
    driver: GymPersonaDriver,
    /** What this person already pressed or typed in this run. */
    answers: GymPersonaAnswers,
): Promise<boolean> {
    if (await gymPersonaInvite(page, persona, driver, answers)) return true;
    const offer = await gymChatOfferRead(page, persona, answers);
    if (persona.typesFirst && !answers.composerTried && offer.kind !== "none") {
        // They try to type first; a closed composer says why, and they press.
        const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
        if (
            offer.kind !== "composer" &&
            (await composer.isVisible().catch(() => false)) &&
            !(await composer.isEnabled().catch(() => true))
        ) {
            answers.composerTried = true;
            await driver.press(composer);
            await driver.pause(1_600, 2_200);
        }
    }
    switch (offer.kind) {
        case "none":
            return false;
        case "buttons": {
            const buttons = offer.block.locator("button:not([disabled])");
            const emphasized = await buttons.evaluateAll((elements) =>
                elements.findIndex((element) => element.hasAttribute("data-emphasis")),
            );
            const choice = gymPersonaChoice(
                persona,
                offer.labels,
                answers,
                emphasized < 0 ? undefined : emphasized,
            );
            if (choice === undefined) return false;
            const label = (offer.labels[choice] ?? "").trim();
            answers.presses.set(label, (answers.presses.get(label) ?? 0) + 1);
            await driver.read(await offer.block.locator("xpath=..").innerText());
            await driver.press(offer.block.locator("button:not([disabled])").nth(choice));
            return true;
        }
        case "checklist": {
            // What is ticked already is what this person wants, unless they
            // came with a choice for this one; the submit is the first button
            // under the options.
            await driver.read(await offer.block.innerText());
            const wanted = persona.ticks?.[answers.checklists];
            answers.checklists += 1;
            if (wanted) {
                const rows = offer.block.locator(
                    '[data-happy-desktop-ui="chat-action-table-row"], [data-happy-desktop-ui="chat-action-option"]',
                );
                for (let index = 0; index < (await rows.count()); index++) {
                    const row = rows.nth(index);
                    const label = (
                        await row.locator(".happy-chat-action__label").innerText()
                    ).trim();
                    const box = row.locator('input[type="checkbox"]');
                    if (!(await box.isEnabled().catch(() => false))) continue;
                    const want = wanted.some((pattern) => pattern.test(label));
                    if ((await box.isChecked()) === want) continue;
                    await driver.press(row.locator(".happy-chat-action__label"));
                    await driver.pause(300, 600);
                }
            }
            await driver.press(
                offer.block.locator(".happy-chat-action__buttons button:not([disabled])").first(),
            );
            return true;
        }
        case "code":
            // A code comes from a vendor's page this persona never opens.
            return false;
        case "composer": {
            const answer = persona.answers.find(
                (candidate) =>
                    candidate.when.test(offer.prompt) && !answers.typed.has(candidate.text),
            );
            if (!answer) return false;
            answers.typed.add(answer.text);
            await driver.read(offer.prompt);
            await driver.type(offer.composer, answer.text);
            await driver.pause(300, 700);
            await page.keyboard.press("Enter");
            return true;
        }
    }
}
