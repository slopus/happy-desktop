/**
 * The marks of the coding assistants Happy can run, drawn as themselves.
 *
 * Every other symbol in this app is a glyph from the two icon fonts it ships,
 * and that rule holds for everything Happy has a word for. These are not that:
 * they are three other companies' marks, they exist to say *which product* a
 * card is about, and no house glyph can carry that meaning — a terminal square
 * on all three cards said only "these are command-line tools", which the reader
 * already knew.
 *
 * So they are inline single-path SVG. In ink they inherit `currentColor` like
 * the glyphs beside them; in `brand` tone each wears its owner's own colour,
 * where the owner has one: Claude's orange. OpenAI and xAI publish their marks
 * in black and white only, and Antigravity's colours are a gradient across
 * its arch that one fill cannot carry, so those stay in ink. They are
 * addressed by their own names rather than by the command they belong to:
 * the mark on the Codex card is OpenAI's, and pretending otherwise would put
 * a wrong name on somebody else's logo. `assistantMarkOfProvider` is the one
 * place a provider CLI is matched to its mark.
 *
 * Trademarks of their respective owners, used nominatively to identify the
 * product each card reports on. Nothing here is Happy's own mark, and none of
 * them may be restyled, recoloured beyond monochrome or the owner's own colour,
 * or used to suggest an endorsement.
 */
import { useId } from "react";

export type AssistantMarkName = "claude" | "openai" | "grok" | "antigravity";

/** Each provider CLI's mark, by its ID: Codex wears OpenAI's. */
export const ASSISTANT_PROVIDER_MARKS = {
    claude: "claude",
    codex: "openai",
    grok: "grok",
    antigravity: "antigravity",
} as const satisfies Readonly<Record<string, AssistantMarkName>>;

/**
 * The mark every desktop surface draws for one provider CLI, or undefined for
 * a program this build has no mark for.
 */
export function assistantMarkOfProvider(provider: string): AssistantMarkName | undefined {
    return Object.hasOwn(ASSISTANT_PROVIDER_MARKS, provider)
        ? ASSISTANT_PROVIDER_MARKS[provider as keyof typeof ASSISTANT_PROVIDER_MARKS]
        : undefined;
}

export interface AssistantMarkProps {
    readonly name: AssistantMarkName;
    /** Edge of the square box, in pixels. Defaults to the 20px card size. */
    readonly size?: number;
    /** `brand` draws the owner's own colour where it has one. Defaults to `ink`. */
    readonly tone?: "ink" | "brand";
}

/** The owners' published colours. A mark absent here is black and white only. */
const MARK_BRAND: Partial<Record<AssistantMarkName, readonly string[]>> = {
    claude: ["#D97757"],
};

/** Each mark's single path, on the 24-unit box every one of them is drawn in. */
const MARK_PATHS: Record<AssistantMarkName, string> = {
    claude: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z",
    /* Google Antigravity's arch: lobe-icons "antigravity" (MIT). */
    antigravity:
        "M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z",
    /* Grok's symbol since February 2025, as xAI publishes it: lobe-icons "grok" (MIT). */
    grok: "M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815",
    openai: "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z",
};

/**
 * One assistant's mark, at the size the surface asks for.
 *
 * Presentational and unlabelled: the product's name is always written beside it,
 * so repeating it to a screen reader would say everything twice.
 */
export function AssistantMark(props: AssistantMarkProps) {
    const size = props.size ?? 20;
    const gradientId = useId();
    const brand = props.tone === "brand" ? MARK_BRAND[props.name] : undefined;
    const fill =
        brand === undefined
            ? "currentColor"
            : brand.length === 1
              ? brand[0]
              : `url(#${gradientId})`;
    return (
        <svg
            aria-hidden="true"
            data-happy-desktop-ui="assistant-mark"
            data-mark={props.name}
            fill={fill}
            focusable="false"
            height={size}
            viewBox="0 0 24 24"
            width={size}
            xmlns="http://www.w3.org/2000/svg"
        >
            {brand !== undefined && brand.length > 1 ? (
                <defs>
                    <linearGradient id={gradientId} x1="0" x2="1" y1="1" y2="0">
                        {brand.map((color, index) => (
                            <stop
                                key={color}
                                offset={index / (brand.length - 1)}
                                stopColor={color}
                            />
                        ))}
                    </linearGradient>
                </defs>
            ) : null}
            <path d={MARK_PATHS[props.name]} fillRule="evenodd" />
        </svg>
    );
}
