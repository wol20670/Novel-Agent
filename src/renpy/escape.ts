// Ren'Py 문자열 리터럴 이스케이프 — generate.ts 와 gui/screensRpy.ts 가 함께 쓰는 순수 함수 모듈.
// 원래 generate.ts 안에 있었는데, screensRpy.ts(= generate.ts 가 gui/index.ts 를 거쳐 이미 import
// 하는 모듈)가 escRpyText 를 쓰면서 generate.ts → gui/index.ts → screensRpy.ts → generate.ts 순환
// import 가 생겼다. 지금까지는 export function 선언의 호이스팅 덕에 우연히 동작했지만(모듈 평가
// 시작과 동시에 함수 바인딩이 존재), 번들러·평가 순서가 바뀌면 깨질 수 있는 잠재 지뢰라 이스케이프
// 헬퍼만 순환에서 완전히 빠지는 이 모듈로 분리했다. generate.ts 는 여기서 import 해 기존 이름
// 그대로 re-export 한다(외부 호출부 — 특히 tests/generate-escape.test.ts — 가 안 깨지도록).

/**
 * Ren'Py 문자열 리터럴 이스케이프 코어. esc/escRpyText/escLit 세 래퍼가 공유한다(과거 esc 에서만
 * `[`/`{` 이스케이프가 빠져 런타임 크래시가 났던 것처럼, 복붙 재구현이 서로 갈라지는 걸 막기 위함).
 * 치환 순서: 역슬래시 → 따옴표 → (tags==='escape' 일 때만) [ / { 텍스트태그 무력화 → % → 개행 → trim.
 */
function escapeRpy(s: string, opts: { tags: 'escape' | 'keep'; newline: 'space' | 'literal'; trim: boolean }): string {
  let out = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (opts.tags === 'escape') {
    // [ ] 는 변수 보간, { } 는 텍스트 태그로 해석되므로(예: 사용자가 "[속보]"·"{웃음}" 을 입력) 무력화
    // 해야 한다 — 안 하면 NameError/Unknown text tag 로 런타임에 죽는다.
    out = out.replace(/\[/g, '[[').replace(/\{/g, '{{');
  }
  // %(변수)s 같은 보간 문법이 아닌 순수 문자(예: "할인 20%")는 %% 로 이스케이프해야 한다.
  // 안 하면 Ren'Py 가 그 줄을 표시할 때 "Unknown string format code" 로 런타임에 죽는다(실제 SDK로 확인).
  out = out.replace(/%/g, '%%');
  out = opts.newline === 'space' ? out.replace(/\r?\n/g, ' ') : out.replace(/\r?\n/g, '\\n');
  return opts.trim ? out.trim() : out;
}

/** 대사·이름 등 script.rpy 본문용: 태그 무력화 + 개행은 공백으로 뭉개고 앞뒤 trim. */
export function esc(s: string): string {
  return escapeRpy(s, { tags: 'escape', newline: 'space', trim: true });
}

/** 아이템/크레딧/메뉴 라벨 등 단일 문자열 리터럴용: 태그 무력화 + 개행은 `\n` 리터럴로 보존, trim. */
export function escRpyText(s: string): string {
  return escapeRpy(s, { tags: 'escape', newline: 'literal', trim: true });
}

/** UI 문자열 이스케이프 — `{b}`·`[config.version!t]` 같은 태그·보간은 보존하고 따옴표·역슬래시·개행만 처리. */
export function escLit(s: string): string {
  return escapeRpy(s, { tags: 'keep', newline: 'literal', trim: false });
}
