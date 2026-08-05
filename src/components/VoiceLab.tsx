import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { aiConfig } from '../config/aiConfig';
import {
  typecastTTS,
  getAllVoices,
  recommendVoices,
  type TtsVoice,
  type VoiceSettings,
  type VoiceRecommendation,
} from '../generators/voice/typecastProvider';
import { getClip, putClip, clipKey } from '../generators/voice/auditionCache';
import { LOCALE_LABEL, type Character, type Line, type Locale } from '../types';
import Spinner from './Spinner';
import UploadButton from './UploadButton';
import { useAssetUrl } from './useAssetUrl';

type DialogueLine = Extract<Line, { kind: 'dialogue' }>;

const SMART_EMOTION = 'smart';

// GET /v2/voices 필터 enum(문서 WebFetch 로 확정, 2026-07-24) — 필터 select 옵션 구성용.
const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
];
const AGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'child', label: '아동' },
  { value: 'teenager', label: '청소년' },
  { value: 'young_adult', label: '청년' },
  { value: 'middle_age', label: '중년' },
  { value: 'elder', label: '노년' },
];
// Anime·Game 을 목록 위쪽에 — 비주얼노벨 제작 도구 특성상 가장 자주 찾을 용도라 우선 노출.
const USE_CASE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Anime', label: '애니메이션' },
  { value: 'Game', label: '게임' },
  { value: 'Announcer', label: '아나운서' },
  { value: 'Audiobook', label: '오디오북' },
  { value: 'Conversational', label: '대화' },
  { value: 'Documentary', label: '다큐멘터리' },
  { value: 'E-learning', label: '이러닝' },
  { value: 'Rapper', label: '랩' },
  { value: 'Tiktok/Reels', label: '틱톡/릴스' },
  { value: 'News', label: '뉴스' },
  { value: 'Podcast', label: '팟캐스트' },
  { value: 'Voicemail', label: '보이스메일' },
  { value: 'Ads', label: '광고' },
];
const GENDER_LABEL: Record<string, string> = Object.fromEntries(GENDER_OPTIONS.map((o) => [o.value, o.label]));
const AGE_LABEL: Record<string, string> = Object.fromEntries(AGE_OPTIONS.map((o) => [o.value, o.label]));

/** select 옵션 한 줄 표시용: 이름 · 성별 · 나이 · 용도(첫 항목만, 여러 개면 대표 1개). */
function voiceLabel(v: TtsVoice): string {
  const parts = [v.name];
  if (v.gender) parts.push(GENDER_LABEL[v.gender] ?? v.gender);
  if (v.age) parts.push(AGE_LABEL[v.age] ?? v.age);
  if (v.useCases?.length) parts.push(v.useCases[0]);
  return parts.join(' · ');
}

/**
 * Typecast 성우 테스트 패널 — 두 가지 모드로 쓰인다.
 *  - 'line'(기본, SceneCard 🎙): 대사 한 줄용. 감정·강도·속도 등을 바꿔가며 "▶ 생성"하면 그 결과가
 *    **자동으로** 이 대사·이 언어에 바로 적용된다(별도 "적용" 클릭 필요 없음 — 예전엔 생성 결과가
 *    컴포넌트 로컬 state에만 있어서 적용 버튼을 안 누르고 새로고침하면 크레딧 써서 만든 오디오가
 *    그냥 사라지는 문제가 있었음).
 *  - 'character'(AssetsTab 🎤 목소리 설정): 특정 대사가 아니라 캐릭터 프리셋 자체를 고르는 모드.
 *    미리듣기 텍스트를 자유 편집할 수 있고, "생성"은 대사에 적용되지 않는 순수 미리듣기.
 *    Typecast 보이스 목록엔 사전 녹음 샘플이 없어(응답에 샘플 URL 없음) 미리듣기는 항상 실제
 *    생성(소액 크레딧)이지만, 같은 설정 조합(보이스+모델+감정+강도+텍스트)이면 오디션 캐시에서
 *    그대로 재생해 재청취는 크레딧 0이다.
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
  const typecastKey = useStore((s) => s.typecastKey);
  const updateChar = useStore((s) => s.updateCharacter);
  const attachLineVoice = useStore((s) => s.attachLineVoice);
  const detachLineVoice = useStore((s) => s.detachLineVoice);

  // character 모드는 자막 언어와 무관하게 base(원문) 언어 고정 — TTS UI 는 지금은 한국어(base) 전용
  // (내부 함수들은 en/ja 도 받을 수 있게 locale 로 유지, 화면에만 노출 안 함).
  const [lang, setLang] = useState<Locale>(baseLocale);
  const [voiceId, setVoiceId] = useState(char.voice?.voiceId ?? '');
  // 표시 전용(하위호환 optional) — 카드 요약 칩에 쓰려고 저장 시 이름도 함께 남긴다.
  const [voiceName, setVoiceName] = useState<string | undefined>(char.voice?.voiceName);
  const [model, setModel] = useState(char.voice?.model || aiConfig.voice.defaultModel);
  const [emotion, setEmotion] = useState(char.voice?.emotion ?? SMART_EMOTION);
  const [intensity, setIntensity] = useState(char.voice?.intensity ?? 1);
  const [tempo, setTempo] = useState(char.voice?.settings?.tempo ?? 1);
  const [pitch, setPitch] = useState(char.voice?.settings?.pitch ?? 0);
  const [volume, setVolume] = useState(char.voice?.settings?.volume ?? 100);

  // character 모드 미리듣기 텍스트 — 이 캐릭터의 첫 단일화자 대사로 프리필, 없으면 예시 문장.
  // 이 스캔은 오직 useState 의 "최초 마운트 값"에만 쓰이는데, 예전엔 project 를 구독해두고 매
  // 렌더마다 IIFE 로 전체 장면·라인을 훑었다(패널이 열려 있는 동안 다른 상태 변경에도 반복 실행).
  // 지연 초기화 함수(useState(() => ...))로 바꾸면 마운트 시 딱 1번만 돌고, getState() 로 그
  // 순간의 값만 읽으면 되므로 project 구독 자체가 필요 없어진다(재렌더 유발 요인 하나 제거).
  const [previewText, setPreviewText] = useState(() => {
    for (const sc of useStore.getState().project.scenes) {
      for (const l of sc.lines) {
        if (l.kind === 'dialogue' && l.speaker === char.name && !l.members?.length && l.text.trim()) return l.text;
      }
    }
    return '안녕하세요, 만나서 반가워요.';
  });
  const [fromCache, setFromCache] = useState(false);

  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  // 성별/나이/용도 필터(클라이언트 필터 — 전체 목록은 이미 로드돼 있어 즉시 반응). 직접 입력 토글은
  // 목록 로딩 실패 시 자동으로도 켜진다(폴백).
  const [genderFilter, setGenderFilter] = useState('');
  const [ageFilter, setAgeFilter] = useState('');
  const [useCaseFilter, setUseCaseFilter] = useState('');
  const [manualEntry, setManualEntry] = useState(false);
  // ✨ 자연어 추천 검색(GET v1/voices/recommendations) 상태.
  const [recQuery, setRecQuery] = useState('');
  const [recBusy, setRecBusy] = useState(false);
  const [recResults, setRecResults] = useState<VoiceRecommendation[]>([]);
  const [recError, setRecError] = useState('');
  const [audioUrl, setAudioUrl] = useState<string>();
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState('');

  // 언마운트·재생성 시 이전 object URL 정리(오디오 영구 저장 안 함 — 첨부 전까지는 순수 테스트).
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const isLineMode = mode === 'line' && !!line;
  const attachedLangs = isLineMode ? (Object.keys(line!.voiceAssetIds ?? {}) as Locale[]) : [];
  const attachedId = isLineMode ? line!.voiceAssetIds?.[lang] : undefined;
  const attachedHere = !!attachedId;
  // 이미 이 언어에 적용된 파일 재생(생성 미리듣기와 별개 — BGM 미리듣기와 동일한 useAssetUrl 패턴).
  const attachedUrl = useAssetUrl(attachedId);

  const selectedVoice = voices.find((v) => v.voiceId === voiceId);
  // 감정 프리셋은 "선택한 모델"이 지원하는 것만 보여준다(같은 보이스라도 모델마다 지원 감정이 다를 수 있음).
  const emotionPresets = selectedVoice?.models.find((m) => m.version === model)?.emotions ?? [];
  const text = isLineMode ? ((lang === baseLocale ? undefined : line!.i18n?.[lang]) ?? line!.text) : previewText;

  // 패널이 열리면(마운트 시) 키가 있는 한 자동으로 전체 목록을 로드한다 — 모듈 캐시 히트면 사실상
  // 즉시 반영(getAllVoices). 예전엔 "🔍 음성 검색"을 직접 눌러야만 select 로 바뀌는 수동 구조였는데,
  // 실패하면 "직접 입력"으로 자동 강등해 최소한 voice_id 를 손으로 넣어 계속 진행할 수 있게 한다.
  useEffect(() => {
    if (!typecastKey) return;
    let cancelled = false;
    setLoadingVoices(true);
    setError('');
    getAllVoices(typecastKey)
      .then((list) => {
        if (!cancelled) setVoices(list);
      })
      .catch((e) => {
        if (!cancelled) {
          setError((e as Error).message);
          setManualEntry(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVoices(false);
      });
    return () => {
      cancelled = true;
    };
  }, [typecastKey]);

  // 필터는 서버에 다시 묻지 않고 이미 받아둔 전체 목록을 클라이언트에서 거른다(즉각 반응).
  const filteredVoices = voices.filter(
    (v) =>
      (!genderFilter || v.gender === genderFilter) &&
      (!ageFilter || v.age === ageFilter) &&
      (!useCaseFilter || v.useCases?.includes(useCaseFilter)),
  );

  const pickVoice = (id: string, name: string | undefined) => {
    setVoiceId(id);
    setVoiceName(name);
  };

  // ✨ 자연어 추천 — 결과엔 메타(성별·나이)가 없어(문서 확인) 캐시된 전체 목록과 voiceId 로 조인해 보강.
  const runRecommend = async () => {
    if (!typecastKey || !recQuery.trim()) return;
    setRecBusy(true);
    setRecError('');
    setRecResults([]);
    try {
      const results = await recommendVoices(recQuery.trim(), 5, typecastKey);
      setRecResults(results);
      if (results.length === 0) {
        setRecError('추천 결과가 없습니다 — 영어로 다시 시도해보세요(예: "warm friendly young woman").');
      }
    } catch (e) {
      setRecError(`${(e as Error).message} — 영어 쿼리가 더 정확할 수 있어요.`);
    } finally {
      setRecBusy(false);
    }
  };

  const settings: VoiceSettings = { tempo, pitch, volume };

  const generate = async () => {
    if (!typecastKey || !voiceId || !sceneId || lineIndex === undefined) return;
    setBusy(true);
    setError('');
    try {
      const result = await typecastTTS({ voiceId, text, language: lang, model, emotion, intensity, settings }, typecastKey);
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

  // character 모드 전용 — 대사에 적용하지 않는 순수 미리듣기. 같은 설정 조합(보이스·모델·감정·
  // 강도 + 텍스트)이면 오디션 캐시에서 그대로 재생(크레딧 0), 없을 때만 실제 생성 후 캐싱한다.
  const generatePreview = async () => {
    if (!typecastKey || !voiceId) return;
    setBusy(true);
    setError('');
    try {
      const key = clipKey({ voiceId, model, emotion, intensity, text: previewText });
      const cached = await getClip(key);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (cached) {
        setAudioUrl(URL.createObjectURL(cached));
        setFromCache(true);
      } else {
        const result = await typecastTTS(
          { voiceId, text: previewText, language: lang, model, emotion, intensity, settings },
          typecastKey,
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
    updateChar(char.name, { voice: { voiceId, voiceName, model, emotion, intensity, settings } });
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
    // character 모드는 이제 AssetsTab 이 오버레이 모달로 감싸므로(카드 인라인이 아님) 위쪽 여백이 필요 없다.
    <div
      className={`card border-edge p-2.5 flex flex-col gap-1.5 ${mode === 'line' ? 'mt-1.5' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="label">
          {mode === 'character' ? `🎤 ${char.name} 보이스 설정` : `🎙 ${char.name} 보이스 테스트 (Typecast)`}
        </span>
        {!typecastKey && (
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

      {typecastKey && (
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
              {loadingVoices && <Spinner />}
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
              {loadingVoices && <Spinner />}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 w-11 shrink-0">모델</span>
            <select
              className="field text-xs"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="ssfm-v30">ssfm-v30</option>
              <option value="ssfm-v21">ssfm-v21</option>
            </select>
          </div>

          {!manualEntry && voices.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-500 w-11 shrink-0">필터</span>
              <select className="field text-xs" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
                <option value="">성별 전체</option>
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select className="field text-xs" value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)}>
                <option value="">나이 전체</option>
                {AGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select className="field text-xs" value={useCaseFilter} onChange={(e) => setUseCaseFilter(e.target.value)}>
                <option value="">용도 전체</option>
                {USE_CASE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 w-11 shrink-0">음성</span>
            {manualEntry || (!loadingVoices && voices.length === 0) ? (
              <input
                className="field flex-1 text-xs"
                placeholder="voice_id 직접 입력(tc_/uc_ 접두사, Typecast 대시보드에서 복사)"
                value={voiceId}
                onChange={(e) => pickVoice(e.target.value, undefined)}
              />
            ) : (
              <select
                className="field flex-1 text-xs"
                value={voiceId}
                onChange={(e) => {
                  const id = e.target.value;
                  pickVoice(id, filteredVoices.find((v) => v.voiceId === id)?.name);
                }}
              >
                <option value="">
                  선택…{filteredVoices.length !== voices.length ? ` (필터됨 ${filteredVoices.length}개)` : ''}
                </option>
                {filteredVoices.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>
                    {voiceLabel(v)}
                  </option>
                ))}
              </select>
            )}
            {voices.length > 0 && (
              <button
                type="button"
                className="btn-ghost text-[10px] shrink-0"
                onClick={() => setManualEntry((m) => !m)}
              >
                {manualEntry ? '목록에서 선택' : '직접 입력'}
              </button>
            )}
          </div>

          {/* ✨ 자연어 추천 — "밝고 씩씩한 10대 소녀" 처럼 설명하면 점수순 상위 5개를 보여준다.
              결과 클릭 = 바로 선택(위 select/필터와 무관하게 즉시 voiceId 반영). */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-500 w-11 shrink-0">✨ 추천</span>
              <input
                className="field flex-1 text-xs"
                placeholder="예: 밝고 씩씩한 10대 소녀"
                value={recQuery}
                onChange={(e) => setRecQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runRecommend();
                }}
              />
              <button
                type="button"
                className="btn-ghost text-[11px] shrink-0"
                disabled={!recQuery.trim() || recBusy}
                onClick={runRecommend}
              >
                {recBusy ? <Spinner /> : '검색'}
              </button>
            </div>
            {recError && <p className="text-[10px] text-amber-600">{recError}</p>}
            {recResults.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {recResults.map((r) => {
                  const meta = voices.find((v) => v.voiceId === r.voiceId);
                  const active = voiceId === r.voiceId;
                  return (
                    <button
                      key={r.voiceId}
                      type="button"
                      className={`text-left text-[11px] rounded px-1.5 py-1 border transition-colors ${
                        active ? 'border-accent bg-accent/10 text-accent' : 'border-edge hover:bg-panel2 text-gray-300'
                      }`}
                      onClick={() => {
                        pickVoice(r.voiceId, r.name);
                        setManualEntry(false);
                      }}
                    >
                      {r.name}
                      {meta?.gender ? ` · ${GENDER_LABEL[meta.gender] ?? meta.gender}` : ''}
                      {meta?.age ? ` · ${AGE_LABEL[meta.age] ?? meta.age}` : ''}
                      <span className="text-gray-500"> · 점수 {r.score.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 w-11 shrink-0">감정</span>
            <select className="field flex-1 text-xs" value={emotion} onChange={(e) => setEmotion(e.target.value)}>
              <option value={SMART_EMOTION}>스마트(문맥 자동)</option>
              {emotionPresets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {emotion !== SMART_EMOTION && (
              <VoiceSlider label="강도" value={intensity} min={0} max={2} step={0.1} onChange={setIntensity} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <VoiceSlider label="속도" value={tempo} min={0.5} max={2} step={0.05} onChange={setTempo} />
            <VoiceSlider label="음높이" value={pitch} min={-12} max={12} step={1} onChange={setPitch} />
            <VoiceSlider label="음량" value={volume} min={0} max={200} step={5} onChange={setVolume} />
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
                  {fromCache ? '캐시 재청취(크레딧 0)' : `새로 생성 · ${seconds.toFixed(1)}s`}
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

          {/* 긴 도움말은 접어서 패널 높이를 줄인다(카드가 넘치는 문제의 원인 중 하나였음). */}
          <details className="text-[10px] text-gray-500">
            <summary className="cursor-pointer select-none text-gray-400 hover:text-gray-300">ⓘ 도움말</summary>
            <p className="leading-relaxed mt-1">
              {mode === 'character' ? (
                <>
                  "▶ 미리듣기"는 <b className="text-gray-400">실제 생성</b>이라 텍스트 길이만큼 소액 크레딧이
                  듭니다(Typecast 보이스 목록엔 무료 사전 샘플이 없음). 단, 같은 설정 조합(보이스·모델·감정·
                  강도+텍스트)이면 <b className="text-gray-400">캐시에서 재청취는 크레딧 0</b>입니다. "💾 저장 후
                  닫기"를 눌러야 이 보이스 레시피가 캐릭터에 남고, 그래야 "전체 대사 일괄 생성"이 이 설정을 씁니다.
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
          </details>
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
