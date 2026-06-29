# CLAUDE.md

Novel-Agent — 오프라인 Ren'Py 비주얼노벨 제작 보조 웹앱 (Vite + React + TS + zustand + Tailwind).
100% 클라이언트(백엔드 없음), BYO 키. 한국어 코드베이스.

## 명령
- `npm run dev` — 개발 서버(http://localhost:5173). **NovelAI는 dev에서만 동작**(CORS 프록시 필요).
- `npm run build` — tsc + vite build
- `npm run typecheck` — `tsc --noEmit`. **코드 변경 후 항상 실행.**
- `npm run sync:tags` — Google 시트 → `src/generators/image/tagDictionary.ts`(@generated 블록). predev가 `--soft`로 자동 실행.
- `npm run push:tags` — 시트 정규화·쓰기(중복병합·정렬). **서비스 계정 키 `.secrets/sheets-sa.json` 필요**(gitignore·기기 로컬). `scripts/tag-additions.csv`로 신규 태그 추가.

## 환경 함정 (중요)
- **Windows node 종료는 PowerShell**: `Get-Process node | Stop-Process -Force`. bash `pkill`/`taskkill`는 자주 실패. 좀비 `vite preview`가 `dist`/포트를 잡으면 옛 빌드를 계속 서빙한다.
- **OneDrive dist 빌드 함정**: 프로젝트가 OneDrive 동기 폴더라, `vite build`가 23MB wasm을 `dist/`에 쓸 때 간헐적으로 **에러 없이 exit 127**로 죽는다. **코드 문제 아님**(환경). 검증만 목적이면 `npx vite build --outDir <OneDrive 밖 경로> --emptyOutDir`. tsc는 무관하게 통과. 근본해결은 프로젝트를 OneDrive 밖에 두기.

## NovelAI (이미지 생성 = NovelAI 단일 / OpenAI 키는 텍스트용만: 태그 변환·테마)
- 호스트: 생성·증강·encode-vibe = `/nai`(image.novelai.net), **업스케일 = `/nai-api`(api.novelai.net = Primary 호스트)**. dev 프록시는 `vite.config.ts`(`/nai-api`를 `/nai`보다 먼저).
- 토큰 = persistent token(`pst-…`), localStorage만, **절대 커밋 금지**.
- **무료(Opus) 4조건**(전부 충족 시 Anlas 0): n_samples=1 · 총 ≤1,048,576px · steps ≤28 · 텍스트 전용(img2img/augment 미사용).
- **업스케일**: 4배 고정(예: 832×1216→3328×4864), ~7 Anlas. 같은 시드라도 **해상도 바꿔 재생성하면 다른 그림** → 재생성 말고 업스케일이 정석.
- **Vibe(그림체 참조)**: `/ai/encode-vibe`로 **선인코딩**(신규 1장 2 Anlas, 세션 캐시) 후 참조. raw base64 직접 전달은 V4.5에서 오작동. 다중 패널 참조는 콜라주 유발 → 단일 인물 권장.
- **Emotion Director(표정 변경)는 무료** — 비용 누수 아님, 건드리지 말 것.
- 스프라이트는 **전신**(`1.4::full body::`) + 콜라주 방지 네거티브.
- 상세 API 명세: `docs/`의 NovelAI PDF(gitignore·로컬 전용).

## 데이터·구조
- 저장: 프로젝트 메타=localStorage, 바이너리 에셋=IndexedDB. **앱 작업물은 브라우저별**(기기 이동은 앱 📤내보내기/📥가져오기 `.npproj.zip`). 키도 기기별 재입력.
- 핵심 파일: 상태=`src/store.ts`(zustand), Ren'Py 출력=`src/renpy/generate.ts`, AI 설정 단일소스=`src/config/aiConfig.ts`, 태그 사전=`src/generators/image/tagDictionary.ts`(자동생성, 직접 편집 금지).
- gitignore: `.secrets/`(서비스 계정 키), `docs/`, `node_modules/`, `dist/`.

## 워크플로우 (YOU MUST)
- **커밋·푸시는 사용자가 명시적으로 허락하기 전까지 절대 금지.** 코드 수정·검증은 자유.
- `main`에서 작업하면 새 브랜치부터.
- 변경 후 `npm run typecheck`로 검증(가능하면 OneDrive 밖 빌드로 한 번 더).
- 커밋 메시지는 한국어 + conventional prefix(`feat`/`fix`/`perf`/`chore`/`ux`). 기존 코드 스타일(주석 밀도·네이밍) 맞추기.
