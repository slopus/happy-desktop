# Before the first filmed frame

The recording uses browser-local mode, a fresh headless browser context, and
the already seeded private daemon. This is the complete startup path audited
after the two off-camera failures. Preparation uses real product actions and
authoritative API state; it does not suppress setup components or fake sign-in.

| Gate                                   | Authoritative source                                                | Off-camera preparation                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application dependencies               | `scripts/demo/lib/stage.mjs`; Electron workspace dependencies       | The real app mirror includes analytics, app, Electron, gym, state, and UI. The patched mirror's renderer build passes.                                                                                                                                                    |
| Released Agent artifacts               | Production `happyAgentReleaseVersion` / `happyAgentReleaseDownload` | Inside the approved recorder command, fetch exact 0.4.86 and 0.4.87-preview.7 archives, verify published SHA-256 digests, unpack under the private world's dist/version, and select 0.4.86 before seeding. No separate elevated download runs.                            |
| Browser-local bridge                   | Vite's browser-local meta tag; `browserDevBridge.ts`                | Recorder supplies only the private socket/token paths. No Electron preload, user's daemon, or cloud account is selected.                                                                                                                                                  |
| Welcome                                | `desktopWelcome.ts`; `welcomeStore.ts`                              | Wait for either the sidebar or the real Go Happy button. Click Go Happy if shown; verify `happy.welcome.v1.welcomeAcknowledged` became true through that action.                                                                                                          |
| Native Agent installation/setup        | `browserDevBridge.onboardingGet`; `localOnboardingView`             | Browser-local bridge reports `stage: complete` because the private Agent already runs. `daemonDownload`/`daemonStart` and native setup are not invoked by this preparation.                                                                                               |
| Local provider sign-in                 | `providerAuthenticationLive`                                        | Provider discovery and paid verification run only at providersMissing/assistantsFound. The bridge's complete stage skips that surface. The gym uses dummy provider keys and routes all inference to its private screenplay gateway. No human account or keychain is read. |
| Daemon owner profile                   | `scripts/demo/scenario/runtime.mjs`                                 | The real API saves fictional Alex / alex@example.com in the private profile. The director reads that profile again before filming.                                                                                                                                        |
| Daemon onboarding                      | `gymOpen`; `getOnboarding`/`completeOnboarding`                     | Gym completes real daemon onboarding after project/session seeding. Director verifies `completed: true` before the first frame.                                                                                                                                           |
| Chief of Staff                         | Built-in bot catalog; `localOnboardingStore`                        | Keep the actual built-in bot and avatar; verify its catalog entry and visible name. Browser setup is complete, so the finishing-stage introductory draft/handoff is not invoked. Nothing is sent to the Chief.                                                            |
| Phone setup                            | `happyMobileSynchronize`                                            | Complete browser setup never materializes phone setup. This is a desktop-only take with no phone driver or pairing.                                                                                                                                                       |
| Protocol/runtime boot                  | `DesktopProtocolGate`; `DesktopBootGate`; `DesktopRuntimeContent`   | Private Agent is healthy and runtime is local/ready. Go Happy uses production `desktopBootSkip`; the sidebar, Chief and selected session must render before capture starts. A real protocol/setup failure stops preparation.                                              |
| What's New                             | Renderer/router call sites                                          | No automatic What's New gate is wired into the current desktop local startup path. No release notes are painted over or dismissed synthetically.                                                                                                                          |
| Sidebar visibility and project folding | Fresh browser storage; `Sidebar.tsx`                                | Default storage leaves the sidebar/projects visible. Open the project's real fold control if `aria-expanded` is false, then choose the exact workspace and session tab. Current connection routers use memory history, so changing the URL hash is not used.              |
| Permission prompts                     | Declared seed mode; ordinary real Bash tools                        | Runs keep workspace_write/Auto, using read-only Node fixture tools in their own worktrees. No permission approval is injected or mode switched. A genuine refusal/failure stops the take.                                                                                 |
| Media/system prompts                   | Stage/browser and screenplay                                        | No microphone, camera, file picker, external login, browser proxy, or native permission control is invoked. The browser context is private and the installed Electron host is untouched.                                                                                  |
| Initial app/animation state            | Normal renderer DOM and bundled assets                              | Wait for selected composer/transcript, close the ordinary right panel if open, settle off camera, then measure the raw app crop. The first caption starts capture only after these checks.                                                                                |

Other renderer storage uses defaults in the fresh context: no external tokens,
saved user model preferences, route restoration, collapsed sidebar, or prior
draft is borrowed. The welcome flag is written by the real action, and the
filmed draft is typed through the real composer.

The listener-free director fixture checks both the welcome action and the
already acknowledged path, as well as project expansion, without launching a
browser. It cannot verify real rendering or the update's reconnect behavior.

Offline version compatibility was checked against Agent release source commits
80710466 (0.4.86) and 34811b6d (0.4.87-preview.7). Both expose protocol 26
with minimum 22. AgentBase, durable-storage schema/migrations and recovery code
are unchanged between them. The stable gym inference implementation wraps the
configured production providers/models and supports the Bash tool-call wire
shape. Its existing durable restart scenario asserts the original run ID
finishes without another user message. These are source checks, not a claim
that this exact cross-version recording has already run.
