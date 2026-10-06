# Windows x64 development

Windows support is developed from public source commit `5f5d263ec5ca474eba65b479216e51f9a99f3eb9`. The macOS AppKit helper remains macOS-only. Windows uses Electron's notification-area tray, with the same timer, history, settings, reset, widget visibility/scale and widget cat animations. The tray cat also switches sleep/rest poses and freezes while paused. Taskbar theme changes recolor the existing monochrome faces for contrast.

Start with Windows 10/11 x64, Node.js 22 and Bun 1.4.2. No Swift, Visual Studio, Python, account, paid VM, signing certificate or administrator access is required for this JavaScript app's build. Dependencies and Electron are downloaded on the first build. Windows ARM64 and 32-bit builds are outside this change's validation scope.

## Build and run in PowerShell

```powershell
git clone https://github.com/b1ueseoyoung/focus-buddy.git
cd focus-buddy
# Until merged, check out the Windows PR branch:
git switch windows/desktop-support
bun install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
bun run typecheck
bun run test
bun run build:win
bun run test:e2e
bun run package:win
bun run audit:win
& '.\release\win-unpacked\Focus Buddy Candidate.exe'
```

The app initially shows only the tray icon. It may be inside Windows' hidden-icons overflow. Right-click for the timer, widget toggle, sizes, settings/task name and today's history. Double-click opens the main window. Close hides the main window; **Focus Buddy 종료** exits and checkpoints the timer. Windows does not support a text countdown next to an Electron tray icon, so use its tooltip/menu or enable the widget. The widget stays off the taskbar; its transparent margins and custom resize control use the existing Electron implementation. Windows virtual-desktop behavior follows the current desktop, without macOS's all-workspaces setting.

Data is local to `%APPDATA%\Focus Buddy Candidate`. There is no migration from another installed app. Closing windows keeps the timer alive; normal quit and suspend save a paused state. The Windows session-end query requests a pause/checkpoint without blocking shutdown. An interrupted shutdown can still be resumed. This is best-effort persistence; actual OS shutdown timing is unverified. Notification preferences default off. Toasts need the installed Start Menu shortcut and Windows notification permission; development/unpacked toasts are not guaranteed.

## Package and test

If you opened the unpacked app above, exit it from the tray before running these commands. Close any running unpacked copy before rebuilding a package so Windows can replace its files.

```powershell
$env:FOCUS_BUDDY_CANDIDATE_ELECTRON = (Resolve-Path '.\release\win-unpacked\Focus Buddy Candidate.exe').Path
bun run test:e2e
Remove-Item Env:FOCUS_BUDDY_CANDIDATE_ELECTRON
bun run dist:win
```

`package:win` produces an unpacked x64 application. `dist:win` builds an **unsigned NSIS installer** on Windows that defaults to the current user and does not request elevation. It does not automatically launch the app or remove user data on uninstall. An explicitly elevated launch can expose NSIS all-users options; run normally for a per-user installation. The project does not publish release binaries or auto-update. An unsigned local installer may prompt Windows SmartScreen; signing and reputation are not part of this change.

On macOS, `bun run package:win` can download and assemble the Windows payload. It skips executable icon/version resource stamping to avoid requiring Wine. This cross-build cannot run the EXE or verify Windows UI; use native Windows/CI for the stamped executable and installer. `bun run dist:win` intentionally requires Windows. `bun run package:mac` retains the Swift/AppKit and ad-hoc-signing flow.

## Verification evidence

Local host: macOS arm64. Strict TypeScript, the existing 174 unit tests and five new tray-animation/theme tests pass. Windows x64 cross-packaging and payload audit passed: 175 files, 28 compiled output files matched, six runtime dependency packages and 12 notice files; no macOS helper or private data was found. This only verifies packaging on the Mac host. macOS regression integration and exact-commit Windows CI are tracked in the draft PR checks; those results must be assessed separately.

The [Windows workflow](../.github/workflows/windows.yml) runs on standard `windows-2022` GitHub-hosted runners for this public repository, with `contents: read`, no secrets, no artifact upload and no release step. PR checkout uses `pull_request.head.sha`; the log shows the exact commit. It runs the locked install, source-manifest check, typecheck, unit tests, development and packaged Electron integration, NSIS build and payload audits. Test profiles are restricted to their own direct child directories under the OS temporary directory, including symlink/canonical-path checks.

Automated integration invokes actual AppKit/Electron menu callbacks and renderer UI with a controlled timer/suspend fixture. It does **not** prove physical Windows notification-area clicks, taskbar overflow placement, monitor/DPI/theme appearance, transparent-margin hit testing, real sleep/logoff, notification delivery, installer interaction or uninstall. **Manual Windows GUI validation remains unverified.** No merge or public binary release is performed.

Implementation references: [Electron Tray](https://www.electronjs.org/docs/latest/api/tray), [system taskbar theme](https://www.electronjs.org/docs/latest/api/native-theme), [window session/workspace behavior](https://www.electronjs.org/docs/latest/api/base-window), and [Windows notifications](https://www.electronjs.org/docs/latest/tutorial/notifications).
