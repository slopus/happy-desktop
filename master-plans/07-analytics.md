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

- Only closed enums, counts, booleans, version strings, and allowlisted model
  ids leave the window. No text anyone wrote, no names, ids, paths, URLs, hosts,
  error messages, or stacks. Anything else does not typecheck, and
  `analyticsBeforeSend` drops any property the catalog does not name for that
  event, or whose value its rule does not allow.
- `model` is a first-party vendor-qualified id (`anthropic/…`, `openai/…`,
  `xai/…`, `google/…`, `zai/…`, `moonshotai/…`), else `other`. `os_version` is
  major.minor only. There is no per-account hash.
- No IP from the desktop: events set `$ip: null` and `$geoip_disable: true`.
  PostHog still receives the request's IP unless the project's "Discard client
  IP data" is on, and Settings says so.
- No autocapture, pageviews, session recording, or person properties.

## Identity

A random install ID per installation. It is never derived from, or aliased to,
an account, a Happy Agent, or the phone's `anonID`.

## Switching it off

Everything lives in `packages/happy-desktop-analytics` and the renderer facade
`desktopAnalytics.ts` with its two observers (`desktopConversationAnalytics.ts`,
`desktopMobilePairingAnalytics.ts`). Deleting them and their call sites in
`renderer.tsx` removes analytics. A build without a PostHog key sends nothing,
nor does a development window. The Settings switch stops the next event at
once; events are sent as they are captured, so no batch is left to go out.

## The desktop's part

- Errors first: `chat_failure_shown` (a fresh failure card in the focused
  conversation, counted once per failure on this device), `chat_failure_action_clicked`,
  `agent_connection_lost` (one per outage of 10 s or more while the window is
  on screen, sent when it ends), `error_shown` (at most once per area and code
  every 10 minutes, with `repeat_count`), `onboarding_setup_result`, and the
  `mobile_pairing_*` results.
- Then use: `app_opened`, `message_sent`, `conversation_created`,
  `project_added`, `workspace_created`, `bot_created`, `task_created`, and the
  `onboarding_*` events.
- Not yet: `app_crashed`, which needs the main process to leave a marker for
  the next launch, and the voice events, which need the voice store to keep a
  typed reason instead of an error string.
