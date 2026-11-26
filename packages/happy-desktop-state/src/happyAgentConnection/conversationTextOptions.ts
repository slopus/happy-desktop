/**
 * A reply's text with the replies it offered taken out.
 *
 * Claude Code ends a reply that asks the person to choose with an options
 * block, one reply per `<option>`:
 *
 *     <options>
 *     <option>Fix it now</option>
 *     <option>Leave it</option>
 *     </options>
 *
 * The block is cut out of the text and its replies are returned on their own,
 * so the transcript can offer each as a button. A block opens on a line that
 * starts with `<options>` outside a code fence and closes at the next
 * `</options>`; one written inside a fence is an example, not an offer, and
 * stays text. A block with no option in it stays text too.
 *
 * While the reply streams, a block that has opened but not yet closed is held
 * back so its tags never flash. Once the reply settles, a block it left open
 * is the text the agent wrote, as before.
 */
export type ConversationTextOptions = {
    readonly text: string;
    /** The replies offered, in the order written; absent when there are none. */
    readonly options?: readonly string[];
};

const OPEN = /^\s*<options>/u;
const CLOSE = "</options>";
const OPTION = /<option>([\s\S]*?)<\/option>/gu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
/* An offer is a short list of short replies: anything larger is not one. */
const OPTIONS_MAX = 12;
const OPTION_LENGTH_MAX = 200;

export function conversationTextOptions(text: string, complete: boolean): ConversationTextOptions {
    /* No tag, no offer: almost every reply leaves here. */
    if (!text.includes("<options>")) return { text };
    const lines = text.split("\n");
    const kept: string[] = [];
    const options: string[] = [];
    let fence: string | undefined;
    let cut = false;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        const marker = FENCE.exec(line)?.[1];
        if (fence !== undefined) {
            if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length)
                fence = undefined;
            kept.push(line);
            continue;
        }
        if (marker !== undefined) {
            fence = marker;
            kept.push(line);
            continue;
        }
        if (!OPEN.test(line)) {
            kept.push(line);
            continue;
        }
        let end = index;
        while (end < lines.length && !lines[end]!.includes(CLOSE)) end += 1;
        if (end === lines.length) {
            /* Still arriving: hold it back. Left open at the end: it is text. */
            if (!complete) {
                cut = true;
                break;
            }
            kept.push(line);
            continue;
        }
        const block = lines.slice(index, end + 1).join("\n");
        const close = block.indexOf(CLOSE);
        const offered = optionsOf(block.slice(0, close));
        if (offered === undefined) {
            kept.push(line);
            continue;
        }
        for (const option of offered) if (!options.includes(option)) options.push(option);
        cut = true;
        const rest = block.slice(close + CLOSE.length);
        if (rest.trim().length > 0) kept.push(rest);
        index = end;
    }
    if (!cut) return { text };
    const rest = kept.join("\n").replace(/\s+$/u, "");
    return options.length > 0 ? { text: rest, options } : { text: rest };
}

function optionsOf(block: string): readonly string[] | undefined {
    const options: string[] = [];
    for (const match of block.matchAll(OPTION)) {
        const option = entitiesDecode(match[1]!.replace(/\s+/gu, " ").trim());
        if (option.length === 0 || option.length > OPTION_LENGTH_MAX) return undefined;
        options.push(option);
    }
    return options.length > 0 && options.length <= OPTIONS_MAX ? options : undefined;
}

const ENTITIES: Readonly<Record<string, string>> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    "#39": "'",
};

function entitiesDecode(value: string): string {
    return value.replace(/&(amp|lt|gt|quot|apos|#39);/gu, (_, name: string) => ENTITIES[name]!);
}
