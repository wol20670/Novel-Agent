---
name: review-artifact
description: GPT actual-diff review 에 넘길 artifact 를 repo 밖 scratch 에 .md 로 생성한다. unified diff + untracked 신규 파일 전문 + git status + baseline/branch + verification evidence 를 담는다. truncation 금지 — 커지면 multipart 로 분할한다.
argument-hint: [plan|impl|docs]
disable-model-invocation: true
---

# Review artifact 생성 (standing instructions)

종류: **$ARGUMENTS** (`plan` | `impl` | `docs` — 없으면 `impl` 로 본다)

## 출력 위치·형식 (계약)

- **repo 밖 scratch 디렉터리**에 만든다. repo 안에 쓰지 않는다.
- 확장자는 **`.md` 또는 `.txt`**. ⚠️ **bare `.patch` 금지.**
- 파일명은 이 skill 이 정한다 — 사용자가 손으로 바꿀 필요가 없어야 한다:
  `<scratch>/review/<YYYYMMDD-HHMM>-<종류>-<브랜치>.md`
  분할할 때는 `…-part1.md` · `…-part2.md` … 로 같은 `review/` 디렉터리에 둔다.
- 마지막 보고에서 **모든 part 의 절대경로를 빠짐없이** 출력한다(single 이면 한 줄).

## 담을 것 (순서 고정)

1. **헤더** — 작업 이름 · 종류(plan/impl/docs) · 생성 시각
2. **baseline / branch** — `git rev-parse HEAD` · 작업 브랜치 · `origin/main` · 이 작업의 canonical baseline SHA
3. **`git status --short`** 전문
4. **`git status --porcelain=v1 --untracked-files=all`** 전문 (scope gate 근거)
5. **unified diff** — `git diff`(working tree 대 HEAD). ⚠️ `docs` 종류이거나 uncommitted 작업이면
   **full working-tree diff** 여야 한다(commit 이 아직 없으므로 `git diff HEAD` 가 전부다).
6. **untracked 신규 파일** — 파일별로 경로 + **전문**(diff 에 안 잡히므로 반드시 본문을 넣는다).
   ⚠️ **truncation 금지** — 임의로 자르거나 "앞부분만"·payload 생략을 하지 않는다.
   커지면 자르는 대신 **§multipart 로 분할**한다.
7. **verification evidence** — 실제로 돌린 게이트와 그 출력 요약.
   ⚠️ **돌리지 않은 게이트를 PASS 로 적지 말 것.** 안 돌렸으면 "미실행"이라고 쓴다.
8. **알려진 이슈 / 리뷰어가 봐야 할 지점** — 스스로 판단한 위험 지점.

## multipart 분할 (artifact 가 클 때 — 자르는 대신 이걸 한다)

- **truncation 은 어떤 경우에도 금지다.** 한 artifact 가 너무 커지면 같은 `review/` 디렉터리에서
  `…-part1.md` · `…-part2.md` · `…-part3.md` 로 **분할**한다.
- **`part1` 머리에 manifest 를 둔다**:
  1. part 총 개수
  2. 각 part 의 **절대경로**
  3. 각 part 가 담은 **파일 목록**
  4. 전체 **changed-file list**(= `git status --porcelain=v1 --untracked-files=all` 기준)
- **각 신규 파일의 전문은 정확히 한 part 안에 전부 들어가야 한다.**
  파일 하나가 그 자체로 크더라도 **중간에서 자르지 않고** 그 파일만 담는 **전용 part** 로 뺀다.
- 한 파일을 두 part 에 나눠 싣지 않는다(리뷰어가 이어붙이게 만들지 말 것).
- manifest 의 changed-file list 에 있는 파일이 **어느 part 에도 없으면 artifact 는 미완성**이다 —
  그 상태로 리뷰에 넘기지 않는다.

### coverage 는 "언급"이 아니라 "payload" 로 센다

manifest 에 경로가 **적혀 있다는 것만으로 coverage 를 충족했다고 세지 말 것.**
changed path 하나하나가 아래 둘 중 **하나를 실제로** 갖고 있어야 한다:

1. unified diff 안의 **그 파일 patch**, 또는
2. **신규 파일 full-content 섹션**

⚠️ **manifest 의 목록 행 자체는 payload 가 아니다.**

### incomplete sentinel (artifact 생성기 전용)

- 정상 artifact 에는 **이 sentinel 이 절대 없어야 한다**:

  ```
  <!-- NA-ARTIFACT-INCOMPLETE -->
  ```

- 뜻은 하나뿐이다 — **"생성기가 full diff / full file payload 를 끝까지 담지 못했다."**
- **truncation 은 여전히 금지다.** multipart 로도 완성할 수 없는 상황에서만,
  **part1 의 manifest/헤더 영역**에 이 sentinel 을 넣고 **incomplete 라고 보고한 뒤 STOP** 한다.
  그 artifact 를 **review-ready 라고 하지 않는다.**
- ⚠️ **sentinel 은 part1 헤더 영역에서만 유효**하다. 이 SKILL 파일 자체가 changed file 로
  artifact 에 실릴 수 있어서, **파일 payload 안에 문자열이 보이는 것은 신호가 아니다**
  (NA-PROV 마커와 같은 자기참조 함정이다).

## STOP conditions

- repo 안에 쓰려는 상황 → 멈춘다.
- API 키·토큰·비밀 값이 diff 나 evidence 에 들어가는 상황 → **넣지 않는다.**
  값이 아니라 "환경변수로 주입했다"는 사실만 적는다.
- diff 가 비어 있는데 artifact 를 만들려는 상황 → 그 사실을 보고하고 만들지 않는다.
- **전문을 다 넣을 수 없어 자르고 싶어지는 상황 → 자르지 말고 multipart 로 분할한다.**
  분할해도 담지 못하는 파일이 남으면 **part1 헤더에 incomplete sentinel 을 넣고**
  그 사실을 보고한 뒤 STOP 한다 — **완성됐다고 하지 않는다.**
