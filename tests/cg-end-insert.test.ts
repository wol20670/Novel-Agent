// post-v1 CG 종료 수동 삽입 UX Phase 1B — insertCgEndAfterLine 의 store 계약 회귀 가드.
//
// tests/line-delete.test.ts 와 같은 관용구: 실제 store 를 그대로 import 하고 localStorage/window 만
// 최소 stub 한다(범용 zustand 하네스·UI 테스트 인프라를 만들지 않는다).
//
// 여기서 고정하는 계약:
//   ① 마커는 **현재 줄 뒤(index + 1)** 에 들어간다(off-by-one 을 앞뒤 텍스트 순서로 고정)
//   ② 마커 shape 은 파서(addCgEnd)와 **정확히 같다** — { kind:'cg', desc:'', end:true }, 추가 키 없음
//   ③ 판정은 cgActiveFlags(per-line 상태)이고 결과 flags 가 "그 줄 active → 마커부터 -1" 이다
//   ④ 기존 Line 은 **객체 참조 그대로** 뒤로 밀리고 Line-local 값이 전부 보존된다
//   ⑤ rawInput · Scene.cg · cgAssetIds 불변(종료 마커는 에셋이 아니다)
//   ⑥ 무효·중복 요청은 setScenes·invalidateOutfitSuggestions·flash 를 **한 번도 부르지 않는다**
//      (= guard 가 전부 먼저 — observable state identity 로 증명한다)
//   ⑦ 유효 삽입은 기존 Outfit 무효화 정책을 그대로 타고, 사용자에게 보이는 토스트는 **1개**다
//   ⑧ Phase 1A voice anchor 가 이 구조 변경에서도 오부착을 막는다(integration)

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { activeQaIssues, type TranslationQaResult } from '../src/generators/translate/qa';
import { outfitLineKey, type OutfitSuggestion } from '../src/generators/outfit';
import { collectVoiceTargets } from '../src/generators/voice/collectByCharacter';
import { applyVoiceUpdates } from '../src/store/helpers';
import { cgActiveFlags, emptyProject, type Line, type Scene } from '../src/types';
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
/** 원본 대본 — 이 액션이 rawInput 을 건드리지 않는다는 것이 T8 의 계약이다. */
const RAW = '#S 장면1\n#CG 교실 전경\n민주: A\n민주: B\n민주: C\n';

/** `#CG` 로 켠 뒤 A·B·C 가 이어지는 장면(전 구간 CG active). */
function cgLines(): Line[] {
  return [
    { kind: 'cg', desc: '교실 전경' },
    dialogue('민주', 'A'),
    dialogue('민주', 'B', {
      i18n: { en: 'B-en' },
      emotion: '기쁨',
      emotionAuto: '슬픔',
      voiceAssetIds: { ko: 'voice-b' },
      outfits: { 민주: '사복' },
      hideSprites: true,
    }),
    dialogue('민주', 'C'),
  ];
}

function seed(lines: Line[] = cgLines(), patch: Partial<Scene> = {}): void {
  useStore.setState({
    project: projectWith([scene({ id: S1, cg: ['교실 전경'], lines, ...patch })], { rawInput: RAW }),
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
    translationQa: {},
    toast: null,
  });
}

const scenesRef = () => useStore.getState().project.scenes;
const linesOf = () => scenesRef()[0].lines;
const kinds = () => linesOf().map((l) => (l.kind === 'dialogue' || l.kind === 'narration' ? l.text : `<${l.kind}${l.kind === 'cg' && l.end ? ':end' : ''}>`));
const revision = () => useStore.getState().outfitSuggestionRevision;
const toast = () => useStore.getState().toast;

function sug(sc: Scene, lineIndex: number): OutfitSuggestion {
  return {
    sceneId: sc.id,
    lineIndex,
    character: '민주',
    outfit: '사복',
    lineKey: outfitLineKey(sc.lines[lineIndex]),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', { confirm: () => true });
  useStore.setState({
    project: emptyProject(),
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
    translationQa: {},
    toast: null,
    busy: {},
  });
});

describe('T1 — 현재 줄 뒤(index + 1) 삽입', () => {
  it('클릭한 줄은 제자리에 남고 마커가 바로 다음, 그 뒤 줄이 한 칸 밀린다', () => {
    seed();
    useStore.getState().insertCgEndAfterLine(S1, 2); // B 에서 클릭
    expect(kinds()).toEqual(['<cg>', 'A', 'B', '<cg:end>', 'C']);
  });
});

describe('T2 — 마커 shape 은 파서와 정확히 같다', () => {
  it('{ kind:"cg", desc:"", end:true } 이고 추가 키가 없다', () => {
    seed();
    useStore.getState().insertCgEndAfterLine(S1, 2);
    const marker = linesOf()[3];
    expect(marker).toEqual({ kind: 'cg', desc: '', end: true });
    expect(Object.keys(marker).sort()).toEqual(['desc', 'end', 'kind']);
  });
});

describe('T3 — 지문(narration)', () => {
  it('지문 줄에서도 그 줄 뒤에 삽입된다', () => {
    seed([{ kind: 'cg', desc: '교실 전경' }, { kind: 'narration', text: '지문' }, dialogue('민주', 'C')]);
    useStore.getState().insertCgEndAfterLine(S1, 1);
    expect(kinds()).toEqual(['<cg>', '지문', '<cg:end>', 'C']);
  });
});

describe('T4 — CG 가 마지막 줄까지 active', () => {
  it('배열 끝에 append 된다', () => {
    seed();
    useStore.getState().insertCgEndAfterLine(S1, 3); // 마지막 줄 C
    expect(kinds()).toEqual(['<cg>', 'A', 'B', 'C', '<cg:end>']);
    expect(linesOf()).toHaveLength(5);
  });
});

describe('T5 — 레거시 폴백(Scene.cg 는 있는데 시작 마커가 없음)', () => {
  it('첫 줄부터 CG active 라 특례 코드 없이 삽입된다', () => {
    seed([dialogue('민주', 'A'), dialogue('민주', 'B')]);
    expect(cgActiveFlags(scenesRef()[0])).toEqual([0, 0]); // 폴백으로 장면 시작부터 CG
    useStore.getState().insertCgEndAfterLine(S1, 0);
    expect(kinds()).toEqual(['A', '<cg:end>', 'B']);
  });
});

describe('T6 — 삽입 결과의 cgActiveFlags', () => {
  it('클릭 줄은 active, 마커 그 줄부터 -1 이다', () => {
    seed();
    useStore.getState().insertCgEndAfterLine(S1, 2);
    // [#CG, A, B, #CG끝, C]
    expect(cgActiveFlags(scenesRef()[0])).toEqual([0, 0, 0, -1, -1]);
  });
});

describe('T7 — 기존 Line 객체 보존', () => {
  it('참조가 그대로 유지되고 index 만 +1 되며 Line-local 값이 전부 남는다', () => {
    seed();
    const before = linesOf();
    const [cg0, a1, b2, c3] = before;
    useStore.getState().insertCgEndAfterLine(S1, 2);
    const after = linesOf();

    expect(after[0]).toBe(cg0); // 앞줄은 index 도 참조도 그대로
    expect(after[1]).toBe(a1);
    expect(after[2]).toBe(b2);
    expect(after[4]).toBe(c3); // 뒤 줄은 참조 유지 + index 만 +1

    const b = after[2] as Dlg;
    expect(b.i18n).toEqual({ en: 'B-en' });
    expect(b.emotion).toBe('기쁨');
    expect(b.emotionAuto).toBe('슬픔');
    expect(b.outfits).toEqual({ 민주: '사복' });
    expect(b.hideSprites).toBe(true);
    expect(b.voiceAssetIds).toEqual({ ko: 'voice-b' });
  });
});

describe('T8 — 원본·에셋 축 불변', () => {
  it('rawInput 은 문자 단위로, Scene.cg·cgAssetIds 는 참조까지 그대로다', () => {
    seed(cgLines(), { cgAssetIds: ['asset-cg0'] });
    const cgRef = scenesRef()[0].cg;
    const cgAssetsRef = scenesRef()[0].cgAssetIds;
    useStore.getState().insertCgEndAfterLine(S1, 2);
    expect(useStore.getState().project.rawInput).toBe(RAW);
    expect(scenesRef()[0].cg).toBe(cgRef); // 종료 마커는 에셋이 아니다
    expect(scenesRef()[0].cgAssetIds).toBe(cgAssetsRef);
  });
});

describe('T9 — 무효·중복 요청은 완전 no-op', () => {
  const SENTINEL = '건드리지 않았음';

  /** 호출 전후로 observable state 가 하나도 안 바뀌었는지 — setScenes/invalidate/flash 미호출 증명. */
  function expectUntouched(run: () => void): void {
    useStore.setState({ toast: SENTINEL, toastType: 'info' });
    const p0 = useStore.getState().project;
    const scenes0 = p0.scenes;
    const scene0 = scenes0[0];
    const lines0 = scene0?.lines;
    const raw0 = p0.rawInput;
    const sug0 = useStore.getState().outfitSuggestions;
    const rev0 = revision();

    run();

    const s1 = useStore.getState();
    expect(s1.project).toBe(p0); // setScenes 미호출
    expect(s1.project.scenes).toBe(scenes0);
    expect(s1.project.scenes[0]).toBe(scene0);
    expect(s1.project.scenes[0]?.lines).toBe(lines0);
    expect(s1.project.rawInput).toBe(raw0);
    expect(s1.outfitSuggestions).toBe(sug0); // invalidateOutfitSuggestions 미호출
    expect(s1.outfitSuggestionRevision).toBe(rev0);
    expect(s1.toast).toBe(SENTINEL); // flash 미호출
    expect(s1.toastType).toBe('info');
  }

  it('없는 장면 · 범위 밖 · 음수 index', () => {
    seed();
    expectUntouched(() => useStore.getState().insertCgEndAfterLine('없는장면', 1));
    expectUntouched(() => useStore.getState().insertCgEndAfterLine(S1, 99));
    expectUntouched(() => useStore.getState().insertCgEndAfterLine(S1, -1));
  });

  it('control line(item · cg 시작 · cg 종료 · bgm)', () => {
    seed([
      { kind: 'cg', desc: '교실 전경' }, // 0 — cg 시작
      { kind: 'item', name: '열쇠' }, // 1
      { kind: 'bgm', name: '테마' }, // 2
      dialogue('민주', 'A'), // 3
      { kind: 'cg', desc: '', end: true }, // 4 — cg 종료
    ]);
    for (const i of [0, 1, 2, 4]) {
      expectUntouched(() => useStore.getState().insertCgEndAfterLine(S1, i));
    }
  });

  it('CG 구간이 아닌 대사(CG 시작 전 · #CG끝 이후)', () => {
    seed([
      dialogue('민주', '이전'), // 0 — CG 시작 전
      { kind: 'cg', desc: '교실 전경' }, // 1
      dialogue('민주', 'CG중'), // 2
      { kind: 'cg', desc: '', end: true }, // 3
      dialogue('민주', '이후'), // 4 — #CG끝 이후
    ]);
    expect(cgActiveFlags(scenesRef()[0])).toEqual([-1, 0, 0, -1, -1]);
    expectUntouched(() => useStore.getState().insertCgEndAfterLine(S1, 0));
    expectUntouched(() => useStore.getState().insertCgEndAfterLine(S1, 4));
  });

  it('바로 다음 줄이 이미 종료 마커면(중복) no-op — UI 만 믿지 않는다', () => {
    seed([
      { kind: 'cg', desc: '교실 전경' }, // 0
      dialogue('민주', 'B'), // 1 — 여기서 누르면 중복
      { kind: 'cg', desc: '', end: true }, // 2
    ]);
    expect(cgActiveFlags(scenesRef()[0])[1]).toBe(0); // 이 줄은 여전히 CG active 다
    expectUntouched(() => useStore.getState().insertCgEndAfterLine(S1, 1));
  });

  it('다음 줄이 새 #CG 시작 마커인 경우는 막지 않는다(이번 Phase 정책 범위 밖)', () => {
    seed([
      { kind: 'cg', desc: '교실 전경' }, // 0
      dialogue('민주', 'B'), // 1
      { kind: 'cg', desc: '복도' }, // 2 — 시작 마커
    ]);
    useStore.getState().insertCgEndAfterLine(S1, 1);
    expect(kinds()).toEqual(['<cg>', 'B', '<cg:end>', '<cg>']);
  });

  it('무효 요청은 검수 중인 의상 제안을 날리지 않는다(guard 가 invalidate 보다 먼저)', () => {
    seed();
    useStore.setState({ outfitSuggestions: { [S1]: [sug(scenesRef()[0], 2)] }, outfitSuggestionRevision: 7 });
    expectUntouched(() => useStore.getState().insertCgEndAfterLine(S1, 0)); // 0 = cg 시작 마커
    expect(useStore.getState().outfitSuggestions[S1]).toHaveLength(1);
    expect(revision()).toBe(7);
  });
});

describe('T10 — 유효 삽입: Outfit 무효화 + 사용자에게 보이는 토스트 1개', () => {
  it('제안이 있으면 전체 clear + revision++ 이고, 최종 토스트 하나에 세 정보가 다 담긴다', () => {
    seed();
    useStore.setState({ outfitSuggestions: { [S1]: [sug(scenesRef()[0], 2), sug(scenesRef()[0], 3)] }, outfitSuggestionRevision: 3 });
    useStore.getState().insertCgEndAfterLine(S1, 2);

    expect(useStore.getState().outfitSuggestions).toEqual({});
    expect(revision()).toBe(4);
    // flash 는 단일 state 라 **마지막 메시지 하나만** 사용자에게 남는다 → 그 하나가 전부 담아야 한다.
    const t = toast()!;
    expect(t).toContain('CG 종료를 넣었습니다');
    expect(t).toContain('의상 제안 2건');
    expect(t).toContain('재분석');
  });

  it('제안이 없으면 의상 문구 없이 CG 종료 + 재분석 안내만 나온다', () => {
    seed();
    useStore.getState().insertCgEndAfterLine(S1, 2);
    const t = toast()!;
    expect(t).toContain('CG 종료를 넣었습니다');
    expect(t).toContain('#CG끝');
    expect(t).not.toContain('의상 제안');
    expect(revision()).toBe(1); // 유효 삽입은 제안이 없어도 epoch 를 올린다(기존 정책)
  });
});

describe('T11 — Translation QA 캐시', () => {
  it('직접 지우지 않지만, 밀린 결과는 content anchor 가 어긋나 활성 목록에서 빠진다', () => {
    seed();
    // index 3(C)에 대한 검수 결과 — 삽입 뒤 그 자리는 종료 마커가 된다.
    const stale: TranslationQaResult = {
      anchor: {
        sceneId: S1,
        lineIndex: 3,
        sourceLocale: 'ko',
        targetLocale: 'en',
        source: 'C',
        target: 'C-en',
        speaker: '민주',
        narration: false,
      },
      verdict: 'review',
      origin: 'ai',
      category: 'meaning',
    };
    useStore.setState({ translationQa: { [S1]: [stale] } });

    useStore.getState().insertCgEndAfterLine(S1, 2);

    // 캐시 자체는 그대로 남아 있다(직접 clear 하지 않는다).
    expect(useStore.getState().translationQa[S1]).toHaveLength(1);
    // 그러나 그 좌표는 이제 종료 마커라 활성 결과로 인정되지 않는다.
    expect(activeQaIssues(useStore.getState().translationQa[S1], scenesRef()[0], 'ko')).toEqual([]);
  });
});

describe('T12 — Phase 1A voice anchor 와의 integration', () => {
  it('삽입으로 좌표가 밀려도 stale 좌표의 다른 대사에 음성이 붙지 않는다', () => {
    // [#CG, X, A, B] — A(index 2) 를 대상으로 요청해두고 그 앞(X)에서 CG 를 끝낸다.
    seed([
      { kind: 'cg', desc: '교실 전경' },
      dialogue('민주', 'X'),
      dialogue('민주', 'A'),
      dialogue('민주', 'B'),
    ]);
    // ① 요청 시점 snapshot(최초 async boundary 이전에 뜨는 값 — Phase 1A 계약)
    const reqA = collectVoiceTargets(useStore.getState().project, '민주', 'ko', 'ko').find(
      (i) => i.lineIndex === 2,
    )!;
    expect(reqA.anchorText).toBe('A');

    // ② 아직 커밋 전 · X 뒤에 CG 종료 마커 삽입 → A 는 3 으로 밀린다
    useStore.getState().insertCgEndAfterLine(S1, 1);
    expect(kinds()).toEqual(['<cg>', 'X', '<cg:end>', 'A', 'B']);
    // stale 좌표 2 에 **다른 줄**이 온다(여기서는 마커) — 그 뒤 3 이 원래 A 다.
    expect((linesOf()[3] as Dlg).text).toBe('A');

    // ③ 뒤늦게 도착한 결과를 옛 좌표로 커밋 시도
    const { scenes, locales } = applyVoiceUpdates(scenesRef(), [
      { sceneId: S1, lineIndex: reqA.lineIndex, locale: 'ko', assetId: 'asset-A', anchor: { speaker: reqA.anchorSpeaker, text: reqA.anchorText } },
    ]);
    expect(locales).toEqual([]);
    expect(scenes.find((s) => s.id === S1)!.lines.every((l) => l.kind !== 'dialogue' || !l.voiceAssetIds)).toBe(true);
  });

  it('밀려 들어온 자리에 다른 dialogue 가 오는 경우에도 그 대사에 붙지 않는다', () => {
    // [#CG, X, A, B] 에서 A(2) 요청 → A **뒤**(2)에 삽입하면 3 = 마커, 하지만 B 는 4 로 밀린다.
    // 옛 좌표 2 는 여전히 A 라 정상 커밋된다(구조가 그 줄을 밀지 않았으므로 이게 맞는 동작이다).
    seed([
      { kind: 'cg', desc: '교실 전경' },
      dialogue('민주', 'X'),
      dialogue('민주', 'A'),
      dialogue('민주', 'B'),
    ]);
    const reqB = collectVoiceTargets(useStore.getState().project, '민주', 'ko', 'ko').find(
      (i) => i.lineIndex === 3,
    )!;
    useStore.getState().insertCgEndAfterLine(S1, 1); // X 뒤 삽입 → B 는 4 로, 좌표 3 엔 A 가 온다
    expect((linesOf()[3] as Dlg).text).toBe('A'); // stale 좌표에 **다른 dialogue** 가 실제로 존재

    const { scenes } = applyVoiceUpdates(scenesRef(), [
      { sceneId: S1, lineIndex: reqB.lineIndex, locale: 'ko', assetId: 'asset-B', anchor: { speaker: reqB.anchorSpeaker, text: reqB.anchorText } },
    ]);
    const after = scenes.find((s) => s.id === S1)!.lines;
    expect((after[3] as Dlg).voiceAssetIds).toBeUndefined(); // A 에 안 붙는다
    expect((after[4] as Dlg).voiceAssetIds).toBeUndefined(); // B 로 remap 하지도 않는다
  });
});
