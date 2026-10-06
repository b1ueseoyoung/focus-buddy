# Focus Buddy 소스·라이선스 경계 검토

검토일: 2026-10-06. 대상은 `focus-buddy-candidate` 버전 `0.1.0-candidate.1`의 분리 소스다. 사용자는 2026-10-06에 공개 대상 저장소 `b1ueseoyoung/focus-buddy`, 자체 코드의 **MIT**, 직접 만든 고양이 그림의 **CC BY 4.0**을 명시적으로 선택했다. 코드 범위는 [LICENSE](../LICENSE), 그림의 경로별 범위·크레딧은 [ARTWORK-LICENSE.md](../ARTWORK-LICENSE.md), 제삼자 예외는 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)에 따른다. `package.json`의 `private: true`는 우발적인 npm 게시를 막는 설정이며 GitHub 저장소의 공개 여부를 뜻하지 않는다.

사용자의 선택을 반영한 출처 검토이며 독점 저작권, 비침해 또는 소스와 앱 번들의 법적 배포 가능성을 보증하지 않는다. 별도 Terminal Mod의 승인을 이 앱에 전용하지 않았고, 이 앱에 대한 새 명시적 승인을 기준으로 한다.

## 기반 라이선스와 분리 원칙

기반 웹 프로젝트의 고정 커밋 `3d57a9a0125a0ca13e5d096f7092e4e494ed389e`는 **Open-LLM-VTuber License 1.0**이다. Apache-2.0에 추가 조건을 붙여 비상업 사용과 일정한 VTuber 콘텐츠 수익화를 허용하고, 유료 접근·호스팅, 상업 재배포·재브랜딩, 유료 제품 통합에는 별도 상업 라이선스를 요구한다. 기반 전체를 조건 없는 MIT 또는 순수 Apache-2.0으로 다시 표시하는 근거가 아니다. [고정 웹 LICENSE](https://raw.githubusercontent.com/Open-LLM-VTuber/Open-LLM-VTuber-Web/3d57a9a0125a0ca13e5d096f7092e4e494ed389e/LICENSE).

별도 백엔드 `v1.2.1`의 MIT LICENSE는 웹 클라이언트의 조건을 대체하지 않는다. 백엔드의 submodule 선언도 frontend를 별도 웹 저장소로 지정한다. [백엔드 LICENSE](https://raw.githubusercontent.com/Open-LLM-VTuber/Open-LLM-VTuber/3afa41014b4548a0842e9ee2f576f4b164b48886/LICENSE), [submodule 선언](https://raw.githubusercontent.com/Open-LLM-VTuber/Open-LLM-VTuber/3afa41014b4548a0842e9ee2f576f4b164b48886/.gitmodules).

이 소스는 기존 기반 shell과 SDK를 제외하고, Focus 전용 구현을 선택해 새 진입점과 연결했다. 자체 코드의 MIT 선택은 원본 프로젝트의 소스·자산 또는 라이선스를 재허가하지 않는다. 같은 저장소에 있던 신규 파일이라는 사실만으로 기반 조건의 적용 여부나 독점 저작권을 확정하지도 않았다. 남아 있는 기반의 실질적 코드 차입이 확인되면 그 부분의 고지·조건 또는 별도 허가를 다시 검토해야 한다.

## 이력 근거와 실제 포함 소스

고정 upstream tree에는 `src/shared/focus`, `src/main/focus`, `src/renderer/src/focus`가 없다. 로컬 추가 이력은 `f532f7e`의 계약·시계, `7bd51cb`의 타이머, `d96ba4d`의 집계, `76f7a00`의 JSON 저장, `daf6d43`의 서비스, `6f3f180`의 Focus UI로 이어진다. 커밋된 타이머·집계·저장·서비스 표본의 copy-aware blame에서 고정 upstream 조상에 귀속된 줄은 발견되지 않았다. 추가로 커밋 이력이 있는 유지 대상 Focus 파일 35개를 대조했다. `windows.ts`의 표준 path import·Electron webPreferences/preload 경로 구문에는 upstream 귀속이 나타났으며, toolkit import와 `FocusApp.tsx`의 Chakra import는 현재 분리 소스에서 제거됐다. 짧은 표준 구문을 실질적인 기반 기능 구현으로 판단하지 않았지만, 이력 결과를 모든 줄의 독창성 증명으로 해석하지 않는다. 미커밋 파일은 이 blame 대조가 불가능하다.

기존 76개 감사 대상의 파일 SHA-256과 분리 소스를 대조해 유지된 Focus 구현, 수정된 연결부, 새 shell 및 제외된 기반 경계를 구분했다. 원본 76개 파일의 SHA-256은 모두 유지됐다. 신규 경로·파일 해시·이력은 출처의 근거이며 외부 차입의 완전한 부재나 기여자의 권리 귀속을 증명하지 않는다.

| 현재 포함 범위 | 실제 처리와 출처 경계 |
| --- | --- |
| `src/shared/focus` | timer/commands/state/types/clock/today 및 테스트를 유지한다. `constants.ts`에서는 사용하지 않던 WebSDK 완료 상태 상수와 주석을 제거했다. `AI_FEATURES_ENABLED = false`는 잔존 표식이며 AI 구현이나 제공자 연결을 포함하지 않는다. |
| `src/main/focus` 및 `src/preload/focus-api.ts` | Focus 타이머 서비스, JSON 저장, IPC, 전력 이벤트, 알림, 트레이, snore cue, 네이티브 메뉴 연결과 테스트를 유지한다. `app-protocol.ts`는 renderer 정적 파일 경계를 유지하면서 이전 Live2D 테스트 분기를 제거했다. `windows.ts`는 toolkit import를 제거하고 후보 preload 및 sandbox 설정을 사용한다. |
| `src/renderer/src/focus`의 유지 파일 | MainView/SettingsPanel/TodayPanel/MiniView/PixelWidget/PixelCat, 두 CSS, store/format/labels/cat-player/snore/use-widget-scale와 필요한 타입·테스트를 포함한다. `labels.ts`의 제거된 Live2D 자산 고지를 정리했고, `store.ts`의 브라우저 mock fallback을 제거했다. 기존 타이머·저장 구현은 새 shell에서 사용한다. |
| 새 후보 shell | `src/main/index.ts`는 후보 이름·저장 경로·단일 인스턴스·창·종료 저장을 조립한다. `src/preload/index.ts`와 `bridge-types.d.ts`는 Focus 전용 채널 허용목록 bridge다. 기존 arbitrary IPC/mode/mic/capture wrapper를 가져오지 않았다. |
| 새 React 진입점 | `src/renderer/src/main.tsx`, `reset.css`, `src/renderer/index.html` 및 작은 `focus/FocusApp.tsx`로 구성한다. 기존 App·Chakra provider·upstream Toaster를 포함하지 않는다. |
| 후보 빌드·검사 구성 | 최소 `package.json`, `electron.vite.config.ts`, `electron-builder.yml`, 두 strict tsconfig와 후보용 native build/signing/bundle audit scripts를 사용한다. `e2e`는 후보 bridge와 별도 임시 프로필을 사용한다. 기존 Live2D/VAD 정적 복사와 원본 Git 이력은 포함하지 않는다. |
| 직접 제작 메뉴 소스 | `scripts/native-menu.swift`를 유지하고 후보 빌드에서 helper를 생성한다. `prepare-menu-cat-face.py`는 얼굴의 정수 좌표 제작 부분을 유지하며 과거 비교 보드·Arial 의존성을 제거했다. 생성된 위젯 고양이와는 별개의 자산이다. |

새 shell이라는 표시는 실제 코드 교체와 의존 경계에 대한 설명이다. clean-room 개발, 특정인의 독점 소유 또는 모든 줄의 독창성을 인증하는 표현이 아니다.

## 실제 제외된 기반 경계

후보에 다음 원본 파일·경로가 없는 것을 확인했다.

- `src/main/window-manager.ts`, `menu-manager.ts`, 원본 전체 preload 선언, 기존 `renderer/src/App.tsx`, `components/ui/toaster.tsx`, 기존 `vite.config.ts`, 기존 CLAUDE 문서. 원본의 제한 LICENSE를 분리 소스의 라이선스로 복사하지 않았으며 새 루트 LICENSE는 선택된 자체 코드 범위의 MIT 고지다.
- Focus의 BackendGate/local-model/use-local-model/ModelStage, character-adapter/use-character-reaction/CharacterBubble/Notices/focus-styles 및 이전 browser mock 경로.
- renderer의 기존 context·canvas·UI 컴포넌트 트리, WebSDK/Live2D 모델·core, VAD/ONNX/WASM, 이전 favicon과 모델 아이콘.

후보의 renderer public 입력은 고양이와 폰트 자산이다. `src`의 외부 import 대조에는 Electron/Node, React/react-dom, Zustand 및 Bun 테스트만 나타났다. SDK·AI 제공자·websocket·Chakra·toolkit import는 없었다. 설치된 개발 의존성 목록에 나타나는 이름은 소스에서의 사용 또는 최종 앱 동봉과 구분한다.

## 제삼자 고지와 자산

Electron **44.5.1**의 MIT LICENSE와 Chromium 고지를 포함한다. `licenses`의 Electron/Chromium, React, React-DOM, Scheduler, Zustand, loose-envify, js-tokens 고지 8개는 후보의 실제 설치 사본과 바이트가 일치했다. 해당 고지는 프로젝트 소스와 그림의 라이선스를 부여하지 않는다. [Electron 44.5.1 공식 LICENSE](https://raw.githubusercontent.com/electron/electron/v44.5.1/LICENSE), [설치 의존성 목록](DEPENDENCIES.json).

Galmuri 2.40.4의 변경 없는 세 WOFF2는 별도 OFL-1.1 자산으로 유지하며 `licenses/LICENSE-Galmuri.txt`와 fonts 고지를 보존한다. 프로젝트 소스의 향후 라이선스로 폰트를 덮어쓰지 않는다. [고정 Galmuri OFL](https://raw.githubusercontent.com/quiple/galmuri/71e1cacf1437a11220307120e63e30bc275312d4/ofl.md).

위젯·앱 아이콘의 생성 출처, 실제 sprite-gen 후처리, CLI 생성 실패, 프레임/앵커 및 직접 제작 메뉴 얼굴은 [ASSET_PROVENANCE.md](ASSET_PROVENANCE.md)에 구분해 기록했다. sprite-gen 소스와 제공자·AI 서버는 runtime에 동봉하지 않는다. `licenses/LICENSE-sprite-gen.txt`와 `NOTICE-sprite-gen.txt`는 사용한 도구의 고지다. 도구의 Apache-2.0은 출력 PNG의 라이선스를 자동으로 결정하지 않는다. 사용자가 선택한 CC BY 4.0의 대상 그림과 수정·크레딧 표시는 [ARTWORK-LICENSE.md](../ARTWORK-LICENSE.md)를 따른다. 폰트·도구 코드·제삼자 고지는 그 그림 범위에 포함되지 않는다. [고정 도구 LICENSE](https://github.com/aldegad/sprite-gen/blob/b058341f7543f3adcbea227bd4e6b7587895b1bc/LICENSE), [NOTICE](https://raw.githubusercontent.com/aldegad/sprite-gen/b058341f7543f3adcbea227bd4e6b7587895b1bc/NOTICE).

## 선택 범위와 검토 한계

1. MIT는 선택된 자체 소스의 허가이며, 기반 프로젝트나 함께 포함한 제삼자 구성요소의 원래 조건을 없애지 않는다. 그림은 경로별 CC BY 4.0 범위, 폰트는 OFL, runtime·도구 고지는 각각의 원래 조건을 유지한다.
2. 고양이 그림의 CC BY 4.0 선택은 사용자가 보유하는 권리 범위의 허가다. 이미지 생성·후처리 기록이나 라이선스 선택 자체가 독점 저작권, 생성 당시 특정 서비스 계약의 권리 범위 또는 비침해를 보증하지 않는다.
3. 실제 공개할 source/lockfile/notices와 최종 binary payload를 별도로 대조해야 한다. 빌더는 out/resources/licenses 및 필요한 runtime 패키지를 대상으로 하고, `.local-checks`, 로그, 사용자 프로필·기록과 원본 Git 이력은 공개 허용목록에서 제외해야 한다. `scripts/audit-bundle.cjs`는 최종 payload 검사를 위한 도구이며 이 문서 자체가 모든 빌드 결과를 승인하지 않는다.

이 검토는 파일·이력·정적 import·고지 사본의 대조다. 여기서 앱 실행, 새 빌드 또는 테스트를 수행하지 않았고 원본 앱·사용자 데이터·설치 앱·Terminal Mod를 변경하지 않았다. 기능 검증 통과와 라이선스·권리 승인은 별개다. 추가 기반 코드 또는 미확정 외부 자산이 발견되면 공개 전에 해당 경계를 다시 검토한다.
