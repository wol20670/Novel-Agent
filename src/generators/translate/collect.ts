// 프로젝트에서 "번역이 비어 있는 대사·지문 줄"을 장면별로 모은다(자동 번역 대상 선정).
// 대상 = dialogue·narration 줄 중, targets 로케일 하나라도 i18n 이 비어 있는 것.
// #태그·연출은 scene.lines 가 아니므로 자연 제외된다.

import type { Project, Locale, Line } from '../../types';
import type { TranslateItem } from './index';

/** 한 줄에서 아직 번역이 없는 타깃 로케일 목록. */
function missingTargets(line: Line, targets: Locale[]): Locale[] {
  return targets.filter((loc) => !(line.i18n?.[loc] && line.i18n[loc]!.trim()));
}

export function collectUntranslated(
  project: Project,
  targets: Locale[],
): { sceneId: string; items: TranslateItem[] }[] {
  const out: { sceneId: string; items: TranslateItem[] }[] = [];
  for (const sc of project.scenes) {
    const items: TranslateItem[] = [];
    sc.lines.forEach((line, i) => {
      if (line.kind !== 'dialogue' && line.kind !== 'narration') return;
      if (!line.text.trim()) return;
      if (missingTargets(line, targets).length === 0) return; // 이미 다 채워짐
      items.push({
        i,
        ko: line.text,
        speaker: line.kind === 'dialogue' ? line.speaker : undefined,
        narration: line.kind === 'narration',
      });
    });
    if (items.length) out.push({ sceneId: sc.id, items });
  }
  return out;
}
