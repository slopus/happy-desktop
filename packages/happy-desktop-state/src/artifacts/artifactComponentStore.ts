import type {
    ConversationMediaChartSeries,
    ConversationMediaChartVariant,
    ConversationMediaFileRow,
    ConversationMediaLayoutNode,
} from "../conversation/conversationEntry.js";
import type { HappyAgentArtifactSiteOpening } from "../happyAgent/happyAgentHostServices.js";

/**
 * One of Happy Agent's standard components, as the page that draws it is
 * given it: the element, its attributes, and the value of its `source`
 * property. It is exactly what an artifact page writes with `<happy-chart>`,
 * `<happy-diagram>`, `<happy-code>`, or `<happy-files>`, so a reply's chart and
 * an artifact's chart are one component, drawn by the daemon's own script.
 */
export type HappyAgentComponent =
    | {
          readonly element: "happy-chart";
          readonly attributes: { readonly type: ConversationMediaChartVariant };
          readonly source: {
              readonly labels: readonly string[];
              readonly series: readonly ConversationMediaChartSeries[];
              readonly unit?: string;
          };
      }
    | {
          readonly element: "happy-diagram";
          readonly attributes: Readonly<Record<never, never>>;
          readonly source: string;
      }
    | {
          readonly element: "happy-code";
          readonly attributes: { readonly language?: string; readonly path?: string };
          readonly source: string;
      }
    | {
          readonly element: "happy-files";
          readonly attributes: Readonly<Record<never, never>>;
          readonly source: readonly ConversationMediaFileRow[];
      };

/** A layout's widget node: a standard component an agent wrote as data. */
export type ConversationMediaWidgetNode = Extract<
    ConversationMediaLayoutNode,
    { readonly type: "chart" | "diagram" | "codeQuote" | "files" }
>;

/** Whether a layout node is a widget, drawn as a standard component. */
export function conversationMediaWidgetIs(
    node: ConversationMediaLayoutNode,
): node is ConversationMediaWidgetNode {
    return (
        node.type === "chart" ||
        node.type === "diagram" ||
        node.type === "codeQuote" ||
        node.type === "files"
    );
}

/** The standard component a widget node is drawn as. */
export function conversationMediaWidgetComponent(
    node: ConversationMediaWidgetNode,
): HappyAgentComponent {
    switch (node.type) {
        case "chart":
            return {
                element: "happy-chart",
                attributes: { type: node.variant },
                source: {
                    labels: node.labels,
                    series: node.series,
                    ...(node.unit === undefined ? {} : { unit: node.unit }),
                },
            };
        case "diagram":
            return { element: "happy-diagram", attributes: {}, source: node.source };
        case "codeQuote":
            return {
                element: "happy-code",
                attributes: {
                    ...(node.language === undefined ? {} : { language: node.language }),
                    ...(node.path === undefined ? {} : { path: node.path }),
                },
                source: node.code,
            };
        case "files":
            return { element: "happy-files", attributes: {}, source: node.files };
    }
}

const componentKeys = new WeakMap<HappyAgentComponent, string>();

/**
 * A component's identity: its whole content, so the same chart is the same
 * page wherever it appears and any change to it is another page.
 */
export function happyAgentComponentKey(component: HappyAgentComponent): string {
    let key = componentKeys.get(component);
    if (key === undefined) {
        key = JSON.stringify(component);
        componentKeys.set(component, key);
    }
    return key;
}

/** Where a standard component is drawn, once the host has answered. */
export type HappyAgentComponentSite =
    | { readonly type: "opened"; readonly url: string }
    /** The desktop app predates component pages; updating it is what draws them. */
    | { readonly type: "app-outdated" }
    /** The host has no guest to draw one in, or could not serve this one. */
    | { readonly type: "unavailable" };

/** Each component the host has answered for, by `happyAgentComponentKey`. */
export type HappyAgentComponentSitesSnapshot = ReadonlyMap<string, HappyAgentComponentSite>;

/**
 * The pages a conversation's standard components are drawn on.
 *
 * `request` only records what is wanted and asks the host; it never publishes
 * in its own call, so a surface may ask while it renders. A component already
 * answered for, or being asked about, is not asked about again: a page is
 * immutable, so its address never changes.
 */
export interface HappyAgentComponentSitesStore {
    get(): HappyAgentComponentSitesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Owner input: the components the visible transcript draws. */
    request(components: readonly HappyAgentComponent[]): void;
    [Symbol.dispose](): void;
}

export interface HappyAgentComponentSitesDeps {
    /** Serves a component as a page, where the host has a guest to show it in. */
    readonly componentOpen?: (
        component: HappyAgentComponent,
    ) => Promise<HappyAgentArtifactSiteOpening>;
}

const EMPTY: HappyAgentComponentSitesSnapshot = new Map();

export function happyAgentComponentSitesStoreCreate(
    deps: HappyAgentComponentSitesDeps,
): HappyAgentComponentSitesStore {
    const listeners = new Set<() => void>();
    let snapshot = EMPTY;
    const asking = new Set<string>();
    let disposed = false;
    const answered = (key: string, site: HappyAgentComponentSite): void => {
        asking.delete(key);
        if (disposed) return;
        const next = new Map(snapshot);
        next.set(key, site);
        snapshot = next;
        for (const listener of listeners) listener();
    };
    return {
        get: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        request(components) {
            if (disposed) return;
            const componentOpen = deps.componentOpen;
            for (const component of components) {
                const key = happyAgentComponentKey(component);
                if (snapshot.has(key) || asking.has(key)) continue;
                asking.add(key);
                if (!componentOpen) {
                    queueMicrotask(() => answered(key, { type: "unavailable" }));
                    continue;
                }
                void componentOpen(component).then(
                    (opening) =>
                        answered(
                            key,
                            opening.type === "opened"
                                ? { type: "opened", url: opening.url }
                                : { type: "app-outdated" },
                        ),
                    () => answered(key, { type: "unavailable" }),
                );
            }
        },
        [Symbol.dispose]() {
            disposed = true;
            listeners.clear();
        },
    };
}
