// 프로젝트에서 "번역이 비어 있는 대사·지문 줄"을 장면별로 모은다(자동 번역 대상 선정).
// 대상 = dialogue·narration 줄 중, targets 로케일 하나라도 i18n 이 비어 있는 것.
// #태그·연출은 scene.lines 가 아니므로 자연 제외된다.

import type { Project, Locale, I18nText } from '../../types';
import type { TranslateItem } from './index';

/** 번역(i18n)에서 아직 비어 있는 타깃 로케일 목록. */
function missingTargets(i18n: I18nText | undefined, targets: Locale[]): Locale[] {
  return targets.filter((loc) => !(i18n?.[loc] && i18n[loc]!.trim()));
}

/**
 * collectUntranslated 가 내보내는 항목 — missing 은 항상 존재하며 런타임상 1개 이상이다
 * (번역 누락이 없는 줄은 collectUntranslated 결과에서 제외된다).
 * TranslateItem.missing 이 optional 인 건 직접 호출(호출측이 targets 를 통째로 넘기는 경로) 때문이고,
 * 이 수집기를 거친 결과에는 늘 채워진다 — 그 기존 계약을 타입으로 드러내 호출측이 폴백 규칙을
 * 따로 만들지 않게 한다(번역 대상 판정의 정본은 이 파일 하나여야 한다).
 * ⚠️ non-empty tuple 로 좁히지는 않는다 — 비어 있지 않다는 건 아래 length 가드가 지키는 런타임 불변식이다.
 */
export type UntranslatedItem = TranslateItem & { missing: Locale[] };

export function collectUntranslated(
  // scenes 만 읽는다 — 화면(CenterPanel)이 project 통째 구독 대신 `{ scenes }` 만 넘길 수 있게
  // Pick 으로 좁힌다(baseLocaleOf 등과 같은 이유). Project 는 이 Pick 을 항상 만족한다.
  project: Pick<Project, 'scenes'>,
  targets: Locale[],
): { sceneId: string; items: UntranslatedItem[] }[] {
  const out: { sceneId: string; items: UntranslatedItem[] }[] = [];
  for (const sc of project.scenes) {
    const items: UntranslatedItem[] = [];
    sc.lines.forEach((line, i) => {
      if (line.kind !== 'dialogue' && line.kind !== 'narration') return;
      if (!line.text.trim()) return;
      const missing = missingTargets(line.i18n, targets);
      if (missing.length === 0) return; // 이미 다 채워짐
      items.push({
        i,
        ko: line.text,
        speaker: line.kind === 'dialogue' ? line.speaker : undefined,
        narration: line.kind === 'narration',
        // 이 줄에 "실제로 없는" 언어만 기록 — 호출측이 이것만 요청해서 이미 있는 번역(엑셀 C/D열이나
        // 앱에서 손본 검수본)을 새 번역으로 덮어쓰지 않도록 한다(불필요한 토큰 소모도 방지).
        missing,
      });
    });
    if (items.length) out.push({ sceneId: sc.id, items });
  }
  return out;
}

/** 번역 누락 요약(화면 표시용). lines = 하나 이상 비어 있는 줄 수(EN·JA 둘 다 비어도 1줄). */
export interface UntranslatedSummary {
  byLocale: Partial<Record<Locale, number>>;
  lines: number;
}

/**
 * 실행 전에 "얼마나 비었는지"를 보여주기 위한 집계 — **판정은 하지 않는다.**
 * collectUntranslated 결과를 그대로 세기만 하므로 화면 숫자와 실제 요청 대상이 어긋날 수 없다.
 * ⚠️ 여기서 missing 을 다시 계산하거나 targets 로 폴백하지 말 것(대상 판정이 두 벌이 되는 순간
 * "17줄"이라 표시하고 다른 줄을 번역하는 상태가 된다 — resolveEmotion 단일 소스 규칙과 같은 이유).
 */
export function summarizeUntranslated(
  project: Pick<Project, 'scenes'>,
  targets: Locale[],
): UntranslatedSummary {
  const byLocale: Partial<Record<Locale, number>> = {};
  let lines = 0;
  for (const { items } of collectUntranslated(project, targets)) {
    for (const it of items) {
      lines += 1;
      for (const loc of it.missing) byLocale[loc] = (byLocale[loc] ?? 0) + 1;
    }
  }
  return { byLocale, lines };
}
