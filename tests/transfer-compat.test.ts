// .npproj.zip compatibility boundary (안정화 R2) — version 판정 · canonical validation ordering ·
// Generation A(2026-07-14 `8a90eeb` 이전) 에셋 파일명 폴백을 고정한다.
//
// 기존 왕복 테스트(transfer-roundtrip / transfer-assets-roundtrip)는 **앱이 방금 만든 zip** 만
// 되읽어서 ① version 필드가 소비되는지 ② 세대를 가로지르는 읽기가 되는지를 하나도 보지 못했다.
//
// ⚠️ fake-indexeddb 를 새로 들이지 않는다 — 기존 관용구(vi.mock('../src/storage/assetStore')) 재사용.
// ⚠️ zip fixture 는 **Uint8Array 로만** 만든다. jszip 은 Blob 입력을 FileReader 로 읽는데 node 에는
//    FileReader 가 없다(transfer-assets-roundtrip 이 shim 을 심는 이유). Uint8Array 로 넣으면
//    그 경로를 아예 타지 않아 shim 이 필요 없다.
// ⚠️ 에러 메시지는 **의미 정규식**으로만 pin 한다(문구 다듬기가 게이트를 깨면 안 된다). 단 future 와
//    invalid 는 서로 구별되어야 한다 — 그 구별 자체가 ordering 계약의 관측 수단이다.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportProjectFile, importProjectFile } from '../src/project/transfer';
import { putAsset } from '../src/storage/assetStore';
import { emptyProject, type AssetMeta, type Project } from '../src/types';

const RESTORED = vi.hoisted(() => new Map<string, Blob>());

vi.mock('../src/storage/assetStore', () => ({
  getAsset: vi.fn(async () => undefined),
  putAsset: vi.fn(async (id: string, blob: Blob) => {
    RESTORED.set(id, blob);
  }),
}));

beforeEach(() => {
  RESTORED.clear();
  vi.mocked(putAsset).mockClear();
});

const putCalls = () => vi.mocked(putAsset).mock.calls.length;

// ── fixture ──────────────────────────────────────────────────────────────────
const bytes = (seed: number, len = 8) =>
  new Uint8Array(Array.from({ length: len }, (_, i) => (seed + i * 7) % 256));

const BYTES_OK = bytes(11);

const meta = (id: string, kind: AssetMeta['kind'], mime: string): AssetMeta => ({
  id,
  kind,
  prompt: '테스트',
  mime,
  source: 'upload',
  filename: '',
  createdAt: 1700000000000,
});

/** 참조 0 · scenes 배열 있음 — current parser 가 정상적으로 받아야 하는 최소 project. */
function validProject(): Project {
  return {
    ...emptyProject(),
    title: '호환성',
    scenes: [
      {
        id: 's1',
        title: '카페',
        direction: [],
        cg: [],
        choices: [],
        status: 'approved',
        lines: [{ kind: 'dialogue', speaker: '히로인', text: '하나' }],
      },
    ],
  };
}

/**
 * ⚠️ **모든 rejection fixture 는 "정상 경로였다면 반드시 복원됐을 에셋 1개"를 갖는다.**
 * 이게 없으면 validation 을 에셋 루프 뒤로 옮기는 mutation probe 를 해도 putAsset 이 0회라
 * `putAsset === 0` assertion 이 아무것도 증명하지 못한다(trivial PASS). 그 전제는 아래
 * "fixture 전제 pin" 테스트가 직접 고정한다.
 */
const DEFAULT_ASSETS: Record<string, AssetMeta> = { 'a-1': meta('a-1', 'background', 'image/png') };
const DEFAULT_ENTRIES: Record<string, Uint8Array> = { 'assets/a-1.png': BYTES_OK };

/** project.json 을 손수 만든 zip. manifest 는 unknown 이라 일부러 깨진 shape 도 넣을 수 있다. */
async function makeZip(
  manifest: unknown,
  entries: Record<string, Uint8Array> = DEFAULT_ENTRIES,
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  if (manifest !== undefined) zip.file('project.json', JSON.stringify(manifest));
  for (const [name, data] of Object.entries(entries)) zip.file(name, data);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** 기본 manifest — version 만 케이스별로 갈아끼운다. */
const manifestWith = (over: Record<string, unknown>) => ({
  version: 1,
  exportedAt: 1700000000000,
  app: 'novel-agent',
  project: validProject(),
  assets: DEFAULT_ASSETS,
  ...over,
});

const u8 = async (b: Blob): Promise<number[]> => Array.from(new Uint8Array(await b.arrayBuffer()));

const FUTURE_RE = /더 최신 버전/;
const INVALID_RE = /형식 버전을 지원하지 않습니다/;
const GENERIC_RE = /Novel-Agent 프로젝트 파일이 아닙니다/;

// ── 1. export 가 쓰는 version ────────────────────────────────────────────────
describe('.npproj.zip: export 가 기록하는 format version', () => {
  // 의도치 않은 PROJECT_FILE_VERSION bump 를 게이트가 잡는다. R2 는 write schema 를 바꾸지 않으므로
  // 이 값은 1 이어야 한다(bump 는 serialized format 이 실제로 바뀔 때만).
  it('manifest.version 은 1 이다', async () => {
    const { default: JSZip } = await import('jszip');
    // 참조 0 픽스처 — exportProjectFile 이 getAsset/Blob 엔트리 경로를 타지 않는다.
    const { blob } = await exportProjectFile(validProject(), {});
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('project.json')!.async('string'));
    expect(manifest.version).toBe(1);
    expect(manifest.app).toBe('novel-agent');
  });
});

// ── 2. current / unversioned accept ─────────────────────────────────────────
describe('.npproj.zip: accept 되는 version', () => {
  it('version: 1 은 정상 load 되고 에셋이 복원된다', async () => {
    const restored = await importProjectFile(await makeZip(manifestWith({})));
    expect(restored.project).toEqual(validProject());
    expect(restored.assetCount).toBe(1);
    expect(await u8(RESTORED.get('a-1')!)).toEqual(Array.from(BYTES_OK));
  });

  // ⚠️ 아래 모든 rejection 테스트의 `putAsset 0회` 가 유의미하다는 **전제 자체**를 고정한다 —
  // 같은 fixture 가 정상 version 이면 putAsset 이 실제로 불린다.
  it('fixture 전제 pin — 같은 fixture 가 version: 1 이면 putAsset 이 1회 불린다', async () => {
    await importProjectFile(await makeZip(manifestWith({})));
    expect(putCalls()).toBe(1);
  });

  // ⚠️ 이건 "v1 로 간주"가 아니다. 이 앱은 version-less zip 을 낸 적이 없고, 부재를 특정
  // generation 으로 분류하지도 않는다. 기존 loader 가 version 을 아예 읽지 않아 이 입력을 받아
  // 왔으므로, unversioned / noncanonical input 을 current parser 에 그대로 통과시킬 뿐이다.
  it('version 필드가 없으면 기존 permissive behavior 대로 current parser 가 그대로 받는다', async () => {
    const m: Record<string, unknown> = manifestWith({});
    delete m.version;
    const restored = await importProjectFile(await makeZip(m));
    expect(restored.project).toEqual(validProject());
    expect(putCalls()).toBe(1);
  });
});

// ── 3. future / invalid reject ──────────────────────────────────────────────
describe('.npproj.zip: reject 되는 version (전부 에셋 복원 전)', () => {
  it('future version(2) 은 명시적으로 거부되고 putAsset 은 0회다', async () => {
    const zip = await makeZip(manifestWith({ version: 2 }));
    await expect(importProjectFile(zip)).rejects.toThrow(FUTURE_RE);
    expect(putCalls()).toBe(0);
  });

  // ⚠️ coercion 금지 — '1' 을 1 로 읽지 않는다.
  it.each([
    ['문자열', '1'],
    ['null', null],
    ['boolean', true],
    ['객체', {}],
    ['배열', []],
  ])('non-number version(%s) 은 거부되고 putAsset 은 0회다', async (_label, version) => {
    const zip = await makeZip(manifestWith({ version }));
    await expect(importProjectFile(zip)).rejects.toThrow(INVALID_RE);
    expect(putCalls()).toBe(0);
  });

  // 지원하는 하위 numeric version 은 **존재하지 않는다**(도입 이래 늘 1). 0·음수·소수·비-safe
  // integer 는 전부 invalid 다 — future 가 아니다.
  it.each([
    ['0', 0],
    ['음수', -1],
    ['소수', 1.5],
    ['비-safe integer', 2 ** 53],
  ])('invalid numeric version(%s) 은 거부되고 putAsset 은 0회다', async (_label, version) => {
    const zip = await makeZip(manifestWith({ version }));
    await expect(importProjectFile(zip)).rejects.toThrow(INVALID_RE);
    expect(putCalls()).toBe(0);
  });

  // 두 실패가 같은 메시지면 아래 ordering 테스트가 아무것도 구별하지 못한다.
  it('future 와 invalid 는 서로 다른 메시지를 낸다', async () => {
    await expect(importProjectFile(await makeZip(manifestWith({ version: 2 })))).rejects.toThrow(
      FUTURE_RE,
    );
    await expect(importProjectFile(await makeZip(manifestWith({ version: 2 })))).rejects.not.toThrow(
      INVALID_RE,
    );
    await expect(importProjectFile(await makeZip(manifestWith({ version: '1' })))).rejects.toThrow(
      INVALID_RE,
    );
    await expect(
      importProjectFile(await makeZip(manifestWith({ version: '1' }))),
    ).rejects.not.toThrow(FUTURE_RE);
  });
});

// ── 4. canonical validation ordering ────────────────────────────────────────
// archive identity → version compatibility → current-schema minimum guard → 에셋 복원
describe('.npproj.zip: canonical validation ordering', () => {
  // 구조 가드 자체. 같은 payload 인데 version 만 다른 아래 테스트와 **짝**이어야 순서가 증명된다.
  it('version: 1 + 깨진 project.scenes → 기존 generic error · putAsset 0회', async () => {
    const zip = await makeZip(manifestWith({ version: 1, project: {} }));
    await expect(importProjectFile(zip)).rejects.toThrow(GENERIC_RE);
    expect(putCalls()).toBe(0);
  });

  // version 검증이 구조 가드보다 앞이라는 증거 — 미래 schema 는 project.scenes 자체가 다를 수
  // 있으므로, 순서가 뒤집히면 정상 future archive 가 "Novel-Agent 프로젝트 파일이 아닙니다"라는
  // **틀린 진단**을 받는다.
  it('version: 2 + 깨진 project.scenes → future error 가 우선(generic 아님) · putAsset 0회', async () => {
    await expect(
      importProjectFile(await makeZip(manifestWith({ version: 2, project: {} }))),
    ).rejects.toThrow(FUTURE_RE);
    await expect(
      importProjectFile(await makeZip(manifestWith({ version: 2, project: {} }))),
    ).rejects.not.toThrow(GENERIC_RE);
    expect(putCalls()).toBe(0);
  });

  // archive identity 가 version 검증보다 앞이라는 증거 — 남의 포맷 숫자를 우리 version 축으로
  // 해석해 "더 최신 Novel-Agent" 라고 말하면 안 된다.
  it('foreign app + version: 2 → generic error(future 아님) · putAsset 0회', async () => {
    await expect(
      importProjectFile(await makeZip(manifestWith({ app: 'other-app', version: 2 }))),
    ).rejects.toThrow(GENERIC_RE);
    await expect(
      importProjectFile(await makeZip(manifestWith({ app: 'other-app', version: 2 }))),
    ).rejects.not.toThrow(FUTURE_RE);
    expect(putCalls()).toBe(0);
  });
});

// ── 5. Generation A 에셋 파일명 폴백 ────────────────────────────────────────
// 2026-06-09 ~ 2026-07-13 export 는 `audio/wav` 만 .wav, **그 외 전부 .png** 였다(그 세대도
// version 은 1 이라 version 으로는 구분되지 않는다). 규칙 교체(8a90eeb) 이후의 loader 는 이름을
// extFor(mime) 으로 계산하므로, 폴백이 없으면 그 세대의 mp3/jpg/webp/gif 가 조용히 유실된다.
describe('.npproj.zip: Generation A 에셋 파일명 호환', () => {
  it('레거시 이름(.png)으로 저장된 mp3·jpeg 에셋이 복원된다', async () => {
    const legacyBgm = bytes(40);
    const legacyCg = bytes(70);
    const zip = await makeZip(
      manifestWith({
        assets: {
          'a-bgm': meta('a-bgm', 'bgm', 'audio/mpeg'),
          'a-cg': meta('a-cg', 'cg', 'image/jpeg'),
        },
      }),
      { 'assets/a-bgm.png': legacyBgm, 'assets/a-cg.png': legacyCg },
    );

    const restored = await importProjectFile(zip);

    expect(restored.assetCount).toBe(2);
    expect(await u8(RESTORED.get('a-bgm')!)).toEqual(Array.from(legacyBgm));
    expect(await u8(RESTORED.get('a-cg')!)).toEqual(Array.from(legacyCg));
    // 복원 blob 의 mime 은 여전히 manifest 의 값이다(파일명이 아니라 meta.mime 이 정본).
    expect(RESTORED.get('a-bgm')!.type).toBe('audio/mpeg');
    expect(RESTORED.get('a-cg')!.type).toBe('image/jpeg');
  });

  // ⚠️ **lookup precedence 를 증명하는 유일한 테스트다.** current-only 아카이브에는 legacy 엔트리가
  // 아예 없어서, 기존 왕복 테스트만으로는 조회 순서를 뒤집어도 아무것도 깨지지 않는다.
  it('현재 이름과 레거시 이름이 둘 다 있으면 현재 이름의 바이트가 이긴다', async () => {
    const current = bytes(100);
    const legacy = bytes(200);
    const zip = await makeZip(
      manifestWith({ assets: { 'a-bgm': meta('a-bgm', 'bgm', 'audio/mpeg') } }),
      { 'assets/a-bgm.mp3': current, 'assets/a-bgm.png': legacy },
    );

    const restored = await importProjectFile(zip);

    expect(restored.assetCount).toBe(1);
    expect(await u8(RESTORED.get('a-bgm')!)).toEqual(Array.from(current));
    expect(await u8(RESTORED.get('a-bgm')!)).not.toEqual(Array.from(legacy));
  });
});

// ── 6. 기존 실패 behavior 보존 ──────────────────────────────────────────────
describe('.npproj.zip: 기존 실패 behavior 는 그대로다', () => {
  it('project.json 이 없으면 기존 메시지', async () => {
    const zip = await makeZip(undefined);
    await expect(importProjectFile(zip)).rejects.toThrow(/project\.json 없음/);
    expect(putCalls()).toBe(0);
  });

  it('app 이 다르면 기존 메시지', async () => {
    const zip = await makeZip(manifestWith({ app: 'somebody-else' }));
    await expect(importProjectFile(zip)).rejects.toThrow(GENERIC_RE);
    expect(putCalls()).toBe(0);
  });

  it('project 가 falsy 면 기존 메시지', async () => {
    const zip = await makeZip(manifestWith({ project: null }));
    await expect(importProjectFile(zip)).rejects.toThrow(GENERIC_RE);
    expect(putCalls()).toBe(0);
  });
});
