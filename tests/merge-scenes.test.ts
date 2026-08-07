import { describe, it, expect } from 'vitest';
import { mergeScenes, previewMerge, diffMatchedScene } from '../src/project/mergeScenes';
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

  it('merge: AI 배정(emotionAuto)은 텍스트가 그대로인 줄만 승계되고, 텍스트가 바뀐 줄은 새로 배정해야 하므로 승계되지 않는다', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        lines: [
          { kind: 'dialogue', speaker: '민주', text: '안녕', emotionAuto: '기쁨' },
          { kind: 'dialogue', speaker: '민주', text: '잘 가', emotionAuto: '슬픔' },
        ],
      }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', {
        lines: [
          { kind: 'dialogue', speaker: '민주', text: '안녕' }, // 텍스트 동일 → AI 배정 승계 기대
          { kind: 'dialogue', speaker: '민주', text: '다시 만나' }, // 텍스트 변경 → 매칭 실패, 승계 없음
        ],
      }),
    ];

    const result = mergeScenes(prev, next, 'merge');

    const [l1, l2] = result[0].lines as Extract<Line, { kind: 'dialogue' }>[];
    expect(l1.emotionAuto).toBe('기쁨');
    expect(l2.emotionAuto).toBeUndefined();
  });

  it('merge: 표기만 고쳐진(느슨 매칭) 줄도 emotionAuto 가 승계된다 — voice/i18n 과 동일한 메타 승계 규칙', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', { lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕, 반가워!', emotionAuto: '기쁨' }] }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', { lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕 반가워.' }] }), // 공백/문장부호만 다름
    ];

    const result = mergeScenes(prev, next, 'merge');
    const line = result[0].lines[0] as Extract<Line, { kind: 'dialogue' }>;
    expect(line.emotionAuto).toBe('기쁨');
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
    expect(preview).toMatchObject({ kept: 1, added: 1, removed: 2 });

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
    expect(preview).toMatchObject({ kept: 1, added: 0, removed: 0 });

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
    expect(preview).toMatchObject({ kept: 0, added: 1, removed: 1 });

    const result = mergeScenes(prev, next, 'merge');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('n1'); // 매칭 안 됨 — 신규 장면 취급
    expect(result[0].status).toBe('review');
  });

  it('merge: 앱에서 지정한 scene.outfits 는 새 파싱 결과에 없으면 승계되고, 새 파싱(#복장)에 있으면 그게 이긴다', () => {
    const prev: Scene[] = [scene('s1', '장면1', { outfits: { 한지수: '수영복' } })];
    // 새 파싱에 #복장이 없는 경우 — 앱에서 지정한 예외를 승계.
    const nextNoTag: Scene[] = [scene('n1', '장면1')];
    const resultCarried = mergeScenes(prev, nextNoTag, 'merge');
    expect(resultCarried[0].outfits).toEqual({ 한지수: '수영복' });

    // 새 파싱에 #복장이 있는 경우 — 대본(엑셀/텍스트)이 정본이라 그게 이긴다.
    const nextWithTag: Scene[] = [scene('n2', '장면1', { outfits: { 한지수: '교복' } })];
    const resultOverridden = mergeScenes(prev, nextWithTag, 'merge');
    expect(resultOverridden[0].outfits).toEqual({ 한지수: '교복' });
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

describe('previewMerge: 줄 단위 diff — 재분석 모달이 사용자가 실제로 잃는 것을 보여주는지', () => {
  it('대사 한 줄의 텍스트가 실제로 바뀌면 linesChanged/linesRemoved 가 늘고, 그 줄의 음성이 voiceLoss 로 집계된다(사용자 시나리오)', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        lines: [
          {
            kind: 'dialogue',
            speaker: '민주',
            text: '오늘 날씨가 좋네요',
            voiced: true,
            voiceAssetIds: { ko: 'va-ko', en: 'va-en' },
          },
        ],
      }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', {
        lines: [{ kind: 'dialogue', speaker: '민주', text: '오늘 날씨가 정말 좋네요' }], // 오타 아닌 실제 수정
      }),
    ];

    const preview = previewMerge(prev, next);

    expect(preview.linesChanged).toBe(1);
    expect(preview.linesRemoved).toBe(1);
    expect(preview.voiceLoss).toBe(2); // ko/en 두 로케일 폐기
    expect(preview.voiceCarriedLoose).toBe(0);
  });

  it('emotionLoss: 사라지는 줄의 표정 배정(수동 emotion·AI emotionAuto)이 손실로 집계된다 — i18nLoss/voiceLoss 와 동일 원칙', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        lines: [
          { kind: 'dialogue', speaker: '민주', text: '지워질 대사1', emotion: '기쁨' }, // 작가 수동 배정
          { kind: 'dialogue', speaker: '민주', text: '지워질 대사2', emotionAuto: '슬픔' }, // AI 배정
          { kind: 'dialogue', speaker: '민주', text: '표정 없는 대사' }, // 손실 집계 대상 아님
        ],
      }),
    ];
    const next: Scene[] = [scene('n1', '장면1', { lines: [] })]; // 전부 삭제

    const preview = previewMerge(prev, next);
    expect(preview.emotionLoss).toBe(2);
  });

  it('emotionLoss: 텍스트가 그대로면(승계됨) 손실로 잡히지 않는다', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', { lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕', emotionAuto: '기쁨' }] }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', { lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕' }] }),
    ];

    const preview = previewMerge(prev, next);
    expect(preview.emotionLoss).toBe(0);
  });

  it('공백·문장부호만 바뀐 줄은 voiceCarriedLoose 로 잡히고 voiceLoss 는 0이며, 실제 병합에서도 음성이 승계되고 텍스트는 새 표기로 바뀐다', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        lines: [
          {
            kind: 'dialogue',
            speaker: '민주',
            text: '안녕, 반가워!',
            voiced: true,
            voiceAssetIds: { ko: 'va-ko' },
          },
        ],
      }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', {
        lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕 반가워.' }], // 공백/문장부호만 다름 — 발음 동일
      }),
    ];

    const preview = previewMerge(prev, next);
    expect(preview.voiceCarriedLoose).toBe(1);
    expect(preview.voiceLoss).toBe(0);
    expect(preview.linesRemoved).toBe(0);
    // 표기가 실제로 바뀐 줄이므로 "변경 없음"으로 보이면 안 된다(모달이 이 값으로 판단).
    expect(preview.linesRespelled).toBe(1);
    expect(preview.linesChanged).toBe(0);

    const merged = mergeScenes(prev, next, 'merge');
    const line = merged[0].lines[0] as Extract<Line, { kind: 'dialogue' }>;
    expect(line.text).toBe('안녕 반가워.'); // 철자는 next(새 표기) 승
    expect(line.voiceAssetIds).toEqual({ ko: 'va-ko' }); // 음성은 승계
  });

  it('완전히 동일한 대본을 다시 넣으면 표기 수정도 0 — 모달이 "변경 없음"이라고 말할 수 있는 조건', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕, 반가워!', voiced: true, voiceAssetIds: { ko: 'va-ko' } }],
      }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', { lines: [{ kind: 'dialogue', speaker: '민주', text: '안녕, 반가워!' }] }),
    ];
    const preview = previewMerge(prev, next);
    expect(preview.linesChanged).toBe(0);
    expect(preview.linesRespelled).toBe(0);
    expect(preview.linesRemoved).toBe(0);
    expect(preview.scenesAttrChanged).toBe(0);
    expect(preview.voiceLoss).toBe(0);
  });

  it('배경 이름이 업로드 연결 없는 새 이름으로 바뀌면 assetUnlink/scenesAttrChanged 가 1이 된다', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        background: '학교',
        backgroundAssetId: 'bgA',
        lines: [{ kind: 'narration', text: '문장A' }],
      }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', {
        background: '폐교', // 이전에 없던 새 이름 — 재연결 실패
        lines: [{ kind: 'narration', text: '문장A' }],
      }),
    ];

    const preview = previewMerge(prev, next);
    expect(preview.assetUnlink).toBe(1);
    expect(preview.scenesAttrChanged).toBe(1);
  });

  it('승인된 장면의 내용이 바뀌면 statusReset=1, 내용이 그대로면 statusReset=0', () => {
    const linesA: Line[] = [{ kind: 'dialogue', speaker: '민주', text: '안녕' }];
    const prev: Scene[] = [
      scene('s1', '장면1', { status: 'approved', lines: linesA }),
      scene('s2', '장면2', { status: 'approved', lines: linesA }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', { lines: [{ kind: 'dialogue', speaker: '민주', text: '완전히 다른 대사' }] }),
      scene('n2', '장면2', { lines: linesA }),
    ];

    const preview = previewMerge(prev, next);
    expect(preview.statusReset).toBe(1);
  });

  it('일관성: previewMerge 의 라인 수치가 diffMatchedScene/실제 mergeScenes 결과와 어긋나지 않는다', () => {
    const prev: Scene[] = [
      scene('s1', '장면1', {
        lines: [
          { kind: 'dialogue', speaker: '민주', text: '안녕', voiced: true, voiceAssetIds: { ko: 'v1' } },
          { kind: 'dialogue', speaker: '민주', text: '반가워!', voiced: true, voiceAssetIds: { ko: 'v2', en: 'v2en' } },
          { kind: 'narration', text: '지워질 문장' },
        ],
      }),
    ];
    const next: Scene[] = [
      scene('n1', '장면1', {
        lines: [
          { kind: 'dialogue', speaker: '민주', text: '안녕' }, // 정확 일치 — 승계
          { kind: 'dialogue', speaker: '민주', text: '반가워.' }, // 느슨 일치(문장부호만) — 승계
          { kind: 'dialogue', speaker: '민주', text: '새로운 대사' }, // 신규
        ],
      }),
    ];

    const preview = previewMerge(prev, next);
    const diff = diffMatchedScene(prev[0], next[0]);

    // previewMerge 는 diffMatchedScene 을 그대로 합산한 값이어야 한다(장면 1개뿐이므로 동일).
    expect(preview.linesCarried).toBe(diff.linesCarried);
    expect(preview.linesChanged).toBe(diff.linesChanged);
    expect(preview.linesRemoved).toBe(diff.linesRemoved);
    expect(preview.voiceCarriedLoose).toBe(diff.voiceCarriedLoose);
    expect(preview.voiceLoss).toBe(diff.voiceLoss);

    // 실제 병합 결과에서 voiceAssetIds 를 가진 줄 수 = (승계된 줄 수) 와 일치해야 한다
    // (이 픽스처에서는 승계되는 두 줄 모두 음성을 갖고 있었으므로 정확히 2개).
    const merged = mergeScenes(prev, next, 'merge');
    const voicedLines = merged[0].lines.filter(
      (l): l is Extract<Line, { kind: 'dialogue' }> => l.kind === 'dialogue' && !!l.voiceAssetIds,
    );
    expect(voicedLines).toHaveLength(2);
    expect(diff.linesCarried).toBe(2);
    expect(diff.linesRemoved).toBe(1); // '지워질 문장' 나레이션
    expect(diff.voiceCarriedLoose).toBe(1); // '반가워!' -> '반가워.' 느슨 매칭
  });
});

describe('previewMerge/mergeScenes: 태그성 필드(점프·선택지·의상·연출) 변경 감지 — "변경 없음" 오탐 방지', () => {
  it('사용자 실제 사례: 대사·배경은 그대로인데 #끝(jumpTo) 만 추가되면 scenesTagChanged=1, 나머지 "변경 없음" 판정용 수치는 모두 0', () => {
    const lines: Line[] = [{ kind: 'dialogue', speaker: '민주', text: '안녕' }];
    const prev: Scene[] = [scene('s1', '장면1', { lines })];
    const next: Scene[] = [scene('n1', '장면1', { lines, jumpTo: '끝' })];

    const preview = previewMerge(prev, next);

    expect(preview.scenesTagChanged).toBe(1);
    expect(preview.tagChangedTitles).toContain('장면1');
    // 옛 조건(변경 없음 판정에 쓰던 값들)은 여전히 전부 0 — 그래서 예전엔 "변경 없음"이라고 잘못 표시됐다.
    expect(preview.linesChanged).toBe(0);
    expect(preview.linesRespelled).toBe(0);
    expect(preview.linesRemoved).toBe(0);
    expect(preview.scenesAttrChanged).toBe(0);
  });

  it('choices 가 바뀌면 scenesTagChanged=1', () => {
    const lines: Line[] = [{ kind: 'dialogue', speaker: '민주', text: '안녕' }];
    const prev: Scene[] = [scene('s1', '장면1', { lines, choices: [{ text: '간다', target: '장면2' }] })];
    const next: Scene[] = [scene('n1', '장면1', { lines, choices: [{ text: '간다', target: '장면3' }] })];

    const preview = previewMerge(prev, next);
    expect(preview.scenesTagChanged).toBe(1);
  });

  it('outfits 가 바뀌면 scenesTagChanged=1', () => {
    const lines: Line[] = [{ kind: 'dialogue', speaker: '민주', text: '안녕' }];
    const prev: Scene[] = [scene('s1', '장면1', { lines, outfits: { 한지수: '교복' } })];
    const next: Scene[] = [scene('n1', '장면1', { lines, outfits: { 한지수: '수영복' } })];

    const preview = previewMerge(prev, next);
    expect(preview.scenesTagChanged).toBe(1);
  });

  it('승인된 장면의 jumpTo 가 바뀌면 statusReset=1 이고, 실제 병합 결과는 review 로 되돌아간다', () => {
    const lines: Line[] = [{ kind: 'dialogue', speaker: '민주', text: '안녕' }];
    const prev: Scene[] = [scene('s1', '장면1', { lines, status: 'approved' })];
    const next: Scene[] = [scene('n1', '장면1', { lines, jumpTo: '끝' })];

    const preview = previewMerge(prev, next);
    expect(preview.statusReset).toBe(1);

    const merged = mergeScenes(prev, next, 'merge');
    expect(merged[0].status).toBe('review');
  });

  it('승인된 장면의 연출(direction)만 바뀌면 scenesTagChanged=1 이지만 statusReset=0 이고 승인 상태가 유지된다(의도적 비대칭)', () => {
    const lines: Line[] = [{ kind: 'dialogue', speaker: '민주', text: '안녕' }];
    const prev: Scene[] = [scene('s1', '장면1', { lines, status: 'approved', direction: ['어두운 톤'] })];
    const next: Scene[] = [scene('n1', '장면1', { lines, direction: ['밝은 톤'] })];

    const preview = previewMerge(prev, next);
    expect(preview.scenesTagChanged).toBe(1);
    expect(preview.statusReset).toBe(0);

    const merged = mergeScenes(prev, next, 'merge');
    expect(merged[0].status).toBe('approved');
  });

  it('완전히 동일한 대본이면 scenesTagChanged=0 이고 tagChangedTitles 는 비어있다(회귀 가드)', () => {
    const lines: Line[] = [{ kind: 'dialogue', speaker: '민주', text: '안녕' }];
    const prev: Scene[] = [scene('s1', '장면1', { lines, jumpTo: '끝', choices: [{ text: '간다' }] })];
    const next: Scene[] = [scene('n1', '장면1', { lines, jumpTo: '끝', choices: [{ text: '간다' }] })];

    const preview = previewMerge(prev, next);
    expect(preview.scenesTagChanged).toBe(0);
    expect(preview.tagChangedTitles).toEqual([]);
  });
});
