// Outfit AI 의 stateful semantics — O12·O23·O24·O26·O27(commit 횟수).
// 범용 zustand 테스트 프레임워크나 대형 하네스를 만들지 않는다: 실제 store 를 그대로 import 해
// localStorage/window/fetch 만 최소 stub 하고 액션을 호출한다(store 는 node 환경에서 안전하게 import 된다 —
// isFolderSyncSupported 는 typeof window 가드, IndexedDB 접근은 전부 지연).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from '../src/store';
import { backgroundKey } from '../src/renpy/generate';
import { outfitLineKey, type OutfitSuggestion } from '../src/generators/outfit';
import { emptyProject, type Character, type Line, type Project, type Scene } from '../src/types';
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

function heroine(name = '민주', outfits = ['교복', '사복']): Character {
  return {
    name,
    color: '#fff',
    expressions: { 기본: 'a' },
    outfits: outfits.map((o) => ({ name: o, expressions: { 기본: `a-${o}` } })),
  };
}

const SCENE_ID = 's1';
function baseScene(): Scene {
  return scene({
    id: SCENE_ID,
    lines: [dialogue('민주', 'a'), dialogue('민주', 'b'), dialogue('민주', 'c')],
  });
}
function baseProject(): Project {
  return projectWith([baseScene()], { characters: [heroine()] });
}

function sugFor(sc: Scene, lineIndex: number, outfit = '사복', character = '민주'): OutfitSuggestion {
  return {
    sceneId: sc.id,
    lineIndex,
    character,
    outfit,
    lineKey: outfitLineKey(sc.lines[lineIndex]),
  };
}

/** 제안 2건이 든 초기 상태를 세팅한다. */
function seed(project: Project = baseProject()): { project: Project; sc: Scene } {
  const sc = project.scenes[0];
  useStore.setState({
    project,
    outfitSuggestions: { [SCENE_ID]: [sugFor(sc, 1), sugFor(sc, 2, '교복')] },
    outfitSuggestionRevision: 10,
    openaiKey: 'test-key',
  });
  return { project, sc };
}

const lineOutfits = (i: number) =>
  (useStore.getState().project.scenes[0].lines[i] as Extract<Line, { kind: 'dialogue' }>).outfits;
const suggestions = () => useStore.getState().outfitSuggestions;
const revision = () => useStore.getState().outfitSuggestionRevision;

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  // 배치 액션이 window.confirm 을 부른다(node 환경엔 window 가 없다).
  vi.stubGlobal('window', { confirm: () => true });
  useStore.setState({
    project: emptyProject(),
    outfitSuggestions: {},
    outfitSuggestionRevision: 0,
    busy: {},
    outfitProgress: null,
  });
});

describe('O26 — 개별 적용/무시 vs 수동 편집의 semantics 차이', () => {
  it('개별 적용은 그 항목만 빼고 나머지는 유지하며 revision 을 올린다', () => {
    const { sc } = seed();
    useStore.getState().applyOutfitSuggestion(SCENE_ID, 1, '민주');

    expect(lineOutfits(1)).toEqual({ 민주: '사복' });
    expect(suggestions()[SCENE_ID]).toHaveLength(1); // ⚠️ 전체 clear 가 아니다
    expect(suggestions()[SCENE_ID][0].lineIndex).toBe(2);
    expect(revision()).toBe(11); // canonical write 가 있었으므로 +1
  });

  it('무시는 그 항목만 빼고 canonical·revision 을 안 건드린다', () => {
    seed();
    useStore.getState().ignoreOutfitSuggestion(SCENE_ID, 1, '민주');

    expect(lineOutfits(1)).toBeUndefined();
    expect(suggestions()[SCENE_ID]).toHaveLength(1);
    expect(revision()).toBe(10); // 그대로
  });

  it('장면 전체 무시는 그 장면 키만 지우고 revision 을 안 올린다', () => {
    seed();
    useStore.getState().ignoreSceneOutfitSuggestions(SCENE_ID);
    expect(suggestions()).toEqual({});
    expect(revision()).toBe(10);
  });

  it('수동 setLineOutfit 은 반대로 제안을 전체 clear + revision↑ 한다', () => {
    seed();
    useStore.getState().setLineOutfit(SCENE_ID, 0, '민주', '교복');

    expect(lineOutfits(0)).toEqual({ 민주: '교복' });
    expect(suggestions()).toEqual({}); // 전체 clear
    expect(revision()).toBe(11);
  });

  it('✕(해제)도 같은 경로다 — 마지막 키면 undefined 로 정리된다', () => {
    const project = baseProject();
    project.scenes[0] = {
      ...project.scenes[0],
      lines: project.scenes[0].lines.map((l, i) => (i === 0 ? { ...l, outfits: { 민주: '교복' } } : l)),
    };
    seed(project);
    useStore.getState().setLineOutfit(SCENE_ID, 0, '민주', undefined);
    expect(lineOutfits(0)).toBeUndefined();
  });

  // 같은 줄 다중 캐릭터는 수동 진입점(장면 카드 👗)의 핵심 시나리오다. O5 는 순수 mergeLineOutfit
  // 만 보므로, store 배선(setLineOutfit → patchLineOutfit)이 그 규칙을 그대로 통과시키는지는
  // 여기서 고정한다. ⚠️ 수동 UI 가 레코드를 직접 조립하면 이 보장이 깨진다.
  it('수동 add 는 같은 줄의 다른 캐릭터 지정을 보존한다', () => {
    const project = projectWith(
      [
        scene({
          id: SCENE_ID,
          lines: [
            dialogue('민주', 'a', { outfits: { 지수: '교복' } }),
            dialogue('지수', 'b'),
            dialogue('민주', 'c'),
          ],
        }),
      ],
      { characters: [heroine(), heroine('지수')] },
    );
    seed(project);
    useStore.getState().setLineOutfit(SCENE_ID, 0, '민주', '사복');
    expect(lineOutfits(0)).toEqual({ 지수: '교복', 민주: '사복' });
  });

  it('수동 change 는 그 캐릭터 값만 교체한다(다른 키·키 개수 불변)', () => {
    const project = projectWith(
      [
        scene({
          id: SCENE_ID,
          lines: [
            dialogue('민주', 'a', { outfits: { 민주: '교복', 지수: '사복' } }),
            dialogue('지수', 'b'),
            dialogue('민주', 'c'),
          ],
        }),
      ],
      { characters: [heroine('민주', ['교복', '사복', '수영복']), heroine('지수')] },
    );
    seed(project);
    useStore.getState().setLineOutfit(SCENE_ID, 0, '민주', '수영복');
    expect(lineOutfits(0)).toEqual({ 민주: '수영복', 지수: '사복' });
  });

  it('적용 불가/no-op 제안은 목록에서 제거하되 canonical·revision 은 안 건드린다(무한 실패 방지)', () => {
    const sc = baseScene();
    useStore.setState({
      project: projectWith([sc], { characters: [heroine()] }),
      // lineKey 가 안 맞는 stale 제안 + 이미 그 의상인 no-op 제안
      outfitSuggestions: {
        [SCENE_ID]: [
          { ...sugFor(sc, 1), lineKey: 'dialogue|민주|옛날 대사' },
          sugFor(sc, 2, '기본'),
        ],
      },
      outfitSuggestionRevision: 10,
    });

    useStore.getState().applyOutfitSuggestion(SCENE_ID, 1, '민주');
    expect(suggestions()[SCENE_ID]).toHaveLength(1);
    expect(lineOutfits(1)).toBeUndefined();
    expect(revision()).toBe(10);

    useStore.getState().applyOutfitSuggestion(SCENE_ID, 2, '민주');
    expect(suggestions()[SCENE_ID]).toBeUndefined(); // 빈 배열이 아니라 키째 제거
    expect(revision()).toBe(10);
  });
});

describe('O27 — 일괄 적용은 단일 커밋이고 write 가 있을 때만 revision 을 올린다', () => {
  it('scenes 참조가 정확히 1회만 바뀐다(항목마다 커밋하지 않는다)', () => {
    const { sc } = seed();
    let commits = 0;
    let prevScenes = useStore.getState().project.scenes;
    const unsub = useStore.subscribe((s) => {
      if (s.project.scenes !== prevScenes) {
        commits += 1;
        prevScenes = s.project.scenes;
      }
    });

    useStore.getState().applySceneOutfitSuggestions(SCENE_ID);
    unsub();

    expect(commits).toBe(1);
    expect(lineOutfits(1)).toEqual({ 민주: '사복' });
    expect(lineOutfits(2)).toEqual({ 민주: '교복' });
    expect(suggestions()).toEqual({});
    expect(revision()).toBe(11); // 전체 작업에서 +1 한 번
    expect(sc.lines[1]).toBeDefined();
  });

  it('전부 스킵되면 커밋도 revision 증가도 없다', () => {
    const sc = baseScene();
    useStore.setState({
      project: projectWith([sc], { characters: [heroine()] }),
      outfitSuggestions: { [SCENE_ID]: [sugFor(sc, 1, '기본')] }, // no-op
      outfitSuggestionRevision: 10,
    });
    const before = useStore.getState().project.scenes;

    useStore.getState().applySceneOutfitSuggestions(SCENE_ID);

    expect(useStore.getState().project.scenes).toBe(before); // 커밋 없음
    expect(revision()).toBe(10);
    expect(suggestions()).toEqual({});
  });
});

describe('O23 — invalidation 은 실제 mutation path 기준(액션 이름이 아니라 바뀌는 필드)', () => {
  type Case = [name: string, run: () => void];

  const invalidating: Case[] = [
    ['setLineText', () => useStore.getState().setLineText(SCENE_ID, 0, '바뀐 대사')],
    ['setLineHideSprites', () => useStore.getState().setLineHideSprites(SCENE_ID, 0, true)],
    ['setSceneHideSprites', () => useStore.getState().setSceneHideSprites(SCENE_ID, true)],
    ['setLineOutfit', () => useStore.getState().setLineOutfit(SCENE_ID, 0, '민주', '교복')],
    ['updateScene({title})', () => useStore.getState().updateScene(SCENE_ID, { title: '새 제목' })],
    ['updateScene({background})', () => useStore.getState().updateScene(SCENE_ID, { background: '해변' })],
    ['updateScene({direction})', () => useStore.getState().updateScene(SCENE_ID, { direction: ['x'] })],
    ['updateScene({outfits})', () => useStore.getState().updateScene(SCENE_ID, { outfits: { 민주: '교복' } })],
    ['updateScene({cg})', () => useStore.getState().updateScene(SCENE_ID, { cg: ['키스'] })],
    ['updateScene({lines})', () => useStore.getState().updateScene(SCENE_ID, { lines: [] })],
    ['updateScene({hideSprites})', () => useStore.getState().updateScene(SCENE_ID, { hideSprites: true })],
    // ⚠️ 이 둘은 "에셋 액션"처럼 보이지만 실제로 바꾸는 건 scene.background / scene.cg **문자열**이다
    // (renameCgGroup 은 CG cutoff 까지 움직인다). 아래 keeping 목록의 importCgGroup 계열과 대비된다.
    [
      'renameBackgroundGroup',
      () => {
        useStore.setState({
          project: {
            ...useStore.getState().project,
            scenes: [{ ...useStore.getState().project.scenes[0], background: '카페' }],
          },
        });
        useStore.setState({ outfitSuggestionRevision: 10 }); // 위 setState 는 액션이 아니라 revision 불변
        useStore.getState().renameBackgroundGroup(backgroundKey(useStore.getState().project.scenes[0]), '해변');
        expect(useStore.getState().project.scenes[0].background).toBe('해변'); // 실제로 바뀌었는지
      },
    ],
    [
      'renameCgGroup',
      () => {
        useStore.setState({
          project: {
            ...useStore.getState().project,
            scenes: [{ ...useStore.getState().project.scenes[0], cg: ['키스'] }],
          },
          outfitSuggestionRevision: 10,
        });
        useStore.getState().renameCgGroup('키스', '포옹');
        expect(useStore.getState().project.scenes[0].cg).toEqual(['포옹']);
      },
    ],
    ['addOutfit', () => useStore.getState().addOutfit('민주', '드레스')],
    ['addOutfitRule', () => useStore.getState().addOutfitRule('민주', '교복', '학교')],
    ['removeOutfitRule', () => useStore.getState().removeOutfitRule(0)],
    ['updateCharacter({name})', () => useStore.getState().updateCharacter('민주', { name: '민주2' })],
    ['updateCharacter({isProtagonist})', () => useStore.getState().updateCharacter('민주', { isProtagonist: true })],
    ['updateCharacter({outfits})', () => useStore.getState().updateCharacter('민주', { outfits: [] })],
    ['resetAll', () => useStore.getState().resetAll()],
  ];

  it.each(invalidating)('%s → 제안 전체 clear + revision↑', (_name, run) => {
    seed();
    run();
    expect(suggestions()).toEqual({});
    expect(revision()).toBe(11);
  });

  const keeping: Case[] = [
    ['updateScene({bgm})', () => useStore.getState().updateScene(SCENE_ID, { bgm: '노래' })],
    ['updateScene({bgmAssetId})', () => useStore.getState().updateScene(SCENE_ID, { bgmAssetId: 'a1' })],
    ['updateScene({backgroundAssetId})', () => useStore.getState().updateScene(SCENE_ID, { backgroundAssetId: 'a2' })],
    ['updateScene({status})', () => useStore.getState().updateScene(SCENE_ID, { status: 'approved' })],
    ['updateCharacter({color})', () => useStore.getState().updateCharacter('민주', { color: '#000' })],
    ['updateCharacter({side})', () => useStore.getState().updateCharacter('민주', { side: 'left' })],
    // renderability(스프라이트 유무)는 candidate identity 가 아니다 — 의상 **이름**만 정답 공간이고
    // 경고는 렌더 시점에 계산한다. 그래서 입화가 붙고 떨어지는 건 제안을 무효화하지 않는다.
    // (importSprite 등 실제 업로드 액션은 IndexedDB 를 타므로 여기선 같은 필드 변경으로 대신 증명한다.)
    [
      'updateCharacter({expressions}) = 스프라이트 변경',
      () => useStore.getState().updateCharacter('민주', { expressions: { 기본: 'new-asset' } }),
    ],
    ['setSceneStatus', () => useStore.getState().setSceneStatus(SCENE_ID, 'approved')],
    ['setLineEmotion', () => useStore.getState().setLineEmotion(SCENE_ID, 0, '기쁨')],
    ['setLineTranslation', () => useStore.getState().setLineTranslation(SCENE_ID, 0, 'en', 'hi')],
    ['addExpression', () => useStore.getState().addExpression('설렘')],
    ['setExpressionNote', () => useStore.getState().setExpressionNote('기본', '평온')],
    ['renameExpression', () => useStore.getState().renameExpression('기쁨', '환희')],
    ['approveAll', () => useStore.getState().approveAll()],
  ];

  it.each(keeping)('%s → 제안 유지 + revision 불변', (_name, run) => {
    seed();
    run();
    expect(suggestions()[SCENE_ID]).toHaveLength(2);
    expect(revision()).toBe(10);
  });

  it('O12 — 의상 삭제는 제안을 무효화하고 Line.outfits 참조도 정리한다', async () => {
    const project = baseProject();
    project.scenes[0] = {
      ...project.scenes[0],
      lines: project.scenes[0].lines.map((l, i) => (i === 0 ? { ...l, outfits: { 민주: '사복' } } : l)),
    };
    seed(project);

    await useStore.getState().removeOutfit('민주', '사복');

    expect(suggestions()).toEqual({});
    expect(revision()).toBeGreaterThan(10);
    expect(lineOutfits(0)).toBeUndefined(); // stripOutfitRefs 가 정리
  });

  it('존재하지 않는 의상 삭제는 아무것도 안 바꾼다(불필요한 revision 증가 없음)', async () => {
    seed();
    await useStore.getState().removeOutfit('민주', '없는의상');
    expect(revision()).toBe(10);
    expect(suggestions()[SCENE_ID]).toHaveLength(2);
  });
});

describe('O14 — 제안은 저장·zip·협업 어디에도 실리지 않는다(수락값만 실린다)', () => {
  it('제안이 있어도 직렬화되는 project 에는 흔적이 없다', () => {
    seed();
    // saveProject(localStorage)·.npproj.zip(project JSON 통째)·협업 push 는 전부 이 객체를 직렬화한다.
    const serialized = JSON.stringify(useStore.getState().project);
    expect(serialized).not.toContain('outfitSuggestion');
    expect(serialized).not.toContain('lineKey');
    expect(serialized).not.toContain('reason');
    // 제안은 store 에만 살아 있다(= 새로고침하면 사라진다).
    expect(suggestions()[SCENE_ID]).toHaveLength(2);
  });

  it('수락한 값은 반대로 project 안에 정상적으로 들어간다', () => {
    seed();
    useStore.getState().applyOutfitSuggestion(SCENE_ID, 1, '민주');
    const serialized = JSON.stringify(useStore.getState().project);
    expect(serialized).toContain('사복'); // Line.outfits 로 저장 경로에 올라탄다
    expect(serialized).not.toContain('lineKey'); // 제안 metadata 는 여전히 안 실린다
  });
});

describe('O24 — in-flight run stale-commit guard', () => {
  /** 첫 fetch 호출을 붙잡아 두고, 테스트가 원할 때 응답을 흘려보낸다. */
  function deferredFetch(body: unknown) {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = vi.fn(async () => {
      await gate;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] }),
      } as unknown as Response;
    });
    return { fetchMock, release };
  }

  it('실행 중 대본이 편집되면 그 run 의 제안을 통째로 버린다', async () => {
    // 요청 1회짜리 소형 장면(PACE sleep 을 안 타게 — callIndex>0 에서만 sleep 한다)
    const sc = baseScene();
    useStore.setState({
      project: projectWith([sc], { characters: [heroine()] }),
      outfitSuggestions: {},
      outfitSuggestionRevision: 0,
      openaiKey: 'test-key',
    });

    const { fetchMock, release } = deferredFetch({
      changes: [{ i: 1, character: '민주', outfit: '사복' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const run = useStore.getState().autoSuggestOutfitsAll();
    // 요청이 떠 있는 동안 사용자가 대본을 고친다 → epoch↑
    useStore.getState().setLineText(SCENE_ID, 0, '편집된 대사');
    release();
    await run;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(suggestions()).toEqual({}); // 낡은 입력으로 만든 결과는 부분 채택도 하지 않는다
  });

  it('실행 중 의상이 삭제되면(async 액션) 첫 await 이전에 epoch 이 올라 stale commit 이 막힌다', async () => {
    const sc = baseScene();
    useStore.setState({
      project: projectWith([sc], { characters: [heroine()] }),
      outfitSuggestions: {},
      outfitSuggestionRevision: 0,
      openaiKey: 'test-key',
    });

    const { fetchMock, release } = deferredFetch({
      changes: [{ i: 1, character: '민주', outfit: '사복' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const run = useStore.getState().autoSuggestOutfitsAll();
    const removal = useStore.getState().removeOutfit('민주', '사복');
    // ⚠️ 핵심: await 를 기다리기 전에 이미 epoch 이 올라 있어야 한다(뒤로 밀리면 race 가 생긴다).
    expect(revision()).toBeGreaterThan(0);

    release();
    await run;
    await removal;

    expect(suggestions()).toEqual({});
  });

  it('아무 변경 없이 끝나면 제안이 정상 커밋된다(가드가 과잉 차단하지 않는다)', async () => {
    const sc = baseScene();
    useStore.setState({
      project: projectWith([sc], { characters: [heroine()] }),
      outfitSuggestions: {},
      outfitSuggestionRevision: 0,
      openaiKey: 'test-key',
    });

    const { fetchMock, release } = deferredFetch({
      changes: [{ i: 1, character: '민주', outfit: '사복', reason: '갈아입고 옴' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const run = useStore.getState().autoSuggestOutfitsAll();
    release();
    await run;

    expect(suggestions()[SCENE_ID]).toHaveLength(1);
    expect(suggestions()[SCENE_ID][0]).toMatchObject({
      lineIndex: 1,
      character: '민주',
      outfit: '사복',
      reason: '갈아입고 옴',
    });
    // 제안은 canonical 을 건드리지 않는다
    expect(lineOutfits(1)).toBeUndefined();
  });
});

// ── Phase 11 · B ────────────────────────────────────────────────────────────
// 파서가 살려낸 **같은 응답 안의 연쇄 전환**(A→B→A)이 검수 목록까지 온전히 도달하는지만 본다.
// 개별 적용·일괄 적용·무시·stale 의 semantics 는 위 O26/O27/O24 가 이미 고정하므로 복제하지 않는다.
describe('P11 — 연쇄 전환 2건이 검수 목록까지 도달한다(canonical 은 그대로)', () => {
  it('장면 시작 사복 → 1번 체육복 → 3번 사복 복귀가 둘 다 제안으로 남는다', async () => {
    const sc = scene({
      id: SCENE_ID,
      outfits: { 민주: '사복' },
      lines: [
        dialogue('민주', 'a'),
        dialogue('민주', 'b'),
        dialogue('민주', 'c'),
        dialogue('민주', 'd'),
      ],
    });
    useStore.setState({
      project: projectWith([sc], { characters: [heroine('민주', ['사복', '체육복'])] }),
      outfitSuggestions: {},
      outfitSuggestionRevision: 0,
      openaiKey: 'test-key',
    });

    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    changes: [
                      { i: 1, character: '민주', outfit: '체육복' },
                      { i: 3, character: '민주', outfit: '사복' },
                    ],
                  }),
                },
              },
            ],
          }),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);

    await useStore.getState().autoSuggestOutfitsAll();

    expect(fetchMock).toHaveBeenCalledTimes(1); // 4줄 = 1 window
    expect(suggestions()[SCENE_ID]).toHaveLength(2);
    expect(suggestions()[SCENE_ID].map((s) => [s.lineIndex, s.outfit])).toEqual([
      [1, '체육복'],
      [3, '사복'],
    ]);
    // 제안은 canonical 을 건드리지 않는다(수락은 사용자 몫).
    expect(lineOutfits(1)).toBeUndefined();
    expect(lineOutfits(3)).toBeUndefined();
  });
});

// ── Phase 8 · C2 ────────────────────────────────────────────────────────────
// 무효화 자체는 계약대로 옳다(제목·배경은 Outfit AI 의 LLM 문맥 입력이다). 결함이었던 건 **침묵**이다:
// 유료로 받은 검수 목록이 장면 제목 한 글자에 통째로 사라지는데 아무 안내가 없어, 사용자는 스크롤하다
// 뒤늦게 알아채고 복구 수단은 재실행(재과금)뿐이었다.
describe('C2 — 무효화로 실제 제안이 사라질 때만 1회 알린다', () => {
  it('검수 목록이 있었으면 건수를 알린다', () => {
    seed();
    useStore.setState({ toast: null });

    useStore.getState().updateScene(SCENE_ID, { title: '새 제목' });

    expect(useStore.getState().toast).toContain('의상 제안 2건을 취소했습니다');
    expect(suggestions()).toEqual({});
  });

  it('이미 비어 있으면 완전히 침묵한다(hydrate·원격 반영 등에서 토스트가 튀지 않는다)', () => {
    useStore.setState({
      project: baseProject(),
      outfitSuggestions: {},
      outfitSuggestionRevision: 3,
      toast: null,
    });

    useStore.getState().invalidateOutfitSuggestions();

    expect(useStore.getState().toast).toBeNull();
    expect(revision()).toBe(4); // 알림만 생략할 뿐 epoch 은 정상적으로 올라간다
  });

  it('연속 무효화에서도 토스트는 목록이 있던 첫 번째만 뜬다(스팸 불가)', () => {
    seed();
    useStore.getState().updateScene(SCENE_ID, { title: '한 번' });
    useStore.setState({ toast: null });

    useStore.getState().updateScene(SCENE_ID, { title: '두 번' }); // 이제 목록이 비어 있다

    expect(useStore.getState().toast).toBeNull();
  });
});
