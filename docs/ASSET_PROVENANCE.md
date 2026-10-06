# Focus Buddy 자산 출처

감사일: 2026-10-06. 대상은 Focus Buddy macOS 공개 후보의 자산이다. 원본 앱, 사용자 설정·기록, 설치된 앱과 Claude Mod는 변경하지 않았다. 이 문서는 확인한 출처와 후처리를 기록한다. 2026-10-06 권리자의 공개 승인에 따라 자체 코드는 **MIT**, 프로젝트가 만든 고양이 그림은 **CC BY 4.0**으로 공개한다. 범위와 출처 표시 조건은 [ARTWORK-LICENSE.md](../ARTWORK-LICENSE.md)에 명시하며, 제3자 자산은 원래 조건을 유지한다. 생성물의 독점권이나 법적 보호를 보증하는 것은 아니다.

## 배포 후보와 출처

| 자산 | 확인된 출처 | 실행 시 사용 | 라이선스 구분 |
|---|---|---|---|
| `src/renderer/public/cat/base.png` | 기존 Codex 내장 ImageGen 출력과 파일 바이트가 동일한 기초 고양이 | 첫 렌더와 매니페스트 로딩 전 대체 그림 | 생성 이미지. CC BY 4.0을 실제 부여 가능한 권리 범위에 적용; 계약·독점권 보증 없음 |
| `src/renderer/public/cat/{sleep,wake,stretch,rest}-frame-N.png` | ImageGen 상태별 행 → sprite-gen 추출·큐레이션 → 15개 검토 프레임 | `PixelCat.tsx`가 매니페스트의 개별 PNG를 표시 | 생성 이미지 및 후처리 결과. CC BY 4.0; 도구 Apache-2.0과 구분 |
| `src/renderer/public/cat/playback.json` | 상태·프레임 시간·반복·후속 상태를 기록한 프로젝트 메타데이터 | 매니페스트 로딩 | 프로젝트 소스·JSON은 MIT |
| `src/renderer/public/cat/app-icon.png`, `resources/icon.png`, `resources/icon.icns` | 별도 기존 ImageGen 고양이 얼굴을 앱 아이콘으로 변환 | 헤더·빈 기록 화면, Electron 아이콘, macOS 번들 아이콘 | 생성 이미지. CC BY 4.0; 위젯 몸 그림·메뉴 얼굴과 다른 자산 |
| `resources/menu-cat/*.png`, `resources/tray-icon*.png` | `scripts/prepare-menu-cat-face.py`가 정수 좌표로 직접 그린 흑색 픽셀 얼굴 | 메뉴바 AppKit 및 Electron 대체 트레이 | 직접 제작 고양이 그림은 CC BY 4.0; 제작 스크립트는 MIT |
| `resources/menu-cat/face-playback.json` | 직접 제작 얼굴의 포즈·시간·픽셀 해시 | 참고 문서. Swift 실행 코드는 시간 배열을 직접 사용함 | 프로젝트 소스·JSON은 MIT |
| `resources/focus-menu-helper` | `scripts/native-menu.swift`를 `scripts/build-native-menu.cjs`로 컴파일한 arm64 실행 파일 | macOS 메뉴바 상태 항목 | 프로젝트 소스의 빌드 결과. 시스템 라이브러리는 함께 복사하지 않음 |
| `src/renderer/public/fonts/*.woff2` | Galmuri 2.40.4, 공식 고정 커밋의 변경 없는 3개 폰트 | 로컬 CSS 폰트 | SIL Open Font License 1.1. 프로젝트 라이선스로 재라이선스하지 않음 |

생성 서비스의 현재 로그인, 유료 접근, 계정 유형 또는 상업 이용 계약을 추정하지 않았다. 인증 정보를 읽거나 새로운 이미지 생성 요청을 실행하지 않았다. 권리자는 공개할 자체 고양이 그림에 CC BY 4.0을 선택했다. 이 선택은 권리자가 실제 부여할 수 있는 범위에만 적용되며, 이 문서는 특정 계약의 허용·금지 또는 모든 외부 권리의 정리 여부를 판정하지 않는다.

## 위젯 고양이: 실제 사용한 과정

sprite-gen 공식 로컬 체크아웃과 생성 기록에 사용한 커밋은 `b058341f7543f3adcbea227bd4e6b7587895b1bc`다. [고정 README](https://github.com/aldegad/sprite-gen/blob/b058341f7543f3adcbea227bd4e6b7587895b1bc/README.md), [고정 SKILL.md](https://github.com/aldegad/sprite-gen/blob/b058341f7543f3adcbea227bd4e6b7587895b1bc/SKILL.md), [도구 LICENSE](https://github.com/aldegad/sprite-gen/blob/b058341f7543f3adcbea227bd4e6b7587895b1bc/LICENSE), [도구 NOTICE](https://github.com/aldegad/sprite-gen/blob/b058341f7543f3adcbea227bd4e6b7587895b1bc/NOTICE)를 확인했다.

1. 투명 기초 고양이로 요청·레이아웃 가이드·상태 프롬프트를 준비했다.
2. sprite-gen `gen-set` 시도는 4개 상태 모두 실패했다. 기록의 성공 수는 0이다. 기존 playback 문서는 이를 `gen-set CLI unsupported model`로 표시하며 원시 실패 기록에는 종료·취소 진단이 남아 있다. **sprite-gen 제공자 생성이 성공했다고 보고하지 않는다.**
3. 이후 Codex 내장 ImageGen으로 만든 4개 상태 행이 저장됐다. 현 raw 상태 행은 기존 ImageGen 출력 4개와 파일 바이트가 일치한다.
4. 공식 sprite-gen 추출 결과는 `ok: true`이며 투명 프레임을 만들었다. 추출 시 rest의 두 프레임에 경계 픽셀 경고가 남았고, 최종 앱은 추출본 전체 대신 검토된 curated 결과를 사용한다.
5. 큐레이션 기록은 공통 배율 0.92와 정수 오프셋, `pixel_unfake: true`를 기록한다. wake는 최종 3프레임을 선택했고 나머지 상태는 각 4프레임이다.
6. 앱의 15개 실행 프레임은 curated 파일과 **파일 바이트가 모두 동일**하다. 실행 시 sprite-gen, AI 서버, 원시 시트 또는 생성 제공자는 필요 없다.

실행 캔버스는 264×180이고 몸의 ledge 앵커는 y=94다. sleep은 4×500ms 반복, wake는 3×200ms 일회 재생 후 stretch, stretch는 4×200ms 일회 재생 후 rest, rest는 4×333ms 반복이다. 실제 프레임은 `src/renderer/public/cat/playback.json`이 정의한다.

| 기록 대상 | SHA-256 |
|---|---|
| 기초 고양이 / `base.png` / `base-source.png` | `1182211c5445a3fb2173d741e30ea0063b30c19b01813ba4b5f904189ec0df87` |
| ImageGen sleep 원시 행 | `a780715d9a5eeb4cef621eb216897b32d4121c0b7470cb14ad69899bcfb6c2eb` |
| ImageGen wake 원시 행 | `8cb9325ffe74740bb236d72ba4cc458b9011e6dd579f87f44c6f54db44662094` |
| ImageGen stretch 원시 행 | `e1e125e41c60f1990aba322e3377d070608f199cb6df6b27de4699fc5ddf2b3b` |
| ImageGen rest 원시 행 | `c41249d2065ffd14a825c19561a085d194333cff9d6517b54a6cf0ad569d2340` |

위 원시 그림·시트·실패 로그·개인 로컬 경로는 이 공개 후보에 포함하지 않는다. 도구 코드의 Apache-2.0은 도구 코드의 조건이며 입력·생성 그림에 자동으로 적용되는 라이선스가 아니다. `licenses/LICENSE-sprite-gen.txt`와 `licenses/NOTICE-sprite-gen.txt`는 사용한 후처리 도구의 원문 고지다. 도구 소스나 가상 환경을 앱에 동봉하지 않는다.

## 앱 아이콘: 오래된 기록 정정

현재 `resources/icon.png`와 `src/renderer/public/cat/app-icon.png`는 같은 1024×1024 RGBA 파일이며 SHA-256은 `74a112220c2a34b7d9bd1ecd9a6d25c0f74d8d6ddd1c2b9d298e97ef4d8ec216`이다.

기존 아이콘 provenance 기록이 가리킨 이미지와 nearest 변환은 현재 픽셀에 일치하지 않았다. 감사에서 확인한 현재 아이콘은 기존 별도 ImageGen 출력(SHA-256 `d0ba6b8af3e01c516e7b8eb9c65fbb8b13571f0f779c1a8f5f7ffb8fe85aa812`)을 **1024×1024 LANCZOS**로 축소한 결과와 RGBA 픽셀이 완전히 일치한다. 이 문서는 실제 파일을 기준으로 기록을 바로잡으며 원본 provenance 파일은 변경하지 않았다.

`resources/icon.icns`의 1024px 그림은 현재 PNG와 픽셀이 동일하다. ICO의 최대 256px 그림도 현재 PNG의 LANCZOS 256px 변환과 픽셀이 같다. macOS 후보는 ICNS와 현재 main 소스가 참조하는 PNG를 사용한다. Windows ICO는 macOS 실행에 필요하지 않다.

| 현재 아이콘 | SHA-256 |
|---|---|
| `resources/icon.png` / `src/renderer/public/cat/app-icon.png` | `74a112220c2a34b7d9bd1ecd9a6d25c0f74d8d6ddd1c2b9d298e97ef4d8ec216` |
| `resources/icon.icns` | `30fef191a5965a50b733d322e7055dce64ba01db6eeed79d5db96f2af7a68caf` |
| 기존 Windows `resources/icon.ico` | `cfd1d9d62f3a9f7477c44b7dc4fbf61abf66aa0796c7cf4f0fd127c558f95c01` |

기존 `src/renderer/public/favicon.ico`는 git HEAD의 변경 없는 이전 여성 캐릭터 그림이었다(SHA-256 `d51ae8ae0788d9ab061e4303fa8cb201f9c719b3615d86a0062c6814c4ecec68`). 공개 후보의 사용 자산으로 채택하지 않는다.

## 메뉴바: 생성 그림과 별개의 직접 제작 얼굴

`scripts/prepare-menu-cat-face.py`의 고정 윤곽 좌표와 검은 눈·입을 Pillow 메모리 이미지에 재현했다. 재현 결과는 sleep/rest 각 4개의 18×18 PNG 및 36×36 nearest 복제 **총 16개**의 실제 픽셀과 모두 일치했다. 같은 open 그림의 tray-icon 1x/2x도 일치하며 `face-playback.json`의 픽셀 SHA 4개도 확인했다. 외부 그림, Claude 마스코트 또는 RunCat 자산을 읽는 코드가 이 제작 스크립트에 없다.

포즈는 open → half → closed → open이고 간격은 4600/100/100/200ms, 한 주기는 5000ms다. 윤곽과 귀는 고정되고 눈만 변한다. Swift helper는 동일 시간 배열을 직접 사용하며 `face-playback.json`을 읽지 않는다. `isTemplate = true`로 시스템 테마에 따라 표시하는 흑색 알파 자산이다.

| 상태 / 프레임 | 18px PNG SHA-256 | 36px PNG SHA-256 |
|---|---|---|
| `sleep-0` | `e6179e98ab0e03b4b9d3392c225a1ba2ac5c9a0814fb45f63773efc3bdbebf77` | `1bf029b20900ee54febf4626417b7654d77c42abc388c95493d5dfd16f6cc777` |
| `sleep-1` | `1c8d2ec3cac0b98f5c1b12ce5321476cd914a53d3be4975adedabb46f37306fd` | `b34260c6d2a5d98dd5cc59bfa6d00fb94eb7f78ce521f5395cbc2b49c0ae29e9` |
| `sleep-2` | `60ce74a3c9160ba07eeba2fb9d4e5c75f80ce4a627eedad0a345dfda16c8686b` | `9d91c197b02dabd13ef8d5e0f4d2578be8d5e57571e40830283c40cd7ee78155` |
| `sleep-3` | `e6179e98ab0e03b4b9d3392c225a1ba2ac5c9a0814fb45f63773efc3bdbebf77` | `1bf029b20900ee54febf4626417b7654d77c42abc388c95493d5dfd16f6cc777` |
| `rest-0` | `e6179e98ab0e03b4b9d3392c225a1ba2ac5c9a0814fb45f63773efc3bdbebf77` | `1bf029b20900ee54febf4626417b7654d77c42abc388c95493d5dfd16f6cc777` |
| `rest-1` | `1c8d2ec3cac0b98f5c1b12ce5321476cd914a53d3be4975adedabb46f37306fd` | `b34260c6d2a5d98dd5cc59bfa6d00fb94eb7f78ce521f5395cbc2b49c0ae29e9` |
| `rest-2` | `60ce74a3c9160ba07eeba2fb9d4e5c75f80ce4a627eedad0a345dfda16c8686b` | `9d91c197b02dabd13ef8d5e0f4d2578be8d5e57571e40830283c40cd7ee78155` |
| `rest-3` | `e6179e98ab0e03b4b9d3392c225a1ba2ac5c9a0814fb45f63773efc3bdbebf77` | `1bf029b20900ee54febf4626417b7654d77c42abc388c95493d5dfd16f6cc777` |

Swift helper의 현 감사 대상은 114,432바이트 arm64 Mach-O이며 SHA-256은 `67b7dd3d1475f6f30916a45af7b42fac271113c6c4823aacce63ceea315dad41`이다. `otool -L`에는 AppKit/Foundation/CoreFoundation/CoreGraphics와 Apple 시스템·Swift 라이브러리만 나타났다. 공개 빌드는 제공한 Swift 소스로 해당 macOS 환경에서 다시 빌드한다. 다른 아키텍처의 실행 가능성은 이 자산 감사에서 검증하지 않았다.

원본 제작 스크립트는 비교 보드의 문구에 macOS Arial을 사용했다. 공개 후보 스크립트에서는 비교 보드와 Arial 의존성을 제거하고 실행 PNG·재생 메타데이터만 재현한다. Arial 파일이나 비교 보드는 동봉하지 않으며 실행 시 메뉴바는 macOS 시스템 숫자 폰트를 사용한다.

## Galmuri: 변경 없는 공식 폰트

원본: [Galmuri 공식 저장소](https://github.com/quiple/galmuri), 고정 커밋 `71e1cacf1437a11220307120e63e30bc275312d4`, 버전 2.40.4. 저작권자는 Lee Minseo이고 라이선스는 [SIL OFL 1.1](https://github.com/quiple/galmuri/blob/71e1cacf1437a11220307120e63e30bc275312d4/ofl.md)이다.

감사 시 공식 고정 커밋의 `dist/` 파일을 메모리로 읽었으며 아래 세 파일은 현재 로컬 파일과 **파일 바이트 및 SHA-256이 모두 동일**했다. CDN 없이 로컬 CSS에서 사용한다. 원본 저작권 고지와 OFL 전문을 `licenses/LICENSE-Galmuri.txt`에 보존했다. 기존 public/fonts LICENSE와 resources 고지 사본도 서로 동일했다. OFL 폰트 파일에 프로젝트의 별도 소스 라이선스를 적용하지 않는다.

| 파일 | 바이트 | SHA-256 |
|---|---:|---|
| `Galmuri11.woff2` | 505400 | `8bad9322b3340bfb5cb26cb00f4752bf4c8e7d1b526bb07205f4af458eebed31` |
| `Galmuri11-Bold.woff2` | 166352 | `0cfd6ce25b9f531fab677a604d96bc062cc139166880a086da3b4d72b1bb2492` |
| `GalmuriMono11.woff2` | 489452 | `2d67105edf831e269485b8f98e9a39bfa5589ac4c25a396bab4f2897126761f5` |

## 실행 자산 포함 목록

- 고양이: base, app-icon, playback JSON과 JSON이 가리키는 15개 sleep/wake/stretch/rest PNG.
- 폰트: 위 WOFF2 세 개, SOURCE/저작권·OFL 고지.
- macOS 리소스: 현재 icon PNG/ICNS, tray 1x/2x, 메뉴 얼굴 16개 PNG, 새 빌드의 native helper. face-playback JSON은 작동 필수가 아닌 출처 참고용이다.
- 재현 소스: 직접 제작 얼굴 스크립트, Swift helper 소스와 빌드 스크립트. 재현·출처 파일은 실행 의존성과 구분한다.
- 제삼자 고지: Galmuri OFL, 사용한 sprite-gen의 Apache LICENSE 및 원래 NOTICE.

공개 후보에서 제외할 자산: 원시 생성 시트와 프롬프트·가이드·QA 모음·실패 보고서 전체, 메뉴 그림 후보 A/B/C, 시뮬레이션·실행 캡처 ZIP, 로컬 브라우저/앱 데이터, 개인 경로가 든 과거 provenance, 옛 favicon, Live2D 모델/텍스처/SDK 및 음성 모델·WASM 파일. sprite atlas와 원시 frames는 현 개별-PNG 플레이어의 실행 의존성이 아니다.

기존 원본 Vite 설정은 Live2D core·VAD/ONNX 파일을 복사하고 기본 public 폴더에도 옛 SDK/모델이 있었다. 공개 후보에서는 단순 미참조만으로 제외가 보장되지 않으므로 public 자산과 빌드 복사 대상을 명시적으로 제한해야 한다. 원본 소스의 별도 제삼자 저작권 고지 필요성은 자산 제외와 별개로 소스 감사에서 판단한다.

## 감사 범위와 한계

- 위젯 프레임 존재·curated 동일성, 직접 메뉴 얼굴 16PNG/트레이/픽셀 SHA, 세 공식 폰트 동일성, 앱 아이콘의 실제 파생 원본·변환을 확인했다.
- 현 runtime PNG의 메타데이터에는 텍스트 청크가 없었다. 감사한 helper/ICNS/ICO 바이트에서 개인 홈 경로나 Library 메타데이터 표식을 발견하지 않았다.
- 원본 앱 실행·절전·전력·메뉴 클릭 또는 공개 후보 전체 패키징의 검증을 새로 수행한 문서가 아니다. 생성 서비스 계약의 권리 범위나 생성물의 법적 보호 여부를 보증하는 문서도 아니다. 선택된 공개 라이선스의 적용 범위는 별도 고지에 따른다.
- 이 문서에는 개인 홈 절대 경로, 인증 정보, 계정명, 세션·요청 식별자와 원시 실행 로그를 넣지 않았다.
