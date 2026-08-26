// .npproj.zip 왕복의 **에셋 절반** — 기존 tests/transfer-roundtrip.test.ts 가 주석대로 IndexedDB 를
// 피하려고 "참조 0" 픽스처만 쓰기 때문에, 실제 사용자 프로젝트가 늘 타는 경로(에셋 바이너리 · id
// 합집합 · 메타 합성 · 확장자 명명 · blob 유실 skip)가 왕복으로 고정된 적이 없었다.
// `.npproj.zip` 은 기기 간 이동의 **유일한** 경로라(transfer.ts 주석: 되돌릴 방법이 없는 데이터 손실)
// 이 경로가 게이트에 들어와야 한다.
//
// ⚠️ fake-indexeddb 를 새로 들이지 않는다 — 기존 tests/zip-asset-invariant.test.ts 와 같은
//    `vi.mock('../src/storage/assetStore')` 관용구로 인메모리 스토어를 쓴다.
// ⚠️ 기존 transfer-roundtrip.test.ts 는 건드리지 않는다(이 파일은 에셋 경로 + project 전체 동등성 담당).
// ⚠️ production 코드(src/project/transfer.ts)는 수정하지 않는다.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { exportProjectFile, importProjectFile } from '../src/project/transfer';
import { putAsset } from '../src/storage/assetStore';
import { collectReferencedAssetIds } from '../src/assetRefs';
import { emptyProject, type AssetMeta, type Project } from '../src/types';

// ── 브라우저 전용 API shim: FileReader ───────────────────────────────────────
// JSZip 은 Blob 입력을 FileReader 로 읽는다(node_modules/jszip/lib/utils.js — `isBlob &&
// typeof FileReader !== "undefined"`). node 24 에는 Blob 은 있지만 **FileReader 가 없어서**
// jszip 이 Blob 을 그대로 흘려보내고 `getTypeOf` 가 null 을 내며
// "Can't read the data of 'assets/...'" 로 죽는다. 브라우저(실제 실행 환경)에서는 나지 않는
// **테스트 환경만의 제약**이라, production 코드를 바꾸는 대신 여기서 최소 shim 을 심는다.
// (zip-asset-invariant.test.ts 가 Canvas·폰트 같은 브라우저 전용 API 를 모킹하는 것과 같은 이유.)
class FileReaderShim {
  onload: ((e: { target: { result: ArrayBuffer } }) => void) | null = null;
  onerror: ((e: { target: { error: unknown } }) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then(
      (result) => this.onload?.({ target: { result } }),
      (error) => this.onerror?.({ target: { error } }),
    );
  }
}
vi.stubGlobal('FileReader', FileReaderShim);
afterAll(() => {
  vi.unstubAllGlobals();
});

// ── 인메모리 에셋 스토어 ─────────────────────────────────────────────────────
// SOURCE = 내보내기가 읽는 곳(IndexedDB 대역). RESTORED = 가져오기가 실제로 쓴 것.
// 둘을 분리해야 "가져오기가 zip 에서 꺼내 복원한 바이트"를 검사할 수 있다(같은 Map 이면 자기 자신과
// 비교하는 꼴이 된다).
const SOURCE = vi.hoisted(() => new Map<string, Blob>());
const RESTORED = vi.hoisted(() => new Map<string, Blob>());

vi.mock('../src/storage/assetStore', () => ({
  getAsset: vi.fn(async (id: string) => SOURCE.get(id)),
  putAsset: vi.fn(async (id: string, blob: Blob) => {
    RESTORED.set(id, blob);
  }),
}));

// ⚠️ 반환형을 `Uint8Array` 로 명시하지 않는다 — 그러면 `Uint8Array<ArrayBufferLike>` 로 넓어져
// BlobPart(`ArrayBufferView<ArrayBuffer>`)에 안 맞는다. 추론에 맡기면 `Uint8Array<ArrayBuffer>` 다.
const bytes = (seed: number, len = 8) =>
  new Uint8Array(Array.from({ length: len }, (_, i) => (seed + i * 7) % 256));

/** 선언된 메타(사용자가 실제로 업로드해 메타 맵에 있는 에셋). createdAt 은 고정값. */
const meta = (id: string, kind: AssetMeta['kind'], mime: string, filename: string): AssetMeta => ({
  id,
  kind,
  prompt: '테스트',
  mime,
  source: 'upload',
  filename,
  createdAt: 1700000000000,
});

// ── 픽스처 ───────────────────────────────────────────────────────────────────
// ⚠️ **JSON-canonical** 로 만든다: plain JSON 값만 · explicit undefined 프로퍼티 없음(넣지 않는 것으로
// 표현) · NaN/Infinity/Date/Map/Set/함수 없음. 이 조건 위에서만 아래의 project deep equality 가
// 계약으로 성립한다(JSON 직렬화는 그 값들을 보존하지 못한다 — 일반 명제로 쓰지 말 것).
function fixture(): Project {
  return {
    ...emptyProject(),
    title: '에셋 왕복',
    gameIcon: { ico: 'a-ico' },
    characters: [
      {
        name: '히로인',
        color: '#ffffff',
        expressions: { 기본: 'a-sprite' },
        outfits: [{ name: '교복', expressions: { 기본: 'a-sprite' } }],
      },
    ],
    scenes: [
      {
        id: 's1',
        title: '카페',
        direction: [],
        background: '카페 내부',
        backgroundAssetId: 'a-bg',
        bgm: 'theme',
        bgmAssetId: 'a-bgm',
        cg: ['컷1', '컷2'],
        cgAssetIds: ['a-cg', 'a-missing'], // a-missing 은 참조만 있고 blob 이 없다(skip 경로)
        choices: [],
        status: 'approved',
        outfits: { 히로인: '교복' },
        lines: [
          {
            kind: 'dialogue',
            speaker: '히로인',
            text: '하나',
            voiceAssetIds: { ko: 'a-voice' },
            i18n: { en: 'One.' },
            emotion: '기쁨',
            emotionAuto: '기본',
            outfits: { 히로인: '교복' },
            hideSprites: false,
          },
          { kind: 'narration', text: '창밖은 비.' },
          { kind: 'cg', desc: '', end: true }, // CG 종료 마커(optional field 확장)
        ],
      },
    ],
  };
}

const declared: Record<string, AssetMeta> = {
  'a-bg': meta('a-bg', 'background', 'image/png', 'bg_cafe.png'),
  'a-bgm': meta('a-bgm', 'bgm', 'audio/mpeg', 'bgm_theme.mp3'),
  'a-voice': meta('a-voice', 'voice', 'audio/wav', 'voice_1.wav'),
  'a-ico': meta('a-ico', 'cg', 'image/x-icon', 'icon.ico'),
  // ⚠️ **프로젝트가 참조하지 않는** 에셋 라이브러리 항목. export 계약이
  //    `Object.keys(assets) ∪ collectReferencedAssetIds(project)` 라는 것 중 **앞쪽 축**을
  //    독립적으로 고정한다(다른 declared 항목은 전부 project 에서도 참조되므로 이 축을 증명하지 못한다).
  'a-unused': meta('a-unused', 'background', 'image/png', 'unused.png'),
};

const SOURCE_BYTES = {
  'a-bg': { data: bytes(1), mime: 'image/png' },
  'a-bgm': { data: bytes(30), mime: 'audio/mpeg' },
  'a-voice': { data: bytes(60), mime: 'audio/wav' },
  'a-ico': { data: bytes(90), mime: 'image/x-icon' },
  'a-cg': { data: bytes(120), mime: 'image/jpeg' }, // 메타 없음 → 합성 대상
  'a-sprite': { data: bytes(150), mime: 'image/webp' }, // 메타 없음 → 합성 대상
  'a-unused': { data: bytes(180), mime: 'image/png' }, // 메타만 있고 project 미참조
  // 'a-missing' 은 일부러 넣지 않는다.
};

beforeEach(() => {
  SOURCE.clear();
  RESTORED.clear();
  for (const [id, { data, mime }] of Object.entries(SOURCE_BYTES)) {
    SOURCE.set(id, new Blob([data], { type: mime }));
  }
  vi.mocked(putAsset).mockClear();
});

async function zipNames(blob: Blob): Promise<string[]> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return Object.keys(zip.files)
    .filter((n) => !zip.files[n].dir)
    .sort();
}

const u8 = async (b: Blob): Promise<number[]> => Array.from(new Uint8Array(await b.arrayBuffer()));

describe('.npproj.zip 에셋 왕복(export → import)', () => {
  it('project 는 통째로, 에셋 바이너리는 바이트 단위로 복원된다', async () => {
    const project = fixture();
    const { blob, assetCount } = await exportProjectFile(project, declared);

    // 선언 5(참조 4 + 미참조 a-unused) + 합성 2 = 7. blob 이 없는 참조(a-missing)만 빠진다.
    expect(assetCount).toBe(7);

    // 컨테이너 레이아웃 — 확장자는 extFor(mime) 규칙 그대로.
    expect(await zipNames(blob)).toEqual([
      'assets/a-bg.png',
      'assets/a-bgm.mp3',
      'assets/a-cg.jpg',
      'assets/a-ico.ico',
      'assets/a-sprite.webp',
      'assets/a-unused.png',
      'assets/a-voice.wav',
      'project.json',
    ]);

    const restored = await importProjectFile(blob);

    // ⚠️ 이 JSON-canonical 픽스처에 한해 project 전체 deep equality 를 계약으로 고정한다
    // (Line 의 optional 필드 i18n·emotion/emotionAuto·outfits·hideSprites·voiceAssetIds 와
    //  cg 종료 마커 end:true 가 전부 여기에 걸린다 — 필드별로 나열하지 않는 이유).
    expect(restored.project).toEqual(project);

    // 복원된 바이트 = 가져오기가 실제로 putAsset 한 값.
    expect(restored.assetCount).toBe(7);
    expect([...RESTORED.keys()].sort()).toEqual([
      'a-bg',
      'a-bgm',
      'a-cg',
      'a-ico',
      'a-sprite',
      'a-unused',
      'a-voice',
    ]);
    for (const [id, { data, mime }] of Object.entries(SOURCE_BYTES)) {
      const back = RESTORED.get(id);
      expect(back, `${id} 가 복원되지 않았다`).toBeDefined();
      expect(await u8(back!)).toEqual(Array.from(data));
      expect(back!.type).toBe(mime); // 미리듣기/표시 호환을 위해 mime 을 명시 복원한다
    }
  });

  it('선언된 메타는 그대로, 메타 없는 참조는 kind·mime 을 유추해 합성된다', async () => {
    const project = fixture();
    const { blob } = await exportProjectFile(project, declared);
    const restored = await importProjectFile(blob);

    for (const [id, m] of Object.entries(declared)) {
      expect(restored.assets[id]).toEqual(m);
    }

    // 합성 메타 — createdAt 은 Date.now() 라 **이 왕복의 유일한 비결정 필드**다.
    expect(restored.assets['a-cg']).toEqual({
      id: 'a-cg',
      kind: 'cg',
      prompt: '(협업 동기화)',
      mime: 'image/jpeg',
      source: 'upload',
      filename: '',
      createdAt: expect.any(Number),
    });
    expect(restored.assets['a-sprite']).toEqual({
      id: 'a-sprite',
      kind: 'sprite',
      prompt: '(협업 동기화)',
      mime: 'image/webp',
      source: 'upload',
      filename: '',
      createdAt: expect.any(Number),
    });
  });

  // export 계약 `Object.keys(assets) ∪ collectReferencedAssetIds(project)` 의 **두 축**을 각각 고정한다.
  //   A. assets map 에만 있는 에셋(프로젝트 미참조)  → 그래도 export 된다        ← 이 테스트
  //   B. project 참조에만 있는 에셋(메타 없음)       → 합성 메타와 함께 export   ← 바로 위 테스트
  it('A축 — assets map 에만 있고 프로젝트가 참조하지 않는 에셋도 export·복원된다', async () => {
    const project = fixture();

    // 전제 고정: a-unused 가 어딘가에서 참조되면 이 케이스가 B축과 구별되지 않는다.
    const referenced = collectReferencedAssetIds(project, { includeVoice: true });
    expect(referenced.has('a-unused')).toBe(false);
    expect(referenced.has('a-cg')).toBe(true); // 대조군 — 수집기 자체는 정상 동작한다

    const { blob } = await exportProjectFile(project, declared);
    expect(await zipNames(blob)).toContain('assets/a-unused.png');

    const restored = await importProjectFile(blob);
    expect(restored.assets['a-unused']).toEqual(declared['a-unused']);
    expect(await u8(RESTORED.get('a-unused')!)).toEqual(Array.from(SOURCE_BYTES['a-unused'].data));
  });

  it('참조는 있는데 blob 이 없는 id 는 예외 없이 건너뛴다(메타에도 안 실린다)', async () => {
    const project = fixture();
    const { blob } = await exportProjectFile(project, declared);
    const restored = await importProjectFile(blob);

    expect(Object.keys(restored.assets)).not.toContain('a-missing');
    expect(RESTORED.has('a-missing')).toBe(false);
    // 프로젝트 쪽 참조는 그대로 남는다(export 가 project 를 손대지 않는다는 계약).
    expect(restored.project.scenes[0].cgAssetIds).toEqual(['a-cg', 'a-missing']);
  });
});
