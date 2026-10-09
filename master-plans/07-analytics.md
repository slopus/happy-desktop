# Analytics

## Where we are going

Basic PostHog events from the desktop app that show how people get through
onboarding and how they create and use things. Nothing else.

## Privacy

- Only the user ID and enum or count fields defined in the table below. Anything else does not typecheck.
- No IP from the desktop: events set `$ip: null` and `$geoip_disable: true`. The project's "Discard client IP data" stays off, so PostHog still receives and may keep the request's IP. Settings says so: "Our analytics provider, PostHog, receives your IP address with each event and may keep it; we turn off its location lookup and don't use your IP."
- No `$current_url`, no paths, no project, repo, branch or bot names, no prompts or message text, no emails, display names or hostnames.
- No autocapture, pageviews, session recording or person properties.
- Every event carries only `app_version`, `flavor` (`standard | nightly`), `os` (`mac | win | linux`, where the desktop runs), `os_version` (the bare OS version number, e.g. `15.6.0` or `10.0.26100`; null on Linux, which reports only a kernel release, and on older shells), `arch` (`arm64 | x64 | other`, the desktop app's own architecture; null on older shells), and for the connected Happy Agent `agent_os` (`mac | win | linux`), `agent_location` (`local | remote`) and `happy_agent_version`.
- Only the desktop app sends events. Happy Agent sends none; it only hands the desktop the phone-matching user ID. The phone keeps its own events. `message_sent` is one event shared with the phone and web, with the same name and properties (see below).
- Default on, with an off switch in Settings. `DO_NOT_TRACK=1` turns it off too.

## Identity

A random install ID until the phone is paired. After pairing, alias it to the
phone's `anonID`, so desktop and phone are one person. Happy Agent has to
provide that ID.

## Events

| event | fires when | payload |
|---|---|---|
| `app_opened` | once per launch, when the active Happy Agent's version is known, or after 10 s without it (or at close, whichever is first) | `launch_count: number` |
| `onboarding_step_viewed` | the step changes | `step: setup \| subscriptions \| get_app \| connect_phone` |
| `onboarding_setup_result` | the Setup step ends: Happy Agent answers and setup moves on, or the window closes while Setup is still running (once per pass through Setup in a window) | `result: ok \| failed`, `error_code?: node_missing \| download_failed \| start_failed \| start_timeout \| version_mismatch \| connect_failed \| state_unreadable \| closed_during_setup` (on close, the last failure Setup met, else `closed_during_setup`), `duration_ms: number`; with `download_failed` from a shell that codes it, also `error_detail: release_lookup_rate_limited \| release_lookup_failed \| release_unavailable \| network_unreachable \| transfer_interrupted \| transfer_timeout \| transfer_http_error \| integrity_mismatch \| disk_full \| filesystem_locked \| extract_failed \| install_lock_timeout \| unclassified`, `attempt_count: number` (requests made for the archive, resumes included), `transfer_percent_bucket: none \| under_half \| over_half \| complete` |
| `onboarding_assistant_status` | Subscriptions continues | `assistant: claude \| codex \| grok \| custom`, `status: signed_in \| not_signed_in \| not_installed \| check_failed` (one event per card; for `custom`, `signed_in` means a valid custom configuration) |
| `onboarding_command_copied` | a Subscriptions card's command or prompt is copied | `assistant: claude \| codex \| grok \| custom`, `kind: install \| sign_in \| agent_prompt` (never the copied text) |
| `onboarding_subscriptions_exit` | the window closes on Subscriptions without continuing | `claude_status`, `codex_status`, `grok_status`, `custom_status`: the `onboarding_assistant_status` enum, or null while a card is still checking |
| `onboarding_mobile` | mobile step ends | `action: paired \| skipped` |
| `onboarding_completed` | onboarding reaches `complete` | none |
| `conversation_created` | a new conversation starts | `model`, `model_provider_kind`, `provider_account_hash`, `effort` (as in `message_sent`), `source: workspace \| command_palette \| shortcut \| voice` |
| `project_added` | a project is added | `source: open_folder \| clone_github`, `result: ok \| failed`, `error_code?` |
| `workspace_created` | a worktree is created | `result`, `error_code?` |
| `bot_created` | a bot is created | `source: sidebar \| voice`, `result`, `error_code?` |
| `subtask_created` | a subtask first appears | `result`, `task_depth` (the new subtask's depth, as in `message_sent`) |
| `message_sent` | the user sends a message | the shared properties below |

Events fired as the window closes (`onboarding_setup_result` with a close, `onboarding_subscriptions_exit`, a pending `app_opened`) are sent at once by `sendBeacon`. That is best effort; the library is loaded at startup when analytics is on so it is ready by then. A window driven by automation (`navigator.webdriver`, as Playwright makes CI's boot checks) has its events dropped by PostHog itself, so CI sends none.

`onboarding_setup_result.error_code` comes only from fixed facts: the setup stage, which of the window's own requests failed, the shell's `start_timeout` code (a start command killed by its timeout, or an agent that never answered), and the local connection's protocol check (`version_mismatch`). No error message is classified or sent. An older shell sends no code, and its failures keep the stage-based code. `node_missing` is reachable only with an externally managed daemon; a managed Happy Agent brings its own Node. There is no `port_in_use`: Happy Agent reports a busy port only as message text, so it cannot be told apart without parsing it.

`error_detail` is the shell's own code for a failed Happy Agent download, set where the failure is raised: the GitHub API's status and rate-limit header for the release lookup, whether any response or any byte arrived for the archive, the size and checksum checks, the Node system error code of a filesystem step (`ENOSPC` is `disk_full`; `EPERM`, `EBUSY`, and `EACCES` are `filesystem_locked`), and the unpacking step. It is sent only beside `download_failed`, and an older shell sends none of the three download fields. No message, URL, or path is read to choose it.

### Shared `message_sent`

`message_sent` is one event across phone, web and desktop. The event name and
its properties are shared with the phone (happy-app
`packages/happy-app/sources/track/messageSentProperties.ts`).

| property | type | desktop value |
|---|---|---|
| `client` | `ios \| android \| web \| desktop` | `desktop` |
| `target` | `chief_of_staff \| bot \| session` or null | from the bot that owns the conversation |
| `session_client` | `happy_agent \| cli` or null | `happy_agent` |
| `happy_agent_version` | string or null | the connected Happy Agent's version |
| `model` | string or null | the Happy Agent model id, e.g. `anthropic/opus-5`; never `providerId:modelId`; null is the agent default |
| `model_provider_kind` | string or null | the provider's configured type (`claude`, `codex`, `grok`, `bedrock`, …), never its account id and never `custom` |
| `provider_account_hash` | string or null | first 12 hex characters of SHA-256(install ID + `:` + provider ID), so two accounts of one kind read apart; never the provider ID or account name; null when unknown |
| `effort` | string or null | the effort level sent, lowercase; null is the default |
| `agent_os` | `mac \| win \| linux \| other` or null | as in the common fields |
| `bot_system_key` | string or null | the addressed bot's raw `systemKey` (`chief_of_staff`, …); null for user bots and other sessions; never a bot name or ID |
| `task_depth` | number or null | 0 top-level conversation or bot, 1 subtask, 2 sub-subtask; null when unknown; never parent IDs or titles |

`error_code` is an enum. It never holds message text. `chief_of_staff` means
`systemKey === "chief_of_staff"`. Every other bot is just `bot`.

## Package

A new `packages/happy-desktop-analytics` package. One `track(event, payload)`
call over a closed, typed catalog, sent from the renderer with `posthog-js` to
PostHog project 202516 (`us.i.posthog.com`). No sampling.

## Open questions

- Is it OK to change Happy Agent so desktop and phone share one person (it would expose the phone's `anonID`)? If not, the desktop stays on its own install ID.
- Subtasks are created by agents, not by a desktop button. Should we count them on the desktop when one first appears, or in Happy Agent?
- Should `model_id` be sent as is, or mapped to a fixed list of models?
- `agent_os` needs Happy Agent's `GET /v0/health` to report its OS family (`mac | win | linux`, no hostname). Is that change OK? Until it ships, `agent_os` is left out rather than guessed.
