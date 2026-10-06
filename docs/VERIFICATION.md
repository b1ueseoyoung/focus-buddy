# Verification — 2026-10-06

Standalone source publication `0.1.0-candidate.1`, macOS arm64, Electron **44.5.1**. The original installed Focus Buddy and the terminal Mod were not replaced or edited. New dependency installation is local to the candidate and preserves the original linked `node_modules`.

| Check | Actual result | Scope |
|---|---|---|
| Strict TypeScript, main/preload/shared/E2E and renderer | Pass, zero errors | `bun run typecheck`; strict mode in both configs |
| Unit tests | **174 pass / 0 fail**, 712 assertions | Timer transitions, validation, aggregation, persistence, service serialization, renderer state, cat player, snore synthesis |
| Development runtime integration | **5 pass / 0 fail**, 110 assertions | Fresh isolated profiles; AppKit and clock/suspend fixtures |
| Built macOS package integration | **5 pass / 0 fail**, 110 assertions | Explicit packaged executable, same tests; no production user data |
| Native menu compilation | Pass | New arm64 Swift helper from included source |
| Build and package | Pass | Vite production output and Electron 44.5.1 arm64 application; ad-hoc signing and verification |
| Production smoke, E2E disabled | Pass | Actual packaged app, test API absent, initial windows hidden, native AppKit item visible |
| Real running clock | Pass | About 1404 ms decrease during 1400 ms observation in a separate profile |
| Pause and cat pose | Pass | Actual widget button pauses; remaining time and displayed PNG pose stay fixed |
| Widget geometry and local fonts | Pass | 280×310 viewport, 240 px panel; panel top and cat ledge both y=116, no cat clipping; Korean fonts loaded |
| Package payload audit | Pass | 175 files; only six declared React runtime dependency packages, 28 compiled files match current output, 17 cat/icon PNGs, 12 third-party/artwork notice files and the project LICENSE/ARTWORK-LICENSE/THIRD_PARTY_NOTICES; no SDK/models/private data |
| Asset review | Pass | Runtime frames/fonts match reviewed originals; references resolve; no old favicon, SDK, VAD/ONNX/WASM/model assets |
| Original-source preservation | Pass | 76 source files from the origin audit retained their SHA-256; installed app archive remains unchanged |

Package archive SHA-256 at the final runtime check: `32dae46a2a303a225462347ad7db5cd56d77f6c6fe87ed26a6f9323d888154a5`.

Integration checks cover the menu-bar-first default; native menu settings action; main/widget single state; start/pause/resume/reset; completed-focus count; manual next; long break after four completed focus sessions; break skip; widget visibility and scale persistence; task/custom settings; history and normal-quit paused recovery; completion deduplication; elapsed time while windows are hidden; and simulated suspend/wake with explicit resume.

The test clock and AppKit action hooks are fixtures. They do not prove physical OS clicks, actual macOS sleep, forced termination, background throttling under every host load, window dragging or transparency hit-testing. Those remain **unverified**. Windows/Linux, Intel macOS and notarized distribution are also unverified.

`preview/widget-focus@2x.png` and `preview/settings@2x.png` are actual production-mode candidate app captures, using a separate local profile. The widget is 100% default size; the settings capture uses 75% standard view zoom to fit the entire panel. They are not mock HTML or UI composites and do not contain the user's work history. The earlier Downloads portfolio folder records the separately installed original app, not this candidate.

Private test logs, process identities, temporary profile paths and saved sample data are intentionally excluded from the source ZIP. No CI workflow or remote test run has been claimed. This verification establishes local behavior and packaging boundaries; it is not a legal opinion or a guarantee of exclusive artwork rights. On 2026-10-06 the owner separately approved publication at b1ueseoyoung/focus-buddy, MIT for project source and CC BY 4.0 for the designated cat artwork; third-party exceptions remain in their original notices. The final license-only package was rebuilt and its five packaged integration tests passed again; application logic and sprite pixels were not changed by publication preparation.
