import { useRef, useState } from 'react';
import { useStore } from '../store';
import { downloadExcelTemplate, downloadTextTemplate } from '../template';

export default function LeftPanel() {
  const project = useStore((s) => s.project);
  const setRawInput = useStore((s) => s.setRawInput);
  const analyzeText = useStore((s) => s.analyzeText);
  const analyzeExcel = useStore((s) => s.analyzeExcel);
  const loadSample = useStore((s) => s.loadSample);
  const save = useStore((s) => s.save);
  const resetAll = useStore((s) => s.resetAll);
  const apiKey = useStore((s) => s.apiKey);
  const setApiKey = useStore((s) => s.setApiKey);
  const exportProject = useStore((s) => s.exportProject);
  const importProject = useStore((s) => s.importProject);

  const fileRef = useRef<HTMLInputElement>(null);
  const projFileRef = useRef<HTMLInputElement>(null);
  const [showKey, setShowKey] = useState(false);

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
          <button className="btn-ghost" onClick={onReset} title="모두 초기화">
            ⟲
          </button>
        </div>
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

      {/* OpenAI 키 */}
      <section className="flex flex-col gap-2">
        <h2 className="section-title">OpenAI 이미지 API · 선택</h2>
        <p className="text-[11px] text-gray-500 leading-snug">
          키가 있으면 <code className="text-accent">gpt-image-1</code>로 실제 배경을 생성합니다. 없으면 Canvas
          임시 배경으로 오프라인 동작합니다. <b className="text-gray-400">키는 이 브라우저에만 저장</b>되며 외부로 전송되지 않습니다.
        </p>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            className="field flex-1"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <button className="btn-ghost" onClick={() => setShowKey((v) => !v)}>
            {showKey ? '숨김' : '표시'}
          </button>
        </div>
        <div
          className={`text-[11px] flex items-center gap-1.5 ${apiKey ? 'text-emerald-400' : 'text-gray-500'}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${apiKey ? 'bg-emerald-400' : 'bg-gray-600'}`} />
          {apiKey ? '키 저장됨 · OpenAI 모드' : '키 없음 · 오프라인(Canvas) 모드'}
        </div>
      </section>
    </div>
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
    </section>
  );
}
