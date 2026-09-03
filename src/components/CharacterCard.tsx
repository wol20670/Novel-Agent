// 캐릭터 카드 — AssetsTab.tsx 에서 떼어냈다. 색상/위치/보이스/의상 CRUD/키워드 규칙/이름표 i18n/
// 스프라이트 그리드를 전부 소유하는 최대 하위시스템이라, 이 카드 전용인 SpriteBatchUploadRow·
// ExpressionThumb 도 같은 파일에 둔다(둘 다 다른 곳에서 참조되지 않는다).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  effectiveExpressions,
  baseLocaleOf,
  LOCALE_LABEL,
  characterOutfits,
  isTypecastVoiceId,
  type Expression,
  type Locale,
} from '../types';
import { useAssetUrl } from './useAssetUrl';
import UploadButton from './UploadButton';
import Spinner from './Spinner';
import VoiceLab from './VoiceLab';

export default function CharacterCard({ name, nameLocales }: { name: string; nameLocales: Locale[] }) {
  const c = useStore((s) => s.project.characters.find((x) => x.name === name))!;
  const updateChar = useStore((s) => s.updateCharacter);
  const importSprite = useStore((s) => s.importSprite);
  const clearAll = useStore((s) => s.clearCharacterSprites);
  const addOutfit = useStore((s) => s.addOutfit);
  const removeOutfit = useStore((s) => s.removeOutfit);
  const addOutfitRule = useStore((s) => s.addOutfitRule);
  const removeOutfitRule = useStore((s) => s.removeOutfitRule);
  const setI18nName = useStore((s) => s.setCharacterI18nName);
  const batchVoiceCharacter = useStore((s) => s.batchVoiceCharacter);
  const voiceBatchBusy = useStore((s) => !!s.busy[`batch:voice:${name}`]);
  const exprList = effectiveExpressions(useStore((s) => s.project.expressions));
  // 이름표 번역칸은 자막 언어가(원문 외에) 실제로 켜져 있을 때만 보인다 — 꺼져 있으면 내보내기에
  // 반영될 곳이 없어 입력칸만 있어도 혼란스럽다(자동 번역 켜면 자연히 나타남).
  // nameLocales 는 부모(AssetsTab)가 한 번만 계산해 내려준다(effectiveTextLocales 가 전체 장면을 훑음).
  // project 전체 대신 실제로 쓰는 3개 필드만 — 캐릭터 카드가 많으면(수십 개) whole-project
  // 셀렉터는 무관한 편집(대사 텍스트 등)에도 모든 카드를 리렌더시킨다.
  const outfitRules = useStore((s) => s.project.outfitRules);
  const scenes = useStore((s) => s.project.scenes);
  const baseLocale = useStore((s) => s.project.baseLocale);

  // 현재 편집 중인 의상(기본/추가 의상). 업로드·썸네일이 모두 이 의상을 대상으로 한다.
  const [outfit, setOutfit] = useState('기본');
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [ruleKw, setRuleKw] = useState('');
  const outfits = characterOutfits(c);
  const activeOutfit = outfit === '기본' ? undefined : c.outfits?.find((o) => o.name === outfit);
  const exprStore: Partial<Record<string, string>> = outfit === '기본' ? c.expressions : activeOutfit?.expressions ?? {};
  const hasAny = exprList.some((ex) => exprStore[ex]);
  // 이름이 바뀐 뒤 사라진 의상을 가리키면 기본으로 복귀.
  if (outfit !== '기본' && !activeOutfit) setOutfit('기본');

  // 이 (캐릭터, 의상)에 걸린 배경 키워드 규칙 — outfitRules 는 프로젝트 전체 배열이라
  // 표시는 필터링하되, 삭제/이동은 항상 그 안의 진짜 index 를 써야 한다(필터링된 위치와 다름).
  const allRules = outfitRules ?? [];
  const myRuleIdxs = useMemo(
    () => allRules.reduce<number[]>((acc, r, i) => {
      if (r.charName === name && r.outfit === outfit) acc.push(i);
      return acc;
    }, []),
    [allRules, name, outfit],
  );
  // 키워드별 적용 장면 수(배경 이름에 그 키워드가 포함된 장면) — 반복마다 다시 훑지 않도록 캐싱.
  const ruleCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const idx of myRuleIdxs) {
      const kw = allRules[idx].keyword;
      if (!map.has(kw)) map.set(kw, scenes.filter((sc) => (sc.background ?? '').includes(kw)).length);
    }
    return map;
  }, [myRuleIdxs, allRules, scenes]);

  return (
    <div className="card border-edge p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <input
          type="color"
          value={c.color}
          onChange={(e) => updateChar(name, { color: e.target.value })}
          className="w-6 h-6 rounded border border-edge bg-transparent shrink-0"
        />
        <span className="font-semibold text-sm flex-1 truncate" style={{ color: c.color }}>
          {name}
        </span>
        <UploadButton
          onFile={(f) => importSprite(name, '기본' as Expression, f, outfit)}
          label="🖼 기본 입화 업로드"
          className="btn-primary !px-2 !py-1 text-xs shrink-0"
          title={`${outfit === '기본' ? '' : outfit + ' '}기본 입화 이미지 업로드`}
        />
      </div>
      {/* 좌우 고정 위치 — 헤더 줄에 같이 두면 select 폭 때문에 카드 밖으로 버튼이 밀려나가서
          별도 줄로 뺌(다른 설정 줄들과 같은 레이아웃). */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">📍 위치</span>
        <select
          className="field text-xs"
          value={c.side ?? 'auto'}
          onChange={(e) => updateChar(name, { side: e.target.value as 'left' | 'right' | 'auto' })}
          title="장면 내 좌우 고정 위치(등장 순서와 무관, 혼자 등장하면 항상 중앙)"
        >
          <option value="auto">자동(등장순)</option>
          <option value="left">왼쪽 고정</option>
          <option value="right">오른쪽 고정</option>
        </select>
      </div>
      {/* 보이스 설정 — VoiceLab 을 캐릭터 모드로 열어 대사와 무관하게 보이스 프리셋만 고른다.
          미리듣기는 오디션 캐시를 거치므로 같은 설정을 여러 번 눌러 들어봐도 크레딧이 안 든다. */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">🎤 보이스</span>
        <button className="btn-ghost text-xs" onClick={() => setVoiceSettingsOpen((v) => !v)}>
          목소리 설정
        </button>
        {c.voice ? (
          isTypecastVoiceId(c.voice.voiceId) ? (
            <span className="chip border-edge text-gray-400" title={`voice_id: ${c.voice.voiceId}`}>
              🎤 {c.voice.voiceName ?? c.voice.voiceId} ·{' '}
              {c.voice.emotion && c.voice.emotion !== 'smart' ? c.voice.emotion : '스마트'}
            </span>
          ) : (
            <span
              className="chip border-amber-500/50 text-amber-600"
              title={`voice_id: ${c.voice.voiceId} — 이전 TTS 서비스 프리셋은 그대로 못 씁니다`}
            >
              ⚠️ 재설정 필요(Typecast)
            </span>
          )
        ) : (
          <span className="chip border-amber-500/50 text-amber-600">미설정</span>
        )}
      </div>
      {/* 예전엔 여기 카드 인라인으로 펼쳐져 필터·추천 UI 가 늘면서 카드가 넘쳤다 — 오버레이 모달로
          전환(LeftPanel 의 AnalyzeMergeModal 관용구 재사용: fixed inset-0 z-[60] + 배경 클릭 닫기). */}
      {voiceSettingsOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setVoiceSettingsOpen(false)}
        >
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <VoiceLab
              char={c}
              baseLocale={baseLocaleOf({ baseLocale })}
              mode="character"
              onClose={() => setVoiceSettingsOpen(false)}
            />
          </div>
        </div>
      )}
      {/* 보이스 일괄 생성 — VoiceLab 에서 저장해둔 프리셋(c.voice)으로 이 캐릭터의 모든 대사를
          순차 생성·적용(이미 있는 언어 음성은 건너뜀). 대본이 수백 줄이어도 하나하나 안 해도 됨 —
          마음에 안 드는 특정 줄은 그 대사의 VoiceLab 에서 개별로 다시 만지면 된다. */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">🎙 일괄</span>
        <button
          className="btn-ghost text-xs"
          disabled={!c.voice || voiceBatchBusy}
          onClick={() => batchVoiceCharacter(name, baseLocaleOf({ baseLocale }))}
          title={
            c.voice
              ? `${name} 이 말하는 모든 대사 중 아직 음성 없는 줄을 저장된 보이스 프리셋으로 일괄 생성`
              : '먼저 🎤 목소리 설정에서 보이스를 고르고 "💾 저장 후 닫기"를 누르세요'
          }
        >
          {voiceBatchBusy ? <Spinner /> : '전체 대사 일괄 생성'}
        </button>
      </div>
      {/* 이름표 번역 — 자막 언어를 바꿨을 때 보일 이름. 비우면 원문(대본 그대로) 표시. */}
      {nameLocales.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-gray-500 mr-0.5">🌐 이름표</span>
          {nameLocales.map((loc) => (
            <input
              key={loc}
              className="field text-xs flex-1 min-w-[90px]"
              placeholder={`${LOCALE_LABEL[loc]} 이름 (예: Hanjisu)`}
              value={c.i18nName?.[loc] ?? ''}
              onChange={(e) => setI18nName(name, loc, e.target.value)}
              title={`자막을 ${LOCALE_LABEL[loc]}로 바꿨을 때 표시할 이름표. 비우면 원문("${name}") 그대로 표시됩니다.`}
            />
          ))}
        </div>
      )}

      {/* 의상(복장) 탭 — 대본 #복장 캐릭터:의상 으로 장면별 지정. 의상마다 표정 세트가 따로 업로드된다. */}
      <div className="flex flex-wrap items-center gap-1 mb-1.5">
        <span className="text-[10px] text-gray-500 mr-0.5">👗 의상</span>
        {outfits.map((o) => (
          <button
            key={o}
            onClick={() => setOutfit(o)}
            className={`text-[10px] rounded px-1.5 py-0.5 border ${
              o === outfit ? 'border-accent text-accent bg-accent/10' : 'border-edge text-gray-400'
            }`}
            title={o === '기본' ? '기본 의상' : `의상: ${o}`}
          >
            {o}
          </button>
        ))}
        <button
          className="text-[10px] rounded px-1.5 py-0.5 border border-edge text-gray-500 hover:text-accent"
          title="새 의상 추가(예: 수영복, 교복, 정장)"
          onClick={() => {
            const n = window.prompt('새 의상 이름은? (예: 수영복, 교복, 정장)');
            if (n && n.trim()) {
              addOutfit(name, n.trim());
              setOutfit(n.trim());
            }
          }}
        >
          ＋ 의상
        </button>
      </div>
      {outfit !== '기본' && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <button
            className="text-[10px] text-gray-500 hover:text-rose-600"
            title="이 의상과 그 입화를 삭제"
            onClick={() => {
              if (window.confirm(`'${name}'의 '${outfit}' 의상을 삭제할까요? 이 의상의 입화도 함께 삭제됩니다.`)) {
                removeOutfit(name, outfit);
                setOutfit('기본');
              }
            }}
          >
            의상 삭제
          </button>
        </div>
      )}

      {/* 배경 키워드 규칙 — 장면마다 #복장을 반복해 적지 않아도, 배경 이름에 키워드가 들어가면
          이 의상이 자동으로 입혀진다(resolveOutfit). 위에 있는 규칙이 먼저 적용된다(첫 일치 승). */}
      {outfit !== '기본' && (
        <div className="rounded-lg border border-edge p-2 mb-2 bg-panel2/40">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-[10px] text-gray-500">🏷 이 의상을 입을 배경 키워드</span>
          </div>
          {myRuleIdxs.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {myRuleIdxs.map((idx) => {
                const r = allRules[idx];
                const n = ruleCounts.get(r.keyword) ?? 0;
                return (
                  <span
                    key={idx}
                    className={`chip text-[10px] flex items-center gap-1 ${
                      n === 0 ? 'border-amber-500/50 text-amber-600' : 'border-edge text-gray-400'
                    }`}
                    title={n === 0 ? '이 키워드를 배경 이름에 포함한 장면이 없습니다(오타 확인)' : `${n}개 장면에 적용됨`}
                  >
                    {r.keyword} ×{n}
                    <button className="hover:text-rose-600" onClick={() => removeOutfitRule(idx)} title="규칙 삭제">
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="flex gap-1">
            <input
              className="field text-xs flex-1"
              placeholder="예: 카페, 워터파크"
              value={ruleKw}
              onChange={(e) => setRuleKw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && ruleKw.trim()) {
                  addOutfitRule(name, outfit, ruleKw);
                  setRuleKw('');
                }
              }}
            />
            <button
              className="btn-ghost text-[11px] shrink-0"
              disabled={!ruleKw.trim()}
              onClick={() => {
                addOutfitRule(name, outfit, ruleKw);
                setRuleKw('');
              }}
            >
              ＋ 추가
            </button>
          </div>
          <p className="text-[10px] text-gray-500 leading-snug mt-1">
            배경 이름에 이 키워드가 들어간 장면에 자동으로 입힙니다. 한 배경이 여러 키워드에 걸리면 더 구체적인(긴)
            키워드가 이기고, 아무 규칙에도 안 걸리면 기본 의상입니다. 특정 장면만 다르게 하려면 장면 카드에서 직접
            고르세요.
          </p>
        </div>
      )}

      <p className="text-[10px] text-gray-500 leading-snug mb-2">
        표정 썸네일을 눌러 ChatGPT 등에서 만든 이미지를 하나씩 업로드하세요(투명 배경 PNG 권장).
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {exprList.map((ex) => (
          <ExpressionThumb
            key={`${outfit}:${ex}`}
            name={name}
            expr={ex as Expression}
            outfit={outfit}
            onUpload={(f) => importSprite(name, ex as Expression, f, outfit)}
          />
        ))}
      </div>
      <SpriteBatchUploadRow charName={name} outfit={outfit} />
      <div className="flex items-center gap-3 mt-2">
        {hasAny && outfit === '기본' && (
          <button className="text-[11px] text-gray-500 hover:text-rose-600" onClick={() => clearAll(name)}>
            스프라이트 비우기
          </button>
        )}
        <button
          className="text-[11px] text-gray-500 hover:text-amber-600 ml-auto"
          onClick={() => updateChar(name, { isProtagonist: true })}
          title="주인공처럼 화면에 세우지 않고 대사·내레이션만 하게 합니다."
        >
          내레이션 전용으로
        </button>
      </div>
    </div>
  );
}

/**
 * 📦 한 번에 업로드 — 파일명 자동 매칭(주 동선) + 폴더 통째 선택. QuickMenuGui.tsx 의 BatchUploadRow 와
 * 같은 패턴(multi-file UploadButton + webkitdirectory 숨김 input)이되, 대상이 고정 슬롯이 아니라
 * (캐릭터, 의상) 이라 그 둘을 props 로 받는다. **지금 선택된 의상**(outfit)에만 적용된다 — 의상 탭을
 * 바꾸면 같은 버튼이 다른 의상을 대상으로 한다.
 */
function SpriteBatchUploadRow({ charName, outfit }: { charName: string; outfit: string }) {
  const importSpritesBatch = useStore((s) => s.importSpritesBatch);
  const dirRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = dirRef.current;
    if (!el) return;
    // webkitdirectory/directory 는 JSX 속성 타입이 없어(표준화 안 됨) DOM 에 직접 세팅해야
    // "폴더 선택" 다이얼로그로 뜬다.
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
  }, []);

  const handleDirFiles = (fileList: FileList | null) => {
    const files = fileList ? Array.from(fileList).filter((f) => f.type.startsWith('image/')) : [];
    if (files.length) void importSpritesBatch(charName, outfit, files);
    if (dirRef.current) dirRef.current.value = '';
  };

  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1.5">
        <UploadButton
          multiple
          onFiles={(files) => void importSpritesBatch(charName, outfit, files)}
          label="📦 한 번에 업로드"
          className="btn-ghost text-[11px]"
          title={`파일명으로 표정을 자동 매칭해 '${outfit}' 의상에 한 번에 업로드`}
        />
        <button
          className="btn-ghost text-[11px]"
          onClick={() => dirRef.current?.click()}
          title="폴더 하나를 통째로 선택합니다"
        >
          📁 폴더 선택
        </button>
        <input ref={dirRef} type="file" multiple className="hidden" onChange={(e) => handleDirFiles(e.target.files)} />
      </div>
      <p className="text-[10px] text-gray-500 leading-snug mt-0.5">
        파일명에 표정 이름이 들어 있으면 자동 매칭됩니다(예: <code className="text-accent">옅은미소.png</code>,{' '}
        <code className="text-accent">한지수_옅은 미소.png</code>) — 인식 못한 파일은 건너뛰고 알려드립니다. 지금
        선택된 의상(<b className="text-gray-300">{outfit}</b>)에만 적용됩니다.
      </p>
    </div>
  );
}

function ExpressionThumb({
  name,
  expr,
  outfit,
  onUpload,
}: {
  name: string;
  expr: Expression;
  outfit: string;
  onUpload: (file: File) => void;
}) {
  const assetId = useStore((s) => {
    const ch = s.project.characters.find((x) => x.name === name);
    if (!ch) return undefined;
    if (outfit === '기본') return ch.expressions[expr];
    return ch.outfits?.find((o) => o.name === outfit)?.expressions[expr];
  });
  const url = useAssetUrl(assetId);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="relative aspect-[3/4] rounded-lg border border-edge bg-ink overflow-hidden group">
      <button
        onClick={() => url && setZoom(true)}
        disabled={!url}
        title={url ? '🔍 크게 보기' : expr}
        className="w-full h-full flex items-center justify-center"
      >
        {url ? (
          <img src={url} className="w-full h-full object-contain" />
        ) : (
          <span className="text-[10px] text-gray-500">{expr}</span>
        )}
      </button>
      <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <UploadButton
          onFile={onUpload}
          label="↥"
          className="bg-black/55 text-white text-[10px] rounded px-1 py-0.5 hover:bg-black/75"
          title={`${expr} 입화 업로드`}
        />
      </div>
      <span className="absolute bottom-0 inset-x-0 bg-black/45 text-white text-[9px] py-0.5 text-center pointer-events-none">
        {expr}
      </span>
      {/* 확대 미리보기(라이트박스) — 아무 데나 클릭하면 닫힘. */}
      {zoom && url && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom(false)}
        >
          <img src={url} className="max-w-[90vw] max-h-[90vh] object-contain" />
          <button
            className="absolute top-4 right-5 text-white/80 hover:text-white text-3xl leading-none"
            onClick={() => setZoom(false)}
            title="닫기"
          >
            ×
          </button>
          <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/85 text-xs bg-black/55 px-2.5 py-1 rounded-full">
            {name} · {expr}
          </span>
        </div>
      )}
    </div>
  );
}
