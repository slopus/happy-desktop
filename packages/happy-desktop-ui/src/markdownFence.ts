import type { ExtraProps } from "react-markdown";
import { codeBlockLanguage } from "./CodeBlock";

export type MarkdownFence = {
    readonly label?: string;
    readonly lang?: string;
    readonly offset?: number;
    readonly text: string;
};

/** The authored contents and info label of one fenced Markdown code block. */
export function markdownFence(node: ExtraProps["node"]): MarkdownFence | undefined {
    const code = node?.children.find(
        (child) => child.type === "element" && child.tagName === "code",
    );
    if (code === undefined || code.type !== "element") return undefined;
    const text = code.children
        .map((child) => (child.type === "text" ? child.value : ""))
        .join("")
        .replace(/\n$/u, "");
    if (text.length === 0) return undefined;
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

const SHELL_LANGUAGES = new Set<string>([
    "bash",
    "sh",
    "zsh",
    "shell",
    "shellscript",
    "console",
    "terminal",
    "powershell",
    "pwsh",
    "cmd",
    "dos",
    "bat",
]);

/**
 * Whether a fenced code block holds a runnable shell command.
 * Matches common POSIX and Windows shell identifiers.
 */
export function markdownFenceIsShell(fence: MarkdownFence | undefined): boolean {
    if (!fence) return false;
    for (const raw of [fence.lang, fence.label]) {
        if (!raw) continue;
        const normalized = raw
            .trim()
            .toLowerCase()
            .split(/[\s,:{]/)[0];
        if (normalized && SHELL_LANGUAGES.has(normalized)) return true;
    }
    return false;
}
