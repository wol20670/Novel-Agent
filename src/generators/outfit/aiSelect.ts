// AI 의상 전환 추천 — 표정 배정(generators/emotion/aiSelect.ts)과 **문제 구조가 다르다.**
// 표정은 dense 배정(줄마다 하나씩 골라 emotionAuto 에 저장)이지만 의상은 **sparse 탐색**이다:
// 대본이 "갈아입었다"고 말한 자리만 찾고, 그 결과는 canonical 에 바로 쓰지 않고 **사람이 검수해
// 수락할 때만** 기존 Line.outfits 에 manual 값으로 들어간다(store 의 applyOutfitSuggestion).
// 의상은 carry 되기 때문에(한 번 틀리면 다음 변화까지 계속 틀린 옷) 오답 비용이 크고 검수 비용은
// 작아서, emotionAuto 같은 자동 저장 필드를 만들지 않았다.
//
// 이 모듈이 지키는 계약(어기면 게임 semantics 와 어긋난다):
//  · effective outfit **값**은 언제나 기존 outfitFlags 단일 소스에서 온다 — 여기에 의상 fold 를
//    새로 만들지 않는다(outfitSource 는 그 값의 "출처 라벨"일 뿐 값을 다시 계산하지 않는다).
//  · 요청은 leadIn + scan 이라는 causal window 밖을 절대 참조하지 않는다(look-ahead 없음).
//    미래의 manual 값·hide/show 는 그 위치를 실제로 읽는 다음 window 가 제공한다.
//  · hide 는 **상태(initialHidden)와 전이(markers)가 다른 개념**이다. spriteHiddenFlags 가
//    "그 줄의 override 를 적용한 뒤" 값을 담으므로 전이 판정은 flags[i-1] vs flags[i] 여야 한다.
//  · 후보(정답 공간)는 characterOutfits 원문뿐 — fuzzy 매칭도 새 이름 생성도 없다.

import { aiConfig } from '../../config/aiConfig';
import { retryWithBackoff } from '../shared/retry';
import { chunkItems, isTransientTranslateError } from '../translate';
import {
  characterOutfits,
  outfitFlags,
  spriteHiddenFlags,
  type Character,
  type Line,
  type OutfitRule,
  type Project,
  type Scene,
} from '../../types';

/** 90초 — 표정 배정·번역과 동일 기준. */
const OUTFIT_TIMEOUT_MS = 90_000;
/**
 * 응답 폭주 방지 상한. ⚠️ estimate.ts 의 OUTPUT_TOKENS_PER_REQUEST(견적용 근사값)와 **다른 축**이다 —
 * 견적 상수를 여기에 쓰면 변화가 많은 장면에서 응답이 잘려 제안이 조용히 사라진다.
 */
const MAX_OUTPUT_TOKENS = 2048;

/** scan window 경계 — 표정의 planEmotionChunks(40/4000)를 재사용하지 않는다(배정 vs 탐색). */
const SCAN_MAX_LINES = 60;
const SCAN_MAX_CHARS = 3500;
/** lead-in(읽기 전용) 상한 — 넘치면 **오래된 쪽부터** 버린다(scan 에 가까운 줄 우선). */
const LEAD_IN_MAX_LINES = 10;
const LEAD_IN_MAX_CHARS = 500;
/** 검수 표시용 사유의 최대 길이 — 시스템 프롬프트가 모델에 요구하는 값과 **같아야** 한다(계약 일치). */
const MAX_REASON_CHARS = 40;

/** 대본 한 줄(scan·lead-in 공용). i = scene.lines 안의 원본 인덱스. */
export interface OutfitScriptLine {
  i: number;
  /** 지문이면 undefined(JSON.stringify 가 키째로 떨군다). 합동 대사는 묶음 라벨 그대로. */
  speaker?: string;
  /** 합동 대사의 실제 캐릭터들 — 합성 라벨은 target 이 아니지만 member 는 정상 target 이다. */
  members?: string[];
  text: string;
}

/** 이미 사람이 지정해둔 줄 의상 — 모델에게 "여긴 확정"이라고 알린다(그 (i,character)는 제안 금지). */
export interface OutfitFixedEntry {
  i: number;
  character: string;
  outfit: string;
}

/**
 * 읽기 전용 마커. hidden/shown 은 **실제로 일어난 전이**만(요청 시작 상태는 initialHidden 이 따로 나른다),
 * cg 는 **first effective CG** 하나뿐이다(orphan `kind:'cg'` 는 CG 를 활성화하지 않으므로 보내지 않는다).
 */
export interface OutfitMarker {
  i: number;
  event: 'hidden' | 'shown' | 'cg';
}

/** currentOutfit 값이 **어디서 왔는지**만 설명하는 transient 라벨(값 계산에 쓰지 않는다). */
export type OutfitSource = 'line-manual' | 'scene-manual' | 'rule' | 'default';

/** 요청에 실리는 캐릭터 하나 — 후보(정답 공간) + 창 시작 시점 상태. */
export interface OutfitCharState {
  character: string;
  /** characterOutfits(c) 원문 — canonical exact match 의 정답 공간. */
  outfits: string[];
  /** ⚠️ 반드시 outfitFlags(scene, rules, char)[scanStart] — 여기서 다시 계산하지 않는다. */
  currentOutfit: string;
  outfitSource: OutfitSource;
}

/** 한 장면의 Outfit AI 대상. planOutfitWindows 가 이걸 요청 단위로 자른다. */
export interface OutfitBatch {
  sceneId: string;
  /** writable(= 첫 텍스트 줄 ~ first effective CG 직전) 대사·지문 줄 — 쓰기 대상이자 scan 후보. */
  writable: OutfitScriptLine[];
  /** 장면의 **모든** 텍스트 줄(index → 줄). lead-in 은 여기서 고른다(삽입 순서 = 시간 순서). */
  textualByIndex: Map<number, OutfitScriptLine>;
  /** 후보 캐릭터 이름(그 장면 화자 ∧ 비주인공 ∧ 추가 의상 ≥1) — 등장 순서. */
  characters: string[];
  /** 캐릭터 → characterOutfits 원문. */
  outfitsByChar: Map<string, string[]>;
  /** 캐릭터 → outfitFlags 결과(줄별 effective outfit). **단일 소스, (장면,캐릭터)당 1회 계산.** */
  flagsByChar: Map<string, string[]>;
  /** 캐릭터 → outfitSource 라벨 계산에 쓸 "manual Line.outfits 가 있는 줄 인덱스" 오름차순. */
  manualLineIdxByChar: Map<string, number[]>;
  /** 후보 캐릭터에 대한 manual Line.outfits 전부(index → 항목들) — 요청의 fixed 와 파서 거부에 쓴다. */
  manualByIndex: Map<number, OutfitFixedEntry[]>;
  /** 캐릭터 → Scene.outfits 로 명시 지정된 baseline 인가(첫 줄 제안 금지 판정). */
  sceneManualChars: Set<string>;
  /** spriteHiddenFlags(scene) 결과 — hide 상태/전이 파생의 단일 소스. */
  hiddenFlags: boolean[];
  /** scene.hideSprites ?? false — 인덱스 0 의 "직전 상태". */
  sceneHiddenStart: boolean;
  /** first effective CG 인덱스(없으면 null) — writable 경계이자 마지막 window 의 경계 sentinel. */
  cgCutoff: number | null;
  /** 장면의 첫 텍스트 줄 인덱스(Scene-start 보호 판정용). */
  firstTextualIndex: number;
}

/** 요청 하나의 계획 — 실행(store)과 견적(estimate.ts)의 **단일 소스**. */
export interface OutfitWindowPlan {
  sceneId: string;
  /** 쓰기 대상. 모델이 결과로 낼 수 있는 i 는 이 집합뿐이다. */
  scan: OutfitScriptLine[];
  /** 읽기 전용 앞문맥(i < scan 시작). */
  leadIn: OutfitScriptLine[];
  characters: OutfitCharState[];
  /** **scan 범위 안의** manual 값만(lead-in·이전 window 것은 이미 currentOutfit 에 fold 돼 있다). */
  fixed: OutfitFixedEntry[];
  /** [leadIn 시작, scan 끝] 안의 실제 hide/show 전이 + (마지막 window 면) CG 경계 sentinel. */
  markers: OutfitMarker[];
  /** 첫 포함 줄 **직전**의 canonical hidden 상태(전이가 아니다). false 면 payload 에서 생략. */
  initialHidden: boolean;
  /** 파서가 Scene-start 보호를 판정할 때 쓰는 값들. */
  firstTextualIndex: number;
  sceneManualChars: Set<string>;
}

/**
 * Preview(ScenePlayer.activeCgIdx)·Export(generate.ts 의 cgActive)와 **동일한 4갈래**.
 *  ① scene.cg 가 없음 → CG 없음(전체 writable)
 *  ② scene.cg 는 있는데 kind:'cg' 줄이 하나도 없음 → 레거시 폴백으로 **장면 시작부터** CG active
 *     (생성기 게이트가 "유효 마커 없음"이 아니라 "cg 라인 전무"다) → writable 0줄
 *  ③ scene.cg 와 desc 가 매칭되는 첫 마커 → 그 지점부터 CG active
 *  ④ 마커는 있는데 전부 orphan(매칭 실패) → 폴백도 마커도 안 먹혀 CG 가 끝까지 안 켜진다 → 전체 writable
 * cgActive 는 한 번 켜지면 되돌지 않고 그 뒤 복원·의상 동기화·화자 show 를 전부 막으므로,
 * cutoff 이후의 transition 은 **dead write** 다(그래서 대상에서 뺀다).
 */
export function getFirstEffectiveCgIndex(scene: Scene): number | null {
  if (!scene.cg.length) return null;
  if (!scene.lines.some((l) => l.kind === 'cg')) return 0;
  const i = scene.lines.findIndex(
    (l) => l.kind === 'cg' && scene.cg.some((d) => d.trim() === l.desc),
  );
  return i >= 0 ? i : null;
}

/** 대사·지문 줄인가(hideSprites·outfits 를 가질 수 있는 두 kind). */
function isTextual(line: Line): line is Extract<Line, { kind: 'dialogue' | 'narration' }> {
  return line.kind === 'dialogue' || line.kind === 'narration';
}

/**
 * 이 장면에서 말하는 캐릭터 이름 — **SceneCard.outfitChars 와 같은 규칙**(합동 대사는 members 로 전개,
 * 합성 라벨은 넣지 않는다). Outfit AI 는 여기에 `!isProtagonist ∧ 추가 의상 ≥1` 을 추가로 건다.
 * apply.ts 의 "지금도 대상 자격인가" 재검증도 같은 함수를 쓴다(규칙이 두 곳에서 갈라지면 안 된다).
 */
export function sceneSpeakerNames(scene: Scene): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const l of scene.lines) {
    if (l.kind !== 'dialogue') continue;
    const list = l.members?.length ? l.members : [l.speaker];
    for (const nm of list) {
      if (seen.has(nm)) continue;
      seen.add(nm);
      names.push(nm);
    }
  }
  return names;
}

/**
 * currentOutfit **값**이 어떤 canonical 입력에서 왔는지 라벨만 파생한다.
 * ⚠️ 우선순위가 Line → Scene → rule → default 인 이유: outfitFlags 는 줄의 override 를 **그 줄
 * 인덱스에 이미 반영**하므로(대입 뒤 push), Scene.outfits 를 먼저 보면 `currentOutfit="사복"` 인데
 * `outfitSource="scene-manual"` 같은 모순이 난다. 비교 범위가 `i ≤ scanStart`(이하)인 것도 같은 이유다.
 * 이 함수는 **값을 계산하지 않는다** — 라벨만 만든다.
 */
function deriveOutfitSource(
  scene: Scene,
  rules: OutfitRule[] | undefined,
  charName: string,
  scanStart: number,
  manualLineIdx: number[],
): OutfitSource {
  for (let k = manualLineIdx.length - 1; k >= 0; k--) {
    if (manualLineIdx[k] <= scanStart) return 'line-manual';
  }
  if (scene.outfits?.[charName]) return 'scene-manual';
  const bg = scene.background ?? '';
  for (const r of rules ?? []) {
    const kw = r.keyword.trim();
    if (kw && r.charName === charName && bg.includes(kw)) return 'rule';
  }
  return 'default';
}

/**
 * 장면별 Outfit AI 대상을 모은다. 대상이 될 수 있는 **캐릭터**와 transition 의 **근거가 될 수 있는 줄**은
 * 다른 축이다: writable 줄은 주인공 대사·지문·합동 대사까지 전부 포함하고("민주는 사복으로 갈아입고
 * 나왔다" 같은 지문이 근거인 경우가 흔하다), 제한되는 건 응답의 character 필드뿐이다.
 */
export function collectOutfitTargets(project: Project): OutfitBatch[] {
  const charByName = new Map<string, Character>(project.characters.map((c) => [c.name, c]));
  const out: OutfitBatch[] = [];

  for (const scene of project.scenes) {
    const characters = sceneSpeakerNames(scene).filter((nm) => {
      const c = charByName.get(nm);
      return !!c && !c.isProtagonist && (c.outfits?.length ?? 0) > 0;
    });
    if (!characters.length) continue; // 의상을 안 쓰는 프로젝트는 여기서 배치가 비어 요청 0회

    const cgCutoff = getFirstEffectiveCgIndex(scene);
    const textualByIndex = new Map<number, OutfitScriptLine>();
    const writable: OutfitScriptLine[] = [];
    let firstTextualIndex = -1;

    scene.lines.forEach((line, i) => {
      if (!isTextual(line)) return;
      if (firstTextualIndex < 0) firstTextualIndex = i;
      const entry: OutfitScriptLine = {
        i,
        speaker: line.kind === 'dialogue' ? line.speaker : undefined,
        members: line.kind === 'dialogue' && line.members?.length ? line.members : undefined,
        text: line.text,
      };
      textualByIndex.set(i, entry);
      // writable = 첫 텍스트 줄 ~ first effective CG 직전. cutoff 이후는 dead write 라 제외한다.
      if (cgCutoff === null || i < cgCutoff) writable.push(entry);
    });
    if (!writable.length) continue; // 레거시 폴백(cutoff 0) 장면 등 — 요청 0회

    const outfitsByChar = new Map<string, string[]>();
    const flagsByChar = new Map<string, string[]>();
    const manualLineIdxByChar = new Map<string, number[]>();
    const manualByIndex = new Map<number, OutfitFixedEntry[]>();
    const sceneManualChars = new Set<string>();

    for (const nm of characters) {
      outfitsByChar.set(nm, characterOutfits(charByName.get(nm)!));
      // 줄 시점 의상은 outfitFlags 단일 소스 — (장면,캐릭터)당 한 번만 계산해 재사용한다.
      flagsByChar.set(nm, outfitFlags(scene, project.outfitRules, nm));
      manualLineIdxByChar.set(nm, []);
      if (scene.outfits?.[nm]) sceneManualChars.add(nm);
    }

    scene.lines.forEach((line, i) => {
      if (!isTextual(line) || !line.outfits) return;
      for (const nm of characters) {
        const outfit = line.outfits[nm];
        if (!outfit) continue;
        manualLineIdxByChar.get(nm)!.push(i);
        const list = manualByIndex.get(i) ?? [];
        list.push({ i, character: nm, outfit });
        manualByIndex.set(i, list);
      }
    });

    out.push({
      sceneId: scene.id,
      writable,
      textualByIndex,
      characters,
      outfitsByChar,
      flagsByChar,
      manualLineIdxByChar,
      manualByIndex,
      sceneManualChars,
      hiddenFlags: spriteHiddenFlags(scene),
      sceneHiddenStart: scene.hideSprites ?? false,
      cgCutoff,
      firstTextualIndex,
    });
  }

  return out;
}

/**
 * 배치 하나를 요청 단위 계획으로 편다 — **실행과 견적의 단일 소스**(요청 수가 다를 수 없다).
 * 각 window 는 disjoint scan + 읽기 전용 lead-in 이고, 모든 metadata 는 그 causal window 로 잘린다.
 */
export function planOutfitWindows(
  batch: OutfitBatch,
  scene: Scene,
  rules?: OutfitRule[],
): OutfitWindowPlan[] {
  const chunks = chunkItems(batch.writable, (l) => l.text.length, SCAN_MAX_LINES, SCAN_MAX_CHARS);
  const stateBefore = (i: number) => (i === 0 ? batch.sceneHiddenStart : batch.hiddenFlags[i - 1]);

  return chunks.map((scan, chunkIdx) => {
    const scanStart = scan[0].i;
    const scanEnd = scan[scan.length - 1].i;

    // lead-in — scan 직전의 텍스트 줄들을 최근 쪽부터 담고 상한을 넘으면 오래된 쪽을 버린다.
    const before: OutfitScriptLine[] = [];
    for (const [i, line] of batch.textualByIndex) {
      if (i >= scanStart) break; // 삽입 순서 = 인덱스 오름차순
      before.push(line);
    }
    let leadIn = before.slice(Math.max(0, before.length - LEAD_IN_MAX_LINES));
    let leadInChars = leadIn.reduce((sum, l) => sum + l.text.length, 0);
    let from = 0;
    while (from < leadIn.length && leadInChars > LEAD_IN_MAX_CHARS) {
      leadInChars -= leadIn[from].text.length;
      from += 1;
    }
    if (from) leadIn = leadIn.slice(from);

    // hide — 상태(initialHidden)와 전이(markers)를 분리한다. 둘 다 기존 spriteHiddenFlags 만 읽는다.
    // ⚠️ "request 시작 상태"를 marker 로 만들면 안 된다: 이미 hidden 인 구간에서 시작한 window 에
    // 없던 hidden event 가 생기고, 첫 줄의 실제 hidden→shown 전이는 반대로 사라진다.
    const included = [...leadIn, ...scan];
    const initialHidden = stateBefore(included[0].i);
    const markers: OutfitMarker[] = [];
    for (const line of included) {
      const after = batch.hiddenFlags[line.i];
      if (after !== stateBefore(line.i)) markers.push({ i: line.i, event: after ? 'hidden' : 'shown' });
    }
    // CG 경계 sentinel — writable 이 cutoff 직전에서 끝나므로 인접 window 는 항상 **마지막 window** 다.
    // look-ahead 가 아니라 "이 구간이 여기서 끝난다"는 경계 metadata 라 앞쪽 window 엔 싣지 않는다.
    if (batch.cgCutoff !== null && chunkIdx === chunks.length - 1) {
      markers.push({ i: batch.cgCutoff, event: 'cg' });
    }

    // fixed — **scan 범위 안**의 manual 값만. lead-in·이전 window 의 manual 은 이미 currentOutfit 에
    // fold 돼 있고, scan 뒤(미래)의 manual 을 미리 보여주는 건 look-ahead 라 금지다.
    const fixed: OutfitFixedEntry[] = [];
    for (const [i, entries] of batch.manualByIndex) {
      if (i < scanStart || i > scanEnd) continue;
      fixed.push(...entries);
    }
    fixed.sort((a, b) => a.i - b.i);

    const characters: OutfitCharState[] = batch.characters.map((nm) => ({
      character: nm,
      outfits: batch.outfitsByChar.get(nm)!,
      currentOutfit: batch.flagsByChar.get(nm)![scanStart],
      outfitSource: deriveOutfitSource(scene, rules, nm, scanStart, batch.manualLineIdxByChar.get(nm)!),
    }));

    return {
      sceneId: batch.sceneId,
      scan,
      leadIn,
      characters,
      fixed,
      markers,
      initialHidden,
      firstTextualIndex: batch.firstTextualIndex,
      sceneManualChars: batch.sceneManualChars,
    };
  });
}

/** 유니코드 정규화 + 공백 정리 — 응답 라벨을 후보와 비교하기 전 세척(표정 AI 와 같은 관용구). */
export function normalizeOutfitLabel(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

const BASE_SYSTEM_PROMPT =
  'You are a visual-novel script editor detecting OUTFIT CHANGES. ' +
  'The script is already playable; your only job is to find the few places where the text itself ' +
  'states that a character has changed clothes (went to change and came back, a narration saying they ' +
  'now wear something else, etc.). This is a SPARSE task: most requests should return few or NO changes. ' +
  'Report a change ONLY at the line from which the new outfit applies, and ONLY for characters listed ' +
  'in "characters". Copy an outfit string EXACTLY from that character\'s "outfits" array — never invent, ' +
  'translate or reformat a name. ' +
  // ⚠️ currentOutfit 은 **window 시작 시점(lines 의 첫 i)의 canonical 상태**일 뿐, 그 의상을 이 요청
  // 내내 쓰지 말라는 금지 목록이 아니다. 같은 window 안에 fixed transition 이 있으면 그 뒤의 effective
  // outfit 은 달라지므로, 나중에 window 시작 의상으로 **되돌아가는 것도 정상 transition** 이다.
  // (예전 문장 "Never report a change that merely repeats currentOutfit" 은 이 정상 케이스를 통째로
  // 억제했다 — 파서는 그 줄 시점 fold 로 판정하므로 code 는 원래 받아들일 수 있었다.)
  '"currentOutfit" is the canonical outfit in effect at the FIRST index in "lines"; it is the ' +
  'window-start state, not a ban on using that outfit later in the window. ' +
  'Skip a change only when the proposed outfit would leave the effective outfit unchanged at that ' +
  'point in the chronology. ' +
  'Do NOT infer outfits from the background, and do NOT suggest hide/show, scene ' +
  'splits, poses or facial expressions. "reason" must be Korean, at most 40 characters. ' +
  'Output STRICT JSON only, no markdown, no commentary: ' +
  '{"changes":[{"i":0,"character":"...","outfit":"...","reason":"..."}]}. ' +
  'If nothing in the text states an outfit change, return {"changes":[]}. ' +
  'The "i" MUST be an index that appears in "lines".';

/** 읽기 전용 앞문맥이 실릴 때만(결과 인덱스 오염 방지). */
const CONTEXT_RULE =
  ' "context" holds earlier script lines for reference only; they share the same "i" numbering as ' +
  '"lines", so read both in "i" order. NEVER output a result for a "context" index.';

/**
 * 이 요청 범위에 사람이 지정한 값이 있을 때만. ⚠️ fixed 는 "그 자리에서 확정된 상태"이고 **그 뒤로도
 * 다음 transition 까지 유효**하다는 점을 알려야, 그 뒤에 window 시작 의상으로 돌아가는 정상 전환을
 * 모델이 no-op 으로 오해하지 않는다. 반대로 fixed 가 scan 첫 줄에 있으면 그 값은 이미 currentOutfit
 * 에 반영돼 있으므로 별도의 두 번째 transition 으로 읽게 만들면 안 된다.
 */
const FIXED_RULE =
  ' "fixed" lists outfit changes the author already wrote down. Each entry is the authoritative, settled ' +
  'outfit state at that "i", and it stays in effect from that point onward until another transition. ' +
  'Never repeat or contradict a (i, character) pair listed there. ' +
  'If a "fixed" entry sits on the first supplied line, it is already reflected in "currentOutfit" — do not ' +
  'treat it as a separate additional change. ' +
  'Because of an intervening "fixed" transition, a later return to the window-start "currentOutfit" can ' +
  'itself be a real outfit change worth reporting.';

/** 마커가 실제로 있을 때만. */
const MARKER_RULE =
  ' "markers" are read-only stage events at those indices: "hidden" = character sprites stop being shown, ' +
  '"shown" = they are shown again, "cg" = the scene switches to a CG illustration and this request ends there. ' +
  'A character may change clothes while hidden; that is a normal change to report.';

/** 첫 포함 줄 이전부터 이미 숨겨져 있을 때만. */
const INITIAL_HIDDEN_RULE =
  ' "initialHidden": true means the characters are already hidden before the first supplied line.';

/** 장면 시작 의상을 사람이 직접 지정한 캐릭터가 있을 때만(baseline 정정과 실제 전환을 못 가른다). */
const SCENE_MANUAL_RULE =
  ' For characters whose "outfitSource" is "scene-manual", the author fixed the outfit at the start of ' +
  'this scene: do NOT report a change for them on the very first line of the scene.';

export interface OutfitPromptCtx {
  sceneTitle: string;
  background?: string;
  direction: string[];
  /** buildSynopsis(theme/index.ts) — 이야기 전체 맥락(요청당 ≤700자). */
  synopsis: string;
}

/** 모델이 낸 변경 하나(파싱·검증 통과분). */
export interface OutfitChange {
  i: number;
  character: string;
  outfit: string;
  reason?: string;
}

/**
 * 요청 하나(system + user)를 만든다. 조건부 문장·키는 전부 **이 요청에 실제로 실리는 것**만 보고
 * 켠다 — 기능을 안 쓰는 프로젝트의 요청 바이트가 커지지 않게(표정 AI 의 disambiguate/hasNotes 관용구).
 */
export function buildOutfitRequest(
  plan: OutfitWindowPlan,
  ctx: OutfitPromptCtx,
): { system: string; user: string } {
  const hasContext = plan.leadIn.length > 0;
  const hasFixed = plan.fixed.length > 0;
  const hasMarkers = plan.markers.length > 0;
  const hasSceneManual = plan.characters.some((c) => c.outfitSource === 'scene-manual');

  let system = BASE_SYSTEM_PROMPT;
  if (hasContext) system += CONTEXT_RULE;
  if (hasFixed) system += FIXED_RULE;
  if (hasMarkers) system += MARKER_RULE;
  if (plan.initialHidden) system += INITIAL_HIDDEN_RULE;
  if (hasSceneManual) system += SCENE_MANUAL_RULE;

  const scene: Record<string, unknown> = { title: ctx.sceneTitle };
  if (ctx.background) scene.background = ctx.background;
  if (ctx.direction.length) scene.direction = ctx.direction;

  const user = JSON.stringify({
    scene,
    synopsis: ctx.synopsis || undefined,
    characters: plan.characters,
    initialHidden: plan.initialHidden ? true : undefined,
    context: hasContext ? plan.leadIn : undefined,
    lines: plan.scan,
    fixed: hasFixed ? plan.fixed : undefined,
    markers: hasMarkers ? plan.markers : undefined,
  });

  return { system, user };
}

/**
 * 응답 문자열 → 검증 통과한 변경 목록. 표정 AI 와 같은 방어적 파싱(코드펜스 제거 → 중괄호 슬라이스 →
 * JSON.parse)이되, **추측 보정을 절대 하지 않는다.** 항목별 거부 사유:
 *  · scan 밖 인덱스(lead-in·미래·유령) · 후보 캐릭터 밖 · 후보 의상 밖(정규화 후 exact match 실패)
 *  · 그 (i,character)를 사람이 이미 지정함(fixed) · 장면 첫 텍스트 줄인데 baseline 이 scene-manual
 *  · 그 줄의 현재 effective outfit 과 같은 no-op · 같은 (i,character) 중복
 * 저장은 항상 **후보 원문**(characterOutfits 표기)이라 canonical identity 가 유지된다.
 */
export function parseOutfitResponse(
  raw: string,
  plan: OutfitWindowPlan,
  batch: OutfitBatch,
): OutfitChange[] {
  const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('의상 추천 응답에서 JSON 객체를 찾지 못했습니다.');

  let parsed: { changes?: unknown };
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as { changes?: unknown };
  } catch {
    throw new Error('의상 추천 응답을 JSON 으로 해석하지 못했습니다.');
  }
  const arr = Array.isArray(parsed.changes) ? parsed.changes : [];

  const scanIdx = new Set(plan.scan.map((l) => l.i)); // ← 쓰기 경계: lead-in 인덱스는 여기 없다
  const seen = new Set<string>();
  const out: OutfitChange[] = [];

  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const i = typeof r.i === 'number' ? r.i : Number(r.i);
    if (!Number.isFinite(i) || !scanIdx.has(i)) continue;

    const charRaw = typeof r.character === 'string' ? normalizeOutfitLabel(r.character) : '';
    const character = batch.characters.find((nm) => normalizeOutfitLabel(nm) === charRaw);
    if (!character) continue; // 후보 캐릭터 밖(주인공·미등록·합동 합성 라벨 포함)

    const dupKey = `${i} ${character}`;
    if (seen.has(dupKey)) continue;

    const outfitRaw = typeof r.outfit === 'string' ? normalizeOutfitLabel(r.outfit) : '';
    if (!outfitRaw) continue;
    const outfit = batch.outfitsByChar
      .get(character)!
      .find((o) => normalizeOutfitLabel(o) === outfitRaw);
    if (!outfit) continue; // 후보 밖 — fuzzy 보정도 새 이름 채택도 하지 않는다

    // 사람이 이미 그 자리에 지정해 둔 값은 AI 가 덮지 않는다.
    if (batch.manualByIndex.get(i)?.some((f) => f.character === character)) continue;
    // Scene-start 보호 — baseline 정정과 실제 state change 를 deterministic 하게 못 가른다(v1 은 recall 희생).
    if (i === plan.firstTextualIndex && plan.sceneManualChars.has(character)) continue;
    // 그 줄의 현재 effective outfit 과 같으면 아무 일도 안 하는 제안이다.
    if (batch.flagsByChar.get(character)![i] === outfit) continue;

    seen.add(dupKey);
    const reasonRaw = typeof r.reason === 'string' ? r.reason.trim() : '';
    out.push({
      i,
      character,
      outfit,
      // 프롬프트가 요구하는 40자와 같은 상한으로 자른다(검수 표시 전용 — project 에 저장되지 않는다).
      reason: reasonRaw ? reasonRaw.slice(0, MAX_REASON_CHARS) : undefined,
    });
  }

  return out;
}

async function chat(system: string, user: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OUTFIT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(aiConfig.chat.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: aiConfig.chat.themeModel,
        temperature: 0, // 재현성 — 같은 대본을 다시 돌려도 같은 자리를 짚어야 검수가 예측 가능하다
        response_format: { type: 'json_object' },
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error('의상 추천 요청 시간 초과(레이트 리밋/네트워크 의심)');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `의상 추천 실패 (HTTP ${res.status})`;
    if (res.status === 429) msg += ': 레이트 리밋';
    try {
      const j = await res.json();
      if (j?.error?.message) msg += `: ${j.error.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const j = await res.json();
  return j?.choices?.[0]?.message?.content ?? '';
}

/** 레이트리밋/타임아웃/5xx 에 한해 2s→4s→8s 백오프로 최대 3회 재시도(translate 판정 재사용). */
function chatWithRetry(system: string, user: string, apiKey: string): Promise<string> {
  return retryWithBackoff(() => chat(system, user, apiKey), isTransientTranslateError);
}

/** window 하나를 실제로 요청한다. 실패는 예외 → 호출측(store)이 그 window 만 건너뛴다. */
export async function suggestOutfitsBatch(
  plan: OutfitWindowPlan,
  batch: OutfitBatch,
  ctx: OutfitPromptCtx,
  apiKey: string,
): Promise<OutfitChange[]> {
  if (!plan.scan.length) return [];
  const { system, user } = buildOutfitRequest(plan, ctx);
  const raw = await chatWithRetry(system, user, apiKey);
  return parseOutfitResponse(raw, plan, batch);
}
