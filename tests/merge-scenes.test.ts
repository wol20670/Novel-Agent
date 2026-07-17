import { describe, it, expect } from 'vitest';
import { mergeScenes, previewMerge } from '../src/project/mergeScenes';
import type { Scene, Line } from '../src/types';

function scene(id: string, title: string, patch: Partial<Scene> = {}): Scene {
  return {
    id,
    title,
    direction: [],
    cg: [],
    lines: [],
    choices: [],
    status: 'review',
    ...patch,
  };
}

describe('mergeScenes: 재분석(엑셀/텍스트) 시 기존 에셋·번역·승인 보존 + 새 장면 병합', () => {
  it('배경/BGM/CG 이름이 같으면 재분석 후에도 assetId가 재연결된다(append)', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        background: '학교',
        backgroundAssetId: 'bgA',
        bgm: '테마곡',
        bgmAssetId: 'bgmA',
        cg: ['첫 컷'],
        cgAssetIds: ['cgA'],
      }),
    ];
    const next: Scene[] = [scene('new1', '장면2', { background: '학교', bgm: '테마곡', cg: ['첫 컷'] })];

    const result = mergeScenes(prev, next, 'append');

    expect(result).toHaveLength(2);
    const appended = result[1];
    expect(appended.backgroundAssetId).toBe('bgA');
    expect(appended.bgmAssetId).toBe('bgmA');
    expect(appended.cgAssetIds).toEqual(['cgA']);
  });

  it('merge: 라인 텍스트가 같으면 i18n/emotion/voice가 승계되고, 텍스트가 바뀐 라인은 새것 그대로다', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        lines: [
          {
            kind: 'dialogue',
            speaker: '민주',
            text: '안녕',
            emotion: '기쁨',
            i18n: { en: 'Hi' },
            voiced: true,
            voiceAssetIds: { en: 'va1' },
          },
          { kind: 'dialogue', speaker: '민주', text: '잘 가', emotion: '슬픔' },
        ],
      }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', {
        lines: [
          { kind: 'dialogue', speaker: '민주', text: '안녕' }, // 텍스트 동일 → 승계 기대
          { kind: 'dialogue', speaker: '민주', text: '다시 만나' }, // 텍스트 변경 → 승계 없음
        ],
      }),
    ];

    const result = mergeScenes(prev, next, 'merge');

    expect(result).toHaveLength(1);
    const [l1, l2] = result[0].lines as Extract<Line, { kind: 'dialogue' }>[];
    expect(l1.emotion).toBe('기쁨');
    expect(l1.i18n).toEqual({ en: 'Hi' });
    expect(l1.voiced).toBe(true);
    expect(l1.voiceAssetIds).toEqual({ en: 'va1' });
    expect(l2.emotion).toBeUndefined();
    expect(l2.i18n).toBeUndefined();
  });

  it('merge: 엑셀에서 갱신한 번역(next.i18n)이 이기고, 엑셀에 없던 로케일은 prev 값이 유지된다', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕', i18n: { en: 'Hello (old)', ja: 'こんにちは' } }],
      }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', {
        // 같은 텍스트 라인의 en 번역만 엑셀 C열에서 갱신(ja 는 엑셀에 없음)
        lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕', i18n: { en: 'Hello (new)' } }],
      }),
    ];

    const result = mergeScenes(prev, next, 'merge');

    const line = result[0].lines[0] as Extract<Line, { kind: 'dialogue' }>;
    expect(line.i18n).toEqual({ en: 'Hello (new)', ja: 'こんにちは' });
  });

  it('merge: 엑셀 명시 표정 태그가 있으면 next.emotion 승, 태그 없으면 앱에서 지정한 prev.emotion 유지', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        lines: [
          { kind: 'dialogue', speaker: '민주', text: '안녕', emotion: '기쁨' },
          { kind: 'dialogue', speaker: '민주', text: '잘 가', emotion: '슬픔' },
        ],
      }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', {
        lines: [
          { kind: 'dialogue', speaker: '민주', text: '안녕', emotion: '화남' }, // 엑셀 "민주(화남)" 명시 태그
          { kind: 'dialogue', speaker: '민주', text: '잘 가' }, // 태그 없음 → prev 유지
        ],
      }),
    ];

    const result = mergeScenes(prev, next, 'merge');

    const [l1, l2] = result[0].lines as Extract<Line, { kind: 'dialogue' }>[];
    expect(l1.emotion).toBe('화남');
    expect(l2.emotion).toBe('슬픔');
  });

  it('merge: 장면 내용(라인·배경·BGM·CG)이 완전히 같으면 status가 승계되고, 대사가 바뀌면 review로 리셋된다', () => {
    const linesSame: Line[] = [{ kind: 'dialogue', speaker: '민주', text: '안녕' }];
    const prev: Scene[] = [
      scene('s1', '장면1', { lines: linesSame, status: 'approved' }),
      scene('s2', '장면2', { lines: linesSame, status: 'approved' }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', { lines: linesSame }), // 내용 동일
      scene('n2', '장면2', { lines: [{ kind: 'dialogue', speaker: '민주', text: '수정된 대사' }] }), // 대사 변경
    ];

    const result = mergeScenes(prev, next, 'merge');

    expect(result.find((s) => s.title === '장면1')!.status).toBe('approved');
    expect(result.find((s) => s.title === '장면2')!.status).toBe('review');
  });

  it('merge: 새 결과에 없는 기존 장면은 삭제되고, previewMerge 개수가 정확하다(엑셀/텍스트가 정본)', () => {
    const prev: Scene[] = [scene('s1', '장면1'), scene('s2', '장면2'), scene('s3', '장면3')];
    const next: Scene[] = [scene('n1', '장면1'), scene('n2', '장면4')]; // 장면2·3 삭제, 장면4 신규

    const preview = previewMerge(prev, next);
    expect(preview).toEqual({ kept: 1, added: 1, removed: 2 });

    const result = mergeScenes(prev, next, 'merge');
    expect(result.map((s) => s.title)).toEqual(['장면1', '장면4']);
    expect(result[0].id).toBe('s1'); // 매칭된 장면은 prev.id 유지(선택 상태 안정)
  });

  it('append: 기존 장면은 무수정으로 유지되고(참조까지 동일) 새 장면만 뒤에 붙는다', () => {
    const prev: Scene[] = [scene('s1', '장면1', { status: 'approved' })];
    const next: Scene[] = [scene('n1', '장면2')];

    const result = mergeScenes(prev, next, 'append');

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(prev[0]); // append 는 prev 를 전혀 건드리지 않는다
    expect(result[1].title).toBe('장면2');
  });

  it('merge: 제목이 바뀐 장면도 라인이 완전히 같으면 내용 기반 폴백으로 매칭되어 voice/i18n/승인이 승계된다', () => {
    const lines: Line[] = [
      { kind: 'dialogue', speaker: '민주', text: '안녕', i18n: { en: 'Hi' }, voiced: true, voiceAssetIds: { en: 'va1' } },
      { kind: 'narration', text: '창밖엔 비가 내렸다' },
    ];
    const prev: Scene[] = [scene('s1', '옛 제목', { lines, status: 'approved' })];
    // 오타 수정으로 제목만 바뀌고 라인은 그대로(2/2 = 100% 겹침).
    const next: Scene[] = [
      scene('n1', '새 제목', {
        lines: [
          { kind: 'dialogue', speaker: '민주', text: '안녕' },
          { kind: 'narration', text: '창밖엔 비가 내렸다' },
        ],
      }),
    ];

    const preview = previewMerge(prev, next);
    expect(preview).toEqual({ kept: 1, added: 0, removed: 0 });

    const result = mergeScenes(prev, next, 'merge');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('s1'); // prev.id 유지
    expect(result[0].status).toBe('approved'); // 내용 동일 → status 승계
    const [l1] = result[0].lines as Extract<Line, { kind: 'dialogue' }>[];
    expect(l1.i18n).toEqual({ en: 'Hi' });
    expect(l1.voiced).toBe(true);
    expect(l1.voiceAssetIds).toEqual({ en: 'va1' });
  });

  it('merge: 라인 겹침이 50% 미만이면 내용 기반 폴백 매칭이 일어나지 않고 추가/삭제로 처리된다', () => {
    const prev: Scene[] = [
      scene('s1', '옛 제목', {
        lines: [
          { kind: 'narration', text: '문장A' },
          { kind: 'narration', text: '문장B' },
          { kind: 'narration', text: '문장C' },
        ],
        status: 'approved',
      }),
    ];
    const next: Scene[] = [
      scene('n1', '새 제목', {
        // 3줄 중 1줄만 겹침(1/3 < 0.5) → 매칭 안 됨.
        lines: [
          { kind: 'narration', text: '문장A' },
          { kind: 'narration', text: '문장X' },
          { kind: 'narration', text: '문장Y' },
        ],
      }),
    ];

    const preview = previewMerge(prev, next);
    expect(preview).toEqual({ kept: 0, added: 1, removed: 1 });

    const result = mergeScenes(prev, next, 'merge');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1'); // 매칭 안 됨 — 신규 장면 취급
    expect(result[0].status).toBe('review');
  });

  it('동명 장면이 여럿이면 등장 순서대로(FIFO) 매칭된다', () => {
    const prev: Scene[] = [
      scene('s1', '교실', { status: 'approved', lines: [{ kind: 'narration', text: '아침' }] }),
      scene('s2', '교실', { status: 'needs_fix', lines: [{ kind: 'narration', text: '저녁' }] }),
    ];
    const next: Scene[] = [
      scene('n1', '교실', { lines: [{ kind: 'narration', text: '아침' }] }),
      scene('n2', '교실', { lines: [{ kind: 'narration', text: '저녁' }] }),
    ];

    const result = mergeScenes(prev, next, 'merge');

    expect(result[0].id).toBe('s1');
    expect(result[0].status).toBe('approved');
    expect(result[1].id).toBe('s2');
    expect(result[1].status).toBe('needs_fix');
  });
});
