import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { downloadExcelTemplate, downloadTextTemplate } from '../template';
import { GENRE_OPTIONS, DEFAULT_GENRE, resolveTheme } from '../renpy/gui';
import type { GenreId, GuiTheme } from '../renpy/gui';
import { translateModeOf } from '../types';
import { canvasMenuArt } from '../generators/image/canvasMenu';
import { hasEnvCredentials, generateRoomCode } from '../collab';
import { DEFAULT_FONT, getCachedCatalog, loadFontCatalog } from '../fonts/fontCatalog';
import type { FontPreset } from '../fonts/fontCatalog';
import { loadFontFace } from '../fonts/fontCache';
import { getSubscription, type Subscription } from '../generators/voice/typecastProvider';
import { parseText, parseWorkbook } from '../parser';
import type { BuildResult } from '../parser';
import { previewMerge, type AnalyzeMode, type MergePreview } from '../project/mergeScenes';
import Spinner from './Spinner';
import UploadButton from './UploadButton';

export default function LeftPanel() {
  const project = useStore((s) => s.project);
  const setRawInput = useStore((s) => s.setRawInput);
  const applyAnalysis = useStore((s) => s.applyAnalysis);
  const loadSample = useStore((s) => s.loadSample);
  const save = useStore((s) => s.save);
  const resetAll = useStore((s) => s.resetAll);
  const clearGenerated = useStore((s) => s.clearGeneratedAssets);
  const openaiKey = useStore((s) => s.openaiKey);
  const setOpenaiKey = useStore((s) => s.setOpenaiKey);
  const typecastKey = useStore((s) => s.typecastKey);
  const setTypecastKey = useStore((s) => s.setTypecastKey);
  const translateMode = translateModeOf(project);
  const setTranslateMode = useStore((s) => s.setTranslateMode);
  const exportProject = useStore((s) => s.exportProject);
  const importProject = useStore((s) => s.importProject);
  const setToast = useStore((s) => s.setToast);
  const saveError = useStore((s) => s.saveError);

  const fileRef = useRef<HTMLInputElement>(null);
  const projFileRef = useRef<HTMLInputElement>(null);
  const [showOaiKey, setShowOaiKey] = useState(false);
  const [showTypecastKey, setShowTypecastKey] = useState(false);
  const [subscription, setSubscription] = useState<Subscription>();
  const [creditsError, setCreditsError] = useState('');
  const [checkingCredits, setCheckingCredits] = useState(false);
  // 재분석(엑셀/텍스트) 결과가 파싱됐지만 기존 장면 처리 방식을 아직 못 고른 상태(모달 표시 중).
  const [pending, setPending] = useState<{ parsed: BuildResult; rawText?: string } | null>(null);
  // previewMerge 는 라인 단위까지 훑어 비교하는 무거운 계산 — 모달이 떠 있을 때만, pending/scenes 가
  // 바뀔 때만 계산한다(API 키 입력 등 LeftPanel 의 매 렌더마다 다시 돌리지 않도록).
  const mergePreview = useMemo(
    () => (pending ? previewMerge(project.scenes, pending.parsed.scenes) : null),
    [pending, project.scenes],
  );

  /** 파싱 결과를 받아 기존 장면 유무에 따라 곧장 반영하거나(0개) 모달로 방식을 고른다. */
  const startAnalysis = (parsed: BuildResult, rawText?: string) => {
    if (parsed.scenes.length === 0) {
      applyAnalysis(parsed, 'replace', rawText); // 스토어가 빈 결과 안내 토스트를 띄운다
      return;
    }
    if (project.scenes.length === 0) {
      applyAnalysis(parsed, 'replace', rawText); // 첫 업로드 — 모달 없이 곧장 반영
      return;
    }
    setPending({ parsed, rawText });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseWorkbook(buf);
      startAnalysis(parsed);
    } catch (err) {
      setToast('엑셀 파싱에 실패했습니다: ' + (err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = ''; // 같은 파일 재선택 허용
    }
  };

  const onAnalyzeTextClick = () => {
    startAnalysis(parseText(project.rawInput), project.rawInput);
  };

  const resolveMode = (mode: AnalyzeMode) => {
    if (!pending) return;
    applyAnalysis(pending.parsed, mode, pending.rawText);
    setPending(null);
  };

  const onProjFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importProject(file);
    if (projFileRef.current) projFileRef.current.value = '';
  };

  // 일괄 생성 전에 잔량을 미리 보고 감을 잡을 수 있도록(자동 폴링은 안 함 — 클릭 시에만 호출).
  const checkCredits = async () => {
    if (!typecastKey) return;
    setCheckingCredits(true);
    setCreditsError('');
    try {
      setSubscription(await getSubscription(typecastKey));
    } catch (e) {
      setCreditsError((e as Error).message);
    } finally {
      setCheckingCredits(false);
    }
  };

  const onReset = () => {
    if (confirm('모든 장면·에셋·저장 데이터를 지웁니다. 계속할까요?')) resetAll();
  };

  const onClearGenerated = () => {
    if (
      confirm(
        '업로드한 배경·캐릭터 입화·CG·BGM·메뉴 이미지를 모두 삭제합니다.\n(대본·캐릭터 설정·표정/의상 정의는 유지)\n계속할까요?',
      )
    )
      clearGenerated();
  };

  return (
    <>
    <div className="p-3.5 flex flex-col gap-5 text-sm">
      {/* 저장 실패 배너 — toast(3.5초)와 달리 저장이 계속 안 되는 동안 계속 떠 있다. 화면은 멀쩡해
          보여도 실제로는 아무것도 저장되지 않는 상태를 놓치지 않도록. */}
      {saveError && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 p-2.5 text-[11px] text-rose-500 leading-snug">
          ⚠️ <b>저장 실패</b> — {saveError}
          <br />
          지금 바로 아래 <b>📤 내보내기</b>로 백업해두세요(브라우저 저장소가 꽉 찼을 수 있습니다).
        </div>
      )}
      {/* 상단 액션 */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={save}>
            💾 저장
          </button>
          <button className="btn-ghost flex-1" onClick={loadSample}>
            ✨ 샘플
          </button>
          <button className="btn-ghost" onClick={onReset} title="전체 초기화 (대본·설정 포함 모두 삭제)">
            ⟲
          </button>
        </div>
        <button
          className="btn-ghost text-[11px] text-gray-400 hover:text-rose-500"
          onClick={onClearGenerated}
          title="대본·캐릭터 설정은 두고, 업로드한 배경·입화·CG·BGM·메뉴 이미지만 삭제"
        >
          🧹 에셋 초기화 (대본·설정 유지)
        </button>
        <div className="flex gap-2">
          <button
            className="btn-ghost flex-1"
            onClick={exportProject}
            title="장면·에셋을 단일 파일로 저장 (다른 기기로 이동)"
          >
            📤 내보내기
          </button>
          <button
            className="btn-ghost flex-1"
            onClick={() => projFileRef.current?.click()}
            title=".npproj.zip 프로젝트 파일 불러오기"
          >
            📥 가져오기
          </button>
          <input
            ref={projFileRef}
            type="file"
            accept=".zip,.npproj.zip"
            className="hidden"
            onChange={onProjFile}
          />
        </div>
      </div>

      {/* 1. 스토리 입력 */}
      <section className="flex flex-col gap-2.5">
        <h2 className="section-title">
          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-accent2 text-white text-[10px]">1</span>
          스토리 입력
        </h2>

        <div>
          <span className="label">템플릿 다운로드</span>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={downloadExcelTemplate}>
              📊 엑셀 양식
            </button>
            <button className="btn-ghost flex-1" onClick={downloadTextTemplate}>
              📝 텍스트 양식
            </button>
          </div>
        </div>

        <div>
          <span className="label">엑셀 업로드 (.xlsx)</span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFile}
            className="field text-xs file:mr-2 file:border-0 file:bg-accent2/20 file:text-accent file:rounded file:px-2 file:py-1 file:cursor-pointer"
          />
        </div>

        <div className="relative flex items-center gap-2 text-[10px] text-gray-600 my-0.5">
          <span className="flex-1 h-px bg-edge" />
          또는 직접 작성
          <span className="flex-1 h-px bg-edge" />
        </div>

        <textarea
          className="field font-mono text-xs leading-relaxed h-60 resize-y"
          placeholder={'장면: 맑은 아침, 운동장\n배경: 학교 운동장\n주인공: 안녕!\n(잠시 침묵이 흘렀다.)\n선택지:\n> 인사한다\n> 지나친다'}
          value={project.rawInput}
          onChange={(e) => setRawInput(e.target.value)}
        />
        <button className="btn-primary" onClick={onAnalyzeTextClick}>
          🔍 분석
        </button>
      </section>

      <Divider />
      <ProjectMeta />
      <Divider />

      {/* OpenAI 키 — 자동 번역 · AI 테마가 공유 */}
      <section className="flex flex-col gap-2">
        <h2 className="section-title">OpenAI 키 · 선택 (번역 · AI 테마)</h2>
        <p className="text-[11px] text-gray-500 leading-snug">
          이미지·음악은 이제 앱이 생성하지 않습니다(ChatGPT/Suno 등에서 만든 파일을 아래 "에셋" 탭에 업로드하세요).
          이 키는 텍스트 전용(<code className="text-accent">gpt-4o-mini</code>) 기능 — 대본 자동 번역, AI GUI 테마
          생성에만 쓰입니다. <b className="text-gray-400">키는 이 브라우저에만 저장</b>되며 외부로 전송되지 않습니다.
        </p>
        <div className="flex gap-2">
          <input
            type={showOaiKey ? 'text' : 'password'}
            className="field flex-1"
            placeholder="sk-..."
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
          />
          <button className="btn-ghost" onClick={() => setShowOaiKey((v) => !v)}>
            {showOaiKey ? '숨김' : '표시'}
          </button>
        </div>
        <div
          className={`text-[11px] flex items-center gap-1.5 ${openaiKey ? 'text-emerald-600' : 'text-gray-500'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${openaiKey ? 'bg-emerald-400' : 'bg-gray-600'}`} />
          {openaiKey ? '키 저장됨 · AI 텍스트 기능 켜짐' : '키 없음 · 텍스트 기능 꺼짐'}
        </div>

        {/* 자동 번역 모드 — off(기본)/fast/quality. off 가 아니면 장면 탭에 "전체 자동 번역" 버튼이 뜬다. */}
        <div className="flex flex-col gap-1 pt-1 border-t border-edge/50">
          <span className="label">자동 번역 (대사·지문 → 영어·일본어)</span>
          <div className="flex gap-1">
            {(
              [
                ['off', '사용 안 함'],
                ['fast', '번역(저품질)'],
                ['quality', '번역(고품질)'],
              ] as const
            ).map(([m, lbl]) => (
              <button
                key={m}
                onClick={() => setTranslateMode(m)}
                className={`chip flex-1 ${
                  translateMode === m
                    ? 'border-accent text-accent bg-accent/10'
                    : 'border-edge text-gray-500 hover:text-gray-300'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          {translateMode === 'quality' && (
            <p className="text-[11px] text-amber-600">
              ⚠️ 고품질(gpt-4o)은 API 비용이 더 큽니다. 필요할 때만 쓰세요.
            </p>
          )}
          {translateMode !== 'off' && (
            <p className="text-[11px] text-gray-500">
              장면 탭 상단의 <b>🌐 전체 자동 번역</b> 버튼으로 실행됩니다(빈 칸만 채움, OpenAI 키 필요).
            </p>
          )}
        </div>
      </section>

      <Divider />

      {/* Typecast 키 — 히로인 대사 성우(TTS) 테스트용. CORS 때문에 /api/typecast 프록시를 거친다. */}
      <section className="flex flex-col gap-2">
        <h2 className="section-title">Typecast 키 · 선택 (성우 TTS 테스트)</h2>
        <p className="text-[11px] text-gray-500 leading-snug">
          히로인 대사 옆 🎙 버튼으로 실제 음성을 생성·재생해볼 수 있습니다(주인공·나레이션은 성우 없음).{' '}
          <b className="text-gray-400">키는 이 브라우저에만 저장</b>되며, 호출은 CORS 우회용 프록시(
          <code className="text-accent">/api/typecast</code>)를 거칠 뿐 서버에 저장되지 않습니다.
          키는 <b className="text-gray-400">typecast.ai 대시보드</b>에서 발급하며, Free 플랜은 월
          3만 크레딧까지 무료입니다(1글자=1크레딧).
        </p>
        <div className="flex gap-2">
          <input
            type={showTypecastKey ? 'text' : 'password'}
            className="field flex-1"
            placeholder="Typecast API 키"
            value={typecastKey}
            onChange={(e) => setTypecastKey(e.target.value)}
          />
          <button className="btn-ghost" onClick={() => setShowTypecastKey((v) => !v)}>
            {showTypecastKey ? '숨김' : '표시'}
          </button>
        </div>
        <div
          className={`text-[11px] flex items-center gap-1.5 ${typecastKey ? 'text-emerald-600' : 'text-gray-500'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${typecastKey ? 'bg-emerald-400' : 'bg-gray-600'}`} />
          {typecastKey ? '키 저장됨 · 성우 테스트 켜짐' : '키 없음 · 성우 테스트 꺼짐'}
        </div>
        {typecastKey && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <button className="btn-ghost !py-0.5" disabled={checkingCredits} onClick={checkCredits}>
              {checkingCredits ? <Spinner /> : '🔍 크레딧 확인'}
            </button>
            {subscription && (
              <span className="text-gray-400">
                {subscription.plan} 플랜 · 잔여 크레딧: {subscription.planCredits - subscription.usedCredits} /{' '}
                {subscription.planCredits}
              </span>
            )}
            {creditsError && <span className="text-rose-500">{creditsError}</span>}
          </div>
        )}
      </section>

      <Divider />
      <CollabSettings />
    </div>
    {pending && (
      <AnalyzeMergeModal
        preview={mergePreview!}
        newCount={pending.parsed.scenes.length}
        prevCount={project.scenes.length}
        onMerge={() => resolveMode('merge')}
        onAppend={() => resolveMode('append')}
        onReplace={() => resolveMode('replace')}
        onCancel={() => setPending(null)}
      />
    )}
    </>
  );
}

/**
 * 기존 장면이 있을 때 재분석 결과를 어떻게 반영할지 고르는 모달 — 스마트 병합(추천)/뒤에 추가/전체 교체.
 * previewMerge 로 미리 계산한 유지·추가·제거 개수를 스마트 병합 카드에 보여준다.
 */
function AnalyzeMergeModal({
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
          {preview.linesChanged === 0 &&
          preview.linesRespelled === 0 &&
          preview.linesRemoved === 0 &&
          preview.scenesAttrChanged === 0 ? (
            <span className="text-[11px] text-emerald-600">✅ 대사·배경 변경 없음 — 병합해도 내용은 그대로입니다</span>
          ) : (
            <span className="text-[11px] text-gray-300">
              {/* 표기 수정(띄어쓰기·부호만)은 음성이 살아남는 값싼 변경이라 따로 보여준다 —
                  "대사 수정 0줄"만 보고 아무것도 안 바뀐다고 오해하지 않도록. */}
              {preview.linesChanged > 0 && `✏️ 대사 수정·추가 ${preview.linesChanged}줄`}
              {preview.linesChanged > 0 && preview.linesRespelled > 0 && ' · '}
              {preview.linesRespelled > 0 && `🔤 표기 수정 ${preview.linesRespelled}줄`}
              {preview.linesRemoved > 0 && ` · ➖ 삭제 ${preview.linesRemoved}줄`}
              {preview.scenesAttrChanged > 0 && ` · 🖼 배경·BGM 변경 ${preview.scenesAttrChanged}개 장면`}
            </span>
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

/**
 * 협업(실시간 공유) 설정 — Supabase 접속 정보는 빌드에 내장돼 있어(anon key는 공개돼도 되는 값),
 * 사용자는 "방 코드"(6자리)와 이름만 다룬다. 새 방을 만들면 코드가 자동 생성되고, 친구는 그
 * 코드를 그대로 입력해 참가한다.
 */
function CollabSettings() {
  const enabled = useStore((s) => s.collabEnabled);
  const room = useStore((s) => s.collabRoom);
  const storedName = useStore((s) => s.collabName);
  const status = useStore((s) => s.collabStatus);
  const peers = useStore((s) => s.collabPeers);
  const setCollabConfig = useStore((s) => s.setCollabConfig);

  const [name, setName] = useState(storedName);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const envReady = hasEnvCredentials();

  // hydrate() 가 앱 시작 시 비동기로 저장된 설정을 불러오므로, 그 값이 들어오면 이름칸도 맞춘다.
  useEffect(() => {
    setName(storedName);
  }, [storedName]);

  const STATUS: Record<string, { text: string; dot: string; color: string }> = {
    off: { text: '꺼짐', dot: 'bg-gray-600', color: 'text-gray-500' },
    connecting: { text: '연결 중…', dot: 'bg-amber-400', color: 'text-amber-500' },
    online: {
      text: peers.length > 0 ? `연결됨 · ${peers.length}명 접속 중` : '연결됨 · 나 혼자',
      dot: 'bg-emerald-400',
      color: 'text-emerald-600',
    },
    error: { text: '연결 실패 — 코드를 확인하고 다시 시도하세요', dot: 'bg-rose-400', color: 'text-rose-500' },
  };
  const st = STATUS[status] ?? STATUS.off;

  const createRoom = async () => {
    setBusy(true);
    try {
      await setCollabConfig({ room: generateRoomCode(), displayName: name.trim() || '익명', enabled: true });
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const code = joinCode.trim();
    if (!code) return;
    setBusy(true);
    try {
      await setCollabConfig({ room: code, displayName: name.trim() || '익명', enabled: true });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await setCollabConfig({ enabled: false });
    } finally {
      setBusy(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(room).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-title">🤝 협업(실시간 공유) · 선택</h2>
      <p className="text-[11px] text-gray-500 leading-snug">
        저장할 때마다 서로에게 반영되고 지금 누가 어떤 장면을 보는지 표시됩니다(구글시트 같은 실시간
        동시편집은 아니고, 저장 시점마다 합쳐지는 가벼운 공유). <b className="text-amber-600">⚠️ 방 코드를
        아는 사람은 누구나 읽고 쓸 수 있으니</b> 신뢰하는 사람과만 공유하세요.
      </p>

      {!enabled ? (
        <>
          <input
            className="field text-xs"
            placeholder="내 이름 (상대에게 보임)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn-primary" disabled={busy || !envReady} onClick={createRoom}>
            {busy ? <Spinner /> : '🆕 새 방 만들기'}
          </button>
          <div className="relative flex items-center gap-2 text-[10px] text-gray-600 my-0.5">
            <span className="flex-1 h-px bg-edge" />
            또는 코드로 참가
            <span className="flex-1 h-px bg-edge" />
          </div>
          <div className="flex gap-2">
            <input
              className="field flex-1 text-xs"
              placeholder="친구가 알려준 6자리 코드"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            />
            <button className="btn-ghost" disabled={busy || !envReady || !joinCode.trim()} onClick={joinRoom}>
              참가
            </button>
          </div>
          {!envReady && (
            <p className="text-[11px] text-amber-600">
              ⚠️ 이 빌드엔 협업용 Supabase 접속 정보가 설정돼 있지 않습니다(배포 시 환경변수 필요).
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="field flex-1 text-center font-mono text-lg tracking-widest select-all">{room}</span>
            <button className="btn-ghost text-xs shrink-0" onClick={copyCode}>
              {copied ? '✓ 복사됨' : '📋 복사'}
            </button>
          </div>
          <p className="text-[10px] text-gray-500">이 코드를 친구에게 알려주세요.</p>
          <button className="btn-ghost" disabled={busy} onClick={turnOff}>
            협업 끄기
          </button>
        </>
      )}

      <div className={`text-[11px] flex items-center gap-1.5 ${st.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
        {st.text}
      </div>
      {enabled && peers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {peers.map((p) => (
            <span key={p.clientId} className="chip border-emerald-500/40 text-emerald-600">
              🟢 {p.name} · {p.sceneTitle ?? p.activeTab}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Divider() {
  return <div className="h-px bg-edge/60" />;
}

function ProjectMeta() {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.updateProjectMeta);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="section-title">프로젝트 설정</h2>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="label">제목</span>
          <input className="field" value={project.title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div>
          <span className="label">저자</span>
          <input className="field" value={project.author} onChange={(e) => update({ author: e.target.value })} />
        </div>
        <div>
          <span className="label">가로 (px)</span>
          <input
            type="number"
            className="field"
            value={project.width}
            onChange={(e) => update({ width: Number(e.target.value) || 1280 })}
          />
        </div>
        <div>
          <span className="label">세로 (px)</span>
          <input
            type="number"
            className="field"
            value={project.height}
            onChange={(e) => update({ height: Number(e.target.value) || 720 })}
          />
        </div>
      </div>
      <div>
        <span className="label">GUI 테마 (장르)</span>
        <select
          className="field"
          value={project.genre ?? DEFAULT_GENRE}
          onChange={(e) => update({ genre: e.target.value as GenreId })}
        >
          {GENRE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500 leading-snug mt-1">
          메인/게임 메뉴·대사창·색·전환이 장르에 맞게 바뀝니다. 자체 제작 GUI(외부 GUI 이미지 의존 없음).
        </p>
      </div>

      <div>
        <span className="label">크레딧 / 라이선스 고지 (게임 내 표시)</span>
        <textarea
          className="field text-xs h-20 resize-y"
          placeholder={'사용한 일러스트·BGM·효과음·성우 등의 출처와 라이선스를 적으세요.\n예) 배경 일러스트: ○○○ / BGM: △△△ (CC-BY 4.0)\n상업 배포 전 반드시 정리 — 엔진·나눔고딕 라이선스는 자동 표기됩니다.'}
          value={project.credits ?? ''}
          onChange={(e) => update({ credits: e.target.value })}
        />
      </div>

      <ThemeStudio />
    </section>
  );
}

function ThemeStudio() {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.updateProjectMeta);
  const generateAiTheme = useStore((s) => s.generateAiTheme);
  const clearAiTheme = useStore((s) => s.clearAiTheme);
  const importMenuArt = useStore((s) => s.importMenuArt);
  const clearMenuArt = useStore((s) => s.clearMenuArt);
  const busy = useStore((s) => s.aiThemeBusy);
  const openaiKey = useStore((s) => s.openaiKey);

  const theme = resolveTheme(project.genre, project.guiTheme);
  const custom = !!project.guiTheme;

  return (
    <div className="rounded-lg border border-accent/30 bg-accent2/5 p-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-accent">✨ AI 테마 스튜디오</span>
        <span className="text-[10px] text-gray-500">{openaiKey ? 'AI 모드' : '오프라인 모드'}</span>
      </div>

      <div>
        <span className="label">분위기 · 요청 (선택)</span>
        <textarea
          className="field text-xs h-14 resize-y"
          placeholder={'예) 비 내리는 네온 도시, 차가운 사이버펑크\n예) 따뜻한 봄날의 풋풋한 첫사랑'}
          value={project.mood ?? ''}
          onChange={(e) => update({ mood: e.target.value })}
        />
      </div>

      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy} onClick={generateAiTheme}>
          {busy ? <Spinner label="생성 중" /> : custom ? '🔄 테마 재생성' : '✨ AI 테마 생성'}
        </button>
        {custom && (
          <button className="btn-ghost text-gray-500" disabled={busy} onClick={clearAiTheme} title="장르 프리셋으로 되돌리기">
            프리셋
          </button>
        )}
      </div>

      <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${custom ? 'bg-accent' : 'bg-gray-600'}`} />
        {custom ? `커스텀: ${theme.label}` : `프리셋: ${theme.label}`}
      </div>

      <ThemePreview theme={theme} />

      <div className="flex flex-col gap-1 pt-1 border-t border-edge/50">
        <span className="label">타이틀·메뉴 배경 (ChatGPT 등에서 만든 이미지 업로드)</span>
        <div className="flex gap-2">
          <UploadButton
            onFile={(f) => importMenuArt('main', f)}
            label={project.menuArt?.main ? '메인 ✓ 교체' : '↥ 메인 업로드'}
            className="btn-ghost flex-1 text-[11px]"
            title="외부 제작 메인 메뉴 배경 이미지 업로드"
          />
          <UploadButton
            onFile={(f) => importMenuArt('game', f)}
            label={project.menuArt?.game ? '게임 ✓ 교체' : '↥ 게임 업로드'}
            className="btn-ghost flex-1 text-[11px]"
            title="외부 제작 게임 메뉴(인게임 메뉴) 배경 이미지 업로드"
          />
        </div>
        {(project.menuArt?.main || project.menuArt?.game) && (
          <button
            className="text-[10px] text-gray-500 hover:text-rose-600 self-start"
            onClick={() => {
              clearMenuArt('main');
              clearMenuArt('game');
            }}
          >
            업로드 해제 (Canvas 생성으로 복귀)
          </button>
        )}
        <p className="text-[10px] text-gray-500 leading-snug">
          업로드한 메뉴 배경은 ZIP·폴더쓰기 결과에 반영됩니다(위 미리보기는 Canvas 생성본 기준).
        </p>
      </div>

      <DialogueGuiControls />
    </div>
  );
}

/** 폰트 id → 미리보기용 CSS font-family(로드 전/실패 시 undefined = 브라우저 기본 폰트). */
function useFontFamily(id: string | undefined): string | undefined {
  const [family, setFamily] = useState<string>();
  useEffect(() => {
    let alive = true;
    setFamily(undefined);
    loadFontFace(id).then((f) => {
      if (alive) setFamily(f);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return family;
}

const FONT_PREVIEW_TEXT = '다람쥐 헌 쳇바퀴에 타고파 1234';
const INHERIT_BODY = '__inherit__'; // 이름 폰트 select 의 "본문과 동일" 옵션 값(빈 문자열 대신 명시적 sentinel)

/** 본문(대사)/이름(화자) 폰트 선택 — GCS 매니페스트(src/fonts/fontCatalog.ts)에서 목록을 받아온다. */
function FontControls() {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.updateProjectMeta);
  const ov = project.guiOverrides ?? {};
  const setOv = (patch: Partial<NonNullable<typeof project.guiOverrides>>) =>
    update({ guiOverrides: { ...(project.guiOverrides ?? {}), ...patch } });

  const [fonts, setFonts] = useState<FontPreset[]>(getCachedCatalog());
  useEffect(() => {
    loadFontCatalog().then(setFonts);
  }, []);
  const customAvailable = fonts.length > 1; // 기본 폰트 1개뿐이면 매니페스트 로드 실패/미설정

  const bodyId = ov.bodyFontId ?? DEFAULT_FONT.id;
  const nameId = ov.nameFontId; // undefined = "본문과 동일"
  const bodyFamily = useFontFamily(bodyId);
  const nameFamily = useFontFamily(nameId ?? bodyId);

  const grouped = useMemo(() => {
    const byCat = new Map<string, FontPreset[]>();
    for (const f of fonts) {
      const list = byCat.get(f.category) ?? [];
      list.push(f);
      byCat.set(f.category, list);
    }
    return [...byCat.entries()];
  }, [fonts]);

  const optionsFor = (f: FontPreset) => (
    <option key={f.id} value={f.id}>
      {f.label}
      {!f.fullHangul ? ' (이름·제목 권장)' : ''}
    </option>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-gray-400">
          본문(대사) 폰트
          <select
            className="field text-xs"
            value={bodyId}
            onChange={(e) => setOv({ bodyFontId: e.target.value === DEFAULT_FONT.id ? undefined : e.target.value })}
          >
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map(optionsFor)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-gray-400">
          이름(화자) 폰트
          <select
            className="field text-xs"
            value={nameId ?? INHERIT_BODY}
            onChange={(e) => setOv({ nameFontId: e.target.value === INHERIT_BODY ? undefined : e.target.value })}
          >
            <option value={INHERIT_BODY}>본문과 동일</option>
            {grouped.map(([cat, list]) => (
              <optgroup key={cat} label={cat}>
                {list.map(optionsFor)}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div
          className="rounded border border-edge/60 px-2 py-1.5 text-sm truncate bg-black/10"
          style={{ fontFamily: bodyFamily }}
        >
          {FONT_PREVIEW_TEXT}
        </div>
        <div
          className="rounded border border-edge/60 px-2 py-1.5 text-sm truncate bg-black/10"
          style={{ fontFamily: nameFamily }}
        >
          {FONT_PREVIEW_TEXT}
        </div>
      </div>
      {!customAvailable && (
        <p className="text-[10px] text-gray-500">
          커스텀 폰트 목록을 못 불러왔습니다(오프라인이거나 미설정) — 기본 폰트(나눔고딕)만 사용됩니다.
        </p>
      )}
    </div>
  );
}

/** 대사창 불투명도 · 글자색 · 외곽선 · 이름색 조정(테마 위에 덮어씀). */
function DialogueGuiControls() {
  const project = useStore((s) => s.project);
  const update = useStore((s) => s.updateProjectMeta);
  const theme = resolveTheme(project.genre, project.guiTheme);
  const ov = project.guiOverrides ?? {};
  const setOv = (patch: Partial<NonNullable<typeof project.guiOverrides>>) =>
    update({ guiOverrides: { ...(project.guiOverrides ?? {}), ...patch } });

  const boxColor = ov.dialogueBoxColor ?? '#000000';
  const opacity = ov.dialogueOpacity ?? 0.4; // 내보내기(buildZip) 기본값과 일치시킴
  const textColor = ov.textColor ?? theme.dialogueText;
  const nameColor = ov.nameColor ?? theme.nameText;
  const outline = ov.outline ?? false;
  const outlineColor = ov.outlineColor ?? '#000000';
  const gradient = ov.dialogueGradient ?? false;

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-edge/50">
      <span className="label">대사창 · 폰트 (인게임)</span>
      <FontControls />
      <label className="flex items-center gap-2 text-[11px] text-gray-400">
        <span className="w-20 shrink-0">창 색·불투명</span>
        <input type="color" value={boxColor} onChange={(e) => setOv({ dialogueBoxColor: e.target.value })} className="w-6 h-6 rounded border border-edge bg-transparent shrink-0" title="대사창·선택지 배경색(기본 검정)" />
        <input
          type="range"
          min={0}
          max={0.6}
          step={0.05}
          value={opacity}
          onChange={(e) => setOv({ dialogueOpacity: Number(e.target.value) })}
          className="flex-1"
        />
        <span className="w-9 text-right">{Math.round(opacity * 100)}%</span>
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <input
          type="checkbox"
          checked={gradient}
          onChange={(e) => setOv({ dialogueGradient: e.target.checked })}
        />
        대사창 그라데이션 (투명 · 위로 사라짐)
        <span className="text-[10px] text-gray-500">— 단색 박스 대신 시네마틱. 위 불투명도가 하단 진하기.</span>
      </label>
      <div className="flex items-center gap-3 text-[11px] text-gray-400">
        <label className="flex items-center gap-1.5">
          본문색
          <input type="color" value={textColor} onChange={(e) => setOv({ textColor: e.target.value })} className="w-6 h-6 rounded border border-edge bg-transparent" />
        </label>
        <label className="flex items-center gap-1.5">
          이름색
          <input type="color" value={nameColor} onChange={(e) => setOv({ nameColor: e.target.value })} className="w-6 h-6 rounded border border-edge bg-transparent" />
        </label>
      </div>
      <div className="flex items-center gap-3 text-[11px] text-gray-400">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={outline} onChange={(e) => setOv({ outline: e.target.checked })} />
          글자 외곽선
        </label>
        {outline && (
          <label className="flex items-center gap-1.5">
            외곽선색
            <input type="color" value={outlineColor} onChange={(e) => setOv({ outlineColor: e.target.value })} className="w-6 h-6 rounded border border-edge bg-transparent" />
          </label>
        )}
        {(ov.dialogueBoxColor ||
          ov.dialogueOpacity != null ||
          ov.textColor ||
          ov.nameColor ||
          ov.outline ||
          ov.outlineColor ||
          ov.bodyFontId ||
          ov.nameFontId) && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600 ml-auto" onClick={() => update({ guiOverrides: undefined })}>
            기본값
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-500 leading-snug">
        흰 글자 + 검정 외곽선이 배경 위에서 잘 읽혀요. 그라데이션 대사창은 <b className="text-gray-400">35~45%</b>가
        대비 좋고(단색 박스면 더 낮아도 OK). 빌드/내보내기에 반영됩니다.
      </p>
    </div>
  );
}

const SWATCHES: { key: keyof GuiTheme; label: string }[] = [
  { key: 'accent', label: '강조' },
  { key: 'bgTop', label: '배경' },
  { key: 'dialogueBox', label: '대사창' },
  { key: 'dialogueText', label: '대사글' },
  { key: 'nameText', label: '이름' },
];

function ThemePreview({ theme }: { theme: GuiTheme }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let alive = true;
    let made: string | undefined;
    canvasMenuArt(theme, 384, 216, 'main').then((blob) => {
      if (!alive) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [theme]);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative rounded-md overflow-hidden border border-edge aspect-video bg-ink">
        {url && <img src={url} alt="테마 미리보기" className="w-full h-full object-cover" />}
        {/* 메뉴 레이아웃 근사: 좌측 내비 + 우하단 타이틀 */}
        <div
          className="absolute inset-y-0 left-0 w-[30%] flex flex-col justify-center gap-0.5 px-2"
          style={{ background: theme.menuOverlay }}
        >
          {['시작', '불러오기', '설정', '종료'].map((t, i) => (
            <span key={t} className="text-[8px] font-semibold leading-tight" style={{ color: i === 0 ? theme.accent : theme.interfaceText }}>
              {t}
            </span>
          ))}
        </div>
        <span className="absolute bottom-1 right-2 text-[11px] font-bold" style={{ color: theme.accent }}>
          {useStore.getState().project.title}
        </span>
      </div>
      <div className="flex gap-1">
        {SWATCHES.map((s) => (
          <div key={s.key} className="flex-1 flex flex-col items-center gap-0.5">
            <span className="w-full h-4 rounded border border-edge/50" style={{ background: theme[s.key] as string }} />
            <span className="text-[8px] text-gray-500">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
