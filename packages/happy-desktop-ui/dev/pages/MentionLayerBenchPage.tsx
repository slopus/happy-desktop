import { useState } from "react";
import { Composer } from "../../src/Composer";
import { composerMentionRanges } from "../../src/composerMentionRanges";

/**
 * A bench, not a specimen: the real Composer with the mention layer, driven
 * by a browser harness through the query string (`?variant=layer&chars=2000&
 * mentions=5`, or `fixture=align`), measuring keystroke cost and how exactly
 * the layer's text lies under the textarea's.
 */
export const componentNumber = "B-001";

const FIRST = ["Bob", "Carol", "Dana", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jun", "Kai"];
const LAST = ["Martin", "Diaz", "Kim", "Okafor", "Novak"];
const NAMES = FIRST.flatMap((first) => LAST.map((last) => `${first} ${last}`));
const WORDS =
    "the refund path runs through billing before the ledger closes and someone should check it today".split(
        " ",
    );

/** Wrapped lines, emoji, CJK, long unbroken words, runs of spaces, tabs, and a trailing break. */
const ALIGN = [
    "Can @Bob Martin check where refunds are issued? Copying @Carol Diaz for the email copy, and @Dana Kim if support needs it.",
    "Emoji 👩🏽‍💻🚀 🇺🇦 mixed with text — @Eli Okafor ✅ and ZWJ 👨‍👩‍👧‍👦 families wrap here too.",
    "中文测试：请 @Fay Novak 看一下退款流程，日本語のテキストも混ぜます。한국어 문장도 있습니다.",
    "RTL: שלום @Gus Kim עולם, ثم مرحبا بالعالم @Hana Diaz وبعد ذلك text runs on past the wrap point here.",
    "averyveryverylongunbrokenidentifierwithoutanyspacesthatmustbreakinsidethewordbecausenothingelsecan_continue_on",
    "spaces    in    runs        and\ttabs\tbetween\twords, then a line that ends with spaces    ",
    "https://example.com/a/very/long/path/that/keeps/going/and/going?with=query&params=true#and-a-fragment",
    ...Array.from(
        { length: 16 },
        (_, index) =>
            `Line ${String(index + 1)}: @${NAMES[index % NAMES.length]!} ${WORDS.slice(0, 6 + (index % 9)).join(" ")}`,
    ),
    // The last mention runs into an unbreakable word: the layer must carry its
    // whole paragraph, or that word would wrap differently behind the textarea.
    "and last of all, closing this paragraph, @Kai Novak'sverylongpossessivethatcannotbreakanywhere",
    "",
].join("\n");

function benchText(chars: number, mentions: number): string {
    const names = NAMES.slice(0, Math.max(1, Math.min(mentions, NAMES.length)));
    const parts: string[] = [];
    let length = 0;
    let word = 0;
    const every = mentions === 0 ? Infinity : Math.max(1, Math.floor(chars / mentions));
    let nextMention = mentions === 0 ? Infinity : Math.floor(every / 2);
    let placed = 0;
    while (length < chars) {
        const piece =
            length >= nextMention && placed < mentions
                ? `@${names[placed++ % names.length]!}`
                : WORDS[word++ % WORDS.length]!;
        if (length >= nextMention) nextMention += every;
        parts.push(piece);
        length += piece.length + 1;
        if (word % 23 === 0) parts.push("\n");
    }
    return parts.join(" ").slice(0, chars);
}

/** The bench text and the scan alone, for the harness to time without a render. */
Object.assign(window, { __mentionBench: { benchText, composerMentionRanges, names: NAMES } });

export function MentionLayerBenchPage() {
    const params = new URLSearchParams(window.location.search);
    const variant = params.get("variant") ?? "layer";
    const chars = Number(params.get("chars") ?? "2000");
    const mentions = Number(params.get("mentions") ?? "5");
    const width = Number(params.get("width") ?? "640");
    const [value, setValue] = useState(() =>
        params.get("fixture") === "align"
            ? ALIGN
            : params.get("fixture") === "grow"
              ? "Hi @Bob Martin and @Carol Diaz,\nplease look at the refund path."
              : benchText(chars, mentions),
    );
    return (
        <div data-mention-bench="" style={{ padding: 24, width }}>
            <style>{BENCH_CSS}</style>
            <Composer
                {...(variant === "plain" ? {} : { mentionHighlights: NAMES })}
                onSend={() => setValue("")}
                onValueChange={setValue}
                placeholder="Message Happy…"
                value={value}
            />
        </div>
    );
}

/* Alignment modes, set by the harness on the bench root: the same text drawn
   once by the textarea and once by the layer, each alone and in one ink. */
const BENCH_CSS = `
[data-mention-bench][data-align] .happy-composer__fade { display: none; }
[data-mention-bench][data-align] .happy-composer__textarea-scroll { background: #fff; }
[data-mention-bench][data-align] .happy-composer__mention { background: none; box-shadow: none; }
[data-mention-bench][data-align] .happy-composer__textarea { caret-color: transparent; }
[data-mention-bench][data-align="textarea"] .happy-composer__mention-layer { visibility: hidden; }
[data-mention-bench][data-align="textarea"] .happy-composer__textarea { color: #000 !important; }
[data-mention-bench][data-align="layer"] .happy-composer__textarea { color: transparent !important; }
[data-mention-bench][data-align="layer"] .happy-composer__mention-layer-text,
[data-mention-bench][data-align="layer"] .happy-composer__mention { color: #000 !important; }
[data-mention-bench][data-align="both"] .happy-composer__textarea { color: #000 !important; }
[data-mention-bench][data-align="both"] .happy-composer__mention-layer-text,
[data-mention-bench][data-align="both"] .happy-composer__mention { color: #f0f !important; }
`;
