import type { ViewerStackPerson } from "../../src/ViewerStack";

/** Every fixture counts from here: 25 Nov 2026, 10:00 in California. */
export const VIEWERS_NOW = Date.UTC(2026, 10, 25, 18, 0);
export const VIEWERS_ZONE = { locale: "en-US", timeZone: "America/Los_Angeles" } as const;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function picture(from: string, to: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="26" r="11" fill="white" fill-opacity="0.75"/><ellipse cx="32" cy="58" rx="20" ry="16" fill="white" fill-opacity="0.75"/></svg>`,
    )}`;
}

export const KIRILL: ViewerStackPerson = {
    id: "u-kirill",
    name: "Kirill",
    imageUrl: picture("#2baccc", "#1f6f8b"),
    tier: "here",
    lastSeenAt: VIEWERS_NOW,
};
export const ANNA: ViewerStackPerson = {
    id: "u-anna",
    name: "Anna Park",
    tier: "recent",
    lastSeenAt: VIEWERS_NOW - 6 * MINUTE,
};
export const MAX: ViewerStackPerson = {
    id: "u-max",
    name: "Max Lin",
    imageUrl: picture("#ff9500", "#c2410c"),
    tier: "seen",
    lastSeenAt: VIEWERS_NOW - 13 * DAY,
};
export const GRACE: ViewerStackPerson = {
    id: "u-grace",
    name: "Grace Moe",
    imageUrl: picture("#a347d6", "#5856d6"),
    tier: "here",
    lastSeenAt: VIEWERS_NOW,
};
export const LEE: ViewerStackPerson = {
    id: "u-lee",
    name: "Lee Okafor",
    tier: "recent",
    lastSeenAt: VIEWERS_NOW - 2 * MINUTE,
};

/** Everyone in one tier, then all three together, as a header orders them. */
export const VIEWERS_HERE: readonly ViewerStackPerson[] = [KIRILL, GRACE];
export const VIEWERS_RECENT: readonly ViewerStackPerson[] = [LEE, ANNA];
export const VIEWERS_SEEN: readonly ViewerStackPerson[] = [
    MAX,
    { ...LEE, tier: "seen", lastSeenAt: VIEWERS_NOW - 3 * DAY },
];
export const VIEWERS_MIXED: readonly ViewerStackPerson[] = [KIRILL, ANNA, MAX];

const NAMES = [
    "Ada",
    "Bruno",
    "Chen",
    "Dara",
    "Eli",
    "Fatima",
    "Gus",
    "Hana",
    "Ivo",
    "Juno",
    "Kai",
    "Lena",
];

/** Ten people: two here, three recent, five seen before. */
export const VIEWERS_TEN: readonly ViewerStackPerson[] = [
    KIRILL,
    GRACE,
    LEE,
    ANNA,
    { id: "u-ivo", name: "Ivo Rask", tier: "recent", lastSeenAt: VIEWERS_NOW - 9 * MINUTE },
    MAX,
    ...NAMES.slice(0, 4).map(
        (name, index): ViewerStackPerson => ({
            id: `u-${name.toLowerCase()}`,
            name,
            tier: "seen",
            lastSeenAt: VIEWERS_NOW - (index + 2) * DAY,
        }),
    ),
];

/** The fullest list a server sends. */
export const VIEWERS_FIFTY: readonly ViewerStackPerson[] = Array.from(
    { length: 50 },
    (_, index) => ({
        id: `u-${String(index)}`,
        name: `${NAMES[index % NAMES.length]!} ${String(index + 1)}`,
        tier: index < 3 ? "here" : index < 8 ? "recent" : "seen",
        lastSeenAt: index < 3 ? VIEWERS_NOW : VIEWERS_NOW - index * (index < 8 ? MINUTE : DAY),
    }),
);
