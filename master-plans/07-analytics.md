# Analytics

## Where we are going

A small set of PostHog events, shared by the desktop and the phones, that
first shows which failures people hit and whether they recover, and then how
they use Happy. Fewer events and more privacy win every tie: an event earns its
place only if it answers a question no other event answers, and anything
`message_sent` already says is not its own event. Opening, viewing, or
navigating is never sent, and nothing is counted on the device.

## Source of truth

- `packages/happy-desktop-analytics/catalog.json` is the contract: every event,
  property, and allowed value any client may send. It is a byte-identical copy
  of the shared catalog the phones use. It is never edited here; a change is
  made to the master copy and copied in.
- The shared taxonomy spec (`analytics-taxonomy.md`, kept with the catalog's
  master copy) explains it. Where they disagree, the catalog wins.
- `analyticsCatalog.ts` is the desktop's typed part of the catalog, and
  `catalog.test.ts` holds it to `catalog.json`: the same desktop events,
  properties, types, and values, with every event, property, or value the
  desktop does not send listed there with its reason.

## Privacy

- Only closed enums, counts, booleans, and version numbers leave the window. No text anyone wrote, no names, ids, paths, URLs, hosts,
  error messages, or stacks. Anything else does not typecheck, and
  `analyticsEnvelope` drops any property the catalog does not name for that
  event, or whose value its rule does not allow.
- No SDK. Each event is one `POST /batch/` made with `fetch` (with `keepalive`
  as the window closes) in the spec's envelope: `distinct_id`, `$insert_id`,
  `$lib: "happy-desktop"`, `$process_person_profile: false`, `$ip: null`,
  `$geoip_disable: true`, and nothing PostHog would add itself. No cookies and
  no referrer go with it, and no redirect is followed (`redirect: "error"`).
  A host override must be https, or http on this machine, with no
  credentials in it; any other sends nothing. Timestamps are whole seconds.
  The one flag is a direct `POST /flags/?v=2` with the install ID, asked once
  per install ID and kept in memory.
- `model_family` (`claude_opus`, `gpt`, …) from the catalog's
  `model_family_rule` prefix table, else `other`; the model id itself never
  leaves. Versions are numbers only, cut at the first `-` or `+`, else null.
  `os_version` is major.minor only. There is no per-account hash.
- No IP from the desktop: events set `$ip: null` and `$geoip_disable: true`.
  PostHog still receives the request's IP unless the project's "Discard client
  IP data" is on, and Settings says so.
- No autocapture, pageviews, session recording, or person properties, and
  nothing from a window driven by automation (`navigator.webdriver`), except
  to a capture endpoint on this machine (`127.0.0.1`, `::1`, or `localhost`).

## Identity and storage

A random install ID per installation. It is never derived from, or aliased to,
an account, a Happy Agent, or the phone's `anonID`, and it is read or made only
right before a request that may go.

It is the only analytics value kept on disk, besides the Settings switch
itself. The `error_shown` throttle times and the counted-failure set live in
memory only, so a reload can send one error again inside its 10-minute window;
that is accepted. Keys earlier builds kept (the launch counter, the throttle,
the failure set) are deleted as the window opens.

## Switching it off

- A build without a PostHog key sends nothing, nor does a development window
  unless its host override is a capture endpoint on this machine.
- The switch fails closed: a stored choice that cannot be read or parsed is
  off, and only nothing stored at all is on. A choice the host refused to
  save is shown in Settings.
- Turning it off stops the analytics-only observers (outages, onboarding,
  rows on screen), forgets what they followed, so an outage that began while
  off is never reported, and deletes the install ID and every remembered
  send. Turning it back on starts with a new install ID.
- The Settings switch stops sending at once. It is read right before every
  request, nothing is queued or batched, and a request that fails is dropped,
  never sent again, so nothing is sent after opt-out. A request already on
  its way when the switch turns off is not recalled. (posthog-js
  was dropped for this: its retry queue resends a failed request past
  `before_send` and past opting out, and can't be turned off from outside its
  bundle.)
- `DO_NOT_TRACK=1` in the environment turns analytics off the same way. Not
  yet built: the shell has to hand the variable to the renderer, which is a
  main or preload change waiting on Kirill's confirmation.

### Removing analytics

Analytics is `packages/happy-desktop-analytics` and the one renderer facade,
`packages/happy-desktop-electron/sources/renderer/desktopAnalytics.ts`. No other
file but the facade's two tests imports the package or names an `Analytics*`
type or `analytics*` function. To remove it, delete:

- `packages/happy-desktop-analytics/`, its `.oxfmtrc.json` ignore entry, and
  its `packages/happy-desktop-analytics` importer in `pnpm-lock.yaml`.
- `desktopAnalytics.ts`, `desktopAnalytics.test.ts`, and
  `desktopMobilePairingAnalytics.test.ts` in the renderer.
- In `renderer.tsx`: the `desktopAnalyticsCreate` import and call, and every
  `analytics.` use: `mobilePairingMethodSelected`, `activity`,
  `mobilePairingObserve`, `dispose`, `flagFollow` (the direct-connection
  rollout then keeps its default), `appOpened`, `agentUpdateObserve`,
  `agentBrokenObserve`, `onboardingObserve`, and `preference`.
- In `happyAgentDirectoryStore.ts`: the `HappyAgentMobilePairingObserve` type
  import, the `activity` and `mobilePairingObserve` deps, and their forwarding
  into each connection's deps.
- In `happyAgentConnection.ts`: the same type import and deps, the
  `activityRecorded` case that forwards activity, and the observer wrappers
  around the mobile connector, onboarding's mobile store, and the Happy
  integration store (`pairingObserve.connector`, `.onboarding`,
  `.integration`).
- `happy-desktop-analytics` in `happy-desktop-electron/package.json`, in the
  `packages/happy-desktop-electron` importer of `pnpm-lock.yaml`, and in
  `scripts/demo/lib/stage.mjs`, the `__HAPPY_POSTHOG_API_KEY__` and
  `__HAPPY_POSTHOG_HOST__` defines in `vite.config.ts`, and
  `HAPPY_POSTHOG_API_KEY` / `release_analytics` in
  `.github/workflows/build-linux.yml`, `build-windows.yml`,
  `desktop-release.yml`, and `local-web-pages.yml`.

What is left reports only to whoever listens and does nothing alone; it can
stay or go with it:

- happy-desktop-state: `happyAgentActivity.ts`, the workspace store's
  `activityRecorded` output with `activityRecord`, `activityModel`,
  `activityAddress`, `failureActionRecord`, `failureNewChat`, and
  `conversationEntriesSeen`, a failure notice's `occurredAt`, and
  `usageAnalytics/usageAnalyticsStore.ts`.
- happy-desktop-ui: `ConversationView`'s `onEntriesSeen`, and the Settings
  switch `HappyAgentProductAnalyticsSettings` with its `usageAnalyticsEnabled`
  props in `HappyAgentGeneralSettings` and its Blueprint pages.
- happy-desktop-app: the `usageAnalytics` prop through the router and the
  settings view, and `AppHappyAgentView`'s `onEntriesSeen` and
  `failureNewChat` calls.
- The shell's `main/localApps.ts` look and the `localApps` onboarding field
  that carries it. Nothing reads it since `onboarding_local_apps` was
  removed; deleting it is a host change, so it waits on Kirill like the rest
  of main.
- The Settings switch's `usageAnalyticsSaveFailed` and its banner.
- happy-desktop-ui's `LocalOnboardingScreen` `onCommandCopy` callback: no
  host passes it since `onboarding_command_copied` was removed.

## The desktop's part

- Errors first. `chat_failure_shown`: a failure card less than 5 minutes old,
  counted when the conversation's virtualized list actually has it on screen
  in a foreground window, once per failure in five minutes.
  `chat_failure_action_clicked`: Retry, Switch, New chat, or Ask Chief of Staff
  on a failure card. `agent_connection_lost`: one per outage of 10 s or more
  while the window is on screen, sent when it ends. `error_shown`: an error on
  the surface the person is looking at in a foreground window (the active file
  or diff tab, the conversation that could not load, a failed send on screen,
  the update card), at most once per area and code every 10 minutes, repeats
  in between dropped. Then `onboarding_setup_result` and the `mobile_pairing_*`
  results.
- Then use: `app_opened`, `message_sent`, `conversation_created`,
  `project_added`, `workspace_created`, `bot_created`, `task_created`,
  `onboarding_step_viewed`, `onboarding_assistant_status`,
  `onboarding_mobile`, and `onboarding_completed`.
- Not wired: a file or diff that could not be read in the side panel; only
  the active main tab counts.
- Not yet: `app_crashed` (only `process`, `reason`, and `crashed_version`),
  and `DO_NOT_TRACK` (above), both waiting on Kirill's confirmation of a main
  or preload change. The crash design keeps nothing on disk: main hears
  `render-process-gone` and `child-process-gone` and hands the reason to the
  reloaded renderer over IPC, in memory; a crash of main itself is not
  reported; and the voice events, which need
  the voice store to keep a typed reason instead of an error string.
