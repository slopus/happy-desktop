import type { ExtraProps } from "react-markdown";
import { codeBlockLanguage } from "./CodeBlock";

export type MarkdownFence = {
    readonly label?: string;
    readonly lang?: string;
    readonly offset?: number;
    readonly text: string;
};

/** Code text emitted by the Markdown parser, without its synthetic final newline. */
export function markdownCodeText(node: ExtraProps["node"]): string | undefined {
    const code = node?.children.find(
        (child) => child.type === "element" && child.tagName === "code",
    );
    if (code === undefined || code.type !== "element") return undefined;
    return code.children
        .map((child) => (child.type === "text" ? child.value : ""))
        .join("")
        .replace(/\n$/u, "");
}

/** The authored contents and info label of one fenced Markdown code block. */
export function markdownFence(node: ExtraProps["node"]): MarkdownFence | undefined {
    const code = node?.children.find(
        (child) => child.type === "element" && child.tagName === "code",
    );
    if (code === undefined || code.type !== "element") return undefined;
    const text = markdownCodeText(node);
    if (text === undefined || text.length === 0) return undefined;
    const names = code.properties["className"];
    const label = (Array.isArray(names) ? names.map(String) : [])
        .find((name) => name.startsWith("language-"))
        ?.slice("language-".length);
    const lang = codeBlockLanguage(label);
    const offset = node?.position?.start.offset;
    return {
        ...(label === undefined ? {} : { label }),
        ...(lang === undefined ? {} : { lang }),
        ...(offset === undefined ? {} : { offset }),
        text,
    };
}

export function markdownFenceIsMermaid(fence: MarkdownFence | undefined): boolean {
    return fence?.label?.trim().toLowerCase() === "mermaid";
}
