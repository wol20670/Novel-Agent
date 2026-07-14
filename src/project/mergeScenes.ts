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
 * prev 라인을 키(FIFO 큐)로 소비하며 next 라인에 메타를 승계한다. 텍스트가 바뀐(키가 없는) 라인은
 * next 그대로 유지. 동명 라인이 여러 개면 등장 순서대로 소비(스마트 병합 장면 매칭과 동일 철학).
 */
function carryLines(prevLines: Line[], nextLines: Line[]): Line[] {
  const queues = new Map<string, Line[]>();
  for (const l of prevLines) {
    const k = lineKey(l);
    const q = queues.get(k);
    if (q) q.push(l);
    else queues.set(k, [l]);
  }
  return nextLines.map((l) => {
    const q = queues.get(lineKey(l));
    const prevLine = q && q.length ? q.shift() : undefined;
    return prevLine ? carryLineMeta(l, prevLine) : l;
  });
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

/**
 * title 정확일치 + 등장순서(첫 미사용 매칭)로 next 장면들을 prev 장면에 대응시킨다.
 * 동명 장면이 여럿이면 prev 등록 순서대로 소비(FIFO) — 순서가 바뀌어도 이름 그룹 안에서는 안정적.
 * 반환: next 각각에 대한 매칭 결과 + prev 중 끝까지 매칭 안 된(= 삭제 대상) 개수.
 */
function matchScenesByTitle(prev: Scene[], next: Scene[]): { matches: SceneMatch[]; unmatchedPrevCount: number } {
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
  let unmatchedPrevCount = 0;
  for (const q of queues.values()) unmatchedPrevCount += q.length;
  return { matches, unmatchedPrevCount };
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

/** 병합 전 미리보기(유지/추가/제거 개수) — 모달에 표시. mergeScenes(mode:'merge')와 같은 매칭 규칙. */
export function previewMerge(prev: Scene[], next: Scene[]): MergePreview {
  const { matches, unmatchedPrevCount } = matchScenesByTitle(prev, next);
  const kept = matches.filter((m) => m.prevMatch).length;
  return { kept, added: matches.length - kept, removed: unmatchedPrevCount };
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
  const { matches } = matchScenesByTitle(prev, reconnected);
  return matches.map(({ next: ns, prevMatch }) => {
    if (!prevMatch) return ns; // 신규 장면 — 그대로
    const contentSame = sceneContentEqual(prevMatch, ns);
    return {
      ...ns,
      id: prevMatch.id, // 선택 상태·협업 프레즌스 안정
      lines: carryLines(prevMatch.lines, ns.lines),
      status: contentSame ? prevMatch.status : 'review',
    };
  });
}
