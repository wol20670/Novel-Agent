import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { aiConfig } from '../config/aiConfig';
import { supertoneTTS, searchVoices, type SupertoneVoice, type VoiceSettings } from '../generators/voice/supertoneProvider';
import { getClip, putClip, clipKey } from '../generators/voice/auditionCache';
import { LOCALE_LABEL, type Character, type Line, type Locale } from '../types';
import Spinner from './Spinner';
import UploadButton from './UploadButton';
import { useAssetUrl } from './useAssetUrl';

type DialogueLine = Extract<Line, { kind: 'dialogue' }>;

/**
 * Supertone 성우 테스트 패널 — 두 가지 모드로 쓰인다.
 *  - 'line'(기본, SceneCard 🎙): 대사 한 줄용. 감정·속도·억양 등을 바꿔가며 "▶ 생성"하면 그 결과가
 *    **자동으로** 이 대사·이 언어에 바로 적용된다(별도 "적용" 클릭 필요 없음 — 예전엔 생성 결과가
 *    컴포넌트 로컬 state에만 있어서 적용 버튼을 안 누르고 새로고침하면 크레딧 써서 만든 오디오가
 *    그냥 사라지는 문제가 있었음).
 *  - 'character'(AssetsTab 🎤 목소리 설정): 특정 대사가 아니라 캐릭터 프리셋 자체를 고르는 모드.
 *    미리듣기 텍스트를 자유 편집할 수 있고, "생성"은 대사에 적용되지 않는 순수 미리듣기라
 *    같은 설정 조합이면 재생성 없이 캐시를 재생한다(auditionCache — 크레딧 절약).
 * "💾 캐릭터에 저장"은 두 모드 공통, 오디오 자체와는 무관하게 다른 대사를 열 때 프리필되는
 * 보이스 설정 레시피만 남긴다(배치 생성이 이 레시피를 씀).
 */
export default function VoiceLab({
  sceneId,
  lineIndex,
  char,
  line,
  baseLocale,
  mode = 'line',
  onClose,
}: {
  sceneId?: string;
  lineIndex?: number;
  char: Character;
  line?: DialogueLine;
  baseLocale: Locale;
  mode?: 'line' | 'character';
  onClose?: () => void;
}) {
  const supertoneKey = useStore((s) => s.supertoneKey);
  const updateChar = useStore((s) => s.updateCharacter);
  const attachLineVoice = useStore((s) => s.attachLineVoice);
  const detachLineVoice = useStore((s) => s.detachLineVoice);

  // character 모드는 자막 언어와 무관하게 base(원문) 언어 고정 — TTS UI 는 지금은 한국어(base) 전용
  // (내부 함수들은 en/ja 도 받을 수 있게 locale 로 유지, 화면에만 노출 안 함).
  const [lang, setLang] = useState<Locale>(baseLocale);
  const [voiceId, setVoiceId] = useState(char.voice?.voiceId ?? '');
  const [style, setStyle] = useState(char.voice?.style ?? '');
  const [speed, setSpeed] = useState(char.voice?.settings?.speed ?? 1);
  const [pitchShift, setPitchShift] = useState(char.voice?.settings?.pitchShift ?? 0);
  const [pitchVariance, setPitchVariance] = useState(char.voice?.settings?.pitchVariance ?? 1);
  const [textGuidance, setTextGuidance] = useState(char.voice?.settings?.textGuidance ?? 1);

  // character 모드 미리듣기 텍스트 — 이 캐릭터의 첫 단일화자 대사로 프리필, 없으면 예시 문장.
  const project = useStore((s) => s.project);
  const firstLine = (() => {
    for (const sc of project.scenes) {
      for (const l of sc.lines) {
        if (l.kind === 'dialogue' && l.speaker === char.name && !l.members?.length && l.text.trim()) return l.text;
      }
    }
    return '';
  })();
  const [previewText, setPreviewText] = useState(firstLine || '안녕하세요, 만나서 반가워요.');
  const [fromCache, setFromCache] = useState(false);

  const [voices, setVoices] = useState<SupertoneVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>();
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState('');

  // 언마운트·재생성 시 이전 object URL 정리(오디오 영구 저장 안 함 — 첨부 전까지는 순수 테스트).
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  // 무료 샘플 재생(선택한 보이스에 딸린 사전 녹음 미리듣기, 크레딧 0) — <audio> 엘리먼트를 매번
  // 새로 만드는 대신 하나를 재사용한다.
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const playSample = (url: string) => {
    if (!url) return;
    if (!sampleAudioRef.current) sampleAudioRef.current = new Audio();
    sampleAudioRef.current.src = url;
    sampleAudioRef.current.play().catch(() => {});
  };

  const isLineMode = mode === 'line' && !!line;
  const attachedLangs = isLineMode ? (Object.keys(line!.voiceAssetIds ?? {}) as Locale[]) : [];
  const attachedId = isLineMode ? line!.voiceAssetIds?.[lang] : undefined;
  const attachedHere = !!attachedId;
  // 이미 이 언어에 적용된 파일 재생(생성 미리듣기와 별개 — BGM 미리듣기와 동일한 useAssetUrl 패턴).
  const attachedUrl = useAssetUrl(attachedId);

  const selectedVoice = voices.find((v) => v.voiceId === voiceId);
  const bestSample = selectedVoice?.samples.find((s) => s.language === 'ko') ?? selectedVoice?.samples[0];
  const styleOptions = selectedVoice?.styles ?? [];
  const text = isLineMode ? ((lang === baseLocale ? undefined : line!.i18n?.[lang]) ?? line!.text) : previewText;

  const loadVoices = async () => {
    if (!supertoneKey) return;
    setLoadingVoices(true);
    setError('');
    try {
      setVoices(await searchVoices({ language: lang }, supertoneKey));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingVoices(false);
    }
  };

  const settings: VoiceSettings = { speed, pitchShift, pitchVariance, textGuidance };

  const generate = async () => {
    if (!supertoneKey || !voiceId || !sceneId || lineIndex === undefined) return;
    setBusy(true);
    setError('');
    try {
      const result = await supertoneTTS(
        { voiceId, text, language: lang, model: aiConfig.voice.defaultModel, style: style || undefined, settings },
        supertoneKey,
      );
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(result.blob));
      setSeconds(result.seconds);
      // 생성 즉시 이 대사·언어에 자동 적용 — 별도 "적용" 클릭을 기다리다 새로고침으로 날리는 일이
      // 없게(크레딧 써서 만든 오디오라 손실이 특히 아까움).
      await attachLineVoice(sceneId, lineIndex, lang, result.blob, char.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // character 모드 전용 — 대사에 적용하지 않는 순수 미리듣기. 같은 설정 조합(보이스·감정·속도 등
  // + 텍스트)이면 오디션 캐시에서 그대로 재생(크레딧 0), 없을 때만 실제 생성 후 캐싱한다.
  const generatePreview = async () => {
    if (!supertoneKey || !voiceId) return;
    setBusy(true);
    setError('');
    try {
      const key = clipKey({
        voiceId,
        model: aiConfig.voice.defaultModel,
        style: style || '',
        speed,
        pitchShift,
        pitchVariance,
        textGuidance,
        text: previewText,
      });
      const cached = await getClip(key);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (cached) {
        setAudioUrl(URL.createObjectURL(cached));
        setFromCache(true);
      } else {
        const result = await supertoneTTS(
          { voiceId, text: previewText, language: lang, model: aiConfig.voice.defaultModel, style: style || undefined, settings },
          supertoneKey,
        );
        await putClip(key, result.blob).catch(() => {});
        setAudioUrl(URL.createObjectURL(result.blob));
        setSeconds(result.seconds);
        setFromCache(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveToCharacter = () => {
    if (!voiceId) return;
    updateChar(char.name, { voice: { voiceId, style: style || undefined, settings } });
  };

  const attachToLine = async (blob: Blob) => {
    if (!sceneId || lineIndex === undefined) return;
    setAttaching(true);
    try {
      await attachLineVoice(sceneId, lineIndex, lang, blob, char.name);
    } finally {
      setAttaching(false);
    }
  };
  const detachFromLine = async () => {
    if (!sceneId || lineIndex === undefined) return;
    setAttaching(true);
    try {
      await detachLineVoice(sceneId, lineIndex, lang);
    } finally {
      setAttaching(false);
    }
  };

  return (
    <div className="card border-edge p-2.5 mt-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="label">
          {mode === 'character' ? `🎤 ${char.name} 보이스 설정` : `🎙 ${char.name} 보이스 테스트 (Supertone)`}
        </span>
        {!supertoneKey && (
          <span className="text-[10px] text-amber-600">키 없음 — 왼쪽 패널에서 입력하세요</span>
        )}
        {mode === 'character' && onClose && (
          <button className="btn-ghost text-[11px]" onClick={onClose}>
            ✕ 닫기
          </button>
        )}
      </div>
      {isLineMode && attachedLangs.length > 0 && (
        <p className="text-[10px] text-emerald-600">
          ✅ 이 대사에 적용된 음성 언어: {attachedLangs.map((l) => LOCALE_LABEL[l]).join(', ')}
        </p>
      )}
      {isLineMode && attachedUrl && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-11 shrink-0">적용됨</span>
          <audio src={attachedUrl} controls className="flex-1 h-8" />
        </div>
      )}

      {supertoneKey && (
        <>
          {mode === 'character' ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 w-14 shrink-0">미리듣기</span>
              <input
                className="field flex-1 text-xs"
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="미리 들어볼 문장을 입력하세요"
              />
              <button className="btn-ghost text-[11px]" onClick={loadVoices} disabled={loadingVoices}>
                {loadingVoices ? <Spinner /> : '🔍 음성 검색'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 w-11 shrink-0">언어</span>
              <select
                className="field text-xs"
                value={lang}
                onChange={(e) => setLang(e.target.value as Locale)}
              >
                {(Object.keys(LOCALE_LABEL) as Locale[]).map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_LABEL[l]}
                  </option>
                ))}
              </select>
              <button className="btn-ghost text-[11px]" onClick={loadVoices} disabled={loadingVoices}>
                {loadingVoices ? <Spinner /> : '🔍 음성 검색'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 w-11 shrink-0">음성</span>
            {voices.length > 0 ? (
              <select className="field flex-1 text-xs" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                <option value="">선택…</option>
                {voices.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>
                    {v.name}
                    {v.gender ? ` · ${v.gender}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="field flex-1 text-xs"
                placeholder="voice_id 직접 입력(Supertone 콘솔에서 복사)"
                value={voiceId}
                onChange={(e) => setVoiceId(e.target.value)}
              />
            )}
            {bestSample?.url && (
              <button
                className="btn-ghost text-[11px] shrink-0"
                onClick={() => playSample(bestSample.url)}
                title="이 보이스의 사전 녹음 무료 샘플을 재생합니다(크레딧 0)"
              >
                ▶ 무료 샘플
              </button>
            )}
          </div>

          {styleOptions.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 w-11 shrink-0">감정</span>
              <select className="field flex-1 text-xs" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="">기본</option>
                {styleOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <VoiceSlider label="속도" value={speed} min={0.5} max={2} step={0.05} onChange={setSpeed} />
            <VoiceSlider label="음높이" value={pitchShift} min={-24} max={24} step={1} onChange={setPitchShift} />
            <VoiceSlider label="억양변화" value={pitchVariance} min={0} max={2} step={0.1} onChange={setPitchVariance} />
            <VoiceSlider label="감정강도" value={textGuidance} min={0} max={4} step={0.1} onChange={setTextGuidance} />
          </div>

          {error && <p className="text-[11px] text-rose-500">{error}</p>}

          {mode === 'character' ? (
            <div className="flex items-center gap-2">
              <button className="btn-primary text-xs flex-1" disabled={!voiceId || busy} onClick={generatePreview}>
                {busy ? <Spinner /> : '▶ 미리듣기'}
              </button>
              <button
                className="btn-ghost text-xs"
                disabled={!voiceId}
                onClick={() => {
                  saveToCharacter();
                  onClose?.();
                }}
              >
                💾 저장 후 닫기
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button className="btn-primary text-xs flex-1" disabled={!voiceId || busy} onClick={generate}>
                {busy ? <Spinner /> : `▶ ${LOCALE_LABEL[lang]}로 생성(자동 적용)`}
              </button>
              <button className="btn-ghost text-xs" disabled={!voiceId} onClick={saveToCharacter}>
                💾 캐릭터에 저장
              </button>
            </div>
          )}

          {audioUrl && (
            <div className="flex items-center gap-2">
              <audio src={audioUrl} controls autoPlay className="flex-1 h-8" />
              {mode === 'character' ? (
                <span className={`text-[10px] shrink-0 ${fromCache ? 'text-emerald-600' : 'text-gray-500'}`}>
                  {fromCache ? '캐시 재생(크레딧 0)' : `새로 생성 · ${seconds.toFixed(1)}s`}
                </span>
              ) : (
                <span className="text-[10px] text-gray-500 shrink-0">{seconds.toFixed(1)}s</span>
              )}
            </div>
          )}

          {isLineMode && (
            <div className="flex items-center gap-2">
              <UploadButton
                accept="audio/*"
                label={`📁 ${LOCALE_LABEL[lang]} 파일로 적용`}
                className="btn-ghost text-xs shrink-0"
                disabled={attaching}
                onFile={(file) => attachToLine(file)}
                title="이미 생성·다운로드해둔 mp3 등을 재생성 없이 바로 이 대사·언어에 적용(크레딧 소모 없음)"
              />
              {attachedHere && (
                <button className="btn-ghost text-xs shrink-0" disabled={attaching} onClick={detachFromLine}>
                  해제
                </button>
              )}
            </div>
          )}

          <p className="text-[10px] text-gray-500 leading-relaxed">
            {mode === 'character' ? (
              <>
                여기서 생성하는 건 <b className="text-gray-400">미리듣기 전용</b>이며 대사에 적용되지 않습니다(같은
                설정 조합이면 재생성 없이 캐시를 재생 — 크레딧 절약). "💾 저장 후 닫기"를 눌러야 이 보이스
                레시피가 캐릭터에 남고, 그래야 "전체 대사 일괄 생성"이 이 설정을 씁니다.
              </>
            ) : (
              <>
                "▶ 생성"을 누르면 그 결과가 <b className="text-gray-400">자동으로 이 대사·이 언어에
                바로 적용</b>됩니다(별도로 누를 버튼 없음 — Ren'Py 내보내기에 그대로 반영). 다시 생성하면
                직전 것을 교체합니다. "💾 캐릭터에 저장"은 오디오와 무관하게, 다음에 이 캐릭터 대사를 열 때
                프리필되는 보이스 설정 레시피만 남깁니다(전체 대사 일괄 생성이 이 레시피를 씀). 언어별로
                따로 적용되고, 자막 언어와 무관하게 플레이어가 설정 화면에서 음성 언어만 골라 들을 수 있습니다.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

function VoiceSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px] text-gray-500">
      <span className="w-11 shrink-0">{label}</span>
      <input
        type="range"
        className="flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-8 shrink-0 text-right text-gray-400">{value}</span>
    </label>
  );
}
