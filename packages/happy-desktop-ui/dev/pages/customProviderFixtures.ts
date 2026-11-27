import type {
    LocalOnboardingAssistant,
    LocalOnboardingCustomProvider,
} from "../../src/LocalOnboardingScreen";

/**
 * A corporate machine: no CLI signed in, and its model access configured in
 * `happy.toml` instead, each provider with its own check.
 */
export const customProviders: readonly LocalOnboardingCustomProvider[] = [
    {
        authentication: "error",
        id: "corp-sso",
        kind: "Bedrock",
        row: "bedrock",
        message:
            "No AWS credentials found for profile `corp-sso`. Run `aws sso login --profile corp-sso` or add credentials for that profile, then try again.",
        name: "Bedrock · corp-sso",
    },
    {
        authentication: "error",
        id: "gateway",
        kind: "OpenAI-compatible",
        row: "custom",
        message:
            "The TLS certificate of llm.corp.example is not trusted (self-signed certificate in chain). If your network uses a TLS-inspecting proxy, set NODE_EXTRA_CA_CERTS to your organization's CA bundle for Happy and restart it.",
        name: "Internal gateway",
    },
    {
        authentication: "valid",
        id: "anthropic-key",
        kind: "Claude",
        name: "Claude API key",
        row: "claude",
    },
];

/** Claude Code and Codex installed but not signed in, Grok not here. */
export function customProvidersAssistants(
    authentication: "checking" | "invalid",
): LocalOnboardingAssistant[] {
    return [
        {
            command: "/opt/homebrew/bin/claude",
            connect: { installable: true, installed: true },
            id: "claude",
            status: "found",
            // Settled, its check ran out of time behind the same proxy.
            ...(authentication === "checking"
                ? { authentication }
                : { authentication: "error", message: "Timed out after 60s" }),
        },
        {
            authentication,
            command: "/opt/homebrew/bin/codex",
            connect: { installable: true, installed: true },
            id: "codex",
            status: "found",
        },
        {
            authentication: "unavailable",
            connect: { installable: true, installed: false },
            id: "grok",
            status: "missing",
        },
    ];
}

/** The same machine mid-check: the API key has answered, the other two are still out. */
export const customProvidersChecking: readonly LocalOnboardingCustomProvider[] =
    customProviders.map((provider) =>
        provider.authentication === "valid"
            ? provider
            : {
                  authentication: "checking",
                  id: provider.id,
                  kind: provider.kind,
                  name: provider.name,
                  row: provider.row,
              },
    );
