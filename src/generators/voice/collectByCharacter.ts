// 캐릭터별 TTS 일괄 생성 대상 수집 — 대본이 수백~수천 줄일 때 대사 하나하나 손으로
// 생성·적용하는 대신, 이 캐릭터가 말하는 "아직 이 언어 음성이 없는" 단일 화자 대사만 모은다.
// src/generators/translate/collect.ts(collectUntranslated)와 같은 철학: 이미 채워진 건 건드리지
// 않아 사용자가 개별로 미세조정해둔 줄이 일괄 생성에 덮어써지지 않는다.

import type { Project, Locale } from '../../types';

export interface VoiceBatchItem {
  sceneId: string;
  lineIndex: number;
  /**
   * TTS 에 실제로 넘길 **synthesis input** — 로케일 해석 결과라 비-base 로케일이면 번역문이다.
   * ⚠️ **identity anchor 로 재사용하지 말 것**(아래 anchorText 와 값이 다를 수 있다).
   */
  text: string;
  /**
   * 구조 변경 방어용 **request-time identity anchor**(화자) — 이 항목이 만들어진 순간의 line.speaker.
   * 배치는 화자로 필터하므로 charName 과 같지만, 판정이 호출측 불변식에 기대지 않도록 값으로 남긴다.
   */
  anchorSpeaker: string;
  /**
   * 구조 변경 방어용 **request-time identity anchor**(원문) — 이 항목이 만들어진 순간의 canonical
   * line.text 다. ⚠️ synthesis input(text)과 **다른 축**이다 — 비-base 로케일에서 text 는 번역문이라
   * 그걸로 대조하면 "번역이 없는 줄"과 "원문이 같은 다른 줄"을 구별하지 못한다.
   */
  anchorText: string;
}

/**
 * charName 이 말하는 단일 화자(합동 대사 제외) 대사 중, locale 음성이 아직 없는 줄만 모은다.
 * text 는 locale 이 원문(base) 이면 line.text, 아니면 번역본(i18n[locale], 없으면 원문 폴백).
 *
 * ⚠️ 이 함수는 **동기·순수**라 배치의 최초 await(구독 잔량 조회) 보다 먼저 돈다 — 그래서 여기서 뜬
 * anchorSpeaker/anchorText 가 "이 voice 작업이 어느 Line 을 대상으로 시작됐는가"의 **정본 snapshot**
 * 이다. 커밋(applyVoiceUpdates)은 이 값으로 대조한다. 늦게(attach 시점) 다시 뜨면 이미 밀린 줄에서
 * anchor 를 만들어 검증이 무의미해진다.
 */
export function collectVoiceTargets(
  project: Project,
  charName: string,
  locale: Locale,
  baseLocale: Locale,
): VoiceBatchItem[] {
  const out: VoiceBatchItem[] = [];
  for (const sc of project.scenes) {
    sc.lines.forEach((line, lineIndex) => {
      if (line.kind !== 'dialogue') return;
      if (line.members && line.members.length) return; // 합동 대사는 generate.ts 도 vo() 를 안 냄
      if (line.speaker !== charName) return;
      if (line.voiceAssetIds?.[locale]) return; // 이미 이 언어 음성 있음 — 건너뜀(미세조정 보존)
      const text = (locale === baseLocale ? undefined : line.i18n?.[locale]) ?? line.text;
      if (!text.trim()) return;
      // anchor 는 line 에서 **직접** 뜬다(문자열 복사) — charName·text 로 대체하지 않는다.
      out.push({ sceneId: sc.id, lineIndex, text, anchorSpeaker: line.speaker, anchorText: line.text });
    });
  }
  return out;
}
