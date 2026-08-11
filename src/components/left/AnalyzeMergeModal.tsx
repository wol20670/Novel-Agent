import type { MergePreview } from '../../project/mergeScenes';

/**
 * 기존 장면이 있을 때 재분석 결과를 어떻게 반영할지 고르는 모달 — 스마트 병합(추천)/뒤에 추가/전체 교체.
 * previewMerge 로 미리 계산한 유지·추가·제거 개수를 스마트 병합 카드에 보여준다.
 */
export default function AnalyzeMergeModal({
  preview,
  newCount,
  prevCount,
  onMerge,
  onAppend,
  onReplace,
  onCancel,
}: {
  preview: MergePreview;
  newCount: number;
  prevCount: number;
  onMerge: () => void;
  onAppend: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) {
  // 장면 태그(#S/장면:)가 인식 안 돼 대본 전체가 한 장면으로 뭉개진 흔한 실수를 여기서 바로 알린다.
  const suspiciouslyFew = newCount === 1 && prevCount >= 3;
  // 변경 요약 — 해당되는 항목만 모아 ' · ' 로 잇는다(빈 항목 때문에 앞에 구분자가 남지 않도록).
  // 표기 수정(띄어쓰기·부호만)은 음성이 살아남는 값싼 변경이라 대사 수정과 나눠 보여준다.
  const changeSummary: string[] = [
    preview.linesChanged > 0 && `✏️ 대사 수정·추가 ${preview.linesChanged}줄`,
    preview.linesRespelled > 0 && `🔤 표기 수정 ${preview.linesRespelled}줄`,
    preview.linesRemoved > 0 && `➖ 삭제 ${preview.linesRemoved}줄`,
    preview.scenesAttrChanged > 0 && `🖼 배경·BGM 변경 ${preview.scenesAttrChanged}개 장면`,
    preview.scenesTagChanged > 0 &&
      `🏷 태그 변경(점프·선택지·의상·연출) ${preview.scenesTagChanged}개 장면` +
        `(${preview.tagChangedTitles.join(', ')}${preview.scenesTagChanged > preview.tagChangedTitles.length ? ' 외' : ''})`,
  ].filter((s): s is string => !!s);
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="card w-full max-w-md p-4 flex flex-col gap-2.5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-100">기존 장면이 있습니다 — 새 분석 결과를 어떻게 반영할까요?</h3>

        <p className="text-[11px] text-gray-400">
          새 대본: {newCount}개 장면 · 기존: {prevCount}개
        </p>
        {suspiciouslyFew && (
          <p className="text-[11px] text-amber-600">
            ⚠️ 새 대본에서 장면을 1개만 읽었습니다 — 장면 태그(#S/장면:)가 인식되지 않았을 수 있어요. B열
            태그를 확인하세요.
          </p>
        )}

        <button
          className="text-left rounded-lg border border-accent/50 bg-accent2/10 hover:bg-accent2/20 transition-colors p-3 flex flex-col gap-1"
          onClick={onMerge}
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold text-accent">
            🔀 스마트 병합
            <span className="chip border-accent text-accent bg-accent/10">추천</span>
          </span>
          <span className="text-[11px] text-gray-500 leading-snug">
            엑셀/텍스트가 최신 전체 대본일 때 — 기존 배경·BGM·CG·번역·승인을 승계
          </span>
          <span className="text-[11px] text-gray-400">
            유지 {preview.kept} · 추가 {preview.added} · 제거 {preview.removed}
          </span>
          {changeSummary.length === 0 ? (
            <span className="text-[11px] text-emerald-600">✅ 대사·배경·태그 변경 없음 — 병합해도 내용은 그대로입니다</span>
          ) : (
            <span className="text-[11px] text-gray-300">{changeSummary.join(' · ')}</span>
          )}
          {preview.removed > 0 && (
            <span className="text-[11px] text-amber-600">
              ⚠️ 새 결과에 없는 기존 장면 {preview.removed}개가 삭제됩니다
            </span>
          )}
          {preview.voiceLoss > 0 && (
            <span className="text-[11px] text-amber-600">
              ⚠️ 음성 {preview.voiceLoss}개가 폐기돼 다시 생성해야 합니다(크레딧 소모)
            </span>
          )}
          {preview.voiceCarriedLoose > 0 && (
            <span className="text-[11px] text-sky-500">
              🔁 음성 {preview.voiceCarriedLoose}줄은 그대로 승계됩니다(띄어쓰기·문장부호만 변경)
            </span>
          )}
          {preview.i18nLoss > 0 && (
            <span className="text-[11px] text-amber-600">⚠️ 번역 {preview.i18nLoss}칸이 사라집니다</span>
          )}
          {preview.statusReset > 0 && (
            <span className="text-[11px] text-amber-600">
              ⚠️ 승인 {preview.statusReset}개 장면이 검토중으로 돌아갑니다
            </span>
          )}
          {preview.assetUnlink > 0 && (
            <span className="text-[11px] text-amber-600">
              ⚠️ 배경·BGM 연결이 {preview.assetUnlink}개 장면에서 끊깁니다 — 이름이 바뀌어 다시 업로드해야 합니다
            </span>
          )}
        </button>

        <button
          className="text-left rounded-lg border border-edge hover:border-accent/40 hover:bg-panel2 transition-colors p-3 flex flex-col gap-1"
          onClick={onAppend}
        >
          <span className="text-sm font-semibold text-gray-200">➕ 뒤에 추가</span>
          <span className="text-[11px] text-gray-500 leading-snug">
            새 장면만 담은 파일일 때 — 기존 장면은 무수정, 새 장면만 뒤에 붙입니다
          </span>
        </button>

        <button
          className="text-left rounded-lg border border-edge hover:border-rose-400/50 hover:bg-rose-500/5 transition-colors p-3 flex flex-col gap-1"
          onClick={onReplace}
        >
          <span className="text-sm font-semibold text-gray-200">♻️ 전체 교체</span>
          <span className="text-[11px] text-rose-500 leading-snug">
            처음부터 다시 — 기존 장면·에셋 연결이 모두 사라집니다
          </span>
        </button>

        <button className="btn-ghost self-end" onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}
