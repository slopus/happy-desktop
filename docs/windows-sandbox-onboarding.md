# Windows sandbox permission explanation

The UI review is in Blueprint → Onboarding flow (`#onboarding-flow`), under
`windows-sandbox-before`, `windows-sandbox-waiting`, and
`windows-sandbox-unfinished`, immediately after Subscriptions.
`WindowsSandboxSetup` reuses the same `SetupPage` as the other onboarding steps.
It does not invoke setup on mount. The supplied spider-catching-a-bug animation
plays once when the step appears, then holds its final frame. The heading is
“Set up a safety net for agents”; the copy explains fewer interruptions and
Auto review checking requests for more access to help catch unintended actions.

**The step is not connected to live onboarding yet.** Correct integration needs
Electron host changes, which require two human confirmations under `AGENTS.md`.
This change prepares the UI for review without changing host behavior.

## Where elevation comes from

The first-install renderer starts at
`sources/renderer/localOnboardingStore.ts` → `startSynchronize()` →
`bridge.daemonStart()`. Main handles that through
`DesktopDaemonController.start()`, selects the downloaded release, and runs
`happy-agent reload`.

That is not the only startup path. `DesktopRuntime.create()` starts its local
connection independently of the renderer. `localHappyAgentConnectorCreate()`
attaches to an existing daemon or invokes the selected binary with `start`.
Pausing only the renderer's first install would miss an already selected binary
whose sandbox is still unconfigured.

The actual UAC call is lazy, inside Happy Agent's native Windows supervisor.
`createHostShell` uses `createSupervisorCommand`; the Windows supervisor starts a
restricted session with `WindowsSandboxLevel::Elevated`. If provisioning is
needed, `run_elevated_setup_inner` calls `run_setup_exe_payload`, which invokes
`ShellExecuteExW` for `happy-sandbox-setup.exe`. Sandboxed Git scans use this same
compute boundary. There is no single explicit sandbox-setup call in desktop
onboarding today. Which first command reaches it depends on local state; this
has not been reproduced on Windows in this task.

The elevated helper provisions dedicated `HappySandboxOffline` and
`HappySandboxOnline` local accounts, filesystem access rules, and firewall/WFP
rules. Readiness is versioned and reused. A setup upgrade or repair can require
approval again; “once” describes a normal first setup, not a lifetime guarantee.

## Declining and retrying

Windows reports cancellation as error 1223, represented upstream as
`OrchestratorHelperLaunchCanceled`. The setup gate records the failed attempt
in `.sandbox/setup-attempt.json`. Later automatic attempts refuse with:

> A previous Happy Windows sandbox setup attempt did not complete. No additional
> Windows prompt was opened. Run `happy-agent sandbox setup --retry` when ready
> to try again.

The desktop bridge has no sandbox status, setup, retry, or typed cancellation
contract. Its ordinary connection retry cannot explicitly retry provisioning.
Onboarding may reach a connected daemon without the sandbox, because provisioning
is lazy, but restricted command execution still fails closed. Proceeding past
onboarding would therefore not establish a working sandbox.

The page offers no skip: without setup, restricted agent commands cannot work.
Cancellation and failure share the calm “Sandbox setup didn’t finish.” line
and an explicit “Try again” action.
The benefit copy stays visible while the Windows prompt is open or setup needs
another attempt. It explains autonomous work and automatic checks in plain words.

## Required integration

1. Add a narrow typed native status/setup capability. The native helper already
   exposes `--setup-status` JSON (`ready`, `stateDirectory`, `setupVersion`) and
   `--setup [--retry]`. The CLI's `sandbox status` prints prose, so do not parse
   its wording into product state. Use a machine-readable contract instead.
2. Check readiness before any managed startup path can trigger provisioning.
   Prevent automatic provisioning until the person presses Continue. A renderer
   flag alone cannot control main's independent startup path.
3. Place the step after Subscriptions, only on Windows when native setup is
   required; skip it on other platforms and when readiness is already confirmed.
   Show Sandbox in the stepper only for that flow (`OnboardingSteps.sandbox`).
   Set up invokes explicit setup, then explicit retry after an unfinished attempt.
   Serialize attempts and retain
   the native pending-attempt guard so a second click cannot launch duplicate UAC.
4. Project cancellation and other failures into the UI's `unfinished` state.
   Keep native results typed; never infer cancellation by searching arbitrary
   error text. Use `waiting` while the Windows prompt is open and `before`
   before the first attempt.
5. On confirmed readiness, resume normal onboarding. If adding Learn more,
   connect it to a real host callback opening the sandbox documentation, for example
   `https://github.com/slopus/happy-agent/blob/main/docs/permissions-and-sandbox.md`.

Upstream source inspected for this investigation:

- `happy-agent-supervisor/native/windows/main.rs`
- `happy-agent-supervisor/native/windows/happy.patch`
- `happy-agent/sources/lifecycle/runSandboxCommand.ts`
- `happy-agent-compute/sources/host/createHostShell.ts`
- `happy-agent-compute/sources/supervisor/createSupervisorCommand.ts`

These describe the upstream source inspected during this task, not a verified
execution of every released Windows binary. Native integration must confirm
the bundled helper version and exercise first install, existing readiness,
decline, retry, and interrupted setup on Windows.
