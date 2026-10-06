# Follow-up verification — 2026-10-06

Four fixes were developed in separate worktrees from the merged Windows source. Each fix received an independent review and regression tests; PR descriptions retain the exact tested SHA and CI links.

| Problem | Change | Review and regression evidence |
|---|---|---|
| Clock correction misdated focus completion | Preserve confirmed tick attribution, split the corrected run, synchronize before persistence/commands | [PR #7](https://github.com/b1ueseoyoung/focus-buddy/pull/7): 14 regressions; exact +1-second midnight case, backward jumps, stall, late completion, pause/quit/sleep/reset/finish, restore and deduplication |
| Overnight breaks or exact-midnight focus missing from history | Include captured-date completion/skip and the current active break without increasing focus totals | [PR #6](https://github.com/b1ueseoyoung/focus-buddy/pull/6): 10 regressions; timezone, old-session exclusion and ordering |
| Settings acknowledged failed persistence | Commit snore/checkpoints only after file replacement; block unreadable preferences; retry empty primary patches; staged errors and initial-read retry | [PR #8](https://github.com/b1ueseoyoung/focus-buddy/pull/8): 16 new unit cases and two actual IPC/DOM cases covering disk failure, preservation, retry/relaunch and timer operation during read failure |
| macOS helper launch error bypassed recovery | Idempotent error/exit/close recovery; latest state replay; stale-event and quit guards; accessible Electron fallback until AppKit readiness | [PR #9](https://github.com/b1ueseoyoung/focus-buddy/pull/9): 12 fake-child/isolated-VM regressions, including the unchanged-signature menu and Windows path |

The combined source passed strict TypeScript and **234 unit tests, 1,283 assertions** on macOS arm64. The POSIX permission fixture is skipped on Windows; a separate filesystem-read-error fixture runs on both platforms. The final PR description records the combined macOS development/packaged checks and exact-head Windows run. CI validates source integrity, types, unit tests, Windows x64 packaging and payload audits, unsigned NSIS build, and development/packaged Electron integration. No installer or binary is published by CI.

An actual macOS helper-failure smoke test moved only the freshly generated helper in the isolated worktree. It confirmed an Electron fallback with working settings controls, restored the helper, observed AppKit readiness with the same running session, and paused through the recovered menu. The test recorded and verified its newly created PID and temporary data path before normal quit, then removed that test profile. Test-clock offsets include real elapsed time.

All app tests use dedicated temporary profiles. Shutdown verifies the created Electron PID and its data path. A failed replacement launch retains its profile even when an earlier closed handle used that same path. Tests do not read or write the clipboard or signal unrelated processes.

The stores commit independently: a later save failure preserves earlier successful saves and the UI identifies that partial result. Clock changes between samples cannot be timestamped exactly; the latest offset applies after the last confirmed tick, with a 10ms precision margin. Repeated helper launch failure retains the previous one-second retry policy; a live helper that never reports readiness is not detected by this change.

Physical menu-bar/notification-area clicks, window dragging, transparency hit-testing, actual OS sleep/logoff and forced termination, Windows installation/uninstallation, Intel macOS, Linux, and signed/notarized distribution remain unverified. Existing installed apps and user profiles were not used by these follow-up tests.
