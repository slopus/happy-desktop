import type { HappyAgentFileTabKind } from "happy-desktop-state";

/**
 * Every place this window can be, as a value. Paths and stored records are only
 * how a place is rendered for the router and written down; both parse back into
 * this union, which is where a place is defined.
 *
 * That is what lets a place be reasoned about instead of pattern-matched: asking
 * whether an address is inside a group compares two fields, rather than re-running
 * a path through the router's matcher and hoping it decodes the same way.
 *
 * A place is its identifiers and nothing else — no query, no fragment. Anything a
 * route must carry becomes a field here.
 */
export type HappyAgentRoute =
    | { readonly kind: "blueprint" }
    | {
          readonly kind: "chat";
          readonly happyAgentId: string;
          readonly groupId: string;
          readonly chatId: string;
      }
    | { readonly kind: "chats" }
    /**
     * Where a session is started. The machine is in the address because the
     * projects it can run in are that machine's, so the window's back and
     * forward move between machines' Create surfaces rather than between two
     * views of one ambiguous form.
     */
    | { readonly kind: "create"; readonly happyAgentId: string }
    | {
          readonly kind: "file";
          readonly happyAgentId: string;
          readonly groupId: string;
          /** The session visible behind the file, absent in an empty workspace. */
          readonly chatId?: string;
          readonly fileKind: HappyAgentFileTabKind;
          readonly path: string;
      }
    | { readonly kind: "group"; readonly happyAgentId: string; readonly groupId: string }
    | { readonly kind: "home" }
    | { readonly kind: "inbox"; readonly happyAgentId: string }
    | { readonly kind: "happyAgent"; readonly happyAgentId: string }
    | { readonly kind: "settings" }
    | { readonly kind: "settingsSection"; readonly section: string };

/** The place a window opens on before it has been anywhere. */
export const HAPPY_AGENT_ROUTE_HOME: HappyAgentRoute = { kind: "home" };

/**
 * The path the router addresses this place by. Identifiers are encoded because
 * they are values, not path syntax: one containing a slash names one thing, and
 * must not read as two segments.
 */
export function happyAgentRoutePath(route: HappyAgentRoute): string {
    const part = encodeURIComponent;
    switch (route.kind) {
        case "blueprint":
            return "/blueprint";
        case "chat":
            return `/chats/${part(route.happyAgentId)}/${part(route.groupId)}/${part(route.chatId)}`;
        case "chats":
            return "/chats";
        case "create":
            return `/create/${part(route.happyAgentId)}`;
        case "file": {
            const parent = route.chatId ? `/${part(route.chatId)}` : "";
            return `/chats/${part(route.happyAgentId)}/${part(route.groupId)}${parent}/file/${part(route.fileKind)}/${part(route.path)}`;
        }
        case "group":
            return `/chats/${part(route.happyAgentId)}/${part(route.groupId)}`;
        case "home":
            return "/";
        case "inbox":
            return `/inbox/${part(route.happyAgentId)}`;
        case "happyAgent":
            return `/chats/${part(route.happyAgentId)}`;
        case "settings":
            return "/settings";
        case "settingsSection":
            return `/settings/${part(route.section)}`;
    }
}

/** The segments of a path, decoded, with any query or fragment dropped. */
function segmentsOf(pathname: string): string[] | undefined {
    const cut = pathname.search(/[?#]/);
    const path = cut === -1 ? pathname : pathname.slice(0, cut);
    if (!path.startsWith("/")) return undefined;
    const parts = path.slice(1).split("/").filter(Boolean);
    try {
        return parts.map(decodeURIComponent);
    } catch {
        // A path holding a broken escape names nothing this router can address.
        return undefined;
    }
}

/** A file presentation written into an address, or nothing for an unknown value. */
function fileKindOf(value: string | undefined): HappyAgentFileTabKind | undefined {
    return value === "file" || value === "diff" || value === "media" || value === "document"
        ? value
        : undefined;
}

/**
 * The place a path addresses, or nothing. This is where an address stops being
 * text and becomes one of the places above; a path matching no route is refused
 * here rather than carried around as a string that might be one.
 */
export function happyAgentRoutePathParse(pathname: string): HappyAgentRoute | undefined {
    const segments = segmentsOf(pathname);
    if (segments === undefined) return undefined;
    const [head, first, second, third, fourth, fifth, sixth] = segments;
    if (head === undefined) return HAPPY_AGENT_ROUTE_HOME;
    switch (head) {
        case "blueprint":
            return segments.length === 1 ? { kind: "blueprint" } : undefined;
        case "chats":
            if (first === undefined) return { kind: "chats" };
            if (second === undefined) return { kind: "happyAgent", happyAgentId: first };
            if (third === undefined) return { kind: "group", groupId: second, happyAgentId: first };
            if (third === "file" && segments.length === 6) {
                const fileKind = fileKindOf(fourth);
                return fileKind && fifth
                    ? {
                          fileKind,
                          groupId: second,
                          kind: "file",
                          happyAgentId: first,
                          path: fifth,
                      }
                    : undefined;
            }
            if (fourth === undefined)
                return { chatId: third, groupId: second, kind: "chat", happyAgentId: first };
            if (fourth === "file" && segments.length === 7) {
                const fileKind = fileKindOf(fifth);
                return fileKind && sixth
                    ? {
                          chatId: third,
                          fileKind,
                          groupId: second,
                          kind: "file",
                          happyAgentId: first,
                          path: sixth,
                      }
                    : undefined;
            }
            return undefined;
        case "create":
            return first !== undefined && segments.length === 2
                ? { kind: "create", happyAgentId: first }
                : undefined;
        case "inbox":
            return first !== undefined && segments.length === 2
                ? { kind: "inbox", happyAgentId: first }
                : undefined;
        case "settings":
            if (first === undefined) return { kind: "settings" };
            return segments.length === 2 ? { kind: "settingsSection", section: first } : undefined;
        default:
            return undefined;
    }
}

/** A required string field of a stored record, absent when it is not one. */
function fieldOf(record: Record<string, unknown>, name: string): string | undefined {
    const value = record[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The place a stored record describes, or nothing. Storage holds what an older
 * build wrote, or what somebody edited by hand, so it is parsed rather than
 * asserted: a record naming a place this build lacks is no longer a place.
 */
export function happyAgentRouteParse(value: unknown): HappyAgentRoute | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const record = value as Record<string, unknown>;
    switch (record["kind"]) {
        case "blueprint":
            return { kind: "blueprint" };
        case "chat": {
            const happyAgentId = fieldOf(record, "happyAgentId");
            const groupId = fieldOf(record, "groupId");
            const chatId = fieldOf(record, "chatId");
            return happyAgentId && groupId && chatId
                ? { chatId, groupId, kind: "chat", happyAgentId }
                : undefined;
        }
        case "chats":
            return { kind: "chats" };
        case "create": {
            const happyAgentId = fieldOf(record, "happyAgentId");
            return happyAgentId ? { kind: "create", happyAgentId } : undefined;
        }
        case "file": {
            const happyAgentId = fieldOf(record, "happyAgentId");
            const groupId = fieldOf(record, "groupId");
            const chatId = fieldOf(record, "chatId");
            const fileKind = fileKindOf(fieldOf(record, "fileKind"));
            const path = fieldOf(record, "path");
            return happyAgentId && groupId && fileKind && path
                ? {
                      ...(chatId ? { chatId } : {}),
                      fileKind,
                      groupId,
                      kind: "file",
                      happyAgentId,
                      path,
                  }
                : undefined;
        }
        case "group": {
            const happyAgentId = fieldOf(record, "happyAgentId");
            const groupId = fieldOf(record, "groupId");
            return happyAgentId && groupId ? { groupId, kind: "group", happyAgentId } : undefined;
        }
        case "home":
            return HAPPY_AGENT_ROUTE_HOME;
        case "inbox": {
            const happyAgentId = fieldOf(record, "happyAgentId");
            return happyAgentId ? { kind: "inbox", happyAgentId } : undefined;
        }
        case "happyAgent": {
            const happyAgentId = fieldOf(record, "happyAgentId");
            return happyAgentId ? { kind: "happyAgent", happyAgentId } : undefined;
        }
        case "settings":
            return { kind: "settings" };
        case "settingsSection": {
            const section = fieldOf(record, "section");
            return section ? { kind: "settingsSection", section } : undefined;
        }
        default:
            return undefined;
    }
}

/** Whether two places are the same place. */
export function happyAgentRouteSame(one: HappyAgentRoute, other: HappyAgentRoute): boolean {
    // A file tab is one destination per checkout and path. Its presentation and
    // the session visible behind it may change on a revisit; keeping either in
    // identity would leave duplicate Back entries for the same tab.
    if (one.kind === "file" && other.kind === "file")
        return (
            one.happyAgentId === other.happyAgentId &&
            one.groupId === other.groupId &&
            one.path === other.path
        );
    return happyAgentRoutePath(one) === happyAgentRoutePath(other);
}

/**
 * Whether a place sits inside one machine's group — the group itself, a
 * conversation, or a file in it. Everything else exists in its own right and
 * outlives the group going away.
 */
export function happyAgentRouteInGroup(
    route: HappyAgentRoute,
    happyAgentId: string,
    groupId: string,
): boolean {
    return (
        (route.kind === "group" || route.kind === "chat" || route.kind === "file") &&
        route.happyAgentId === happyAgentId &&
        route.groupId === groupId
    );
}
