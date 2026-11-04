# Windows sandbox permission explanation

The UI review is in Blueprint → Onboarding flow (`#onboarding-flow`), under
`windows-sandbox-explain`, `windows-sandbox-waiting`, `windows-sandbox-declined`,
and `windows-sandbox-failed`. `WindowsSandboxSetup` is a reusable modal with
explicit props and callbacks. It does not invoke setup on mount.

**The modal is not connected to live onboarding yet.** Correct integration needs
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

## Required integration

1. Add a narrow typed native status/setup capability. The native helper already
   exposes `--setup-status` JSON (`ready`, `stateDirectory`, `setupVersion`) and
   `--setup [--retry]`. The CLI's `sandbox status` prints prose, so do not parse
   its wording into product state. Use a machine-readable contract instead.
2. Check readiness before any managed startup path can trigger provisioning.
   Prevent automatic provisioning until the person presses Continue. A renderer
   flag alone cannot control main's independent startup path.
3. Show the modal only on Windows when native setup is required. Continue invokes
   explicit setup; Try again invokes explicit retry. Serialize attempts and retain
   the native pending-attempt guard so a second click cannot launch duplicate UAC.
4. Project cancellation and other failures separately into the UI's declined and
   failed states. Never infer cancellation by searching arbitrary error text.
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
