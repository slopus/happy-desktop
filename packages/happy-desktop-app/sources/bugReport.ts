/** The bug-report recipe, as the Happy Agent installs its docs beside the docs README. */
export const BUG_REPORT_RECIPE_PATH = "~/.happy/docs/recipe/report-bug.md";

/** The Happy Discord invite. */
export const BUG_REPORT_DISCORD_URL = "https://discord.gg/fX9WBAhyfD";

/** A post on X addressed to the Happy team, for the person to finish. */
export const BUG_REPORT_X_URL = `https://x.com/intent/post?text=${encodeURIComponent("@happy__eng ")}`;

/** What the host knows about the app a bug report comes from. */
export interface AppBugReportHost {
    /** The renderer's version, as it was built. */
    readonly desktopVersion?: string;
    /** The operating system and its version, as the host names it ("macOS 15.6.0"). */
    readonly os?: string;
}

/** What a bug report says about where it was started; every field is optional. */
export interface BugReportContext extends AppBugReportHost {
    readonly agent?: { readonly label: string; readonly version?: string };
    /** The chat the report was started from. */
    readonly chatId?: string;
}

/**
 * The template "Start a report" writes into a draft: the recipe, one line of
 * context, and the three questions. The caret waits at its end.
 */
export function bugReportDraft(context: BugReportContext): string {
    const parts = [
        context.desktopVersion ? `Happy Desktop ${context.desktopVersion}` : undefined,
        context.os,
        context.agent
            ? `Happy Agent ${context.agent.label}${context.agent.version ? ` ${context.agent.version}` : ""}`
            : undefined,
        context.chatId ? `chat ${context.chatId}` : undefined,
    ].filter((part) => part !== undefined);
    return [
        `Report a Happy bug using ${BUG_REPORT_RECIPE_PATH}.`,
        "",
        ...(parts.length > 0 ? [`Context: ${parts.join(" · ")}`, ""] : []),
        "What happened:",
        "Expected:",
        "Screenshot (attach if you have one):",
    ].join("\n");
}
