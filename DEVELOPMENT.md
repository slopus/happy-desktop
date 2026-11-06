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

## Workspace service browsing

Happy opens web content and rendered HTML in its built-in browser instead of
bouncing to an external one. Workspace service browsing keeps Chromium on your
machine and sends only a selected service's traffic through its owning Happy
Agent connection. Ask the agent to start a remote server with `service_start`,
then open `http://localhost:PORT` in that remote workspace. In local
workspaces, ordinary localhost URLs stay direct and do not require the service
API or a registered service. An exact sandboxed service, local or remote, can
be opened as `http://service-SERVICE_ID.localhost`; the browser switches to a
private, workspace-specific origin. Ordinary internet traffic stays direct.
This does not expose ordinary shell listeners or create a public sharing link.
The first service release requires the updated Nightly native host and Agent
preview, and the service host must support strict Linux sandboxing and
delegated resource controllers. Cross-origin pages and redirects cannot
silently gain access to a private service. Private pages currently use plain
HTTP under `.happy.invalid`; secure-context-only browser features are not
enabled. A dev server with a Host allowlist must allow this private suffix (for
Vite, `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=.happy.invalid`).

## Troubleshooting

**Portless was installed as a startup service.** Happy's development commands
do not use a persistent proxy service. Run `portless service uninstall` once.

**Switching between loopback and `--lan`.** Portless keeps one proxy running
with the previous mode. Stop it first; Portless prints the exact
`portless proxy stop` command when it matters.
