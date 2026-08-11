import { useStore } from '../../store';
import { resolveTheme, DEFAULT_GRADIENT_OPACITY, DEFAULT_GRADIENT_HEIGHT } from '../../renpy/gui';
import type { GuiTheme } from '../../renpy/gui';
import { DEFAULT_FONT, useFontCatalog, useFontFamily } from '../fontHooks';
import type { FontPreset } from '../fontHooks';
import Spinner from '../Spinner';
import { useAssetUrl } from '../useAssetUrl';

export default function ThemeStudio() {
  // project 전체 대신 실제로 쓰는 3개 필드만(narrow) — 아래 참고.
  const genre = useStore((s) => s.project.genre);
  const guiTheme = useStore((s) => s.project.guiTheme);
  const mood = useStore((s) => s.project.mood);
  const update = useStore((s) => s.updateProjectMeta);
  const generateAiTheme = useStore((s) => s.generateAiTheme);
  const clearAiTheme = useStore((s) => s.clearAiTheme);
  const busy = useStore((s) => s.aiThemeBusy);
  const openaiKey = useStore((s) => s.openaiKey);

  const theme = resolveTheme(genre, guiTheme);
  const custom = !!guiTheme;

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
          value={mood ?? ''}
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
      <p className="text-[10px] text-gray-500 leading-snug">
        타이틀 배경은 <b className="text-gray-400">에셋 탭 → 🎬 타이틀 배경</b>에서 업로드합니다.
      </p>

      <DialogueGuiControls />
    </div>
  );
}

const FONT_PREVIEW_TEXT = '다람쥐 헌 쳇바퀴에 타고파 1234';
const INHERIT_BODY = '__inherit__'; // 이름 폰트 select 의 "본문과 동일" 옵션 값(빈 문자열 대신 명시적 sentinel)

/** 본문(대사)/이름(화자) 폰트 선택 — GCS 매니페스트(src/fonts/fontCatalog.ts)에서 목록을 받아온다. */
function FontControls() {
  // 이 컴포넌트가 실제로 읽는 건 guiOverrides 하나뿐 — project 전체를 구독할 이유가 없다.
  const guiOverrides = useStore((s) => s.project.guiOverrides);
  const update = useStore((s) => s.updateProjectMeta);
  const ov = guiOverrides ?? {};
  const setOv = (patch: Partial<NonNullable<typeof guiOverrides>>) =>
    update({ guiOverrides: { ...(guiOverrides ?? {}), ...patch } });

  const { grouped, customAvailable } = useFontCatalog();

  const bodyId = ov.bodyFontId ?? DEFAULT_FONT.id;
  const nameId = ov.nameFontId; // undefined = "본문과 동일"
  const bodyFamily = useFontFamily(bodyId);
  const nameFamily = useFontFamily(nameId ?? bodyId);

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
  // project 전체 대신 실제로 쓰는 3개 필드만.
  const genre = useStore((s) => s.project.genre);
  const guiTheme = useStore((s) => s.project.guiTheme);
  const guiOverrides = useStore((s) => s.project.guiOverrides);
  const update = useStore((s) => s.updateProjectMeta);
  const theme = resolveTheme(genre, guiTheme);
  const ov = guiOverrides ?? {};
  const setOv = (patch: Partial<NonNullable<typeof guiOverrides>>) =>
    update({ guiOverrides: { ...(guiOverrides ?? {}), ...patch } });

  const boxColor = ov.dialogueBoxColor ?? '#000000';
  const opacity = ov.dialogueOpacity ?? 0.4; // 내보내기(buildZip) 기본값과 일치시킴
  const textColor = ov.textColor ?? theme.dialogueText;
  const nameColor = ov.nameColor ?? theme.nameText;
  const outline = ov.outline ?? false;
  const outlineColor = ov.outlineColor ?? '#000000';
  const gradient = ov.dialogueGradient ?? false;
  const gradientOpacity = ov.dialogueGradientOpacity ?? DEFAULT_GRADIENT_OPACITY;
  const gradientHeight = ov.dialogueGradientHeight ?? DEFAULT_GRADIENT_HEIGHT;
  const characterScale = ov.characterScale ?? 1.0;

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-edge/50">
      <span className="label">대사창 · 폰트 (인게임)</span>
      <FontControls />
      <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
        <input
          type="checkbox"
          checked={gradient}
          onChange={(e) => setOv({ dialogueGradient: e.target.checked })}
        />
        대사창 그라데이션 (투명 · 위로 사라짐)
        <span className="text-[10px] text-gray-500">— 단색 박스 대신 시네마틱, 아래로 갈수록 어두워짐.</span>
      </label>
      {gradient ? (
        <>
          <label className="flex items-center gap-2 text-[11px] text-gray-400">
            <span className="w-20 shrink-0">창 색</span>
            <input type="color" value={boxColor} onChange={(e) => setOv({ dialogueBoxColor: e.target.value })} className="w-6 h-6 rounded border border-edge bg-transparent shrink-0" title="대사창·선택지 배경색(기본 검정)" />
          </label>
          <label className="flex items-center gap-2 text-[11px] text-gray-400">
            <span className="w-20 shrink-0">하단 진하기</span>
            <input
              type="range"
              min={0.3}
              max={0.85}
              step={0.05}
              value={gradientOpacity}
              onChange={(e) => setOv({ dialogueGradientOpacity: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="w-9 text-right">{Math.round(gradientOpacity * 100)}%</span>
          </label>
          <label className="flex items-center gap-2 text-[11px] text-gray-400">
            <span className="w-20 shrink-0">페이드 높이</span>
            <input
              type="range"
              min={0.25}
              max={0.65}
              step={0.05}
              value={gradientHeight}
              onChange={(e) => setOv({ dialogueGradientHeight: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="w-9 text-right">{Math.round(gradientHeight * 100)}%</span>
          </label>
        </>
      ) : (
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
      )}
      <label className="flex items-center gap-2 text-[11px] text-gray-400">
        <span className="w-20 shrink-0">캐릭터 크기</span>
        <input
          type="range"
          min={0.8}
          max={1.6}
          step={0.05}
          value={characterScale}
          onChange={(e) => setOv({ characterScale: Number(e.target.value) })}
          className="flex-1"
        />
        <span className="w-9 text-right">{characterScale.toFixed(2)}배</span>
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
          ov.nameFontId ||
          ov.characterScale != null ||
          ov.dialogueGradientOpacity != null ||
          ov.dialogueGradientHeight != null) && (
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
  // 업로드한 메인 메뉴 배경이 있으면 그것을, 없으면 테마색 그라데이션만 미리 보여준다
  // (앱은 메뉴 아트를 더 이상 생성하지 않음 — 실제 업로드는 에셋 탭에서 한다).
  const mainArtId = useStore((s) => s.project.menuArt?.main);
  const url = useAssetUrl(mainArtId);
  // 렌더 중 getState() 로 읽으면 title 이 바뀌어도 이 컴포넌트가 다시 그려질 이유가 없어(다른 구독이
  // 없으면) 미리보기 글자가 갱신되지 않는다 — 필드 단위로 구독해야 제목을 바꿀 때마다 따라온다.
  const title = useStore((s) => s.project.title);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="relative rounded-md overflow-hidden border border-edge aspect-video bg-ink"
        style={url ? undefined : { background: `linear-gradient(to bottom, ${theme.bgTop}, ${theme.bgBottom})` }}
      >
        {url && <img src={url} alt="타이틀 배경 미리보기" className="w-full h-full object-cover" />}
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
          {title}
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
