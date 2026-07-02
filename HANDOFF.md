# 인수인계 (HANDOFF) — 노트북 → 집 PC

> 노트북 세션에서 작성. **집 PC의 Claude Code가 이어받기 위한 문서**입니다.
> (사용자 메모리 `~/.claude/.../memory/` 는 기기 간 동기가 안 되므로, git 으로 동기되는 이 파일이 유일한 인수인계 경로입니다.)
> 작성: 2026-07-02 (노트북)
> **모든 후속 작업이 끝나면 이 파일과 `CLAUDE.md` 상단의 포인터 줄을 삭제하세요.**

---

## 1. 이번 세션에 한 일 (요약)
1. **GitHub main 정리** — 집 PC의 이전(오작동) 세션 커밋 2개(c0213a9, a4f4033)를 폐기하고 main 을 노트북 상태로 force-push 되감음. 이후 foxcg 태그 7종을 `sync:tags` 로 재동기화해 정상 커밋(f5435dc).
2. **전체 코드 리뷰 + 미세 수정** — 모듈 연결 전수 검증(번역 파이프라인 11경로 등), 헤더 모드 칩 "OpenAI 모드" 오표기 → "NovelAI 모드" 수정 등(f086e9e).
3. **★ BGM 생성 AI 조사 → ElevenLabs Music 선정 → 클라이언트 통합** ← 이번 핵심 (아래 상세). **이 커밋에 포함됨.**

## 2. BGM 생성: ElevenLabs Music 통합 (핵심)

### 왜 ElevenLabs 인가 (음악 AI 비교 결론)
- **Suno / Udio**: 공식 API **없음**(수상한 서드파티 리셀러만) + 상업 라이선스 **불확실**(저작권 소송 진행 중, 유료도 귀속 보장 못 함) → 상업 배포 VN 에 **법적 지뢰**.
- **Google Lyria**: 공식(Gemini)이나 Lyria RealTime = **WebSocket 스트리밍 잼세션**(파일 생성용 아님), Lyria 3 = Vertex/엔터프라이즈 → 통합 과중.
- **ElevenLabs Music**: ✅ 공식 API + ✅ **라이선스 음원 학습 → 게임 상업 배포 허용(유료 플랜)** + ✅ **동기 호출**(폴링·작업ID 불필요) + ✅ `force_instrumental`. → **선정.**

### 단가 (2026-07 기준)
- 요율: **900 크레딧/분 = 약 $0.15/분**. 30초 트랙(앱 기본) ≈ 450크레딧 ≈ **$0.075**.
- 플랜: Free(상업 **불가**) / **Starter $6**(상업 최소·30k크레딧) / Creator $22(121k) / Pro $99(600k). 크레딧은 TTS·SFX 공용.
- **상업 배포하려면 최소 Starter($6/월).** VN 하나(고유 BGM 15곡·각 30초)면 ≈ $1.1 로 Starter 한 달에 충분.

### 변경 파일 (6개, 모두 이 커밋에 포함)
- `src/generators/audio/elevenProvider.ts` **(신규)** — 동기 `POST /v1/music`, `force_instrumental:true` 고정, 인증 헤더 `xi-api-key`, mp3 응답 → **WAV 트랜스코드**.
- `src/config/aiConfig.ts` — `audio.eleven` 블록(`host`/`composePath`/`model`/`lengthMs`/`outputFormat`).
- `vite.config.ts` — `/eleven` dev 프록시(→ `api.elevenlabs.io`).
- `src/store.ts` — `elevenKey` 상태·`setElevenKey`·hydrate(localStorage 키 `na_eleven_key`) + `generateBgm` 분기(키 있으면 ElevenLabs, 없으면 synth 폴백).
- `src/components/LeftPanel.tsx` — "🎵 ElevenLabs 음악(BGM) API" 키 입력 UI.
- `src/generators/audio/synthProvider.ts` — `encodeWav` export(트랜스코드에서 공용).

### 설계 결정 (중요)
- **mp3 → WAV 트랜스코드**: BGM 이 앱 전체에서 `.wav` 로 고정돼 있어(`renpy/generate.ts`·`buildZip.ts`), mp3 를 받아 브라우저 `decodeAudioData` → `encodeWav` 로 변환해 **기존 파이프라인 무변경**(저위험). → mp3 네이티브(더 작은 파일)는 향후 최적화 여지(그때 renpy/zip 확장자 동적화 필요).
- **dev 전용**: CORS 때문에 NovelAI 와 동일하게 **개발 서버에서만 동작**.
- **synth 폴백 유지**: `elevenKey` 없으면 기존 오프라인 합성(`synthBgm`) 그대로.
- `force_instrumental` 고정: 가사가 성우 대사·몰입 방해하지 않도록.

### ✅ 검증됨 / ⚠️ 미검증
- ✅ `npm run typecheck` 통과 · `npm run dev` 부팅 무에러 · UI 렌더 확인 · synth 폴백 유지.
- ⚠️ **실제 ElevenLabs API 호출은 미검증** (유료 키가 없어서). ← **집 PC 에서 할 일.**

## 3. 집 PC 에서 할 일 (다음 단계)
1. `git pull` (origin/main 최신 = 이 커밋).
2. `npm install`(필요 시) → `npm run dev`.
3. 좌측 패널 **"🎵 ElevenLabs 음악(BGM) API"** 에 ElevenLabs API 키 입력.
   - 상업 배포용이면 **Starter($6) 이상 유료 플랜** 키여야 함(무료는 음악/상업 제한).
4. 장면 선택 → 우측 미리보기 **"음악 생성"** → 실제 흐름 실측:
   - [ ] 생성 성공? [ ] mp3→WAV 변환 정상? [ ] 미리보기 재생? [ ] `music/` 보관폴더 저장? [ ] Ren'Py ZIP 에 포함?
5. 문제 시 조정 지점:
   - **CORS/엔드포인트**: `vite.config.ts` 의 `/eleven` target + `aiConfig.audio.eleven.host`/`composePath`.
   - **401**(인증): 키 확인. **403**: 무료 플랜 제한(유료 필요). **422**: body 파라미터(`model_id`/`music_length_ms`/`force_instrumental`) 확인.
   - **길이/모델**: `aiConfig.audio.eleven.lengthMs`(기본 30000ms, 범위 3000~600000) / `model`(`music_v1`↔`music_v2`).
6. 실측 OK → (선택) 크레딧/비용 실시간 표시 UI 추가 논의 가능. 커밋은 **사용자 허락 후**.

## 4. 표준 워크플로우 (CLAUDE.md 준수 — 반드시)
- **커밋·푸시는 사용자가 명시적으로 허락한 뒤에만.** main 에서 작업하면 **새 브랜치부터**(→ `--no-ff` 머지 → push → 브랜치 삭제).
- 코드 변경 후 **항상 `npm run typecheck`**. (가능하면 OneDrive 밖 경로로 `vite build` 한 번 더.)
- **Windows node 종료는 PowerShell**: `Get-Process node | Stop-Process -Force` (bash `pkill`/`taskkill` 자주 실패, 좀비 preview 함정).
- **OneDrive 폴더 함정**: `vite build` 가 간헐적으로 에러 없이 exit 127 로 죽음(환경 문제, 코드 아님).
- 커밋 메시지: 한국어 + conventional prefix(`feat`/`fix`/`chore`/…), 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- NovelAI 토큰(`pst-…`)·OpenAI·ElevenLabs 키, `.secrets/` 는 **절대 커밋 금지**(모두 localStorage/기기 로컬).

## 5. 참고
- 완료된 보류과제: foxcg 태그 7종 DB 반영 = **완료**(시트+`tagDictionary.ts` 동기화됨).
- 이미지 생성 = NovelAI 단일, 텍스트(태그변환·테마) = OpenAI, **음악 = ElevenLabs(신규)**.
- 이 인수인계가 끝나면 이 파일 + `CLAUDE.md` 상단 포인터 줄을 삭제할 것.
