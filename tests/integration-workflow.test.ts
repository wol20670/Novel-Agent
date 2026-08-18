// Phase 8 통합 — 축과 축의 **연결점**만 본다(W1~W4).
//
// 각 축(의상 fold·표정 판정·파서·생성기·저장·zip·merge)은 이미 자기 테스트가 있다. 여기서 다시
// 검증하지 않는다. 이 파일이 증명하는 것은 **한 제작 workflow 로 이어 붙였을 때의 semantics** 다:
//   W1 Outfit 수락 → outfitFlags → 표정 AI 후보 변화 / 역순일 때의 복구 경로
//   W2 hide·의상 전이 시점이 미리보기 입력과 실제 .rpy 에서 같은가
//   W3 저장/zip/재분석에서 수락값·AI 배정이 살아남고 **제안은 안 실리는가**
//   W4 협업 payload 경계에 무엇이 실리는가
//
// ⚠️ 거대한 end-to-end 하나로 묶지 않는다(실패 원인 분리가 안 된다). 공통 fixture 하나 + 좁은 describe 넷.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { collectEmotionTargets, candidateKey } from '../src/generators/emotion/aiSelect';
import { mergeScenes } from '../src/project/mergeScenes';
import { exportProjectFile, importProjectFile } from '../src/project/transfer';
import { generateRenpyFiles, outfitAttrFor } from '../src/renpy/generate';
import { saveProject, loadProject } from '../src/storage/projectStore';
import {
  emptyProject,
  outfitFlags,
  spriteHiddenFlags,
  type Character,
  type Line,
  type Project,
  type Scene,
} from '../src/types';
import { contentOf, dialogue, projectWith, scene } from './fixtures';

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

// ── 공통 fixture ────────────────────────────────────────────────────────────
// 테스트 전용 예시 이름이다(production 로직은 어떤 캐릭터·의상 이름에도 의존하지 않는다 — Phase 8 §10).
//
// ⚠️ 후보 집합이 의상마다 **실제로 달라지도록** 스프라이트를 배치했다: spriteAssetId 는 그 의상에
// 없는 표정을 기본 의상으로 폴백하므로, 기본 의상에 모든 표정을 넣으면 어떤 의상을 입어도 후보가
// 같아져 W1 의 "후보가 바뀐다"가 공허해진다.
//   기본 : 기본·기쁨          → 사복(기본만 보유) = 기본·기쁨
//   교복 : 기본·화남          → 교복 = 기본·기쁨(폴백)·화남   ← 화남은 교복에서만 나온다
function minju(): Character {
  return {
    name: '민주',
    color: '#f88',
    expressions: { 기본: 'm-base', 기쁨: 'm-joy' },
    outfits: [
      { name: '교복', expressions: { 기본: 'm-uni-base', 화남: 'm-uni-angry' } },
      { name: '사복', expressions: { 기본: 'm-cas-base' } },
    ],
  };
}
function yuna(): Character {
  return {
    name: '유나',
    color: '#8ff',
    expressions: { 기본: 'y-base', 기쁨: 'y-joy' },
    outfits: [{ name: '사복', expressions: { 기본: 'y-cas-base' } }],
  };
}
function hanjisu(): Character {
  return { name: '한지수', color: '#fff', expressions: {}, isProtagonist: true };
}

const S1 = 's1';
const S2 = 's2';

/** 장면1 — 지문·주인공·합동 대사·수동 줄 의상·hide 중 전환·show 복원·유효 CG cutoff 를 한 줄기에 담는다. */
function scene1(): Scene {
  return scene({
    id: S1,
    title: '카페',
    background: '카페 실내',
    cg: ['포옹'],
    outfits: { 민주: '교복' }, // scene-manual baseline
    lines: [
      { kind: 'narration', text: '문이 열린다.' },
      dialogue('민주', '다녀왔어.'),
      dialogue('한지수', '어서 와.'), // 주인공 — 화면에 안 서고 표정 대상도 아니다
      dialogue('민주 & 유나', '안녕!', { members: ['민주', '유나'] }), // 합동
      dialogue('민주', '갈아입고 올게.', { outfits: { 민주: '사복' } }), // 수동 줄 의상
      dialogue('민주', '이제 편해.'),
      { kind: 'narration', text: '민주가 자리를 비운다.', hideSprites: true },
      { kind: 'narration', text: '옷장을 뒤지는 소리.', outfits: { 민주: '교복' } }, // 숨김 중 전환
      dialogue('민주', '역시 교복이 낫네.', { hideSprites: false }), // show 복원
      { kind: 'cg', desc: '포옹' }, // 유효 CG → 여기부터 writable 아님
      dialogue('민주', 'CG 뒤의 대사.'),
    ],
  });
}

/** 장면2 — 경계 비전파 확인 + orphan CG 마커만 있는 edge case(그래서 전체 writable 이다). */
function scene2(): Scene {
  return scene({
    id: S2,
    title: '골목',
    cg: ['노을'],
    lines: [
      { kind: 'cg', desc: '설명이 다른 마커' }, // orphan — CG 를 켜지 않는다
      dialogue('민주', '여기서도 얘기하자.'),
    ],
  });
}

function baseProject(): Project {
  return projectWith([scene1(), scene2()], { characters: [hanjisu(), minju(), yuna()] });
}

const sceneOf = (id: string) => useStore.getState().project.scenes.find((s) => s.id === id)!;
const dlg = (sc: Scene, i: number) => sc.lines[i] as Extract<Line, { kind: 'dialogue' }>;

/** 그 줄의 (화자, 의상) 후보 목록 — 표정 AI 가 실제로 모델에 보여주는 정답 공간. */
function candidatesAt(project: Project, sceneId: string, lineIndex: number): string[] {
  const batch = collectEmotionTargets(project).find((b) => b.sceneId === sceneId);
  const item = batch?.items.find((it) => it.i === lineIndex);
  if (!batch || !item) return [];
  return batch.candidatesByKey.get(candidateKey(item.speaker, item.outfit)) ?? [];
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('window', { confirm: () => true });
  useStore.setState({
    project: baseProject(),
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
    busy: {},
    toast: null,
    selectedSceneId: S1,
  });
});

// ── W1 ──────────────────────────────────────────────────────────────────────
describe('W1 — Outfit 수락 → outfitFlags → 표정 AI 후보, 그리고 역순일 때의 복구', () => {
  const suggestion = {
    sceneId: S2,
    lineIndex: 1,
    character: '민주',
    outfit: '교복',
    reason: '교복으로 갈아입었다고 말함',
    lineKey: 'dialogue|민주|여기서도 얘기하자.',
  };

  it('수락 전후로 그 줄의 표정 후보가 실제로 달라진다(교복에만 있는 화남이 생긴다)', () => {
    expect(candidatesAt(useStore.getState().project, S2, 1)).toEqual(['기본', '기쁨']);

    useStore.setState({ outfitSuggestions: { [S2]: [suggestion] } });
    useStore.getState().applyOutfitSuggestion(S2, 1, '민주');

    expect(dlg(sceneOf(S2), 1).outfits).toEqual({ 민주: '교복' }); // ordinary manual 값으로 들어간다
    expect(outfitFlags(sceneOf(S2), undefined, '민주')[1]).toBe('교복');
    // Phase 15: 후보는 그 의상이 **직접** 가진 칸뿐이다(화면의 pool 규칙). 교복 = {기본, 화남} 이라
    // 기본 의상에만 있는 '기쁨' 은 교복 줄에서 표시될 수 없어(neutral 로 강등) 후보에서 빠진다.
    expect(candidatesAt(useStore.getState().project, S2, 1)).toEqual(['기본', '화남']);
  });

  it('수락은 그 항목만 빼고 기존 표정 값은 절대 지우지 않는다', () => {
    useStore.setState({
      outfitSuggestions: {
        [S2]: [suggestion, { ...suggestion, character: '유나', outfit: '사복' }],
      },
    });
    // 그 줄에 사람이 정한 표정과 AI 배정이 이미 있다고 하자.
    const sc = sceneOf(S2);
    useStore.setState({
      project: {
        ...useStore.getState().project,
        scenes: useStore.getState().project.scenes.map((s) =>
          s.id !== S2
            ? s
            : { ...s, lines: s.lines.map((l, i) => (i === 1 ? { ...l, emotionAuto: '기쁨' } : l)) },
        ),
      },
    });

    useStore.getState().applyOutfitSuggestion(S2, 1, '민주');

    expect(dlg(sceneOf(S2), 1).emotionAuto).toBe('기쁨'); // 자동 삭제 없음(정책)
    expect(useStore.getState().outfitSuggestions[S2]).toHaveLength(1); // 나머지 제안은 유지
  });

  it('Expression 먼저 → 의상 변경 순서도 초기화 한 번으로 복구된다', () => {
    // 표정을 먼저 배정한 상태를 만든다.
    useStore.setState({
      project: {
        ...useStore.getState().project,
        scenes: useStore.getState().project.scenes.map((s) =>
          s.id !== S2
            ? s
            : { ...s, lines: s.lines.map((l, i) => (i === 1 ? { ...l, emotionAuto: '기쁨' } : l)) },
        ),
      },
    });
    // 이미 값이 있으니 재실행해도 그 줄은 대상이 아니다 — 이게 "역순이 곤란한" 이유다.
    expect(candidatesAt(useStore.getState().project, S2, 1)).toEqual([]);

    useStore.setState({ outfitSuggestions: { [S2]: [suggestion] } });
    useStore.getState().applyOutfitSuggestion(S2, 1, '민주');
    expect(candidatesAt(useStore.getState().project, S2, 1)).toEqual([]); // 여전히 스킵된다

    useStore.getState().clearEmotionAuto(); // ← 사용자가 명시적으로 누르는 유일한 복구 경로

    expect(dlg(sceneOf(S2), 1).emotionAuto).toBeUndefined();
    // 이제 새 의상(교복) 기준 후보로 다시 대상이 된다(교복이 직접 가진 칸 = 기본·화남).
    expect(candidatesAt(useStore.getState().project, S2, 1)).toEqual(['기본', '화남']);
  });

  it('Scene 경계는 전파되지 않는다 — 장면2 수락이 장면1 baseline 을 건드리지 않는다', () => {
    useStore.setState({ outfitSuggestions: { [S2]: [suggestion] } });
    useStore.getState().applyOutfitSuggestion(S2, 1, '민주');

    expect(sceneOf(S1).outfits).toEqual({ 민주: '교복' }); // 원래 값 그대로
    expect(outfitFlags(sceneOf(S1), undefined, '민주')[0]).toBe('교복');
  });
});

// ── W2 ──────────────────────────────────────────────────────────────────────
describe('W2 — hide·의상 전이가 공유 판정 함수와 생성된 .rpy 에서 같은 시점에 일어난다', () => {
  it('outfitFlags/spriteHiddenFlags(미리보기 입력)가 대본 흐름대로 접힌다', () => {
    const sc = scene1();
    const flags = outfitFlags(sc, undefined, '민주');
    const hidden = spriteHiddenFlags(sc);

    expect(flags[1]).toBe('교복'); // scene-manual baseline
    expect(flags[4]).toBe('사복'); // 수동 줄 의상은 **그 줄부터**
    expect(flags[5]).toBe('사복');
    expect(hidden[6]).toBe(true); // 지문에서 숨김
    expect(flags[7]).toBe('교복'); // 숨김 중에도 전환은 기록된다
    expect(hidden[8]).toBe(false); // 다음 대사에서 복원
    expect(flags[8]).toBe('교복');
  });

  it('.rpy 가 복원 시 의상+표정 속성을 다시 온전히 지정한다(속성 없는 show 금지)', () => {
    const { files } = generateRenpyFiles(baseProject());
    const script = contentOf(files, 'game/script.rpy');
    const shows = script.split('\n').filter((l) => l.trim().startsWith('show '));

    // hide 뒤 복원 show 는 반드시 <의상> <표정> 을 모두 실어야 한다(태그의 속성 기억이 사라지므로).
    const uni = outfitAttrFor('교복');
    const restored = shows.filter((l) => l.includes(uni));
    expect(restored.length).toBeGreaterThan(0);
    for (const l of restored) {
      // "show c_N <의상> <표정> at ..." — 토큰이 4개 이상이어야 속성이 다 실린 것이다.
      expect(l.trim().split(/\s+/).length).toBeGreaterThanOrEqual(5);
    }
    // 사복 구간도 실제로 출력에 나타난다(전이가 생성기까지 도달했다는 증거).
    expect(shows.some((l) => l.includes(outfitAttrFor('사복')))).toBe(true);
  });

  it('CG 이후 줄은 의상 전환의 쓰기 대상이 아니다(dead write 방지)', () => {
    const sc = scene1();
    // 유효 CG 마커가 index 9 → 그 뒤는 생성기가 복원·의상 동기화를 모두 막는다.
    const cgIdx = sc.lines.findIndex((l) => l.kind === 'cg');
    expect(cgIdx).toBe(9);
    const { files } = generateRenpyFiles(baseProject());
    const script = contentOf(files, 'game/script.rpy');
    // ⚠️ 반드시 **그 장면의 label 블록 안에서만** 본다 — 파일 끝까지 자르면 다음 장면(장면2)의
    // 정상적인 show 까지 걸려 테스트가 거짓으로 실패한다.
    const cgBlock = script.split(/\nlabel /).find((b) => b.includes('scene cg'));
    expect(cgBlock).toBeDefined();
    const afterCg = cgBlock!.slice(cgBlock!.indexOf('scene cg'));
    expect(afterCg).not.toContain('show c_'); // CG 활성 이후 스프라이트 show 없음
  });

});

// ── W2b ─────────────────────────────────────────────────────────────────────
// ⚠️ **증명 범위를 정확히 적는다**: 이 describe 는 `resolveEmotion` 의 우선순위가 **Ren'Py 생성
// 결과까지** 동일하게 반영되는지만 본다. ScenePlayer(React) 를 render 하지 않으므로 "미리보기를
// 테스트한다"고 주장하지 않는다 — 미리보기 쪽 연결(`ScenePlayer.tsx` 의 emoOf → resolveEmotion)은
// audit 사실로만 남기고, 이 Phase 에서 preview 전용 abstraction·render 테스트를 만들지 않는다.
//
// ⚠️ 한 장면의 연속 대사와 `show` 문이 항상 1:1 이라고 **가정하지 않는다**(generator 가 중복 show 를
// 생략하도록 바뀌어도 이 테스트는 흔들리면 안 된다). 그래서 case 마다 **독립 프로젝트**를 만들어
// 그 캐릭터의 첫 show 속성 하나만 뽑는다.
describe('W2b — resolveEmotion 우선순위가 Ren\'Py 생성 결과까지 동일하게 반영된다', () => {
  /** 화남·기쁨·기본 스프라이트를 모두 보유(폴백에 가려지지 않아야 속성이 실제로 구분된다). */
  function sprited(): Character {
    return {
      name: '민주',
      color: '#f88',
      expressions: { 기본: 'm-base', 기쁨: 'm-joy', 화남: 'm-angry' },
    };
  }

  /** 대사 한 줄짜리 프로젝트를 생성해 그 캐릭터 show 문의 **표정 속성**을 뽑는다. */
  function showAttr(extra: Partial<Extract<Line, { kind: 'dialogue' }>>): string {
    const project = projectWith(
      [scene({ id: 'w2b', lines: [dialogue('민주', '책상 위에 노트가 있다.', extra)] })],
      { characters: [sprited()] },
    );
    const { files } = generateRenpyFiles(project);
    const script = contentOf(files, 'game/script.rpy');
    const show = script.split('\n').find((l) => l.trim().startsWith('show c_'));
    expect(show).toBeDefined();
    // "show c_1 <의상속성> <표정속성> at vn_char(50)"
    const attr = show!.trim().split(/\s+/)[3];
    expect(attr).toBeTruthy();
    return attr;
  }

  it('작가 태그와 AI 배정이 같은 표정이면 생성 속성도 같다(생성기가 emotionAuto 를 반영한다)', () => {
    expect(showAttr({ emotionAuto: '화남' })).toBe(showAttr({ emotion: '화남' }));
  });

  it('아무 값도 없는 줄은 다른 속성이 된다(사슬이 실제로 값을 구분한다)', () => {
    expect(showAttr({})).not.toBe(showAttr({ emotion: '화남' }));
  });

  it('작가 태그가 AI 배정을 이긴다 — 출력 속성이 작가 쪽을 따른다', () => {
    const manual = showAttr({ emotion: '화남' });
    const auto = showAttr({ emotionAuto: '기쁨' });
    // 두 값이 애초에 구분돼야 아래 단언이 의미를 갖는다(같으면 무엇을 골라도 통과하는 공허한 비교).
    expect(auto).not.toBe(manual);
    expect(showAttr({ emotion: '화남', emotionAuto: '기쁨' })).toBe(manual);
  });
});

// ── W3 ──────────────────────────────────────────────────────────────────────
describe('W3 — 저장/zip/재분석에서 수락값·AI 배정은 살고 제안은 실리지 않는다', () => {
  /** 수락한 줄 의상 + AI 배정 + 검수 대기 제안이 공존하는 상태를 만든다. */
  function seedMixedState() {
    useStore.setState({
      project: {
        ...baseProject(),
        scenes: baseProject().scenes.map((s) =>
          s.id !== S2
            ? s
            : {
                ...s,
                lines: s.lines.map((l, i) =>
                  i === 1 ? { ...l, outfits: { 민주: '교복' }, emotionAuto: '화남' } : l,
                ),
              },
        ),
      },
      outfitSuggestions: {
        [S1]: [
          {
            sceneId: S1,
            lineIndex: 5,
            character: '민주',
            outfit: '교복',
            reason: '검수 대기 중',
            lineKey: 'dialogue|민주|이제 편해.',
          },
        ],
      },
      outfitSuggestionRevision: 4,
    });
  }

  it('실제 saveProject → loadProject 경로에서 수락값과 emotionAuto 가 복원된다', () => {
    seedMixedState();
    const { project, assets } = useStore.getState();

    saveProject(project, assets);
    const loaded = loadProject();

    expect(loaded).not.toBeNull();
    const line = loaded!.project.scenes.find((s) => s.id === S2)!.lines[1] as Extract<
      Line,
      { kind: 'dialogue' }
    >;
    expect(line.outfits).toEqual({ 민주: '교복' });
    expect(line.emotionAuto).toBe('화남');
    // 제안은 project 밖 런타임 state 라 저장 대상 자체가 아니다.
    expect(JSON.stringify(loaded!.project)).not.toContain('검수 대기 중');
  });

  it('실제 .npproj.zip 왕복에서도 같다(제안 metadata 는 실리지 않는다)', async () => {
    seedMixedState();
    // ⚠️ 에셋 참조가 있으면 exportProjectFile 이 getAsset(IndexedDB)을 건드리는데 vitest 기본
    // 환경(node)엔 indexedDB 가 없다. IDB 목을 새로 만들지 않고 **참조만 제거**해서 그 경로를
    // 피한다(transfer-roundtrip.test.ts 가 같은 이유로 "참조 0" 픽스처를 쓴다).
    // 여기서 증명하려는 건 스프라이트가 아니라 **줄 메타(Line.outfits·emotionAuto)의 왕복**이다.
    const src = useStore.getState().project;
    const assetFree: Project = {
      ...src,
      characters: src.characters.map((c) => ({
        ...c,
        expressions: {},
        outfits: c.outfits?.map((o) => ({ ...o, expressions: {} })),
      })),
    };
    const { blob } = await exportProjectFile(assetFree, {});
    const restored = (await importProjectFile(blob)).project;

    const line = restored.scenes.find((s) => s.id === S2)!.lines[1] as Extract<
      Line,
      { kind: 'dialogue' }
    >;
    expect(line.outfits).toEqual({ 민주: '교복' });
    expect(line.emotionAuto).toBe('화남');

    const payload = JSON.stringify(restored);
    expect(payload).not.toContain('lineKey');
    expect(payload).not.toContain('검수 대기 중');
  });

  it('재분석 merge 에서 수락값은 whole-record 로, emotionAuto 는 승계로 남는다', () => {
    seedMixedState();
    const prev = useStore.getState().project.scenes;
    // 대본을 다시 분석한 결과(같은 텍스트, 태그 없음)를 흉내낸다.
    const reparsed = prev.map((s) => ({
      ...s,
      outfits: s.id === S1 ? { 민주: '교복' } : undefined,
      lines: s.lines.map((l) =>
        l.kind === 'dialogue'
          ? { kind: 'dialogue' as const, speaker: l.speaker, text: l.text, members: l.members }
          : l.kind === 'narration'
            ? { kind: 'narration' as const, text: l.text }
            : l,
      ),
    }));

    const merged = mergeScenes(prev, reparsed, 'merge');
    const line = merged.find((s) => s.id === S2)!.lines[1] as Extract<Line, { kind: 'dialogue' }>;

    expect(line.outfits).toEqual({ 민주: '교복' }); // 대본에 태그가 없으면 앱 값이 유지된다
    expect(line.emotionAuto).toBe('화남'); // AI 배정도 승계
  });

  it('생성된 .rpy 는 수락값을 실제 의상 전환으로 낸다', () => {
    seedMixedState();
    const { files } = generateRenpyFiles(useStore.getState().project);
    const script = contentOf(files, 'game/script.rpy');
    expect(script).toContain(outfitAttrFor('교복'));
  });
});

// ── W4 ──────────────────────────────────────────────────────────────────────
describe('W4 — 협업 payload 경계', () => {
  // ⚠️ 이건 **payload 경계 assertion 이지 network e2e 가 아니다.** 실제 송신 경계는
  // collab/sync.ts 의 `pushProject(project)` 가 `data: project` 로 넣는 그 객체이고,
  // 접근자는 context.ts 의 collabHooks().getProject() = get().project 다. Supabase mock
  // framework 를 만들지 않고 그 객체가 무엇을 담고 무엇을 안 담는지만 고정한다.
  it('경계 객체(project)에 수락값·emotionAuto 는 있고 제안 런타임 state 는 없다', () => {
    useStore.setState({
      project: {
        ...baseProject(),
        scenes: baseProject().scenes.map((s) =>
          s.id !== S2
            ? s
            : {
                ...s,
                lines: s.lines.map((l, i) =>
                  i === 1 ? { ...l, outfits: { 민주: '사복' }, emotionAuto: '기쁨' } : l,
                ),
              },
        ),
      },
      outfitSuggestions: {
        [S1]: [
          {
            sceneId: S1,
            lineIndex: 5,
            character: '민주',
            outfit: '교복',
            reason: '협업에 새면 안 되는 값',
            lineKey: 'dialogue|민주|이제 편해.',
          },
        ],
      },
      outfitSuggestionRevision: 9,
      outfitProgress: { done: 1, total: 2 },
    });

    const payload = JSON.stringify(useStore.getState().project);

    expect(payload).toContain('사복');
    expect(payload).toContain('기쁨');
    expect(payload).not.toContain('outfitSuggestion');
    expect(payload).not.toContain('outfitProgress');
    expect(payload).not.toContain('협업에 새면 안 되는 값');
    expect(payload).not.toContain('lineKey');
    // 런타임 state 는 여전히 store 에 살아 있다(경계 밖에 있을 뿐 사라진 게 아니다).
    expect(useStore.getState().outfitSuggestions[S1]).toHaveLength(1);
    expect(useStore.getState().outfitSuggestionRevision).toBe(9);
  });
});
