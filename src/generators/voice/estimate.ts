// Typecast TTS 생성 전 비용 추정 — 이전 TTS 벤더 시절엔 크레딧/초 단가가 비공개라 Predict Duration
// API 를 샘플링·외삽해야 했지만, Typecast 는 과금이 "1글자 = 1크레딧"으로 문서에 명시돼 있어
// 대상 대사의 글자수 합이 곧 정확한 크레딧 견적이다. API 호출이 전혀 필요 없으므로 키 없이도
// 즉시 계산할 수 있다(estimateVoiceCostForProject 는 동기 함수).

import { baseLocaleOf, type Locale, type Project } from '../../types';
import { collectVoiceTargets, type VoiceBatchItem } from './collectByCharacter';

/** text-to-speech 의 1회 요청 텍스트 길이 제한(1~2000자, Typecast 문서 확인). */
const TEXT_LIMIT = 2000;

/** 한국어 기준 대략적인 발화 속도(자/초) — 화면 표시용 참고치일 뿐 크레딧 계산엔 쓰이지 않는다. */
const APPROX_CHARS_PER_SEC = 5.5;

interface CharEstimate {
  name: string;
  lines: number;
  chars: number;
  /** 화면 표시용 근사 소요시간(초). 정확한 값이 아님 — 크레딧만 정확하다. */
  estSeconds: number;
  /** 정확한 크레딧(=글자수). */
  estCredits: number;
}

interface OverLimitLine {
  scene: string;
  speaker: string;
  chars: number;
}

export interface VoiceEstimate {
  perChar: CharEstimate[];
  totalLines: number;
  totalChars: number;
  totalSeconds: number;
  totalCredits: number;
  overLimit: OverLimitLine[];
  /** 보이스 프리셋(char.voice)이 없어 견적에서 제외된 캐릭터 이름. */
  noPreset: string[];
}

/** targets 중 2000자를 넘는(=text-to-speech 호출 자체가 실패할) 줄을 장면 제목과 함께 뽑는다. */
export function findOverLimitTargets(
  project: Project,
  targets: VoiceBatchItem[],
  speaker: string,
  limit = TEXT_LIMIT,
): OverLimitLine[] {
  return targets
    .filter((t) => t.text.length > limit)
    .map((t) => {
      const scene = project.scenes.find((s) => s.id === t.sceneId);
      return { scene: scene?.title ?? t.sceneId, speaker, chars: t.text.length };
    });
}

/**
 * 프로젝트 전체(보이스 프리셋이 저장된 캐릭터만)의 예상 비용을 계산한다. 글자수 합=크레딧이라
 * API 호출이 필요 없어 동기 계산이다(키 없이도 즉시 실행 가능 — 왼쪽 패널 💡 버튼이 이걸 반영).
 */
export function estimateVoiceCostForProject(project: Project, locale: Locale): VoiceEstimate {
  const base = baseLocaleOf(project);

  const perChar: CharEstimate[] = [];
  const overLimit: OverLimitLine[] = [];
  const noPreset: string[] = [];
  let totalLines = 0;
  let totalChars = 0;
  let totalSeconds = 0;
  let totalCredits = 0;

  for (const char of project.characters) {
    if (char.isProtagonist) continue; // 주인공·나레이션 전용 화자는 VoiceLab 대상이 아님(canVoice 와 동일 기준)
    const targets = collectVoiceTargets(project, char.name, locale, base);
    if (!targets.length) continue; // 이 캐릭터가 말하는(아직 음성 없는) 대사가 아예 없으면 견적에서 제외

    if (!char.voice) {
      noPreset.push(char.name);
      continue;
    }

    overLimit.push(...findOverLimitTargets(project, targets, char.name));
    const chars = targets.reduce((sum, t) => sum + t.text.length, 0);
    const estSeconds = chars / APPROX_CHARS_PER_SEC;
    const estCredits = chars; // 1글자 = 1크레딧(정확값)

    perChar.push({ name: char.name, lines: targets.length, chars, estSeconds, estCredits });
    totalLines += targets.length;
    totalChars += chars;
    totalSeconds += estSeconds;
    totalCredits += estCredits;
  }

  return { perChar, totalLines, totalChars, totalSeconds, totalCredits, overLimit, noPreset };
}
