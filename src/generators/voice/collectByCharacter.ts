// 캐릭터별 TTS 일괄 생성 대상 수집 — 대본이 수백~수천 줄일 때 대사 하나하나 손으로
// 생성·적용하는 대신, 이 캐릭터가 말하는 "아직 이 언어 음성이 없는" 단일 화자 대사만 모은다.
// src/generators/translate/collect.ts(collectUntranslated)와 같은 철학: 이미 채워진 건 건드리지
// 않아 사용자가 개별로 미세조정해둔 줄이 일괄 생성에 덮어써지지 않는다.

import type { Project, Locale } from '../../types';

export interface VoiceBatchItem {
  sceneId: string;
  lineIndex: number;
  text: string;
}

/**
 * charName 이 말하는 단일 화자(합동 대사 제외) 대사 중, locale 음성이 아직 없는 줄만 모은다.
 * text 는 locale 이 원문(base) 이면 line.text, 아니면 번역본(i18n[locale], 없으면 원문 폴백).
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
      out.push({ sceneId: sc.id, lineIndex, text });
    });
  }
  return out;
}
