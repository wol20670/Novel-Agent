import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { downloadExcelTemplate, downloadTextTemplate } from '../template';
import { GENRE_OPTIONS, DEFAULT_GENRE, resolveTheme } from '../renpy/gui';
import type { GenreId, GuiTheme } from '../renpy/gui';
import { canvasMenuArt } from '../generators/image/canvasMenu';
import Spinner from './Spinner';
import UploadButton from './UploadButton';

export default function LeftPanel() {
  const project = useStore((s) => s.project);
  const setRawInput = useStore((s) => s.setRawInput);
  const analyzeText = useStore((s) => s.analyzeText);
  const analyzeExcel = useStore((s) => s.analyzeExcel);
  const loadSample = useStore((s) => s.loadSample);
  const save = useStore((s) => s.save);
  const resetAll = useStore((s) => s.resetAll);
  const clearGenerated = useStore((s) => s.clearGeneratedAssets);
  const apiKey = useStore((s) => s.apiKey);
  const setApiKey = useStore((s) => s.setApiKey);
  const openaiKey = useStore((s) => s.openaiKey);
  const setOpenaiKey = useStore((s) => s.setOpenaiKey);
  const promptLang = useStore((s) => s.promptLang);
  const setPromptLang = useStore((s) => s.setPromptLang);
  const exportProject = useStore((s) => s.exportProject);
  const importProject = useStore((s) => s.importProject);
  const folderSupported = useStore((s) => s.folderSupported);
  const archiveFolderName = useStore((s) => s.archiveFolderName);
  const archiveReady = useStore((s) => s.archiveReady);
  const connectArchive = useStore((s) => s.connectArchive);
  const verifyArchive = useStore((s) => s.verifyArchive);
  const disconnectArchive = useStore((s) => s.disconnectArchive);

  const fileRef = useRef<HTMLInputElement>(null);
  const projFileRef = useRef<HTMLInputElement>(null);
  const [showKey, setShowKey] = useState(false);
  const [showOaiKey, setShowOaiKey] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    analyzeExcel(buf);
    if (fileRef.current) fileRef.current.value = '';
  };

  const onProjFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importProject(file);
    if (projFileRef.current) projFileRef.current.value = '';
  };

  const onReset = () => {
    if (confirm('모든 장면·에셋·저장 데이터를 지웁니다. 계속할까요?')) resetAll();
  };

  const onClearGenerated = () => {
    if (
      confirm(
        '생성된 배경·캐릭터 입화·CG·BGM·메뉴 이미지를 모두 삭제합니다.\n(대본·캐릭터 설정·표정/의상 정의·그림체 참조는 유지)\n계속할까요?',
      )
    )
      clearGenerated();
  };

  return (
    <div className="p-3.5 flex flex-col gap-5 text-sm">
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
          title="대본·캐릭터 설정·그림체 참조는 두고, 생성된 배경·입화·CG·BGM·메뉴 이미지만 삭제"
        >
          🧹 생성물 초기화 (대본·설정 유지)
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
        <button className="btn-primary" onClick={() => analyzeText(project.rawInput)}>
          🔍 분석
        </button>
      </section>

      <Divider />
      <ProjectMeta />
      <Divider />

      {/* NovelAI 키 */}
      <section className="flex flex-col gap-2">
        <h2 className="section-title">NovelAI 이미지 API · 선택</h2>
        <p className="text-[11px] text-gray-500 leading-snug">
          키가 있으면 <code className="text-accent">NovelAI Diffusion V4.5</code>로 실제 이미지를 생성합니다(서브컬쳐/애니
          일러스트 고품질). 없으면 Canvas 임시 이미지로 오프라인 동작합니다. NovelAI 계정 설정의{' '}
          <b className="text-gray-400">persistent token(pst-…)</b>을 넣으세요. <b className="text-gray-400">키는 이
          브라우저에만 저장</b>되며 외부로 전송되지 않습니다.
        </p>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            className="field flex-1"
            placeholder="pst-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button className="btn-ghost" onClick={() => setShowKey((v) => !v)}>
            {showKey ? '숨김' : '표시'}
          </button>
        </div>
        <div
          className={`text-[11px] flex items-center gap-1.5 ${apiKey ? 'text-emerald-600' : 'text-gray-500'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${apiKey ? 'bg-emerald-400' : 'bg-gray-600'}`} />
          {apiKey ? '키 저장됨 · NovelAI 모드' : '키 없음 · 오프라인(Canvas) 모드'}
        </div>

        {/* 프롬프트 입력 언어 + OpenAI 키(한국어 변환·테마용) */}
        <div className="flex flex-col gap-2 pt-1 border-t border-edge/50">
          <div className="flex flex-col gap-1">
            <span className="label">프롬프트 입력 언어</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPromptLang('ko')}
                title="한국어로 적으면 gpt-4o-mini 가 영문 단부루 태그로 변환 (OpenAI 키 필요)"
                className={`flex-1 text-[11px] py-1 rounded border transition-colors ${
                  promptLang === 'ko' ? 'border-accent text-accent bg-accent/10' : 'border-edge text-gray-500 hover:text-gray-300'
                }`}
              >
                🇰🇷 한국어 → 영문 변환
              </button>
              <button
                onClick={() => setPromptLang('en')}
                title="영어 단부루 태그를 변환 없이 바로 NovelAI 로 전송 (OpenAI 키 불필요)"
                className={`flex-1 text-[11px] py-1 rounded border transition-colors ${
                  promptLang === 'en' ? 'border-accent text-accent bg-accent/10' : 'border-edge text-gray-500 hover:text-gray-300'
                }`}
              >
                🔤 영어 태그 그대로
              </button>
            </div>
            <p className="text-[10px] text-gray-500 leading-snug">
              {promptLang === 'ko'
                ? '한국어로 적으면 gpt-4o-mini 가 단부루 영문 태그로 변환합니다(아래 OpenAI 키 필요 · 장당 ~$0.0002 · 캐릭터당 1회 캐시).'
                : '영어 단부루 태그를 변환 없이 바로 NovelAI 로 보냅니다(GPT 미사용 · OpenAI 키 불필요). 예: 1girl, solo, silver hair, school uniform'}
              {' '}품질 프리픽스·감정·구조 태그는 어느 쪽이든 자동 부착됩니다.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <span className="label">OpenAI 키 · 선택 (한국어 변환 · AI 테마)</span>
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
              className={`text-[11px] flex items-center gap-1.5 ${
                promptLang === 'ko' && openaiKey ? 'text-emerald-600' : 'text-gray-500'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  promptLang === 'ko' && openaiKey ? 'bg-emerald-400' : 'bg-gray-600'
                }`}
              />
              {promptLang === 'en'
                ? '영어 모드 · 변환 안 함'
                : openaiKey
                  ? '한국어 → 영문 변환 ON'
                  : '변환 OFF · 한국어 원문 전달 (키 입력 권장)'}
            </div>
          </div>
        </div>

        <NaiModeSelector />
      </section>

      {/* 이미지 보관 폴더 */}
      {folderSupported && (
        <section className="flex flex-col gap-2">
          <h2 className="section-title">📁 이미지 보관 폴더 · 선택</h2>
          <p className="text-[11px] text-gray-500 leading-snug">
            폴더를 연결하면 <b className="text-gray-400">AI 로 생성한 배경·캐릭터 입화</b>가 생성될 때마다 그
            폴더에 자동 저장됩니다(<code className="text-accent">backgrounds/</code>,{' '}
            <code className="text-accent">characters/</code> 로 분류, 타임스탬프 파일명). 재생성해도 이전
            이미지가 폴더에 그대로 남아 나중에 다시 고를 수 있습니다.
          </p>
          {archiveFolderName ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className={`text-[11px] flex items-center gap-1.5 flex-1 min-w-0 ${archiveReady ? 'text-emerald-600' : 'text-amber-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${archiveReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="truncate">보관 중: {archiveFolderName}</span>
                </div>
                <button className="btn-ghost text-[11px]" onClick={connectArchive} title="다른 폴더로 변경">
                  변경
                </button>
                <button className="btn-ghost text-[11px] text-gray-500" onClick={disconnectArchive}>
                  해제
                </button>
              </div>
              {!archiveReady && (
                <button
                  className="btn-primary text-[11px]"
                  onClick={verifyArchive}
                  title="리로드 후 폴더 쓰기 권한이 해제됨 — 클릭해 다시 허용해야 저장됩니다"
                >
                  ⚠️ 폴더 권한 허용 (저장 활성화)
                </button>
              )}
            </div>
          ) : (
            <button className="btn-ghost" onClick={connectArchive}>
              📂 보관 폴더 연결
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-edge/60" />;
}

const NAI_MODE_OPTS: { key: 'free' | 'high'; label: string; hint: string }[] = [
  { key: 'free', label: '무료', hint: 'Opus 무제한 무료 (≤1MP: 832×1216 / 1216×832)' },
  { key: 'high', label: '고품질', hint: '큰 해상도(1024×1536 등)로 더 선명 · Anlas 소모' },
];

/** NovelAI 생성 모드 선택 — 무료(Opus 무제한) / 고품질(큰 해상도, Anlas). 모든 생성에 적용. */
function NaiModeSelector() {
  const mode = useStore((s) => s.naiMode);
  const setMode = useStore((s) => s.setNaiMode);
  return (
    <div className="flex flex-col gap-1">
      <span className="label">생성 모드</span>
      <div className="flex gap-1">
        {NAI_MODE_OPTS.map((o) => (
          <button
            key={o.key}
            onClick={() => setMode(o.key)}
            title={o.hint}
            className={`flex-1 text-[11px] py-1 rounded border transition-colors ${
              mode === o.key
                ? 'border-accent text-accent bg-accent/10'
                : 'border-edge text-gray-500 hover:text-gray-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-500 leading-snug">
        {NAI_MODE_OPTS.find((o) => o.key === mode)?.hint}. <b className="text-gray-400">무료</b>로 구성·일관성을
        확인하고, 최종본만 <b className="text-gray-400">고품질</b>로 재생성하면 Anlas 를 아낄 수 있어요.
        (스프라이트 누끼는 Director 도구라 소량 Anlas 가 들 수 있습니다.)
      </p>
    </div>
  );
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
  const generateMenuArt = useStore((s) => s.generateMenuArt);
  const clearMenuArt = useStore((s) => s.clearMenuArt);
  const busy = useStore((s) => s.aiThemeBusy);
  const busyMenuMain = useStore((s) => s.busy['menu:main']);
  const busyMenuGame = useStore((s) => s.busy['menu:game']);
  const apiKey = useStore((s) => s.apiKey);

  const theme = resolveTheme(project.genre, project.guiTheme);
  const custom = !!project.guiTheme;
  // 타이틀 합성에 참조할 수 있는 후보: 기본 입화 있는 캐릭터 / 생성된 배경.
  const refChars = project.characters.filter((c) => c.expressions['기본']);
  const refBgKeys = [
    ...new Set(
      project.scenes
        .filter((s) => s.backgroundAssetId)
        .map((s) => (s.background || s.title).trim()),
    ),
  ];
  const [menuCharRef, setMenuCharRef] = useState('');
  const [menuBgRef, setMenuBgRef] = useState('');
  const menuRefOpts = { charName: menuCharRef || undefined, bgKey: menuBgRef || undefined };

  return (
    <div className="rounded-lg border border-accent/30 bg-accent2/5 p-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-accent">✨ AI 테마 스튜디오</span>
        <span className="text-[10px] text-gray-500">{apiKey ? 'AI 모드' : '오프라인 모드'}</span>
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
        <span className="label">타이틀·메뉴 배경 (AI 생성 / 직접 업로드)</span>
        {(refChars.length > 0 || refBgKeys.length > 0) && (
          <div className="flex gap-1.5">
            <select
              className="field text-[11px] !py-1 flex-1 min-w-0"
              value={menuCharRef}
              onChange={(e) => setMenuCharRef(e.target.value)}
              title="타이틀에 등장시킬 메인 캐릭터(기본 입화 기준) — 게임과 어울리게 합성"
            >
              <option value="">참조 캐릭터 없음</option>
              {refChars.map((c) => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
            <select
              className="field text-[11px] !py-1 flex-1 min-w-0"
              value={menuBgRef}
              onChange={(e) => setMenuBgRef(e.target.value)}
              title="타이틀 배경으로 참고할 장면 배경 — 장소·분위기 일치"
            >
              <option value="">참조 배경 없음</option>
              {refBgKeys.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        )}
        <p className="text-[10px] text-gray-500 leading-snug">
          참조를 고르면 그 캐릭터·배경을 소스로 <b className="text-gray-400">게임과 어울리는</b> 타이틀을 합성합니다(없으면 제목·장르·분위기 텍스트로 생성). <b className="text-gray-400">장르·분위기</b>를 먼저 정한 뒤 생성하세요.
        </p>
        <div className="flex gap-2">
          <button
            className="btn-ghost flex-1 text-[11px]"
            disabled={!apiKey || busyMenuMain}
            onClick={() => generateMenuArt('main', menuRefOpts)}
            title={apiKey ? 'NovelAI 로 타이틀(메인 메뉴) 배경 생성' : '이미지 API 키가 필요합니다'}
          >
            {busyMenuMain ? <Spinner /> : project.menuArt?.main ? '✨ 메인 재생성' : '✨ 메인 AI 생성'}
          </button>
          <button
            className="btn-ghost flex-1 text-[11px]"
            disabled={!apiKey || busyMenuGame}
            onClick={() => generateMenuArt('game', menuRefOpts)}
            title={apiKey ? 'NovelAI 로 게임 메뉴 배경 생성' : '이미지 API 키가 필요합니다'}
          >
            {busyMenuGame ? <Spinner /> : project.menuArt?.game ? '✨ 게임 재생성' : '✨ 게임 AI 생성'}
          </button>
        </div>
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

      {!apiKey && (
        <p className="text-[10px] text-gray-500 leading-snug">
          키 없이도 스토리·분위기 기반 변형이 적용됩니다. 위 NovelAI 키를 넣으면 더 정교한 AI 생성으로 업그레이드됩니다.
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
  const opacity = ov.dialogueOpacity ?? 0.15;
  const textColor = ov.textColor ?? theme.dialogueText;
  const nameColor = ov.nameColor ?? theme.nameText;
  const outline = ov.outline ?? false;
  const outlineColor = ov.outlineColor ?? '#000000';

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-edge/50">
      <span className="label">대사창 · 폰트 (인게임)</span>
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
        {(ov.dialogueBoxColor || ov.dialogueOpacity != null || ov.textColor || ov.nameColor || ov.outline || ov.outlineColor) && (
          <button className="text-[10px] text-gray-500 hover:text-rose-600 ml-auto" onClick={() => update({ guiOverrides: undefined })}>
            기본값
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-500 leading-snug">
        흰 글자 + 검정 외곽선 + 낮은 불투명도(10~20%)면 배경 위에서 잘 읽혀요. 빌드/내보내기에 반영됩니다.
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
