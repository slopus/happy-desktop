# Windows sandbox permission explanation

The UI review is in Blueprint → Onboarding flow (`#onboarding-flow`), under
`windows-sandbox-before`, `windows-sandbox-waiting`, and
`windows-sandbox-unfinished`, immediately after Subscriptions.
`WindowsSandboxSetup` reuses the same `SetupPage` as the other onboarding steps.
It does not invoke setup on mount. The supplied spider-catching-a-bug animation
plays once when the step appears, then holds source frame 250: the spider is
down and the bug is still caught with its wings folded. Replays end on the same
pose. Its 80×80px scene matches the other onboarding steps. The heading is
“Set up a safety net for agents”; the copy explains fewer interruptions and
Auto review checking requests for more access to help catch unintended actions.

## How it is wired

Happy Agent answers for its own sandbox through `happy-agent sandbox status --json`
(`{status: "ready" | "required", setupVersion, previousAttempt?: "cancelled" | "failed"}`)
and `happy-agent sandbox setup [--retry] --json`
(`{status: "ready" | "cancelled" | "failed", setupVersion}`).
`sources/main/windowsSandbox.ts` reads that answer once per selected Agent
executable, on Windows with a daemon Happy manages:

- Every daemon Happy starts takes its environment from `WindowsSandbox`, so a
  supported Agent runs with `HAPPY_WINDOWS_SANDBOX_NO_PROVISION=1` and no command
  can open Windows' administrator prompt by itself.
- `LocalOnboarding` holds setup on the `sandbox` stage after Subscriptions while
  the sandbox is `required`, for a returning machine as much as a new one, and
  on `examining` until the Agent has answered.
- Only the step's button reaches `onboardingSandboxSetup`, which runs explicit
  setup without the hold. Presses while it runs join it rather than opening a
  second prompt, and an attempt after an unfinished one passes `--retry`.
- `cancelled` and `failed` come back typed and show as the unfinished state.
- An Agent that cannot answer `sandbox status --json` is launched unchanged and
  sets itself up on first use, as before; the step stays out of the way.

The `windows-host` job in `desktop-validate.yml` typechecks and tests the
Electron host on Windows from any ref, without signing.

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

Onboarding may reach a connected daemon without the sandbox, because provisioning
is lazy, but restricted command execution still fails closed. Proceeding past
onboarding would therefore not establish a working sandbox.

The page offers no skip: without setup, restricted agent commands cannot work.
Cancellation and failure share the calm “Sandbox setup didn’t finish.” line
and an explicit “Try again” action.
The benefit copy stays visible while the Windows prompt is open or setup needs
another attempt. It explains autonomous work and automatic checks in plain words.

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
