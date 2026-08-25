// Phase 1A — Voice request-time anchor 회귀 가드.
//
// 고치는 결함: voice 작업은 (sceneId, lineIndex) 좌표만 들고 async(TTS → upload)를 건너간 뒤 커밋한다.
// 그 사이 줄이 추가·삭제되면 **같은 좌표에 다른 dialogue** 가 들어오는데, 예전 커밋 경로는
// `kind === 'dialogue'` 만 확인해서 그 다른 대사에 voiceAssetIds 를 붙였다(persistent 오부착).
//
// 이 파일이 고정하는 것:
//   ① 요청 시점 snapshot 이후 구조가 밀려 **stale 좌표에 다른 dialogue 가 실제로 존재**할 때,
//      그 dialogue 에 음성이 붙지 않는다(단순 out-of-range·control-line 회피가 아니다)
//   ② 밀려간 원래 target 에도 좌표를 remap 해서 붙이지 않는다
//   ③ 같은 배치의 어긋나지 않은 항목은 그대로 적용된다(run 전체 폐기 금지)
//   ④ 구조 변화가 없으면 기존과 동일한 결과(회귀 0)
//   ⑤ anchor 판정은 voiceLineAnchorMatches 단일 술어이고 단건 커밋도 같은 술어를 쓴다
//   ⑥ collectVoiceTargets 의 text(synthesis) 와 anchorText(canonical) 는 **다른 축**이다
//
// ⚠️ structural shift 는 이 Phase 에 이미 존재하는 canonical 액션 deleteLine 으로 만든다
//    (insertCgEndAfterLine 은 Phase 1B — 여기서는 존재하지 않는다).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { collectVoiceTargets } from '../src/generators/voice/collectByCharacter';
import {
  applyVoiceUpdates,
  voiceLineAnchorMatches,
  type VoiceAttachUpdate,
  type VoiceLineAnchor,
} from '../src/store/helpers';
import { emptyProject, type Line, type Scene } from '../src/types';
import { dialogue, projectWith, scene } from './fixtures';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

type Dlg = Extract<Line, { kind: 'dialogue' }>;

const S1 = 's1';
const S2 = 's2';
const HERO = '한지수';

/**
 * 핵심 fixture — 삭제로 좌표가 한 칸 당겨졌을 때 **stale 좌표에 같은 화자의 다른 대사**가 오도록 짠다.
 *
 *   old s1: 0=X(민주) 1=Y(민주) 2=A(한지수) 3=B(한지수)      ← 요청 대상 = A(index 2)
 *   deleteLine(s1, 0)
 *   new s1: 0=Y        1=A        2=B
 *                                 ^^^ stale index 2 = B — dialogue 이고 화자까지 A 와 같다.
 *
 * 즉 예전 구현의 `kind === 'dialogue'` guard 는 물론이고 "화자만 비교"하는 약한 anchor 로도 통과한다.
 * s2 는 건드리지 않아 같은 배치의 valid 항목 역할을 한다.
 */
function seed(): void {
  useStore.setState({
    project: projectWith(
      [
        scene({
          id: S1,
          lines: [
            dialogue('강민주', 'X'),
            dialogue('강민주', 'Y'),
            dialogue(HERO, 'A'),
            dialogue(HERO, 'B'),
          ],
        }),
        scene({ id: S2, title: '장면2', lines: [dialogue(HERO, 'C')] }),
      ],
      { rawInput: '' },
    ),
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
  });
}

const scenesRef = (): Scene[] => useStore.getState().project.scenes;
const sceneOf = (id: string): Scene => scenesRef().find((s) => s.id === id)!;

/** 배치가 실제로 실어 보내는 형태 그대로 collector 항목을 만든다(요청 시점 anchor 동행). */
const updateFrom = (
  item: { sceneId: string; lineIndex: number; anchorSpeaker: string; anchorText: string },
  assetId: string,
): VoiceAttachUpdate => ({
  sceneId: item.sceneId,
  lineIndex: item.lineIndex,
  locale: 'ko',
  assetId,
  anchor: { speaker: item.anchorSpeaker, text: item.anchorText },
});

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', { confirm: () => true });
  useStore.setState({ project: emptyProject(), outfitSuggestions: {}, outfitSuggestionRevision: 0, busy: {} });
});

describe('V1 — 요청 이후 · 커밋 이전 구조 변경(stale 좌표에 다른 dialogue 가 존재)', () => {
  it('밀려 들어온 다른 대사에 음성을 붙이지 않고, 원래 target 으로 remap 하지도 않는다', () => {
    seed();
    // ── ① 요청 시점: 배치 수집이 anchor 를 뜬다(최초 await 이전에 일어나는 동기 단계) ──
    const items = collectVoiceTargets(useStore.getState().project, HERO, 'ko', 'ko');
    const reqA = items.find((i) => i.sceneId === S1 && i.lineIndex === 2)!;
    expect(reqA.anchorText).toBe('A'); // 요청 대상은 A 였다

    // ── ② 아직 커밋 전 · 구조 변경(앞줄 삭제로 한 칸 당겨짐) ──
    useStore.getState().deleteLine(S1, 0);

    // stale 좌표(2)에 **다른 dialogue 가 실제로 존재**하는지 먼저 확인 — 이게 이 테스트의 전제다.
    const stale = sceneOf(S1).lines[2] as Dlg;
    expect(stale.kind).toBe('dialogue'); // 예전 guard 는 여기서 통과했다
    expect(stale.speaker).toBe(HERO); // 화자까지 같다 — 약한 anchor 로도 못 막는다
    expect(stale.text).toBe('B'); // 그러나 A 가 아니다
    expect((sceneOf(S1).lines[1] as Dlg).text).toBe('A'); // A 는 index 1 로 이동했다

    // ── ③ 뒤늦게 도착한 요청 결과를 커밋 ──
    const before = scenesRef();
    const { scenes, locales } = applyVoiceUpdates(before, [updateFrom(reqA, 'asset-A')]);
    const s1 = scenes.find((s) => s.id === S1)!;
    const at = (i: number) => (s1.lines[i] as Dlg).voiceAssetIds;

    expect(at(2)).toBeUndefined(); // B 에 붙지 않는다  ← 원래 결함
    expect(at(1)).toBeUndefined(); // A 로 remap 하지도 않는다
    expect(locales).toEqual([]); // 쓰지도 않을 로케일을 voiceLocales 에 추가하지 않는다
    expect(scenes).toBe(before); // 적용분이 0이면 scenes 참조 자체가 그대로다
  });
});

describe('V2 — 부분 적용', () => {
  it('어긋난 항목만 버리고 같은 배치의 valid 항목은 그대로 적용한다(run 전체 폐기 금지)', () => {
    seed();
    const items = collectVoiceTargets(useStore.getState().project, HERO, 'ko', 'ko');
    const reqA = items.find((i) => i.sceneId === S1 && i.lineIndex === 2)!;
    const reqC = items.find((i) => i.sceneId === S2)!;
    useStore.getState().deleteLine(S1, 0); // s1 만 밀린다 — s2 는 그대로

    const { scenes, locales } = applyVoiceUpdates(scenesRef(), [
      updateFrom(reqA, 'asset-A'),
      updateFrom(reqC, 'asset-C'),
    ]);
    const s1 = scenes.find((s) => s.id === S1)!;
    const s2 = scenes.find((s) => s.id === S2)!;
    expect(s1.lines.every((l) => l.kind !== 'dialogue' || !l.voiceAssetIds)).toBe(true);
    expect((s2.lines[0] as Dlg).voiceAssetIds).toEqual({ ko: 'asset-C' });
    expect((s2.lines[0] as Dlg).voiced).toBe(true);
    expect(locales).toEqual(['ko']);
  });
});

describe('V3 — 구조 변화가 없으면 기존 동작 그대로(회귀 0)', () => {
  it('모든 항목이 요청한 그 줄에 적용된다', () => {
    seed();
    const items = collectVoiceTargets(useStore.getState().project, HERO, 'ko', 'ko');
    const { scenes, locales } = applyVoiceUpdates(
      scenesRef(),
      items.map((it, n) => updateFrom(it, `asset-${n}`)),
    );
    const s1 = scenes.find((s) => s.id === S1)!;
    const s2 = scenes.find((s) => s.id === S2)!;
    expect((s1.lines[2] as Dlg).voiceAssetIds).toEqual({ ko: 'asset-0' });
    expect((s1.lines[3] as Dlg).voiceAssetIds).toEqual({ ko: 'asset-1' });
    expect((s2.lines[0] as Dlg).voiceAssetIds).toEqual({ ko: 'asset-2' });
    // 화자가 다른 앞줄은 건드리지 않는다
    expect((s1.lines[0] as Dlg).voiceAssetIds).toBeUndefined();
    expect(locales).toEqual(['ko']);
  });

  it('기존 다른 로케일 음성은 보존하고 그 로케일만 덮어쓴다', () => {
    useStore.setState({
      project: projectWith([scene({ id: S1, lines: [dialogue(HERO, 'A', { voiceAssetIds: { en: 'old-en' } })] })]),
    });
    const anchor: VoiceLineAnchor = { speaker: HERO, text: 'A' };
    const { scenes } = applyVoiceUpdates(scenesRef(), [
      { sceneId: S1, lineIndex: 0, locale: 'ko', assetId: 'new-ko', anchor },
    ]);
    expect((scenes[0].lines[0] as Dlg).voiceAssetIds).toEqual({ en: 'old-en', ko: 'new-ko' });
  });
});

describe('V4 — anchor 불일치 종류별 skip', () => {
  it('화자만 달라도 / 원문만 달라도 각각 적용하지 않는다', () => {
    seed();
    const base = { sceneId: S1, lineIndex: 2, locale: 'ko' as const, assetId: 'x' };
    const wrongSpeaker = applyVoiceUpdates(scenesRef(), [{ ...base, anchor: { speaker: '강민주', text: 'A' } }]);
    const wrongText = applyVoiceUpdates(scenesRef(), [{ ...base, anchor: { speaker: HERO, text: 'A(수정됨)' } }]);
    for (const r of [wrongSpeaker, wrongText]) {
      expect(r.locales).toEqual([]);
      expect((r.scenes.find((s) => s.id === S1)!.lines[2] as Dlg).voiceAssetIds).toBeUndefined();
    }
  });
});

describe('V5 — voiceLineAnchorMatches 술어(판정 단일 소스)', () => {
  const anchor: VoiceLineAnchor = { speaker: HERO, text: 'A' };
  it('없는 줄 · dialogue 아님 · 화자 불일치 · 원문 불일치 는 false, 일치는 true', () => {
    expect(voiceLineAnchorMatches(undefined, anchor)).toBe(false);
    expect(voiceLineAnchorMatches({ kind: 'narration', text: 'A' }, anchor)).toBe(false);
    expect(voiceLineAnchorMatches({ kind: 'cg', desc: '', end: true }, anchor)).toBe(false);
    expect(voiceLineAnchorMatches(dialogue('강민주', 'A'), anchor)).toBe(false);
    expect(voiceLineAnchorMatches(dialogue(HERO, 'B'), anchor)).toBe(false);
    expect(voiceLineAnchorMatches(dialogue(HERO, 'A'), anchor)).toBe(true);
  });
});

describe('V6 — 단건 경로도 같은 술어로 막힌다', () => {
  it('요청 시점 A 의 anchor 는 구조 변경 뒤 stale 좌표의 B 와 맞지 않는다', () => {
    seed();
    // 단건은 VoiceLab 이 최초 await 이전에 그 줄에서 anchor 를 뜬다(값 복사).
    const src = sceneOf(S1).lines[2] as Dlg;
    const anchorOfA: VoiceLineAnchor = { speaker: src.speaker, text: src.text };

    useStore.getState().deleteLine(S1, 0); // TTS 도는 동안 구조 변경

    // attachVoiceQuiet 의 fail-fast·커밋 판정이 쓰는 바로 그 술어다.
    expect(voiceLineAnchorMatches(sceneOf(S1).lines[2], anchorOfA)).toBe(false);
    // 밀려간 A 자체와는 여전히 맞는다 — 다만 좌표를 remap 하지 않으므로 커밋되지 않는다(V1).
    expect(voiceLineAnchorMatches(sceneOf(S1).lines[1], anchorOfA)).toBe(true);
  });
});

describe('V7 — synthesis text 와 identity anchor 는 다른 축', () => {
  it('비-base 로케일에서 text 는 번역문이고 anchorText 는 canonical 원문이다', () => {
    const p = projectWith([scene({ id: S1, lines: [dialogue(HERO, '안녕', { i18n: { en: 'Hello' } })] })]);
    const [item] = collectVoiceTargets(p, HERO, 'en', 'ko');
    expect(item.text).toBe('Hello'); // TTS 에 넘길 값
    expect(item.anchorText).toBe('안녕'); // 줄 identity
    expect(item.anchorSpeaker).toBe(HERO);
    expect(item.text).not.toBe(item.anchorText);

    // ⚠️ anchor 로 synthesis text 를 쓰면 이 줄을 찾지 못한다(회귀 방지용 대조).
    expect(voiceLineAnchorMatches(p.scenes[0].lines[0], { speaker: HERO, text: item.text })).toBe(false);
    expect(voiceLineAnchorMatches(p.scenes[0].lines[0], { speaker: HERO, text: item.anchorText })).toBe(true);
  });
});
