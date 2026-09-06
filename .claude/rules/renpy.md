---
paths:
  - "src/renpy/**"
  - "src/zip/**"
  - "src/types/menu.ts"
  - "src/generators/image/**"
  - "scripts/renpyConfigs.ts"
  - "scripts/renpyGolden.ts"
  - "scripts/dump-rpy.ts"
  - "scripts/update-golden.ts"
  - "scripts/gen-lint.ts"
  - "scripts/e2e-run.mjs"
  - "scripts/e2e.mjs"
  - "src/generators/theme/**"
---

# Ren'Py 생성·내보내기 규칙

- 사용자 텍스트(대사·메뉴 라벨 포함)는 **반드시 `esc`/`escRpyText` 를 거칠 것.** 새 `.rpy` 출력 경로를
  추가할 땐 이스케이프부터 확인한다.
- 화면 언어의 `add x:` 블록에 **애니메이션 ATL 금지.** 정적 속성만 — 애니메이션은 `add x at transform:`.
- 정의된 적 없는 스타일을 `style_prefix` 로 부르지 말 것. frame 에 `style_prefix` 를 걸지 말 것.
- `imagebutton` 에 **`focus_mask True` 금지.**
- 참조하는 파일은 **반드시 zip 에 들어가야 한다.** 새 에셋 출력 경로를 만들면
  `tests/zip-asset-invariant.test.ts` 매트릭스에도 추가한다.
- 파일 경로는 `menuButtonFile()`/`TITLE_LOGO_FILE`/`GAME_ICON_FILE`/`WINDOW_ICON_FILE`(`src/types/menu.ts`)
  **단일 소스**로만 만들 것. 참조 쪽과 배치 쪽이 어긋나면 런타임 크래시다.
- 좌표는 1920×1080 기준 px 를 구울 것 — **`gui.scale()`(720p 기준) 금지.**
- Preview 와 생성기가 **판정을 두 벌로 만들지 말 것**(`spriteSlots`/`selectSprite`·`spriteHiddenFlags`·
  `cgActiveFlags` 를 공유한다). 미리보기에 별도 폴백 state machine 을 만들지 않는다.
- CG 복원에 **새 snapshot·history·state-machine 을 만들지 말 것**(기존 `restoreShownSprites` 공유).
- 새 Ren'Py 출력 경로·새 opt-in 출력 기능을 만들면 **`scripts/renpyConfigs.ts` coverage 를 함께 검토**할 것.
- golden 은 **읽기 전용**이다. 갱신은 `npm run golden:update` 하나뿐이고
  ⚠️ **사용자 명시 승인 없이 실행 금지**다(skill 호출은 승인이 아니다).
- 출력이 바뀌었는지는 `dump:rpy` 두 벌 + `diff -r` 로 본다. 리팩터·죽은 코드 제거는 **1바이트도 달라지면 안 된다.**
- `npm run build` 대신 스크래치 outDir 빌드를 쓸 것(OneDrive exit 127 함정).

**상세·근거·실기 함정 전문 → [`docs/contracts/renpy-export.md`](../../docs/contracts/renpy-export.md)**
