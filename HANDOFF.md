# HANDOFF

> 살아있는 상태 문서 — **삭제하지 말 것.** 세션 시작 시 CLAUDE.md 워크플로우 규칙대로 정리.
> 상세 이력·완료 내역은 git log가 보존하니 여기엔 남기지 않는다(짧게 유지).

## 🎯 다음 할 일
- (비어 있음 — 다음 지시 대기)

## 📌 알아둘 것 (지속)
- **Supabase Storage 경고는 무시**(대시보드 "Remove policy" 절대 누르지 말 것 — 에셋 동기화가 400으로 깨진다). 에셋 버킷의 실제 노출 범위는 "배포 URL 아는 사람 = 전부 열람·업로드 가능"이며 감수한 선택(2026-08-05). 상세는 `supabase/setup.sql` 머리 주석.
- **이미지 GUI 3종(메인·퀵·ESC)은 전부 opt-in** — 아무것도 안 올리면 생성 `.rpy`가 기존과 바이트 단위로 같아야 한다(회귀 0). 손댈 때마다 작업 전 커밋에서 여러 구성으로 `.rpy`를 덤프해두고 `diff -r`로 증명할 것(CLAUDE.md "출력 회귀 0 증명법").
- **표정 AI 배정 실키 검증도 최후순위로 연기**(2026-08-10, TTS와 같은 취급) — OpenAI 키로 후보 밖 라벨·연속성·미소 계열 분화·토큰 견적을 볼 항목이었으나 당분간 안 한다. 코드는 이미 있으니 재개할 땐 `src/generators/emotion/` 부터.
- **TTS(Typecast)는 최후순위로 연기**(2026-08-09) — 실키 검증·Vercel Edge 배포 확인 모두 당분간 안 한다. 코드는 이미 들어와 있으니 재개할 땐 `src/config/aiConfig.ts`·`api/typecast.ts` 부터.
- **메뉴 아트는 언어별로 만들지 않는다**(2026-08-09) — 글자가 구워진 버튼이 영어·일본어에서도 한글로 남지만 감수. 다국어는 **텍스트 번역 + 폰트 교체**로만 간다(Ren'Py `tl/<언어>/` 이미지 치환은 CLAUDE.md에 방법만 남겨둔다).
- 미착수(계속 의도적으로 뺌): `store.ts`(2857줄) 슬라이스 분리, 탭 컴포넌트 코드 스플리팅.

## ✅ 방금 반영됨 (다음 세션에서 git log 확인 후 이 줄들 삭제)
- **플레이어가 정하는 주인공 이름**(`project.playerName`, opt-in — 에셋 탭 캐릭터 섹션 토글 + 대상 화자 select). `Character(<callable>, dynamic=True)` 라 대사를 낼 때마다 `who()` 를 다시 불러(`renpy/character.py:1541`) **이미 저장된 게임까지 즉시 반영**된다. 첫 실행에만 `label start` 에서 묻고(가드는 `player_name_asked` 플래그 — 빈 입력 `""` 을 그대로 저장해야 기본 이름이 그때그때 자막 언어를 따라간다), 이후엔 설정 화면에서 변경. ⚠️ **`renpy.input(exclude="{}[]%")` 이 이 기능의 핵심 방어** — `who` 가 `substitute()` 를 거쳐서(`character.py:1400`) 안 막으면 플레이어가 친 `[`·`%` 가 CLAUDE.md 이스케이프 크래시를 재현한다(엔진 기본 exclude 는 `{}` 뿐). test 463→471 · lint 3구성 무경고 · playerName 미사용 구성 회귀 0(i18n 구성만 `tl/*/ui.rpy` 에 새 UI 문자열 3쌍 추가 — 설계상 정상). **실기 스크린샷으로 설정 화면 렌더까지 확인**(스톡·ESC 양쪽).
- **BGM 연속 재생 — 같은 곡이면 안 끊기게**(`play music … if_changed`, 기본 켜짐). 장면 라벨마다 무조건 `play music` 을 내서 **같은 곡이어도 장면·선택분기가 바뀌면 처음부터 다시 재생**되던 문제. Ren'Py 가 "재생 중 파일명 == 요청 파일명"이면 dequeue·fadeout 을 건너뛰고 fadein 을 0 으로 강제하는 키워드(`renpy/audio/music.py`)를 쓴다 — 곡이 다르면 기존 경로(fadeout→fadein 1.0) 그대로. 토글 2개 신설(`project.bgmPlayback`, 에셋 탭 🎵 BGM 섹션): ① `restartSameBgm`(끊고 처음부터 = 옛 동작) ② `stopWhenUnset`(BGM 미지정 장면에서 `stop music fadeout 1.0` — **판정은 `hasBgm(scene)`**, "#BGM 을 안 적었다"와 "적었지만 업로드 전"은 다르게 취급). test 457→463 · lint 무경고(기본·stopWhenUnset 두 구성) · **회귀 diff 는 `play music` 줄의 ` if_changed` 하나뿐**(17구성 대조). ⚠️ **실기 청취 확인은 아직 안 함** — 곡이 실제로 안 끊기는지는 사용자가 들어봐야 한다.
- **게임 메뉴 배경 업로드 슬롯 제거 + 검증된 문제 4건 정리**. `game/gui/game_menu.png` 를 채우는 자리가 에셋 탭 `menuArt.game` 과 ESC `공통 배경` 둘이라 중복이었다 → `menuArt.game` 을 타입·store·assetRefs·UI·buildZip 폴백까지 **완전 제거**(ESC `bg` → 테마 그라데이션 2단계만 남음, 자동 이관 안 함 — `bg` 를 채우면 ESC GUI 전체가 켜지므로). 같이: ① 테마 미리보기 제목이 렌더 중 `getState()` 비반응 읽기라 갱신 안 되던 버그 ② CG 없는 프로젝트에도 굽던 `cg_thumb_mask.png` 를 `hasCg` 게이트로 ③ 안 쓰이는 export 3개 ④ 사실과 어긋난 주석 3곳. test 456→457 · typecheck 통과 · **회귀 0**(12구성 `.rpy` 바이트 동일 — 생성기 쪽 변경은 주석·export 키워드뿐) · lint 무경고.
