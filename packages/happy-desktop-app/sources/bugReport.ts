import { formatHappyReferenceUrl } from "happy-desktop-state";

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
    /** The `happy://` link to what was on screen when the report was started. */
    readonly startedFrom?: string;
    /** The message the report is about, when it was started from one that failed to display. */
    readonly invalidMessage?: BugReportInvalidMessage;
}

/** A conversation message that failed to display, as the placeholder in its place names it. */
export interface BugReportInvalidMessage {
    /** The Happy Agent server the message came from, as the rail names it. */
    readonly server: string;
    readonly sessionId: string;
    readonly messageId: string;
    /** The schema failures, each a JSON pointer and what was expected there. */
    readonly errors: readonly string[];
}

/**
 * The first message of a troubleshooting task: the recipe, a line of context,
 * where it was started from, and the three questions. The caret waits at its end.
 */
export function bugReportDraft(context: BugReportContext): string {
    const parts = [
        context.desktopVersion ? `Happy Desktop ${context.desktopVersion}` : undefined,
        context.os,
        context.agent
            ? `Happy Agent ${context.agent.label}${context.agent.version ? ` ${context.agent.version}` : ""}`
            : undefined,
    ].filter((part) => part !== undefined);
    return [
        `Report a Happy bug using ${BUG_REPORT_RECIPE_PATH}.`,
        "",
        ...(parts.length > 0 ? [`Context: ${parts.join(" · ")}`] : []),
        ...(context.startedFrom ? [`Started from: ${context.startedFrom}`] : []),
        ...(parts.length > 0 || context.startedFrom ? [""] : []),
        ...(context.invalidMessage ? invalidMessageLines(context.invalidMessage) : []),
        "What happened:",
        "Expected:",
        "Screenshot (attach if you have one):",
    ].join("\n");
}

/** What a report started from a message that failed to display says about it. */
function invalidMessageLines(message: BugReportInvalidMessage): string[] {
    return [
        "A message failed to display.",
        `Server: ${message.server}`,
        `Session: ${message.sessionId}`,
        `Message: ${message.messageId}`,
        "Validation errors:",
        ...message.errors.map((error) => `- ${error}`),
        "",
    ];
}

/**
 * The `happy://` link to what was on screen — the open chat, else the open
 * Surface, else the open artifact — or nothing when none was open or its
 * address is not one a link can name.
 */
export function bugReportPlaceLink(place: {
    readonly chatId?: string;
    readonly surfaceId?: string;
    readonly artifactId?: string;
}): string | undefined {
    const reference =
        place.chatId !== undefined
            ? ({ kind: "agent", id: place.chatId } as const)
            : place.surfaceId !== undefined
              ? ({ kind: "surface", id: place.surfaceId } as const)
              : place.artifactId !== undefined
                ? ({ kind: "artifact", id: place.artifactId } as const)
                : undefined;
    if (reference === undefined) return undefined;
    try {
        return formatHappyReferenceUrl(reference);
    } catch {
        return undefined;
    }
}
