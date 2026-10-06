# Third-party notices

On 2026-10-06 the user explicitly selected the public repository `b1ueseoyoung/focus-buddy`, MIT for the project's own source, and CC BY 4.0 for the project's own cat artwork. See `LICENSE` for the source grant and `ARTWORK-LICENSE.md` for the exact artwork paths, attribution and changes. These choices do not relicense upstream or third-party material. The package's `private: true` prevents accidental npm publication and does not describe GitHub repository visibility.

This list preserves the licenses of components actually used by the candidate. Provenance records and the user's license choices do not guarantee exclusive copyright or third-party non-infringement.

| Component | Version | License / preserved notice |
|---|---|---|
| Electron runtime | 44.5.1 | MIT, `licenses/LICENSE-Electron.txt`; bundled components in `licenses/LICENSES.chromium.html` |
| React | 18.3.1 | MIT, `licenses/LICENSE-React.txt` |
| React DOM | 18.3.1 | MIT, `licenses/LICENSE-React-DOM.txt` |
| Zustand | 5.0.3 | MIT, `licenses/LICENSE-Zustand.txt` |
| React runtime dependencies: Scheduler / loose-envify / js-tokens | 0.23.2 / 1.4.0 / 4.0.0 | MIT; respective `licenses/LICENSE-*.txt` files and packaged module notices |
| Galmuri | 2.40.4 | SIL OFL 1.1, `licenses/LICENSE-Galmuri.txt`; unmodified WOFF2 files retain their original license |
| sprite-gen, used as an offline postprocessing tool | commit b058341f7543f3adcbea227bd4e6b7587895b1bc | Apache-2.0 tool LICENSE and original NOTICE, `licenses/LICENSE-sprite-gen.txt` / `licenses/NOTICE-sprite-gen.txt`; tool source is not bundled |

Build/test tools are declared in `package.json` and `bun.lock`. They are downloaded during local development and are excluded from the application payload. TypeScript and Playwright use Apache-2.0; Vite, the React Vite plugin, electron-vite, electron-builder and type declarations retain their own package licenses. Their lockfile inventory is recorded in `docs/DEPENDENCIES.json`.

Apple AppKit/Foundation and system Swift frameworks are linked from macOS and are not copied into the candidate's source or payload.

The original Open-LLM-VTuber-Web license is recorded in `docs/SOURCE_LICENSE_REVIEW.md`. Its restricted bootstrap, UI fragments, AI/Live2D modules, SDK and model assets are excluded from this standalone export. A backend MIT license does not replace the original frontend license.

Generated artwork and hand-drawn menu artwork have separate provenance in `docs/ASSET_PROVENANCE.md`. The paths licensed under CC BY 4.0 are listed in `ARTWORK-LICENSE.md`; retain its attribution, license link and modification notices when reusing those images. The official license text is preserved in `licenses/LICENSE-CC-BY-4.0.txt`. Galmuri fonts, third-party code, and the sprite-gen tool notices remain under their own conditions and are excluded from that artwork grant.
