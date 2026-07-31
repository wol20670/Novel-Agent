// 대본 재분석(엑셀/텍스트) 시 기존 장면의 에셋·번역·승인을 보존하며 병합하는 순수 함수 모음.
// store.ts 의 analyzeText/analyzeExcel 이 이 모듈로 병합 로직을 위임한다(부수효과 없음 — 단위테스트 대상).

import type { Scene, Line, I18nText } from '../types';
import { backgroundKey, bgmKey } from '../renpy/generate';

/** 재분석 결과 적용 방식 — merge(스마트 병합)/append(뒤에 추가)/replace(전체 교체). */
export type AnalyzeMode = 'merge' | 'append' | 'replace';

export interface MergePreview {
  /** 기존 장면 중 새 결과와 매칭되어 유지되는 개수(에셋·번역·승인 승계 대상). */
  kept: number;
  /** 새로 추가되는 장면 개수(기존과 매칭되지 않은 next). */
  added: number;
  /** 새 결과에 없어 삭제되는 기존 장면 개수(merge 모드에서만 실제로 삭제됨). */
  removed: number;
  /** 텍스트가 그대로(정확 일치 또는 공백·문장부호만 다른 느슨한 일치)라 메타가 승계되는 줄 수. */
  linesCarried: number;
  /** 텍스트가 실제로 바뀌었거나 새로 생긴 줄 수(신규 장면의 줄 포함) — 메타 승계 없이 새것 그대로. */
  linesChanged: number;
  /**
   * 표기만 고쳐진 줄 수(띄어쓰기·문장부호만 달라 메타는 승계되지만 본문 글자는 새것으로 바뀜).
   * linesCarried 에도 포함되지만, 이게 0이 아니면 "변경 없음"이라고 말하면 안 되므로 따로 센다.
   */
  linesRespelled: number;
  /** 사라지는 줄 수(매칭된 장면에서 없어진 줄 + 삭제되는 장면 전체의 줄). */
  linesRemoved: number;
  /** 배경·BGM·CG 중 하나라도 바뀐, 매칭된(살아남는) 장면 수. */
  scenesAttrChanged: number;
  /** 공백·문장부호만 달라 성우 음성이 그대로 승계되는 줄 수(발음 동일 판정). */
  voiceCarriedLoose: number;
  /** 폐기되는 성우 음성 개수(줄 × 로케일 합산) — 다시 생성해야 하는 크레딧 소모분. */
  voiceLoss: number;
  /** 사라지는 번역 칸 수(줄 × 로케일 합산, next 가 같은 로케일을 다시 채워준 경우는 제외). */
  i18nLoss: number;
  /** 승인(approved)·수정필요 상태였다가 내용 변경으로 검토중(review)으로 되돌아가는 장면 수. */
  statusReset: number;
  /** 배경/BGM 이름이 바뀌어 업로드 에셋 연결이 끊기는(재연결 실패) 매칭된 장면 수. */
  assetUnlink: number;
}

/**
 * 라인의 "내용 동일성" 키 — kind/화자/본문(또는 아이템 이름·CG 설명)이 전부 같아야 같은 라인으로 본다.
 * item/cg 라인은 이 필드들만으로 완전한 동일성 판정이 된다(추가 메타 없음).
 */
function lineKey(line: Line): string {
  if (line.kind === 'dialogue') return `dialogue|${line.speaker}|${line.text}`;
  if (line.kind === 'narration') return `narration||${line.text}`;
  if (line.kind === 'item') return `item|${line.name}|`;
  return `cg||${line.desc}`;
}

/** 두 라인 배열이 순서까지 완전히 동일한 내용인지(상태 승계 판정용). */
function linesIdentical(a: Line[], b: Line[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((l, i) => lineKey(l) === lineKey(b[i]));
}

/**
 * i18n 로케일 단위 병합 — prev 를 베이스로 next(방금 파싱된 엑셀 C/D열)의 로케일 값이 덮는다.
 * 파서(normalizeI18n)가 빈 값을 이미 제거했으므로 next 에 있는 로케일 = 사용자가 실제 적은 번역.
 */
function mergeI18n(prev?: I18nText, next?: I18nText): I18nText | undefined {
  if (!prev && !next) return undefined;
  return { ...prev, ...next };
}

/**
 * 매칭된(텍스트 동일) 라인의 메타 병합 — "엑셀이 정본" 원칙에 따라 엑셀이 실어올 수 있는 값
 * (명시 표정 태그·C/D열 번역)은 next 우선, 엑셀에 실을 수 없는 값(음성)은 prev 승계.
 */
function carryLineMeta(next: Line, prev: Line): Line {
  if (next.kind === 'dialogue' && prev.kind === 'dialogue') {
    return {
      ...next,
      emotion: next.emotion ?? prev.emotion, // 엑셀 명시 태그 우선, 없으면 앱에서 수동 지정한 값 유지
      i18n: mergeI18n(prev.i18n, next.i18n),
      voiced: prev.voiced,
      voiceAssetIds: prev.voiceAssetIds,
    };
  }
  if (next.kind === 'narration' && prev.kind === 'narration') {
    return { ...next, i18n: mergeI18n(prev.i18n, next.i18n), voiced: prev.voiced };
  }
  return next;
}

/**
 * 발음이 같은 줄로 볼 수 있는 느슨한 키 — kind·화자는 그대로 두고 본문에서 공백·문장부호만 제거한다.
 * item/cg 는 이름·설명이 곧 판정 기준이라 느슨화할 게 없어 lineKey 를 그대로 재사용한다.
 * 정규식은 보수적으로(한글·영문·숫자는 항상 보존) 흔한 문장부호·공백류만 걸러낸다.
 */
function loosePronKey(line: Line): string {
  if (line.kind === 'item' || line.kind === 'cg') return lineKey(line);
  const strip = (s: string) =>
    s.replace(/[\s.,!?…‥~·:;"'“”‘’「」『』()[\]{}<>《》〈〉ㆍ―—\-–．，！？：；（）]/g, '');
  if (line.kind === 'dialogue') return `dialogue|${line.speaker}|${strip(line.text)}`;
  return `narration||${strip(line.text)}`;
}

interface LinePair {
  next: Line;
  prev?: Line;
  /** true 면 정확 일치가 아니라 느슨(발음 동일) 매칭으로 짝지어졌다. */
  loose: boolean;
}

/**
 * prev·next 라인을 2단계로 짝짓는다 — carryLines(실제 병합)와 diffMatchedScene(미리보기)가
 * 이 함수 하나를 공유해야 미리보기 수치와 실제 병합 결과가 어긋나지 않는다.
 * 1단계: lineKey 정확 일치 FIFO(기존 동작과 동일). 2단계: 1단계에서 못 짝지은 next 를,
 * 아직 안 쓰인 prev 중 loosePronKey(공백·문장부호 제거) 가 같은 것과 FIFO로 짝짓는다.
 * 반환 pairs 는 next 순서·길이 그대로, unmatchedPrev 는 끝까지 안 쓰인 prev 라인들.
 */
function pairLines(prevLines: Line[], nextLines: Line[]): { pairs: LinePair[]; unmatchedPrev: Line[] } {
  const consumed = new Array<boolean>(prevLines.length).fill(false);
  const pairs: LinePair[] = new Array(nextLines.length);

  // 1단계: 정확 일치(lineKey) FIFO.
  const exactQueues = new Map<string, number[]>();
  prevLines.forEach((l, i) => {
    const k = lineKey(l);
    const q = exactQueues.get(k);
    if (q) q.push(i);
    else exactQueues.set(k, [i]);
  });
  nextLines.forEach((l, i) => {
    const q = exactQueues.get(lineKey(l));
    const idx = q && q.length ? q.shift() : undefined;
    if (idx !== undefined) {
      consumed[idx] = true;
      pairs[i] = { next: l, prev: prevLines[idx], loose: false };
    }
  });

  // 2단계: 남은 prev 만 대상으로 느슨(발음 동일) 일치 FIFO.
  const looseQueues = new Map<string, number[]>();
  prevLines.forEach((l, i) => {
    if (consumed[i]) return;
    const k = loosePronKey(l);
    const q = looseQueues.get(k);
    if (q) q.push(i);
    else looseQueues.set(k, [i]);
  });
  nextLines.forEach((l, i) => {
    if (pairs[i]) return;
    const q = looseQueues.get(loosePronKey(l));
    const idx = q && q.length ? q.shift() : undefined;
    if (idx !== undefined) {
      consumed[idx] = true;
      pairs[i] = { next: l, prev: prevLines[idx], loose: true };
    }
  });

  nextLines.forEach((l, i) => {
    if (!pairs[i]) pairs[i] = { next: l, loose: false };
  });

  const unmatchedPrev = prevLines.filter((_, i) => !consumed[i]);
  return { pairs, unmatchedPrev };
}

/**
 * pairLines 로 prev 라인을 next 라인에 짝지어 메타를 승계한다. 느슨 매칭이면 철자는 next(새 표기)가
 * 이기고 음성·번역 등 메타만 승계된다(carryLineMeta 규칙 재사용). 순서/길이는 nextLines 그대로.
 */
function carryLines(prevLines: Line[], nextLines: Line[]): Line[] {
  const { pairs } = pairLines(prevLines, nextLines);
  return pairs.map((p) => (p.prev ? carryLineMeta(p.next, p.prev) : p.next));
}

/** 장면 하나의 "내용"이 완전히 같은지(배경명·BGM명·CG 설명·라인 시퀀스) — status 승계 판정 기준. */
function sceneContentEqual(prev: Scene, next: Scene): boolean {
  if ((prev.background ?? '') !== (next.background ?? '')) return false;
  if ((prev.bgm ?? '') !== (next.bgm ?? '')) return false;
  if (prev.cg.length !== next.cg.length) return false;
  if (!prev.cg.every((d, i) => d.trim() === next.cg[i].trim())) return false;
  return linesIdentical(prev.lines, next.lines);
}

interface SceneMatch {
  next: Scene;
  prevMatch?: Scene;
}

/** dialogue 라인의 성우 음성 로케일 수(음성이 없는 kind·라인은 0). */
function voiceCount(line: Line): number {
  return line.kind === 'dialogue' ? Object.keys(line.voiceAssetIds ?? {}).length : 0;
}

/** dialogue/narration 라인의 번역(i18n) 로케일 수(그 외 kind 는 0). */
function i18nCount(line: Line): number {
  return line.kind === 'dialogue' || line.kind === 'narration' ? Object.keys(line.i18n ?? {}).length : 0;
}

export interface SceneDiff {
  /** 텍스트가 그대로(정확·느슨 매칭 포함)라 메타가 승계되는 줄 수. */
  linesCarried: number;
  /** 텍스트가 바뀌었거나 새로 생긴 줄 수. */
  linesChanged: number;
  /** 표기만 고쳐진(느슨 매칭된) 줄 수 — 메타는 승계되지만 본문 글자는 새것으로 바뀐다. */
  linesRespelled: number;
  /** 이 장면에서 사라지는(next 에 대응 없는) prev 줄 수. */
  linesRemoved: number;
  /** 느슨(발음 동일) 매칭으로 음성이 그대로 승계되는 줄 수. */
  voiceCarriedLoose: number;
  /** 사라지는 줄들이 갖고 있던 성우 음성 개수(줄 × 로케일). */
  voiceLoss: number;
  /** 사라지는 줄들이 갖고 있던 번역 칸 수(줄 × 로케일). */
  i18nLoss: number;
  /** 배경·BGM·CG 중 하나라도 바뀌었는지. */
  attrChanged: boolean;
}

/**
 * 매칭된 (prev,next) 장면 쌍의 변경 내역 — carryLines 와 동일한(pairLines 공유) 키·FIFO 의미로
 * 계산해 미리보기와 실제 병합이 어긋나지 않게 한다.
 */
export function diffMatchedScene(prev: Scene, next: Scene): SceneDiff {
  const { pairs, unmatchedPrev } = pairLines(prev.lines, next.lines);

  let linesCarried = 0;
  let linesChanged = 0;
  let linesRespelled = 0;
  let voiceCarriedLoose = 0;
  for (const p of pairs) {
    if (p.prev) {
      linesCarried += 1;
      // 느슨 매칭 = lineKey 가 달랐다는 뜻 = 본문 글자가 실제로 바뀌었다(발음만 같을 뿐).
      if (p.loose) linesRespelled += 1;
      if (p.loose && voiceCount(p.prev) > 0) voiceCarriedLoose += 1;
    } else {
      linesChanged += 1;
    }
  }

  const voiceLoss = unmatchedPrev.reduce((sum, l) => sum + voiceCount(l), 0);
  const i18nLoss = unmatchedPrev.reduce((sum, l) => sum + i18nCount(l), 0);

  const attrChanged =
    (prev.background ?? '') !== (next.background ?? '') ||
    (prev.bgm ?? '') !== (next.bgm ?? '') ||
    prev.cg.length !== next.cg.length ||
    !prev.cg.every((d, i) => d.trim() === next.cg[i].trim());

  return {
    linesCarried,
    linesChanged,
    linesRespelled,
    linesRemoved: unmatchedPrev.length,
    voiceCarriedLoose,
    voiceLoss,
    i18nLoss,
    attrChanged,
  };
}

/**
 * title 정확일치 + 등장순서(첫 미사용 매칭)로 next 장면들을 prev 장면에 대응시킨다.
 * 동명 장면이 여럿이면 prev 등록 순서대로 소비(FIFO) — 순서가 바뀌어도 이름 그룹 안에서는 안정적.
 * 반환: next 각각에 대한 매칭 결과 + 끝까지 매칭 안 된(= title 매칭 실패) prev 장면 목록.
 */
function matchScenesByTitle(prev: Scene[], next: Scene[]): { matches: SceneMatch[]; unmatchedPrev: Scene[] } {
  const queues = new Map<string, Scene[]>();
  for (const sc of prev) {
    const q = queues.get(sc.title);
    if (q) q.push(sc);
    else queues.set(sc.title, [sc]);
  }
  const matches: SceneMatch[] = next.map((sc) => {
    const q = queues.get(sc.title);
    const prevMatch = q && q.length ? q.shift() : undefined;
    return { next: sc, prevMatch };
  });
  const unmatchedPrev: Scene[] = [];
  for (const q of queues.values()) unmatchedPrev.push(...q);
  return { matches, unmatchedPrev };
}

/** 두 장면의 라인 내용 겹침 비율 — |lineKey 교집합| / max(prev 라인 수, next 라인 수). */
function contentOverlapRatio(a: Scene, b: Scene): number {
  const setA = new Set(a.lines.map(lineKey));
  const setB = new Set(b.lines.map(lineKey));
  let intersection = 0;
  for (const k of setA) if (setB.has(k)) intersection += 1;
  return intersection / Math.max(a.lines.length, b.lines.length);
}

/**
 * title 매칭 + 내용 기반 폴백 매칭을 함께 수행한다. mergeScenes('merge')·previewMerge 가 모두
 * 이 함수 하나를 공유해 미리보기 수치와 실제 병합 결과가 어긋나지 않게 한다.
 *
 * title 매칭에서 빠진 next 장면은, title 매칭에서도 빠진 prev 장면들과 라인 내용 겹침 비율을
 * 비교해 가장 높은 상대(≥ 0.5)와 1:1로 짝짓는다. 제목이 바뀐 장면(오타 수정·자동분할 접미사)도
 * 내용이 반쯤 같으면 같은 장면으로 보고 TTS·번역·승인 메타를 승계한다. 라인이 0개인 장면은
 * (본문이 없어 유사도 판정이 무의미하므로) 폴백 매칭 대상에서 제외한다.
 */
function matchScenes(prev: Scene[], next: Scene[]): { matches: SceneMatch[]; unmatchedPrev: Scene[] } {
  const { matches, unmatchedPrev } = matchScenesByTitle(prev, next);
  const pool = [...unmatchedPrev];
  for (const m of matches) {
    if (m.prevMatch || m.next.lines.length === 0) continue;
    let bestIdx = -1;
    let bestRatio = 0;
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].lines.length === 0) continue;
      const ratio = contentOverlapRatio(pool[i], m.next);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestRatio >= 0.5) {
      m.prevMatch = pool[bestIdx];
      pool.splice(bestIdx, 1);
    }
  }
  return { matches, unmatchedPrev: pool };
}

/**
 * 이름 기준 에셋 재연결(merge·append 공통) — prev 전체에서 배경/BGM/CG "이름(의미)" → assetId 맵을
 * 구축해 next 장면에 주입한다. 아이템이 이름 공유로 생존하는 것과 동일한 철학(에셋은 프로젝트가
 * 소유, 장면은 이름으로 그걸 가리킬 뿐). next 장면은 방금 파싱되어 assetId 가 없으므로 항상 주입.
 */
function reconnectAssets(scenes: Scene[], prev: Scene[]): Scene[] {
  const bgMap = new Map<string, string>();
  const bgmMap = new Map<string, string>();
  const cgMap = new Map<string, string>();
  for (const sc of prev) {
    if (sc.backgroundAssetId) bgMap.set(backgroundKey(sc), sc.backgroundAssetId);
    if (sc.bgmAssetId) bgmMap.set(bgmKey(sc), sc.bgmAssetId);
    sc.cg.forEach((desc, i) => {
      const id = sc.cgAssetIds?.[i];
      if (id) cgMap.set(desc.trim(), id);
    });
  }
  return scenes.map((sc) => {
    const patch: Partial<Scene> = {};
    const bgId = bgMap.get(backgroundKey(sc));
    if (bgId) patch.backgroundAssetId = bgId;
    const bgmId = bgmMap.get(bgmKey(sc));
    if (bgmId) patch.bgmAssetId = bgmId;
    if (sc.cg.length) {
      // applyCgToGroup(store.ts)과 동일한 관례 — 미매칭 슬롯은 빈 문자열('' = 미업로드, falsy).
      const cgIds = sc.cg.map((desc) => cgMap.get(desc.trim()) ?? '');
      if (cgIds.some(Boolean)) patch.cgAssetIds = cgIds;
    }
    return Object.keys(patch).length ? { ...sc, ...patch } : sc;
  });
}

/**
 * 병합 전 미리보기 — 모달에 표시. mergeScenes(mode:'merge')와 같은 매칭·라인 승계 규칙
 * (matchScenes/diffMatchedScene 공유)이라 여기 수치와 실제 병합 결과가 어긋나지 않는다.
 */
export function previewMerge(prev: Scene[], next: Scene[]): MergePreview {
  const { matches, unmatchedPrev } = matchScenes(prev, next);
  const kept = matches.filter((m) => m.prevMatch).length;

  // reconnectAssets 과 동일한 이름→assetId 맵 — 배경/BGM 연결이 끊기는지 판정하는 데만 쓴다.
  const bgMap = new Map<string, string>();
  const bgmMap = new Map<string, string>();
  for (const sc of prev) {
    if (sc.backgroundAssetId) bgMap.set(backgroundKey(sc), sc.backgroundAssetId);
    if (sc.bgmAssetId) bgmMap.set(bgmKey(sc), sc.bgmAssetId);
  }

  let linesCarried = 0;
  let linesChanged = 0;
  let linesRespelled = 0;
  let linesRemoved = 0;
  let scenesAttrChanged = 0;
  let voiceCarriedLoose = 0;
  let voiceLoss = 0;
  let i18nLoss = 0;
  let statusReset = 0;
  let assetUnlink = 0;

  for (const m of matches) {
    if (!m.prevMatch) {
      // 신규 장면 — 매칭 상대가 없으니 모든 라인이 "새로 생긴 줄"로 집계된다.
      linesChanged += m.next.lines.length;
      continue;
    }
    const prevSc = m.prevMatch;
    const diff = diffMatchedScene(prevSc, m.next);
    linesCarried += diff.linesCarried;
    linesChanged += diff.linesChanged;
    linesRespelled += diff.linesRespelled;
    linesRemoved += diff.linesRemoved;
    voiceCarriedLoose += diff.voiceCarriedLoose;
    voiceLoss += diff.voiceLoss;
    i18nLoss += diff.i18nLoss;
    if (diff.attrChanged) scenesAttrChanged += 1;

    if (!sceneContentEqual(prevSc, m.next) && prevSc.status !== 'review') statusReset += 1;

    const bgBroken = !!prevSc.backgroundAssetId && !bgMap.has(backgroundKey(m.next));
    const bgmBroken = !!prevSc.bgmAssetId && !bgmMap.has(bgmKey(m.next));
    if (bgBroken || bgmBroken) assetUnlink += 1;
  }

  // 매칭 안 된(사라지는) 기존 장면 — 라인·음성·번역 손실에 더한다.
  for (const sc of unmatchedPrev) {
    linesRemoved += sc.lines.length;
    for (const l of sc.lines) {
      voiceLoss += voiceCount(l);
      i18nLoss += i18nCount(l);
    }
  }

  return {
    kept,
    added: matches.length - kept,
    removed: unmatchedPrev.length,
    linesCarried,
    linesChanged,
    linesRespelled,
    linesRemoved,
    scenesAttrChanged,
    voiceCarriedLoose,
    voiceLoss,
    i18nLoss,
    statusReset,
    assetUnlink,
  };
}

/**
 * 재분석 결과(next)를 기존 장면(prev)에 적용한다.
 * - replace: next 그대로(현행 동작, 에셋 재연결 없음).
 * - append: prev 무수정 + next(에셋 재연결만 적용) 를 뒤에 붙인다.
 * - merge: 이름 매칭된 장면은 prev.id 유지 + 라인 메타 승계 + 내용 동일 시 status 승계,
 *          매칭 안 된 next=신규, prev에만 있던 장면=삭제(엑셀/텍스트가 정본).
 */
export function mergeScenes(prev: Scene[], next: Scene[], mode: AnalyzeMode): Scene[] {
  if (mode === 'replace') return next;
  if (mode === 'append') return [...prev, ...reconnectAssets(next, prev)];

  // merge
  const reconnected = reconnectAssets(next, prev);
  const { matches } = matchScenes(prev, reconnected);
  return matches.map(({ next: ns, prevMatch }) => {
    if (!prevMatch) return ns; // 신규 장면 — 그대로
    const contentSame = sceneContentEqual(prevMatch, ns);
    return {
      ...ns,
      id: prevMatch.id, // 선택 상태·협업 프레즌스 안정
      lines: carryLines(prevMatch.lines, ns.lines),
      status: contentSame ? prevMatch.status : 'review',
      // 대본에 #복장이 있으면 그게 정본(next 우선), 없으면 앱에서 지정한 예외(장면 카드 수동 지정)를
      // 승계 — carryLineMeta 의 "엑셀이 정본" 원칙과 동일.
      outfits: ns.outfits ?? prevMatch.outfits,
    };
  });
}
