# Windows

## Where we are going

No console window may ever be shown on Windows. A PowerShell or console
window flashing in front of the person whenever Happy runs something in the
background is a bug, wherever in the app it comes from.

## How we get there

Every child process launch goes through the shared hidden-window helper,
`packages/happy-desktop-electron/sources/main/childProcess.ts`. It always sets
`windowsHide` and never starts a shell. A direct import of `node:child_process`
anywhere else in the app's sources fails lint. A dependency that starts its own
processes, such as the updater's PowerShell signature check, is patched to hide
its window too.

## How we know it is done

Using Happy on Windows — starting it, connecting Happy Agent, installing and
updating — never shows a console window, and lint refuses any new launch that
does not go through the helper.
