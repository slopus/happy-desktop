# Multiple Happy Agents

## Where we are going

Happy is a multi-Happy Agent app. Its local host Happy Agent and every remote Happy Agent the host has
published remain represented and mounted whether their current route is healthy
or not. Connectivity is a changing property of a Happy Agent, never the lifetime of the
Happy Agent's UI or of the application.

Arbitrary network failure must leave the mounted app usable. A full-app loader
is allowed only during initial startup, before Happy has first connected to its
local host. After the app has mounted, losing or reconnecting the local host or
any remote Happy Agent must never unload, reset, or replace the app with a loader.
Failure of one Happy Agent must not interrupt work on another.

An unavailable Happy Agent stays where the user left it. Its affected surfaces explain
their state in context: a terminal, for example, becomes visibly muted and
read-only. Actions that require that Happy Agent to be online are disabled, while
navigation, reading already available state, editing drafts, and every other
offline-capable action continue to work. Errors and reconnecting status belong
beside the affected Happy Agent or surface, not in a global blocking state.

When connectivity returns, Happy reconciles the Happy Agent in place and resumes live
work. Navigation, focus, selection, scroll position, open panels, drafts, and
other UI identity survive the outage and reconnect.

That stability is a general UI invariant, not only a reconnect guarantee.
Streaming updates, composer growth, and resizing surrounding chrome reconcile
without a delayed visual correction: a chat following its newest content stays
pinned there, while a reader parked in history keeps the same visual anchor.

## Host-less (cloud-only) mode

A computer that only uses Happy Cloud never runs a local Happy Agent. Nothing
starts, installs, or waits on one until the person explicitly asks to set this
computer up. Happy Cloud's servers are reached directly by the app, so they work
with no host: the rail still shows this computer's place, which offers the setup
instead of being reported broken, and the first cloud server opens by default.
Setting the computer up later adds the host without closing the cloud servers
already open. Their sign-ins outlive a restart where the operating system can
encrypt them, and only then.

## How we get there

First, make every known Happy Agent a stable app lifetime independent of its connection
state. The direct host and the per-node routes, namespaces, and ordinary Happy Agent
connections from the Remote Happy Agent plan remain the transport model; an unavailable
route changes status, not membership or UI ownership.

Then make availability visible and local to each Happy Agent. Every surface and action
must distinguish what requires a live Happy Agent from what can continue offline, and
degrade only the unavailable part.

Finally, remove connection-driven app loaders, remounts, and resets. Reconnect
each Happy Agent in place, reconcile its current durable state, and restore live
behavior without rebuilding the surrounding app.

## How we know it is done

- The only connection-related full-app loader is the initial local-host
  bootstrap; after the first mount, no disconnect or reconnect can replace the
  app with a loader.
- The local host and every known remote Happy Agent remain mounted and visible through
  offline, reconnecting, and error states, with failures isolated per Happy Agent.
- An open surface keeps its identity and clearly shows degraded availability;
  terminals are visibly muted and read-only while unavailable.
- Online-only actions are disabled with their reason shown in context, while
  all offline-capable navigation, reading, and editing remain usable.
- Reconnecting reconciles fresh Happy Agent state in place without losing navigation,
  focus, selection, scroll position, open panels, or drafts.
- Streaming, composer editing, and surrounding-panel resize preserve the
  transcript's active scroll anchor without a visible correction frame.
- Remote work still uses the host-published routes, ordinary Happy Agent connections,
  and stable per-Happy Agent namespaces defined by the Remote Happy Agent plan; no second
  remote-sync model is introduced.
