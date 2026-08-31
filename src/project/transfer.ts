// 프로젝트 내보내기/가져오기 — 기기 간 작업 이동용 단일 파일(.npproj.zip).
// 메타데이터(project + assets 맵)는 project.json 에, 바이너리(PNG/WAV)는 assets/ 에 담는다.
// base64 JSON 대비 바이너리를 그대로 저장 + DEFLATE 압축이라 용량 효율이 좋다.

import type { Project, AssetMeta } from '../types';
import { getAsset, putAsset } from '../storage/assetStore';
import { collectReferencedAssetIds, collectReferencedAssetKinds } from '../assetRefs';
import { extFromMime } from '../assetMime';
import { sanitizeAscii } from './safeName';

const PROJECT_FILE_VERSION = 1;
const PROJECT_FILE_EXT = 'npproj.zip';

interface ProjectManifest {
  // 파일에서 온 값 — 검증 전에는 number 라고 가정하지 않는다(as ProjectManifest 캐스트가
  // number 를 거짓으로 보증하고 있었다). 판정은 assertSupportedVersion 하나뿐이다.
  version?: unknown;
  exportedAt: number;
  app: 'novel-agent';
  project: Project;
  assets: Record<string, AssetMeta>;
}

// 예전엔 audio/wav 를 제외한 전부(오디오 mp3·jpg 이미지 포함)를 .png 로 저장했다. **같은 세대끼리의**
// export→import 는 무사했지만(읽기·쓰기가 같은 규칙으로 이름을 계산), zip 을 밖에서 열면 오라벨이었고
// 이 규칙 교체(8a90eeb) 이후의 loader 가 그 이전 zip 을 읽으면 mp3/jpg/webp/gif blob 이 유실된다
// (import 쪽 legacyExtFor 폴백이 그 세대를 복원한다).
// 오디오는 buildZip.ts 가 쓰는 extFromMime(src/assetMime.ts) 과 동일 규칙(mp3/wav)으로 통일하고,
// 이미지는 jpg/webp/gif 를 추가 인식한다(그 외엔 기존처럼 png 로 폴백).
/** 내보내기/가져오기 양쪽이 쓰는 확장자 규칙(export 는 단위 테스트용 — tests/game-icon.test.ts). */
export function extFor(mime: string): string {
  if (mime.startsWith('audio/')) return extFromMime(mime);
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  // 게임 아이콘(.ico). 이 기능 전에는 ico 를 올릴 방법 자체가 없어서 기존 .npproj.zip 에 ico 에셋이
  // 없다 — 그래서 읽기/쓰기 양쪽에 쓰이는 이 함수를 바꿔도 옛 파일 가져오기가 깨지지 않는다.
  if (mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon') return 'ico';
  return 'png';
}

/**
 * 2026-07-14(8a90eeb) 이전 export 의 확장자 규칙. **그 세대도 version 은 1** 이라 version 으로는
 * 구분되지 않고 **엔트리 이름으로만** 구분된다 — 그래서 version 키 migration 이 아니라 이름 폴백이다.
 * ⚠️ import 전용. export(extFor)를 절대 이 규칙으로 되돌리지 말 것(컨테이너 레이아웃 계약이 깨진다).
 */
function legacyExtFor(mime: string): string {
  return mime === 'audio/wav' ? 'wav' : 'png';
}

/**
 * .npproj.zip 의 format version 게이트.
 *
 * 이 함수의 의미(정확히):
 *   - version 은 **migration generation selector 가 아니다**.
 *   - current version discriminator 검증 + future rejection 에 쓴다.
 *   - 실제 historical 컨테이너 차이(에셋 확장자, 8a90eeb)는 version 으로 구분되지 않는다
 *     → legacyExtFor 폴백이 담당한다. ⚠️ version 키 migration 테이블을 만들지 말 것.
 *
 * 부재는 accept 한다 — 이 앱이 version-less zip 을 낸 적은 없지만, 기존 loader 가 version 을 아예
 * 읽지 않아 이 입력을 받아 왔다. R2 는 그 permissive acceptance 를 이유 없이 좁히지 않는다.
 * ⚠️ "v1 로 간주"가 아니다 — 어떤 generation 으로도 분류하지 않는다.
 * 반대로 값이 **있는데** 우리가 아는 값이 아니면 넘겨짚지 않고 거부한다(coercion 금지).
 * ⚠️ 지원하는 하위 numeric version 은 **존재하지 않는다**(도입 이래 늘 1이었다).
 */
function assertSupportedVersion(v: unknown): void {
  if (v === undefined) return; // unversioned / noncanonical — 기존 behavior 를 보존해 통과시킨다
  if (v === PROJECT_FILE_VERSION) return; // current
  if (typeof v === 'number' && Number.isSafeInteger(v) && v > PROJECT_FILE_VERSION) {
    // ⚠️ "v1 까지 지원" 처럼 <= CUR 전체를 지원한다는 뉘앙스를 쓰지 말 것 — 현재 지원 형식만 표기한다.
    throw new Error(
      `더 최신 버전의 Novel-Agent 에서 만든 프로젝트 파일입니다 ` +
        `(파일 형식 v${v}, 이 앱의 지원 형식 v${PROJECT_FILE_VERSION}). ` +
        `Novel-Agent 를 업데이트한 뒤 다시 시도하세요.`,
    );
  }
  // non-number · non-integer · <= 0
  throw new Error('프로젝트 파일의 형식 버전을 지원하지 않습니다. 파일이 손상되었을 수 있습니다.');
}

function safeName(title: string): string {
  return sanitizeAscii(title, 40, 'novel-project');
}

interface ExportResult {
  blob: Blob;
  filename: string;
  assetCount: number;
}

/** 현재 프로젝트 + 모든 에셋 바이너리를 하나의 .npproj.zip 으로 묶는다. */
export async function exportProjectFile(
  project: Project,
  assets: Record<string, AssetMeta>,
): Promise<ExportResult> {
  const { default: JSZip } = await import('jszip'); // 지연 로딩(초기 번들 경량화)
  const zip = new JSZip();

  // assets(메타 맵)에는 없지만 프로젝트가 실제로 참조하는 id 가 있을 수 있다 — ensureAsset
  // (src/collab/assetsSync.ts)이 협업으로 받은 blob 을 메타 없이 IndexedDB 에만 캐싱해두기
  // 때문(정상 케이스). 메타 맵만 돌면 이런 id 는 zip 에서 통째로 빠지는데 project.json 은 여전히
  // 그 id 를 참조하므로, 다른 기기에서 가져오면 그 이미지가 조용히 사라진다 — 실제 데이터 손실
  // (.npproj.zip 이 기기 간 이동의 유일한 경로라 되돌릴 방법이 없다). 그래서 "메타 맵의 키" ∪
  // "프로젝트가 참조하는 id" 전체를 훑고, 메타가 없는 id 는 kind 를 유추해 최소 AssetMeta 를
  // 즉석에서 만들어 manifest 에도 채워 넣는다(안 채우면 import 쪽이 무엇으로 복원할지 알 수 없다).
  const referencedIds = collectReferencedAssetIds(project, { includeVoice: true });
  const allIds = new Set([...Object.keys(assets), ...referencedIds]);
  const kindsById = collectReferencedAssetKinds(project);

  const manifestAssets: Record<string, AssetMeta> = { ...assets };
  let assetCount = 0;
  for (const id of allIds) {
    const blob = await getAsset(id);
    if (!blob) continue; // 메타만 있고 바이너리 유실(또는 참조는 있는데 IDB 에 없음) → 건너뜀
    let meta = manifestAssets[id];
    if (!meta) {
      meta = {
        id,
        kind: kindsById.get(id) ?? 'cg',
        prompt: '(협업 동기화)',
        mime: blob.type || 'image/png',
        source: 'upload',
        filename: '',
        createdAt: Date.now(),
      };
      manifestAssets[id] = meta;
    }
    zip.file(`assets/${id}.${extFor(meta.mime)}`, blob);
    assetCount++;
  }

  const manifest: ProjectManifest = {
    version: PROJECT_FILE_VERSION,
    exportedAt: Date.now(),
    app: 'novel-agent',
    project,
    assets: manifestAssets,
  };
  zip.file('project.json', JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return {
    blob,
    filename: `${safeName(project.title)}.${PROJECT_FILE_EXT}`,
    assetCount,
  };
}

interface ImportResult {
  project: Project;
  assets: Record<string, AssetMeta>;
  assetCount: number;
}

/** .npproj.zip 을 읽어 에셋 바이너리를 IndexedDB 에 복원하고 메타를 반환한다. */
export async function importProjectFile(file: File | Blob): Promise<ImportResult> {
  const { default: JSZip } = await import('jszip'); // 지연 로딩(초기 번들 경량화)
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestFile = zip.file('project.json');
  if (!manifestFile) {
    throw new Error('올바른 프로젝트 파일이 아닙니다 (project.json 없음).');
  }
  const manifest = JSON.parse(await manifestFile.async('string')) as ProjectManifest;

  // ⚠️ 순서 자체가 계약이다 — 아래 셋은 전부 에셋 복원 루프보다 **앞**이어야 한다:
  //   ① archive identity → ② version compatibility → ③ current-schema minimum guard → ④ 에셋 복원
  // ②를 ③ 뒤로 옮기면 정상 future archive 가 "Novel-Agent 프로젝트 파일이 아닙니다"라는 틀린 진단을
  // 받는다(미래 schema 는 project.scenes 자체가 다를 수 있다). ①을 ② 뒤로 옮기면 foreign app 의
  // 숫자를 우리 version 축으로 해석하게 된다. 세 조건을 다시 한 줄로 합치지 말 것.

  // ① archive identity
  if (manifest.app !== 'novel-agent') {
    throw new Error('Novel-Agent 프로젝트 파일이 아닙니다.');
  }

  // ② version compatibility — future 판정이 payload 의 현재 shape 와 무관하게 결정된다.
  assertSupportedVersion(manifest.version);

  // ③ current-schema minimum guard — 여기까지 왔으면 current 이거나 unversioned 다.
  // set({ … project.scenes[0] … }) 이 터지지 않을 **최소 조건 하나**이고, 이 앞에서 걸러야 손상
  // 파일이 이전 프로젝트 에셋을 지운 뒤에 실패하지 않는다. ⚠️ full Project schema validator 가 아니다.
  if (!manifest.project || !Array.isArray(manifest.project.scenes)) {
    throw new Error('Novel-Agent 프로젝트 파일이 아닙니다.');
  }

  let assetCount = 0;
  for (const [id, meta] of Object.entries(manifest.assets ?? {})) {
    // 현재 이름 우선, 없을 때만 레거시 이름(Generation A). 현재 세대 zip 은 id 당 파일이 정확히
    // 하나(extFor 이름)라 첫 조회가 항상 적중하고 폴백은 도달조차 하지 않는다.
    const f =
      zip.file(`assets/${id}.${extFor(meta.mime)}`) ?? zip.file(`assets/${id}.${legacyExtFor(meta.mime)}`);
    if (!f) continue;
    const buf = await f.async('arraybuffer');
    // mime 을 명시해 복원(미리듣기/표시 호환성).
    await putAsset(id, new Blob([buf], { type: meta.mime }));
    assetCount++;
  }

  return { project: manifest.project, assets: manifest.assets ?? {}, assetCount };
}
