import type {
    SidebarUpdateContributor,
    SidebarUpdateContributors,
    SidebarUpdateNotes,
    SidebarUpdateNotesList,
} from "happy-desktop-ui";

/** How many bullets of one kind the card lists before "+N more". */
export const RELEASE_NOTES_LIST_LIMIT = 5;
/**
 * More releases in range than this and the card lists nothing: it says how far
 * behind the reader is and points at the changelog instead.
 */
export const RELEASE_NOTES_OVERFLOW_THRESHOLD = 20;
export const RELEASE_NOTES_CHANGELOG_URL = "https://happy.engineering/changelog/";
/** How many contributors the card lists before it only counts them. */
export const RELEASE_NOTES_CONTRIBUTORS_LIMIT = 12;

const RELEASE_NOTES_BASE_URL =
    "https://raw.githubusercontent.com/slopus/happy-agent/main/release-notes";
/** The release process writes a few short bullets; anything past these is not notes. */
const NOTES_FILE_MAX_CHARS = 8_192;
const SECTION_MAX_BULLETS = 6;
const BULLET_MAX_CHARS = 64;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/u;
const THANKS_MAX_PEOPLE = 8;
const THANKS_MAX_REFERENCES = 4;
/** A GitHub login: 1–39 letters, digits, and single inner hyphens. */
const GITHUB_LOGIN = "[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}";
/** Credit is only ever given for issues and pull requests in Happy's own repositories. */
const THANKS_REFERENCE = "slopus/(?:happy|happy-agent|happy-desktop)#[1-9]\\d{0,6}";
const THANKS_BULLET = new RegExp(`^@(${GITHUB_LOGIN})((?: ${THANKS_REFERENCE})+)$`, "u");

/** The bullets one release's notes file lists, in file order. */
export interface ReleaseNotesFile {
    readonly features: readonly string[];
    readonly fixes: readonly string[];
    /** The people the release thanks, each with the reports or changes it credits. */
    readonly thanks: readonly ReleaseNotesThanks[];
}

/** One `## Thanks` bullet: `- @login slopus/happy-agent#73`. */
export interface ReleaseNotesThanks {
    readonly login: string;
    /** `owner/repository#number`, in file order. */
    readonly references: readonly string[];
}

/** Where one Happy Agent release's notes live, or nothing for a version that is not a tag. */
export function releaseNotesUrl(version: string): string | undefined {
    return VERSION_PATTERN.test(version) ? `${RELEASE_NOTES_BASE_URL}/v${version}.md` : undefined;
}

/**
 * Reads a notes file: bullets under `## Features` and `## Fixes`, and the
 * people under `## Thanks`. The file is fetched from outside the app, so
 * everything else — other headings, prose, nested lists, blank lines, a thanks
 * line that is not exactly a login and references — is skipped, and each
 * section and bullet is capped.
 */
export function releaseNotesParse(markdown: string): ReleaseNotesFile {
    const features: string[] = [];
    const fixes: string[] = [];
    const thanks: ReleaseNotesThanks[] = [];
    let section: "features" | "fixes" | "thanks" | undefined;
    for (const line of markdown.slice(0, NOTES_FILE_MAX_CHARS).split(/\r?\n/u)) {
        const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/u.exec(line);
        if (heading) {
            const title = heading[1]!.toLowerCase();
            section =
                title === "features" || title === "fixes" || title === "thanks" ? title : undefined;
            continue;
        }
        const bullet = /^[-*+]\s+(.*)$/u.exec(line);
        if (!section || !bullet) continue;
        if (section === "thanks") {
            const person = thanksParse(bullet[1]!.trim());
            if (person && thanks.length < THANKS_MAX_PEOPLE) thanks.push(person);
            continue;
        }
        const list = section === "features" ? features : fixes;
        if (list.length >= SECTION_MAX_BULLETS) continue;
        const text = bulletClean(bullet[1]!);
        if (text) list.push(text);
    }
    return { features, fixes, thanks };
}

function thanksParse(text: string): ReleaseNotesThanks | undefined {
    const match = THANKS_BULLET.exec(text);
    if (!match) return undefined;
    const references = [...new Set(match[2]!.trim().split(" "))].slice(0, THANKS_MAX_REFERENCES);
    return { login: match[1]!, references };
}

function bulletClean(raw: string): string {
    // eslint-disable-next-line no-control-regex -- strips control characters from fetched text
    const text = raw
        .replace(/[\u0000-\u001f\u007f]/gu, "")
        .replace(/\s+/gu, " ")
        .trim();
    return text.length > BULLET_MAX_CHARS
        ? `${text.slice(0, BULLET_MAX_CHARS - 1).trimEnd()}…`
        : text;
}

/**
 * The releases a reader gets by moving from `installed` to `target`: every
 * version after the installed one, up to and including the target, newest
 * first. `versions` is the host's catalog — newest first and already limited
 * to the tags this app's update channel accepts — so a stable reader never
 * counts previews and a preview reader counts both. Nothing when either end is
 * missing from the catalog or the target is not newer.
 */
export function releaseNotesRange(
    versions: readonly string[],
    installed: string,
    target: string,
): readonly string[] | undefined {
    const unique = [...new Set(versions)];
    const from = unique.indexOf(installed);
    const to = unique.indexOf(target);
    if (from < 0 || to < 0 || to >= from) return undefined;
    return unique.slice(to, from);
}

/**
 * The card's notes for one range. Each release's bullets are merged into one
 * list per kind, newest release first, keeping the first time a bullet appears:
 * a stable release repeats its previews' main bullets word for word, and a
 * preview reader sees them once. Nothing when no release in range has notes.
 *
 * `files` holds every release in range that was read; a release without notes
 * or whose notes could not be read is simply absent.
 */
export function releaseNotesProject(input: {
    readonly from: string;
    readonly to: string;
    readonly range: readonly string[];
    readonly files: ReadonlyMap<string, ReleaseNotesFile>;
}): SidebarUpdateNotes | undefined {
    const base = {
        changelogUrl: RELEASE_NOTES_CHANGELOG_URL,
        from: input.from,
        releaseCount: input.range.length,
        to: input.to,
    };
    if (input.range.length > RELEASE_NOTES_OVERFLOW_THRESHOLD) return { ...base, kind: "overflow" };
    const files = input.range.flatMap((version) => {
        const file = input.files.get(version);
        return file ? [file] : [];
    });
    const features = notesList(files.flatMap((file) => file.features));
    const fixes = notesList(files.flatMap((file) => file.fixes));
    if (features.total === 0 && fixes.total === 0) return undefined;
    const contributors = contributorsList(files.flatMap((file) => file.thanks));
    return {
        ...base,
        ...(contributors.total > 0 ? { contributors } : {}),
        features,
        fixes,
        kind: "list",
    };
}

/**
 * Everyone thanked in range, newest release first, once each: a person thanked
 * by a preview and again by its stable release keeps every reference from both.
 */
function contributorsList(thanks: readonly ReleaseNotesThanks[]): SidebarUpdateContributors {
    const people = new Map<string, { login: string; references: string[] }>();
    for (const person of thanks) {
        const key = person.login.toLowerCase();
        const known = people.get(key);
        if (!known) {
            people.set(key, { login: person.login, references: [...person.references] });
            continue;
        }
        for (const reference of person.references) {
            if (!known.references.includes(reference)) known.references.push(reference);
        }
    }
    const all = [...people.values()];
    return {
        items: all.slice(0, RELEASE_NOTES_CONTRIBUTORS_LIMIT).map(contributorLink),
        total: all.length,
    };
}

function contributorLink(person: {
    readonly login: string;
    readonly references: readonly string[];
}): SidebarUpdateContributor {
    return {
        avatarUrl: `https://github.com/${person.login}.png?size=48`,
        login: person.login,
        profileUrl: `https://github.com/${person.login}`,
        references: person.references.map((reference) => {
            const [repository, number] = reference.split("#") as [string, string];
            return {
                label: `${repository.slice("slopus/".length)}#${number}`,
                // GitHub redirects an issue URL to the pull request when it is one.
                url: `https://github.com/${repository}/issues/${number}`,
            };
        }),
    };
}

function notesList(bullets: readonly string[]): SidebarUpdateNotesList {
    const distinct = [...new Set(bullets)];
    return { items: distinct.slice(0, RELEASE_NOTES_LIST_LIMIT), total: distinct.length };
}
