import type { Scene, Line, Locale, Expression, Character, Project } from '../types';
import type { ScriptMeta } from '../parser';
import { sanitizeWindowsPath } from '../project/safeName';

let assetCounter = 0;
export function assetId(): string {
  assetCounter += 1;
  return `a_${Date.now().toString(36)}_${assetCounter}`;
}

/** 업로드 파일명에 쓸 안전한 파일명(특수문자 제거·공백을 밑줄로, 최대 50자). */
/**
 * 일괄 업로드 실패 목록을 토스트에 넣을 짧은 문구로 — "a.png, b.png, c.png 외 5개".
 * 메뉴 버튼·퀵메뉴·스프라이트 세 곳이 같은 문구를 쓰는데 각자 지역 함수로 복붙돼 있던 걸 모았다.
 */
export function describeNames(names: string[]): string {
  const shown = names.slice(0, 3).join(', ');
  const rest = names.length > 3 ? ` 외 ${names.length - 3}개` : '';
  return `${shown}${rest}`;
}

export function safeFileName(s: string): string {
  return sanitizeWindowsPath(s, 50, 'asset');
}

// scenes 배열 identity 별로 id→Scene 인덱스를 캐싱한다. zustand는 set() 마다 구독 중인 모든
// 셀렉터를 다시 돌리므로(렌더가 아니라!), SceneCard/RightPanel 처럼 `scenes.find(id===...)` 를
// 셀렉터 안에 두면 카드 N개 × 장면 N개 = O(N²) 비교가 키 입력마다 반복된다(150장면 기준
// 22,500회, 800장면이면 640,000회+배열 640,000회 스캔). setScenes(store.ts)가 변경 안 된 장면의
// 객체 identity를 보존하므로, 배열 자체가 안 바뀌면 이 캐시는 항상 유효하다 — WeakMap 키가
// 배열이라 새 scenes 배열이 생기면 자동으로 새 캐시 항목이 되어(스테일 가능성 없음) 재구축은
// "장면 배열이 실제로 바뀐 시점" 딱 1번, O(N)이다(구독자 수와 무관).
const sceneIndexCache = new WeakMap<Scene[], Map<string, Scene>>();
export function sceneById(scenes: Scene[], id: string | null | undefined): Scene | undefined {
  if (!id) return undefined;
  let idx = sceneIndexCache.get(scenes);
  if (!idx) {
    idx = new Map(scenes.map((sc) => [sc.id, sc]));
    sceneIndexCache.set(scenes, idx);
  }
  return idx.get(id);
}

/**
 * 음성 작업이 **어느 Line 을 대상으로 시작됐는지**를 식별하는 request-time snapshot.
 *
 * ⚠️ 반드시 **최초 async boundary(TTS·업로드) 이전**에 그 줄에서 떠야 한다 — 늦게(첨부 시점) 현재
 * lines[lineIndex] 를 읽어 만들면, 그 사이 구조가 바뀐 경우 **이미 밀려 들어온 다른 줄**에서 anchor 를
 * 뜨게 되어 검증이 통과해버린다(그게 원래 버그다).
 * ⚠️ live Line 참조가 아니라 **문자열 복사본**이어야 한다(요청 뒤 그 객체가 갱신될 수 있다).
 *
 * 필드 구성은 기존 관용구를 그대로 따른다 — validateEmotionUpdates(speaker/text) ·
 * mergeScenes.lineKey(`dialogue|speaker|text`). 새 anchor framework 로 키우지 말 것.
 */
export interface VoiceLineAnchor {
  /** 요청 시점 line.speaker. */
  speaker: string;
  /** 요청 시점 **canonical** line.text — 로케일 synthesis text 가 아니다. */
  text: string;
}

/**
 * 지금 그 자리에 있는 줄이 요청 시점의 그 줄인가 — **anchor 판정의 단일 소스**.
 * fail-fast(attachVoiceQuiet 진입) · 단건 커밋 · 배치 커밋(applyVoiceUpdates) 셋이 공유한다.
 * ⚠️ 세 곳이 각자 비교식을 쓰면 그 순간 판정이 갈라진다(resolveEmotion 과 같은 규칙).
 *
 * ⚠️ 인접한 두 대사의 speaker·text 가 **완전히 동일**하면 둘을 구별하지 못한다 — 번역 QA Phase 3·4·5 가
 * 이미 명시한 것과 **같은 등급의 accepted limitation** 이다(UUID·revision 을 만들지 않는다).
 *
 * 반환 타입은 **type guard** 다 — 통과하면 호출측이 그 줄을 dialogue 로 좁혀 voiceAssetIds 를 읽을 수
 * 있어야 하고, 그래야 커밋 직전 판정과 값 접근이 같은 검사 하나에서 나온다.
 */
export function voiceLineAnchorMatches(
  line: Line | undefined,
  anchor: VoiceLineAnchor,
): line is Extract<Line, { kind: 'dialogue' }> {
  if (!line || line.kind !== 'dialogue') return false;
  return line.speaker === anchor.speaker && line.text === anchor.text;
}

/** 보이스 일괄 생성 중 attachVoiceQuiet 가 즉시 커밋하지 않고 모아두는 항목 하나. */
export interface VoiceAttachUpdate {
  sceneId: string;
  lineIndex: number;
  locale: Locale;
  assetId: string;
  /** 요청 시점 anchor — 커밋까지 동행해 좌표가 밀렸는지 판정한다. */
  anchor: VoiceLineAnchor;
}

/**
 * attachVoiceQuiet 가 모아둔 항목들을 scenes 에 한 번에 반영하는 순수 함수(부수효과 없음) —
 * 배치 중 매 줄마다 전체 scenes 를 재빌드하던 것을 배치 끝에 1회로 줄인다(autoTranslateAll 의
 * updates Map 누적 → 단일 커밋 패턴과 동일). voiceLocales 에 새로 추가할 로케일 집합도 함께 반환.
 *
 * ⚠️ **커밋 직전 anchor 재검증이 여기 있다.** 배치는 요청(collectVoiceTargets)과 커밋 사이가
 * 항목당 TTS + 페이싱 + 백오프만큼 길어서, 그 사이 줄이 추가·삭제되면 같은 lineIndex 에 **다른
 * dialogue** 가 들어온다. 예전엔 `kind === 'dialogue'` 만 봤기 때문에 그 다른 대사에 음성이 그대로
 * 붙었다(persistent 오부착). 지금은 어긋난 항목만 버린다.
 * ⚠️ **run 전체를 폐기하지 않는다** — 나머지 valid 항목은 그대로 적용한다(기존 부분 적용 계약 유지).
 * ⚠️ 밀린 좌표를 **재계산해 옮겨 붙이지 않는다**(index remapping 금지 — 버려진 blob 은 기존 고아 에셋
 * 스윕이 회수한다).
 */
export function applyVoiceUpdates(scenes: Scene[], updates: VoiceAttachUpdate[]): { scenes: Scene[]; locales: Locale[] } {
  if (!updates.length) return { scenes, locales: [] };
  const bySceneLine = new Map<string, Map<number, Partial<Record<Locale, string>>>>();
  const localeSet = new Set<Locale>();
  for (const u of updates) {
    // 그룹핑 **전에** 거른다 — 버려진 항목은 locales 집계에도 들어가면 안 된다(쓰지도 않을 로케일이
    // project.voiceLocales 에 추가되면 내보내기에 빈 음성 언어가 생긴다).
    const line = sceneById(scenes, u.sceneId)?.lines[u.lineIndex];
    if (!voiceLineAnchorMatches(line, u.anchor)) continue;
    localeSet.add(u.locale);
    let lineMap = bySceneLine.get(u.sceneId);
    if (!lineMap) {
      lineMap = new Map();
      bySceneLine.set(u.sceneId, lineMap);
    }
    lineMap.set(u.lineIndex, { ...lineMap.get(u.lineIndex), [u.locale]: u.assetId });
  }
  if (!bySceneLine.size) return { scenes, locales: [] };
  const nextScenes = scenes.map((sc) => {
    const lineMap = bySceneLine.get(sc.id);
    if (!lineMap) return sc;
    return {
      ...sc,
      lines: sc.lines.map((l, i) => {
        const lineUpdate = lineMap.get(i);
        if (!lineUpdate || l.kind !== 'dialogue') return l;
        return { ...l, voiced: true, voiceAssetIds: { ...l.voiceAssetIds, ...lineUpdate } };
      }),
    };
  });
  return { scenes: nextScenes, locales: [...localeSet] };
}

/**
 * autoAssignEmotionAll 이 모아둔 (sceneId → lineIndex → 배정된 표정) 결과를 scenes 에 한 번에
 * 반영하는 순수 함수 — applyVoiceUpdates 와 같은 절충(배치 중 매 줄마다 scenes 를 재빌드하지 않고
 * 끝에 1회)이다. 단위테스트는 없다(autoTranslateAll 의 커밋도 액션 안에 인라인이라 같은 처지).
 */
export function applyEmotionUpdates(scenes: Scene[], updates: Map<string, Map<number, Expression>>): Scene[] {
  if (!updates.size) return scenes;
  return scenes.map((sc) => {
    const lineMap = updates.get(sc.id);
    if (!lineMap) return sc;
    return {
      ...sc,
      lines: sc.lines.map((l, i) => {
        const expr = lineMap.get(i);
        if (!expr || l.kind !== 'dialogue') return l;
        return { ...l, emotionAuto: expr };
      }),
    };
  });
}

/**
 * autoTranslateAll 이 **커밋 직전 재검증을 통과시킨** 결과(sceneId → lineIndex → 로케일별 번역)만
 * scenes 에 한 번에 반영하는 순수 함수 — applyVoiceUpdates/applyEmotionUpdates 와 같은 절충이다
 * (배치 중 매 줄마다 scenes 를 재빌드하지 않고 끝에 1회).
 * ⚠️ 여기서 유효성을 다시 판정하지 않는다 — anchor(장면·줄·kind·화자·원문)와 "빈 칸에만 쓴다"는
 * 호출측이 이미 끝냈다. 이 함수가 검사를 또 하면 판정이 두 벌이 된다(resolveEmotion 과 같은 규칙).
 */
export function applyTranslationUpdates(
  scenes: Scene[],
  updates: Map<string, Map<number, Partial<Record<Locale, string>>>>,
): Scene[] {
  if (!updates.size) return scenes;
  return scenes.map((sc) => {
    const lineMap = updates.get(sc.id);
    if (!lineMap) return sc;
    return {
      ...sc,
      lines: sc.lines.map((l, i) => {
        const tr = lineMap.get(i);
        // 아이템·CG·BGM 라인은 번역이 없다(호출측 검증과 같은 기준을 한 번 더 두는 최소 방어).
        if (!tr || l.kind === 'item' || l.kind === 'cg' || l.kind === 'bgm') return l;
        return { ...l, i18n: { ...(l.i18n ?? {}), ...tr } };
      }),
    };
  });
}

/**
 * 대본 메타(#설정_글언어/#설정_목소리언어)로 지정된 다국어 설정을 프로젝트에 병합할 부분 패치.
 * 지정된 값만 덮어쓴다(대본에 없으면 기존 프로젝트 설정 유지).
 */
export function localeMeta(meta?: ScriptMeta): Partial<Pick<Project, 'baseLocale' | 'textLocales' | 'voiceLocales'>> {
  if (!meta) return {};
  const patch: Partial<Pick<Project, 'baseLocale' | 'textLocales' | 'voiceLocales'>> = {};
  if (meta.baseLocale) patch.baseLocale = meta.baseLocale;
  if (meta.textLocales) patch.textLocales = meta.textLocales;
  if (meta.voiceLocales) patch.voiceLocales = meta.voiceLocales;
  return patch;
}

/**
 * 캐릭터의 (의상, 표정) 슬롯에 스프라이트 assetId 를 박은 새 characters 배열을 돌려준다.
 * '기본' 의상은 Character.expressions, 그 외는 해당 Outfit.expressions 에 기록한다.
 */
export function withSpriteAsset(
  characters: Character[],
  name: string,
  outfit: string,
  expr: Expression,
  id: string,
): Character[] {
  return characters.map((c) => {
    if (c.name !== name) return c;
    if (outfit === '기본') return { ...c, expressions: { ...c.expressions, [expr]: id } };
    return {
      ...c,
      outfits: (c.outfits ?? []).map((o) =>
        o.name === outfit ? { ...o, expressions: { ...o.expressions, [expr]: id } } : o,
      ),
    };
  });
}

/**
 * append(뒤에 추가) 전용 캐릭터 병합 — 기존 캐릭터는 전부 그대로 유지하고(설정·순서 불변),
 * 새 분석 결과에만 있는 이름만 뒤에 추가한다. 기존 장면의 화자가 캐릭터 목록에서 사라지면
 * 안 되므로 mergeChars(next 기준)와 달리 prev 를 기준으로 union 한다.
 */
export function unionChars(prev: Character[], next: Character[]): Character[] {
  const known = new Set(prev.map((c) => c.name));
  return [...prev, ...next.filter((c) => !known.has(c.name))];
}

/** 기존 캐릭터의 표정/색 설정을 유지하면서 새 분석 결과와 병합. */
export function mergeChars(prev: Character[], next: Character[]): Character[] {
  const byName = new Map(prev.map((c) => [c.name, c]));
  return next.map((c) => {
    const old = byName.get(c.name);
    // 색·스프라이트뿐 아니라 사용자가 입력한 내레이션 설정도 보존
    // (재분석/대본 수정 시 캐릭터 설정이 날아가지 않도록).
    return old
      ? {
          ...c,
          color: old.color,
          expressions: old.expressions,
          outfits: old.outfits ?? c.outfits,
          isProtagonist: old.isProtagonist ?? c.isProtagonist,
          i18nName: old.i18nName ?? c.i18nName,
          voice: old.voice ?? c.voice,
        }
      : c;
  });
}

/**
 * 삭제되는 의상을 가리키던 장면 참조를 걷어낸다(removeOutfit 전용 — 범용 정리 시스템이 아니다).
 * 의상 참조는 두 자리에 있다:
 *  ① 장면 시작 의상 Scene.outfits[charName]
 *  ② 줄 단위 전환 Line.outfits[charName] (대사·지문만 가짐)
 * 둘 다 그 캐릭터 키만 지운다 — 같은 레코드에 든 **다른 캐릭터의 전환은 반드시 보존**해야 한다.
 * ②는 키를 지워 레코드가 비면 undefined 로 정리하고(파서가 안 만드는 빈 레코드를 남기지 않는다),
 * ①은 기존 동작대로 빈 객체를 그대로 둔다(장면 카드가 그 형태를 이미 다룬다).
 * 참조가 없는 장면은 **객체 identity 를 그대로 반환**한다(sceneById 캐시·불필요한 리렌더 방지).
 */
export function stripOutfitRefs(scenes: Scene[], charName: string, outfit: string): Scene[] {
  return scenes.map((sc) => {
    const sceneRef = sc.outfits?.[charName] === outfit;
    const lineRef = sc.lines.some(
      (l) => (l.kind === 'dialogue' || l.kind === 'narration') && l.outfits?.[charName] === outfit,
    );
    if (!sceneRef && !lineRef) return sc;
    let outfits = sc.outfits;
    if (sceneRef) {
      const m = { ...sc.outfits };
      delete m[charName];
      outfits = m;
    }
    const lines = lineRef
      ? sc.lines.map((l) => {
          if ((l.kind !== 'dialogue' && l.kind !== 'narration') || l.outfits?.[charName] !== outfit) return l;
          const m = { ...l.outfits };
          delete m[charName];
          return { ...l, outfits: Object.keys(m).length ? m : undefined };
        })
      : sc.lines;
    return { ...sc, outfits, lines };
  });
}
