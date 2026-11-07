import { expect, it } from "vitest";
import catalogJson from "../catalog.json";
import {
    ANALYTICS_COMMON_RULES,
    ANALYTICS_EVENT_NAMES,
    ANALYTICS_EVENT_RULES,
    ANALYTICS_MODEL_FAMILY_RULES,
    ANALYTICS_VALUE_PATTERNS,
    analyticsFlavor,
    analyticsVersion,
    analyticsValueAllowed,
    type AnalyticsPropertyRule,
} from "./analyticsCatalog";

interface CatalogProperty {
    readonly enum?: string | readonly string[];
    readonly type?: string;
    readonly nullable?: boolean;
    readonly optional?: boolean;
    readonly clients?: readonly string[];
}

interface Catalog {
    readonly types: Readonly<Record<string, string>>;
    readonly model_family_rule: { readonly rules: readonly (readonly [string, string])[] };
    readonly shared_enums: Readonly<Record<string, readonly string[]>>;
    readonly common: Readonly<Record<string, CatalogProperty>>;
    readonly events: Readonly<
        Record<
            string,
            {
                readonly clients: readonly string[];
                readonly properties: Readonly<Record<string, CatalogProperty>>;
            }
        >
    >;
}

const catalog = catalogJson as unknown as Catalog;

/** Catalog events for the desktop that it does not send, and why. */
const NOT_SENT: Readonly<Record<string, string>> = {
    app_crashed: "needs an Electron main-process marker; host changes are not approved",
    voice_session_error: "the voice store keeps only an error string, not a typed reason",
    voice_session_stopped: "sent together with voice_session_error once voice is typed",
};

/** Optional catalog properties the desktop never sends, and why. */
const OMITTED: Readonly<Record<string, string>> = {
    "app_opened.notifications": "mobile only",
    "mobile_pairing_completed.start": "phone only",
    "mobile_pairing_failed.start": "phone only",
    "mobile_pairing_cancelled.start": "phone only",
};

/** Catalog values the desktop never sends, by property. */
const NARROWED: Readonly<Record<string, readonly string[]>> = {
    "common.client": ["ios", "android"],
    "common.os": ["ios", "android"],
    "common.device_class": ["phone", "tablet"],
    "common.agent_location": ["relay"],
    "common.flavor": ["development"],
    "onboarding_step_viewed.step": ["welcome", "pair", "sign_in", "notifications", "done"],
    "mobile_pairing_failed.error_code": [
        "invalid_code",
        "emoji_mismatch",
        "invalid_proof",
        "invalid_response",
        "revoked",
        "disabled",
        "update_required",
        "profile_required",
        "sign_in_required",
    ],
    "mobile_pairing_options_shown.surface": ["settings", "connect_agent"],
    "mobile_pairing_option_selected.surface": ["settings", "connect_agent"],
    "message_sent.source": ["notification_reply", "share"],
    "message_sent.session_client": ["cli"],
    "conversation_created.source": ["home"],
    "bot_created.source": ["home"],
    "chat_failure_shown.session_client": ["cli"],
    "chat_failure_action_clicked.action": ["sign_in", "copy_command", "open_settings"],
    "agent_connection_lost.transport": ["direct", "relay"],
    "agent_connection_lost.code": ["timeout", "revoked", "edge_blocked", "server_error"],
    "error_shown.area": [
        "attachment_upload",
        "artifact_load",
        "browser_load",
        "terminal",
        "voice",
        "model_list",
        "settings_save",
        "push_setup",
        "ui_render",
    ],
    "error_shown.code": ["version_mismatch", "invalid_response", "unsupported"],
};

function catalogValues(property: CatalogProperty): readonly string[] | undefined {
    if (property.enum === undefined) return undefined;
    return typeof property.enum === "string" ? catalog.shared_enums[property.enum] : property.enum;
}

/** Every way the desktop's rules for one property depart from the catalog's. */
function departures(
    path: string,
    property: CatalogProperty,
    rule: AnalyticsPropertyRule,
): string[] {
    const found: string[] = [];
    const values = catalogValues(property);
    if (values === undefined) {
        if (rule.type !== property.type)
            found.push(`${path}: type ${rule.type}, catalog ${property.type}`);
    } else if (rule.type !== "enum") {
        found.push(`${path}: type ${rule.type}, catalog enum`);
    } else {
        for (const value of rule.values)
            if (!values.includes(value)) found.push(`${path}: ${value} is not in the catalog`);
        const unsent = values.filter((value) => !rule.values.includes(value));
        expect(unsent, `${path} values the desktop does not send`).toEqual(NARROWED[path] ?? []);
    }
    if (rule.nullable && !property.nullable) found.push(`${path}: nullable, catalog not`);
    if (rule.optional && !property.optional) found.push(`${path}: optional, catalog required`);
    return found;
}

function propertiesCompare(
    prefix: string,
    properties: Readonly<Record<string, CatalogProperty>>,
    rules: Readonly<Record<string, AnalyticsPropertyRule>>,
): string[] {
    const found: string[] = [];
    for (const [name, rule] of Object.entries(rules)) {
        const property = properties[name];
        if (!property) found.push(`${prefix}.${name}: not in the catalog`);
        else found.push(...departures(`${prefix}.${name}`, property, rule));
    }
    for (const [name, property] of Object.entries(properties)) {
        if (name in rules || (property.clients && !property.clients.includes("desktop"))) continue;
        if (!property.optional) found.push(`${prefix}.${name}: required by the catalog`);
        else if (!(`${prefix}.${name}` in OMITTED)) found.push(`${prefix}.${name}: not sent`);
    }
    return found;
}

it("sends exactly the catalog's desktop events, less the ones listed as not sent", () => {
    const desktop = Object.entries(catalog.events)
        .filter(([, event]) => event.clients.includes("desktop"))
        .map(([name]) => name);
    expect([...ANALYTICS_EVENT_NAMES].sort()).toEqual(
        desktop.filter((name) => !(name in NOT_SENT)).sort(),
    );
    for (const name of Object.keys(NOT_SENT)) expect(desktop).toContain(name);
});

it("gives every desktop event the catalog's properties, types, and values", () => {
    const found = [
        ...propertiesCompare("common", catalog.common, ANALYTICS_COMMON_RULES),
        ...Object.entries(ANALYTICS_EVENT_RULES).flatMap(([event, rules]) =>
            propertiesCompare(event, catalog.events[event]!.properties, rules),
        ),
    ];
    expect(found).toEqual([]);
    for (const path of Object.keys(OMITTED)) {
        const [event, property] = path.split(".") as [string, string];
        expect(catalog.events[event]?.properties[property]?.optional, path).toBe(true);
    }
});

it("checks strings with the catalog's own patterns", () => {
    for (const type of ["version", "os_version"] as const)
        expect(catalog.types[type]).toContain(
            ANALYTICS_VALUE_PATTERNS[type].source.replaceAll("\\/", "/"),
        );
    expect(catalog.types.count).toBe("integer 0..1000000");
    const count: AnalyticsPropertyRule = { type: "count" };
    expect(
        [0, 1_000_000, 1_000_001, -1, 1.5].map((value) => analyticsValueAllowed(count, value)),
    ).toEqual([true, true, false, false, false]);
    expect(catalog.types.version).toContain("at most 32 characters");
});

it("names model families with the catalog's own prefix table, in its order", () => {
    expect(ANALYTICS_MODEL_FAMILY_RULES).toEqual(catalog.model_family_rule.rules);
});

it("tells a numbered preview from the release of the same numbers", () => {
    expect(
        [
            "0.0.104",
            "0.0.104-preview.1",
            "0.0.104-preview.01",
            "0.0.104-beta.1",
            "0.0.0-test",
            "2026.11.1",
            "2026.11.1-preview.2",
        ].map((version) => analyticsFlavor({ nightly: false, version })),
    ).toEqual(["standard", "preview", "standard", "standard", "standard", "standard", "preview"]);
    expect(analyticsVersion("2026.11.1-preview.2")).toBe("2026.11.1");
    expect(analyticsFlavor({ nightly: true, version: "0.0.104-preview.1" })).toBe("nightly");
});
