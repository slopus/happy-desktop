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
export async function gymChatOfferRead(page: Page, persona: GymPersona): Promise<GymChatOffer> {
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
    const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
    if (
        (await composer.isVisible().catch(() => false)) &&
        (await composer.isEnabled().catch(() => false))
    ) {
        const replies = page.locator('[data-happy-desktop-ui="message"]:not([data-own])');
        const last = (await replies.count()) > 0 ? await replies.last().innerText() : "";
        if (persona.answers.some((answer) => answer.when.test(last)))
            return { kind: "composer", composer, prompt: last };
    }
    return { kind: "none" };
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
};

export function gymPersonaAnswersCreate(): GymPersonaAnswers {
    return { presses: new Map(), typed: new Set() };
}

/** The label this persona presses among `labels`, or undefined when none suits them. */
export function gymPersonaChoice(
    persona: GymPersona,
    labels: readonly string[],
    answers: GymPersonaAnswers = gymPersonaAnswersCreate(),
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
    return allowed[0]?.index;
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
    const offer = await gymChatOfferRead(page, persona);
    switch (offer.kind) {
        case "none":
            return false;
        case "buttons": {
            const choice = gymPersonaChoice(persona, offer.labels, answers);
            if (choice === undefined) return false;
            const label = (offer.labels[choice] ?? "").trim();
            answers.presses.set(label, (answers.presses.get(label) ?? 0) + 1);
            await driver.read(await offer.block.locator("xpath=..").innerText());
            await driver.press(offer.block.locator("button:not([disabled])").nth(choice));
            return true;
        }
        case "checklist": {
            // What is ticked already is what this person wants; the submit is
            // the first button under the options.
            await driver.read(await offer.block.innerText());
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
