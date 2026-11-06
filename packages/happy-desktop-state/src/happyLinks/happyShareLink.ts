/*
 * Share links: a Happy instance link carried in the fragment of an https URL
 * on link.happy.page, so it can be pasted to anyone with access to the same
 * thing and opens the app from a browser.
 *
 *     https://link.happy.page/#1/<instanceId>/<rest>[?<param>=<value>&…]
 *
 * opens `happy://<instanceId>/<rest>`. The parameters are `as` (what an agent
 * is, for the page to say), `version` (an artifact's), and `lines` (a file's);
 * nothing else, no titles and no actions. The grammar is the page's own,
 * `link.happy.page/src/link.ts` in slopus/happy-link, ported exactly: anything
 * else is rejected whole, and the Happy URL is always rebuilt from the parsed
 * link, so a share link can only ever open a canonical instance link.
 */

/** Where share links live; everything after `#` stays in the browser. */
export const HAPPY_SHARE_LINK_ORIGIN = "https://link.happy.page";

/** What an agent is, as the row or tab its link was copied from names it. Display only. */
export const HAPPY_SHARE_LINK_ROLES = ["task", "bot", "subtask", "subagent", "session"] as const;
export type HappyShareLinkRole = (typeof HAPPY_SHARE_LINK_ROLES)[number];

/** What a share link opens. */
export interface HappyShareLinkTarget {
    /** The canonical instance link, `happy://<instanceId>/…`. */
    readonly url: string;
    readonly instanceId: string;
    readonly as?: HappyShareLinkRole;
}

const PREFIX = `${HAPPY_SHARE_LINK_ORIGIN}/#`;
const PAYLOAD_VERSION = 1;
const MAX_PAYLOAD_LENGTH = 4096;

interface Lines {
    start: number;
    end: number;
}

type ShareTarget =
    | { type: "agent"; id: string; as?: HappyShareLinkRole }
    | { type: "artifact"; id: string; version?: number }
    | { type: "workspace"; id: string }
    | { type: "project"; id: string }
    | { type: "surface"; id: string }
    | { type: "user"; id: string }
    | { type: "service"; workspaceId: string; id: string }
    | {
          type: "file";
          owner: "agent" | "workspace";
          ownerId: string;
          /** Decoded, relative to the workspace root. */
          path: string;
          lines?: Lines;
      };

interface ShareLink {
    instanceId: string;
    target: ShareTarget;
}

const ID = "[A-Za-z0-9_-]{1,128}";
const NUMBER = "[1-9][0-9]{0,8}";
const INSTANCE = "[a-z][a-z0-9]{23}";
const ENCODED_PATH = String.raw`[A-Za-z0-9\-._~!$&'*+,;=:@%/]+`;
const MAX_NUMBER = 999_999_999;

const VERSIONED = /^([0-9]+)\//u;
const INSTANCE_PREFIX = new RegExp(`^(${INSTANCE})/`, "u");
const ENTITY = new RegExp(`^(agents|artifacts|workspaces|projects|surfaces|users)/(${ID})$`, "u");
const SERVICE = new RegExp(`^workspaces/(${ID})/services/(${ID})$`, "u");
const FILE = new RegExp(`^(agents|workspaces)/(${ID})/files/(${ENCODED_PATH})$`, "u");
const PARAM = /^([a-z]+)=([A-Za-z0-9\-._~%]+)$/u;
const NUMBER_ONLY = new RegExp(`^${NUMBER}$`, "u");
const LINES = new RegExp(`^(${NUMBER})(?:-(${NUMBER}))?$`, "u");
const ID_ONLY = new RegExp(`^${ID}$`, "u");
const INSTANCE_ONLY = new RegExp(`^${INSTANCE}$`, "u");
// A decoded path segment: never `.` or `..`, and no `/`, `\`, or control character.
// eslint-disable-next-line no-control-regex -- control characters are exactly what is refused
const SEGMENT = /^(?!\.\.?$)[^/\\\u0000-\u001f\u007f-\u009f]+$/u;

const HAPPY_INSTANCE_URL = new RegExp(`^happy://(${INSTANCE})/(.+)$`, "su");
const HAPPY_REST = {
    entity: new RegExp(
        `^(agents|artifacts|workspaces|projects|surfaces|users)/(${ID})(?:\\?version=(${NUMBER}))?$`,
        "u",
    ),
    service: SERVICE,
    file: new RegExp(
        `^(agents|workspaces)/(${ID})/files/(${ENCODED_PATH})(?:#L(${NUMBER})(?:-L(${NUMBER}))?)?$`,
        "u",
    ),
};

const ENTITY_TYPES = {
    agents: "agent",
    artifacts: "artifact",
    workspaces: "workspace",
    projects: "project",
    surfaces: "surface",
    users: "user",
} as const;

/**
 * The share link for an instance link, `happy://<instanceId>/…`, or undefined
 * for anything else: a link with no instance has no form that leaves the app.
 * `as` says what an agent is and is refused on anything but an agent.
 */
export function happyShareLinkFormat(
    happyUrl: string,
    as?: HappyShareLinkRole,
): string | undefined {
    const link = happyInstanceUrlParse(happyUrl, as);
    if (link === undefined) return undefined;
    try {
        return `${PREFIX}${payloadEncode(link)}`;
    } catch {
        return undefined;
    }
}

/**
 * What a share link opens, or undefined for anything that is not exactly one:
 * another host, a fragment the grammar refuses, or one naming no instance.
 */
export function happyShareLinkParse(url: string): HappyShareLinkTarget | undefined {
    if (!url.startsWith(PREFIX)) return undefined;
    const link = payloadDecode(url.slice(PREFIX.length));
    if (link === undefined) return undefined;
    let happyUrl: string;
    try {
        happyUrl = happyUrlFormat(link);
    } catch {
        return undefined;
    }
    return {
        url: happyUrl,
        instanceId: link.instanceId,
        ...(link.target.type === "agent" && link.target.as !== undefined
            ? { as: link.target.as }
            : {}),
    };
}

// A share link as Markdown can hold it: up to what the grammar allows, which
// never includes whitespace, brackets, parentheses, or quotes.
const SHARE_URL_IN_TEXT = /https:\/\/link\.happy\.page\/#1\/[A-Za-z0-9\-._~!$&'*+,;=:@%/?]+/gu;
const SHARE_URL_ANGLED = /<(https:\/\/link\.happy\.page\/#1\/[^\s<>]+)>/gu;
// What GFM leaves off the end of a bare URL as the sentence around it.
const TRAILING_PUNCTUATION = /[?!.,:*_~']+$/u;

/**
 * Markdown with every share link outside code whose instance `here` accepts
 * written as the instance link it opens, so it reads exactly as that
 * `happy://` link would: a link's destination is replaced, and a bare or
 * angle-bracketed URL becomes an empty-label link that takes its target's
 * title. Any other share link stays as written: it is a web address.
 */
export function happyShareLinksRewrite(
    markdown: string,
    here: (instanceId: string) => boolean,
): string {
    if (!markdown.includes(PREFIX)) return markdown;
    const opened = (candidate: string): string | undefined => {
        const target = happyShareLinkParse(candidate);
        return target !== undefined && here(target.instanceId) ? target.url : undefined;
    };
    return markdownOutsideCodeMap(markdown, (text) =>
        text
            // `<url>`: the brackets are the link.
            .replace(SHARE_URL_ANGLED, (match, url: string) => {
                const happyUrl = opened(url);
                return happyUrl === undefined ? match : `[](${happyUrl})`;
            })
            .replace(SHARE_URL_IN_TEXT, (match, offset: number, whole: string) => {
                const before = whole.slice(0, offset);
                // Inside angle brackets another server's link stays one; a
                // link's label is its words.
                if (before.endsWith("<") || before.endsWith("[")) return match;
                // A link's destination is replaced as it stands.
                if (before.endsWith("](")) return opened(match) ?? match;
                const url = match.replace(TRAILING_PUNCTUATION, "");
                const happyUrl = opened(url);
                return happyUrl === undefined ? match : `[](${happyUrl})${match.slice(url.length)}`;
            }),
    );
}

/**
 * Applies `map` to every run of `markdown` outside fenced code and inline
 * code spans, which stay literal as Markdown reads them.
 */
function markdownOutsideCodeMap(markdown: string, map: (text: string) => string): string {
    const lines = markdown.split("\n");
    let fence: string | undefined;
    let prose: string[] = [];
    const out: string[] = [];
    const flush = () => {
        if (prose.length === 0) return;
        out.push(inlineOutsideCodeMap(prose.join("\n"), map));
        prose = [];
    };
    for (const line of lines) {
        const opener = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
        if (fence === undefined && opener !== undefined) {
            flush();
            fence = opener;
            out.push(line);
        } else if (fence !== undefined) {
            if (
                new RegExp(
                    `^ {0,3}${fence[0] === "`" ? "`" : "~"}{${String(fence.length)},}\\s*$`,
                    "u",
                ).test(line)
            )
                fence = undefined;
            out.push(line);
        } else prose.push(line);
    }
    flush();
    return out.join("\n");
}

/** Applies `map` outside inline code spans: a run of backticks closed by the same run. */
function inlineOutsideCodeMap(text: string, map: (text: string) => string): string {
    let out = "";
    let index = 0;
    let start = 0;
    while (index < text.length) {
        if (text[index] === "\\") {
            index += 2;
            continue;
        }
        if (text[index] !== "`") {
            index += 1;
            continue;
        }
        let run = 1;
        while (text[index + run] === "`") run += 1;
        const ticks = "`".repeat(run);
        let close = text.indexOf(ticks, index + run);
        while (close !== -1 && text[close + run] === "`") {
            let after = close + run;
            while (text[after] === "`") after += 1;
            close = text.indexOf(ticks, after);
        }
        if (close === -1) {
            index += run;
            continue;
        }
        out += map(text.slice(start, index)) + text.slice(index, close + run);
        index = close + run;
        start = index;
    }
    return out + map(text.slice(start));
}

function payloadDecode(payload: string): ShareLink | undefined {
    if (payload === "" || payload.length > MAX_PAYLOAD_LENGTH) return undefined;
    const versioned = VERSIONED.exec(payload);
    if (versioned === null || versioned[1] !== String(PAYLOAD_VERSION)) return undefined;
    const body = payload.slice(versioned[0].length);
    const instance = INSTANCE_PREFIX.exec(body);
    if (instance === null) return undefined;
    const target = bodyParse(body.slice(instance[0].length));
    return target === undefined ? undefined : { instanceId: instance[1] ?? "", target };
}

function payloadEncode(link: ShareLink): string {
    // Formatting validates the whole link.
    happyUrlFormat(link);
    const { target } = link;
    const params: string[] = [];
    let rest: string;
    switch (target.type) {
        case "agent":
            rest = `agents/${target.id}`;
            if (target.as !== undefined) params.push(`as=${target.as}`);
            break;
        case "artifact":
            rest = `artifacts/${target.id}`;
            if (target.version !== undefined) params.push(`version=${String(target.version)}`);
            break;
        case "service":
            rest = `workspaces/${target.workspaceId}/services/${target.id}`;
            break;
        case "file":
            rest = `${target.owner}s/${target.ownerId}/files/${target.path.split("/").map(segmentEncode).join("/")}`;
            if (target.lines !== undefined) params.push(`lines=${linesFormat(target.lines, "")}`);
            break;
        default:
            rest = `${target.type}s/${target.id}`;
    }
    const query = params.length === 0 ? "" : `?${params.join("&")}`;
    const payload = `${String(PAYLOAD_VERSION)}/${link.instanceId}/${rest}${query}`;
    if (payload.length > MAX_PAYLOAD_LENGTH) throw invalid();
    return payload;
}

/** The canonical `happy://<instanceId>/…` URL for a link. Throws a `TypeError` for an invalid one. */
function happyUrlFormat(link: ShareLink): string {
    if (!INSTANCE_ONLY.test(link.instanceId)) throw invalid();
    const { target } = link;
    let rest: string;
    switch (target.type) {
        case "agent":
            if (!ID_ONLY.test(target.id)) throw invalid();
            if (target.as !== undefined && !HAPPY_SHARE_LINK_ROLES.includes(target.as))
                throw invalid();
            rest = `agents/${target.id}`;
            break;
        case "artifact":
            if (!ID_ONLY.test(target.id)) throw invalid();
            if (target.version !== undefined && !numberValid(target.version)) throw invalid();
            rest = `artifacts/${target.id}${target.version === undefined ? "" : `?version=${String(target.version)}`}`;
            break;
        case "workspace":
        case "project":
        case "surface":
        case "user":
            if (!ID_ONLY.test(target.id)) throw invalid();
            rest = `${target.type}s/${target.id}`;
            break;
        case "service":
            if (!ID_ONLY.test(target.workspaceId) || !ID_ONLY.test(target.id)) throw invalid();
            rest = `workspaces/${target.workspaceId}/services/${target.id}`;
            break;
        case "file": {
            if (target.owner !== "agent" && target.owner !== "workspace") throw invalid();
            if (!ID_ONLY.test(target.ownerId)) throw invalid();
            const segments = target.path.split("/");
            if (!segments.every((segment) => SEGMENT.test(segment))) throw invalid();
            let lines = "";
            if (target.lines !== undefined) {
                const { start, end } = target.lines;
                if (!numberValid(start) || !numberValid(end) || end < start) throw invalid();
                lines = `#${linesFormat(target.lines, "L")}`;
            }
            rest = `${target.owner}s/${target.ownerId}/files/${segments.map(segmentEncode).join("/")}${lines}`;
            break;
        }
    }
    const url = `happy://${link.instanceId}/${rest}`;
    if (url.length > MAX_PAYLOAD_LENGTH) throw invalid();
    return url;
}

/** An instance link as a share link, or undefined for anything that is not exactly one. */
function happyInstanceUrlParse(url: string, as?: HappyShareLinkRole): ShareLink | undefined {
    if (url.length > MAX_PAYLOAD_LENGTH) return undefined;
    const instance = HAPPY_INSTANCE_URL.exec(url);
    if (instance === null) return undefined;
    const [, instanceId = "", rest = ""] = instance;
    let target: ShareTarget | undefined;
    const entity = HAPPY_REST.entity.exec(rest);
    const service = HAPPY_REST.service.exec(rest);
    const file = HAPPY_REST.file.exec(rest);
    if (entity !== null) {
        const [, host = "", id = "", version] = entity;
        target = entityTarget(host, id);
        if (target?.type === "artifact" && version !== undefined) target.version = Number(version);
        else if (version !== undefined) return undefined;
    } else if (service !== null) {
        target = { type: "service", workspaceId: service[1] ?? "", id: service[2] ?? "" };
    } else if (file !== null) {
        const [, host = "", ownerId = "", encodedPath = "", start, end] = file;
        target = fileTarget(host, ownerId, encodedPath, start, end);
    }
    if (target === undefined) return undefined;
    if (as !== undefined) {
        if (target.type !== "agent" || !HAPPY_SHARE_LINK_ROLES.includes(as)) return undefined;
        target.as = as;
    }
    const link = { instanceId, target };
    try {
        return happyUrlFormat(link) === url ? link : undefined;
    } catch {
        return undefined;
    }
}

function bodyParse(body: string): ShareTarget | undefined {
    const question = body.indexOf("?");
    const rest = question === -1 ? body : body.slice(0, question);
    const params = paramsParse(question === -1 ? undefined : body.slice(question + 1));
    if (params === undefined) return undefined;

    const allowed = new Set<string>();
    let target: ShareTarget | undefined;
    const entity = ENTITY.exec(rest);
    const service = SERVICE.exec(rest);
    const file = FILE.exec(rest);
    if (entity !== null) {
        target = entityTarget(entity[1] ?? "", entity[2] ?? "");
        if (target?.type === "agent") {
            allowed.add("as");
            const as = params.get("as");
            if (as !== undefined) {
                const role = HAPPY_SHARE_LINK_ROLES.find((candidate) => candidate === as);
                if (role === undefined) return undefined;
                target.as = role;
            }
        } else if (target?.type === "artifact") {
            allowed.add("version");
            const version = params.get("version");
            if (version !== undefined) {
                if (!NUMBER_ONLY.test(version)) return undefined;
                target.version = Number(version);
            }
        }
    } else if (service !== null) {
        target = { type: "service", workspaceId: service[1] ?? "", id: service[2] ?? "" };
    } else if (file !== null) {
        allowed.add("lines");
        const lines = params.get("lines");
        const range = lines === undefined ? undefined : LINES.exec(lines);
        if (range === null) return undefined;
        target = fileTarget(file[1] ?? "", file[2] ?? "", file[3] ?? "", range?.[1], range?.[2]);
    }
    if (target === undefined) return undefined;
    for (const key of params.keys()) if (!allowed.has(key)) return undefined;
    return target;
}

/** Strict `key=value&…`: lowercase keys, each once, values non-empty. */
function paramsParse(query: string | undefined): Map<string, string> | undefined {
    const params = new Map<string, string>();
    if (query === undefined) return params;
    for (const pair of query.split("&")) {
        const match = PARAM.exec(pair);
        if (match === null) return undefined;
        const [, key = "", encoded = ""] = match;
        const value = valueDecode(encoded);
        if (value === undefined || params.has(key)) return undefined;
        params.set(key, value);
    }
    return params;
}

function entityTarget(host: string, id: string): ShareTarget | undefined {
    if (!Object.hasOwn(ENTITY_TYPES, host)) return undefined;
    const type = ENTITY_TYPES[host as keyof typeof ENTITY_TYPES];
    return { type, id };
}

function fileTarget(
    host: string,
    ownerId: string,
    encodedPath: string,
    start: string | undefined,
    end: string | undefined,
): ShareTarget | undefined {
    const segments: string[] = [];
    for (const segment of encodedPath.split("/")) {
        const decoded = valueDecode(segment);
        // An encoded `%2F` is never a separator, and `.`, `..`, `\`, and control characters are out.
        if (decoded === undefined || !SEGMENT.test(decoded)) return undefined;
        segments.push(decoded);
    }
    const target: ShareTarget = {
        type: "file",
        owner: host === "agents" ? "agent" : "workspace",
        ownerId,
        path: segments.join("/"),
    };
    if (start !== undefined) {
        const lines = { start: Number(start), end: Number(end ?? start) };
        if (lines.end < lines.start) return undefined;
        target.lines = lines;
    }
    return target;
}

function linesFormat({ start, end }: Lines, prefix: string): string {
    return start === end
        ? `${prefix}${String(start)}`
        : `${prefix}${String(start)}-${prefix}${String(end)}`;
}

function valueDecode(value: string): string | undefined {
    if (value === "") return undefined;
    try {
        // Also rejects a `%` that starts no escape, and bytes that are not UTF-8.
        return decodeURIComponent(value);
    } catch {
        return undefined;
    }
}

/** Percent-encodes every byte but the unreserved characters. */
function segmentEncode(value: string): string {
    try {
        return encodeURIComponent(value).replace(
            /[!'()*]/gu,
            (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
        );
    } catch {
        // A lone surrogate has no UTF-8 encoding.
        throw invalid();
    }
}

function numberValid(value: number): boolean {
    return Number.isInteger(value) && value >= 1 && value <= MAX_NUMBER;
}

function invalid(): TypeError {
    return new TypeError("The Happy share link is invalid.");
}
