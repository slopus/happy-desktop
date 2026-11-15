# Developing Happy Desktop

Everything here runs from the repository root unless a path says otherwise.

## Prerequisites

- macOS
- Node.js 24 or newer
- pnpm 10.28.1 or newer (the repository pins `pnpm@10.28.1` via `packageManager`)
- a globally installed `Happy Agent` command

```sh
pnpm install
```

## The normal loop

```sh
pnpm dev
```

Starts the complete Electron development environment against your normal local
Happy Agent daemon. It runs behind Portless in loopback mode by default, so it needs no
Wi-Fi and serves an `https://…localhost` URL.

Flags, combinable:

| Flag        | Effect                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| `--debug`   | Starts main-process, renderer, and Happy Agent inspectors and prints their URLs |
| `--lan`     | Portless LAN mode (`.local`), only for deliberate device testing                |
| `--profile` | Preloads the dormant React profiler (see Profiling below)                       |

Set `HAPPY_DEBUG_RENDERER_PORT` when a specific renderer CDP port is required.

Other entries:

```sh
pnpm dev:web      # the same renderer in an ordinary browser, via Portless
pnpm blueprint    # the happy-desktop-ui component blueprint
```

## First-run sandbox

```sh
pnpm dev:sandbox [--reset] [--no-node] [--name=x]
```

Runs the desktop against a throwaway home directory so onboarding can be
replayed as often as needed without touching the Happy Agent you actually work in.
`--reset` wipes the sandbox, `--no-node` simulates a machine without a discoverable Node runtime,
and `--name=x` keeps several sandboxes apart. The complete sandbox lives at
`<system-temp>/hds/<name>`; its Happy home and Unix socket are
`<system-temp>/hds/<name>/.happy` and `.happy/agent/server.sock` respectively.

To test subscription discovery against the Claude, Codex, and Grok authentication
in your real home while keeping Happy Agent itself isolated:

```sh
pnpm dev:sandbox:subscriptions --reset
```

This leaves `HOME` unchanged and redirects `HAPPY_HOME_DIR` into the same
temporary sandbox.

## Profiling

```sh
pnpm dev --profile
```

Preloads the dormant React profiler; nothing is collected until you press
Start in Settings → Dev Tools. Artifacts from this flavor are labeled
`development/non-representative`.

For trustworthy timing, use the optimized profile build instead of the Vite
development server:

```sh
pnpm --dir packages/happy-desktop-electron build:profile:optimized
pnpm --dir packages/happy-desktop-electron start:profile:optimized
```

## Validation

```sh
pnpm check
```

Runs `format:check`, `lint`, `typecheck`, and `build` across the workspace.
The individual commands work standalone at the root too:

```sh
pnpm format       # write formatting everywhere
pnpm lint
pnpm typecheck
pnpm build
pnpm test         # every package's suite — see the warning below
```

`pnpm test` includes the `happy-desktop-ui` and `happy-desktop-gym` rendering
suites, which drive real Chromium, Firefox, and WebKit and take many minutes.
Prefer targeting the package — or the single test file — you actually changed.

## Targeted package commands

Use `--dir` to run an available script for one package:

```sh
pnpm --dir packages/happy-desktop-state test
pnpm --dir packages/happy-desktop-app typecheck
pnpm --dir packages/happy-desktop-electron lint
```

| Package                           | Responsibility                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `packages/happy-desktop-state`    | Framework-independent product state and agent protocol                                                |
| `packages/happy-desktop-ui`       | Reusable components and the component blueprint                                                       |
| `packages/happy-desktop-app`      | Application composition and routing                                                                   |
| `packages/happy-desktop-electron` | Electron shell and local daemon boundary                                                              |
| `packages/happy-desktop-web`      | Browser development entry; `pnpm build:cloud-web` builds the cloud web app (static, `dist/cloud-web`) |
| `packages/happy-desktop-gym`      | Rendering and desktop verification utilities                                                          |

## Gym (advanced)

The gym exercises the packaged desktop outside the normal loop. Its Electron
workloads require the optimized profile build, which `gym:electron:run` makes
for you:

```sh
pnpm --dir packages/happy-desktop-gym gym:electron:run      # build + smoke workloads
pnpm --dir packages/happy-desktop-gym gym:electron:prepare  # prepare the smoke profile
pnpm --dir packages/happy-desktop-gym gym:electron:clean    # remove gym state
```

These are not part of everyday validation; reach for them only when measuring
or verifying the built desktop itself.

## Workspace browser

Happy opens web content and rendered HTML in its built-in browser instead of
bouncing to an external one. Chromium stays on your machine; a workspace tab's
traffic leaves from its agent's network. The tab asks its agent's Happy Agent
which network that is (`GET /v0/workspaces/:workspaceId/agents/:agentId/proxy`)
and then carries every request through `CONNECT /v0/networks/:networkId/proxy`,
so `http://localhost:PORT` is the agent's own localhost, wherever the agent
runs. Tabs on one network share its cookies and storage. A live artifact's page
uses its own restricted proxy and its own profile instead.

When the local Happy Agent says the network is this computer's own (`kind:
"host"`), the tab loads pages directly, in a profile of its own, without the
tunnel, and keeps working while the daemon restarts. A remote connection's
`host` network is that server's computer and keeps the tunnel, as does any
network whose kind is missing or unknown.

A Happy Cloud agent's network is asked for at the cloud server itself, and its
tunnels are WebSocket twins (`/v0/networks/:networkId/proxy/websocket`) opened
from the main process with the person's sign-in, within the server's per-person
tunnel limits. While the agent's compute is detached or offline, its tabs close
and open again when it is back.

## Troubleshooting

**Portless was installed as a startup service.** Happy's development commands
do not use a persistent proxy service. Run `portless service uninstall` once.

**Switching between loopback and `--lan`.** Portless keeps one proxy running
with the previous mode. Stop it first; Portless prints the exact
`portless proxy stop` command when it matters.
