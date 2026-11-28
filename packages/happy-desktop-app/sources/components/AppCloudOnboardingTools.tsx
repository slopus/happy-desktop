import type { ReactNode } from "react";
import {
    HAPPY_AGENT_PLUGIN_GITHUB,
    HAPPY_AGENT_PLUGIN_JOBS,
    happyAgentPluginJobEntry,
    happyAgentPluginJobSort,
    type HappyAgentOnboardingGate,
    type HappyAgentOnboardingPluginForm,
    type HappyAgentOnboardingSnapshot,
    type HappyAgentOnboardingStore,
    type HappyAgentPluginsSnapshot,
} from "happy-desktop-state";
import {
    CloudOnboardingGitHubDialog,
    CloudOnboardingToolDialog,
    type CloudOnboardingTool,
    type CloudOnboardingToolForm,
    type CloudOnboardingToolsBodyProps,
} from "happy-desktop-ui";

type PluginsGate = Extract<HappyAgentOnboardingGate, { readonly kind: "plugins" }>;

/**
 * The plugins gate's body: GitHub in the Code box, then every tool the server
 * offers by its job, and the tools no job claims last. A plugin every team
 * starts with is left out; the gate waits for one the team chose.
 */
export function cloudOnboardingToolsView(input: {
    readonly gate: PluginsGate;
    /** Absent where the server does not serve plugins: tools are listed, not offered. */
    readonly plugins: HappyAgentPluginsSnapshot | undefined;
    readonly connectable: boolean;
    readonly snapshot: HappyAgentOnboardingSnapshot;
    readonly store: HappyAgentOnboardingStore;
    readonly open: (url: string) => void;
}): CloudOnboardingToolsBodyProps {
    const { gate, plugins, store } = input;
    const defaultOn = new Set(gate.plugins.filter((entry) => entry.defaultOn).map((e) => e.id));
    // A feature plugin is the person's own and already installed; it connects nothing.
    const catalog = (plugins?.plugins ?? []).filter((plugin) => plugin.kind === "integration");
    // The gate's own list stands in where the catalog could not be read.
    const offered = (
        catalog.length > 0
            ? catalog.map((plugin) => ({ id: plugin.id, name: plugin.name, image: plugin.image }))
            : gate.plugins.map((entry) => ({ id: entry.id, name: entry.name, image: null }))
    ).filter((entry) => !defaultOn.has(entry.id));
    const tools: readonly CloudOnboardingTool[] = happyAgentPluginJobSort(offered).map((entry) => {
        const known = happyAgentPluginJobEntry(entry.id);
        return {
            ...entry,
            summary: known?.summary ?? "",
            needs: known?.needs ?? "",
            connected:
                gate.plugins.some((plugin) => plugin.id === entry.id && plugin.active) ||
                (plugins?.installations ?? []).some(
                    (installation) =>
                        installation.pluginId === entry.id &&
                        installation.available &&
                        installation.status === "active",
                ),
        };
    });
    const jobOf = (tool: CloudOnboardingTool) => happyAgentPluginJobEntry(tool.id)?.job;
    const github = tools.find((tool) => tool.id === HAPPY_AGENT_PLUGIN_GITHUB);
    const app =
        catalog
            .find((plugin) => plugin.id === HAPPY_AGENT_PLUGIN_GITHUB)
            ?.authMethods.some((method) => method.type === "oauth") === true;
    const connectable = input.connectable && plugins !== undefined && !plugins.loading;
    const rest = tools.filter((tool) => tool.id !== HAPPY_AGENT_PLUGIN_GITHUB && !jobOf(tool));
    return {
        ...(github
            ? {
                  github: {
                      image: github.image,
                      connected: github.connected,
                      app,
                      busy:
                          input.snapshot.pluginConnecting === HAPPY_AGENT_PLUGIN_GITHUB &&
                          !input.snapshot.pluginDialog,
                      ...(connectable
                          ? {
                                onConnect: () => store.pluginDialogOpen({ kind: "github" }),
                                // Through the App, GitHub's own page changes what it reaches.
                                onChange: app
                                    ? () =>
                                          store.pluginSignInOpen(HAPPY_AGENT_PLUGIN_GITHUB, {
                                              open: input.open,
                                          })
                                    : () => store.pluginDialogOpen({ kind: "github" }),
                            }
                          : {}),
                  },
              }
            : {}),
        jobs: [
            ...HAPPY_AGENT_PLUGIN_JOBS.map((job) => ({
                id: job.id,
                title: job.title,
                kind: "job" as const,
                tools: tools.filter((tool) => jobOf(tool) === job.id),
            })),
            { id: "rest" as const, title: "", kind: "rest" as const, tools: rest },
        ]
            .filter((job) => job.tools.length > 0)
            .map((job) =>
                connectable
                    ? {
                          ...job,
                          onOpen: () => store.pluginDialogOpen({ kind: "job", job: job.id }),
                      }
                    : job,
            ),
        loading: input.connectable && (plugins?.loading ?? true),
        ...(plugins?.error ? { error: plugins.error.message } : {}),
    };
}

/** The open form, as the dialog draws it, from the plugin's own fields. */
function formProps(
    form: HappyAgentOnboardingPluginForm,
    plugins: HappyAgentPluginsSnapshot,
    snapshot: HappyAgentOnboardingSnapshot,
    store: HappyAgentOnboardingStore,
): CloudOnboardingToolForm {
    const methods = (
        plugins.plugins.find((plugin) => plugin.id === form.pluginId)?.authMethods ?? []
    ).flatMap((method) => (method.type === "fields" ? [method] : []));
    const fields = methods.find((method) => method.id === form.methodId)?.fields ?? [];
    const refused = form.refusal?.fields ?? new Map<string, string>();
    // A refusal that names none of the fields shown is said under them.
    const named = fields.some((field) => refused.has(field.key));
    return {
        methods: methods.map((method) => ({ id: method.id, label: method.label })),
        methodId: form.methodId,
        fields,
        values: form.values,
        fieldErrors: refused,
        ...(form.refusal && !named ? { message: form.refusal.message } : {}),
        busy: snapshot.pluginConnecting === form.pluginId,
        onMethodSelect: store.pluginFormMethodSelect,
        onValueChange: store.pluginFormValueUpdate,
        onSubmit: store.pluginFormSubmit,
    };
}

/** The dialog open over the plugins gate, if any. */
export function cloudOnboardingToolsDialog(input: {
    readonly view: CloudOnboardingToolsBodyProps;
    readonly plugins: HappyAgentPluginsSnapshot | undefined;
    readonly snapshot: HappyAgentOnboardingSnapshot;
    readonly store: HappyAgentOnboardingStore;
    readonly open: (url: string) => void;
}): ReactNode {
    const { plugins, snapshot, store, view } = input;
    const dialog = snapshot.pluginDialog;
    if (!dialog || !plugins) return null;
    if (dialog.kind === "github") {
        const github = view.github;
        if (!github) return null;
        return (
            <CloudOnboardingGitHubDialog
                app={github.app}
                busy={snapshot.pluginConnecting === HAPPY_AGENT_PLUGIN_GITHUB}
                image={github.image}
                onBack={store.pluginDialogBack}
                onClose={store.pluginDialogClose}
                onContinue={() =>
                    store.pluginSignInOpen(HAPPY_AGENT_PLUGIN_GITHUB, { open: input.open })
                }
                onTokenOpen={() => store.pluginFormOpen(HAPPY_AGENT_PLUGIN_GITHUB)}
                waiting={dialog.waiting}
                {...(dialog.error ? { error: dialog.error } : {})}
                {...(dialog.form
                    ? { token: formProps(dialog.form, plugins, snapshot, store) }
                    : {})}
            />
        );
    }
    const job = view.jobs.find((entry) => entry.id === dialog.job);
    if (!job) return null;
    const tool = dialog.form && job.tools.find((entry) => entry.id === dialog.form?.pluginId);
    return (
        <CloudOnboardingToolDialog
            job={job}
            onBack={store.pluginDialogBack}
            onClose={store.pluginDialogClose}
            onToolOpen={store.pluginFormOpen}
            {...(dialog.form && tool
                ? { form: { ...formProps(dialog.form, plugins, snapshot, store), tool } }
                : {})}
        />
    );
}
