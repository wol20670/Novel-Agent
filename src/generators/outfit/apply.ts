// Outfit AI 제안의 **수락 경로** — 전부 순수 함수다(store 없이 단위 테스트된다).
//
// 제안은 project 밖 런타임 state 라 저장·zip·협업에 안 실리고, 사용자가 수락한 값만 여기를 거쳐
// 기존 Line.outfits 에 **manual 값으로** 들어간다(그 뒤로는 사람이 적은 값과 지위가 같다 —
// provenance 소멸은 의도된 설계다). 그래서 이 모듈의 책임은 둘뿐이다:
//   ① 지금 이 순간의 canonical state 로 제안을 **재검증**한다(제안은 만들어진 뒤 얼마든지 낡는다)
//   ② Line.outfits 레코드를 **기존 관용구대로** 머지/정리한다(stripOutfitRefs 와 같은 규칙)
//
// ⚠️ 의상은 stateful carry 라 일괄 적용을 "각각 독립 적용"으로 짜면 틀린다 — 앞의 적용이 뒤 제안을
// no-op 으로 만들 수 있어서 foldSceneSuggestions 가 **갱신된 working scene 기준**으로 순차 재검증한다.

import {
  characterOutfits,
  outfitFlags,
  type Character,
  type Line,
  type Project,
  type Scene,
} from '../../types';
import { getFirstEffectiveCgIndex, sceneSpeakerNames } from './aiSelect';

/**
 * 검수 목록에 뜨는 제안 하나. **project 밖 런타임 state 전용** — 여기 있는 값은 저장되지 않는다
 * (수락하면 outfit 만 Line.outfits 로 넘어가고 reason·lineKey 는 버려진다).
 * 항목 identity 는 `(sceneId, lineIndex, character)` 이고 액션들도 이 3개를 인자로 받는다.
 */
export interface OutfitSuggestion {
  sceneId: string;
  lineIndex: number;
  character: string;
  /** characterOutfits 원문(canonical). */
  outfit: string;
  /** 검수 UI 표시 전용 — 저장하지 않는다. */
  reason?: string;
  /** 제안 생성 시점 줄 지문 — anchor stale 1차 방어(대본이 바뀌면 안 맞는다). */
  lineKey: string;
}

/**
 * 줄 지문. Line 에 stable id 가 없어(배열 인덱스로 참조) 인덱스만으로는 "그 사이 대본이 바뀐 것"을
 * 못 잡는다. ⚠️ 이건 **anchor 방어일 뿐 context 방어가 아니다** — 근거가 된 다른 줄이 바뀌어도 통과하므로
 * store 쪽 input-dependency invalidation 이 반드시 함께 필요하다.
 */
export function outfitLineKey(line: Line): string {
  if (line.kind === 'dialogue') return `dialogue|${line.speaker}|${line.text}`;
  if (line.kind === 'narration') return `narration||${line.text}`;
  return `${line.kind}||`;
}

/**
 * 'ok'   = 지금 적용 가능
 * 'noop' = 이미 그 의상이라 아무 일도 안 일어남(사용자에겐 다른 안내)
 * 'stale'= 대본·캐릭터·의상 상태가 바뀌어 적용 불가
 */
export type OutfitValidation = 'ok' | 'stale' | 'noop';

/**
 * 적용 직전 **현재 state 로** 재검증한다(개별 적용·일괄 적용 공통).
 *
 * 1~9 는 Phase 6 이 확정한 최소 검사, 10~11 은 최종 방어선이다. 10·11 이 필요한 이유:
 * "장면 첫 줄 → 사복" 제안이 남아 있는 상태에서 사용자가 Scene.outfits 를 교복으로 지정하면
 * 8(줄 manual 없음)·9(교복≠사복이라 no-op 아님)를 **둘 다 통과**한다. 정상 배선이면 그 전에
 * invalidation 이 지웠겠지만, validator 는 배선 하나에 의존하지 않는 마지막 방어선이어야 한다.
 */
export function validateOutfitSuggestion(
  project: Project,
  scene: Scene | undefined,
  s: OutfitSuggestion,
): OutfitValidation {
  // 1. scene 존재
  if (!scene || scene.id !== s.sceneId) return 'stale';
  // 2. lineIndex 범위
  const line = scene.lines[s.lineIndex];
  if (!line) return 'stale';
  // 3. dialogue/narration 인가(의상 override 를 가질 수 있는 두 kind)
  if (line.kind !== 'dialogue' && line.kind !== 'narration') return 'stale';
  // 4. 줄 지문 일치(그 사이 대본이 바뀌지 않았는가)
  if (outfitLineKey(line) !== s.lineKey) return 'stale';
  // 5. 캐릭터 존재
  const char: Character | undefined = project.characters.find((c) => c.name === s.character);
  if (!char) return 'stale';
  // 6. 지금도 대상 자격인가 — 화자 판정은 sceneSpeakerNames 단일 소스(합동 대사는 members 전개)
  if (char.isProtagonist || !(char.outfits?.length ?? 0)) return 'stale';
  if (!sceneSpeakerNames(scene).includes(s.character)) return 'stale';
  // 7. canonical 후보 안의 의상인가(exact match — fuzzy 보정 없음)
  if (!characterOutfits(char).includes(s.outfit)) return 'stale';
  // 8. 그 사이 사람이 그 자리를 선점하지 않았는가
  if (line.outfits?.[s.character]) return 'stale';
  // 10. 지금도 writable 인가 — CG cutoff 는 대본·에셋 편집으로 앞뒤로 움직인다(renameCgGroup 등).
  //     cutoff 이후 줄은 생성기가 복원·의상 동기화를 통째로 막아 dead write 가 된다.
  const cutoff = getFirstEffectiveCgIndex(scene);
  if (cutoff !== null && s.lineIndex >= cutoff) return 'stale';
  // 11. 장면 첫 텍스트 줄인데 baseline 을 사람이 직접 지정했는가(Scene-start 보호)
  const firstTextual = scene.lines.findIndex(
    (l) => l.kind === 'dialogue' || l.kind === 'narration',
  );
  if (s.lineIndex === firstTextual && scene.outfits?.[s.character]) return 'stale';
  // 9. 현재 fold 기준 no-op 아닌가(마지막에 둔다 — 위 검사들이 전부 통과해야 의미가 있다)
  if (outfitFlags(scene, project.outfitRules, s.character)[s.lineIndex] === s.outfit) return 'noop';

  return 'ok';
}

/**
 * 한 줄의 의상 레코드를 머지/삭제한다(순수, Scene 하나만 새로 만든다).
 * 정리 규칙은 기존 `stripOutfitRefs`(store/helpers.ts)와 **같아야** 한다:
 *  · 같은 줄의 다른 캐릭터 키는 반드시 보존(같은 줄에서 둘이 갈아입는 건 정상 케이스)
 *  · 마지막 키를 지우면 `outfits: undefined` — 빈 `{}` 를 새로 남기지 않는다
 *  · dialogue/narration 이 아닌 줄엔 쓰지 않는다
 */
export function mergeLineOutfit(
  scene: Scene,
  lineIndex: number,
  character: string,
  outfit: string | undefined,
): Scene {
  const line = scene.lines[lineIndex];
  if (!line || (line.kind !== 'dialogue' && line.kind !== 'narration')) return scene;

  const next = { ...(line.outfits ?? {}) };
  if (outfit) next[character] = outfit;
  else delete next[character];
  const outfits = Object.keys(next).length ? next : undefined;

  const lines = scene.lines.map((l, i) => (i === lineIndex ? { ...l, outfits } : l));
  return { ...scene, lines };
}

export interface OutfitFoldResult {
  scene: Scene;
  applied: number;
  skipped: number;
  /** 실제 canonical 변경이 있었는가 — revision 증가·commit 여부의 단일 판정. */
  changed: boolean;
}

/**
 * 장면 단위 일괄 적용 — **working copy 순차 재검증**이 핵심이다.
 * lineIndex 오름차순(같은 줄이면 character 순)으로 적용하되, 매 항목을 **직전까지 적용된 working
 * scene** 으로 다시 검증한다: 의상은 carry 되므로 앞의 적용이 뒤 제안을 no-op 으로 만들 수 있고,
 * 원본 스냅샷 기준으로 독립 판정하면 그걸 놓친다. 결과는 호출측이 **한 번만** commit 한다.
 */
export function foldSceneSuggestions(
  project: Project,
  scene: Scene,
  suggestions: OutfitSuggestion[],
): OutfitFoldResult {
  const sorted = [...suggestions].sort(
    (a, b) => a.lineIndex - b.lineIndex || a.character.localeCompare(b.character),
  );
  let working = scene;
  let applied = 0;
  let skipped = 0;

  for (const s of sorted) {
    // 검증도 working scene 기준이어야 한다(project 는 scenes 만 치환해 넘긴다).
    const scoped: Project = {
      ...project,
      scenes: project.scenes.map((sc) => (sc.id === working.id ? working : sc)),
    };
    if (validateOutfitSuggestion(scoped, working, s) !== 'ok') {
      skipped += 1;
      continue;
    }
    working = mergeLineOutfit(working, s.lineIndex, s.character, s.outfit);
    applied += 1;
  }

  return { scene: working, applied, skipped, changed: applied > 0 };
}
