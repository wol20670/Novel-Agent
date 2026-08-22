import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { downloadExcelTemplate, downloadTextTemplate } from '../template';
import { translateModeOf } from '../types';
import { getSubscription, type Subscription } from '../generators/voice/typecastProvider';
import { parseText, parseWorkbook } from '../parser';
import { isQaWorkbook } from '../generators/translate/qaWorkbook';
import type { BuildResult } from '../parser';
import { previewMerge, type AnalyzeMode } from '../project/mergeScenes';
import Spinner from './Spinner';
import StoryTextarea from './left/StoryInput';
import AnalyzeMergeModal from './left/AnalyzeMergeModal';
import CollabSettings from './left/CollabSettings';
import ProjectMeta from './left/ProjectMeta';
import Divider from './left/Divider';

export default function LeftPanel() {
  // project 전체 대신 실제로 쓰는 두 필드만 — 1023줄짜리 컴포넌트라 whole-project 셀렉터로 두면
  // 무관한 필드(대사 편집 등) 변경에도 이 패널 전체(+4개 하위 섹션)가 리렌더된다. rawInput 은
  // 아래 StoryTextarea 로 격리했으므로 여기선 구독하지 않는다(분석 버튼은 클릭 시점에 getState()로
  // 직접 읽는다 — 렌더 목적이 아니라 "지금 값"만 필요).
  const scenes = useStore((s) => s.project.scenes);
  const translateModeRaw = useStore((s) => s.project.translateMode);
  const applyAnalysis = useStore((s) => s.applyAnalysis);
  const loadSample = useStore((s) => s.loadSample);
  const save = useStore((s) => s.save);
  const resetAll = useStore((s) => s.resetAll);
  const clearGenerated = useStore((s) => s.clearGeneratedAssets);
  const openaiKey = useStore((s) => s.openaiKey);
  const setOpenaiKey = useStore((s) => s.setOpenaiKey);
  const typecastKey = useStore((s) => s.typecastKey);
  const setTypecastKey = useStore((s) => s.setTypecastKey);
  const translateMode = translateModeOf({ translateMode: translateModeRaw });
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
    () => (pending ? previewMerge(scenes, pending.parsed.scenes) : null),
    [pending, scenes],
  );

  /** 파싱 결과를 받아 기존 장면 유무에 따라 곧장 반영하거나(0개) 모달로 방식을 고른다. */
  const startAnalysis = (parsed: BuildResult, rawText?: string) => {
    if (parsed.scenes.length === 0) {
      applyAnalysis(parsed, 'replace', rawText); // 스토어가 빈 결과 안내 토스트를 띄운다
      return;
    }
    if (scenes.length === 0) {
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
      // QA 검수 엑셀을 여기에 잘못 넣는 사고를 막는다 — 그 파일의 A열은 화자가 아니라 한국어 **대사**라
      // 그대로 분석하면 대사마다 새 캐릭터가 생긴 쓰레기 대본이 병합 미리보기에 올라온다.
      // ⚠️ 판별은 `_naqa` 표식 **하나**만 본다 — 시트 이름·A/B/C 헤더·파일명 같은 휴리스틱을 쓰지 말 것.
      //    표식만 맞으면(버전이 낯설어도) 일반 대본 파서로 넘기지 않는다. 실제 버전 거절은 QA 반영 쪽
      //    readQaWorkbook 이 담당한다. 표식이 없으면 아래 기존 흐름이 그대로 돈다.
      const XLSX = await import('xlsx'); // 지연 로딩 유지(초기 번들에 넣지 않는다)
      if (isQaWorkbook(XLSX, XLSX.read(buf, { type: 'array' }))) {
        setToast('이 파일은 QA 검수용 엑셀입니다 — 장면 탭의 "📥 QA 반영"으로 가져오세요.');
        return;
      }
      // parseWorkbook 이 한 번 더 파싱하지만(중복 parse) 대본 업로드는 빈도가 낮아 감수한다 —
      // 이걸 아끼려고 parseWorkbook 시그니처를 바꾸거나 파싱 결과를 넘기지 말 것.
      const parsed = await parseWorkbook(buf);
      startAnalysis(parsed);
    } catch (err) {
      setToast('엑셀 파싱에 실패했습니다: ' + (err as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = ''; // 같은 파일 재선택 허용
    }
  };

  const onAnalyzeTextClick = () => {
    // 렌더용 구독이 아니라 클릭 시점의 "지금 값"만 필요 — rawInput 은 StoryTextarea 가 구독하고
    // 여기선 getState() 로 한 번만 읽는다(구독하면 매 키 입력마다 이 컴포넌트도 리렌더됨).
    const rawInput = useStore.getState().project.rawInput;
    startAnalysis(parseText(rawInput), rawInput);
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

        <StoryTextarea />
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

        {/* 자동 번역 모드 — off(기본)/fast/quality. off 가 아니면 장면 탭에 "누락 번역 채우기" 버튼이 뜬다. */}
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
              장면 탭 상단의 <b>🌐 누락 번역 채우기</b> 버튼으로 실행됩니다 — 기존 번역은 덮어쓰지 않고 빈 번역만
              채웁니다(OpenAI 키 필요). 버튼 옆에 남은 누락 개수가 표시됩니다.
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
        prevCount={scenes.length}
        onMerge={() => resolveMode('merge')}
        onAppend={() => resolveMode('append')}
        onReplace={() => resolveMode('replace')}
        onCancel={() => setPending(null)}
      />
    )}
    </>
  );
}
