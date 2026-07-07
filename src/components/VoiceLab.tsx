import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { aiConfig } from '../config/aiConfig';
import { supertoneTTS, searchVoices, type SupertoneVoice, type VoiceSettings } from '../generators/voice/supertoneProvider';
import { LOCALE_LABEL, type Character, type Line, type Locale } from '../types';
import Spinner from './Spinner';

type DialogueLine = Extract<Line, { kind: 'dialogue' }>;

/**
 * 히로인 대사 한 줄의 Supertone 성우 테스트 패널. 감정·속도·억양 등을 바꿔가며 생성·재생만 하고
 * 오디오 자체는 저장하지 않는다 — 마음에 든 설정만 "캐릭터에 저장"으로 남긴다(추후 일괄생성 몫).
 */
export default function VoiceLab({
  char,
  line,
  baseLocale,
}: {
  char: Character;
  line: DialogueLine;
  baseLocale: Locale;
}) {
  const supertoneKey = useStore((s) => s.supertoneKey);
  const updateChar = useStore((s) => s.updateCharacter);

  const [lang, setLang] = useState<Locale>(baseLocale);
  const [voiceId, setVoiceId] = useState(char.voice?.voiceId ?? '');
  const [style, setStyle] = useState(char.voice?.style ?? '');
  const [speed, setSpeed] = useState(char.voice?.settings?.speed ?? 1);
  const [pitchShift, setPitchShift] = useState(char.voice?.settings?.pitchShift ?? 0);
  const [pitchVariance, setPitchVariance] = useState(char.voice?.settings?.pitchVariance ?? 1);
  const [textGuidance, setTextGuidance] = useState(char.voice?.settings?.textGuidance ?? 1);

  const [voices, setVoices] = useState<SupertoneVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>();
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 언마운트·재생성 시 이전 object URL 정리(오디오 영구 저장 안 함).
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const selectedVoice = voices.find((v) => v.voiceId === voiceId);
  const styleOptions = selectedVoice?.styles ?? [];
  const text = (lang === baseLocale ? undefined : line.i18n?.[lang]) ?? line.text;

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
    if (!supertoneKey || !voiceId) return;
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

  return (
    <div className="card border-edge p-2.5 mt-1.5 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="label">🎙 {char.name} 보이스 테스트 (Supertone)</span>
        {!supertoneKey && (
          <span className="text-[10px] text-amber-600">키 없음 — 왼쪽 패널에서 입력하세요</span>
        )}
      </div>

      {supertoneKey && (
        <>
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

          <div className="flex items-center gap-2">
            <button className="btn-primary text-xs flex-1" disabled={!voiceId || busy} onClick={generate}>
              {busy ? <Spinner /> : '▶ 생성·재생'}
            </button>
            <button className="btn-ghost text-xs" disabled={!voiceId} onClick={saveToCharacter}>
              💾 캐릭터에 저장
            </button>
          </div>

          {audioUrl && (
            <div className="flex items-center gap-2">
              <audio src={audioUrl} controls autoPlay className="flex-1 h-8" />
              <span className="text-[10px] text-gray-500 shrink-0">{seconds.toFixed(1)}s</span>
            </div>
          )}

          <p className="text-[10px] text-gray-500 leading-relaxed">
            생성한 음성은 테스트 재생만 하고 저장하지 않습니다. 마음에 든 설정만 "💾 캐릭터에 저장"으로
            남겨두면 다음에 이 캐릭터 대사를 열 때 자동으로 채워집니다.
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
