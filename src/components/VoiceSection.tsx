// 🎙 성우(TTS) 비용·검수 섹션 — AssetsTab.tsx 에서 떼어냈다(캐릭터 카드가 아니라 프로젝트 전체 액션).

import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { baseLocaleOf } from '../types';
import Spinner from './Spinner';
import VoiceReview from './VoiceReview';

/**
 * 🎙 성우(TTS) 비용·검수 — 캐릭터별 카드가 아니라 프로젝트 전체를 다루는 액션 모음.
 *  - 💡 비용 계산: 글자수 기반 즉시 계산(1글자=1크레딧, API 호출 0회) — 키가 없어도 동작한다.
 *  - 전체 캐릭터 일괄 생성: 프리셋이 저장된 모든 캐릭터를 순차 생성(캐릭터마다 확인창이 다시
 *    뜨지 않게 한 번만 확인).
 *  - 🎧 검수 시작: 생성된 음성을 이어 들으며 검수(VoiceReview).
 */
export default function VoiceSection() {
  // project 전체 대신 실제로 쓰는 두 필드만 — VoiceSection 은 busy/voiceEstimate 변화로도 자주
  // 리렌더되는데(배치 생성 중), whole-project 셀렉터였다면 그 위에 대사 편집 등 무관한 변경까지 더해졌다.
  const characters = useStore((s) => s.project.characters);
  const scenes = useStore((s) => s.project.scenes);
  const baseLocale = useStore((s) => s.project.baseLocale);
  const typecastKey = useStore((s) => s.typecastKey);
  const voiceEstimate = useStore((s) => s.voiceEstimate);
  const batchAllBusy = useStore((s) => !!s.busy['batch:voice:all']);
  const estimateVoiceCost = useStore((s) => s.estimateVoiceCost);
  const batchVoiceAll = useStore((s) => s.batchVoiceAll);
  const base = baseLocaleOf({ baseLocale });
  const [reviewOpen, setReviewOpen] = useState(false);

  // 캐릭터 수·대사 수에 비례하는 스캔 — characters/scenes 가 실제로 안 바뀌면 재계산하지 않는다.
  const hasAnyPreset = useMemo(() => characters.some((c) => c.voice), [characters]);
  const hasAnyVoiced = useMemo(
    () => scenes.some((sc) => sc.lines.some((l) => l.kind === 'dialogue' && l.voiceAssetIds?.[base])),
    [scenes, base],
  );

  return (
    <section>
      <h3 className="section-title mb-1">🎙 성우(TTS) 비용·검수</h3>
      <p className="text-xs text-gray-500 mb-3">
        생성 전 글자수 기반 즉시 견적(1자=1크레딧, 키 불필요)으로 정확한 크레딧을 확인하고, 생성 후엔
        이어듣기로 검수하세요.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          className="btn-ghost text-xs"
          disabled={!hasAnyPreset}
          onClick={estimateVoiceCost}
          title="글자수 합계로 예상 크레딧을 즉시 계산합니다(1자=1크레딧, 정확값 — 키가 없어도 동작)"
        >
          💡 비용 계산
        </button>
        <button
          className="btn-ghost text-xs"
          disabled={!typecastKey || !hasAnyPreset || batchAllBusy}
          onClick={() => void batchVoiceAll(base)}
          title="보이스 프리셋이 저장된 모든 캐릭터의 남은 대사를 순차 생성합니다"
        >
          {batchAllBusy ? <Spinner /> : '🎙 전체 캐릭터 일괄 생성'}
        </button>
        <button
          className="btn-ghost text-xs"
          disabled={!hasAnyVoiced}
          onClick={() => setReviewOpen(true)}
          title="생성된 음성을 이어서 들으며 검수합니다"
        >
          🎧 검수 시작
        </button>
      </div>
      {voiceEstimate && (
        <p className="text-[11px] text-gray-400">
          정확히 {voiceEstimate.totalCredits}크레딧 · 약 {Math.round(voiceEstimate.totalSeconds)}초 ·{' '}
          {voiceEstimate.totalLines}줄
          {voiceEstimate.noPreset.length > 0 && ` · 프리셋 없음: ${voiceEstimate.noPreset.join(', ')}`}
          {voiceEstimate.overLimit.length > 0 && (
            <span className="text-amber-600"> · 2000자 초과 {voiceEstimate.overLimit.length}줄(생성 실패 가능)</span>
          )}
        </p>
      )}
      {reviewOpen && <VoiceReview onClose={() => setReviewOpen(false)} />}
    </section>
  );
}
